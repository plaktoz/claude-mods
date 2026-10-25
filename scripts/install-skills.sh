#!/usr/bin/env bash
# Install the skills of this repo into ~/.claude/skills as symlinks.
# Usage: scripts/install-skills.sh [--force] [--uninstall] [--list] [skill-name ...]
set -euo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
src="$repo/skills"
dest="${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}"
force=0
mode=install
names=()

for arg in "$@"; do
  case "$arg" in
    --force) force=1 ;;
    --uninstall) mode=uninstall ;;
    --list) mode=list ;;
    -h | --help) sed -n '2,3p' "$0"; exit 0 ;;
    -*) echo "Unknown option: $arg" >&2; exit 2 ;;
    *) names+=("$arg") ;;
  esac
done

# A skill is a folder in skills/ that has a SKILL.md file.
if [ "${#names[@]}" -eq 0 ]; then
  for dir in "$src"/*/; do
    [ -f "${dir}SKILL.md" ] && names+=("$(basename "$dir")")
  done
fi

if [ "${#names[@]}" -eq 0 ]; then
  echo "No skills found in $src" >&2
  exit 1
fi

mkdir -p "$dest"
status=0

for name in "${names[@]}"; do
  from="$src/$name"
  to="$dest/$name"

  if [ "$mode" = list ]; then
    if [ -L "$to" ] && [ "$(readlink "$to")" = "$from" ]; then
      echo "installed  $name"
    elif [ -L "$to" ] && [ ! -e "$to" ]; then
      # A symlink whose target is gone is dangling: -L is true, -e is false.
      echo "broken     $name"
    else
      echo "missing    $name"
    fi
    continue
  fi

  if [ "$mode" = uninstall ]; then
    if [ -L "$to" ] && [ "$(readlink "$to")" = "$from" ]; then
      rm "$to"
      echo "removed    $name"
    else
      echo "skipped    $name (not installed from this repo)"
    fi
    continue
  fi

  if [ ! -f "$from/SKILL.md" ]; then
    echo "error      $name (no $from/SKILL.md)" >&2
    status=1
    continue
  fi

  if [ -L "$to" ] && [ "$(readlink "$to")" = "$from" ]; then
    echo "up to date $name"
  elif [ -e "$to" ] || [ -L "$to" ]; then
    if [ "$force" -eq 1 ]; then
      rm -rf "$to"
      ln -s "$from" "$to"
      echo "replaced   $name"
    elif [ -L "$to" ] && [ ! -e "$to" ]; then
      echo "broken     $name (link target $(readlink "$to") is missing; use --force to replace)" >&2
      status=1
    else
      echo "skipped    $name (already exists at $to; use --force to replace)" >&2
      status=1
    fi
  else
    ln -s "$from" "$to"
    echo "installed  $name"
  fi
done

exit "$status"
