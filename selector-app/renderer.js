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
    alert('Error loading themes: ' + msg);
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
  // Apply button inside the card footer
  const applyBtnCard = document.createElement('button');
  applyBtnCard.className = 'apply-btn';
  applyBtnCard.textContent = 'Apply';
  applyBtnCard.addEventListener('click', (ev) => {
    ev.stopPropagation();
    applyTheme(themeName);
  });
  left.appendChild(applyBtnCard);

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

  // Interaction: click opens theme page; double-click still applies the theme
  card.addEventListener('click', (ev) => {
    ev.stopPropagation();
    window.themeWindow.openThemePage(themeName)
      .then(res => {
        if (res && res.error) console.warn('openThemePage error', res.error);
      })
      .catch(err => console.warn('openThemePage failed', err));
  });
  card.addEventListener('dblclick', (ev) => {
    ev.stopPropagation();
    applyTheme(themeName);
  });

  return card;
}

async function showPreview(themeName) {
  previewContainer.innerHTML = '';  // clear
  const info = themes[themeName];
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
      // If the backend signals a need for sub-theme selection, open the theme page so
      // the user can pick a sub-theme (the page will call applyTheme again with theme/sub)
      if (result && result.needs_sub) {
        try {
          await window.themeWindow.openThemePage(result.theme);
        } catch (e) {
          console.warn('Failed to open theme page for sub selection', e);
          alert('Please select a sub-theme from the theme page.');
        }
        return;
      }

      if (result && result.ok) {
        alert('Theme applied: ' + themeName + "\n" + (result.output || ''));
      } else if (typeof result === 'string') {
        alert('Theme applied: ' + themeName + "\n" + result);
      } else {
        alert('Theme applied: ' + themeName + "\n" + JSON.stringify(result));
      }
    })
    .catch(err => {
      alert('Failed to apply theme: ' + err);
    });
}

// Cycle button handler
if (cycleBtn) {
  cycleBtn.addEventListener('click', () => {
    window.themeAPI.cycleTheme()
      .then(out => {
        alert('Cycled theme\n' + (out || ''));
      })
      .catch(err => {
        alert('Failed to cycle theme: ' + err);
      });
  });
}

// Apply selected button handler
if (applyBtn) {
  applyBtn.addEventListener('click', () => {
    if (!selectedTheme) {
      alert('No theme selected');
      return;
    }
    applyTheme(selectedTheme);
  });
}