'use strict';

const { app } = require('@azure/functions');
const { json, error, readBody, handler } = require('../lib/http');
const {
  chainForPlayer,
  submissionTypeForStep,
  turnRowKey,
  pad2,
} = require('../lib/gameLogic');
const {
  getRoom,
  createTurn,
  listTurns,
  updateRoomWithRetry,
} = require('../lib/storage');

// POST /api/rooms/{code}/submit
// Body: { playerId, text } or { playerId, blobUrl }
app.http('submitTurn', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'rooms/{code}/submit',
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
    const playerCount = players.length;
    const expectedType = submissionTypeForStep(step);

    // Validate the submission matches the expected task type for this step.
    if (expectedType === 'text' && typeof body.text !== 'string') {
      return error(400, 'this step expects a text submission');
    }
    if (expectedType === 'sculpture' && typeof body.blobUrl !== 'string') {
      return error(400, 'this step expects a sculpture (blobUrl) submission');
    }

    const chainIndex = chainForPlayer(playerIndex, step, playerCount);
    const rowKey = turnRowKey(chainIndex, step);

    const turnFields = {
      playerId,
      type: expectedType,
      submittedAt: new Date().toISOString(),
    };
    if (expectedType === 'text') turnFields.text = body.text;
    else turnFields.blobUrl = body.blobUrl;

    const created = await createTurn(roomCode, rowKey, turnFields);
    if (!created) {
      // Idempotent resubmission for an already-submitted step.
      return json(200, { ok: true, advanced: false });
    }

    // Count submissions for this step; advance the room when everyone is in.
    const stepSuffix = `-${pad2(step)}`;
    const turns = await listTurns(roomCode);
    const stepCount = turns.filter((t) => t.rowKey.endsWith(stepSuffix)).length;

    let advanced = false;
    if (stepCount >= playerCount) {
      // ETag optimistic concurrency with retry: racers compute the same
      // result, and a mutator that sees the room already advanced is a no-op.
      await updateRoomWithRetry(roomCode, (fresh) => {
        if (fresh.phase !== 'playing' || fresh.step !== step) return null;
        if (step === playerCount - 1) return { phase: 'reveal' };
        return { step: step + 1 };
      });
      advanced = true;
    }

    return json(200, { ok: true, advanced });
  }),
});
