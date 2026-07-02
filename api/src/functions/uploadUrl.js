'use strict';

const { app } = require('@azure/functions');
const { json, error, readBody, handler } = require('../lib/http');
const { chainForPlayer, taskTypeForStep } = require('../lib/gameLogic');
const { getRoom, generateUploadUrl } = require('../lib/storage');

// POST /api/rooms/{code}/upload-url
app.http('uploadUrl', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'rooms/{code}/upload-url',
  handler: handler(async (request) => {
    const roomCode = (request.params.code || '').toUpperCase();
    const body = await readBody(request);
    const playerId = body.playerId;
    if (!playerId) return error(400, 'playerId is required');

    const room = await getRoom(roomCode);
    if (!room) return error(404, 'room not found');
    if (room.phase !== 'playing') return error(409, 'game is not in playing phase');

    const players = JSON.parse(room.playersJson);
    const playerIndex = players.findIndex((p) => p.id === playerId);
    if (playerIndex === -1) return error(404, 'player not in room');

    const step = room.step;
    if (taskTypeForStep(step) !== 'sculpt') {
      return error(409, 'current step is not a sculpt step');
    }

    const chainIndex = chainForPlayer(playerIndex, step, players.length);
    const { sasUrl, blobUrl } = await generateUploadUrl(roomCode, chainIndex, step);
    return json(200, { sasUrl, blobUrl });
  }),
});
