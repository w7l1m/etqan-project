# Etqan Backend — Auth API

A minimal, dependency-free Node.js backend providing real database-backed
signup/login for the Etqan frontend (replacing the old `localStorage`-only
"fake" auth in `common.js`).

## Why no `npm install`?

It uses **only Node's built-in modules** — `node:http`, `node:sqlite`,
`node:crypto` — so it runs with zero dependencies. This requires **Node.js 22+**
(for built-in SQLite support). Check with `node --version`.

If you'd rather use the more common `express` + `bcryptjs` + `jsonwebtoken` +
`cors` stack, see "Swapping in the popular libraries" below — the file
layout was designed to make that a small change.

## 1. Setup

```bash
cd backend
cp .env.example .env
```

Open `.env` and set a strong random `JWT_SECRET` (e.g. run
`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
and paste the output). Also set `CORS_ORIGIN` to wherever your frontend is
served from (comma-separated if more than one), e.g.:

```
CORS_ORIGIN=http://localhost:5500,http://127.0.0.1:5500
```

## 2. Run

```bash
node src/server.js
# or, to auto-restart on file changes:
npm run dev
```

You should see:
```
Etqan backend listening on http://localhost:4000
```

A SQLite file is created automatically at `backend/data/etqan.db` on first run.

## 3. Database schema

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,   -- salted hash (scrypt), never plain text
  role TEXT NOT NULL DEFAULT 'student' CHECK(role IN ('student','teacher','admin')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

A second table, `revoked_tokens`, stores logged-out token IDs (`jti`) so a
token can be invalidated immediately on logout instead of just expiring
naturally.

## 4. Endpoints

| Method | Path                  | Auth? | Body / Notes |
|--------|-----------------------|-------|---------------|
| POST   | `/api/auth/signup`    | No    | `{ name, email, password, role? }` → `201 { ok, token, user }` |
| POST   | `/api/auth/login`     | No    | `{ email, password }` → `200 { ok, token, user }` |
| POST   | `/api/auth/logout`    | Yes   | Revokes the current token server-side |
| GET    | `/api/me`             | Yes   | Returns the logged-in user's profile |
| GET    | `/api/health`         | No    | Liveness check |

Auth = send header `Authorization: Bearer <token>`.

`role` defaults to `student` if omitted; valid values are `student`,
`teacher`, `admin`.

## 5. Test it yourself (curl)

```bash
# Signup
curl -X POST http://localhost:4000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"test@example.com","password":"Passw0rd!","role":"student"}'

# Login
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Passw0rd!"}'

# Protected route (replace TOKEN)
curl http://localhost:4000/api/me -H "Authorization: Bearer TOKEN"

# Logout (revokes token)
curl -X POST http://localhost:4000/api/auth/logout -H "Authorization: Bearer TOKEN"
```

This exact sequence was run and verified while building this project:
signup → 201 with token, duplicate signup → 409, weak password → 400,
wrong password login → 401, correct login → 200 with token, `/api/me`
without token → 401, `/api/me` with token → 200, logout → 200, and
`/api/me` again with the now-revoked token → 401. CORS preflight
(`OPTIONS`) was also confirmed to return the right `Access-Control-Allow-*`
headers for an origin listed in `CORS_ORIGIN`.

## 6. Connecting the frontend

The frontend files already include `api.js`, a small client that calls this
API (see `EtqanAPI.signup`, `.login`, `.logout`, `.me`). By default it points
at `http://localhost:4000`. To change that (e.g. for a deployed backend),
set it before `api.js` loads:

```html
<script>window.ETQAN_API_BASE = 'https://your-backend.example.com';</script>
<script src="api.js"></script>
```

Serve the frontend folder with any static server, e.g.:
```bash
cd etqan-platform-fixed
npx serve -l 5500
```
(and make sure `5500` is included in the backend's `CORS_ORIGIN`).

## 7. Where the JWT is stored (and the tradeoffs)

`api.js` stores the JWT in **`localStorage`**. This was chosen for simplicity
since it requires no backend cookie/session infrastructure and works the
same whether the API is on a different port/domain or not. Tradeoffs:

- **localStorage (current approach)**
  - ✅ Simple, works cross-origin without cookie/CORS credential dance.
  - ❌ Readable by any JS on the page → vulnerable to XSS token theft (a
    malicious script or compromised dependency could exfiltrate the token).
  - ❌ You must manually attach it via `Authorization` header on every request.

- **httpOnly cookie (more secure alternative)**
  - ✅ Not readable by JavaScript, so immune to token theft via XSS.
  - ❌ Vulnerable to CSRF unless you add `SameSite`/CSRF-token protections.
  - ❌ Requires the backend to set `Set-Cookie` and the frontend to send
    `credentials: 'include'`, plus matching CORS config
    (`Access-Control-Allow-Credentials: true` and an explicit origin, not `*`).

For a production app handling sensitive data, an httpOnly cookie (with
`SameSite=Lax` or `Strict`, plus CSRF protection) is generally recommended
over localStorage. If you want, this can be added as a follow-up.

## 8. Swapping in the popular libraries (express/bcryptjs/jsonwebtoken/cors)

This sandbox had no network access, so the built-in-only version above is
what was built and tested. If you have internet access locally and prefer
the standard stack:

```bash
npm install express bcryptjs jsonwebtoken cors dotenv
```

Then:
- Replace `src/password.js`'s `hashPassword`/`verifyPassword` with
  `bcrypt.hashSync(pw, 10)` / `bcrypt.compareSync(pw, hash)`.
- Replace `src/jwt.js`'s `sign`/`verify` with `jwt.sign(...)` / `jwt.verify(...)`.
- Replace `src/server.js`'s raw `http.createServer` router with an Express
  app using `app.use(cors({origin: ...}))` and `app.use(express.json())`.
- Replace `src/db.js`'s `node:sqlite` with `better-sqlite3` (same SQL, same
  schema) or point it at PostgreSQL via `pg` if you have a Postgres server
  available (swap `db.prepare(...).run/.get` calls for `pg` queries).

The route logic, validation, and schema don't need to change.

## Publishing Checklist

Follow these steps before deploying the backend to production:

- Set a strong `JWT_SECRET` in your `.env` (example: generate with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`).
- Configure `CORS_ORIGIN` to the frontend host(s) (comma-separated if multiple).
- Set `NODE_ENV=production` for production runs.
- Ensure the SQLite file path (`DB_FILE`) is set to a persistent, writable path (default: `backend/data/etqan.db`).
- Consider backing up the SQLite file regularly or migrate to a managed DB (Postgres) for multi-instance deployments.
- Start the server under a process manager (systemd, pm2) and put it behind a TLS reverse proxy (nginx or Caddy).

Quick production run example (on the server):

```bash
# generate secret (one-time)
export JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")
export NODE_ENV=production
export PORT=4000
node src/server.js
```

Post-deploy smoke checks:

- `curl http://localhost:4000/api/health` → `{ "ok": true }`
- Login as admin: `curl -X POST http://localhost:4000/api/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@etqan.com","password":"Admin@123"}'`
- Call protected endpoints with the returned token (e.g., `/api/admin/stats`).

### Vercel deployment note

The frontend can be hosted on Vercel as static files. If you deploy the frontend separately from the backend, set `window.ETQAN_API_BASE` to your backend URL before `api.js` loads, for example:

```html
<script>window.ETQAN_API_BASE = 'https://your-backend.example.com';</script>
<script src="api.js"></script>
```

Because this backend uses SQLite and local file storage, it is not directly suitable for Vercel Serverless Functions. Deploy the backend on a standard Node.js host or container, and host the frontend on Vercel.

Security reminders:

- Replace demo passwords and remove any demo-only accounts in production.
- Consider switching to httpOnly cookies for tokens and adding CSRF protections if you change auth storage.

