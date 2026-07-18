# SRM Elective Polling Backup — PRD

## Original problem statement
Build a landing page based on the infamous issue of Elective (Professional / Open) Polling from SRM Institute of Science and Technology, wrapping the SRM Academia (Zoho) interface.

Flow:
1. Student can't poll on Academia → clicks a CTA. Server starts a 30-minute timer.
2. At the 31st minute, an email is triggered with an external link to fill preferences.
3. Landing question: "Did you fill Professional / Open / Both?" — if Both, tell the student to close and return to Academia.
4. Otherwise, capture name, department, Reg. No., count of Prof / Open electives, and 3 ranked preferences per elective. Submit.
5. Faculty side: view submissions, download CSV/Excel, apply constraints, allocate courses.
6. Student receives allocation email → accept/reject. Reject re-opens for faculty.

UI must be simple and to-the-point.

## User personas
- **Student**: SRM undergrad who failed to poll electives on Academia. Wants a fast, minimum-friction backup that guarantees their preferences are seen.
- **Faculty coordinator**: department representative who reviews all backup submissions, applies constraints (seat counts, prereqs), and allocates final courses.

## Architecture (implemented 2026-02-17)
- **Backend**: FastAPI (async), Motor (Mongo), Pandas + openpyxl for CSV/XLSX export. All routes prefixed with `/api`. Auth via magic-link token (email currently MOCKED — token returned directly in `/api/auth/request-link` response; frontend auto-verifies). Session tokens stored in `sessions` collection, `Authorization: Bearer <token>` required for protected routes.
- **Frontend**: React 19 + Tailwind + shadcn/ui + framer-motion + sonner + react-router 7. Design system: Swiss Brutalist / academic — Cabinet Grotesk display, IBM Plex Sans body, JetBrains Mono for numeric data. Sharp corners, monochrome palette + blue accent (#0055FF), red alert (#E54D2E), green success (#30A46C).
- **Env vars**: `TIMER_MINUTES` (default 30), `APP_BASE_URL`, `RESEND_API_KEY`, `FROM_EMAIL`.
- **Collections**: `users`, `sessions`, `magic_links`, `submissions`.

## Core requirements (static)
- One submission per active student at a time.
- Timer is server-truth (via `started_at` + `TIMER_MINUTES`); frontend only renders it.
- Submitting preferences before timer elapses returns 400.
- Faculty can only allocate submissions in `submitted` or `rejected` status.
- Faculty export: CSV and XLSX with header + all fields.
- Auth guards: `/student/dashboard` and `/faculty/dashboard` require correct role.

## Implemented (2026-02-17)
- ✅ Landing hero + how-it-works + inline start modal (name / reg_no / dept / email)
- ✅ Magic-link auth (mocked): `/api/auth/request-link` + `/api/auth/verify` + `/api/auth/me`
- ✅ Submission lifecycle: `start` → `timer` → `submitted` | `completed_no_action` → `allocated` → `accepted` | `rejected`
- ✅ Multi-step preferences form (framer-motion transitions): status → count → ranked choices
- ✅ Student dashboard with countdown timer (JetBrains Mono, pulse animation < 5 min)
- ✅ Faculty login + dashboard table (filter, refresh, open detail)
- ✅ Allocation dialog with note + accept/reject on student side
- ✅ CSV & XLSX export
- ✅ Mocked email logs to backend logs as `[MOCK EMAIL]`
- ✅ Backend tests (100%) + frontend E2E (100%) via testing agent

## Implemented (2026-02-18) — SRM Academia (Zoho) integration
- ✅ Ported the unofficial `iamyogik/SRM-Academia-API-Python` scraper to modern Python 3, pointed at the current domain `academia.srmist.edu.in`, and trimmed to just what we need (personal details).
- ✅ New backend endpoint `POST /api/academia/import` — takes `{username, password}`, returns `{name, reg_no, department, program, semester, batch, mobile}` on success.
- ✅ New file `/app/backend/srm_academia.py` with `sign_in`, `fetch_personal_details`, `import_student`, `AcademiaError`.
- ✅ Env var `ACADEMIA_BASE` (default `https://academia.srmist.edu.in`).
- ✅ New landing-modal panel "Import from SRM Academia" (data-testid: `import-academia-toggle`, `-panel`, `-email`, `-password`, `-submit`, `-cancel`) that pre-fills name / reg-no / department on success, and toasts a clean error on failure with the user still able to fill manually.
- ✅ Confirmed reachable: `POST /accounts/signin.ac` on current Academia domain responds with structured errors (verified with fake credentials → clean toast "Invalid Email Address or Password").
- ⚠️ **Password never persisted** — used only in-memory during the single request. Not logged, not written to Mongo.
- ⚠️ **Best-effort only** — the personal-details scrape tries multiple view names (`My_Time_Table_2022_23…2025_26_{ODD,EVEN}`). If SRM's view names have all changed again, the login succeeds but details scrape returns an `AcademiaError`, and the user is prompted to fill manually.
- ❌ **Elective polling itself is not exposed by any known API** — no unofficial wrapper implements the elective-polling page. This app remains a standalone backup for that specific flow.

## New endpoints added
- `POST /api/academia/import` — body `{ username, password }` → 200 `{ ok, details: {...} }` or 400 `{ detail: "..." }`

## Prioritized backlog
### P0 (before real rollout)
- Wire real Resend API key + verified sending domain (email flow currently mocked)
- Real SRM Academia / Zoho integration once creds/docs provided by user

### P1
- Auth context / provider to centralize `session` reads (see testing-agent RCA)
- Scope faculty visibility by department (currently all faculty see all submissions)
- Allow faculty to override individual student timer (skip 30-min wait for exceptional cases)
- Rate-limit `/api/auth/request-link` per email
- Migrate FastAPI shutdown handler to `lifespan`

### P2
- Real magic-link (only token in email; do not return in response) once RESEND_API_KEY set
- Faculty seat-count constraints + auto-allocation suggestion
- Student can attach polling-failure screenshot as evidence
- Admin analytics: number of failures per hour, per department
- Mobile polish for step 3 preferences (currently OK but not tuned)

## Test credentials
- No pre-seeded accounts. Magic-link auth is self-service. In this build, `/api/auth/request-link` returns the token directly so the frontend can auto-verify (email is mocked, no key configured).

## Files of note
- Backend: `/app/backend/server.py`, `/app/backend/.env`, `/app/backend/tests/backend_test.py` (created by testing agent)
- Frontend: `/app/frontend/src/App.js`, `/app/frontend/src/pages/{Landing,StudentDashboard,FacultyLogin,FacultyDashboard,VerifyLink}.jsx`, `/app/frontend/src/components/Header.jsx`, `/app/frontend/src/lib/{api,auth}.js`, `/app/frontend/src/index.css`

## Next tasks
1. Collect **Resend API key** + verified `FROM_EMAIL` domain from user → set in `/app/backend/.env` → restart backend → live email flow.
2. Once user provides SRM Academia / Zoho API docs, wire real integration (currently standalone by user's choice).
3. Introduce Auth context to eliminate the session-in-deps class of bugs (P1).
