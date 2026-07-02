'use strict';

// Pure game logic for TeleSculpt. No I/O in this module.

// Player color palette (from DESIGN.md sculpture palette).
const PALETTE = [
  '#e63946',
  '#f4a261',
  '#e9c46a',
  '#2a9d8f',
  '#264653',
  '#a8dadc',
  '#ffffff',
  '#6d597a',
];

// Room codes: 4 uppercase letters, avoiding ambiguous I and O.
const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const ROOM_CODE_LENGTH = 4;

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 8;

/**
 * Generate a 4-letter room code (uppercase, no I or O).
 * @param {() => number} [rng] random source in [0,1), injectable for tests
 */
function generateRoomCode(rng = Math.random) {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_ALPHABET[Math.floor(rng() * ROOM_CODE_ALPHABET.length)];
  }
  return code;
}

/**
 * Which chain does the given player handle at the given step?
 * DESIGN.md: chain i at step k is handled by player (i + k) mod N,
 * therefore player p at step k handles chain ((p - k) mod N + N) mod N.
 */
function chainForPlayer(playerIndex, step, playerCount) {
  return (((playerIndex - step) % playerCount) + playerCount) % playerCount;
}

/**
 * Which player handles the given chain at the given step?
 * chain i at step k -> player (i + k) mod N.
 */
function playerForChain(chainIndex, step, playerCount) {
  return (chainIndex + step) % playerCount;
}

/**
 * Task type for a step: 0 = write, odd = sculpt, even (>0) = guess.
 */
function taskTypeForStep(step) {
  if (step === 0) return 'write';
  return step % 2 === 1 ? 'sculpt' : 'guess';
}

/**
 * Expected turn entity `type` for a step's submission:
 * write/guess steps store text, sculpt steps store a sculpture blob URL.
 */
function submissionTypeForStep(step) {
  return taskTypeForStep(step) === 'sculpt' ? 'sculpture' : 'text';
}

/**
 * Player color assignment: palette color by join order.
 */
function colorForPlayer(playerIndex) {
  return PALETTE[playerIndex % PALETTE.length];
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

/**
 * RowKey for a turn entity: `${chainIndex}-${stepIndex}`, zero-padded 2 digits.
 */
function turnRowKey(chainIndex, stepIndex) {
  return `${pad2(chainIndex)}-${pad2(stepIndex)}`;
}

/**
 * Blob path for a sculpture: {roomCode}/{chainIndex}-{stepIndex}.json
 */
function sculptureBlobPath(roomCode, chainIndex, stepIndex) {
  return `${roomCode}/${turnRowKey(chainIndex, stepIndex)}.json`;
}

module.exports = {
  PALETTE,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  MIN_PLAYERS,
  MAX_PLAYERS,
  generateRoomCode,
  chainForPlayer,
  playerForChain,
  taskTypeForStep,
  submissionTypeForStep,
  colorForPlayer,
  pad2,
  turnRowKey,
  sculptureBlobPath,
};
