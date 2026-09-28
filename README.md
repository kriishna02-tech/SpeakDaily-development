# SpeakDaily

An early development slice of the SpeakDaily English practice app. It has a responsive web interface, original lesson/scenario content, local account and progress storage, a **scripted text tutor simulation**, and an optional server-side OpenAI text tutor adapter. It is not ready for public learners or publication.

## Run locally (Windows PowerShell)

1. Install Node.js 24.2 or newer. Check with `node --version`.
2. In this folder run `npm ci` and `npm run check`.
3. Run `npm run dev` and visit `http://127.0.0.1:3000`.
4. Data is created in `data/speakdaily.sqlite` on first start. To reset development data, stop the server and delete the `data` folder.

No secrets or external services are needed for the scripted preview. `.env.example` lists configuration names; this zero-dependency server does **not** automatically read `.env`. Set environment variables in PowerShell, for example `$env:PORT = '3001'; npm start`. Do not put credentials in source control.

To enable the **optional development text tutor**, an owner must separately authorize API spending and provide a secure project API key and a compatible Responses API model. Set `AI_PROVIDER=openai`, `OPENAI_API_KEY`, and `OPENAI_TEXT_MODEL` in the server environment. The adapter sends the learner's current text and up to six earlier turns in that scenario to the configured project. It requests `store:false`, caps output tokens, times out after 15 seconds, and makes no pronunciation claim. Default limits are 10 text requests per account per UTC day, 100 per project per UTC day, and three lifetime turns per guest cookie. The daily limits are configurable with `AI_TEXT_USER_DAILY_LIMIT` and `AI_TEXT_PROJECT_DAILY_LIMIT` (1–1000); they are request counts, not a currency ceiling. No live paid provider call has been executed for this project. See [official Responses documentation](https://developers.openai.com/api/reference/cli/resources/responses/methods/create) and [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs).

## Implemented

- Responsive Home, Practice, Lessons, Review, Progress, and Profile screens; 20 playable text scenarios and 20 short lessons.
- Simple daily plan based on goal, level, target, completed lessons, and due cards; spaced example review with idempotent grading.
- Guest practice limit of three saved turns; email/password registration and login; guest activity migration on registration and login; local progress and preference storage; logout, data export, guest clearing, and account deletion.
- SQLite development schema, provider interface, request reservations, and automated backend tests. The server refuses to start with `APP_ENV=production` until production security and integrations exist.

## Boundaries

The default tutor replies are deterministic simulated text. The optional OpenAI adapter can respond to text and suggest text corrections, but its live behavior is unverified. Neither mode analyzes audio, assesses pronunciation, or measures proficiency. Microphone, realtime voice AI, partner matching/calls, moderation, purchases, ads, notifications, offline sync, and mobile clients are pending. Password recovery and email verification are pending. The local auth/database are development implementations; replace them with managed authentication and PostgreSQL before any production deployment.

The interface is responsive but has not been tested on a browser device in this environment. Android and iOS builds require Flutter and platform SDKs. See [PROGRESS.md](PROGRESS.md), [REQUIREMENTS.md](REQUIREMENTS.md), and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Project layout

```text
api/server.mjs                 HTTP API, auth, development persistence
api/ai.mjs                     Optional text AI provider adapter
api/learning.mjs               Transparent review schedule and daily plan
api/content.mjs                Original scenarios and lessons
api/migrations/001_initial.sql Development SQLite schema
web/                           Responsive web client
test/                          Backend integration tests
docs/                          Decisions and verification evidence
```

## GitHub workflow

The source lives in `kriishna02-tech/SpeakDaily-development`, a public repository. Use feature branches for the next phases. Never commit `data/`, `.env`, signing files, provider tokens, or user audio. GitHub Actions runs `npm ci` and `npm run check` on pushes and pull requests. The public repository is source code only; it is not a deployed service.
