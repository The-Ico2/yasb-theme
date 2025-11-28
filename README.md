# YASB Theme Selector

⚠️ **Disclaimer — Manual Theme Installation Required**

> **Themes must be added manually.** This project does **not** currently support automatically pulling themes from GitHub repositories.  
> Automatic remote theme fetching is planned for a future release. Until then, add themes by editing the `yasb-themes/` folder per the examples in this repo.

---

## Table of Contents

1. [Overview](#overview)  
2. [Folder Structure](#folder-structure)  
3. [Quick Usage](#quick-usage)  
4. [Komorebi + YASB Integration](#komorebi--yasb-integration)  
   - [1) Install YASB & Komorebi](#1-install-yasb--komorebi)  
   - [2) Create the Komorebi Config Folder](#2-create-the-komorebi-config-folder)  
   - [3) Move / Copy Komorebi Config Files](#3-move--copy-komorebi-config-files)  
   - [4) Set KOMOREBI_CONFIG_HOME System Variable](#4-set-komorebi_config_home-system-variable)  
   - [5) Start Komorebi and Test](#5-start-komorebi-and-test)  
   - [6) Configure YASB to Call Komorebi](#6-configure-yasb-to-call-komorebi)  
5. [Theme Switcher YASB Widget](#theme-switcher-yasb-widget)  
6. [theme.ps1 Notes](#themepowershell-notes)  
7. [Theme JSON Structure](#theme-json-structure)  
8. [Electron Selector UI (`selector-app`)](#electron-selector-uiselector-app)  
9. [Scrollbars, Visuals, and Theme Assets](#scrollbars-visuals-and-theme-assets)  
10. [Troubleshooting](#troubleshooting)  
11. [Advanced: Automation Script](#advanced-automation-script)  
12. [Credits](#credits)  
13. [Contributing](#contributing)  
14. [Environment Variables (Windows)](#environment-variables-windows)

---

## Overview

**YASB Theme Manager** is a lightweight system for managing and applying themes to **YASB (Yet Another Status Bar)**.  
It includes:

- A **PowerShell script** to list, cycle, and apply themes.
- An **Electron GUI selector** to preview and select themes.
- Theme definitions that modify YASB’s `style.css` root variables and optionally control Wallpaper Engine.

---

## Folder Structure

```powershell
theme/
├─ selector-app/         # Electron UI (index.html, renderer.js, main.js)
├─ themes/               # per-theme folders (neon-paradise, pastel-paradise, ...)
├─ theme.ps1             # PowerShell theme switcher script
├─ theme.json            # theme metadata + root variables
└─ README.md             # (this file)
````

---

## Quick Usage

From PowerShell in the `theme/` folder:

- **List available themes:**

```powershell
powershell -ExecutionPolicy Bypass -File .\theme.ps1 --list
```

- **Cycle to the next theme:**

```powershell
powershell -ExecutionPolicy Bypass -File .\theme.ps1 --cycle
```

- **Select a specific theme:**

```powershell
powershell -ExecutionPolicy Bypass -File .\theme.ps1 --select "neon-paradise"
```

- **Run the Electron GUI manually:**

```powershell
# Install dependencies
npm --prefix "C:\Users\<username>\.config\theme\selector-app" install

# Start the selector UI
npm --prefix "C:\Users\<username>\.config\theme\selector-app" start
```

---

## Komorebi + YASB Integration

To ensure YASB and Komorebi use the same configs, follow **these steps carefully**.

> **Important:** `KOMOREBI_CONFIG_HOME` must be set as a **system (machine) environment variable**.

### 1) Install YASB & Komorebi

Install using `winget`, Chocolatey, or manual installer:

```powershell
winget search yasb
winget search komorebi
```

Install using the package IDs or official project pages if unavailable.

---

### 2) Create the Komorebi Config Folder

Standard folder:

```powershell
C:\Users\<username>\.config\komorebi
```

Create via PowerShell:

```powershell
$dest = Join-Path $env:USERPROFILE ".config\komorebi"
New-Item -Path $dest -ItemType Directory -Force | Out-Null
```

---

### 3) Move / Copy Komorebi Config Files

```powershell
$src = "C:\path\to\your\files"   # adjust
$dest = Join-Path $env:USERPROFILE ".config\komorebi"

Copy-Item -Path (Join-Path $src 'applications.json') -Destination $dest -Force
Copy-Item -Path (Join-Path $src 'komorebi.bar.json') -Destination $dest -Force
Copy-Item -Path (Join-Path $src 'komorebi.json') -Destination $dest -Force
```

Verify:

```powershell
Get-ChildItem -Path (Join-Path $env:USERPROFILE ".config\komorebi")
```

> Confirm `applications.json`, `komorebi.bar.json`, and `komorebi.json` exist.

---

### 4) Set `KOMOREBI_CONFIG_HOME` System Variable

> **Do not use a PowerShell profile variable.** YASB cannot detect it there. Set it as a **Machine Environment Variable**.

**GUI (recommended):**

1. `Win + R` → `sysdm.cpl` → Advanced → Environment Variables.
2. **System Variables → New**
   - Name: `KOMOREBI_CONFIG_HOME`
   - Value: `C:\Users\<username>\.config\komorebi`
3. Apply → **Sign out and back in** (or reboot).

**PowerShell (elevated):**

```powershell
# Administrator required
[Environment]::SetEnvironmentVariable('KOMOREBI_CONFIG_HOME', "$env:USERPROFILE\.config\komorebi", 'Machine')
[Environment]::GetEnvironmentVariable('KOMOREBI_CONFIG_HOME', 'Machine')
```

Or using `setx`:

```powershell
setx KOMOREBI_CONFIG_HOME "%USERPROFILE%\.config\komorebi" /M
```

> Log out and back in to ensure apps see the new value.

---

### 5) Start Komorebi

```powershell
komorebic start --whkd
# or
komorebi --start
```

Check logs: Komorebi should read configs from `%USERPROFILE%\.config\komorebi`.

---

### 6) Configure YASB to Call Komorebi

In `c:\Users\<username>\.config\yasb\config.yaml`:

```yaml
komorebi:
  start_command: "komorebic start --whkd"
  stop_command: "komorebic stop --whkd"
  reload_command: "komorebic stop --whkd && komorebic start --whkd"
```

> With `KOMOREBI_CONFIG_HOME` set, no explicit path is required.

---

## Theme Switcher YASB Widget

Add to your YASB `config.yaml`:

```yaml
theme_switcher:
  type: "yasb.custom.CustomWidget"
  options:
    label: "\ue7fe"        
    label_alt: "Switch Theme"
    class_name: "theme-switcher-widget"
    exec_options:
      run_cmd: 'powershell -ExecutionPolicy Bypass -File "C:\\Users\\<username>\\.config\\theme\\theme.ps1" --cycle'
      run_interval: 0
      hide_empty: false
    callbacks:
      on_left: 'exec powershell -ExecutionPolicy Bypass -File "C:\\Users\\<username>\\.config\\theme\\theme.ps1" --cycle'
      on_middle: "toggle_label"
      on_right: 'exec npm --prefix "C:\\Users\\<username>\\.config\\theme\\selector-app" start'
```

- **Left click:** Cycle theme
- **Middle click:** Toggle label
- **Right click:** Launch Electron selector UI

---

## theme.ps1 Notes

- Writes CSS root variable blocks to YASB’s `style.css`.
- Can optionally control Wallpaper Engine (`wallpaper-engine` entries in theme JSON).
- Ensure `watch_stylesheet: true` in `config.yaml`.

---

## Theme JSON Structure

```json
{
  "neon-paradise": {
    "root-variables": {
      "bg-dark": "#070712",
      "accent1": "#bc13fe",
      "accent2": "#00dfff",
      "accent3": "#ff67c6",
      "text-main": "#e6e6ff"
    },
    "wallpaper-engine": {
      "file": "C:\\path\\to\\wallpaper.wpl"
    },
    "preview-img": ["1.png", "2.png"]
  }
}
```

> `root-variables` maps CSS token names without the leading `--`.

---

## Electron Selector UI (`selector-app`)

```powershell
npm --prefix "C:\Users\<username>\.config\theme\selector-app" install
npm --prefix "C:\Users\<username>\.config\theme\selector-app" start
```

---

## Scrollbars, Visuals & Theme Assets

- Previews in `themes/<theme>/preview-img/`
- Provide images locally for the script & Electron UI
- Wallpaper Engine integration optional

---

## Troubleshooting

- **YASB not picking up themes:**
  Check `style.css` path and `watch_stylesheet: true`.

- **Komorebi loads wrong config:**
  Verify `KOMOREBI_CONFIG_HOME` points to correct folder. Reboot if necessary.

- **Wallpaper errors:**
  Confirm Wallpaper Engine path and files.

---

## Contributing

- Add themes manually via `yasb-themes/`
- PRs welcome for UI improvements, scripts, or new themes.
- GitHub remote fetching is planned for future releases.

---

## Environment Variables (Windows)

Set as **System / Machine variables**:

```powershell
# Example paths
[Environment]::SetEnvironmentVariable('YASB_THEME_MANAGER', "$env:USERPROFILE\.config\yasb-theme-manager", 'Machine')
[Environment]::SetEnvironmentVariable('KOMOREBI_CONFIG_HOME', "$env:USERPROFILE\.config\komorebi", 'Machine')
```

Verify:

```powershell
[Environment]::GetEnvironmentVariable('YASB_THEME_MANAGER', 'Machine')
[Environment]::GetEnvironmentVariable('KOMOREBI_CONFIG_HOME', 'Machine')
```

> Log out and back in to apply for all running apps.
