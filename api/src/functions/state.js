'use strict';

const { app } = require('@azure/functions');
const { json, error, handler } = require('../lib/http');
const { pad2 } = require('../lib/gameLogic');
const { getRoom, listTurns } = require('../lib/storage');

// GET /api/rooms/{code}/state?playerId=<guid>
app.http('roomState', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'rooms/{code}/state',
  handler: handler(async (request) => {
    const roomCode = (request.params.code || '').toUpperCase();
    const playerId = request.query.get('playerId') || null;

    const room = await getRoom(roomCode);
    if (!room) return error(404, 'room not found');

    const players = JSON.parse(room.playersJson);
    const inLobby = room.phase === 'lobby';

    const submittedIds = new Set();
    if (!inLobby) {
      const stepSuffix = `-${pad2(room.step)}`;
      const turns = await listTurns(roomCode);
      for (const turn of turns) {
        if (turn.rowKey.endsWith(stepSuffix)) submittedIds.add(turn.playerId);
      }
    }

    return json(200, {
      phase: room.phase,
      step: inLobby ? 0 : room.step,
      totalSteps: inLobby ? 0 : players.length,
      players: players.map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        done: !inLobby && submittedIds.has(p.id),
      })),
      hostId: room.hostId,
      youSubmitted: playerId ? submittedIds.has(playerId) : false,
    });
  }),
});
