<#
.SYNOPSIS
  theme.ps1 - switch / cycle themes for YASB + Wallpaper Engine

USAGE:
  .\theme.ps1 --cycle                # cycle to next theme
  .\theme.ps1 --select THEME_NAME   # select a specific theme
  .\theme.ps1 --list                 # list available themes
  .\theme.ps1 --verbose              # enable verbose output
  .\theme.ps1 --help                 # show help
#>

param(
  [switch] $cycle,
  [string] $select,
  [switch] $list,
  [switch] $verbose,
  [switch] $help
)

if ($help -or (-not $cycle -and -not $select -and -not $list)) {
  Write-Output "Usage: theme.ps1 --cycle | --select THEME_NAME | --list | --verbose | --help"
  exit 0
}

# Resolve script base directory (assumes script lives at theme/theme.ps1)
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
# root folder containing themes.json and themes/ directory
# (assuming this script is directly inside that root folder)

$root = $scriptDir

$themeJsonPath = Join-Path $root "themes.json"
# New structure: status bar themes live in `yasb-themes`.
$yasbThemesRoot = Join-Path $root "yasb-themes"
$stateFile     = Join-Path $root "theme.current_status"
$stateSubFile  = Join-Path $root "subtheme.current_status"
# Backwards-compat: legacy themes folder
$legacyThemesFolder = Join-Path $root "themes"

# Adjust path to YASB stylesheet - update if your layout differs
# YASB in this workspace uses `styles.css` (plural). Write to that file.
$yasbCssPath = Join-Path $env:USERPROFILE ".config\yasb\styles.css"

# Path to Wallpaper Engine executable — adjust if installed elsewhere
$wpeExe = "C:\Program Files (x86)\Steam\steamapps\common\wallpaper_engine\wallpaper64.exe"

# Helper: list status themes (folders under yasb-themes)
function Get-StatusThemes {
  if (-not (Test-Path $yasbThemesRoot)) { return @() }
  Get-ChildItem -Path $yasbThemesRoot -Directory | ForEach-Object { $_.Name }
}

function Get-SubThemes($themeName) {
  $themeDir = Join-Path $yasbThemesRoot $themeName
  $subRoot = Join-Path $themeDir "sub-themes"
  if (-not (Test-Path $subRoot)) { return @() }
  Get-ChildItem -Path $subRoot -Directory | ForEach-Object { $_.Name }
}

function Get-SubThemeManifest($themeName, $subName) {
  $m = Join-Path $yasbThemesRoot "$themeName\sub-themes\$subName\manifest.json"
  if (-not (Test-Path $m)) { return $null }
  try { return Get-Content $m -Raw | ConvertFrom-Json } catch { return $null }
}

if ($list) {
  Get-StatusThemes | ForEach-Object { Write-Output $_ }
  exit 0
}

# Determine which theme to apply
# Determine current/available status themes and sub-themes
$statusThemes = Get-StatusThemes

function Choose-Next-SubTheme {
  # cycle sub-themes for the currently selected status theme
  $currentTheme = ""
  if (Test-Path $stateFile) { $currentTheme = (Get-Content $stateFile -Raw).Trim() }
  if (-not $currentTheme -and $statusThemes.Count -gt 0) { $currentTheme = $statusThemes[0] }
  if (-not $currentTheme) { Write-Error "No status themes available."; exit 1 }

  $subs = Get-SubThemes $currentTheme
  if ($subs.Count -eq 0) {
    # no sub-themes: nothing to cycle; just re-apply the theme
    return @{ theme = $currentTheme; sub = $null }
  }

  $curSub = ""
  if (Test-Path $stateSubFile) { $curSub = (Get-Content $stateSubFile -Raw).Trim() }
  $idx = [Array]::IndexOf($subs, $curSub)
  if ($idx -lt 0 -or $idx -ge $subs.Count - 1) { $idx = 0 } else { $idx += 1 }
  return @{ theme = $currentTheme; sub = $subs[$idx] }
}

function Parse-SelectArg($arg) {
  # Accept formats: 'theme' or 'theme:sub' or 'theme/sub'
  if ($arg -match '(.+)[/:](.+)') { return @{ theme = $Matches[1]; sub = $Matches[2] } }
  return @{ theme = $arg; sub = $null }
}

if ($cycle) {
  $choice = Choose-Next-SubTheme
  $chosenTheme = $choice.theme
  $chosenSub = $choice.sub
} else {
  $p = Parse-SelectArg $select
  $chosenTheme = $p.theme
  $chosenSub = $p.sub
  if (-not ($statusThemes -contains $chosenTheme)) {
    Write-Error "Status theme '$chosenTheme' not found in $yasbThemesRoot"
    exit 1
  }
}


# Apply status theme (copy config and write styles, optionally merging sub-theme variables)
function Apply-StatusTheme($themeName, $subName) {
  $themeDir = Join-Path $yasbThemesRoot $themeName
  if (-not (Test-Path $themeDir)) { Write-Error "Theme folder missing: $themeDir"; exit 1 }

  # Paths
  $srcConfig = Join-Path $themeDir "config.yaml"
  $srcStyle1 = Join-Path $themeDir "style.css"
  $srcStyle2 = Join-Path $themeDir "styles.css"

  # Major themes replace config/style completely from the top-level theme folder.
  # Sub-themes only provide `root-variables` in their manifest (merged below) and
  # optionally wallpaper. We do NOT override the top-level `config.yaml` or
  # base stylesheet with sub-theme files.

  $targetConfig = Join-Path $env:USERPROFILE ".config\yasb\config.yaml"
  $targetStyle = Join-Path $env:USERPROFILE ".config\yasb\styles.css"

  if (-not (Test-Path $srcConfig)) { Write-Warning "Theme config not found: $srcConfig" } else {
    # atomic copy
    $tmpc = "$targetConfig.tmp.$PID"
    Copy-Item -Path $srcConfig -Destination $tmpc -Force
    Move-Item -Path $tmpc -Destination $targetConfig -Force
    if (Test-Path $targetConfig) { try { (Get-Item $targetConfig).LastWriteTime = Get-Date } catch {} }
  }

  # Determine base style source
  $baseStylePath = $null
  if (Test-Path $srcStyle1) { $baseStylePath = $srcStyle1 }
  elseif (Test-Path $srcStyle2) { $baseStylePath = $srcStyle2 }

  if ($subName) {
    $manifest = Get-SubThemeManifest $themeName $subName
    if (-not $manifest) { Write-Warning "Sub-theme manifest missing for $themeName/$subName" }
    # Build :root block from manifest root-variables
    $cssBuilder = New-Object System.Text.StringBuilder
    $cssBuilder.AppendLine(":root {") | Out-Null
    if ($manifest -and $manifest."root-variables") {
      foreach ($var in $manifest."root-variables".PSObject.Properties) {
        $cssBuilder.AppendLine("  --$($var.Name): $($var.Value);") | Out-Null
      }
    }
    $cssBuilder.AppendLine("}") | Out-Null
    $newRootBlock = $cssBuilder.ToString()

    # If base style exists, replace its :root block. Otherwise create a minimal style with :root
    $existing = ""
    if ($baseStylePath -and (Test-Path $baseStylePath)) {
      $existing = Get-Content $baseStylePath -Raw -ErrorAction Stop
    }
    $pattern = '(?s):root\s*\{.*?\}'
    if ($existing -and [regex]::IsMatch($existing, $pattern)) {
      $newContent = [regex]::Replace($existing, $pattern, $newRootBlock, 'Singleline')
    } else {
      $newContent = $newRootBlock + "`n" + $existing
    }

    # Write atomically
    $tmp = "$targetStyle.tmp.$PID"
    # sanitize variable names: convert 3+ leading dashes into the standard 2-dash custom property
    $sanitized = [regex]::Replace($newContent, '(-{3,})([A-Za-z0-9_-]+)', '--$2')
    try { Set-Content -Path $tmp -Value $sanitized -Encoding UTF8 -Force -ErrorAction Stop } catch { Write-Error "Failed to write temp style: $_"; if (Test-Path $tmp) { Remove-Item $tmp -Force -ErrorAction SilentlyContinue }; exit 1 }
    $maxAttempts = 6; $attempt = 0; $replaced = $false
    while ($attempt -lt $maxAttempts -and -not $replaced) {
      try { Move-Item -Path $tmp -Destination $targetStyle -Force -ErrorAction Stop; $replaced = $true } catch { Start-Sleep -Milliseconds 300; $attempt += 1 }
    }
    if (-not $replaced) { if (Test-Path $tmp) { Remove-Item $tmp -Force -ErrorAction SilentlyContinue }; Write-Error "Failed to replace stylesheet after $maxAttempts attempts"; exit 1 }

    # Touch the file to ensure file-watchers observe the change
    if (Test-Path $targetStyle) { try { (Get-Item $targetStyle).LastWriteTime = Get-Date } catch {} }

    # Apply wallpaper if present in manifest
    if ($manifest -and $manifest."wallpaper-engine" -and $manifest."wallpaper-engine".file) {
      $wallpath = $manifest."wallpaper-engine".file
      # allow relative path in sub-theme folder
      if (-not (Test-Path $wallpath)) { $rel = Join-Path (Join-Path $themeDir "sub-themes\$subName") $wallpath; if (Test-Path $rel) { $wallpath = $rel } }
      if (Test-Path $wallpath) { & "$wpeExe" -control openWallpaper -file "$wallpath"; if ($LASTEXITCODE -eq 0) { Write-Output "theme:wallpaper: OK" } else { Write-Warning "Wallpaper Engine returned $LASTEXITCODE" } } else { Write-Output "theme:wallpaper: SKIP (missing)" }
    }

    # save state
    Set-Content -Path $stateFile -Value $themeName -Encoding UTF8
    Set-Content -Path $stateSubFile -Value $subName -Encoding UTF8
    Write-Output "theme:applied: $themeName/$subName"
    return
  }

  # No sub-theme: simply copy base style file if present
  if ($baseStylePath -and (Test-Path $baseStylePath)) {
    $tmp = "$targetStyle.tmp.$PID"
    # Read and sanitize the base style before writing, to fix malformed custom-property names
    try {
      $baseContent = Get-Content $baseStylePath -Raw -ErrorAction Stop
    } catch { Write-Error "Failed to read base style: $_"; exit 1 }
    $sanitizedBase = [regex]::Replace($baseContent, '(-{3,})([A-Za-z0-9_-]+)', '--$2')
    try { Set-Content -Path $tmp -Value $sanitizedBase -Encoding UTF8 -Force -ErrorAction Stop } catch { Write-Error "Failed to write temp base style: $_"; if (Test-Path $tmp) { Remove-Item $tmp -Force -ErrorAction SilentlyContinue }; exit 1 }
    Move-Item -Path $tmp -Destination $targetStyle -Force
    if (Test-Path $targetStyle) { try { (Get-Item $targetStyle).LastWriteTime = Get-Date } catch {} }
  }

  Set-Content -Path $stateFile -Value $themeName -Encoding UTF8
  if (Test-Path $stateSubFile) { Remove-Item $stateSubFile -Force -ErrorAction SilentlyContinue }
  Write-Output "theme:applied: $themeName"
}

# Now apply according to chosenTheme / chosenSub
# Now apply according to chosenTheme / chosenSub

# If the chosen theme has sub-themes and none was provided, emit a JSON payload
# so GUI callers can prompt the user to pick a sub-theme.
try {
  $availableSubs = Get-SubThemes $chosenTheme
} catch {
  $availableSubs = @()
}

if ((-not $chosenSub -or $chosenSub -eq '') -and $availableSubs.Count -gt 0) {
  $out = @{ needs_sub = $true; theme = $chosenTheme; sub_options = $availableSubs }
  $json = $out | ConvertTo-Json -Compress -Depth 4
  Write-Output $json
  exit 0
}

Apply-StatusTheme -themeName $chosenTheme -subName $chosenSub

exit 0