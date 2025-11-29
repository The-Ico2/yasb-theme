let themes = {};
const themeGridEl = document.getElementById('theme-grid');
const previewContainer = document.getElementById('preview-container');
const cycleBtn = document.getElementById('cycle-btn');
const applyBtn = document.getElementById('apply-btn');

let selectedTheme = null;
let selectedCardEl = null;

// Placeholder SVG data URI used when preview is missing
const PLACEHOLDER_SVG = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="100%" height="100%" fill="#0b0b12"/><g fill="#2e2e4e"><rect x="48" y="48" width="544" height="264" rx="8"/></g><text x="50%" y="52%" fill="#6b6f85" font-size="18" font-family="Segoe UI, Arial" text-anchor="middle">No preview</text></svg>`
);

// Async init to use the bridged async API
async function init() {
  // First, check IPC ping to confirm main is reachable
  try {
    const ping = await window.diagnostics.ping();
    console.debug('theme-selector: ping result', ping);
  } catch (e) {
    console.warn('theme-selector: ping failed', e);
  }
  // Retry get-themes a few times in case main process hasn't registered handlers yet.
  const maxAttempts = 6;
  const delayMs = 200;
  let attempt = 0;
  let loaded = null;
  while (attempt < maxAttempts) {
    attempt++;
    try {
      console.debug(`theme-selector: attempting get-themes (attempt ${attempt})`);
      loaded = await window.themeAPIAsync.getThemes();
      // If we got a meaningful response, break
      if (loaded) break;
    } catch (e) {
      console.warn('theme-selector: get-themes failed', e && e.message ? e.message : e);
    }
    // small backoff
    await new Promise(r => setTimeout(r, delayMs));
  }

  if (!loaded || loaded.error) {
    const msg = loaded && loaded.error ? loaded.error : 'No themes found or handler missing';
    console.error('theme-selector: failed to load themes:', msg);
    showToast('Error loading themes: ' + msg, 'error');
    return;
  }

  themes = loaded;
  const themeNames = Object.keys(themes);
  for (const themeName of themeNames) {
    const info = themes[themeName];
    const card = await createThemeCard(themeName, info);
    themeGridEl.append(card);
  }
}

init();

async function createThemeCard(themeName, info) {
  const card = document.createElement('div');
  card.className = 'theme-card';
  card.setAttribute('data-theme', themeName);

  // Thumbnail (with blurred scaled background). Use a wrapper so we can place a scaled, blurred background behind the image.
  const thumbWrap = document.createElement('div');
  thumbWrap.className = 'thumb-wrap';
  const thumbBg = document.createElement('div');
  thumbBg.className = 'thumb-bg';
  let thumbImg = document.createElement('img');
  thumbImg.className = 'thumb-img';

  // Ask preload for preview paths (safe from renderer)
  const previews = await window.themeAPIAsync.getPreviewPaths(themeName) || [];
  let thumbIndex = 0;
  if (previews.length) {
    thumbImg.src = previews[0];
    // set background to same image (will be scaled and blurred via CSS)
    thumbBg.style.backgroundImage = `url('${previews[0]}')`;
  } else {
    thumbImg.src = PLACEHOLDER_SVG;
    thumbBg.style.backgroundImage = `url('${PLACEHOLDER_SVG}')`;
  }

  thumbWrap.appendChild(thumbBg);
  thumbWrap.appendChild(thumbImg);
  card.appendChild(thumbWrap);

  // If multiple previews, cycle the thumbnail every 5s with sliding animation
  if (previews.length > 1) {
    const slideInterval = 5000;
    const doSlide = () => {
      try {
        const nextIndex = (thumbIndex + 1) % previews.length;
        const nextSrc = previews[nextIndex];
        // prepare next image element
        const nextImg = document.createElement('img');
        nextImg.className = 'thumb-img next';
        nextImg.src = nextSrc;
        // ensure next image is positioned to the right (css .next has translateX(100%))
        thumbWrap.appendChild(nextImg);
        // set background to next (darker blurred backdrop)
        thumbBg.style.backgroundImage = `url('${nextSrc}')`;

        // force reflow then animate
        // both elements use transform; add slide class to enable transition
        void nextImg.offsetWidth;
        nextImg.classList.add('slide');
        thumbImg.classList.add('slide');
        // move current left and next into view
        thumbImg.style.transform = 'translateX(-100%)';
        nextImg.style.transform = 'translateX(0)';

        // after transition, remove old image and set references
        const cleanup = () => {
          thumbImg.remove();
          // nextImg becomes the primary
          nextImg.classList.remove('next');
          nextImg.classList.remove('slide');
          nextImg.style.transform = 'translateX(0)';
          // update reference
          thumbImg = nextImg; // eslint-disable-line no-unused-vars
          thumbIndex = nextIndex;
          nextImg.removeEventListener('transitionend', cleanup);
        };
        nextImg.addEventListener('transitionend', cleanup);
      } catch (e) {
        console.warn('theme-selector: thumbnail slide error', e);
      }
    };
    const intervalId = setInterval(doSlide, slideInterval);
    card._thumbInterval = intervalId;
  }

  // Body: title, description, tags
  const body = document.createElement('div');
  body.className = 'body';

  const title = document.createElement('div');
  title.className = 'title';
  title.textContent = (info && info.meta && info.meta.name) ? info.meta.name : themeName;
  body.appendChild(title);

  const desc = document.createElement('div');
  desc.className = 'desc';
  desc.textContent = (info && info.meta && info.meta.description) ? info.meta.description : '';
  body.appendChild(desc);

  // Tags
  if (info && info.meta && Array.isArray(info.meta.tags)) {
    const tagWrap = document.createElement('div');
    info.meta.tags.forEach(t => {
      const pill = document.createElement('span');
      pill.className = 'tag-pill';
      pill.textContent = t;
      tagWrap.appendChild(pill);
    });
    body.appendChild(tagWrap);
  }

  card.appendChild(body);

  // Footer with repo link and version (version shown bottom-right in grey)
  const footer = document.createElement('div');
  footer.className = 'meta-footer';
  const left = document.createElement('div');
  left.className = 'meta-left';
  // Authors avatars (if present)
  if (info && info.meta && info.meta.authors && typeof info.meta.authors === 'object') {
    const avatars = document.createElement('div');
    avatars.style.display = 'flex';
    avatars.style.gap = '6px';
    let count = 0;
    for (const [name, data] of Object.entries(info.meta.authors)) {
      if (count++ > 3) break;
      if (data && data['github-pfp-link']) {
        const img = document.createElement('img');
        img.src = data['github-pfp-link'];
        img.className = 'author-avatar';
        img.title = name;
        avatars.appendChild(img);
      }
    }
    left.appendChild(avatars);
  }
  if (info && info.meta && info.meta.repository && info.meta.repository !== 'Null') {
    const a = document.createElement('a');
    a.className = 'meta-repo';
    a.href = info.meta.repository;
    a.target = '_blank';
    a.textContent = 'Repository';
    left.appendChild(a);
  }
  // Apply button removed - clicking card opens theme page

  footer.appendChild(left);

  const ver = document.createElement('div');
  ver.className = 'version';
  ver.textContent = (info && info.meta && info.meta.version) ? `v${info.meta.version}` : '';
  footer.appendChild(ver);

  card.appendChild(footer);

  // Error badge when manifest had parse errors
  if (info && info.error) {
    const badge = document.createElement('div');
    badge.className = 'error-badge';
    badge.textContent = 'manifest error';
    badge.title = info.error;
    card.appendChild(badge);
  }

  // Interaction: click opens theme page
  card.addEventListener('click', (ev) => {
    ev.stopPropagation();
    window.themeWindow.openThemePage(themeName)
      .then(res => {
        if (res && res.error) console.warn('openThemePage error', res.error);
      })
      .catch(err => console.warn('openThemePage failed', err));
  });

  return card;
}

async function showPreview(themeName) {
  previewContainer.innerHTML = '';  // clear
  // Use preload helper to resolve preview image file:// or data: URIs
  const previewPaths = await window.themeAPI.getPreviewPaths(themeName) || [];
  console.debug('theme-selector: showPreview previewPaths=', previewPaths);
  if (previewPaths.length) {
    previewPaths.forEach(p => {
      const img = document.createElement('img');
      img.src = p;
      img.className = 'theme-preview';
      previewContainer.append(img);
    });
  } else {
    previewContainer.textContent = '(No preview images defined)';
  }
}

function applyTheme(themeName) {
  window.themeAPI.applyTheme(themeName)
    .then(async result => {
      console.debug('applyTheme result', result);
      
      // If main sent handshake event, don't process here - event listener handles it
      if (result && result.handshake_sent) {
        console.log('applyTheme: handshake event sent, UI will be handled by event listener');
        return;
      }
      
      // If the backend signals a need for sub-theme selection, open the theme page so
      // the user can pick a sub-theme (the page will call applyTheme again with theme/sub)
      if (result && result.needs_sub) {
        // If the main process indicates sub-theme selection is required but
        // a representative sub-theme was discovered when scanning themes
        // (stored as __repSub), auto-apply that sub to improve UX.
        try {
          const rep = themes && themes[result.theme] && themes[result.theme].__repSub;
          if (rep) {
            // auto-apply the representative sub-theme
            await window.themeAPI.applyTheme(`${result.theme}/${rep}`);
            return;
          }
        } catch (e) {
          console.warn('Auto-apply repSub failed', e);
        }

        try {
          await window.themeWindow.openThemePage(result.theme);
        } catch (e) {
          console.warn('Failed to open theme page for sub selection', e);
          showToast('Please select a sub-theme from the theme page.', 'info');
        }
        return;
      }

      // If backend signals needs_workshop, the promise is intentionally left pending
      // and the onHandshake event listener will handle the UI (overlay prompt)
      // So we should not reach here for needs_workshop cases
      if (result && result.needs_workshop) {
        console.log('applyTheme: needs_workshop in result (should be handled by event listener)');
        return;
      }
    })
    .catch(err => {
      console.error('applyTheme error:', err);
      showToast('Failed to apply theme: ' + err, 'error', 8);
    });
  }

function showWaitingOverlay(text) {
  let el = document.getElementById('waiting-overlay');
  if (!el) {
    el = document.createElement('div');
    el.id = 'waiting-overlay';
    el.style.position = 'fixed';
    el.style.inset = '0';
    el.style.display = 'flex';
    el.style.alignItems = 'center';
    el.style.justifyContent = 'center';
    el.style.background = 'rgba(0,0,0,0.6)';
    el.style.zIndex = '9999';
    el.style.color = '#fff';
    el.style.fontSize = '18px';
    document.body.appendChild(el);
  }
  el.textContent = text;
}

function hideWaitingOverlay() {
  const el = document.getElementById('waiting-overlay'); if (el) el.remove();
}

// Listen for workshop-found events from main
if (window.themeEvents && typeof window.themeEvents.onWorkshopFound === 'function') {
  window.themeEvents.onWorkshopFound((data) => {
    console.debug('workshop-found', data);
    hideWaitingOverlay();
    showToast(`Workshop item ${data.workshopId} downloaded — applying theme ${data.theme}/${data.sub}`, 'success');
  });
}

// Listen for streaming theme status messages (e.g. theme:wallpaper: OK/FAIL)
if (window.themeEvents && typeof window.themeEvents.onThemeStatus === 'function') {
  window.themeEvents.onThemeStatus((data) => {
    try {
      console.debug('theme-status', data);
      try { showDebugBanner && showDebugBanner(`status: ${data && data.line ? data.line : JSON.stringify(data)}`); } catch(e){}
      // If a wallpaper OK message arrives, hide waiting overlay
      if (data && typeof data.line === 'string') {
        if (data.line.toLowerCase().includes('theme:wallpaper: ok')) {
          hideWaitingOverlay();
          // small non-blocking toast
          showToast('Wallpaper applied', 'success');
        } else if (data.line.toLowerCase().includes('theme:wallpaper: fail') || data.line.toLowerCase().includes('theme:wallpaper: skip')) {
          hideWaitingOverlay();
          showToast(data.line, 'warn');
        } else {
          // general status: show briefly
          showToast(data.line, 'info', 3);
        }
      }
    } catch (e) { console.warn('theme-status handler err', e); }
  });
}

// Listen for explicit handshake JSON forwarded from main (ensures renderer sees needs_workshop immediately)
console.log('RENDERER: Setting up onHandshake listener...');
console.log('RENDERER: window.themeEvents =', window.themeEvents);
console.log('RENDERER: typeof window.themeEvents.onHandshake =', typeof window.themeEvents?.onHandshake);

if (window.themeEvents && typeof window.themeEvents.onHandshake === 'function') {
  console.log('RENDERER: Registering onHandshake listener - READY');
  window.themeEvents.onHandshake((data) => {
    try {
      console.log('RENDERER: *** onHandshake callback FIRED with data:', JSON.stringify(data, null, 2));
      console.debug('theme-handshake', data);
      try { showDebugBanner(`handshake: ${JSON.stringify(data)}`); } catch(e){}
      if (data && data.needs_workshop) {
        console.log('RENDERER: Creating workshop prompt overlay...');
        console.log('RENDERER: Workshop ID:', data.workshop_id || data.workshopId);
        console.log('RENDERER: Theme:', data.theme, 'Sub:', data.sub);

        // remove any existing prompt
        const existing = document.getElementById('workshop-prompt');
        if (existing) existing.remove();

        // compute commonly used values
        const steamUrl = data.steam_url || data.steamUrl || data.link;
        const workshopId = data.workshop_id || data.workshopId;
        const themeCommand = data.theme_select_command || `${data.theme}/${data.sub || ''}`;

        // build overlay + panel
        const overlay = document.createElement('div');
        overlay.id = 'workshop-prompt';
        overlay.style.position = 'fixed';
        overlay.style.left = '0';
        overlay.style.right = '0';
        overlay.style.top = '0';
        overlay.style.display = 'flex';
        overlay.style.justifyContent = 'center';
        overlay.style.zIndex = 10001;
        overlay.style.pointerEvents = 'none';

        const panel = document.createElement('div');
        panel.style.pointerEvents = 'auto';
        panel.style.margin = '12px';
        panel.style.background = 'linear-gradient(180deg, rgba(16,16,24,0.95), rgba(8,8,12,0.95))';
        panel.style.color = '#fff';
        panel.style.padding = '16px 20px';
        panel.style.borderRadius = '12px';
        panel.style.boxShadow = '0 8px 24px rgba(0,0,0,0.6)';
        panel.style.maxWidth = '500px';

        const title = document.createElement('div');
        title.style.fontSize = '18px';
        title.style.fontWeight = 'bold';
        title.style.marginBottom = '12px';
        title.textContent = 'Wallpaper Not Found';

        const msg = document.createElement('div');
        msg.style.marginBottom = '16px';
        msg.style.lineHeight = '1.5';
        msg.innerHTML = `This sub-theme requires a Wallpaper Engine wallpaper that is not installed.<br><br><strong>What would you like to do?</strong>`;

        const btnRow = document.createElement('div');
        btnRow.style.display = 'flex';
        btnRow.style.gap = '10px';
        btnRow.style.flexWrap = 'wrap';

        // Buttons
        const openBtn = document.createElement('button');
        openBtn.textContent = 'Open Steam Workshop';
        openBtn.className = 'subtheme-apply-btn';

        const disableBtn = document.createElement('button');
        disableBtn.textContent = 'Disable Wallpaper';
        disableBtn.className = 'subtheme-disable-btn';

        const changeBtn = document.createElement('button');
        changeBtn.textContent = 'Choose Different';
        changeBtn.className = 'subtheme-change-btn';

        const closeBtn = document.createElement('button');
        closeBtn.textContent = 'Close';
        closeBtn.className = 'subtheme-decline-btn';

        // wire handlers
        openBtn.addEventListener('click', async () => {
          console.log('Opening Steam Workshop URL:', steamUrl, 'themeCommand:', themeCommand);
          try {
            if (steamUrl) await window.themeAPI.openExternal(steamUrl);
            else console.warn('No Steam URL provided for workshop item');
          } catch (e) {
            console.error('openExternal failed', e);
            showToast('Failed to open Steam: ' + e, 'error');
          }

          overlay.remove();
          showWaitingOverlay(`Waiting for workshop item ${workshopId} to download...\nClick to cancel`);

          // Add click handler to cancel waiting
          const waitOverlay = document.getElementById('waiting-overlay');
          if (waitOverlay) {
            waitOverlay.style.cursor = 'pointer';
            const cancelHandler = () => {
              hideWaitingOverlay();
              waitOverlay.removeEventListener('click', cancelHandler);
            };
            waitOverlay.addEventListener('click', cancelHandler);
          }

          try {
            const watch = await window.themeAPI.watchWorkshop(workshopId, data.theme, data.sub || '');
            if (watch && watch.id) {
              console.log(`Started watching for workshop item ${workshopId}`);
            }
          } catch (e) {
            console.warn('watchWorkshop failed', e);
            hideWaitingOverlay();
            showToast('Failed to watch workshop item', 'error');
          }
        });

        disableBtn.addEventListener('click', async () => {
          try {
            // Mark to skip workshop (creates skip file)
            await window.themeAPI.markSkipWorkshop(data.theme, data.sub || '');
            // Also disable in manifest permanently
            const result = await window.themeAPI.disableSubWallpaper(data.theme, data.sub || '');
            if (result && result.ok) {
              showToast('Wallpaper permanently disabled for this sub-theme', 'success');
            } else {
              showToast('Wallpaper disabled (skip file created)', 'success');
            }
          } catch (e) {
            console.error('disableSubWallpaper failed', e);
            showToast('Failed to disable wallpaper', 'error');
          }
          overlay.remove();
        });

        changeBtn.addEventListener('click', async () => {
          overlay.remove();
          showToast('Custom wallpaper selection - Coming soon!', 'info');
        });

        closeBtn.addEventListener('click', () => {
          overlay.remove();
        });

        // assemble UI
        btnRow.appendChild(openBtn);
        btnRow.appendChild(disableBtn);
        btnRow.appendChild(changeBtn);
        btnRow.appendChild(closeBtn);

        panel.appendChild(title);
        panel.appendChild(msg);
        panel.appendChild(btnRow);

        overlay.appendChild(panel);
        document.body.appendChild(overlay);
      }
    } catch (e) { console.warn('theme-handshake handler err', e); }
  });
}

// Track active toast chips
const activeToasts = [];

function showToast(text, type = 'info', duration = 4) {
  const chip = document.createElement('div');
  chip.className = `msg-chip msg-${type}`;
  chip.textContent = text;

  // Base styling
  const baseStyle = {
    position: 'fixed',
    right: '20px',
    padding: '10px 15px',
    borderRadius: '6px',
    color: '#fff',
    fontFamily: 'Inter, Segoe UI, sans-serif',
    fontSize: '14px',
    boxShadow: '0 2px 10px rgba(0,0,0,0.25)',
    zIndex: '99999',
    opacity: '0',
    transition: 'opacity 0.25s ease, transform 0.25s ease',
    transform: 'translateY(10px)'
  };

  // Type-specific colors
  const typeStyles = {
    error: { backgroundColor: 'rgba(220,53,69,0.95)' },
    warn: { backgroundColor: 'rgba(255,193,7,0.95)', color: '#222' },
    warning: { backgroundColor: 'rgba(255,193,7,0.95)', color: '#222' },
    success: { backgroundColor: 'rgba(40,167,69,0.95)' },
    info: { backgroundColor: 'rgba(23,162,184,0.95)' },
    debug: { backgroundColor: 'rgba(108,117,125,0.95)' }
  };

  Object.assign(chip.style, baseStyle, typeStyles[type] || typeStyles.info);

  // Compute vertical offset based on existing toasts
  const spacing = 10;
  let bottomOffset = 20;
  activeToasts.forEach(c => {
    bottomOffset += c.offsetHeight + spacing;
  });
  chip.style.bottom = bottomOffset + 'px';

  document.body.appendChild(chip);
  activeToasts.push(chip);

  // Fade in
  requestAnimationFrame(() => {
    chip.style.opacity = '1';
    chip.style.transform = 'translateY(0)';
  });

  // Fade out and remove
  setTimeout(() => {
    chip.style.opacity = '0';
    chip.style.transform = 'translateY(10px)';
    chip.addEventListener('transitionend', () => {
      chip.remove();
      const index = activeToasts.indexOf(chip);
      if (index !== -1) activeToasts.splice(index, 1);
      // Adjust positions of remaining toasts
      let offset = 20;
      activeToasts.forEach(c => {
        c.style.bottom = offset + 'px';
        offset += c.offsetHeight + spacing;
      });
    });
  }, duration * 1000);
}

// Handle settings-missing signal to prompt user to configure WE paths
if (window.themeEvents && typeof window.themeEvents.onSettingsMissing === 'function') {
  window.themeEvents.onSettingsMissing(async (info) => {
  console.debug('settings-missing', info);
  const proceed = confirm('Wallpaper Engine settings appear missing or invalid. Open settings to configure now?');
  if (!proceed) return;
  // simple flow: ask user to select Steam "steamapps" folder
  const folder = await window.themeAPI.selectFolder();
  if (!folder) return showToast('No folder selected', 'warn');
  // Expect user to select the parent folder that contains \steamapps
  // Build settings assuming user selected either the steamapps folder or the Steam library root
  const settings = {};
  if (folder.toLowerCase().endsWith('steamapps')) {
    settings.WE_Workshop = pathJoin(folder, 'workshop', 'content', '431960');
    settings.WE_Exe = pathJoin(folder, 'common', 'wallpaper_engine', 'wallpaper64.exe');
  } else {
    // assume user selected the Steam library folder (parent of 'steamapps')
    settings.WE_Workshop = pathJoin(folder, 'steamapps', 'workshop', 'content', '431960');
    settings.WE_Exe = pathJoin(folder, 'steamapps', 'common', 'wallpaper_engine', 'wallpaper64.exe');
  }
  await window.themeAPI.setSettings(settings);
  showToast('Settings saved. If Wallpaper Engine files are present the selector will now detect them.', 'success');
});
}

// small helpers used above
function pathJoin() { return Array.from(arguments).join('\\'); }

// Cycle button handler
if (cycleBtn) {
  cycleBtn.addEventListener('click', () => {
    window.themeAPI.cycleTheme()
      .then(out => {
        showToast('Cycled theme\n' + (out || ''), 'success');
      })
      .catch(err => {
        showToast('Failed to cycle theme: ' + err, 'error');
      });
  });
}

// Apply selected button handler
if (applyBtn) {
  applyBtn.addEventListener('click', () => {
    if (!selectedTheme) {
      showToast('No theme selected', 'warn');
      return;
    }
    applyTheme(selectedTheme);
  });
}

// Temporary debug banner to make incoming events visible in the UI without opening DevTools
function showDebugBanner(text) {
  try {
    let b = document.getElementById('debug-banner');
    if (!b) {
      b = document.createElement('div');
      b.id = 'debug-banner';
      b.style.position = 'fixed';
      b.style.left = '12px';
      b.style.top = '12px';
      b.style.background = 'rgba(0,0,0,0.72)';
      b.style.color = '#fff';
      b.style.padding = '8px 10px';
      b.style.borderRadius = '6px';
      b.style.zIndex = '11000';
      b.style.fontSize = '12px';
      b.style.maxWidth = '60vw';
      b.style.overflow = 'hidden';
      b.style.textOverflow = 'ellipsis';
      b.style.whiteSpace = 'nowrap';
      document.body.appendChild(b);
    }
    b.textContent = text;
    clearTimeout(b._hideTimer);
    b._hideTimer = setTimeout(()=>{ try { b.textContent = ''; } catch(e){} }, 15000);
  } catch (e) { console.warn('showDebugBanner error', e); }
}

// ===== TAB NAVIGATION =====
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tabName = btn.dataset.tab;
    
    // Update active tab button
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    
    // Update active tab content
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.getElementById(`${tabName}-tab`).classList.add('active');
    
    // Load editor content when switching to editor tab
    if (tabName === 'editor') {
      initEditor();
    }
  });
});

// ===== EDITOR TAB FUNCTIONALITY =====
let editorState = {
  themes: null,
  selectedTheme: null,
  selectedSub: null,
  config: null,
  manifest: null,
  unsavedChanges: false
};

async function initEditor() {
  try {
    const loaded = await window.themeAPIAsync.getThemes();
    if (!loaded || loaded.error) {
      showToast('Error loading themes for editor', 'error');
      return;
    }
    
    editorState.themes = loaded;
    renderThemeList();
  } catch (e) {
    console.error('Error initializing editor:', e);
    showToast('Failed to initialize editor', 'error');
  }
}

function renderThemeList() {
  const themeList = document.getElementById('theme-list');
  if (!themeList) return;
  
  const themeNames = Object.keys(editorState.themes);
  let html = '';
  
  for (const themeName of themeNames) {
    const theme = editorState.themes[themeName];
    if (!theme.subs || theme.subs.length === 0) continue;
    
    const isSelected = editorState.selectedTheme === themeName;
    const subCount = theme.subs.length;
    
    html += `
      <div class="theme-list-item ${isSelected ? 'selected' : ''}" onclick="selectTheme('${themeName}')">
        <div class="theme-list-name">${theme.meta?.name || themeName}</div>
        <div class="theme-list-subs">${subCount} sub-theme${subCount !== 1 ? 's' : ''}</div>
      </div>
    `;
  }
  
  if (!html) {
    html = '<p style="color: #9aa0c0; font-size: 12px; text-align: center;">No themes found</p>';
  }
  
  themeList.innerHTML = html;
}

window.selectTheme = async function(themeName) {
  editorState.selectedTheme = themeName;
  editorState.selectedSub = null;
  
  renderThemeList();
  
  const theme = editorState.themes[themeName];
  if (!theme || !theme.subs || theme.subs.length === 0) {
    renderEditorEmpty();
    return;
  }
  
  // Select first sub-theme by default
  editorState.selectedSub = theme.subs[0].name;
  
  // Load config.yaml
  try {
    const configResult = await window.themeAPI.readThemeFile(themeName, 'config.yaml');
    if (configResult && !configResult.error) {
      editorState.config = configResult.content;
    }
  } catch (e) {
    console.error('Error loading config:', e);
  }
  
  renderEditor();
};

window.selectSubTheme = function(subName) {
  editorState.selectedSub = subName;
  renderEditor();
};

function renderEditorEmpty() {
  const editorMain = document.getElementById('editor-main');
  if (!editorMain) return;
  
  editorMain.innerHTML = `
    <div class="editor-empty">
      Select a theme from the sidebar to begin editing
    </div>
  `;
}

async function renderEditor() {
  const editorMain = document.getElementById('editor-main');
  if (!editorMain) return;
  
  const theme = editorState.themes[editorState.selectedTheme];
  if (!theme) return;
  
  const sub = theme.subs.find(s => s.name === editorState.selectedSub);
  if (!sub) return;
  
  // Load manifest
  try {
    const manifestResult = await window.themeAPI.readSubThemeManifest(editorState.selectedTheme, sub.name);
    if (manifestResult && !manifestResult.error) {
      editorState.manifest = manifestResult.manifest;
    }
  } catch (e) {
    console.error('Error loading manifest:', e);
  }
  
  // Render sub-theme selector
  let subThemeTabs = '';
  for (const s of theme.subs) {
    const isActive = s.name === editorState.selectedSub;
    subThemeTabs += `
      <div class="subtheme-tab ${isActive ? 'active' : ''}" onclick="selectSubTheme('${s.name}')">
        ${s.meta?.name || s.name}
      </div>
    `;
  }
  
  // Render preview
  const previewHtml = await renderPreview(theme, sub);
  
  // Render editor panels
  const panelsHtml = renderEditorPanels(theme, sub);
  
  editorMain.innerHTML = `
    <div class="subtheme-selector">
      <div class="subtheme-tabs">
        ${subThemeTabs}
      </div>
    </div>
    
    ${previewHtml}
    
    <div class="editor-panels">
      ${panelsHtml}
    </div>
  `;
}

async function renderPreview(theme, sub) {
  // Use wallpaper preview image from sub-theme data
  let previewSrc = '';
  if (sub.wallpaperPreview) {
    previewSrc = 'file:///' + sub.wallpaperPreview.replace(/\\/g, '/');
  }
  
  // Load theme CSS styles
  let cssVars = '';
  if (editorState.manifest && editorState.manifest['root-variables']) {
    const vars = editorState.manifest['root-variables'];
    cssVars = Object.entries(vars).map(([k, v]) => `${k}: ${v};`).join(' ');
  }
  
  // Parse bars and widgets from config
  const bars = parseConfigBars();
  const widgetConfigs = parseWidgetConfigs();
  
  console.log('Widget configs parsed:', Object.keys(widgetConfigs).length, 'widgets');
  
  // Bar selector tabs
  let barTabs = '';
  let barPreviews = '';
  
  if (bars && bars.length > 0) {
    for (let i = 0; i < bars.length; i++) {
      const bar = bars[i];
      const isActive = i === 0;
      barTabs += `
        <div class="subtheme-tab ${isActive ? 'active' : ''}" onclick="switchBarPreview(${i})" style="font-size: 12px;">
          ${bar.name}
        </div>
      `;
      
      // Create widgets HTML for this bar
      const positions = ['left', 'center', 'right'];
      let leftWidgets = '';
      let centerWidgets = '';
      let rightWidgets = '';
      
      for (const pos of positions) {
        const posWidgets = bar.widgets[pos] || [];
        let html = '';
        
        for (const widgetName of posWidgets) {
          const widgetHtml = renderPreviewWidget(widgetName, widgetConfigs[widgetName]);
          html += widgetHtml;
        }
        
        if (pos === 'left') leftWidgets = html;
        else if (pos === 'center') centerWidgets = html;
        else if (pos === 'right') rightWidgets = html;
      }
      
      barPreviews += `
        <div class="bar-preview-container ${isActive ? 'active' : ''}" data-bar-index="${i}">
          <div class="preview-bar" style="${cssVars}">
            <div class="preview-bar-section preview-bar-left">${leftWidgets || ''}</div>
            <div class="preview-bar-section preview-bar-center">${centerWidgets || ''}</div>
            <div class="preview-bar-section preview-bar-right">${rightWidgets || ''}</div>
          </div>
        </div>
      `;
    }
  } else {
    barPreviews = `
      <div class="bar-preview-container active" data-bar-index="0">
        <div class="preview-bar">
          <div class="preview-widget">Loading...</div>
        </div>
      </div>
    `;
  }
  
  return `
    <div class="preview-section">
      <div class="preview-header">
        <h3>Live Preview</h3>
        ${barTabs ? `<div class="subtheme-tabs" style="margin: 0;">${barTabs}</div>` : ''}
      </div>
      <div class="preview-desktop">
        ${previewSrc ? `<img src="${previewSrc}" class="preview-wallpaper" alt="Wallpaper preview">` : ''}
        ${barPreviews}
      </div>
    </div>
  `;
}

function renderPreviewWidget(widgetName, config) {
  if (!config) {
    // Default fallback - return empty to avoid showing placeholder
    console.warn('No config found for widget:', widgetName);
    return '';
  }
  
  const options = config.options || {};
  let label = options.label || '';
  let icon = '';
  
  // Convert unicode escapes in label first
  if (label && label.includes('\\u')) {
    label = label.replace(/\\u([0-9a-fA-F]{4})/g, (match, code) => String.fromCharCode(parseInt(code, 16)));
  }
  
  // Extract icon from label - handle <span>{icon}</span> pattern
  if (label.includes('<span>{icon}</span>')) {
    // Icon comes from options.icons or a specific icon field
    if (options.icons) {
      // For widgets with icon arrays (like volume, wifi)
      if (Array.isArray(options.icons)) {
        icon = options.icons[2] || options.icons[0] || ''; // Use middle icon as sample
      } else if (typeof options.icons === 'object') {
        // For widgets with named icons (like bluetooth, media)
        icon = options.icons.bluetooth_on || options.icons.normal || options.icons.play || Object.values(options.icons)[0] || '';
      }
    } else if (options.volume_icons) {
      icon = options.volume_icons[2] || options.volume_icons[0] || '';
    } else if (options.wifi_icons) {
      icon = options.wifi_icons[3] || options.wifi_icons[0] || '';
    }
    // Convert unicode escapes in icon
    if (icon && icon.includes('\\u')) {
      icon = icon.replace(/\\u([0-9a-fA-F]{4})/g, (match, code) => String.fromCharCode(parseInt(code, 16)));
    }
    label = label.replace('<span>{icon}</span>', '').trim();
  } else if (label.includes('<span>') && label.includes('</span>')) {
    // Extract literal icon from <span>icon</span>
    const iconMatch = label.match(/<span>([^<]+)<\/span>/);
    if (iconMatch) {
      icon = iconMatch[1];
      label = label.replace(/<span>[^<]+<\/span>\s*/g, '');
    }
  } else if (label && !label.includes('{') && !label.includes(' ')) {
    // If label is a single icon character/escape with no placeholders, treat as icon
    icon = label;
    label = '';
  }
  
  // Widget-specific sample data
  const widgetSamples = {
    'home': { icon: icon || '\uf192', label: '' },
    'komorebi_workspaces': { icon: '', label: '\udb80\udd2f \udb80\udd30 \udb80\udd30 \udb80\udd30 \udb80\udd30' },
    'active_window': { icon: '\uf121', label: '  Visual Studio Code' },
    'clock': { icon: '', label: new Date().toLocaleTimeString('en-US', {hour: '2-digit', minute: '2-digit', hour12: false}) },
    'sysinfo': { icon: '', label: 'MEM | CPU | GPU | Disk' },
    'volume': { icon: icon || '\uf027', label: ' 50' },
    'microphone': { icon: icon || '\uf130', label: '' },
    'media': { icon: icon || '', label: '\uf025' },
    'cava': { icon: '', label: '' },
    'wifi': { icon: icon || '\ueba9', label: '' },
    'battery': { icon: icon || '\uf240', label: ' 85%' },
    'bluetooth': { icon: icon || '\udb80\udcaf', label: ' 2' },
    'notifications': { icon: icon || '\uf476', label: ' 3' },
    'systray': { icon: '\uf47d', label: '' },
    'power_menu': { icon: icon || '\uf011', label: '' },
    'apps': { icon: '', label: '\ueb03 \uf282 \uf489' },
    'bin': { icon: icon || '\udb82\ude79', label: ' 12 (2.4MB)' },
    'theme_switcher': { icon: icon || '\udb83\ude09', label: '' },
  };
  
  // Get sample data for this widget
  let sampleData = widgetSamples[widgetName];
  
  if (!sampleData) {
    // Generic placeholder parsing
    label = label
      .replace(/\\u([0-9a-fA-F]{4})/g, (match, code) => String.fromCharCode(parseInt(code, 16)))
      .replace(/\\udb([0-9a-fA-F]{2})\\ud([0-9a-fA-F]{3})/g, '')
      .replace(/\{[^}]+\}/g, (match) => {
        if (match.includes('percent') || match.includes('level')) return '75';
        if (match.includes('count')) return '3';
        if (match.includes('title')) return 'Song';
        if (match.includes('device_count')) return '2';
        if (match.includes('items_count')) return '5';
        if (match.includes('items_size')) return '1.2MB';
        if (match.includes('%H:%M:%S')) return new Date().toLocaleTimeString('en-US', {hour12: false});
        if (match.includes('%H:%M')) return new Date().toLocaleTimeString('en-US', {hour: '2-digit', minute: '2-digit', hour12: false});
        return '';
      })
      .trim();
    
    if (label === '<span></span>' || label === '') label = '';
    sampleData = { icon: icon, label: label };
  }
  
  return `
    <div class="widget">
      <div class="widget-container">
        ${sampleData.icon ? `<span class="icon">${sampleData.icon}</span>` : ''}
        ${sampleData.label ? `<span class="label">${sampleData.label}</span>` : ''}
      </div>
    </div>
  `;
}

// Parse bars from config
function parseConfigBars() {
  if (!editorState.config) {
    console.warn('No config loaded');
    return [];
  }
  
  console.log('Config length:', editorState.config.length);
  console.log('First 500 chars:', editorState.config.substring(0, 500));
  
  const lines = editorState.config.split('\n');
  console.log('Total lines:', lines.length);
  
  const bars = [];
  let currentBar = null;
  let inBarsSection = false;
  let inBarSection = false;
  let inWidgetsSection = false;
  let currentPosition = '';
  let depth = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Detect bars: section
    if (line.match(/^bars:/)) {
      console.log(`Line ${i}: Found bars section`);
      inBarsSection = true;
      continue;
    }
    
    if (inBarsSection) {
      // Detect bar name (e.g., "  primary-bar:")
      if (line.match(/^  ([\w-]+):/)) {
        if (currentBar) {
          console.log('Pushing bar:', currentBar);
          bars.push(currentBar);
        }
        const barName = line.match(/^  ([\w-]+):/)[1];
        console.log(`Line ${i}: Found bar "${barName}"`);
        currentBar = { name: barName, widgets: { left: [], center: [], right: [] } };
        inBarSection = true;
        inWidgetsSection = false;
        continue;
      }
      
      // Detect widgets: section within a bar
      if (inBarSection && line.match(/^    widgets:/)) {
        console.log(`Line ${i}: Found widgets section in bar`);
        inWidgetsSection = true;
        continue;
      }
      
      // Detect position (left/center/right)
      if (inWidgetsSection && line.match(/^      (left|center|right):/)) {
        currentPosition = line.match(/^      (left|center|right):/)[1];
        console.log(`Line ${i}: Found position "${currentPosition}"`);
        continue;
      }
      
      // Detect widget name (with quotes) - handle both Unix (\n) and Windows (\r\n) line endings
      if (inWidgetsSection && currentPosition) {
        const match = line.match(/^        - "([^"]+)"/);
        if (match) {
          const widgetName = match[1];
          console.log(`Line ${i}: Found widget "${widgetName}" in position "${currentPosition}"`);
          currentBar.widgets[currentPosition].push(widgetName);
          continue;
        }
      }
      
      // Exit bars section when we hit top-level key (no leading spaces)
      if (line.match(/^[a-z]/)) {
        console.log(`Line ${i}: Exiting bars section`);
        if (currentBar) bars.push(currentBar);
        inBarsSection = false;
        break;
      }
    }
  }
  
  if (currentBar && !bars.includes(currentBar)) {
    console.log('Pushing final bar:', currentBar);
    bars.push(currentBar);
  }
  
  console.log('Final parsed bars:', bars);
  return bars;
}

// Parse widget configurations from config YAML
function parseWidgetConfigs() {
  if (!editorState.config) {
    console.warn('No config loaded for widget parsing');
    return {};
  }
  
  const lines = editorState.config.split('\n');
  const widgets = {};
  let inWidgetsSection = false;
  let currentWidget = null;
  let currentWidgetName = '';
  let inOptionsSection = false;
  let depth = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Detect widgets: section
    if (line.match(/^widgets:/)) {
      inWidgetsSection = true;
      continue;
    }
    
    if (inWidgetsSection) {
      // Detect widget name (e.g., "  home:")
      const widgetMatch = line.match(/^  (\w+):/);
      if (widgetMatch) {
        // Save previous widget if exists
        if (currentWidget && currentWidgetName) {
          widgets[currentWidgetName] = currentWidget;
        }
        currentWidgetName = widgetMatch[1];
        currentWidget = { options: {} };
        inOptionsSection = false;
        continue;
      }
      
      // Detect options: section
      if (currentWidget && line.match(/^    options:/)) {
        inOptionsSection = true;
        continue;
      }
      
      // Parse label within options
      if (inOptionsSection && line.match(/^      label:/)) {
        const labelMatch = line.match(/^      label:\s*(.+)$/);
        if (labelMatch) {
          let label = labelMatch[1].trim();
          // Remove quotes if present
          if ((label.startsWith('"') && label.endsWith('"')) || 
              (label.startsWith("'") && label.endsWith("'"))) {
            label = label.slice(1, -1);
          }
          currentWidget.options.label = label;
        }
        continue;
      }
      
      // Exit widgets section when we hit another top-level section
      if (line.match(/^[a-z]/) && !line.match(/^  /)) {
        if (currentWidget && currentWidgetName) {
          widgets[currentWidgetName] = currentWidget;
        }
        break;
      }
    }
  }
  
  // Save last widget if exists
  if (currentWidget && currentWidgetName) {
    widgets[currentWidgetName] = currentWidget;
  }
  
  console.log('Parsed widget configs:', widgets);
  return widgets;
}

window.switchBarPreview = function(index) {
  const containers = document.querySelectorAll('.bar-preview-container');
  containers.forEach((c, i) => {
    if (i === index) {
      c.classList.add('active');
    } else {
      c.classList.remove('active');
    }
  });
};

function renderEditorPanels(theme, sub) {
  const manifest = editorState.manifest || {};
  const meta = manifest.meta || {};
  const wallpaperEngine = manifest['wallpaper-engine'] || {};
  const rootVars = manifest['root-variables'] || {};
  
  // Generate color inputs for ALL root variables
  let colorInputsHtml = '';
  const colorVars = Object.keys(rootVars).filter(key => 
    key.startsWith('--') && (rootVars[key].startsWith('#') || rootVars[key].startsWith('rgb'))
  );
  
  for (const varName of colorVars) {
    const value = rootVars[varName];
    const displayName = varName.replace(/^--/, '').replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    const inputId = `color-${varName.replace(/^--/, '').replace(/-/g, '_')}`;
    
    // Extract hex color from rgba if needed
    let hexValue = value;
    if (value.startsWith('rgba') || value.startsWith('rgb')) {
      // For rgba/rgb, we'll use a default color picker value
      hexValue = '#888888';
    }
    
    colorInputsHtml += `
      <div class="form-group">
        <label class="form-label">${displayName}</label>
        <div class="color-input-group">
          <input type="color" class="color-preview" id="${inputId}" value="${hexValue}" data-var="${varName}">
          <input type="text" class="form-input" id="${inputId}-text" value="${value}" data-var="${varName}">
        </div>
      </div>
    `;
  }
  
  const wallpaperEnabled = wallpaperEngine.enabled !== false;
  const workshopId = wallpaperEngine.link ? wallpaperEngine.link.match(/id=(\d+)/)?.[1] || '' : '';
  
  return `
    <!-- Metadata Panel -->
    <div class="editor-panel">
      <h4><span class="editor-panel-icon">📝</span> Metadata</h4>
      <div class="form-group">
        <label class="form-label">Sub-theme Name</label>
        <input type="text" class="form-input" id="meta-name" value="${meta.name || sub.name}" placeholder="Enter name">
      </div>
      <div class="form-group">
        <label class="form-label">Version</label>
        <input type="text" class="form-input" id="meta-version" value="${meta.version || '1.0.0'}" placeholder="1.0.0">
      </div>
    </div>
    
    <!-- Color Variables Panel -->
    <div class="editor-panel" style="max-height: 400px; overflow-y: auto;">
      <h4><span class="editor-panel-icon">🎨</span> Theme Colors</h4>
      ${colorInputsHtml || '<p style="color: #9aa0c0;">No color variables found</p>'}
    </div>
    
    <!-- Wallpaper Panel -->
    <div class="editor-panel">
      <h4><span class="editor-panel-icon">🖼️</span> Wallpaper Settings</h4>
      <div class="wallpaper-setting">
        <div class="toggle-switch ${wallpaperEnabled ? 'enabled' : ''}" id="wallpaper-toggle" onclick="toggleWallpaper()">
          <div class="toggle-knob"></div>
        </div>
        <span style="color: #cbd4ff; font-size: 14px;">Wallpaper ${wallpaperEnabled ? 'Enabled' : 'Disabled'}</span>
      </div>
      <div class="form-group">
        <label class="form-label">Workshop ID</label>
        <input type="text" class="form-input" id="workshop-id" value="${workshopId}" placeholder="Enter Steam Workshop ID" ${!wallpaperEnabled ? 'disabled' : ''}>
      </div>
      <div class="form-group">
        <label class="form-label">Workshop Link</label>
        <input type="text" class="form-input" id="workshop-link" value="${wallpaperEngine.link || ''}" placeholder="https://steamcommunity.com/sharedfiles/filedetails/?id=..." ${!wallpaperEnabled ? 'disabled' : ''}>
      </div>
    </div>
    
    <!-- Widgets Panel -->
    <div class="editor-panel" style="grid-column: 1 / -1;">
      <h4><span class="editor-panel-icon">📦</span> Status Bar Widgets</h4>
      <div class="widget-list" id="widget-list">
        ${renderWidgetList()}
      </div>
    </div>
    
    <!-- Save Button -->
    <div class="editor-panel" style="grid-column: 1 / -1;">
      <button class="save-btn" onclick="saveEditorChanges()">Save Changes</button>
    </div>
  `;
}

function renderWidgetList() {
  const bars = parseConfigBars();
  if (!bars || bars.length === 0) return '<p style="color: #9aa0c0; text-align: center;">No widgets found</p>';
  
  try {
    // Create tabs for each bar
    let tabsHtml = '';
    let contentHtml = '';
    
    for (let barIndex = 0; barIndex < bars.length; barIndex++) {
      const bar = bars[barIndex];
      const isActive = barIndex === 0;
      
      // Tab button
      tabsHtml += `
        <button class="widget-bar-tab ${isActive ? 'active' : ''}" onclick="switchWidgetBar(${barIndex})">
          ${bar.name}
        </button>
      `;
      
      // Content for this bar
      let barContentHtml = '';
      
      // Group widgets by position
      const positions = ['left', 'center', 'right'];
      for (const pos of positions) {
        const widgets = bar.widgets[pos] || [];
        
        // Add section divider with add button (show even if empty)
        barContentHtml += `
          <div class="widget-section-divider">
            <span>${pos}</span>
            <button class="widget-btn" onclick="addWidget('${bar.name}', '${pos}')" title="Add widget" style="background: var(--accent2); margin-left: auto;">+</button>
          </div>
        `;
        
        // Add widgets for this position
        if (widgets.length > 0) {
          for (let i = 0; i < widgets.length; i++) {
            const widgetName = widgets[i];
            barContentHtml += `
              <div class="widget-item" draggable="true">
                <span class="widget-drag-handle">⋮⋮</span>
                <span class="widget-name">${widgetName}</span>
                <div class="widget-actions">
                  <button class="widget-btn" onclick="moveWidgetUp('${bar.name}', '${pos}', ${i})" title="Move up">▲</button>
                  <button class="widget-btn" onclick="moveWidgetDown('${bar.name}', '${pos}', ${i})" title="Move down">▼</button>
                  <button class="widget-btn" onclick="removeWidget('${bar.name}', '${pos}', ${i})" title="Remove">✕</button>
                </div>
              </div>
            `;
          }
        } else {
          // Show placeholder for empty position
          barContentHtml += `
            <div style="color: #6b6f85; font-size: 12px; padding: 8px 12px; text-align: center;">
              No widgets - click + to add
            </div>
          `;
        }
      }
      
      contentHtml += `
        <div class="widget-bar-content ${isActive ? 'active' : ''}" data-bar-index="${barIndex}">
          ${barContentHtml}
        </div>
      `;
    }
    
    return `
      <div class="widget-bar-tabs">
        ${tabsHtml}
      </div>
      ${contentHtml}
    `;
  } catch (e) {
    console.error('Error rendering widget list:', e);
    return '<p style="color: #ff6b6b; text-align: center;">Error loading widgets</p>';
  }
}

window.switchWidgetBar = function(index) {
  const tabs = document.querySelectorAll('.widget-bar-tab');
  const contents = document.querySelectorAll('.widget-bar-content');
  
  tabs.forEach((tab, i) => {
    if (i === index) {
      tab.classList.add('active');
    } else {
      tab.classList.remove('active');
    }
  });
  
  contents.forEach((content, i) => {
    if (i === index) {
      content.classList.add('active');
    } else {
      content.classList.remove('active');
    }
  });
};

// Widget management functions
window.moveWidgetUp = function(barName, position, index) {
  if (!editorState.config || index <= 0) return;
  
  const bars = parseConfigBars();
  const bar = bars.find(b => b.name === barName);
  if (!bar || !bar.widgets[position]) return;
  
  const widgets = bar.widgets[position];
  if (index >= widgets.length) return;
  
  // Swap with previous widget
  [widgets[index - 1], widgets[index]] = [widgets[index], widgets[index - 1]];
  
  // Update config string
  updateConfigWithBars(bars);
  
  // Re-render
  renderEditor();
  showToast('Widget moved up', 'success', 2);
};

window.moveWidgetDown = function(barName, position, index) {
  if (!editorState.config) return;
  
  const bars = parseConfigBars();
  const bar = bars.find(b => b.name === barName);
  if (!bar || !bar.widgets[position]) return;
  
  const widgets = bar.widgets[position];
  if (index >= widgets.length - 1) return;
  
  // Swap with next widget
  [widgets[index], widgets[index + 1]] = [widgets[index + 1], widgets[index]];
  
  // Update config string
  updateConfigWithBars(bars);
  
  // Re-render
  renderEditor();
  showToast('Widget moved down', 'success', 2);
};

window.removeWidget = function(barName, position, index) {
  if (!editorState.config) return;
  
  const bars = parseConfigBars();
  const bar = bars.find(b => b.name === barName);
  if (!bar || !bar.widgets[position]) return;
  
  const widgets = bar.widgets[position];
  if (index >= widgets.length) return;
  
  const widgetName = widgets[index];
  const confirmed = confirm(`Remove widget "${widgetName}" from ${position}?`);
  if (!confirmed) return;
  
  // Remove widget
  widgets.splice(index, 1);
  
  // Update config string
  updateConfigWithBars(bars);
  
  // Re-render
  renderEditor();
  showToast('Widget removed', 'success', 2);
};

window.addWidget = function(barName, position) {
  if (!editorState.config) return;
  
  // Get all available widgets from config
  const availableWidgets = getAllAvailableWidgets();
  if (!availableWidgets || availableWidgets.length === 0) {
    showToast('No widgets found in config.yaml', 'warn');
    return;
  }
  
  // Create dropdown overlay
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
  `;
  
  const panel = document.createElement('div');
  panel.style.cssText = `
    background: linear-gradient(180deg, #1a1a2e, #0f0f1a);
    border-radius: 12px;
    padding: 24px;
    max-width: 400px;
    width: 90%;
    max-height: 500px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
  `;
  
  const title = document.createElement('h3');
  title.textContent = `Add Widget to ${position}`;
  title.style.cssText = `
    margin: 0 0 16px 0;
    color: #cbd4ff;
    font-size: 18px;
  `;
  
  const widgetList = document.createElement('div');
  widgetList.style.cssText = `
    max-height: 350px;
    overflow-y: auto;
    margin-bottom: 16px;
  `;
  
  // Add each widget as a clickable item
  availableWidgets.forEach(widgetName => {
    const item = document.createElement('div');
    item.textContent = widgetName;
    item.style.cssText = `
      padding: 10px 12px;
      margin: 4px 0;
      background: rgba(255, 255, 255, 0.05);
      border-radius: 6px;
      color: #cbd4ff;
      cursor: pointer;
      transition: all 0.2s;
    `;
    
    item.addEventListener('mouseenter', () => {
      item.style.background = 'var(--accent2, #00dfff)';
      item.style.color = '#0a0a14';
    });
    
    item.addEventListener('mouseleave', () => {
      item.style.background = 'rgba(255, 255, 255, 0.05)';
      item.style.color = '#cbd4ff';
    });
    
    item.addEventListener('click', () => {
      const bars = parseConfigBars();
      const bar = bars.find(b => b.name === barName);
      if (!bar || !bar.widgets[position]) return;
      
      // Add widget to position
      bar.widgets[position].push(widgetName);
      
      // Update config string
      updateConfigWithBars(bars);
      
      // Re-render
      renderEditor();
      showToast(`Added ${widgetName} to ${position}`, 'success', 2);
      
      // Close overlay
      overlay.remove();
    });
    
    widgetList.appendChild(item);
  });
  
  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Cancel';
  cancelBtn.style.cssText = `
    width: 100%;
    padding: 10px;
    background: rgba(255, 255, 255, 0.1);
    border: none;
    border-radius: 6px;
    color: #cbd4ff;
    cursor: pointer;
    font-size: 14px;
  `;
  
  cancelBtn.addEventListener('click', () => overlay.remove());
  
  panel.appendChild(title);
  panel.appendChild(widgetList);
  panel.appendChild(cancelBtn);
  overlay.appendChild(panel);
  
  // Close on overlay click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
  
  document.body.appendChild(overlay);
};

// Helper function to get all available widgets from config
function getAllAvailableWidgets() {
  if (!editorState.config) return [];
  
  const lines = editorState.config.split('\n');
  const widgets = [];
  let inWidgetsSection = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Detect widgets: section
    if (line.match(/^widgets:/)) {
      inWidgetsSection = true;
      continue;
    }
    
    if (inWidgetsSection) {
      // Detect widget name (e.g., "  home:")
      const widgetMatch = line.match(/^  (\w+):/);
      if (widgetMatch) {
        widgets.push(widgetMatch[1]);
        continue;
      }
      
      // Exit widgets section when we hit another top-level section
      if (line.match(/^[a-z]/) && !line.match(/^  /)) {
        break;
      }
    }
  }
  
  return widgets.sort();
}

// Helper function to update config YAML with modified bars
function updateConfigWithBars(bars) {
  if (!editorState.config) return;
  
  const lines = editorState.config.split('\n');
  const newLines = [];
  let inBarsSection = false;
  let skipUntilNextSection = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Detect bars: section start
    if (line.match(/^bars:/)) {
      inBarsSection = true;
      newLines.push(line);
      
      // Insert all bars
      for (const bar of bars) {
        newLines.push(`  ${bar.name}:`);
        newLines.push(`    widgets:`);
        
        for (const pos of ['left', 'center', 'right']) {
          newLines.push(`      ${pos}:`);
          for (const widget of bar.widgets[pos]) {
            newLines.push(`        - "${widget}"`);
          }
        }
      }
      
      skipUntilNextSection = true;
      continue;
    }
    
    // Skip old bar content until next top-level section
    if (skipUntilNextSection) {
      if (line.match(/^[a-z]/) && !line.match(/^  /)) {
        skipUntilNextSection = false;
        inBarsSection = false;
        newLines.push(line);
      }
      continue;
    }
    
    newLines.push(line);
  }
  
  editorState.config = newLines.join('\n');
  editorState.unsavedChanges = true;
}

window.toggleWallpaper = async function() {
  const toggle = document.getElementById('wallpaper-toggle');
  const isEnabled = toggle.classList.contains('enabled');
  
  if (isEnabled) {
    // Disable
    const result = await window.themeAPI.disableSubWallpaper(editorState.selectedTheme, editorState.selectedSub);
    if (result && result.ok) {
      showToast('Wallpaper disabled', 'success');
      renderEditor();
    }
  } else {
    // Enable
    const result = await window.themeAPI.enableSubWallpaper(editorState.selectedTheme, editorState.selectedSub);
    if (result && result.ok) {
      showToast('Wallpaper enabled', 'success');
      renderEditor();
    }
  }
};

window.saveEditorChanges = async function() {
  if (!editorState.unsavedChanges) {
    showToast('No changes to save', 'info');
    return;
  }
  
  if (!editorState.selectedTheme || !editorState.selectedSub) {
    showToast('No theme selected', 'error');
    return;
  }
  
  try {
    // Gather all edits from the UI
    const updates = {
      config: editorState.config,
      manifest: { ...editorState.manifest }
    };
    
    // Update metadata
    const metaName = document.getElementById('meta-name');
    const metaVersion = document.getElementById('meta-version');
    if (metaName && metaVersion) {
      if (!updates.manifest.meta) updates.manifest.meta = {};
      updates.manifest.meta.name = metaName.value.trim();
      updates.manifest.meta.version = metaVersion.value.trim();
    }
    
    // Update color variables
    const colorInputs = document.querySelectorAll('.form-input[id$="-text"]');
    if (colorInputs.length > 0) {
      if (!updates.manifest['root-variables']) updates.manifest['root-variables'] = {};
      colorInputs.forEach(input => {
        const varName = input.dataset.var;
        if (varName && varName.startsWith('--')) {
          updates.manifest['root-variables'][varName] = input.value.trim();
        }
      });
    }
    
    // Update wallpaper settings
    const workshopId = document.getElementById('workshop-id');
    const workshopLink = document.getElementById('workshop-link');
    if (workshopId && workshopLink) {
      if (!updates.manifest['wallpaper-engine']) updates.manifest['wallpaper-engine'] = {};
      
      // Keep existing enabled state
      const toggle = document.getElementById('wallpaper-toggle');
      updates.manifest['wallpaper-engine'].enabled = toggle && toggle.classList.contains('enabled');
      
      const link = workshopLink.value.trim();
      updates.manifest['wallpaper-engine'].link = link;
      
      // Extract file from workshop ID or link
      let fileId = workshopId.value.trim();
      if (!fileId && link) {
        const match = link.match(/id=(\d+)/);
        if (match) fileId = match[1];
      }
      if (fileId) {
        updates.manifest['wallpaper-engine'].file = fileId;
      }
    }
    
    // Save config.yaml
    console.log('Saving config.yaml...');
    const configResult = await window.themeAPI.writeThemeFile(
      editorState.selectedTheme,
      'config.yaml',
      updates.config
    );
    
    if (configResult && configResult.error) {
      showToast('Failed to save config.yaml: ' + configResult.error, 'error');
      return;
    }
    
    // Save manifest.json
    console.log('Saving manifest.json...');
    const manifestResult = await window.themeAPI.writeSubThemeManifest(
      editorState.selectedTheme,
      editorState.selectedSub,
      updates.manifest
    );
    
    if (manifestResult && manifestResult.error) {
      showToast('Failed to save manifest.json: ' + manifestResult.error, 'error');
      return;
    }
    
    // Success
    editorState.unsavedChanges = false;
    showToast('Changes saved successfully!', 'success');
    
    // Update the manifest in state
    editorState.manifest = updates.manifest;
    
  } catch (e) {
    console.error('Save error:', e);
    showToast('Failed to save: ' + e.message, 'error');
  }
};

// Sync color inputs (delegated event listener for dynamic elements)
document.addEventListener('input', (e) => {
  if (e.target.type === 'color' && e.target.classList.contains('color-preview')) {
    const textInput = document.getElementById(e.target.id + '-text');
    if (textInput) textInput.value = e.target.value;
  } else if (e.target.classList.contains('form-input') && e.target.id.endsWith('-text')) {
    const colorId = e.target.id.replace('-text', '');
    const colorInput = document.getElementById(colorId);
    if (colorInput && colorInput.type === 'color') {
      // Only update if it's a valid hex color
      if (/^#[0-9A-F]{6}$/i.test(e.target.value)) {
        colorInput.value = e.target.value;
      }
    }
  }
});

// ===== OLD SIMPLE EDITOR (DEPRECATED) =====
async function loadEditorContent() {
  const editorContent = document.getElementById('editor-content');
  if (!editorContent) return;
  
  try {
    // Get all themes
    const loaded = await window.themeAPIAsync.getThemes();
    if (!loaded || loaded.error) {
      editorContent.innerHTML = '<p style="color: #ff6b6b;">Error loading themes</p>';
      return;
    }
    
    const themeNames = Object.keys(loaded);
    let html = '';
    
    for (const themeName of themeNames) {
      const theme = loaded[themeName];
      if (!theme.subs || theme.subs.length === 0) continue;
      
      html += `
        <div class="editor-section">
          <h3>${theme.meta?.name || themeName}</h3>
      `;
      
      for (const sub of theme.subs) {
        const hasWallpaper = sub.manifest && sub.manifest['wallpaper-engine'];
        if (!hasWallpaper) continue;
        
        const wallpaperEnabled = sub.manifest['wallpaper-engine'].enabled !== false;
        const statusClass = wallpaperEnabled ? 'enabled' : 'disabled';
        const statusText = wallpaperEnabled ? 'Wallpaper Enabled' : 'Wallpaper Disabled';
        
        html += `
          <div class="sub-theme-item" data-theme="${themeName}" data-sub="${sub.name}">
            <div class="sub-theme-info">
              <div class="sub-theme-name">${sub.meta?.name || sub.name}</div>
              <div class="sub-theme-status ${statusClass}">${statusText}</div>
            </div>
            <div class="sub-theme-actions">
              ${wallpaperEnabled 
                ? `<button class="action-btn danger" onclick="disableWallpaper('${themeName}', '${sub.name}')">Disable Wallpaper</button>`
                : `<button class="action-btn primary" onclick="enableWallpaper('${themeName}', '${sub.name}')">Re-enable Wallpaper</button>`
              }
            </div>
          </div>
        `;
      }
      
      html += '</div>';
    }
    
    if (!html) {
      html = '<p style="color: #9aa0c0; text-align: center; padding: 40px;">No themes with wallpapers found</p>';
    }
    
    editorContent.innerHTML = html;
  } catch (e) {
    console.error('Error loading editor content:', e);
    editorContent.innerHTML = '<p style="color: #ff6b6b;">Error loading editor content</p>';
  }
}

// Global functions for button onclick handlers
window.enableWallpaper = async function(theme, sub) {
  try {
    const result = await window.themeAPI.enableSubWallpaper(theme, sub);
    if (result && result.ok) {
      showToast(`Wallpaper re-enabled for ${sub}`, 'success');
      loadEditorContent(); // Reload to update UI
    } else {
      showToast(`Failed to re-enable: ${result?.error || 'unknown error'}`, 'error');
    }
  } catch (e) {
    showToast(`Error: ${e.message}`, 'error');
  }
};

window.disableWallpaper = async function(theme, sub) {
  try {
    const result = await window.themeAPI.disableSubWallpaper(theme, sub);
    if (result && result.ok) {
      showToast(`Wallpaper disabled for ${sub}`, 'success');
      loadEditorContent(); // Reload to update UI
    } else {
      showToast(`Failed to disable: ${result?.error || 'unknown error'}`, 'error');
    }
  } catch (e) {
    showToast(`Error: ${e.message}`, 'error');
  }
};
