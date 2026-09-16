#!/usr/bin/env bash
# setup.sh for a cloud workspace: the variables arrive in this process's own
# environment rather than a checkout's .env, and there is no machine state to
# copy. Runs from the start hook, once per workspace.
set -uo pipefail

SUPERSET_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SUPERSET_SCRIPT_DIR/.." && pwd)"
# shellcheck source=/dev/null
source "$SUPERSET_SCRIPT_DIR/lib/common.sh"
# shellcheck source=/dev/null
source "$SUPERSET_SCRIPT_DIR/lib/setup/steps.sh"
cd "$ROOT_DIR" || exit 1

STAMP_DIR="${SUPERSET_STATE_DIR:-/var/lib/superset}"
STAMP="$STAMP_DIR/setup-cloud.done"

# The environment's variables, as a file, because step_write_env copies one.
# install -m 600 and the trap because that file holds every secret the
# environment carries.
cloud_write_environment_env() {
  local out="$1"
  local tmp
  tmp="$(mktemp)"
  # shellcheck disable=SC2064
  trap "rm -f '$tmp'" RETURN
  while IFS= read -r -d '' entry; do
    local key="${entry%%=*}"
    local value="${entry#*=}"
    case "$key" in
      SUPERSET_*|HOST_SERVICE_*|VERCEL_*|IS_SANDBOX|PATH|HOME|PWD|OLDPWD|SHLVL|_|DISPLAY|TERM|SHELL|HOSTNAME|LANG|LC_*|NODE_ENV|PORT|TMUX*|USER|LOGNAME|MAIL|DEBIAN_FRONTEND) continue ;;
    esac
    [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || continue
    if [[ "$value" == *$'\n'* ]]; then
      local escaped="${value//\\/\\\\}"
      escaped="${escaped//\"/\\\"}"; escaped="${escaped//\$/\\\$}"; escaped="${escaped//\`/\\\`}"
      escaped="${escaped//$'\n'/\\n}"
      printf '%s="%s"\n' "$key" "$escaped" >> "$tmp"
    elif [[ "$value" != *"'"* ]]; then
      printf "%s='%s'\n" "$key" "$value" >> "$tmp"
    else
      local escaped="${value//\\/\\\\}"
      escaped="${escaped//\"/\\\"}"; escaped="${escaped//\$/\\\$}"; escaped="${escaped//\`/\\\`}"
      printf '%s="%s"\n' "$key" "$escaped" >> "$tmp"
    fi
  done < <(env -0)
  install -m 600 "$tmp" "$out"
}

cloud_setup_main() {
  if [ "${IS_SANDBOX:-}" != "1" ]; then
    error "setup.cloud.sh runs inside a cloud workspace (IS_SANDBOX=1)"
    return 1
  fi
  if [ -f "$STAMP" ] && [ -f "$ROOT_DIR/.env" ]; then
    echo "Cloud setup already done for this workspace"
    return 0
  fi

  FAILED_STEPS=()
  SKIPPED_STEPS=()

  # A directory of our own, so the environment's variables never sit beside
  # the checkout and never outlive this run.
  local env_source
  env_source="$(mktemp -d)"
  # shellcheck disable=SC2064
  trap "rm -rf '$env_source'" EXIT
  export SUPERSET_ROOT_PATH="$env_source"
  cloud_write_environment_env "$env_source/.env" || step_failed "Read the environment"
  set -a
  # shellcheck source=/dev/null
  . "$env_source/.env"
  set +a

  # Cloud workspaces share a display name, so the branch is named after the id.
  export SUPERSET_WORKSPACE_NAME="cloud-${SUPERSET_SANDBOX_WORKSPACE_ID%%-*}"

  step_setup_neon_branch || step_failed "Set up Neon branch"
  allocate_port_base || step_failed "Allocate port base"
  step_write_env || step_failed "Write .env file"
  step_seed_env_placeholders || step_failed "Seed .env placeholders"
  ( set -a; . "$ROOT_DIR/.env"; set +a; NODE_ENV=development bun run db:seed-dev ) ||
    step_failed "Seed dev account"

  if print_summary "Cloud setup"; then
    mkdir -p "$STAMP_DIR" && touch "$STAMP"
    return 0
  fi
  return 1
}

cloud_setup_main "$@"
