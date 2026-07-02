'use strict';

const crypto = require('node:crypto');
const { app } = require('@azure/functions');
const { json, error, readBody, handler } = require('../lib/http');
const {
  generateRoomCode,
  colorForPlayer,
  MIN_PLAYERS,
  MAX_PLAYERS,
} = require('../lib/gameLogic');
const {
  getRoom,
  createRoom,
  updateRoomWithRetry,
} = require('../lib/storage');

function cleanName(raw) {
  if (typeof raw !== 'string') return null;
  const name = raw.trim().slice(0, 32);
  return name.length > 0 ? name : null;
}

// POST /api/rooms — create a room
app.http('createRoom', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'rooms',
  handler: handler(async (request) => {
    const body = await readBody(request);
    const name = cleanName(body.name);
    if (!name) return error(400, 'name is required');

    const playerId = crypto.randomUUID();
    const player = { id: playerId, name, color: colorForPlayer(0) };

    // Retry a few times in the (unlikely) event of a room-code collision.
    for (let attempt = 0; attempt < 5; attempt++) {
      const roomCode = generateRoomCode();
      try {
        await createRoom(roomCode, {
          phase: 'lobby',
          step: 0,
          hostId: playerId,
          playersJson: JSON.stringify([player]),
          createdAt: new Date().toISOString(),
        });
        return json(201, { roomCode, playerId });
      } catch (err) {
        if (err.statusCode === 409) continue; // code collision — try another
        throw err;
      }
    }
    return error(500, 'could not allocate a room code');
  }),
});

// POST /api/rooms/{code}/join
app.http('joinRoom', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'rooms/{code}/join',
  handler: handler(async (request) => {
    const roomCode = (request.params.code || '').toUpperCase();
    const body = await readBody(request);
    const name = cleanName(body.name);
    if (!name) return error(400, 'name is required');

    const playerId = crypto.randomUUID();
    let failure = null;

    const { updated, room } = await updateRoomWithRetry(roomCode, (room) => {
      failure = null;
      if (room.phase !== 'lobby') {
        failure = error(409, 'game already started');
        return null;
      }
      const players = JSON.parse(room.playersJson);
      if (players.length >= MAX_PLAYERS) {
        failure = error(409, 'room is full');
        return null;
      }
      players.push({
        id: playerId,
        name,
        color: colorForPlayer(players.length),
      });
      return { playersJson: JSON.stringify(players) };
    });

    if (!room) return error(404, 'room not found');
    if (!updated) return failure || error(409, 'could not join room');
    return json(200, { playerId, roomCode });
  }),
});

// POST /api/rooms/{code}/start
app.http('startRoom', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'rooms/{code}/start',
  handler: handler(async (request) => {
    const roomCode = (request.params.code || '').toUpperCase();
    const body = await readBody(request);
    const playerId = body.playerId;
    if (!playerId) return error(400, 'playerId is required');

    const room = await getRoom(roomCode);
    if (!room) return error(404, 'room not found');
    if (room.hostId !== playerId) return error(403, 'only the host can start the game');
    if (room.phase !== 'lobby') return error(409, 'game already started');
    const players = JSON.parse(room.playersJson);
    if (players.length < MIN_PLAYERS) return error(409, 'not enough players');

    let failure = null;
    const { updated } = await updateRoomWithRetry(roomCode, (fresh) => {
      failure = null;
      if (fresh.phase !== 'lobby') {
        failure = error(409, 'game already started');
        return null;
      }
      if (JSON.parse(fresh.playersJson).length < MIN_PLAYERS) {
        failure = error(409, 'not enough players');
        return null;
      }
      // Player order is frozen as-is (join order).
      return { phase: 'playing', step: 0 };
    });

    if (!updated) return failure || error(409, 'could not start game');
    return json(200, { ok: true });
  }),
});
