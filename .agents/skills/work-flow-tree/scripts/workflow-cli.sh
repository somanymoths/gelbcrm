#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  workflow-cli.sh init <project_path> [--force] [--keep-existing]
  workflow-cli.sh sync-from-source [source_dir]
  workflow-cli.sh context-init <project_path> [--force]
  workflow-cli.sh context-check <project_path>
  workflow-cli.sh start <project_path> <section_number_or_title>
  workflow-cli.sh finish <project_path> <section_number_or_title> [done|blocked]
  workflow-cli.sh log <project_path> <message>
  workflow-cli.sh pr <project_path> <pr_url>
  workflow-cli.sh sync-sections <project_path> [--dry-run]
  workflow-cli.sh gates <project_path>
USAGE
}

DEFAULT_SOURCE_DIR="/Users/mxrxzxw/Desktop/moths/workflow"

require_file() {
  local file="$1"
  if [[ ! -f "$file" ]]; then
    echo "File not found: $file" >&2
    exit 1
  fi
}

is_section_number() {
  local selector="$1"
  [[ "$selector" =~ ^[0-9]+([.][0-9]+)*$ ]]
}

# Prints lines as: number|title
list_sections() {
  local plan_file="$1"
  awk '
    $0 ~ /^### Section / {
      line = $0
      sub(/^### Section /, "", line)
      sep = index(line, ". ")
      if (sep > 0) {
        num = substr(line, 1, sep - 1)
        title = substr(line, sep + 2)
        print num "|" title
      }
    }
  ' "$plan_file"
}

copy_template_tree() {
  local templates_dir="$1"
  local target_dir="$2"
  local force="$3"

  find "$templates_dir" -type f | while read -r src; do
    local rel dst
    rel="${src#${templates_dir}/}"
    dst="$target_dir/$rel"
    mkdir -p "$(dirname "$dst")"

    if [[ -f "$dst" && "$force" != "--force" ]]; then
      echo "skip: $dst (exists)"
      continue
    fi

    cp "$src" "$dst"
    if [[ "$dst" == *.sh ]]; then
      chmod +x "$dst"
    fi
    echo "write: $dst"
  done
}

sync_templates_from_source() {
  local source_dir="${1:-$DEFAULT_SOURCE_DIR}"
  local templates_dir
  templates_dir="$(cd "$(dirname "$0")/../assets/templates" && pwd)"

  if [[ ! -d "$source_dir" ]]; then
    echo "ERROR: source dir not found: $source_dir" >&2
    return 1
  fi

  mkdir -p "$templates_dir/context" "$templates_dir/context/screenshots"

  # Top-level markdown templates from source-of-truth.
  find "$source_dir" -maxdepth 1 -type f -name "*.md" | while read -r src; do
    local base
    base="$(basename "$src")"
    cp "$src" "$templates_dir/$base"
    echo "sync: $templates_dir/$base"
  done

  # Context markdown templates.
  if [[ -d "$source_dir/context" ]]; then
    find "$source_dir/context" -maxdepth 1 -type f -name "*.md" | while read -r src; do
      local base
      base="$(basename "$src")"
      cp "$src" "$templates_dir/context/$base"
      echo "sync: $templates_dir/context/$base"
    done
  fi
}

cleanup_previous_workflow() {
  local project_path="$1"
  local removed=0

  # Main workflow directory from previous runs
  if [[ -d "$project_path/.workflow" ]]; then
    rm -rf "$project_path/.workflow"
    echo "remove: $project_path/.workflow"
    removed=1
  fi

  # Legacy files that may exist in project root from older workflow setups
  local legacy_files=(
    "workflow.md"
    "plan.md"
    "rules.md"
    "checklist.md"
    "prompts.md"
    "promts.md"
    "decisions.md"
    "bugs.md"
    "progress.md"
    "release-checklist.md"
    "runbook.md"
    "task-template.md"
    "sprints.md"
    "META.md"
  )

  for file in "${legacy_files[@]}"; do
    if [[ -f "$project_path/$file" ]]; then
      rm -f "$project_path/$file"
      echo "remove: $project_path/$file"
      removed=1
    fi
  done

  # Legacy context folder in project root (outside .workflow)
  if [[ -d "$project_path/context" ]]; then
    rm -rf "$project_path/context"
    echo "remove: $project_path/context"
    removed=1
  fi

  if [[ "$removed" -eq 0 ]]; then
    echo "cleanup: no previous workflow artifacts found"
  fi
}

resolve_section_title() {
  local plan_file="$1"
  local selector="$2"

  if is_section_number "$selector"; then
    local match_line
    match_line="$(list_sections "$plan_file" | awk -F'|' -v n="$selector" '$1==n {print $0; exit}')"
    if [[ -z "$match_line" ]]; then
      return 1
    fi
    local number title
    number="${match_line%%|*}"
    title="${match_line#*|}"
    echo "Section $number. $title"
    return 0
  fi

  if grep -q "^### ${selector//\//\\/}$" "$plan_file"; then
    echo "$selector"
    return 0
  fi

  local by_title
  by_title="$(list_sections "$plan_file" | awk -F'|' -v t="$selector" '$2==t {print $1"|"$2; exit}')"
  if [[ -n "$by_title" ]]; then
    local number title
    number="${by_title%%|*}"
    title="${by_title#*|}"
    echo "Section $number. $title"
    return 0
  fi

  return 1
}

validate_plan() {
  local plan_file="$1"
  require_file "$plan_file"

  awk '
    BEGIN {
      in_section = 0
      current_num = ""
      section_count = 0
      err = 0
      status_found = 0
    }

    function flush_section() {
      if (in_section == 1 && status_found == 0) {
        print "ERROR: missing status line for section " current_num > "/dev/stderr"
        err = 1
      }
    }

    {
      if ($0 ~ /^### Section /) {
        line = $0
        sub(/^### Section /, "", line)
        sep = index(line, ". ")
        if (sep > 0) {
          flush_section()
          in_section = 1
          status_found = 0
          current_num = substr(line, 1, sep - 1)
          section_count++

          if (seen[current_num] == 1) {
            print "ERROR: duplicate section number: " current_num > "/dev/stderr"
            err = 1
          }
          seen[current_num] = 1
        }
      }

      if (in_section == 1 && $0 ~ /^\* Статус:/) {
        status_found = 1
      }
    }

    END {
      flush_section()
      if (section_count == 0) {
        print "ERROR: no sections found (expected lines like: ### Section 1. ...)" > "/dev/stderr"
        err = 1
      }
      if (err == 1) {
        exit 1
      }
    }
  ' "$plan_file"
}

validate_context() {
  local project_path="$1"
  local root="$project_path/.workflow"
  local err=0

  local required=(
    "$root/META.md"
    "$root/context/users.md"
    "$root/context/jtbd.md"
    "$root/context/user-flow.md"
    "$root/context/mvp-features.md"
    "$root/context/constraints.md"
    "$root/context/references.md"
    "$root/context/visual-rules.md"
    "$root/context/quality-criteria.md"
  )

  for f in "${required[@]}"; do
    if [[ ! -f "$f" ]]; then
      echo "ERROR: missing context file: $f" >&2
      err=1
      continue
    fi

    local non_empty
    non_empty="$(grep -Ev '^[[:space:]]*$' "$f" | wc -l | tr -d ' ')"
    if [[ "$non_empty" -lt 4 ]]; then
      echo "ERROR: context file too empty: $f" >&2
      err=1
    fi

    if grep -qiE '^\s*(\.{3}|TODO|\[заполни\]|\*\.\.\.)' "$f"; then
      echo "ERROR: unresolved placeholders in context file: $f" >&2
      err=1
    fi
  done

  if [[ ! -d "$root/context/screenshots" ]]; then
    echo "ERROR: missing screenshots directory: $root/context/screenshots" >&2
    err=1
  fi

  if [[ "$err" -eq 1 ]]; then
    echo "Context check failed. Fill .workflow/context/* and META.md, then rerun context-check." >&2
    return 1
  fi

  echo "Context check: OK"
}

replace_section_status() {
  local plan_file="$1"
  local section_title="$2"
  local new_status="$3"
  local tmp
  tmp="$(mktemp)"

  awk -v section="$section_title" -v status="$new_status" '
    BEGIN { in_section=0; found=0; replaced=0 }
    {
      if ($0 ~ /^### /) {
        if ($0 == "### " section) {
          in_section=1
          found=1
        } else {
          in_section=0
        }
      }

      if (in_section && $0 ~ /^\* Статус:/ && replaced==0) {
        print "* Статус: " status
        replaced=1
        next
      }

      print
    }
    END {
      if (found==0) {
        print "ERROR: section not found: " section > "/dev/stderr"
        exit 2
      }
      if (replaced==0) {
        print "ERROR: status line not found for section: " section > "/dev/stderr"
        exit 3
      }
    }
  ' "$plan_file" > "$tmp"

  mv "$tmp" "$plan_file"
}

append_progress_line() {
  local progress_file="$1"
  local message="$2"
  local today
  today="$(date +%F)"
  local now
  now="$(date +%H:%M)"

  if grep -q "^### $today$" "$progress_file"; then
    cat >> "$progress_file" <<EOF2
- [$now] $message
EOF2
  else
    cat >> "$progress_file" <<EOF2

### $today

- [$now] $message
EOF2
  fi
}

section_file_from_number() {
  local number="$1"
  echo "section-$number.md"
}

sync_plan_links() {
  local plan_file="$1"
  local dry_run="$2"
  local tmp
  tmp="$(mktemp)"

  awk '
    function make_link(num) {
      return "* Файл секции: [section-" num ".md](./sections/section-" num ".md)"
    }

    {
      if ($0 ~ /^### Section /) {
        line = $0
        sub(/^### Section /, "", line)
        sep = index(line, ". ")

        if (sep > 0) {
          if (pending == 1) {
            print make_link(prev_num)
            added++
          }

          print $0
          pending = 1
          prev_num = substr(line, 1, sep - 1)
          next
        }
      }

      if (pending == 1) {
        desired = make_link(prev_num)

        if ($0 ~ /^\* Файл секции: /) {
          if ($0 != desired) {
            fixed++
          }
          print desired
          pending = 0
          next
        } else {
          print desired
          added++
          pending = 0
        }
      }

      print $0
    }

    END {
      if (pending == 1) {
        print make_link(prev_num)
        added++
      }
      print "SYNC_PLAN_LINKS added=" added " fixed=" fixed > "/dev/stderr"
    }
  ' "$plan_file" > "$tmp" 2>"$tmp.stderr"

  if [[ "$dry_run" == "true" ]]; then
    if ! cmp -s "$plan_file" "$tmp"; then
      echo "[dry-run] plan.md changes:"
      diff -u "$plan_file" "$tmp" || true
    else
      echo "[dry-run] plan.md: no changes"
    fi
    cat "$tmp.stderr" >&2
    rm -f "$tmp" "$tmp.stderr"
    return
  fi

  mv "$tmp" "$plan_file"
  cat "$tmp.stderr" >&2
  rm -f "$tmp.stderr"
}

sync_section_files() {
  local project_path="$1"
  local plan_file="$2"
  local dry_run="$3"
  local skill_root="$4"
  local sections_dir="$project_path/.workflow/sections"
  local section_template="$skill_root/assets/section-template.md"

  render_section_template() {
    local number="$1"
    local title="$2"
    local dst="$3"
    awk -v num="$number" -v ttl="$title" '
      {
        gsub(/\{\{SECTION_NUMBER\}\}/, num)
        gsub(/\{\{SECTION_TITLE\}\}/, ttl)
        print
      }
    ' "$section_template" > "$dst"
  }

  if [[ "$dry_run" == "true" ]]; then
    if [[ ! -d "$sections_dir" ]]; then
      echo "[dry-run] create dir: $sections_dir"
    fi
  else
    mkdir -p "$sections_dir"
  fi

  list_sections "$plan_file" | while IFS='|' read -r number title; do
    local file_name
    file_name="$(section_file_from_number "$number")"
    local dst="$sections_dir/$file_name"

    if [[ ! -f "$dst" ]]; then
      if [[ "$dry_run" == "true" ]]; then
        echo "[dry-run] create file: $dst"
      else
        render_section_template "$number" "$title" "$dst"
        echo "write: $dst"
      fi
      continue
    fi

    if [[ ! -s "$dst" ]]; then
      if [[ "$dry_run" == "true" ]]; then
        echo "[dry-run] fill empty file from template: $dst"
      else
        render_section_template "$number" "$title" "$dst"
        echo "fill: $dst"
      fi
    fi
  done
}

cmd_sync_sections() {
  local project_path="$1"
  local dry_run="false"
  if [[ "${2:-}" == "--dry-run" ]]; then
    dry_run="true"
  fi

  local plan_file="$project_path/.workflow/plan.md"
  local skill_root
  skill_root="$(cd "$(dirname "$0")/.." && pwd)"

  require_file "$plan_file"
  validate_plan "$plan_file"

  sync_section_files "$project_path" "$plan_file" "$dry_run" "$skill_root"
  sync_plan_links "$plan_file" "$dry_run"

  echo "sync-sections completed (dry-run=$dry_run)"
}

cmd_context_init() {
  local project_path="$1"
  local force="${2:-}"
  local skill_root
  skill_root="$(cd "$(dirname "$0")/.." && pwd)"
  local templates="$skill_root/assets/templates"
  local target="$project_path/.workflow"

  mkdir -p "$target"

  local files=(
    "$templates/META.md"
    "$templates/context/users.md"
    "$templates/context/jtbd.md"
    "$templates/context/user-flow.md"
    "$templates/context/mvp-features.md"
    "$templates/context/constraints.md"
    "$templates/context/references.md"
    "$templates/context/visual-rules.md"
    "$templates/context/quality-criteria.md"
  )

  for src in "${files[@]}"; do
    if [[ ! -f "$src" ]]; then
      continue
    fi
    local rel dst
    rel="${src#${templates}/}"
    dst="$target/$rel"
    mkdir -p "$(dirname "$dst")"

    if [[ -f "$dst" && "$force" != "--force" ]]; then
      echo "skip: $dst (exists)"
      continue
    fi

    cp "$src" "$dst"
    echo "write: $dst"
  done

  mkdir -p "$target/context/screenshots"
  echo "ensure dir: $target/context/screenshots"
}

cmd_context_check() {
  local project_path="$1"
  validate_context "$project_path"
}

cmd_init() {
  local project_path="$1"
  shift
  local force=""
  local keep_existing="false"
  for arg in "$@"; do
    case "$arg" in
      --force)
        force="--force"
        ;;
      --keep-existing)
        keep_existing="true"
        ;;
      *)
        echo "Unknown option for init: $arg" >&2
        exit 1
        ;;
    esac
  done
  local skill_root
  skill_root="$(cd "$(dirname "$0")/.." && pwd)"
  local templates="$skill_root/assets/templates"
  local target="$project_path/.workflow"

  # If local source-of-truth exists, always refresh templates before install.
  if [[ -d "$DEFAULT_SOURCE_DIR" ]]; then
    sync_templates_from_source "$DEFAULT_SOURCE_DIR"
  else
    echo "warn: source-of-truth not found, using current templates: $templates"
  fi

  if [[ "$keep_existing" != "true" ]]; then
    cleanup_previous_workflow "$project_path"
  fi

  mkdir -p "$target"
  copy_template_tree "$templates" "$target" "$force"
  mkdir -p "$target/context/screenshots"

  cmd_sync_sections "$project_path"
}

cmd_sync_from_source() {
  local source_dir="${1:-$DEFAULT_SOURCE_DIR}"
  sync_templates_from_source "$source_dir"
  echo "sync-from-source completed"
}

cmd_start() {
  local project_path="$1"
  local selector="$2"
  local plan_file="$project_path/.workflow/plan.md"

  require_file "$plan_file"
  validate_plan "$plan_file"
  validate_context "$project_path"

  local section_title
  if ! section_title="$(resolve_section_title "$plan_file" "$selector")"; then
    echo "Section not found by selector: $selector" >&2
    exit 1
  fi

  replace_section_status "$plan_file" "$section_title" "in_progress"
  echo "updated: $section_title -> in_progress"
}

cmd_finish() {
  local project_path="$1"
  local selector="$2"
  local final_status="${3:-done}"
  if [[ "$final_status" != "done" && "$final_status" != "blocked" ]]; then
    echo "Invalid final status: $final_status (allowed: done|blocked)" >&2
    exit 1
  fi

  local plan_file="$project_path/.workflow/plan.md"
  local progress_file="$project_path/.workflow/progress.md"
  require_file "$plan_file"
  require_file "$progress_file"
  validate_plan "$plan_file"

  local section_title
  if ! section_title="$(resolve_section_title "$plan_file" "$selector")"; then
    echo "Section not found by selector: $selector" >&2
    exit 1
  fi

  replace_section_status "$plan_file" "$section_title" "$final_status"
  append_progress_line "$progress_file" "$section_title -> $final_status"
  echo "updated: $section_title -> $final_status"
}

cmd_log() {
  local project_path="$1"
  local message="$2"
  local progress_file="$project_path/.workflow/progress.md"
  require_file "$progress_file"

  append_progress_line "$progress_file" "$message"
  echo "logged to progress.md"
}

cmd_pr() {
  local project_path="$1"
  local pr_url="$2"
  local progress_file="$project_path/.workflow/progress.md"
  require_file "$progress_file"

  append_progress_line "$progress_file" "PR: $pr_url"
  echo "logged PR link to progress.md"
}

cmd_gates() {
  local project_path="$1"
  local gates_file="$project_path/.workflow/gates.sh"

  if [[ ! -f "$gates_file" ]]; then
    echo "Missing $gates_file"
    echo "Create it from template and define project commands."
    exit 1
  fi

  bash "$gates_file"
}

main() {
  if [[ $# -lt 1 ]]; then
    usage
    exit 1
  fi

  local cmd="$1"
  shift

  case "$cmd" in
    init)
      cmd_init "$@"
      ;;
    sync-from-source)
      if [[ $# -gt 1 ]]; then usage; exit 1; fi
      cmd_sync_from_source "$@"
      ;;
    context-init)
      if [[ $# -lt 1 || $# -gt 2 ]]; then usage; exit 1; fi
      cmd_context_init "$@"
      ;;
    context-check)
      if [[ $# -ne 1 ]]; then usage; exit 1; fi
      cmd_context_check "$@"
      ;;
    start)
      if [[ $# -ne 2 ]]; then usage; exit 1; fi
      cmd_start "$@"
      ;;
    finish)
      if [[ $# -lt 2 || $# -gt 3 ]]; then usage; exit 1; fi
      cmd_finish "$@"
      ;;
    log)
      if [[ $# -ne 2 ]]; then usage; exit 1; fi
      cmd_log "$@"
      ;;
    pr)
      if [[ $# -ne 2 ]]; then usage; exit 1; fi
      cmd_pr "$@"
      ;;
    sync-sections)
      if [[ $# -lt 1 || $# -gt 2 ]]; then usage; exit 1; fi
      cmd_sync_sections "$@"
      ;;
    gates)
      if [[ $# -ne 1 ]]; then usage; exit 1; fi
      cmd_gates "$@"
      ;;
    *)
      usage
      exit 1
      ;;
  esac
}

main "$@"
