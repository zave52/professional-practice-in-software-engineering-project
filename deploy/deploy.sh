#!/usr/bin/env bash
# Pull-based deployment with health verification and automatic rollback.
#
#   deploy/deploy.sh <image-tag>
#
# 1. switches IMAGE_TAG in .env to the new commit SHA;
# 2. pulls the backend/frontend images built by GitHub Actions from GHCR;
# 3. recreates the containers (database migrations run on backend start);
# 4. waits until /api/health answers "ok" *with the new version*;
# 5. on failure restores the previous IMAGE_TAG and exits non-zero, so the pipeline fails.
#
# Optional environment: GHCR_USER/GHCR_TOKEN (registry login), HEALTH_URL, HEALTH_TIMEOUT,
# DEPLOY_SKIP_PULL=true (use locally built images, for testing the script).
set -euo pipefail

NEW_TAG="${1:?usage: deploy.sh <image-tag>}"
APP_DIR="${APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1/api/health}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-120}"
STATE_DIR="$APP_DIR/.deploy"

cd "$APP_DIR"
mkdir -p "$STATE_DIR"
touch .env

current_tag() {
    if [[ -s "$STATE_DIR/current_tag" ]]; then
        cat "$STATE_DIR/current_tag"
    else
        grep -E '^IMAGE_TAG=' .env | tail -n 1 | cut -d= -f2- || true
    fi
}

set_tag() {
    if grep -qE '^IMAGE_TAG=' .env; then
        sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG=$1/" .env
    else
        printf '\nIMAGE_TAG=%s\n' "$1" >> .env
    fi
}

wait_healthy() {
    local tag="$1" deadline=$((SECONDS + HEALTH_TIMEOUT)) body
    while ((SECONDS < deadline)); do
        body="$(curl -fsS --max-time 5 "$HEALTH_URL" 2>/dev/null || true)"
        if [[ "$body" == *'"status":"ok"'* && "$body" == *"\"version\":\"$tag\""* ]]; then
            echo "Health check passed: $body"
            return 0
        fi
        sleep 3
    done
    return 1
}

restart_stack() {
    docker compose up -d --no-build --remove-orphans
}

PREVIOUS_TAG="$(current_tag)"
echo "Deploying $NEW_TAG (previous: ${PREVIOUS_TAG:-none})"

if [[ -n "${GHCR_TOKEN:-}" ]]; then
    echo "$GHCR_TOKEN" | docker login ghcr.io -u "${GHCR_USER:?GHCR_USER is required with GHCR_TOKEN}" --password-stdin >/dev/null
    trap 'docker logout ghcr.io >/dev/null 2>&1 || true' EXIT
fi

set_tag "$NEW_TAG"
if [[ "${DEPLOY_SKIP_PULL:-false}" != "true" ]] && ! docker compose pull --quiet backend frontend; then
    echo "::error::Unable to pull images for $NEW_TAG" >&2
    [[ -n "$PREVIOUS_TAG" ]] && set_tag "$PREVIOUS_TAG"
    exit 1
fi
restart_stack

if wait_healthy "$NEW_TAG"; then
    echo "$NEW_TAG" > "$STATE_DIR/current_tag"
    echo "$(date -u +%FT%TZ) $NEW_TAG" >> "$STATE_DIR/history"
    docker image prune -f >/dev/null
    echo "Deployed $NEW_TAG"
    exit 0
fi

echo "::error::Health check failed for $NEW_TAG within ${HEALTH_TIMEOUT}s" >&2
docker compose ps >&2 || true
docker compose logs --tail 60 backend >&2 || true

if [[ -n "$PREVIOUS_TAG" && "$PREVIOUS_TAG" != "$NEW_TAG" && "$PREVIOUS_TAG" != "latest" ]]; then
    echo "Rolling back to $PREVIOUS_TAG" >&2
    set_tag "$PREVIOUS_TAG"
    restart_stack
    if wait_healthy "$PREVIOUS_TAG"; then
        echo "Rollback to $PREVIOUS_TAG succeeded" >&2
    else
        echo "::error::Rollback to $PREVIOUS_TAG failed" >&2
    fi
else
    echo "No previous release to roll back to." >&2
fi
exit 1
