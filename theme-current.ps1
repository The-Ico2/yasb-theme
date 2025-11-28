# Prints the currently applied status theme and sub-theme (if any)
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$root = $scriptDir
$stateFile = Join-Path $root ".current_status_theme"
$stateSubFile = Join-Path $root ".current_status_subtheme"
$theme = ""
$sub = ""
if (Test-Path $stateFile) { $theme = (Get-Content $stateFile -Raw).Trim() }
if (Test-Path $stateSubFile) { $sub = (Get-Content $stateSubFile -Raw).Trim() }
if ($theme -and $sub) { Write-Output "$theme/$sub" } elseif ($theme) { Write-Output $theme } else { Write-Output "(none)" }
