'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  PALETTE,
  generateRoomCode,
  chainForPlayer,
  playerForChain,
  taskTypeForStep,
  submissionTypeForStep,
  colorForPlayer,
  turnRowKey,
  sculptureBlobPath,
} = require('../src/lib/gameLogic');

// ---- room codes -----------------------------------------------------------

test('room codes are 4 uppercase letters with no I or O', () => {
  for (let i = 0; i < 500; i++) {
    const code = generateRoomCode();
    assert.match(code, /^[A-Z]{4}$/, `code ${code} must be 4 uppercase letters`);
    assert.doesNotMatch(code, /[IO]/, `code ${code} must not contain I or O`);
  }
});

test('room code generation uses the injected rng', () => {
  assert.equal(generateRoomCode(() => 0), 'AAAA');
  assert.equal(generateRoomCode(() => 0.9999), 'ZZZZ');
});

// ---- chain rotation --------------------------------------------------------

for (let n = 2; n <= 8; n++) {
  test(`rotation N=${n}: every chain visits every player exactly once`, () => {
    for (let chain = 0; chain < n; chain++) {
      const visitors = new Set();
      for (let step = 0; step < n; step++) {
        visitors.add(playerForChain(chain, step, n));
      }
      assert.equal(visitors.size, n, `chain ${chain} must visit all ${n} players`);
    }
  });

  test(`rotation N=${n}: at each step all players get distinct chains`, () => {
    for (let step = 0; step < n; step++) {
      const chains = new Set();
      for (let player = 0; player < n; player++) {
        const chain = chainForPlayer(player, step, n);
        assert.ok(chain >= 0 && chain < n, 'chain index in range');
        chains.add(chain);
      }
      assert.equal(chains.size, n, `step ${step} must assign ${n} distinct chains`);
    }
  });

  test(`rotation N=${n}: chainForPlayer inverts playerForChain`, () => {
    for (let chain = 0; chain < n; chain++) {
      for (let step = 0; step < n; step++) {
        const player = playerForChain(chain, step, n);
        assert.equal(
          chainForPlayer(player, step, n),
          chain,
          `player ${player} at step ${step} must handle chain ${chain}`
        );
      }
    }
  });

  test(`rotation N=${n}: matches DESIGN.md formula (i + k) mod N`, () => {
    for (let chain = 0; chain < n; chain++) {
      for (let step = 0; step < n; step++) {
        assert.equal(playerForChain(chain, step, n), (chain + step) % n);
      }
    }
  });

  test(`rotation N=${n}: every player starts their own chain at step 0`, () => {
    for (let player = 0; player < n; player++) {
      assert.equal(chainForPlayer(player, 0, n), player);
    }
  });
}

// ---- task types --------------------------------------------------------------

test('step 0 is write, odd steps sculpt, even steps > 0 guess', () => {
  assert.equal(taskTypeForStep(0), 'write');
  assert.equal(taskTypeForStep(1), 'sculpt');
  assert.equal(taskTypeForStep(2), 'guess');
  assert.equal(taskTypeForStep(3), 'sculpt');
  assert.equal(taskTypeForStep(4), 'guess');
  assert.equal(taskTypeForStep(5), 'sculpt');
  assert.equal(taskTypeForStep(6), 'guess');
  assert.equal(taskTypeForStep(7), 'sculpt');
});

test('submission type is text for write/guess and sculpture for sculpt', () => {
  assert.equal(submissionTypeForStep(0), 'text');
  assert.equal(submissionTypeForStep(1), 'sculpture');
  assert.equal(submissionTypeForStep(2), 'text');
  assert.equal(submissionTypeForStep(3), 'sculpture');
});

// ---- colors -------------------------------------------------------------------

test('player colors come from the DESIGN.md palette in order', () => {
  assert.equal(PALETTE.length, 8);
  for (let i = 0; i < 8; i++) {
    assert.equal(colorForPlayer(i), PALETTE[i]);
  }
  assert.equal(colorForPlayer(8), PALETTE[0], 'wraps around past 8');
});

// ---- keys / paths -----------------------------------------------------------------

test('turn row keys are zero-padded 2 digits', () => {
  assert.equal(turnRowKey(0, 0), '00-00');
  assert.equal(turnRowKey(3, 2), '03-02');
  assert.equal(turnRowKey(10, 7), '10-07');
});

test('sculpture blob path is {roomCode}/{chain}-{step}.json', () => {
  assert.equal(sculptureBlobPath('KJXQ', 2, 1), 'KJXQ/02-01.json');
  assert.equal(sculptureBlobPath('ABCD', 0, 0), 'ABCD/00-00.json');
});
