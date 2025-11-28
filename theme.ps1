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

# $themeJsonPath = Join-Path $root "themes.json"
# New structure: status bar themes live in `yasb-themes`.
$yasbThemesRoot = Join-Path $root "yasb-themes"
$stateFile = Join-Path $root "theme.current_status"
$stateSubFile = Join-Path $root "subtheme.current_status"
# Backwards-compat: legacy themes folder
# $legacyThemesFolder = Join-Path $root "themes"

# Adjust path to YASB stylesheet - update if your layout differs
# $yasbCssPath = Join-Path $env:USERPROFILE ".config\yasb\styles.css"

# Default paths (used if no settings present)
$DEFAULT_WPE_EXE = "C:\Program Files (x86)\Steam\steamapps\common\wallpaper_engine\wallpaper64.exe"
$DEFAULT_WPE_WORKSHOP = "C:\Program Files (x86)\Steam\steamapps\workshop\content\431960"

# Read selector-app settings.json (if present) to locate Wallpaper Engine paths
$settingsPath = Join-Path $root 'settings.json'
$wpeExe = $null
$weWorkshopRoot = $null
if (Test-Path $settingsPath) {
  try {
    $sRaw = Get-Content $settingsPath -Raw -ErrorAction Stop
    $sObj = $sRaw | ConvertFrom-Json
    if ($sObj.WE_Exe) { $wpeExe = $sObj.WE_Exe }
    if ($sObj.WE_Workshop) { $weWorkshopRoot = $sObj.WE_Workshop }
  }
  catch {
    # ignore parse errors and fall back
  }
}
# Fallback to environment variable or defaults
if (-not $wpeExe) {
  if ($env:WALLPAPER_ENGINE_EXE -and (Test-Path $env:WALLPAPER_ENGINE_EXE)) { $wpeExe = $env:WALLPAPER_ENGINE_EXE } else { $wpeExe = $DEFAULT_WPE_EXE }
}
if (-not $weWorkshopRoot) { $weWorkshopRoot = $DEFAULT_WPE_WORKSHOP }

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

function Get-NextSubTheme {
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

function Convert-ThemeSelection($arg) {
  # Accept formats: 'theme' or 'theme:sub' or 'theme/sub'
  if ($arg -match '(.+)[/:](.+)') { return @{ theme = $Matches[1]; sub = $Matches[2] } }
  return @{ theme = $arg; sub = $null }
}

if ($cycle) {
  $choice = Get-NextSubTheme
  $chosenTheme = $choice.theme
  $chosenSub = $choice.sub
}
else {
  $p = Convert-ThemeSelection $select
  $chosenTheme = $p.theme
  $chosenSub = $p.sub
  if (-not ($statusThemes -contains $chosenTheme)) {
    Write-Error "Status theme '$chosenTheme' not found in $yasbThemesRoot"
    exit 1
  }
}


# Apply status theme (copy config and write styles, optionally merging sub-theme variables)
function Set-StatusTheme($themeName, $subName) {
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
    }
    else {
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

    # Save state files BEFORE handling wallpaper so cycling works even if wallpaper fails
    Set-Content -Path $stateFile -Value $themeName -Encoding UTF8
    Set-Content -Path $stateSubFile -Value $subName -Encoding UTF8

    # Apply wallpaper if present in manifest
    if ($manifest -and $manifest."wallpaper-engine" -and $manifest."wallpaper-engine".file) {
      $wallpath = $manifest."wallpaper-engine".file
      $workshopId = $null
      # If manifest provides a workshop link, extract the numeric id
      if ($manifest."wallpaper-engine".link) {
        $lnk = $manifest."wallpaper-engine".link
        if ($lnk -match 'id=(\d+)') { $workshopId = $Matches[1] }
        elseif ($lnk -match '/([0-9]{6,})') { $workshopId = $Matches[1] }
      }

      # If we have a workshop id, prefer handling via workshop check
      if ($workshopId) {
        # locate Steam 'steamapps' root by walking up from the wallpaper exe if possible
        function Find-SteamAppsRoot($startPath) {
          $p = $startPath
          while ($p -and ($p -ne [System.IO.Path]::GetPathRoot($p))) {
            if ((Split-Path $p -Leaf) -ieq 'steamapps') { return $p }
            $p = Split-Path $p -Parent
          }
          return $null
        }

        $steamAppsRoot = $null
        if ($wpeExe -and (Test-Path $wpeExe)) {
          $candidate = Split-Path -Parent (Split-Path -Parent $wpeExe)
          $steamAppsRoot = Find-SteamAppsRoot $candidate
        }
        # Fallback common locations
        if (-not $steamAppsRoot) {
          $fallbacks = @(
            "$env:ProgramFiles(x86)\Steam\steamapps",
            "$env:ProgramFiles\Steam\steamapps",
            "$env:ProgramFiles(x86)\SteamLibrary\steamapps",
            "$env:ProgramFiles\SteamLibrary\steamapps"
          )
          foreach ($f in $fallbacks) { if (Test-Path $f) { $steamAppsRoot = $f; break } }
        }

        $workshopFound = $false
        $weWorkshopFolder = $null
        # If we have a configured workshop root from settings, prefer that
        if ($weWorkshopRoot) {
          $maybe = Join-Path $weWorkshopRoot "$workshopId"
          if (Test-Path $maybe) { $weWorkshopFolder = $maybe; $workshopFound = $true }
        }
        if (-not $workshopFound -and $steamAppsRoot) {
          $weWorkshopFolder = Join-Path $steamAppsRoot "workshop\content\431960\$workshopId"
          if (Test-Path $weWorkshopFolder) { $workshopFound = $true }
        }

        # user-state to remember 'don't ask again' for a given subtheme
        $userStateDir = Join-Path $root 'user-state'
        if (-not (Test-Path $userStateDir)) { New-Item -Path $userStateDir -ItemType Directory -Force | Out-Null }
        $skipFile = Join-Path $userStateDir "$themeName---$subName---skip-workshop.txt"

        # Check if wallpaper is disabled in manifest
        $wallpaperDisabled = $false
        if ($manifest -and $manifest.'wallpaper-engine' -and ($manifest.'wallpaper-engine'.enabled -eq $false)) {
          $wallpaperDisabled = $true
        }
        # Also check old property for backwards compatibility
        if ($manifest -and $manifest.'skip-provided-wallpaper') {
          $wallpaperDisabled = $true
        }

        # If wallpaper is enabled in manifest but skip file exists, delete the skip file (user manually re-enabled)
        if (-not $wallpaperDisabled -and (Test-Path $skipFile)) {
          Remove-Item $skipFile -Force -ErrorAction SilentlyContinue
          Write-Output "theme:wallpaper: Removed skip file (wallpaper re-enabled in manifest)"
        }

        if (-not $workshopFound) {
          if ($wallpaperDisabled) {
            Write-Output "theme:wallpaper: SKIP (user disabled provided wallpaper)"
            # Close any active Wallpaper Engine wallpapers
            if (Test-Path $wpeExe) {
              try {
                $args = @('-control', 'closeWallpaper')
                Start-Process -FilePath $wpeExe -ArgumentList $args -NoNewWindow -Wait -PassThru -ErrorAction SilentlyContinue | Out-Null
              } catch { }
            }
          }
          elseif (Test-Path $skipFile) {
            Write-Output "theme:wallpaper: SKIP (user skipped)"
          }
          else {
            # emit handshake JSON to GUI so it can prompt and redirect
            $out = @{ 
              needs_workshop = $true
              theme = $themeName
              sub = $subName
              workshop_id = $workshopId
              steam_url = "steam://url/CommunityFilePage/$workshopId"
              steamUrl = "steam://url/CommunityFilePage/$workshopId"
              link = $manifest."wallpaper-engine".link
              theme_select_command = "$themeName/$subName"
            }
            $json = $out | ConvertTo-Json -Compress -Depth 6
            Write-Output $json
            
            # If running from terminal (not GUI), notify existing Electron app or launch it
            if (-not $env:ELECTRON_RUN_AS_NODE) {
              Write-Host "`n[!] Workshop item $workshopId is not installed." -ForegroundColor Yellow
              
              # Write workshop data to a file for Electron to read
              $promptFile = Join-Path $root "workshop-prompt.json"
              Set-Content -Path $promptFile -Value $json -Encoding UTF8 -Force
              
              # Check if Electron app is already running by looking for the process
              $electronProcs = Get-Process electron -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -like "*theme*" -or $_.MainWindowTitle -eq "Default Enhanced" }
              
              if ($electronProcs) {
                Write-Host "    Theme selector is already running. Showing workshop prompt..." -ForegroundColor Cyan
                # The running Electron instance will detect the file via polling or manual refresh
              } else {
                Write-Host "    Launching theme selector to download wallpaper..." -ForegroundColor Cyan
                
                # Launch Electron app via npm start
                $selectorPath = Join-Path $root "selector-app"
                
                try {
                  # Use Start-Process to launch npm start in the background
                  Start-Process -FilePath "powershell" `
                    -ArgumentList "-NoProfile", "-Command", "npm --prefix `"$selectorPath`" start" `
                    -WindowStyle Hidden `
                    -WorkingDirectory $selectorPath
                    
                  Write-Host "    Theme selector opened. Please follow the prompt." -ForegroundColor Green
                } catch {
                  Write-Warning "Failed to launch theme selector: $_"
                  if (Test-Path $promptFile) { Remove-Item $promptFile -Force }
                }
              }
            }
          }
        }
        else {
          # workshop item present — find a JSON project file to open
          if ($wallpaperDisabled) {
            Write-Output "theme:wallpaper: SKIP (user disabled provided wallpaper)"
            # Close any active Wallpaper Engine wallpapers
            if (Test-Path $wpeExe) {
              try {
                $args = @('-control', 'closeWallpaper')
                Start-Process -FilePath $wpeExe -ArgumentList $args -NoNewWindow -Wait -PassThru -ErrorAction SilentlyContinue | Out-Null
              } catch { }
            }
          }
          else {
            $projectJson = Get-ChildItem -Path $weWorkshopFolder -Filter '*.json' -Recurse -File -ErrorAction SilentlyContinue | Select-Object -First 1
            if ($projectJson) {
              $projPath = $projectJson.FullName
              if (-not (Test-Path $wpeExe)) { Write-Warning "Wallpaper Engine executable not found: $wpeExe"; Write-Output "theme:wallpaper: SKIP (no exe)" }
              else {
                try {
                  $args = @('-control', 'openWallpaper', '-file', "$projPath")
                  $p = Start-Process -FilePath $wpeExe -ArgumentList $args -NoNewWindow -Wait -PassThru -ErrorAction Stop
                  $exit = $p.ExitCode
                  if ($exit -eq 0) { Write-Output "theme:wallpaper: OK" } else { Write-Warning "Wallpaper Engine returned $exit" }
                }
                catch {
                  Write-Warning "Failed to run Wallpaper Engine: $_"
                  Write-Output "theme:wallpaper: FAIL"
                }
              }
            }
            else {
              Write-Output "theme:wallpaper: SKIP (no project json)"
            }
          }
        }
      }
      else {
        # legacy behavior: manifest provided a local file path
          # Resolve $subTheme placeholder if present (manifest may use "$subTheme/..." shorthand)
          $subDir = Join-Path $themeDir "sub-themes\$subName"
          if ($wallpath -like '*$subTheme*') {
            $wallpath = $wallpath -replace '\$subTheme', [regex]::Escape($subDir)
          }

          # Allow relative path in sub-theme folder (if still not an existing path)
          if (-not (Test-Path $wallpath)) {
            $rel = Join-Path $subDir $wallpath
            if (Test-Path $rel) { $wallpath = $rel }
          }

          if (Test-Path $wallpath) {
            if (-not (Test-Path $wpeExe)) { Write-Warning "Wallpaper Engine executable not found: $wpeExe"; Write-Output "theme:wallpaper: SKIP (no exe)" }
            else {
              try {
                $args = @('-control', 'openWallpaper', '-file', "$wallpath")
                $p = Start-Process -FilePath $wpeExe -ArgumentList $args -NoNewWindow -Wait -PassThru -ErrorAction Stop
                $exit = $p.ExitCode
                if ($exit -eq 0) { Write-Output "theme:wallpaper: OK" } else { Write-Warning "Wallpaper Engine returned $exit" }
              }
              catch { Write-Warning "Failed to run Wallpaper Engine: $_"; Write-Output "theme:wallpaper: FAIL" }
            }
          }
          else {
            Write-Output "theme:wallpaper: SKIP (missing)"
          }
        }
      }

    # Theme applied successfully
    Write-Output "theme:applied: $themeName/$subName"
  }
  else {
    # No sub-theme: simply copy base style file if present
    if ($baseStylePath -and (Test-Path $baseStylePath)) {
      $tmp = "$targetStyle.tmp.$PID"
      # Read and sanitize the base style before writing, to fix malformed custom-property names
      try {
        $baseContent = Get-Content $baseStylePath -Raw -ErrorAction Stop
      }
      catch { Write-Error "Failed to read base style: $_"; exit 1 }
      $sanitizedBase = [regex]::Replace($baseContent, '(-{3,})([A-Za-z0-9_-]+)', '--$2')
      try { Set-Content -Path $tmp -Value $sanitizedBase -Encoding UTF8 -Force -ErrorAction Stop } catch { Write-Error "Failed to write temp base style: $_"; if (Test-Path $tmp) { Remove-Item $tmp -Force -ErrorAction SilentlyContinue }; exit 1 }
      Move-Item -Path $tmp -Destination $targetStyle -Force
      if (Test-Path $targetStyle) { try { (Get-Item $targetStyle).LastWriteTime = Get-Date } catch {} }
    }

    # Save state for themes without sub-themes
    Set-Content -Path $stateFile -Value $themeName -Encoding UTF8
    if (Test-Path $stateSubFile) { Remove-Item $stateSubFile -Force -ErrorAction SilentlyContinue }
    Write-Output "theme:applied: $themeName"
  }
}

# Now apply according to chosenTheme / chosenSub

# If the chosen theme has sub-themes and none was provided, emit a JSON payload
# so GUI callers can prompt the user to pick a sub-theme.
try {
  $availableSubs = Get-SubThemes $chosenTheme
}
catch {
  $availableSubs = @()
}

if ((-not $chosenSub -or $chosenSub -eq '') -and $availableSubs.Count -gt 0) {
  $out = @{ needs_sub = $true; theme = $chosenTheme; sub_options = $availableSubs }
  $json = $out | ConvertTo-Json -Compress -Depth 4
  Write-Output $json
  exit 0
}

Set-StatusTheme -themeName $chosenTheme -subName $chosenSub

exit 0