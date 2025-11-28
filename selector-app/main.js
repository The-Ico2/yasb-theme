const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const { pathToFileURL } = require('url');

function createWindow() {
  const win = new BrowserWindow({
    width: 600,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });
  // Remove the default application menu (File/Edit/View/Window/Help)
  try { Menu.setApplicationMenu(null); } catch (e) { console.warn('Failed to remove app menu', e); }

  // Hide the menu bar on Windows/Linux so Alt won't reveal the menu unexpectedly
  try { win.setMenuBarVisibility(false); win.setAutoHideMenuBar(true); } catch (e) {}
  win.loadFile('index.html');
}

app.whenReady().then(createWindow);

// Startup diagnostics
console.log('Selector-app main starting');
console.log('process.cwd():', process.cwd());
console.log('__dirname:', __dirname);
console.log('process.execPath:', process.execPath);

// IPC handler: when renderer asks to apply a theme
ipcMain.handle('apply-theme', async (event, themeName) => {
  const psPath = path.join(__dirname, '..', 'theme.ps1');
  // use --select to pick a specific theme
  const cmd = `powershell -ExecutionPolicy Bypass -File "${psPath}" --select "${themeName}"`;
  return new Promise((resolve, reject) => {
    exec(cmd, (error, stdout, stderr) => {
      // try to parse special JSON response indicating sub-theme selection required
      try {
        const trimmed = stdout && stdout.trim();
        if (trimmed && trimmed.startsWith('{') && trimmed.includes('needs_sub')) {
          const parsed = JSON.parse(trimmed);
          resolve(parsed);
          return;
        }
      } catch (e) {
        // ignore parse errors
      }

      if (error) {
        reject(stderr || error.message);
      } else {
        resolve({ ok: true, output: stdout });
      }
    });
  });
});

ipcMain.handle('cycle-theme', async () => {
  const psPath = path.join(__dirname, '..', 'theme.ps1');
  const cmd = `powershell -ExecutionPolicy Bypass -File "${psPath}" --cycle`;
  return new Promise((resolve, reject) => {
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        reject(stderr || error.message);
      } else {
        resolve(stdout);
      }
    });
  });
});

// Discover themes by scanning both legacy `themes/` and `yasb-themes/*/sub-themes/*`
ipcMain.handle('get-themes', async () => {
  try {
    const themesDir = path.join(__dirname, '..', 'themes');
    const yasbThemesDir = path.join(__dirname, '..', 'yasb-themes');
    console.debug('get-themes: scanning', themesDir, yasbThemesDir);
    const out = {};

    // legacy themes folder
    if (fs.existsSync(themesDir)) {
      const items = fs.readdirSync(themesDir, { withFileTypes: true });
      for (const it of items) {
        if (it.isDirectory()) {
          const manifestPath = path.join(themesDir, it.name, 'manifest.json');
          if (fs.existsSync(manifestPath)) {
            try {
              const raw = fs.readFileSync(manifestPath, 'utf8');
              const parsed = JSON.parse(raw);
              parsed.__basePath = path.join(themesDir, it.name);
              out[it.name] = parsed;
            } catch (e) {
              out[it.name] = { error: `manifest parse error: ${e.message}` };
            }
          }
        }
      }
    }

    // new yasb-themes structure: list each top-level theme (don't expose sub-themes here)
    if (fs.existsSync(yasbThemesDir)) {
      const themeFolders = fs.readdirSync(yasbThemesDir, { withFileTypes: true });
      for (const t of themeFolders) {
        if (!t.isDirectory()) continue;
        const themeRoot = path.join(yasbThemesDir, t.name);
        const manifestPath = path.join(themeRoot, 'manifest.json');
        if (fs.existsSync(manifestPath)) {
          try {
            const raw = fs.readFileSync(manifestPath, 'utf8');
            const parsed = JSON.parse(raw);
            parsed.__basePath = themeRoot;
            out[t.name] = parsed;
          } catch (e) {
            out[t.name] = { error: `manifest parse error: ${e.message}` };
          }
        } else {
          // if a top-level meta.json exists, prefer it for card metadata
          const metaPath = path.join(themeRoot, 'meta.json');
          if (fs.existsSync(metaPath)) {
            try {
              const metaRaw = fs.readFileSync(metaPath, 'utf8');
              const metaParsed = JSON.parse(metaRaw);
              // wrap into a manifest-like structure expected by renderer
              const shaped = { meta: {} };
              // possible fields in meta.json: name, authors, version, short-description, long-description, repository, tags
              if (metaParsed.name) shaped.meta.name = metaParsed.name;
              if (metaParsed['short-description']) { shaped.meta['short-description'] = metaParsed['short-description']; shaped.meta.description = metaParsed['short-description']; }
              if (metaParsed['long-description']) { shaped.meta['long-description'] = metaParsed['long-description']; if (!shaped.meta.description) shaped.meta.description = metaParsed['long-description']; }
              if (metaParsed.version) shaped.meta.version = metaParsed.version;
              if (metaParsed.repository) shaped.meta.repository = metaParsed.repository;
              if (metaParsed.tags) shaped.meta.tags = metaParsed.tags;
              if (metaParsed.authors) shaped.meta.authors = metaParsed.authors;
              shaped.__basePath = themeRoot;
              out[t.name] = shaped;
              continue;
            } catch (e) {
              // fall through to try representative sub-manifest
            }
          }
            // no top-level manifest => try to read a representative sub-theme manifest for metadata
            const subRoot = path.join(themeRoot, 'sub-themes');
            if (fs.existsSync(subRoot)) {
              const subs = fs.readdirSync(subRoot, { withFileTypes: true }).filter(d => d.isDirectory());
              if (subs.length > 0) {
                const first = subs[0].name;
                const repManifest = path.join(subRoot, first, 'manifest.json');
                if (fs.existsSync(repManifest)) {
                  try {
                    const raw = fs.readFileSync(repManifest, 'utf8');
                    const parsed = JSON.parse(raw);
                    parsed.__basePath = themeRoot;
                    parsed.__repSub = first;
                    out[t.name] = parsed;
                  } catch (e) {
                    out[t.name] = { meta: { name: t.name }, __basePath: themeRoot };
                  }
                } else {
                  out[t.name] = { meta: { name: t.name }, __basePath: themeRoot };
                }
              } else {
                out[t.name] = { meta: { name: t.name }, __basePath: themeRoot };
              }
            } else {
              out[t.name] = { meta: { name: t.name }, __basePath: themeRoot };
            }
        }
      }
    }

    return out;
  } catch (e) {
    return { error: e.message };
  }
});

ipcMain.handle('get-preview-paths', async (event, themeName) => {
  try {
    const yasbThemesDir = path.join(__dirname, '..', 'yasb-themes');
    const legacyBase = path.join(__dirname, '..', 'themes');

    let base = null;
    let manifestPath = null;

    // support keys like 'theme/sub' or 'theme:sub'
    let themeKey = themeName;
    let theme = themeName;
    let sub = null;
    if (themeName.includes('/') || themeName.includes(':')) {
      const parts = themeName.includes('/') ? themeName.split('/') : themeName.split(':');
      theme = parts[0]; sub = parts[1];
    }

    // Strict behavior:
    // - If a sub-theme was requested (theme/sub), return ONLY a generated palette from that sub-theme's root-variables (no images).
    // - If no sub requested (major theme), return ONLY the images found in yasb-themes/<theme>/preview/ (if present), and nothing else.
    if (sub) {
      // sub-theme requested: load its manifest and generate palette
      const subManifestPath = path.join(yasbThemesDir, theme, 'sub-themes', sub, 'manifest.json');
      if (!fs.existsSync(subManifestPath)) return [];
      try {
        const raw = fs.readFileSync(subManifestPath, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && parsed['root-variables']) {
          const vars = parsed['root-variables'];
          const cols = [];
          for (const k of Object.keys(vars)) {
            const v = vars[k]; if (!v) continue; const s = String(v).trim(); if (/^#|^rgb|^hsl/i.test(s)) cols.push(s);
            if (cols.length >= 6) break;
          }
          if (cols.length) {
            const w = 240, h = 48, sw = Math.floor(w / cols.length);
            let rects = '';
            for (let i = 0; i < cols.length; i++) { const x = i * sw; rects += `<rect x="${x}" y="0" width="${sw}" height="${h}" fill="${cols[i]}"/>`; }
            const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}'>${rects}</svg>`;
            return [`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`];
          }
        }
      } catch (e) { return []; }
      return [];
    } else {
      // major theme requested: return only files in yasb-themes/<theme>/preview
      const majorPreviewDir = path.join(yasbThemesDir, theme, 'preview');
      if (!fs.existsSync(majorPreviewDir)) return [];
      const out = [];
      const files = fs.readdirSync(majorPreviewDir, { withFileTypes: true }).filter(f => f.isFile());
      for (const f of files) {
        const chosen = path.join(majorPreviewDir, f.name);
        try {
          const buf = fs.readFileSync(chosen);
          const ext = path.extname(chosen).toLowerCase();
          let mime = 'application/octet-stream';
          if (ext === '.png') mime = 'image/png';
          else if (ext === '.jpg' || ext === '.jpeg') mime = 'image/jpeg';
          else if (ext === '.webp') mime = 'image/webp';
          else if (ext === '.gif') mime = 'image/gif';
          const dataUrl = `data:${mime};base64,${buf.toString('base64')}`;
          out.push(dataUrl);
        } catch (e) {
          out.push(pathToFileURL(chosen).href);
        }
      }
      return out;
    }
  } catch (e) {
    return [];
  }
});

// Simple ping for diagnostics — returns some runtime info
ipcMain.handle('ping', async () => {
  try {
    console.log('get ping from renderer — main alive');
    return { ok: true, cwd: process.cwd(), dirname: __dirname };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// Open a theme's page.html in a new window. Expects the theme folder to contain page.html.
ipcMain.handle('open-theme-page', async (event, themeName) => {
  try {
    const yasbThemesDir = path.join(__dirname, '..', 'yasb-themes');
    const legacyBase = path.join(__dirname, '..', 'themes');

    // support theme/sub
    let theme = themeName;
    let sub = null;
    if (themeName.includes('/') || themeName.includes(':')) {
      const parts = themeName.includes('/') ? themeName.split('/') : themeName.split(':');
      theme = parts[0]; sub = parts[1];
    }

    let pagePath = null;
    if (sub) {
      pagePath = path.join(yasbThemesDir, theme, 'sub-themes', sub, 'page.html');
    } else {
      const legacy = path.join(legacyBase, theme, 'page.html');
      const yasbRoot = path.join(yasbThemesDir, theme, 'page.html');
      if (fs.existsSync(legacy)) pagePath = legacy;
      else if (fs.existsSync(yasbRoot)) pagePath = yasbRoot;
      else {
        // if multiple subs exist, prefer opening the theme folder page if present
        const subRoot = path.join(yasbThemesDir, theme, 'sub-themes');
        if (fs.existsSync(subRoot)) {
          const subs = fs.readdirSync(subRoot, { withFileTypes: true }).filter(d=>d.isDirectory());
          if (subs.length === 1) {
            pagePath = path.join(subRoot, subs[0].name, 'page.html');
            themeName = `${theme}/${subs[0].name}`;
          }
        }
      }
    }

    if (!pagePath || !fs.existsSync(pagePath)) return { error: 'page.html not found' };
    // Try to load the theme page into the already-open selector window (focused),
    // falling back to creating a new window if none available.
    const target = BrowserWindow.getFocusedWindow() || (BrowserWindow.getAllWindows().length ? BrowserWindow.getAllWindows()[0] : null);
    if (target) {
      await target.loadFile(pagePath, { query: { theme: themeName } });
      return { ok: true, reusedWindow: true };
    }
    // fallback: create a new window (rare)
    const newWin = new BrowserWindow({
      width: 1200,
      height: 800,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.js')
      }
    });
    try { Menu.setApplicationMenu(null); } catch (e) {}
    try { newWin.setMenuBarVisibility(false); newWin.setAutoHideMenuBar(true); } catch (e) {}
    await newWin.loadFile(pagePath, { query: { theme: themeName } });
    return { ok: true, reusedWindow: false };
  } catch (e) {
    return { error: e.message };
  }
});

// On macOS: re-create window if no windows remain
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Debug/logging: confirm handlers registered
console.log('Selector-app: IPC handlers registered: get-themes, get-preview-paths, apply-theme, cycle-theme');

// Show main selector (index.html) in focused window
ipcMain.handle('show-selector', async () => {
  try {
    const target = BrowserWindow.getFocusedWindow() || (BrowserWindow.getAllWindows().length ? BrowserWindow.getAllWindows()[0] : null);
    if (!target) return { error: 'no window' };
    await target.loadFile(path.join(__dirname, 'index.html'));
    return { ok: true };
  } catch (e) {
    return { error: e.message };
  }
});

// List sub-themes for a given top-level theme
ipcMain.handle('list-subthemes', async (event, themeName) => {
  try {
    const yasbThemesDir = path.join(__dirname, '..', 'yasb-themes');
    const subRoot = path.join(yasbThemesDir, themeName, 'sub-themes');
    if (!fs.existsSync(subRoot)) return [];
    const subs = fs.readdirSync(subRoot, { withFileTypes: true }).filter(d => d.isDirectory());
    const out = [];
    for (const s of subs) {
      const m = path.join(subRoot, s.name, 'manifest.json');
      let parsed = null;
      if (fs.existsSync(m)) {
        try { parsed = JSON.parse(fs.readFileSync(m, 'utf8')); } catch (e) { parsed = { error: e.message }; }
      }
      out.push({ name: s.name, manifest: parsed });
    }
    return out;
  } catch (e) {
    return { error: e.message };
  }
});