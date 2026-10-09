# Echo

**A digital home for the memories we don't want to lose.**

Echo is a private memory vault. You preserve moments (a story, the date, the place, the people, photographs, a voice note), and they become a personal archive you can browse by year, search, ask questions of, and even seal away for your future self.

The interface is a Rajasthan-inspired, contemporary design: cusped *jharokha* arches as photo windows, *jaali* lattice, block-printed panels, sandstone, ivory and blue-pottery indigo. The welcome screen is a real-time 3D haveli room where desert light falls through a jaali screen.

---

## Contents

1. [Features](#features)
2. [Architecture](#architecture)
3. [Run it locally](#run-it-locally)
4. [Environment variables](#environment-variables)
5. [Tests](#tests)
6. [Deploy (Atlas + Render + Vercel)](#deploy)
7. [Push to GitHub](#push-to-github)
8. [Optional AI features: setup, costs, privacy](#optional-ai-features)
9. [Media storage](#media-storage)
10. [Authentication design and trade-offs](#authentication-design)
11. [Privacy and security](#privacy-and-security)
12. [Existing data and legacy memories](#existing-data-and-legacy-memories)
13. [Known limitations](#known-limitations)
14. [Smoke-test checklist after deploying](#smoke-test-checklist)
15. [Credits](#credits)

---

## Features

| Feature | What it does |
| --- | --- |
| Accounts | Register, log in, log out, log out on every device, session restore, expiry handling, delete account (with password) |
| Preserve a memory | Title, story, date, optional time, place, people, tags, up to 12 photos (upload progress, reorder, captions, 15 presentation styles), voice note (record or upload), transcript; unsaved-changes guard |
| Archive (timeline) | Grouped by year and month, arch-window cards and photo collages, search, filters (person, place, tag, year), "show more" pagination |
| Memory page | Arched 3D-depth hero, story, gallery with lightbox, voice note, AI notes (if enabled), connected memories, edit, delete with confirmation |
| Ask Echo | Natural-language questions answered **only** from your own memories, with numbered sources you can open. Works without AI (keyword retrieval); with AI it writes a grounded answer with citations |
| AI notes | Optional summary, mood, themes and suggested tags — clearly labelled, editable, removable, never written into your story |
| Connections | Links between memories with a stated reason: shared people, same place, shared tags, same date in another year, similar words / similar story |
| On this day | Memories from today's date (your local date) in earlier years |
| Memory capsules | Seal a letter and chosen memories until a future date. Sealed memories disappear from the archive, search and Ask Echo; the **server** refuses to open them early |
| Privacy tools | JSON export of everything you wrote; account deletion removes all memories, media and capsules |

## Architecture

```text
Browser ── https://your-app.vercel.app
   │   React 19 + Vite + React Router; Three.js loaded lazily on the welcome page
   │   All requests go to /api on the SAME domain (session cookie stays first-party)
   ▼
Vercel ── serves the static build; rewrites /api/* to the backend (vercel.json)
   ▼
Render ── Node.js + Express 5 API (backend/)
   │   routes → middleware (auth, validation, rate limits) → controllers → services
   ├── MongoDB Atlas (Mongoose): users, memories, media metadata, capsules
   ├── Media: GridFS in the same database (default) or Cloudinary (private assets)
   └── Optional: any OpenAI-compatible AI API (chat, embeddings, transcription)
```

```text
Echo/
├── backend/
│   ├── server.js              start-up: validate config → connect DB → listen
│   ├── app.js                 Express app (helmet, CORS, logging, routes, errors)
│   ├── config/env.js          every environment variable, validated once
│   ├── models/                User, Memory, Media, Capsule (Mongoose)
│   ├── middleware/            auth (cookie sessions), security, validate, errorHandler
│   ├── controllers/           auth, memory, media, echo (Ask/On this day), capsule
│   ├── routes/index.js        the whole API surface in one file
│   ├── services/              storage, file checks, AI client, retrieval, connections …
│   ├── utils/                 validators (zod), logger, AppError
│   ├── scripts/               legacy data tools (assign owner, migrate base64 photos)
│   └── tests/                 node:test + supertest (71 tests)
├── frontend/
│   ├── src/
│   │   ├── main.jsx, App.jsx  fonts, styles, router, auth + toast providers
│   │   ├── lib/               api client, auth context, formatting, media helpers
│   │   ├── hooks/             data loading, pointer parallax, unsaved-changes guard
│   │   ├── components/        AppShell, MemoryCard, MemoryForm, PhotoEditor, VoiceNote, …
│   │   ├── pages/             Welcome, Archive, MemoryNew/Edit/View, Ask, OnThisDay, Capsules, Settings
│   │   ├── three/             haveliScene.js (the 3D welcome room)
│   │   └── styles/            tokens.css (design tokens), base.css
│   ├── e2e/                   browser journey test + fixture generator
│   └── vercel.json            API proxy, SPA fallback, security headers
├── render.yaml                Render blueprint for the API
└── README.md
```

### API

All responses are JSON: `{ "success": true, ... }` or `{ "success": false, "message": "...", "errors"?: [...] }`.

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/api/auth/register` · `/api/auth/login` | sets the httpOnly session cookie; rate limited |
| POST | `/api/auth/logout` · `/api/auth/logout-all` | |
| GET | `/api/auth/me` · `/api/auth/session` | `session` returns `user: null` instead of 401 |
| GET | `/api/auth/export` | JSON copy of your archive |
| DELETE | `/api/auth/account` | body `{ password }` |
| GET / POST | `/api/memories` | list (`page, limit, q, person, tag, location, year, month`) / create |
| GET | `/api/memories/facets` | your people, tags, places, years |
| GET / PUT / DELETE | `/api/memories/:id` | owner only |
| GET | `/api/memories/:id/connections` | connected memories with reasons |
| POST / DELETE | `/api/memories/:id/enrich` · `/enrichment` | AI notes (if configured) / remove them |
| GET | `/api/memories/:id/legacy-photos/:index` | serves base64 photos saved by the first version |
| GET | `/api/search` | keyword search (same parameters as the list) |
| POST | `/api/echo/ask` | `{ question }` → answer + sources + citations |
| POST | `/api/echo/reindex` | builds semantic vectors (if embeddings configured) |
| GET | `/api/on-this-day?date=YYYY-MM-DD` | |
| POST | `/api/media/upload` | multipart: `file`, `kind=image|audio` |
| GET | `/api/media/:id/file[?variant=thumb]` | owner-checked file delivery |
| DELETE | `/api/media/:id` | unsaved uploads only |
| POST | `/api/media/:id/transcribe` | if transcription configured |
| POST / GET | `/api/capsules` | create / list |
| GET / DELETE | `/api/capsules/:id` | contents only after opening |
| POST | `/api/capsules/:id/unlock` | `423` before the unlock time |
| GET | `/api/health` · `/api/features` | health check · which optional features are on |

A request for someone else's memory, media or capsule returns **404** (not 403), so ids can't be used to discover what exists.

---

## Run it locally

**You need:** Node.js 20.11 or newer (22 recommended), and MongoDB — either [MongoDB Community Server](https://www.mongodb.com/try/download/community) running locally, or a free Atlas cluster.

```bash
# 1. Backend
cd backend
npm install
cp .env.example .env          # then edit .env: set JWT_SECRET (see the comment in the file)
npm run dev                   # API on http://localhost:5000  (check http://localhost:5000/api/health)

# 2. Frontend (second terminal)
cd frontend
npm install
cp .env.example .env          # leave VITE_API_URL empty
npm run dev                   # open http://localhost:5173
```

Vite proxies `/api` to `localhost:5000`, so the session cookie works without any CORS setup. Create an account on the welcome screen. There is no demo account.

> Your previous `.env` used `MONGO_URI=mongodb://127.0.0.1:27017/echo`. Keep that value and your existing users and memories will still be there. Nothing at start-up deletes or rewrites data.

---

## Environment variables

### Backend (`backend/.env` locally, Render dashboard in production)

| Variable | Required | Where it comes from |
| --- | --- | --- |
| `MONGO_URI` | yes | Local: `mongodb://127.0.0.1:27017/echo`. Production: Atlas → *Connect* → *Drivers* (a `mongodb+srv://` string; add the database name `/echo`). |
| `JWT_SECRET` | yes | Any long random string: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`. Render can generate it (render.yaml does). ≥32 chars in production. |
| `CLIENT_ORIGIN` | production | Your frontend URL, e.g. `https://echo-yourname.vercel.app` (comma-separate several). |
| `NODE_ENV` | production | `production` on Render (set by render.yaml). |
| `TRUST_PROXY` | no | Proxies in front of the API (Render: `1`). Used for rate limiting. |
| `PORT` | no | Render sets it automatically. |
| `COOKIE_SAMESITE` / `COOKIE_SECURE` | no | Defaults are right for the recommended setup (see [Authentication design](#authentication-design)). |
| `MEDIA_STORAGE` | no | `gridfs` (default) or `cloudinary`. |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | if cloudinary | Cloudinary console → *Settings → API Keys*. |
| `AI_*` | no | See [Optional AI features](#optional-ai-features). |

The server checks these at start-up and refuses to run with a clear message if something is missing or unsafe. For example, it won't start in production against a `localhost` database.

### Frontend (`frontend/.env`, Vercel → *Settings → Environment Variables*)

| Variable | Default | Meaning |
| --- | --- | --- |
| `VITE_API_URL` | empty | Leave empty: the app calls `/api` on its own domain (Vite proxy locally, Vercel rewrite in production). Set it only to call the API on another domain directly. |

Never put secrets in `VITE_*` variables. They are compiled into the public JavaScript.

---

## Tests

### Backend: 71 automated tests

```bash
cd backend
npm test        # needs a MongoDB server; set TEST_MONGO_URI if it isn't mongodb://127.0.0.1:27017
```

Each test file creates and then drops its own `echo_test_*` database, so it never touches your `echo` data. The tests cover:

- **Auth:** validation, hashing, httpOnly cookie, wrong passwords, expired/forged tokens, logout, log out everywhere, old 6-character passwords still working, account deletion.
- **Two-user isolation:** User B can't read, edit, delete, search, ask about, connect to, attach or stream User A's memories, media or capsules. A client-sent `userId` is rejected. Legacy ownerless memories are never shown or auto-claimed.
- **Memories:** multi-photo create, EXIF/GPS stripping, reorder and remove (with storage cleanup), validation, pagination, filters, keyword search, facets, On This Day, connections, legacy base64 photos.
- **Uploads:** fake and truncated images rejected, type checks based on the file's actual bytes.
- **Capsules:** hidden while sealed, `423` on early open, opening after the time, deletion rules.
- **AI integration** (against a local fake OpenAI-compatible server): only the user's own memories are sent, invented citations are dropped, no model call when nothing matches, provider failure falls back to keyword results, enrichment never touches the story, transcription.
- **Keyword mode** when no AI is configured, rate limiting, and production config validation.

### Browser journey (end-to-end smoke test)

With the backend and frontend running:

```bash
cd frontend
node e2e/make-fixtures.cjs                 # generates test images/audio (uses the backend's sharp)
npx playwright-core install chromium       # once: downloads a matching Chromium
BASE_URL=http://localhost:5173 npm run e2e
```

The journey runs 52 checks:

- registration, wrong password, session restore
- creating a memory (3 photos, a rejected fake image, a style change, a caption, reordering, a voice file, a transcript)
- the unsaved-changes guard and the wax-seal moment
- the detail page and lightbox, editing and removing a photo
- archive grouping, search and filters, Ask Echo sources, On This Day
- a sealed capsule that can't be opened early
- settings, deleting a memory, logging out
- mobile and tablet overflow, reduced motion, and the no-WebGL fallback

It also fails on any unexpected console error or failed request. Screenshots are written to `./screenshots`.

---

## Deploy

Recommended setup, all with free tiers available: **MongoDB Atlas** (database), **Render** (API), **Vercel** (frontend). Do the steps in this order.

### 1. MongoDB Atlas

1. Create a free account at <https://www.mongodb.com/cloud/atlas> and create a **free (M0) cluster**.
2. *Database Access* → add a database user with a strong password.
3. *Network Access* → add `0.0.0.0/0` (Render's outgoing IPs aren't fixed on the free plan). The username and password still protect the database.
4. *Connect → Drivers* → copy the `mongodb+srv://…` string. Put your password in it and add `/echo` before the `?`:
   `mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/echo?retryWrites=true&w=majority`

> Moving your local memories to Atlas (optional): `mongodump --uri "mongodb://127.0.0.1:27017/echo"`, then `mongorestore --uri "<atlas uri>" dump/`. Both commands come with [MongoDB Database Tools](https://www.mongodb.com/try/download/database-tools).

### 2. (Optional) Cloudinary

The default storage is GridFS, inside your Atlas database. The free M0 tier is 512 MB **in total**, which is roughly a few hundred photos. For a larger archive, create a free account at <https://cloudinary.com> and copy the cloud name, API key and API secret from *Settings → API Keys*.

### 3. Render (API)

1. Push this repository to GitHub ([next section](#push-to-github)).
2. Render → **New → Blueprint** → choose your repository. Render reads `render.yaml`.
3. When asked, fill in:
   - `MONGO_URI` = your Atlas string
   - `CLIENT_ORIGIN` = `https://placeholder.example` for now (you'll update it in step 5)
   - leave the Cloudinary values empty, unless you set `MEDIA_STORAGE=cloudinary`
4. Wait for the deploy, then open `https://<your-service>.onrender.com/api/health`. It should show `"status":"ok"`.

(Without the blueprint: *New → Web Service*, root directory `backend`, build `npm ci --omit=dev`, start `npm start`, health check `/api/health`, and the same environment variables.)

### 4. Vercel (frontend)

1. In `frontend/vercel.json`, replace `REPLACE-WITH-YOUR-RENDER-SERVICE.onrender.com` with your Render host. Commit and push.
2. Vercel → **Add New → Project** → import the repository. Set **Root Directory = `frontend`** (the framework is detected as Vite). Leave `VITE_API_URL` unset.
3. Deploy. Note your URL, e.g. `https://echo-yourname.vercel.app`.

### 5. Connect them

1. Render → your service → *Environment* → set `CLIENT_ORIGIN` to the exact Vercel URL (no trailing slash). Save; Render redeploys.
2. Open the Vercel URL, create your account, and run the [smoke test](#smoke-test-checklist).

> **Free-plan note:** Render's free web services sleep after a period of inactivity. The first request afterwards can take up to about a minute while the service wakes. A paid instance avoids this.

---

## Push to GitHub

The project is already a Git repository with history. To publish it:

```bash
cd Echo
git status                                   # .env files must NOT appear (they're in .gitignore)
git remote add origin https://github.com/<your-username>/echo.git   # create the empty repo on GitHub first
git branch -M main
git push -u origin main
```

Later changes:

```bash
git add -A
git commit -m "Describe your change"
git push
```

Before every push, check that `git status` doesn't list any `.env` file.

---

## Optional AI features

Echo works fully without AI. Ask Echo then uses keyword retrieval (BM25 ranking plus date, person and place understanding) and says plainly that AI answers are off. Each AI capability is switched on separately in `backend/.env` (or on Render) by setting a `BASE_URL` and a `MODEL`, plus an `API_KEY` where needed. Any **OpenAI-compatible** API works:

| Capability | Variables | Used for |
| --- | --- | --- |
| Chat | `AI_CHAT_BASE_URL`, `AI_CHAT_API_KEY`, `AI_CHAT_MODEL` | Ask Echo answers with citations; "Suggest notes" on a memory |
| Embeddings | `AI_EMBEDDING_…` | semantic search in Ask Echo; "similar story" connections |
| Transcription | `AI_TRANSCRIBE_…` | the Transcribe button for voice notes |

Example base URLs (check each provider's current model names and prices; model names change often):

| Provider | Base URL | Notes |
| --- | --- | --- |
| OpenAI | `https://api.openai.com/v1` | paid per use; chat, embeddings (e.g. `text-embedding-3-small`), transcription (e.g. `whisper-1`) |
| Groq | `https://api.groq.com/openai/v1` | has a free tier with rate limits; chat and transcription (`whisper-large-v3-turbo`) |
| Google Gemini | `https://generativelanguage.googleapis.com/v1beta/openai` | free tier available; chat and embeddings — see the privacy note below |
| Ollama (local) | `http://localhost:11434/v1` | free, runs on your own computer; no API key needed |

**Costs:** nothing is enabled by default, so nothing is billed. Paid providers charge per token or per audio minute; rate limits (`RATE_LIMIT_AI`, default 60 requests per user per hour) cap usage.

**Privacy (please read):** when a feature is on, the relevant memory text is sent to that provider:

- Ask Echo sends the up-to-6 memories most relevant to the question.
- "Suggest notes" sends that one memory.
- "Transcribe" sends that one recording.

Photos are never sent, and AI never identifies people in photos. Read your provider's data-use terms before enabling these features. In particular, Google states that content sent on the Gemini API *free tier* may be used to improve its products and may be read by human reviewers. Don't use a free tier with this policy for private memories.

When embeddings are first enabled, open *Settings → Rebuild search index* to index existing memories. New and edited memories are indexed automatically. Vectors are compared on the server for each user's own memories, which is fine up to several thousand memories per person.

---

## Media storage

- Photos are checked by their real bytes. They are then decoded, rotated upright and **stripped of all metadata, including GPS location**. Echo saves a version at most 2400px wide plus a 720px thumbnail. Large camera photos are also reduced in the browser before upload.
- Voice notes accept WebM, Ogg, MP3, M4A, WAV and FLAC (15 MB max by default).
- Files are served only through `/api/media/:id/file`, which checks that you own the file. With Cloudinary, files are stored as **authenticated** (private) assets, and Echo redirects to a signed URL only after the ownership check. Anyone holding a signed URL can view that file, but the URLs can't be guessed.
- Presentation styles are CSS only; the stored image never changes.
- Uploads that never make it into a saved memory are deleted automatically after 24 hours. Deleting a memory or an account deletes its files.

---

## Authentication design

- Passwords are hashed with bcrypt (cost 12). Login gives the same answer for a wrong email and a wrong password.
- The session is a signed JWT (7 days by default) in an **httpOnly, SameSite=Lax, Secure (in production) cookie**. JavaScript can't read it, so a script injected into the page can't steal the session. The previous version stored the token in `localStorage`; that has been removed.
- Each token carries a version number. *Log out on every device* and account deletion bump that number, which ends every existing session immediately.
- **Why the `/api` proxy:** Vercel serves the frontend and forwards `/api` to Render, so the browser only ever talks to one domain. The cookie stays first-party, and Safari's tracking prevention doesn't block it.
  - The trade-off is one extra network hop through Vercel.
  - The alternative is calling Render directly with `VITE_API_URL`. That needs `COOKIE_SAMESITE=none`, and Safari may block the cookie.
- CSRF protection: the SameSite cookie, plus a server check that rejects state-changing requests from any origin not listed in `CLIENT_ORIGIN`.

---

## Privacy and security

- Ownership is always taken from the verified session, never from the request body. Every query filters by the logged-in user.
- Inputs are validated with zod schemas (lengths, dates, ids, unknown fields rejected).
- `helmet` security headers are set on the API. On Vercel there's a strict Content-Security-Policy and HSTS (`vercel.json`). API responses are `no-store`, so they're never cached by a CDN.
- Rate limits:
  - login and registration: per IP and email, plus a per-IP ceiling
  - AI endpoints: per user
  - uploads: per user
- Request size limits are 1 MB for JSON and 15 MB per upload. CORS is restricted to `CLIENT_ORIGIN`.
- **Logging policy:** structured one-line JSON with event names, request ids, paths, status codes, timings and user ids only. Request bodies, passwords, cookies, stories, letters, transcripts and AI prompts are never logged (there's a redaction safety net too).
- **Not end-to-end encrypted.** Whoever operates the server and database can technically access stored data. Atlas encrypts data at rest on its side.
- Users can export their data and delete their account and all content from *Settings*.

---

## Existing data and legacy memories

- **Schema changes are additive.** Existing users and memories keep working without a migration. The old `photos[].url`, `audio`, `aiSummary`, `aiTags` and `aiMood` fields are kept. The original photo-style ids (`original` … `old-memory`) are kept too; the old CSS never applied `old-memory`, and that's fixed now.
- **Old base64 photos** still display. The API decodes them on the server instead of sending megabytes of text to the browser. To move them into proper media storage (optional; back up first):
  ```bash
  cd backend
  node scripts/migrate-legacy-photos.js            # dry run
  node scripts/migrate-legacy-photos.js --confirm
  ```
- **Memories with no owner.** The first version created memories before accounts existed, and later code gave them to whoever logged in first. **That behaviour has been removed.** Ownerless memories are now hidden from everyone until you deliberately assign them:
  ```bash
  cd backend
  node scripts/assign-legacy-memories.js --email you@example.com            # dry run, lists them
  node scripts/assign-legacy-memories.js --email you@example.com --confirm  # assigns them
  ```
  If your earlier testing already gave some memories to the wrong account, they stay with that account. Move them with a MongoDB tool such as Compass (change `userId`) if needed.

---

## Known limitations

- **Hosting and storage:**
  - Render's free tier sleeps when idle, so the first request can be slow.
  - Atlas M0 has 512 MB in total, so use Cloudinary for big photo archives.
- **Uploads through the Vercel proxy:** Vercel doesn't publish a size limit for proxied requests. Photos are reduced to well under 2 MB in the browser. Very long recordings might fail; the limit set in Echo is 15 MB.
- **Capsules:** you can't open a sealed capsule early. You *can* discard it, which deletes its contents unread. That's intentional, so sealing never traps data you want gone.
- **Recording:** HEIC photos must be exported as JPEG first. Recording needs microphone permission and a browser with MediaRecorder; otherwise you can choose an audio file.
- **Not built yet:**
  - semantic search uses in-app vector comparison, not Atlas Vector Search (fine for thousands of memories per user)
  - no email verification and no password reset
  - no offline mode
- **Licensing and history:** no licence has been chosen (`UNLICENSED`). The earlier Git history wasn't included in the uploaded ZIP; this repository starts from that upload.

---

## Smoke-test checklist

Run through this after each deploy, on the live URL, ideally on both a laptop and a phone:

1. `https://<render>/api/health` shows `"status":"ok"` and `"database":"connected"`.
2. The welcome page loads quickly; the login form is usable before the 3D scene appears.
3. Create an account, and you land on the empty archive.
4. Reload the page: you're still logged in.
5. Preserve a memory with 2–3 photos, a caption, a style, people, tags and a voice file. You see the wax seal, then the memory page.
6. Photos and the voice note play. The lightbox opens, and the arrow keys work.
7. Edit the memory: remove a photo and change the title. Save, reload, and confirm the change persisted.
8. The archive shows it under the right year and month. Search and filters find it.
9. Ask Echo finds it, and the numbered source opens the memory.
10. Seal a capsule with a letter, opening tomorrow. It shows "Still sealed", and the sealed memory is gone from the archive.
11. In a second browser (or a private window), register another account. It sees none of the first account's memories. Pasting a memory URL from account 1 shows "This memory isn't in your archive."
12. Settings → Download a copy produces JSON.
13. Delete a memory (with confirmation). Log out.
14. On a phone: there's no sideways scrolling, and the bottom tab bar works.
15. In the browser's developer tools: no red console errors, and no failed requests in the Network tab.

---

## Credits

- **Typefaces**, self-hosted via Fontsource under the SIL Open Font License:
  - Cormorant Garamond (Christian Thalmann)
  - DM Sans (Colophon / Google)
  - Kalam (Indian Type Foundry)
- **Illustrations:** all arches, jaali lattices, block-print butis, the haveli doors, the wax seal and the 3D haveli room were drawn in code for this project. They are original illustrations *inspired by* Rajasthani architecture and crafts, not reproductions of historical artefacts. No third-party images are used.
- Built with React, Vite, React Router, Three.js, Express, Mongoose, sharp, zod, helmet and express-rate-limit.
