const { contextBridge, ipcRenderer } = require('electron');

// Consolidated safe exposures for renderer
const themeAPI = {
  // core actions (invoke on main)
  applyTheme: (themeName) => ipcRenderer.invoke('apply-theme', themeName),
  cycleTheme: () => ipcRenderer.invoke('cycle-theme'),
  getThemes: () => ipcRenderer.invoke('get-themes'),
  getPreviewPaths: (themeName) => ipcRenderer.invoke('get-preview-paths', themeName),
  listSubThemes: (themeName) => ipcRenderer.invoke('list-subthemes', themeName),

  // settings + workshop helpers
  getSettings: () => ipcRenderer.invoke('get-settings'),
  setSettings: (obj) => ipcRenderer.invoke('set-settings', obj),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  watchWorkshop: (workshopId, theme, sub) => ipcRenderer.invoke('watch-workshop', workshopId, theme, sub),
  cancelWatch: (watchId) => ipcRenderer.invoke('cancel-watch', watchId),
  markSkipWorkshop: (theme, sub) => ipcRenderer.invoke('mark-skip-workshop', theme, sub),
  disableSubWallpaper: (theme, sub) => ipcRenderer.invoke('disable-sub-wallpaper', theme, sub),
  enableSubWallpaper: (theme, sub) => ipcRenderer.invoke('enable-sub-wallpaper', theme, sub),

  // editor functions
  readThemeFile: (theme, filename) => ipcRenderer.invoke('read-theme-file', theme, filename),
  readSubThemeManifest: (theme, sub) => ipcRenderer.invoke('read-subtheme-manifest', theme, sub),
  writeThemeFile: (theme, filename, content) => ipcRenderer.invoke('write-theme-file', theme, filename, content),
  writeSubThemeManifest: (theme, sub, manifest) => ipcRenderer.invoke('write-subtheme-manifest', theme, sub, manifest),

  // convenience
  showSelector: () => ipcRenderer.invoke('show-selector')
};

// Event subscriptions (renderer provides callbacks)
const onWorkshopFound = (cb) => ipcRenderer.on('workshop-found', (e, data) => cb(data));
const onSettingsMissing = (cb) => ipcRenderer.on('settings-missing', (e, data) => cb(data));
const onHandshake = (cb) => ipcRenderer.on('theme-handshake', (e, data) => cb(data));

// Expose the consolidated APIs to the renderer
contextBridge.exposeInMainWorld('themeAPI', themeAPI);
contextBridge.exposeInMainWorld('themeAPIAsync', {
  getThemes: () => ipcRenderer.invoke('get-themes'),
  getPreviewPaths: (themeName) => ipcRenderer.invoke('get-preview-paths', themeName)
});
contextBridge.exposeInMainWorld('diagnostics', { ping: () => ipcRenderer.invoke('ping') });
contextBridge.exposeInMainWorld('themeWindow', {
  openThemePage: (themeName) => ipcRenderer.invoke('open-theme-page', themeName),
  showSelector: () => ipcRenderer.invoke('show-selector')
});

// Also expose event registration functions
contextBridge.exposeInMainWorld('themeEvents', {
  onWorkshopFound,
  onSettingsMissing,
  onThemeStatus: (cb) => ipcRenderer.on('theme-status', (e, data) => cb(data)),
  onHandshake
});
