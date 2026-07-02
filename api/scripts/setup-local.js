'use strict';

// One-time local setup against Azurite:
//   - creates tables `rooms` and `turns`
//   - creates blob container `sculptures` with public blob read access
//   - sets Blob service CORS (allow *, GET/PUT/OPTIONS, all headers, 3600s)
//
// Usage: npm run setup-local   (Azurite must be running)

// Local script: default to Azurite when no connection string is configured.
process.env.STORAGE_CONNECTION =
  process.env.STORAGE_CONNECTION ||
  process.env.AzureWebJobsStorage ||
  'UseDevelopmentStorage=true';

const { TableServiceClient } = require('@azure/data-tables');
const {
  getConnectionString,
  getBlobServiceClient,
  getContainerClient,
  ROOMS_TABLE,
  TURNS_TABLE,
  SCULPTURES_CONTAINER,
} = require('../src/lib/storage');

async function main() {
  const connectionString = getConnectionString();

  // Tables
  const tableService = TableServiceClient.fromConnectionString(
    connectionString,
    { allowInsecureConnection: true }
  );
  for (const table of [ROOMS_TABLE, TURNS_TABLE]) {
    try {
      await tableService.createTable(table);
      console.log(`table '${table}' created`);
    } catch (err) {
      if (err.statusCode === 409) console.log(`table '${table}' already exists`);
      else throw err;
    }
  }

  // Container with public blob read
  const container = getContainerClient();
  const { succeeded } = await container.createIfNotExists({ access: 'blob' });
  console.log(
    succeeded
      ? `container '${SCULPTURES_CONTAINER}' created (public blob read)`
      : `container '${SCULPTURES_CONTAINER}' already exists`
  );
  // Make sure access level is right even if it already existed.
  await container.setAccessPolicy('blob');

  // Blob service CORS
  const blobService = getBlobServiceClient();
  const props = await blobService.getProperties();
  props.cors = [
    {
      allowedOrigins: '*',
      allowedMethods: 'GET,PUT,OPTIONS',
      allowedHeaders: '*',
      exposedHeaders: '*',
      maxAgeInSeconds: 3600,
    },
  ];
  await blobService.setProperties({ cors: props.cors });
  console.log('blob service CORS configured (origins=*, methods=GET,PUT,OPTIONS, maxAge=3600)');

  console.log('local setup complete');
}

main().catch((err) => {
  console.error('setup-local failed:', err.message || err);
  process.exit(1);
});
