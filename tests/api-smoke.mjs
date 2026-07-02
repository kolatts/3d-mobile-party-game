// TeleSculpt API smoke test — drives a full 3-player game via the HTTP contract.
// Usage: node tests/api-smoke.mjs [apiBase]   (default http://localhost:7071/api)
// Exits 0 on success, 1 on any contract violation.

const API = (process.argv[2] || 'http://localhost:7071/api').replace(/\/$/, '');

let failures = 0;
function check(cond, label) {
  if (cond) console.log(`  ok  ${label}`);
  else { failures++; console.error(`FAIL  ${label}`); }
}

async function call(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, json };
}

function sculpture(seed) {
  const voxels = [];
  for (let i = 0; i < 10 + seed; i++) voxels.push([(i + seed) % 16, i % 5, (i * 3 + seed) % 16, i % 8]);
  return {
    v: 1, size: 16,
    palette: ['#e63946', '#f4a261', '#e9c46a', '#2a9d8f', '#264653', '#a8dadc', '#ffffff', '#6d597a'],
    voxels,
  };
}

async function submitSculpt(code, playerId, seed) {
  const up = await call('POST', `/rooms/${code}/upload-url`, { playerId });
  check(up.status === 200 && up.json.sasUrl && up.json.blobUrl, `upload-url for ${playerId.slice(0, 8)}`);
  const put = await fetch(up.json.sasUrl, {
    method: 'PUT',
    headers: { 'x-ms-blob-type': 'BlockBlob', 'Content-Type': 'application/json' },
    body: JSON.stringify(sculpture(seed)),
  });
  check(put.status === 201, `blob PUT via SAS (${put.status})`);
  const sub = await call('POST', `/rooms/${code}/submit`, { playerId, blobUrl: up.json.blobUrl });
  check(sub.status === 200 && sub.json.ok === true, `submit sculpture`);
}

async function main() {
  console.log(`Smoke-testing ${API}`);

  const health = await call('GET', '/health');
  check(health.status === 200 && health.json.ok === true, 'health');

  // --- lobby ---
  const created = await call('POST', '/rooms', { name: 'Host' });
  check(created.status === 201 && /^[A-Z]{4}$/.test(created.json.roomCode ?? ''), 'create room returns 4-letter code');
  const code = created.json.roomCode;
  const host = created.json.playerId;

  const p2 = (await call('POST', `/rooms/${code}/join`, { name: 'PlayerTwo' })).json.playerId;
  const p3 = (await call('POST', `/rooms/${code}/join`, { name: 'PlayerThree' })).json.playerId;
  check(!!p2 && !!p3, 'two players joined');

  const bogus = await call('POST', `/rooms/ZZZZ/join`, { name: 'Nobody' });
  check(bogus.status === 404, 'join unknown room → 404');

  const notHost = await call('POST', `/rooms/${code}/start`, { playerId: p2 });
  check(notHost.status === 403, 'non-host start → 403');

  const started = await call('POST', `/rooms/${code}/start`, { playerId: host });
  check(started.status === 200, 'host start');

  const players = [host, p2, p3];
  const N = 3;

  // --- play all steps ---
  for (let step = 0; step < N; step++) {
    const st = await call('GET', `/rooms/${code}/state?playerId=${host}`);
    check(st.json.phase === 'playing' && st.json.step === step, `state at step ${step} (got phase=${st.json.phase} step=${st.json.step})`);
    check(st.json.totalSteps === N, `totalSteps === ${N}`);

    const expected = step === 0 ? 'write' : step % 2 === 1 ? 'sculpt' : 'guess';
    const chainsSeen = new Set();
    for (let i = 0; i < N; i++) {
      const task = (await call('GET', `/rooms/${code}/task?playerId=${players[i]}`)).json;
      check(task.type === expected, `player${i} task type ${task.type} === ${expected} @ step ${step}`);
      if (step > 0) {
        chainsSeen.add(task.chainIndex);
        if (expected === 'sculpt') check(typeof task.prompt === 'string' && task.prompt.length > 0, `player${i} sculpt has prompt`);
        if (expected === 'guess') check(typeof task.sculptureUrl === 'string' && task.sculptureUrl.includes('.json'), `player${i} guess has sculptureUrl`);
      }
      if (expected === 'sculpt') await submitSculpt(code, players[i], step * N + i);
      else {
        const text = expected === 'write' ? `weird thing ${i}` : `guess ${step}-${i}`;
        const sub = await call('POST', `/rooms/${code}/submit`, { playerId: players[i], text });
        check(sub.status === 200 && sub.json.ok, `player${i} submit ${expected}`);
      }
    }
    if (step > 0) check(chainsSeen.size === N, `all ${N} chains distinct at step ${step}`);
  }

  // idempotent resubmit after phase change should not blow up the last step; check reveal
  const final = await call('GET', `/rooms/${code}/state?playerId=${host}`);
  check(final.json.phase === 'reveal', `phase is reveal after ${N} steps (got ${final.json.phase})`);

  const reveal = await call('GET', `/rooms/${code}/reveal`);
  check(reveal.status === 200 && Array.isArray(reveal.json.chains) && reveal.json.chains.length === N, `reveal has ${N} chains`);
  for (const [ci, chain] of (reveal.json.chains ?? []).entries()) {
    check(chain.steps.length === N, `chain ${ci} has ${N} steps`);
    check(chain.steps[0].type === 'text' && chain.steps[1].type === 'sculpture', `chain ${ci} step types alternate`);
    check(chain.steps.every(s => s.playerName), `chain ${ci} steps attributed`);
  }
  // fetch one sculpture blob and validate format
  const blobStep = reveal.json.chains?.[0]?.steps?.find(s => s.type === 'sculpture');
  if (blobStep) {
    const blob = await fetch(blobStep.blobUrl);
    const sj = await blob.json().catch(() => null);
    check(blob.status === 200 && sj?.v === 1 && Array.isArray(sj.voxels), 'sculpture blob publicly readable + valid format');
  }

  console.log(failures === 0 ? '\nSMOKE PASS' : `\nSMOKE FAIL (${failures} failures)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error('SMOKE CRASH', e); process.exit(1); });
