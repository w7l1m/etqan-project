Publishing checklist — Etqan project

1) Environment
- Set `JWT_SECRET` to a strong random string.
- (Optional) Set `DB_FILE` to an absolute path for the SQLite DB (default: `backend/data/etqan.db`).
- Set `PORT` (default 4000) and `CORS_ORIGIN` to your frontend host(s).
- In production set `NODE_ENV=production`.

2) Run locally
- From project root:

```bash
cd backend
node src/server.js
```

- Or run with a process manager (recommended):

```bash
# using pm2
npm install -g pm2
pm2 start src/server.js --name etqan-backend --cwd /path/to/backend --interpreter node
```

3) Recommended production setup
- Put the backend behind a reverse proxy (nginx, Caddy) to handle TLS and host routing.
- Use a process manager (pm2, systemd) to keep the server running and restart on failure.
- Ensure the SQLite DB file is writable by the process user and backed up.

4) Docker (optional)
- You can containerize the backend. Make sure to mount a persistent volume for the DB file and pass `JWT_SECRET` via environment.

5) Frontend
- The frontend is static files in `frontend/`. Serve them from any static host (GitHub Pages, Netlify, S3+CloudFront) or from the backend (default server serves `frontend/`).
- If hosting frontend separately, set `ETQAN_API_BASE` to the backend URL before loading the app (or configure CORS accordingly).

6) Post-deploy checks
- Visit `https://<host>/api/health` → should return `{ok:true}`.
- Log in as `admin@etqan.com` / `Admin@123` (change the admin password immediately in production).
- Exercise admin flows (create teacher, list students) and verify DB persists changes.

7) Security notes
- Replace demo accounts and passwords.
- Use a secure JWT secret and limit token lifetime (`JWT_EXPIRES_IN_SECONDS`).
- Consider moving to a server DB (Postgres) for multi-instance deployments.

If you want, I can:
- Create a `Dockerfile` + `docker-compose.yml` for production.
- Add a small systemd unit file example.
- Update `backend/README.md` with these steps.
