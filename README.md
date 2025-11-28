# YASB Theme Selector

**Neon / Pastel theme manager for YASB**
A small theme-selector system for YASB (Yet Another Shell Bar) with a PowerShell script, an Electron selector UI, and theme definitions you can apply to change YASB’s `style.css` root variables and optionally trigger Wallpaper Engine.

Repository: [https://github.com/The-Ico2/yasb-theme](https://github.com/The-Ico2/yasb-theme)

---

## ⚠️ Important — Manual theme install disclaimer

> **Themes must be added manually.** This project does **not** currently support automatically pulling themes from GitHub repositories.
> This is a deliberate limitation for now; **automatic remote theme fetching is an intended feature for a future release.**

Until that feature exists, add themes by editing the `yasb-themes/` folder per the examples in this repo.

---

## Contents

```powershell
theme/
├─ selector-app/         # Electron UI (index.html, renderer.js, main.js)
├─ themes/               # per-theme folders (neon-paradise, pastel-paradise, ...)
├─ theme.ps1             # PowerShell theme switcher script
├─ theme.json            # theme metadata + root variables
└─ README.md             # (you are here)
```

---

## Quick summary — What it does

* `theme.ps1` — list, cycle and apply themes. It writes CSS root variable blocks into YASB’s `style.css` and optionally controls Wallpaper Engine (if defined).
* `selector-app/` — Electron UI to browse themes and preview screenshots; launched by the YASB widget.
* `theme.json` & `themes/` — theme data and image assets.

---

## Install / Usage (short)

From a PowerShell prompt in the `theme/` folder:

* List available themes:

```powershell
powershell -ExecutionPolicy Bypass -File .\theme.ps1 --list
```

* Cycle to the next theme:

```powershell
powershell -ExecutionPolicy Bypass -File .\theme.ps1 --cycle
```

* Switch to a specific theme (interactive selector or CLI):

```powershell
powershell -ExecutionPolicy Bypass -File .\theme.ps1 --select "neon-paradise"
```

* Start the Electron GUI manually (one-time install + start):

```powershell
# install dependencies
npm --prefix "C:\Users\<username>\.config\theme\selector-app" install

# start the selector UI
npm --prefix "C:\Users\<username>\.config\theme\selector-app" start
```

---

## Full Komorebi + YASB integration guide (recommended)

To make sure Komorebi and YASB pick up the same config files and YASB can start Komorebi properly, follow these steps **exactly**.
**Note**: `KOMOREBI_CONFIG_HOME` must be set as a system (machine) environment variable so processes started by the system / other apps see it.

### 1) Install YASB & Komorebi

Install using your preferred installer (winget, chocolatey or manual). Example search:

```powershell
winget search yasb
winget search komorebi
```

Install using the returned IDs or download from project pages if winget packages are unavailable.

### 2) Create the Komorebi config folder

We use the standard config location:

```powershell
C:\Users\<username>\.config\komorebi
```

Create that folder (PowerShell):

```powershell
$dest = Join-Path $env:USERPROFILE ".config\komorebi"
New-Item -Path $dest -ItemType Directory -Force | Out-Null
```

### 3) Move / copy your Komorebi config files

Copy your existing komorebi config files (examples) into the new folder:

```powershell
$src = "C:\path\to\where\your\files\are"   # adjust
$dest = Join-Path $env:USERPROFILE ".config\komorebi"

Copy-Item -Path (Join-Path $src 'applications.json') -Destination $dest -Force
Copy-Item -Path (Join-Path $src 'komorebi.bar.json') -Destination $dest -Force
Copy-Item -Path (Join-Path $src 'komorebi.json') -Destination $dest -Force
```

Verify:

```powershell
Get-ChildItem -Path (Join-Path $env:USERPROFILE ".config\komorebi")
```

> Confirm that `applications.json`, `komorebi.bar.json`, and `komorebi.json` exist in `C:\Users\<username>\.config\komorebi`.

### 4) Set `KOMOREBI_CONFIG_HOME` as a **system** (machine) environment variable

> **Important:** Do **not** set this in a PowerShell profile file (like `Microsoft.PowerShell_profile.ps1`) — YASB does not read shell profile variables. The variable must exist in *System Environment Variables* so GUI apps and services can read it.

**Option A — GUI (recommended for non-dev users):**

1. Press `Win + R`, run `sysdm.cpl`.
2. Go to **Advanced → Environment Variables…**
3. Under **System variables** click **New…**

   * **Variable name:** `KOMOREBI_CONFIG_HOME`
   * **Variable value:** `C:\Users\<username>\.config\komorebi`
4. Click OK → Apply.
5. **Reboot or sign out/in** to ensure system processes see the new variable.

**Option B — PowerShell (elevated) – sets machine variable:**

Open PowerShell **as Administrator** and run:

```powershell
# Replace <username> automatically by $env:USERPROFILE
[Environment]::SetEnvironmentVariable('KOMOREBI_CONFIG_HOME', "$env:USERPROFILE\.config\komorebi", 'Machine')

# Verify machine-level variable
[Environment]::GetEnvironmentVariable('KOMOREBI_CONFIG_HOME', 'Machine')
```

If you prefer `setx` (also requires elevation):

```powershell
setx KOMOREBI_CONFIG_HOME "%USERPROFILE%\.config\komorebi" /M
```

> **Important:** After using `setx` or `[Environment]::SetEnvironmentVariable` you must **sign out and sign back in** or reboot to make the variable visible to all running apps.

### 5) Start Komorebi and test

Start Komorebi the same way YASB will (example):

```powershell
komorebic start --whkd
```

Check logs or output — Komorebi should now use the config at `%USERPROFILE%\.config\komorebi\komorebi.json`.

If it still uses a different config file, check:

* That the system variable `KOMOREBI_CONFIG_HOME` points to the folder you populated.
* That the process launching Komorebi inherits system environment variables (reboot is best).
* If YASB or another launcher runs as a different user or service, ensure the variable is available to that context.

### 6) Configure YASB to call Komorebi

In your `c:\Users\<username>\.config\yasb\config.yaml`, set Komorebi start/stop commands (example):

```yaml
komorebi:
  start_command: "komorebic start --whkd"
  stop_command: "komorebic stop --whkd"
  reload_command: "komorebic stop --whkd && komorebic start --whkd"
```

No path to `komorebi.json` is required when `KOMOREBI_CONFIG_HOME` is set — Komorebi should pick it up automatically.

---

## `theme_switcher` YASB widget (example & explanation)

Add this widget to your YASB config (`config.yaml`) under `widgets:` and add it to your `bars:` widgets list.

```yaml
theme_switcher:
  type: "yasb.custom.CustomWidget"
  options:
    label: "\ue7fe"        # icon glyph (use your icon font)
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

* **Left click:** cycle theme (uses `theme.ps1 --cycle`)
* **Middle click:** toggle the label between icon and theme name
* **Right click:** open the Electron selector UI (starts `npm start` for `selector-app`)

> Tip: replace `C:\Users\<username>\.config\theme\...` with the actual path on your machine.

---

## `theme.ps1` notes

* `theme.ps1` writes CSS variable blocks into your YASB stylesheet (e.g. `C:\Users\<username>\.config\yasb\style.css` or `styles.css` depending on your setup).
* Ensure your `config.yaml` for YASB has `watch_stylesheet: true` so YASB picks up live changes.

---

## Theme JSON structure (example)

Top-level `theme.json` structure:

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
  },

  "pastel-paradise": {
    "root-variables": {
      "bg-dark": "#1a1a2e",
      "accent1": "#e0aaff",
      "accent2": "#aafff4",
      "accent3": "#ffb3e6",
      "text-main": "#f0f0f8"
    },
    "wallpaper-engine": {},
    "preview-img": ["1.png"]
  }
}
```

`root-variables` maps CSS root token names **without the leading `--`** (the script will prepend `--` when writing to the stylesheet).

---

## Electron selector (`selector-app`) — usage & notes

To run the GUI:

```powershell
npm --prefix "C:\Users\<username>\.config\theme\selector-app" install
npm --prefix "C:\Users\<username>\.config\theme\selector-app" start
```

The widget `on_right` callback uses `npm --prefix ... start` to launch the app. You can change that to a packaged Electron binary if you ship one.

---

## Scrollbar / Visual polish & theme assets

* Themes include preview screenshots in `themes/<theme>/preview-img/`. The Electron selector shows them in the UI.
* You must provide images used by `preview-img` in the theme folder — the script & selector look for these locally.
* You can include Wallpaper Engine data in `wallpaper-engine` blocks; `theme.ps1` will attempt to apply or install the wallpaper if possible.

---

## Troubleshooting

**YASB doesn’t pick up theme changes**

* Ensure `style.css` path in `theme.ps1` matches your YASB install (e.g. `C:\Users\<username>\.config\yasb\style.css`).
* Ensure `watch_stylesheet: true` in `c:\Users\<username>\.config\yasb\config.yaml`.
* If YASB was started before you set `KOMOREBI_CONFIG_HOME` or after you changed environment variables, **restart YASB** and/or **log out/in**.

**Komorebi loads the wrong config**

* Verify the system environment variable is set and points to the intended folder:

  ```powershell
  [Environment]::GetEnvironmentVariable('KOMOREBI_CONFIG_HOME', 'Machine')
  ```

* If you used `setx`, open a new session, or sign out & back in, or reboot.

**`theme.ps1` errors when applying wallpaper**

* Confirm Wallpaper Engine path in `theme.ps1` matches your install.
* The script will warn if the wallpaper file is missing; you must supply or configure the wallpaper asset.

---

## Advanced — automation script (optional)

If you want, I can include a one-shot PowerShell script that:

* Creates `C:\Users\<username>\.config\komorebi`,
* Copies supplied Komorebi config files to it,
* Sets `KOMOREBI_CONFIG_HOME` as a machine environment variable (requires elevation),
* Restarts a given process or notifies you to log off.

Tell me if you'd like that and I’ll add it to the repo.

---

## Credits

* Project: The-Ico2 / YASB Theme Selector — [https://github.com/The-Ico2/yasb-theme](https://github.com/The-Ico2/yasb-theme)
* Core contributors and authors: see `meta` files embedded in themes (displayed in the Electron UI).

---

## Contributing

* Add themes manually: create a folder in `yasb-themes/` and add a `meta.json` and preview images; or add entries to `theme.json`.
* Submit PRs for the Electron UI improvements, scripts, or new themes.
* If you want remote theme fetching (GitHub pull), open an issue — it’s a planned future feature.
