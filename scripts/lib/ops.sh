#!/usr/bin/env bash

EXIT_USAGE=64
EXIT_REPO_NOT_FOUND=65
EXIT_REPO_DIRTY=66
EXIT_BASE_REF_NOT_FOUND=67
EXIT_DEV_NOT_READY=68

OPS_LOG_FILE=""
OPS_SCRIPT_NAME=""

init_ops() {
  local root_dir="${1:-}"
  if [ -z "$root_dir" ]; then
    root_dir="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
  fi

  mkdir -p "${root_dir}/.codex/logs"
  OPS_LOG_FILE="${root_dir}/.codex/logs/task-tools.log"
  OPS_SCRIPT_NAME="$(basename "${BASH_SOURCE[1]:-${0}}")"
}

_ops_now() {
  date '+%Y-%m-%d %H:%M:%S %Z'
}

_ops_log() {
  local level="$1"
  local message="$2"
  local line
  line="$(_ops_now) [${level}] [${OPS_SCRIPT_NAME}] ${message}"
  printf '%s\n' "$line"
  if [ -n "$OPS_LOG_FILE" ]; then
    printf '%s\n' "$line" >>"$OPS_LOG_FILE"
  fi
}

log_info() {
  _ops_log "INFO" "$1"
}

log_warn() {
  _ops_log "WARN" "$1"
}

log_error() {
  _ops_log "ERROR" "$1"
}

fail() {
  local code="$1"
  shift
  local message="$*"
  log_error "$message"
  exit "$code"
}
