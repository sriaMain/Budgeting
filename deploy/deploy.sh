#!/usr/bin/env bash
# Deploys the currently-checked-out branch of this repo to the Budgeting
# production service on this VPS. Invoked over SSH by the GitHub Actions
# workflow (.github/workflows/deploy.yml) via a forced-command deploy key,
# but safe to run by hand for a manual redeploy too.
#
# Order matters: everything that can fail on bad code (dependency install,
# frontend type-check + build) runs BEFORE the database is migrated and the
# services are restarted, so a broken commit leaves production untouched.
# The last successfully deployed commit is recorded in $STATE_FILE; a failed
# deploy doesn't update it, so re-running the workflow (or pushing a fix)
# redeploys everything changed since the last good deploy.
set -euo pipefail

REPO_DIR="/srv/apps/budgeting/repo"
BACKEND_DIR="$REPO_DIR/Project_Budgeting-BE-"
FRONTEND_DIR="$REPO_DIR/Project_Budgeting-FE-"
VENV="/srv/apps/budgeting/venv"
BRANCH="master"
HEALTH_URL="https://project.nxsys.in/"
# Kept inside .git so it is always writable by the deploy user and never committed.
STATE_FILE="$REPO_DIR/.git/last_deployed_commit"
# requirements.txt lives in the nested Django project folder.
REQUIREMENTS="$BACKEND_DIR/Project_Budgeting-BE-/requirements.txt"

cd "$REPO_DIR"

echo "==> Fetching origin/$BRANCH"
git fetch origin "$BRANCH"

echo "==> Fast-forwarding to origin/$BRANCH"
if ! git merge --ff-only "origin/$BRANCH"; then
    echo "FAIL: server checkout has diverged from origin/$BRANCH (local commits or uncommitted changes present)." >&2
    echo "Refusing to overwrite - resolve manually on the server, then re-run the deploy." >&2
    exit 1
fi

NEW_HEAD=$(git rev-parse HEAD)

# Compare against the last SUCCESSFUL deploy, not the previous checkout: after a
# failed deploy the checkout has already moved forward.
LAST_DEPLOYED=""
if [ -f "$STATE_FILE" ]; then
    LAST_DEPLOYED=$(tr -d '[:space:]' < "$STATE_FILE")
fi

if [ "$LAST_DEPLOYED" = "$NEW_HEAD" ]; then
    echo "==> Already deployed at $NEW_HEAD, nothing to do."
    exit 0
fi

FULL_DEPLOY=0
if [ -z "$LAST_DEPLOYED" ] || ! git cat-file -e "$LAST_DEPLOYED^{commit}" 2>/dev/null; then
    echo "==> No record of a previous successful deploy - doing a full deploy."
    FULL_DEPLOY=1
    CHANGED_FILES=""
else
    echo "==> Deploying $LAST_DEPLOYED -> $NEW_HEAD"
    CHANGED_FILES=$(git diff --name-only "$LAST_DEPLOYED" "$NEW_HEAD")
    echo "$CHANGED_FILES"
fi

changed() {
    [ "$FULL_DEPLOY" = "1" ] || echo "$CHANGED_FILES" | grep -qE "$1"
}

# --- 1. Backend dependencies -------------------------------------------------
if changed "^Project_Budgeting-BE-/(Project_Budgeting-BE-/)?requirements\.txt$"; then
    echo "==> Installing backend dependencies"
    "$VENV/bin/pip" install -r "$REQUIREMENTS"
fi

# --- 2. Frontend: type-check and build into a staging folder -------------------
NEW_DIST=""
if changed "^Project_Budgeting-FE-/(src/|public/|index\.html$|package.*\.json$|vite\.config|tsconfig|tailwind\.config|\.env\.production)" \
    || [ ! -d "$FRONTEND_DIR/dist" ]; then
    echo "==> Frontend changed - installing deps, type-checking and building"
    cd "$FRONTEND_DIR"
    npm ci
    npx tsc -b
    rm -rf dist.new
    npx vite build --outDir dist.new --emptyOutDir
    NEW_DIST="$FRONTEND_DIR/dist.new"
fi

# --- 3. Backend checks before touching the database -------------------------
cd "$BACKEND_DIR"
echo "==> Django system check"
"$VENV/bin/python" manage.py check --deploy --fail-level ERROR

echo "==> Running database migrations"
"$VENV/bin/python" manage.py migrate --noinput

echo "==> Collecting static files"
"$VENV/bin/python" manage.py collectstatic --noinput

# --- 4. Switch the frontend build in (rename = near-atomic) -------------------
if [ -n "$NEW_DIST" ]; then
    echo "==> Activating the new frontend build"
    cd "$FRONTEND_DIR"
    rm -rf dist.prev
    if [ -d dist ]; then mv dist dist.prev; fi
    mv dist.new dist
fi

# --- 5. Restart and verify ---------------------------------------------------
echo "==> Restarting services"
sudo /usr/bin/systemctl restart budgeting-web.service
sudo /usr/bin/systemctl restart budgeting-celery.service
sudo /usr/bin/systemctl restart budgeting-celery-beat.service

echo "==> Waiting for service to come up"
HTTP_CODE="000"
for attempt in 1 2 3 4 5 6; do
    sleep 5
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 "$HEALTH_URL" || true)
    echo "    health check attempt $attempt: HTTP $HTTP_CODE"
    [ "$HTTP_CODE" = "200" ] && break
done
if [ "$HTTP_CODE" != "200" ]; then
    echo "FAIL: health check $HEALTH_URL returned HTTP $HTTP_CODE (expected 200)." >&2
    echo "Recent web service log:" >&2
    sudo -n /usr/bin/journalctl -u budgeting-web.service -n 40 --no-pager >&2 || true
    exit 1
fi

echo "$NEW_HEAD" > "$STATE_FILE"
echo "==> Deploy succeeded: ${LAST_DEPLOYED:-<first tracked deploy>} -> $NEW_HEAD"
