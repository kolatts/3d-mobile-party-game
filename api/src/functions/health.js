'use strict';

const { app } = require('@azure/functions');
const { json, handler } = require('../lib/http');

app.http('health', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'health',
  handler: handler(async () => json(200, { ok: true })),
});
