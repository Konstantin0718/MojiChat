# AGENTS.md

## Cursor Cloud specific instructions

MojiChat is an emoji-obfuscation chat app with three parts sharing one backend:
- `backend/` — FastAPI + MongoDB API (WebSockets, JWT auth). Entry: `backend/server.py`.
- `frontend/` — React (CRA + CRACO) web client. Standard scripts in `frontend/package.json`.
- `mobile/` — React Native / Expo app (optional; not part of the default cloud dev loop).

The dev environment targets the backend + web frontend (+ MongoDB). Mobile is out of scope for the default loop.

### Services and how to run them
Nothing here is started automatically — the update script only refreshes dependencies. Start services manually (long-running processes belong in tmux):
- MongoDB: `mongod --dbpath /data/db --bind_ip 127.0.0.1 --port 27017`. Installed via apt (no systemd in this VM, so run `mongod` directly, not `systemctl`).
- Backend: from `backend/`, `./venv/bin/uvicorn server:app --host 0.0.0.0 --port 8000 --reload` (see `backend/Procfile`).
- Frontend: from `frontend/`, `BROWSER=none yarn start` (serves on port 3000; `craco start`).

### Environment files (gitignored — live only in the VM/snapshot)
- `backend/.env`: `MONGO_URL=mongodb://127.0.0.1:27017`, `DB_NAME=mojichat_db`, plus `JWT_SECRET`, `CORS_ORIGINS=*`. The backend raises at startup if `MONGO_URL`/`MONGODB_URI` is unset, so this file (or the env vars) must exist before starting.
- `frontend/.env`: `REACT_APP_BACKEND_URL=http://localhost:8000` (frontend calls `${REACT_APP_BACKEND_URL}/api`). CRA only reads this at dev-server start, so restart `yarn start` after changing it.

### Non-obvious gotchas
- The `backend/requirements.txt` package `emergentintegrations` is only on a custom index; install with `--extra-index-url https://d33sy5i8bnduwe.cloudfront.net/simple/` (the update script does this).
- `POST /api/auth/login` is rate-limited to 10 attempts / 10 min per IP, stored in-memory. Test suites and repeated manual logins trip a `429`; restart the backend to reset the counter.
- Emoji conversion works without `EMERGENT_LLM_KEY` (rule-based fallback). `EMERGENT_LLM_KEY`, `GIPHY_API_KEY`, and Firebase FCM are optional and only needed for AI translation / GIF search / push.
- Registration payload is `{email, password, name}` (field is `name`, not `display_name`).

### Lint / test
- Backend lint: `cd backend && ./venv/bin/flake8 server.py` (config-free; use `--select=E9,F63,F7,F82` for critical-error-only).
- Backend tests: `cd backend && REACT_APP_BACKEND_URL=http://localhost:8000 ./venv/bin/python -m pytest tests/ -v`. These are integration tests that hit a running backend and expect seeded users `test1@mojichat.com` / `test2@mojichat.com` (password `Test1234!`) with a conversation. Running the full suite exceeds the login rate limit; run focused subsets or restart the backend between groups.
- Frontend lint: ESLint runs automatically during `yarn start` / `yarn build` (react-scripts).
