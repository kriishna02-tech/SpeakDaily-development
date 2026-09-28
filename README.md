# SpeakDaily

An early development slice of the SpeakDaily English practice app. It has a responsive web interface, original lesson/scenario content, local account and progress storage, and a **scripted text tutor simulation**. It is not ready for real learners or publication.

## Run locally (Windows PowerShell)

1. Install Node.js 24.2 or newer. Check with `node --version`.
2. In this folder run `npm ci` and `npm run check`.
3. Run `npm run dev` and visit `http://127.0.0.1:3000`.
4. Data is created in `data/speakdaily.sqlite` on first start. To reset development data, stop the server and delete the `data` folder.

No secrets or external services are needed for this preview. Copy `.env.example` to `.env` to plan deployment settings; this zero-dependency server does **not** automatically read `.env`. Set environment variables in PowerShell, for example `$env:PORT = '3001'; npm start`. Do not put credentials in source control.

## Implemented

- Responsive Home, Practice, Lessons, Progress, and Profile screens; 20 playable text scenarios and 20 short lessons.
- Guest practice limit of three saved turns; email/password registration and login; guest activity migration on registration and login; local progress and preference storage; logout and account deletion.
- SQLite development schema and automated backend tests. The server refuses to start with `APP_ENV=production` so development simulation cannot be mistaken for a production AI service.

## Boundaries

Tutor replies are deterministic simulated text. The feedback only says a turn was completed and suggests adding detail. It does not correct English, analyze audio, assess pronunciation, or measure proficiency. Microphone, realtime AI, partner matching/calls, moderation, purchases, ads, notifications, and mobile clients are pending. Password recovery and email verification are pending. The local auth/database are development implementations; replace them with managed authentication and PostgreSQL before any production deployment.

The interface is responsive but has not been tested on a browser device in this environment. Android and iOS builds require Flutter and platform SDKs. See [PROGRESS.md](PROGRESS.md), [REQUIREMENTS.md](REQUIREMENTS.md), and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Project layout

```text
api/server.mjs                 HTTP API, auth, development persistence
api/content.mjs                Original scenarios and lessons
api/migrations/001_initial.sql Development SQLite schema
web/                           Responsive web client
test/                          Backend integration tests
docs/                          Decisions and verification evidence
```

## GitHub workflow

The source lives in `kriishna02-tech/SpeakDaily-development`, a public repository. Use feature branches for the next phases. Never commit `data/`, `.env`, signing files, provider tokens, or user audio. GitHub Actions runs `npm ci` and `npm run check` on pushes and pull requests. The public repository is source code only; it is not a deployed service.
