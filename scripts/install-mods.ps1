# Install the mods of this repo as Claude Code plugins through its marketplace.
# Usage: scripts\install-mods.ps1 [-Scope user|project|local] [-Uninstall] [-List] [mod-name ...]
# -Scope project installs into the folder you run this from, not into this repo.
param(
  [ValidateSet('user', 'project', 'local')][string]$Scope = 'user',
  [switch]$Uninstall,
  [switch]$List,
  [Parameter(ValueFromRemainingArguments = $true)][string[]]$Names = @()
)
$ErrorActionPreference = 'Stop'

$repo = Split-Path -Parent $PSScriptRoot
$market = 'claude-mods'
$manifest = Join-Path $repo '.claude-plugin/marketplace.json'

if (-not (Get-Command claude -ErrorAction SilentlyContinue)) {
  Write-Error 'The claude command is not on PATH. Install Claude Code first.'
  exit 1
}

# A mod is a folder in mods/ that the marketplace manifest lists.
if ($Names.Count -eq 0) {
  $text = Get-Content -Raw $manifest
  $Names = Get-ChildItem (Join-Path $repo 'mods') -Directory |
    Where-Object { $text.Contains("`"./mods/$($_.Name)`"") } |
    ForEach-Object Name
}

$installed = (& claude plugin list 2>$null) -join "`n"
function Test-Installed($name) { $installed.Contains("$name@$market") }

if ($List) {
  foreach ($n in $Names) { if (Test-Installed $n) { "installed  $n" } else { "missing    $n" } }
  exit 0
}

if ($Uninstall) {
  foreach ($n in $Names) {
    if (Test-Installed $n) { & claude plugin uninstall "$n@$market" --scope $Scope; "removed    $n" }
    else { "skipped    $n (not installed)" }
  }
  exit 0
}

# Point the marketplace at this clone. Re-adding repoints a GitHub-sourced
# marketplace of the same name. Never remove it: that deletes plugin data.
& claude plugin marketplace add $repo
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$status = 0
foreach ($n in $Names) {
  if (Test-Installed $n) {
    & claude plugin update "$n@$market" --scope $Scope
  } else {
    & claude plugin install "$n@$market" --scope $Scope
  }
  if ($LASTEXITCODE -ne 0) { $status = 1 }
}

'Restart Claude Code to load the mods.'
exit $status
