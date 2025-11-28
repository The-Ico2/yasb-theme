const { contextBridge, ipcRenderer } = require('electron');

// Expose async APIs that call the main process. Main performs filesystem IO.
contextBridge.exposeInMainWorld('themeAPI', {
  applyTheme: (themeName) => ipcRenderer.invoke('apply-theme', themeName),
  cycleTheme: () => ipcRenderer.invoke('cycle-theme'),
  getThemes: () => ipcRenderer.invoke('get-themes'),
  getPreviewPaths: (themeName) => ipcRenderer.invoke('get-preview-paths', themeName),
  listSubThemes: (themeName) => ipcRenderer.invoke('list-subthemes', themeName)
});

// Also expose the same under themeAPIAsync for backward compatibility with earlier code
contextBridge.exposeInMainWorld('themeAPIAsync', {
  getThemes: () => ipcRenderer.invoke('get-themes'),
  getPreviewPaths: (themeName) => ipcRenderer.invoke('get-preview-paths', themeName)
});

// diagnostic ping
contextBridge.exposeInMainWorld('diagnostics', {
  ping: () => ipcRenderer.invoke('ping')
});

// Open theme page (delegates to main process)
// Expose window-level helpers for theme window navigation
const _themeWindow = {
  openThemePage: (themeName) => ipcRenderer.invoke('open-theme-page', themeName),
  showSelector: () => ipcRenderer.invoke('show-selector')
};
contextBridge.exposeInMainWorld('themeWindow', _themeWindow);

// Also provide showSelector on themeAPI as a convenience so code can call either
contextBridge.exposeInMainWorld('themeAPI', Object.assign({}, globalThis.themeAPI || {}, {
  showSelector: () => ipcRenderer.invoke('show-selector')
}));
