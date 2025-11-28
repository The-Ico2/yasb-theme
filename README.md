# YASB Theme Manager

⚠️ **Disclaimer — Manual Theme Installation Required**

> **Themes must be added manually.** This project does **not** currently support automatically pulling themes from GitHub repositories.  
> Automatic remote theme fetching is planned for a future release. Until then, add themes by editing the `yasb-themes/` folder per the examples in this repo.

---

## Table of Contents

1. [Overview](#overview)  
2. [Folder Structure](#folder-structure)
3. [Installation](#installation)
5. [Quick Usage](#quick-usage)  
6. [Theme JSON Structure](#theme-json-structure)  
7. [Troubleshooting](#troubleshooting)  
8. [Contributing](#contributing)
9. [Credits](#credits)

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
## Installation
---


# YASB + Komorebi Installation Guide (Windows)

This guide walks you through installing **YASB** and **Komorebi**, setting up configuration folders, and creating system environment variables required for proper integration.

---

## Step 1: Install YASB and Komorebi

You can use **winget**.

Install YASB First

```powershell
winget install --id AmN.yasb
```
Now Install Komorebi + WHKD

```powershell
winget install LGUG2Z.komorebi
winget install LGUG2Z.whkd
```

> If winget packages are unavailable, download from the official project pages.

---

## Step 2: Create Configuration Folders

### Komorebi Config Folder

Standard location:

```powershell
C:\Users\<username>\.config\komorebi
```

Create the folder via PowerShell:

```powershell
$komorebiConfig = Join-Path $env:USERPROFILE ".config\komorebi"
New-Item -Path $komorebiConfig -ItemType Directory -Force | Out-Null
```

### YASB Theme Manager Folder

Recommended location:

```
C:\Users\<username>\.config\yasb-theme-manager
```

Create folder:

```powershell
$yasbThemeManager = Join-Path $env:USERPROFILE ".config\yasb-theme-manager"
New-Item -Path $yasbThemeManager -ItemType Directory -Force | Out-Null
```

---

## Step 3: Move / Copy Configuration Files

Move your existing **Komorebi config files**:

```powershell
$src = "C:\path\to\your\komorebi\files"  # adjust to your source (Typically located at 'C:/Users/<username>/')
Copy-Item -Path (Join-Path $src 'applications.json') -Destination $komorebiConfig -Force
Copy-Item -Path (Join-Path $src 'komorebi.bar.json') -Destination $komorebiConfig -Force
Copy-Item -Path (Join-Path $src 'komorebi.json') -Destination $komorebiConfig -Force
```

> Verify files exist:

```powershell
Get-ChildItem -Path $komorebiConfig
```

---

## Step 4: Set System Environment Variables

> These must be **System / Machine environment variables**, not PowerShell profile variables.

Points to your Komorebi and Yasb Theme Manager folders.

```powershell
setx KOMOREBI_CONFIG_HOME "%USERPROFILE%\.config\komorebi" /M
setx YASB_THEME_MANAGER "%USERPROFILE%\.config\yasb-theme-manager" /M
```
> **Important:** Sign out and sign back in (or reboot) so GUI apps and services can see the new variables.

---

## Step 5: Verify 'komorebi.json' path

Start Komorebi using your usual command (adjust executable name if needed):

```powershell
komorebic configuration
```

Check that it reads configs from:

```
C:\Users\<username>\.config\komorebi\komorebi.json
```

---

## Step 6: Configure YASB to Call Komorebi

In `C:\Users\<username>\.config\yasb\config.yaml`:

```yaml
# This should be set by default
komorebi:
  start_command: "komorebic start --whkd"
  stop_command: "komorebic stop --whkd"
  reload_command: "komorebic stop --whkd && komorebic start --whkd"
```

> With `KOMOREBI_CONFIG_HOME` set, no explicit config path is needed.

---

## Step 7: Add Theme Switcher Widget to YASB

Widget configuration for `config.yaml`:

```yaml
theme_switcher:
  type: "yasb.custom.CustomWidget"
  options:
    label: "\ue7fe"
    label_alt: "Switch Theme"
    class_name: "theme-switcher-widget"
    exec_options:
      run_cmd: 'powershell -ExecutionPolicy Bypass -File "${env:YASB_THEME_MANAGER}/theme.ps1" --cycle'
      run_interval: 0
      hide_empty: false
    callbacks:
      on_left: 'exec powershell -ExecutionPolicy Bypass -File "${env:YASB_THEME_MANAGER}/theme.ps1" --cycle'
      on_middle: "toggle_label"
      on_right: 'exec npm.cmd --prefix "${env:YASB_THEME_MANAGER}/selector-app" start'
```

---

✅ After completing these steps, **YASB and Komorebi** should be fully integrated, using the correct configuration folders, and the theme switcher will work with your PowerShell and Electron-based UI.

---

## Quick Usage

- **Run the Electron GUI manually:**

```powershell
# Install dependencies
npm --prefix "C:\Users\<username>\.config\theme\selector-app" install

# Start the selector UI
npm --prefix "C:\Users\<username>\.config\theme\selector-app" start
```

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
      // this section has been added but does not do anything yet
    },
    "preview-img": ["1.png", "2.png"]
  }
}
```

> `root-variables` maps CSS token names without the leading `--`.

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

## Credits
- [Komorebi Repo](https://github.com/LGUG2Z/komorebi)
- [YASB Repo](https://github.com/amnweb/yasb)
