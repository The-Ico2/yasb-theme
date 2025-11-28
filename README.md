YASB Theme Selector
====================

This folder contains a small theme selector and helper script for YASB.

Files

- `theme.ps1` - PowerShell script to list, select, and cycle themes and write CSS variables to YASB stylesheet.
- `themes.json` - Theme definitions (root variables, optional wallpaper-engine entry).
- `selector-app/` - Electron-based GUI for browsing and applying themes.

Usage

From PowerShell (in this folder):

- List available themes:

```powershell
powershell -ExecutionPolicy Bypass -File .\theme.ps1 --list
```

- Cycle to the next theme:

```powershell
powershell -ExecutionPolicy Bypass -File .\theme.ps1 --cycle
```

- Select a specific theme:

```powershell
powershell -ExecutionPolicy Bypass -File .\theme.ps1 --select "theme-name"
```

- Verbose output for troubleshooting:

```powershell
powershell -ExecutionPolicy Bypass -File .\theme.ps1 --select "theme-name" --verbose
```

Integration with YASB

- The `theme_switcher` widget has been wired to call the cycle command on left-click. The widget's right-click will attempt to open the Electron selector UI.
- If you move the theme folder, update `C:\Users\Xande\.config\yasb\config.yaml` to point at the correct path for `theme.ps1` and/or change the `npm --prefix` path.

Selector App

- To run the GUI selector manually (requires Node/NPM and electron installed):

```powershell
npm --prefix "C:\Users\Xande\.config\theme\selector-app" install
npm --prefix "C:\Users\Xande\.config\theme\selector-app" start
```

Notes

- `theme.ps1` writes CSS variables to `C:\Users\Xande\.config\yasb\styles.css`.
- Wallpaper Engine support will attempt to call wallpaper64.exe; change the path in `theme.ps1` if your install is elsewhere.
- If YASB doesn't pick up changes immediately, ensure `watch_stylesheet` is `true` in your YASB config (`c:\Users\Xande\.config\yasb\config.yaml`).

Extending

- Add new themes to `themes.json`. Each top-level property name is the theme identifier.
- For each theme add `root-variables` mapping with CSS variable names (without the leading `--`).

Examples

```json
{
  "my-theme": {
    "root-variables": {
      "bg-dark": "#101010",
      "accent1": "#ff00ff"
    },
    "wallpaper-engine": {
      "file": "C:\\path\\to\\wallpaper.wpl"
    }
  }
}
```

## **Setup**

Follow these steps to install YASB and Komorebi via `winget`, set the required system environment variable for Komorebi config, move the Komorebi config files into the appropriate folder under `%USERPROFILE%\.config\komorebi`, and start Komorebi for the first time.

**Install via winget (search then install)**:

- Search for the packages (replace names/IDs with the ones you choose from the search results):

```powershell
winget search yasb
winget search komorebi
```

- Install the packages (replace `<YASB.Id>` and `<Komorebi.Id>` with the package IDs returned by `winget search` — `-e` locks to exact id):

```powershell
# install YASB (example)
winget install --id <YASB.Id> -e

# install Komorebi (example)
winget install --id <Komorebi.Id> -e
```

If `winget` does not have exact package IDs for your preferred builds, download/install using the official project pages.

**Set `KOMOREBI_CONFIG_HOME` as a system environment variable**

Komorebi expects a system environment variable (not just a shell profile) so YASB can locate the Komorebi config folder. You must run these commands in an elevated PowerShell (Run as Administrator).

PowerShell (set machine-scoped variable):

```powershell
# Set KOMOREBI_CONFIG_HOME to %USERPROFILE%\.config\komorebi (machine-level)
[Environment]::SetEnvironmentVariable('KOMOREBI_CONFIG_HOME', "$env:USERPROFILE\\.config\\komorebi", 'Machine')

# Verify
Get-ChildItem Env:KOMOREBI_CONFIG_HOME
```

Or using the legacy `setx` (also requires elevation):

```powershell
setx KOMOREBI_CONFIG_HOME "%USERPROFILE%\.config\komorebi" /M
```

After setting a machine environment variable you should either sign out and sign back in, or restart the machine for all processes to see the new value. New PowerShell windows will not pick up a machine variable set by `setx` until you open a new shell.

**Move existing Komorebi config files into the new folder**

Create the folder and move your files (these are the names you mentioned): `applications.json`, `komorebi.bar.json`, `komorebi.json`.

```powershell
$dest = Join-Path $env:USERPROFILE ".config\komorebi"
New-Item -Path $dest -ItemType Directory -Force

# Backup and move files (adjust source paths if your files are elsewhere)
Copy-Item -Path .\applications.json -Destination $dest -Force
Copy-Item -Path .\komorebi.bar.json -Destination $dest -Force
Copy-Item -Path .\komorebi.json -Destination $dest -Force

# Optionally remove originals after verifying the copies
# Remove-Item -Path .\applications.json, .\komorebi.bar.json, .\komorebi.json
```

Make sure the files are present at the exact path defined by `KOMOREBI_CONFIG_HOME`, for example:

```
C:\Users\<username>\.config\komorebi\applications.json
C:\Users\<username>\.config\komorebi\komorebi.bar.json
C:\Users\<username>\.config\komorebi\komorebi.json
```

**Quick Start: create/initialize Komorebi configs and start Komorebi**

Many Komorebi builds create default config files on first run if they are missing. To initialize and start Komorebi (example commands used across YASB configs in this repo):

```powershell
# Start Komorebi (daemon/WM integration). Adjust flags for your build if required.
komorebic start --whkd

# Or the simpler command some builds use:
komorebi --start

# To stop:
komorebic stop --whkd
```

If your Komorebi executable has a different name, consult its documentation; the important piece is that when Komorebi starts it will look for the folder specified by `KOMOREBI_CONFIG_HOME` to read and write its `komorebi.json` files.

**Verify YASB integration**

- Ensure `KOMOREBI_CONFIG_HOME` points to the folder where the three config files live.
- Ensure your YASB `config.yaml` points to the `komorebi` commands you will use (see the `komorebi` section in `c:\Users\Xande\.config\yasb\config.yaml`).
- Restart YASB or ensure `watch_config`/`watch_stylesheet` are enabled so changes are picked up.

If you want, I can add a short script to automate creating the `.config\komorebi` folder, moving files, and setting the environment variable (requires elevation). Would you like that? 
