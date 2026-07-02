# TeleSculpt API

Azure Functions v4 backend (Node.js programming model v4, plain JavaScript, no build step).
Implements the frozen contract in [`../DESIGN.md`](../DESIGN.md).

## Prerequisites

- Node 20+ (Node 22/24 fine)
- Azure Functions Core Tools 4.x (`func`)
- Azurite (installed as a dev dependency)

## Run locally

```sh
cd api
npm install
cp local.settings.json.sample local.settings.json   # if not already present

# 1. start the local storage emulator (separate terminal)
npm run azurite          # = azurite --silent --location .azurite

# 2. create tables/container + blob CORS (one time per emulator data dir)
npm run setup-local

# 3. start the functions host
func start               # http://localhost:7071/api/health -> { "ok": true }
```

## Test

```sh
npm test                 # node:test unit tests for src/lib/gameLogic.js
```

## Configuration

- `STORAGE_CONNECTION` — storage connection string (falls back to `AzureWebJobsStorage`).
  `UseDevelopmentStorage=true` targets Azurite at 127.0.0.1.

## Layout

- `src/functions/*.js` — one file per endpoint group (`app.http` registrations)
- `src/lib/gameLogic.js` — pure game rules (rotation, task types, codes, colors)
- `src/lib/storage.js` — lazy singleton clients, ETag-retry room updates, SAS generation
- `scripts/setup-local.js` — local Azurite bootstrap
- `test/` — unit tests (`node --test`)
