#!/usr/bin/env bash
# Install the mods of this repo as Claude Code plugins through its marketplace.
# Usage: scripts/install-mods.sh [--scope user|project|local] [--uninstall] [--list] [mod-name ...]
# --scope project installs into the folder you run this from, not into this repo.
set -euo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
market=claude-mods
manifest="$repo/.claude-plugin/marketplace.json"
mode=install
scope=user
names=()

while [ "$#" -gt 0 ]; do
  case "$1" in
    --scope) scope="${2:?--scope needs a value}"; shift ;;
    --uninstall) mode=uninstall ;;
    --list) mode=list ;;
    -h | --help) sed -n '2,3p' "$0"; exit 0 ;;
    -*) echo "Unknown option: $1" >&2; exit 2 ;;
    *) names+=("$1") ;;
  esac
  shift
done

if ! command -v claude >/dev/null 2>&1; then
  echo "The claude command is not on PATH. Install Claude Code first." >&2
  exit 1
fi

# A mod is a folder in mods/ that the marketplace manifest lists.
if [ "${#names[@]}" -eq 0 ]; then
  for dir in "$repo"/mods/*/; do
    name="$(basename "$dir")"
    grep -qF "\"./mods/$name\"" "$manifest" && names+=("$name")
  done
fi

installed="$(claude plugin list 2>/dev/null || true)"
is_installed() { printf '%s\n' "$installed" | grep -qF "$1@$market"; }

if [ "$mode" = list ]; then
  for name in "${names[@]}"; do
    if is_installed "$name"; then echo "installed  $name"; else echo "missing    $name"; fi
  done
  exit 0
fi

if [ "$mode" = uninstall ]; then
  for name in "${names[@]}"; do
    if is_installed "$name"; then
      claude plugin uninstall "$name@$market" --scope "$scope" && echo "removed    $name"
    else
      echo "skipped    $name (not installed)"
    fi
  done
  exit 0
fi

# Point the marketplace at this clone. Re-adding repoints a GitHub-sourced
# marketplace of the same name. Never remove it: that deletes plugin data.
claude plugin marketplace add "$repo"

status=0
for name in "${names[@]}"; do
  if is_installed "$name"; then
    claude plugin update "$name@$market" --scope "$scope" || status=1
  else
    claude plugin install "$name@$market" --scope "$scope" || status=1
  fi
done

echo "Restart Claude Code to load the mods."
exit "$status"
