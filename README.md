# TeleSculpt — 3D Voxel Telephone

**Play it: https://kolatts.github.io/3d-mobile-party-game/**

Telephone, but the drawings are 3D sculptures. One player writes a phrase, the next
sculpts it in voxel clay on their phone, the next guesses what the sculpture is, and
the chain keeps mutating. The reveal is a rotating 3D gallery of how "a cat playing
bagpipes" became "airport made of cheese."

Built for [Challenge #3](mobile-game-challenge-brief.md) with a twist: same serverless
stack, but the frontend is a full Three.js 3D experience.

| Layer | Tech |
|---|---|
| Frontend | Vanilla JS + Three.js (`/docs`, GitHub Pages), touch-first |
| Backend | Azure Functions v4, Node (`/api`) |
| State | Azure Table Storage (`rooms`, `turns`) |
| Sculptures | Azure Blob Storage — client PUTs JSON via SAS, public read for the reveal |
| Identity | GUID in sessionStorage, no login |
| CI/CD | GitHub Actions: Pages deploy, Azure spin-up / spin-down (`.github/workflows`) |
| Testing | Playwright CLI named sessions + `tests/api-smoke.mjs` |

## How it works

3–8 players. Everyone writes a prompt (step 0), then chains rotate: sculpt on odd
steps, guess on even steps — `chain (i + k) mod N` so every chain visits every player
exactly once. A step advances when all players submit. Full rules and the frozen API
contract are in [DESIGN.md](DESIGN.md).

## Run it locally

```bash
cd api && npm install
npm run azurite        # terminal 1
npm run setup-local    # once
func start             # terminal 2 → http://localhost:7071
npx http-server ../docs -p 8080 -c-1   # terminal 3 → http://localhost:8080
```

Smoke test the whole contract: `node tests/api-smoke.mjs`

## Deploy / tear down

See [infra/README.md](infra/README.md). Spin-up and spin-down are one-click
GitHub Actions; spin-down requires typing `DELETE`. Runs on the Azure free tier
(~$0/month).
