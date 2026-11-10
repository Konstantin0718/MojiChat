#!/usr/bin/env bash
# Idempotent environment bootstrap for MojiChat (backend + web frontend + MongoDB).
# Runs on VM startup after the repo is checked out. Must be safe to re-run.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

echo "==> Ensuring system dependencies (MongoDB, python venv)"
if ! command -v mongod >/dev/null 2>&1; then
  curl -fsSL https://www.mongodb.org/static/pgp/server-8.0.asc \
    | sudo gpg -o /usr/share/keyrings/mongodb-server-8.0.gpg --dearmor
  echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-8.0.gpg ] https://repo.mongodb.org/apt/ubuntu noble/mongodb-org/8.0 multiverse" \
    | sudo tee /etc/apt/sources.list.d/mongodb-org-8.0.list
  sudo apt-get update -y
  sudo apt-get install -y mongodb-org
fi

if ! dpkg -s python3-venv >/dev/null 2>&1; then
  sudo apt-get update -y
  sudo apt-get install -y python3-venv
fi

sudo mkdir -p /data/db
sudo chown -R "$(id -u):$(id -g)" /data/db

echo "==> Backend: virtualenv + dependencies"
cd "$REPO_ROOT/backend"
[ -d venv ] || python3 -m venv venv
./venv/bin/pip install --upgrade pip
./venv/bin/pip install -r requirements.txt \
  --extra-index-url https://d33sy5i8bnduwe.cloudfront.net/simple/

if [ ! -f .env ]; then
  echo "==> Creating backend/.env (defaults)"
  cat > .env <<'EOF'
MONGO_URL=mongodb://127.0.0.1:27017
DB_NAME=mojichat_db
JWT_SECRET=dev_local_secret_change_me
CORS_ORIGINS=*
GIPHY_API_KEY=
EMERGENT_LLM_KEY=
FRONTEND_URL=http://localhost:3000
PORT=8000
EOF
fi

echo "==> Frontend: dependencies"
cd "$REPO_ROOT/frontend"
yarn install

if [ ! -f .env ]; then
  echo "==> Creating frontend/.env (defaults)"
  echo "REACT_APP_BACKEND_URL=http://localhost:8000" > .env
fi

echo "==> Install complete"
