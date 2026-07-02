'use strict';

const { app } = require('@azure/functions');
const { json, error, handler } = require('../lib/http');
const {
  chainForPlayer,
  taskTypeForStep,
  turnRowKey,
} = require('../lib/gameLogic');
const { getRoom, getTurn } = require('../lib/storage');

// GET /api/rooms/{code}/task?playerId=<guid>
app.http('roomTask', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'rooms/{code}/task',
  handler: handler(async (request) => {
    const roomCode = (request.params.code || '').toUpperCase();
    const playerId = request.query.get('playerId');
    if (!playerId) return error(400, 'playerId is required');

    const room = await getRoom(roomCode);
    if (!room) return error(404, 'room not found');
    if (room.phase !== 'playing') return error(409, 'game is not in playing phase');

    const players = JSON.parse(room.playersJson);
    const playerIndex = players.findIndex((p) => p.id === playerId);
    if (playerIndex === -1) return error(404, 'player not in room');

    const step = room.step;
    const type = taskTypeForStep(step);
    if (type === 'write') {
      return json(200, { type: 'write' });
    }

    const chainIndex = chainForPlayer(playerIndex, step, players.length);
    const prevTurn = await getTurn(roomCode, turnRowKey(chainIndex, step - 1));
    if (!prevTurn) {
      return error(500, 'previous step submission is missing');
    }

    if (type === 'sculpt') {
      return json(200, { type: 'sculpt', chainIndex, prompt: prevTurn.text });
    }
    return json(200, { type: 'guess', chainIndex, sculptureUrl: prevTurn.blobUrl });
  }),
});
