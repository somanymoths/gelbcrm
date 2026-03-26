#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

LOG_FILE="${1:-/private/tmp/journal-rename-watch.log}"
TARGET_ABS="${ROOT_DIR}/src/components/journal/"
TARGET_REL="src/components/journal/"

mkdir -p "$(dirname "$LOG_FILE")"
: > "$LOG_FILE"

cat <<MSG
[watch-journal-rename] Watching filesystem events for journal component...
[watch-journal-rename] Target: ${TARGET_ABS}journal-section.tsx
[watch-journal-rename] Log: $LOG_FILE
[watch-journal-rename] Press Ctrl+C to stop.
MSG

if ! command -v fs_usage >/dev/null 2>&1; then
  echo "[watch-journal-rename] fs_usage is unavailable on this system." >&2
  exit 1
fi

# fs_usage needs elevated privileges for reliable cross-process visibility.
if [ "${EUID}" -ne 0 ]; then
  exec sudo env TARGET_ABS="$TARGET_ABS" TARGET_REL="$TARGET_REL" "$0" "$LOG_FILE"
fi

# We use perl instead of awk because BSD awk (default on macOS) doesn't support strftime.
# macOS/APFS may emit rename-like syscalls as renameatx_np/exchangedata/etc.
fs_usage -w -f filesys 2>/dev/null \
  | perl -MPOSIX -ne '
      BEGIN {
        $abs = $ENV{TARGET_ABS};
        $rel = $ENV{TARGET_REL};
      }
      $line = lc($_);
      if ($_ =~ /^\d{2}:\d{2}:\d{2}\.\d+\s+((rename|unlink|link)[a-z0-9_]*|exchange[a-z0-9_]*)\b/ &&
          (index($_, $abs) != -1 || index($_, $rel) != -1 || $line =~ /journal-section/ || $line =~ /gelbcrm/)) {
        print strftime("%Y-%m-%d %H:%M:%S ", localtime), $_;
        STDOUT->flush();
      }
    ' \
  | tee -a "$LOG_FILE"
