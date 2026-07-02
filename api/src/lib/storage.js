'use strict';

// Storage helpers: lazy singleton clients, create-if-not-exists, room CRUD
// with ETag optimistic concurrency retry, and SAS generation for uploads.

const { TableClient } = require('@azure/data-tables');
const {
  BlobServiceClient,
  StorageSharedKeyCredential,
  BlobSASPermissions,
  generateBlobSASQueryParameters,
} = require('@azure/storage-blob');
const { sculptureBlobPath } = require('./gameLogic');

const ROOMS_TABLE = 'rooms';
const TURNS_TABLE = 'turns';
const SCULPTURES_CONTAINER = 'sculptures';

// Azurite well-known development storage account.
const DEV_STORE_CONNECTION_STRING =
  'DefaultEndpointsProtocol=http;' +
  'AccountName=devstoreaccount1;' +
  'AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;' +
  'BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1;' +
  'QueueEndpoint=http://127.0.0.1:10001/devstoreaccount1;' +
  'TableEndpoint=http://127.0.0.1:10002/devstoreaccount1;';

function getConnectionString() {
  const raw =
    process.env.STORAGE_CONNECTION || process.env.AzureWebJobsStorage || '';
  if (!raw) {
    throw new Error(
      'No storage connection string configured (STORAGE_CONNECTION or AzureWebJobsStorage)'
    );
  }
  if (/UseDevelopmentStorage\s*=\s*true/i.test(raw)) {
    return DEV_STORE_CONNECTION_STRING;
  }
  return raw;
}

/** Parse AccountName / AccountKey out of a storage connection string. */
function parseAccountFromConnectionString(connectionString) {
  const parts = {};
  for (const segment of connectionString.split(';')) {
    const idx = segment.indexOf('=');
    if (idx > 0) {
      parts[segment.slice(0, idx).trim()] = segment.slice(idx + 1).trim();
    }
  }
  if (!parts.AccountName || !parts.AccountKey) {
    throw new Error('Connection string is missing AccountName/AccountKey');
  }
  return { accountName: parts.AccountName, accountKey: parts.AccountKey };
}

// ---- lazy singletons ----------------------------------------------------

const state = {
  roomsClient: null,
  turnsClient: null,
  blobServiceClient: null,
  containerClient: null,
  sharedKeyCredential: null,
  ensured: {}, // memoized ensure-exists promises
};

function getTableClient(tableName) {
  const key = tableName === ROOMS_TABLE ? 'roomsClient' : 'turnsClient';
  if (!state[key]) {
    state[key] = TableClient.fromConnectionString(
      getConnectionString(),
      tableName,
      { allowInsecureConnection: true }
    );
  }
  return state[key];
}

function getBlobServiceClient() {
  if (!state.blobServiceClient) {
    state.blobServiceClient = BlobServiceClient.fromConnectionString(
      getConnectionString()
    );
  }
  return state.blobServiceClient;
}

function getContainerClient() {
  if (!state.containerClient) {
    state.containerClient =
      getBlobServiceClient().getContainerClient(SCULPTURES_CONTAINER);
  }
  return state.containerClient;
}

function getSharedKeyCredential() {
  if (!state.sharedKeyCredential) {
    const { accountName, accountKey } = parseAccountFromConnectionString(
      getConnectionString()
    );
    state.sharedKeyCredential = new StorageSharedKeyCredential(
      accountName,
      accountKey
    );
  }
  return state.sharedKeyCredential;
}

// ---- ensure-exists helpers (create on first use, memoized) --------------

function ensureTable(tableName) {
  const key = `table:${tableName}`;
  if (!state.ensured[key]) {
    state.ensured[key] = getTableClient(tableName)
      .createTable()
      .catch((err) => {
        // 409 TableAlreadyExists is fine.
        if (err.statusCode !== 409) {
          state.ensured[key] = null;
          throw err;
        }
      });
  }
  return state.ensured[key];
}

function ensureContainer() {
  const key = `container:${SCULPTURES_CONTAINER}`;
  if (!state.ensured[key]) {
    state.ensured[key] = getContainerClient()
      .createIfNotExists({ access: 'blob' })
      .catch((err) => {
        state.ensured[key] = null;
        throw err;
      });
  }
  return state.ensured[key];
}

async function roomsTable() {
  await ensureTable(ROOMS_TABLE);
  return getTableClient(ROOMS_TABLE);
}

async function turnsTable() {
  await ensureTable(TURNS_TABLE);
  return getTableClient(TURNS_TABLE);
}

// ---- room CRUD -----------------------------------------------------------

const ROOM_PARTITION = 'room';

/** Fetch a room entity by code. Returns null when not found. */
async function getRoom(roomCode) {
  const client = await roomsTable();
  try {
    return await client.getEntity(ROOM_PARTITION, roomCode);
  } catch (err) {
    if (err.statusCode === 404) return null;
    throw err;
  }
}

/**
 * Create a room entity. Throws err.statusCode === 409 if the code collides.
 */
async function createRoom(roomCode, fields) {
  const client = await roomsTable();
  await client.createEntity({
    partitionKey: ROOM_PARTITION,
    rowKey: roomCode,
    ...fields,
  });
}

/**
 * Update a room with ETag optimistic concurrency, retrying up to 3 attempts.
 *
 * `mutate(room)` receives a fresh copy of the entity and returns either an
 * object of fields to merge+write, or null/undefined to abort (no write).
 * Returns { updated: boolean, room } — `room` is the latest entity read.
 */
async function updateRoomWithRetry(roomCode, mutate, attempts = 3) {
  const client = await roomsTable();
  let lastErr = null;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const room = await getRoom(roomCode);
    if (!room) return { updated: false, room: null };
    const changes = mutate(room);
    if (!changes) return { updated: false, room };
    const updatedEntity = {
      partitionKey: room.partitionKey,
      rowKey: room.rowKey,
      phase: room.phase,
      step: room.step,
      hostId: room.hostId,
      playersJson: room.playersJson,
      createdAt: room.createdAt,
      ...changes,
    };
    try {
      await client.updateEntity(updatedEntity, 'Replace', {
        etag: room.etag,
      });
      return { updated: true, room: { ...room, ...changes } };
    } catch (err) {
      if (err.statusCode === 412) {
        lastErr = err; // precondition failed — someone else won; re-read and retry
        continue;
      }
      throw err;
    }
  }
  throw lastErr || new Error('updateRoomWithRetry: exhausted retries');
}

// ---- turns ---------------------------------------------------------------

/** Get one turn entity, or null. */
async function getTurn(roomCode, rowKey) {
  const client = await turnsTable();
  try {
    return await client.getEntity(roomCode, rowKey);
  } catch (err) {
    if (err.statusCode === 404) return null;
    throw err;
  }
}

/**
 * Create a turn entity. Returns true if created, false if it already existed
 * (idempotent resubmission).
 */
async function createTurn(roomCode, rowKey, fields) {
  const client = await turnsTable();
  try {
    await client.createEntity({
      partitionKey: roomCode,
      rowKey,
      ...fields,
    });
    return true;
  } catch (err) {
    if (err.statusCode === 409) return false;
    throw err;
  }
}

/** List every turn entity for a room. */
async function listTurns(roomCode) {
  const client = await turnsTable();
  const results = [];
  const iter = client.listEntities({
    queryOptions: { filter: `PartitionKey eq '${roomCode}'` },
  });
  for await (const entity of iter) {
    results.push(entity);
  }
  return results;
}

// ---- SAS generation --------------------------------------------------------

/**
 * Generate a write-only (create + write) SAS URL for the sculpture blob at
 * {roomCode}/{chainIndex}-{stepIndex}.json, valid 15 minutes.
 * Returns { sasUrl, blobUrl } — blobUrl is the plain readable URL.
 */
async function generateUploadUrl(roomCode, chainIndex, stepIndex) {
  await ensureContainer();
  const blobPath = sculptureBlobPath(roomCode, chainIndex, stepIndex);
  const blobClient = getContainerClient().getBlockBlobClient(blobPath);
  const credential = getSharedKeyCredential();

  const startsOn = new Date(Date.now() - 5 * 60 * 1000); // clock-skew cushion
  const expiresOn = new Date(Date.now() + 15 * 60 * 1000);
  const sas = generateBlobSASQueryParameters(
    {
      containerName: SCULPTURES_CONTAINER,
      blobName: blobPath,
      permissions: BlobSASPermissions.parse('cw'),
      startsOn,
      expiresOn,
    },
    credential
  ).toString();

  return {
    sasUrl: `${blobClient.url}?${sas}`,
    blobUrl: blobClient.url,
  };
}

module.exports = {
  ROOMS_TABLE,
  TURNS_TABLE,
  SCULPTURES_CONTAINER,
  getConnectionString,
  parseAccountFromConnectionString,
  roomsTable,
  turnsTable,
  ensureContainer,
  getContainerClient,
  getBlobServiceClient,
  getRoom,
  createRoom,
  updateRoomWithRetry,
  getTurn,
  createTurn,
  listTurns,
  generateUploadUrl,
};
