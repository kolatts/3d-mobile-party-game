// api.js — fetch wrappers for the FROZEN API contract in DESIGN.md.
// Every wrapper throws an Error with a human-readable message on failure;
// app.js catches and surfaces these as toasts.

import { API_BASE } from './config.js';

async function request(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    throw new Error('Network error — is the server up?');
  }
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON body */ }
  if (!res.ok) {
    const msg = (data && data.error) ? data.error : `Request failed (${res.status})`;
    const e = new Error(msg);
    e.status = res.status;
    throw e;
  }
  return data;
}

export function createRoom(name) {
  return request('/rooms', { method: 'POST', body: { name } });
}

export function joinRoom(code, name) {
  return request(`/rooms/${encodeURIComponent(code)}/join`, { method: 'POST', body: { name } });
}

export function startGame(code, playerId) {
  return request(`/rooms/${encodeURIComponent(code)}/start`, { method: 'POST', body: { playerId } });
}

export function getState(code, playerId) {
  return request(`/rooms/${encodeURIComponent(code)}/state?playerId=${encodeURIComponent(playerId)}`);
}

export function getTask(code, playerId) {
  return request(`/rooms/${encodeURIComponent(code)}/task?playerId=${encodeURIComponent(playerId)}`);
}

export function getUploadUrl(code, playerId) {
  return request(`/rooms/${encodeURIComponent(code)}/upload-url`, { method: 'POST', body: { playerId } });
}

export function submitTurn(code, payload) {
  // payload: { playerId, text } or { playerId, blobUrl }
  return request(`/rooms/${encodeURIComponent(code)}/submit`, { method: 'POST', body: payload });
}

export function getReveal(code) {
  return request(`/rooms/${encodeURIComponent(code)}/reveal`);
}

export function health() {
  return request('/health');
}

// Direct-to-blob upload using the SAS URL returned by upload-url.
export async function uploadSculpture(sasUrl, sculpture) {
  let res;
  try {
    res = await fetch(sasUrl, {
      method: 'PUT',
      headers: {
        'x-ms-blob-type': 'BlockBlob',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(sculpture),
    });
  } catch {
    throw new Error('Sculpture upload failed — network error');
  }
  if (!res.ok) throw new Error(`Sculpture upload failed (${res.status})`);
}

// Fetch a public sculpture JSON blob.
export async function fetchSculpture(blobUrl) {
  let res;
  try {
    res = await fetch(blobUrl);
  } catch {
    throw new Error('Could not load sculpture — network error');
  }
  if (!res.ok) throw new Error(`Could not load sculpture (${res.status})`);
  return res.json();
}
