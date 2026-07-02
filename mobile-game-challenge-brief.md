# Challenge #3 — Mobile Party Game

> Pick a game. Build it on a phone. Ship it.

You've done the lobby. You've done polling. You've shipped a reveal screen. Now we're adding three new things: files in the cloud, pipelines that clean up after themselves, and tests that simulate a full room of players without bothering any real humans.

💰 **Estimated monthly cost:** ~$0–3  
⏱ **Estimated time:** One weekend — 10–14 hours with the agents on  
📊 **Difficulty:** Mid — you've done challenge 2, or you're fearless

---

## What You're Learning

Every game below teaches the same three skills. Pick the one that sounds fun.

**Blob Storage**  
Table Storage holds text. It cannot hold a photo your friend took of their dog or a drawing that took three minutes to make. Blob Storage can. You'll upload files from a mobile browser, store them in Azure, and hand out URLs that actually work.

**GitHub Actions — spin up / spin down**  
Your Azure resources cost money when they exist. They cost nothing when they don't. You'll build two workflows: one that provisions everything from scratch on demand, and one that tears it all down with a typed confirmation. Infrastructure as a button, not a ritual.

**Playwright CLI — multiplayer simulation**  
Testing a multiplayer game by yourself is a pain. Playwright CLI lets you open named browser sessions (`--session=host`, `--session=p2`, `--session=p3`) and drive them simultaneously from the command line. Claude Code's `/goal` command runs test-fix loops until the game actually works end to end.

---

## Stack Constraints

| Layer | Technology |
|---|---|
| Frontend | Vanilla HTML + JS, GitHub Pages (`/docs`), touch-optimized |
| Backend | Azure Functions v4 HTTP triggered — Node 22, C# .NET 10, or Python 3.13 |
| State storage | Azure Table Storage |
| File storage | Azure Blob Storage |
| Identity | GUID in URL — no login, no auth |
| Pipelines | GitHub Actions spin-up / spin-down |
| Testing | Playwright CLI named sessions |

API contracts below are language-agnostic — same endpoints, same JSON shapes, any runtime.

---

## Pick Your Game

---

### 🎨 Doodle Telephone

Someone writes a phrase. The next person draws it on a canvas. The next person guesses the drawing. The next person draws that guess. By the end, "a cat playing bagpipes" is "submarine." The reveal is the whole point.

**Blob angle:** Canvas drawings saved as PNG per round. Public blob URL threaded through Table Storage.

**Mobile angle:** Touch canvas via pointer events. Full-screen drawing view on small screens. Submit locked until a stroke is detected.

**API contract:**
```
POST /api/submit-drawing  →  { blobUrl }
POST /api/submit-text     →  { ok }
GET  /api/get-task        →  { type, prompt, blobUrl? }
GET  /api/game-state      →  { round, phase, playerCount }
```

---

### 📸 Caption War

One player uploads a photo as the round prompt — from their camera roll or straight from the camera. Everyone else writes a caption. Anonymous vote. Highest vote wins the round.

**Blob angle:** Photo uploaded via a SAS token — the Function returns a pre-signed URL and the client PUTs directly to Blob. No binary goes through your Function. This is the production pattern. Learn it here.

**Mobile angle:** `capture="environment"` opens the rear camera on mobile. Photo preview before confirm. Large tap-friendly textarea for captions.

**API contract:**
```
POST /api/get-upload-url  →  { sasUrl, blobUrl }
POST /api/set-prompt      →  { ok }
POST /api/submit-caption  →  { ok }
POST /api/submit-vote     →  { ok }
GET  /api/game-state      →  { phase, photoUrl, captions?, votes? }
```

---

### 🏃 Emoji Rebus

A random emoji appears. Players race to photograph something matching it from real life. First valid upload wins the round. This game only makes sense on a phone. That is a feature.

**Blob angle:** SAS token pattern (same as Caption War) but race-aware — Function closes the round on the first successful upload. Teaches pre-signed URLs plus optimistic concurrency.

**Mobile angle:** `capture="environment"` mandatory. Countdown timer front and center. Upload progress bar while the race is live.

**API contract:**
```
GET  /api/current-prompt  →  { emoji, label }
POST /api/get-upload-url  →  { sasUrl, blobUrl }
POST /api/claim-win       →  { won, blobUrl }
GET  /api/game-state      →  { phase, winnerId?, photoUrl? }
```

---

### 📄 Fake Resume Review

Players collaboratively invent a ridiculous fictional resume one section at a time — skills, work history, references, all nonsense. At the end, the finished resume is serialized to JSON, stored as a blob, and shared as a link that survives after the session closes.

**Blob angle:** Finished resume as a JSON blob with a public URL. Teaches Blob as a document store, not just images. Bonus concept: blob retention policy so links expire after 7 days.

**Mobile angle:** One section per screen — no scrolling wall of fields. Swipe to pass the turn. Final reveal is a styled card view of the full resume.

**API contract:**
```
GET  /api/my-section      →  { field, prompt }
POST /api/submit-section  →  { ok }
POST /api/finalize        →  { resumeUrl }
GET  /api/game-state      →  { phase, sections? }
```

---

## How to Start

Don't install anything yet. Open Claude Code and paste this:

```
I'm building a mobile-friendly multiplayer browser game as a coding
challenge. The stack is:
- Frontend: vanilla HTML + JS in /docs, served by GitHub Pages,
  touch-optimized for mobile browsers
- Backend: Azure Functions v4 HTTP triggered
  (I'll tell you my language choice — ask me)
- Storage: Azure Table Storage for game state,
  Azure Blob Storage for file uploads
- Identity: GUID in the URL, no login
- Pipelines: GitHub Actions workflows to spin up and spin down
  all Azure resources on demand
- Testing: Playwright CLI with named sessions to simulate
  multiple players locally

The game I'm building is: [YOUR CHOICE HERE]

Help me set up my repo and Azure environment first.
Ask me what language I want to use before writing any code.
Explain every az CLI command before I run it.
```

Claude will ask your language preference, walk you through Azure setup, and build milestone by milestone. Let it.

---

## Done When

Three real humans can do all of this from their phones:

- [ ] One person creates a room, shares the link, two others join
- [ ] The game plays through at least one full round
- [ ] Files are stored in Blob and visible in the reveal
- [ ] The reveal screen updates without anyone refreshing manually
- [ ] Spin-down workflow deletes all Azure resources cleanly

---

## Stretch Goals

*After done. Not instead of done.*

- Discord webhook posts the best reveal moment at game end
- Spin-up workflow seeds Table Storage with example prompts
- Playwright `/goal` loop runs until 3 simulated players finish a full game without errors
- Blob retention policy auto-expires files after N days
- PWA manifest so players can add it to their home screen

---

## Estimated Monthly Cost

| Service | Cost |
|---|---|
| Azure Functions (Consumption) | $0 — first 1M executions/month free, forever |
| Azure Table Storage | $0 — first 1GB free for 12 months |
| Azure Blob Storage | ~$0–1 — first 5GB free for 12 months |
| GitHub Pages | $0 |
| **Total** | **~$0–3/month** after free tier |

If this costs you more than $3/month you have a hit game. Congratulations, you have a different problem now.

---

⚠️ **Confidentiality reminder:** No internal documents, work data, client information, or anything marked Internal Use Only. Personal projects only.

*The boring era is over.*
