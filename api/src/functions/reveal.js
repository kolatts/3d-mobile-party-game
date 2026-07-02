'use strict';

const { app } = require('@azure/functions');
const { json, error, handler } = require('../lib/http');
const { playerForChain, turnRowKey } = require('../lib/gameLogic');
const { getRoom, listTurns } = require('../lib/storage');

// GET /api/rooms/{code}/reveal
app.http('roomReveal', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'rooms/{code}/reveal',
  handler: handler(async (request) => {
    const roomCode = (request.params.code || '').toUpperCase();

    const room = await getRoom(roomCode);
    if (!room) return error(404, 'room not found');
    if (room.phase !== 'reveal') return error(409, 'game is not in reveal phase');

    const players = JSON.parse(room.playersJson);
    const playerCount = players.length;

    const turns = await listTurns(roomCode);
    const byRowKey = new Map(turns.map((t) => [t.rowKey, t]));

    const chains = [];
    for (let chainIndex = 0; chainIndex < playerCount; chainIndex++) {
      const steps = [];
      for (let stepIndex = 0; stepIndex < playerCount; stepIndex++) {
        const turn = byRowKey.get(turnRowKey(chainIndex, stepIndex));
        if (!turn) continue; // defensive: skip holes
        const player =
          players[playerForChain(chainIndex, stepIndex, playerCount)];
        const step = {
          type: turn.type,
          playerName: player ? player.name : 'unknown',
          playerColor: player ? player.color : '#ffffff',
        };
        if (turn.type === 'text') step.text = turn.text;
        else step.blobUrl = turn.blobUrl;
        steps.push(step);
      }
      chains.push({ steps });
    }

    return json(200, { chains });
  }),
});
