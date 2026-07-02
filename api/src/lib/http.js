'use strict';

// Tiny HTTP helpers shared by the function handlers.

function json(status, body) {
  return {
    status,
    jsonBody: body,
  };
}

function error(status, message) {
  return json(status, { error: message });
}

/** Parse the JSON request body; returns {} for empty/invalid bodies. */
async function readBody(request) {
  try {
    const body = await request.json();
    return body && typeof body === 'object' ? body : {};
  } catch {
    return {};
  }
}

/**
 * Wrap a handler with uniform error handling so unexpected failures become
 * a 500 { error } response per the contract.
 */
function handler(fn) {
  return async (request, context) => {
    try {
      return await fn(request, context);
    } catch (err) {
      context.error(`Unhandled error: ${err.stack || err}`);
      return error(500, 'internal server error');
    }
  };
}

module.exports = { json, error, readBody, handler };
