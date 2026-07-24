window.Noyza = {
  PluginType: { Provider: "provider" },
  extensions: {
    plugins: [],
    register(plugin) { this.plugins.push(plugin); }
  }
};

let accountData = { theme: 'serenity', mode: 'system', volume: 1.0 };
let playerState = { queue: [], originalQueue: [], index: -1, autoplayMode: 'shuffle', pluginId: "", isPlaying: false, currentTime: 0 };
let currentQueue = [];
let originalQueue = [];
let queueIndex = -1;
let autoplayMode = 'shuffle';
let isShuffle = false;
let currentPluginId = "";
let isPlaying = false;
let downloadTimer = null;
let lastSaveTime = 0;

const modes = ['shuffle', 'repeat', 'loop1', 'noautoplay'];
const modeIcons = {
  'shuffle': '/assets/images/player/Shuffle.svg',
  'repeat': '/assets/images/player/Repeat.svg',
  'loop1': '/assets/images/player/Loop1.svg',
  'noautoplay': '/assets/images/player/NoAutoplay.svg'
};

async function loadAccount() {
  const local = localStorage.getItem('noyza_account');
  if (local) accountData = JSON.parse(local);
  else {
    try {
      const res = await fetch('/data/account.json');
      if (res.ok) { accountData = await res.json(); saveAccount(); }
    } catch (e) {}
  }
  applyTheme();
}

function saveAccount() {
  localStorage.setItem('noyza_account', JSON.stringify(accountData));
}

function savePlayerState() {
  playerState.queue = currentQueue;
  playerState.originalQueue = originalQueue;
  playerState.index = queueIndex;
  playerState.autoplayMode = autoplayMode;
  playerState.pluginId = currentPluginId;
  playerState.isPlaying = isPlaying;
  localStorage.setItem('noyza_player_state', JSON.stringify(playerState));
}

function applyTheme() {
  const link = document.getElementById('theme-stylesheet');
  if (link) link.href = `/themes/${accountData.theme}.css`;

  let mode = accountData.mode;
  if (mode === 'system') mode = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.body.setAttribute('data-theme-mode', mode);
}

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (accountData.mode === 'system') applyTheme();
});

function getPlugin(id) {
  return window.Noyza.extensions.plugins.find(p => p.getInfo().id === id);
}

async function bootPlugins() {
  let plugins = JSON.parse(localStorage.getItem('noyza_installed_plugins') || '[]');
  if (plugins.length === 0) {
    plugins = [{ url: '/plugins/ArchiveCH.js', code: '', id: 'ArchiveCH' }];
  }
  
  for (let i = 0; i < plugins.length; i++) {
    const p = plugins[i];
    let codeToRun = p.code;
    try {
      const res = await fetch(p.url);
      if (res.ok) {
        const freshCode = await res.text();
        p.code = freshCode;
        codeToRun = freshCode;
      }
    } catch (e) {}
    
    if (codeToRun) {
      try {
        const script = document.createElement('script');
        script.textContent = codeToRun;
        document.head.appendChild(script);
      } catch (err) {}
    }
  }
  localStorage.setItem('noyza_installed_plugins', JSON.stringify(plugins));
}

(async () => {
  await loadAccount();
  await bootPlugins();
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }
})();

async function initApp() {
  initUIBindings();

  const currentPath = window.location.pathname;
  if (currentPath.includes('track.html')) {
    renderTrackPage();
  } else if (currentPath.includes('search.html')) {
    initSearchPage();
  } else if (currentPath.includes('settings.html')) {
    initSettingsPage();
  } else {
    initSections();
    checkForAppUpdates();
  }

  await restoreSession();
  initPlayer();
}

function initUIBindings() {
  const currentPath = window.location.pathname;
  const navHome = document.getElementById('nav-home');
  const navDiscover = document.getElementById('nav-discover');
  const navSettings = document.getElementById('nav-settings');
  
  if (currentPath.includes('settings.html') && navSettings) navSettings.classList.add('active');
  else if (currentPath.includes('search.html') && navDiscover) navDiscover.classList.add('active');
  else if (!currentPath.includes('track.html') && navHome) navHome.classList.add('active');

  const themeSelect = document.getElementById('theme-select');
  const modeSelect = document.getElementById('mode-select');
  if (themeSelect && modeSelect) {
    themeSelect.value = accountData.theme;
    modeSelect.value = accountData.mode;
    themeSelect.addEventListener('change', (e) => { accountData.theme = e.target.value; saveAccount(); applyTheme(); });
    modeSelect.addEventListener('change', (e) => { accountData.mode = e.target.value; saveAccount(); applyTheme(); });
  }
}

async function initSections() {
  const sections = [ { id: 'grid-foryou', type: 'foryou' }, { id: 'grid-trending', type: 'trending' }, { id: 'grid-latest', type: 'latest' } ];
  for (const sec of sections) {
    const grid = document.getElementById(sec.id);
    if (!grid) continue;
    const wrapper = grid.parentElement;
    const leftBtn = wrapper.querySelector('.btn-scroll-left');
    const rightBtn = wrapper.querySelector('.btn-scroll-right');
    if (leftBtn) leftBtn.addEventListener('click', () => grid.scrollBy({ left: -300, behavior: 'smooth' }));
    if (rightBtn) rightBtn.addEventListener('click', () => grid.scrollBy({ left: 300, behavior: 'smooth' }));

    for (const plugin of window.Noyza.extensions.plugins) {
      try {
        const songs = await plugin.browse(sec.type);
        songs.forEach((song, index) => {
          const pastelClass = `bg-pastel-${(index % 4) + 1}`;
          const card = document.createElement('div');
          card.className = `album-card ${pastelClass}`;
          
          const art = document.createElement('div');
          art.className = 'album-art';
          art.style.backgroundImage = `url('${song.cover}')`;
          
          const info = document.createElement('div');
          info.className = 'album-info';
          
          const title = document.createElement('h3');
          title.className = 'title-sm';
          title.textContent = song.title;
          
          const artist = document.createElement('a');
          artist.className = 'artist-link label-caps';
          artist.href = `/search.html?q=from:${encodeURIComponent(song.artist)}`;
          artist.textContent = song.artist;
          artist.addEventListener('click', (e) => e.stopPropagation());
          
          info.appendChild(title); info.appendChild(artist);
          card.appendChild(art); card.appendChild(info);
          
          card.addEventListener('click', () => playQueue(songs, index, plugin.getInfo().id));
          grid.appendChild(card);
        });
      } catch (err) {}
    }
  }
}

async function initSearchPage() {
  const urlParams = new URLSearchParams(window.location.search);
  const query = urlParams.get('q') || '';
  const input = document.getElementById('search-input');
  if (input) input.value = query;
  
  if (query) {
    await performSearch(query);
  } else {
    await loadDiscoverDefault();
  }
  
  const searchBtn = document.getElementById('search-btn');
  if (searchBtn && input) {
    const handleSearchRedirect = () => {
      window.location.href = `/search.html?q=${encodeURIComponent(input.value)}`;
    };
    searchBtn.addEventListener('click', handleSearchRedirect);
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') handleSearchRedirect();
    });
  }
}

async function loadDiscoverDefault() {
  const resultsGrid = document.getElementById('search-results');
  const searchTitle = document.getElementById('search-title');
  if (!resultsGrid) return;
  resultsGrid.innerHTML = '';
  if (searchTitle) searchTitle.textContent = 'For You';
  
  for (const plugin of window.Noyza.extensions.plugins) {
    try {
      const songs = await plugin.browse('foryou');
      renderSongsToGrid(songs, resultsGrid, plugin.getInfo().id);
    } catch (e) {}
  }
}

function renderSongsToGrid(songs, grid, pluginId) {
  songs.forEach((song, index) => {
    const pastelClass = `bg-pastel-${(index % 4) + 1}`;
    const card = document.createElement('div');
    card.className = `album-card ${pastelClass}`;
    
    const art = document.createElement('div');
    art.className = 'album-art';
    art.style.backgroundImage = `url('${song.cover}')`;
    
    const info = document.createElement('div');
    info.className = 'album-info';
    
    const title = document.createElement('h3');
    title.className = 'title-sm';
    title.textContent = song.title;
    
    const artist = document.createElement('a');
    artist.className = 'artist-link label-caps';
    artist.href = `/search.html?q=from:${encodeURIComponent(song.artist)}`;
    artist.textContent = song.artist;
    artist.addEventListener('click', (e) => e.stopPropagation());
    
    info.appendChild(title); info.appendChild(artist);
    card.appendChild(art); card.appendChild(info);
    
    card.addEventListener('click', () => playQueue(songs, index, pluginId));
    grid.appendChild(card);
  });
}

async function performSearch(query) {
  const resultsGrid = document.getElementById('search-results');
  const searchTitle = document.getElementById('search-title');
  if (!resultsGrid) return;
  resultsGrid.innerHTML = '';
  
  const isArtistQuery = query.startsWith('from:');
  const filterArtist = isArtistQuery ? query.substring(5).toLowerCase() : '';
  
  if (searchTitle) {
    searchTitle.textContent = isArtistQuery ? `Tracks by ${query.substring(5)}` : `Search: ${query}`;
  }
  
  for (const plugin of window.Noyza.extensions.plugins) {
    try {
      let songs = [];
      if (isArtistQuery) {
        songs = await plugin.browse('all');
        songs = songs.filter(s => s.artist.toLowerCase() === filterArtist);
      } else {
        songs = await plugin.search(query);
      }
      renderSongsToGrid(songs, resultsGrid, plugin.getInfo().id);
    } catch (e) {}
  }
}

function initSettingsPage() {
  renderPluginsList();
  
  const installBtn = document.getElementById('btn-install-plugin');
  const urlInput = document.getElementById('plugin-url-input');
  
  if (installBtn && urlInput) {
    installBtn.addEventListener('click', async () => {
      const url = urlInput.value.trim();
      if (!url) return;
      
      try {
        const res = await fetch(url);
        if (res.ok) {
          const code = await res.text();
          
          const beforeCount = window.Noyza.extensions.plugins.length;
          const script = document.createElement('script');
          script.textContent = code;
          document.head.appendChild(script);
          const afterCount = window.Noyza.extensions.plugins.length;
          
          let newlyRegisteredId = "";
          if (afterCount > beforeCount) {
            newlyRegisteredId = window.Noyza.extensions.plugins[afterCount - 1].getInfo().id;
          }
          
          let plugins = JSON.parse(localStorage.getItem('noyza_installed_plugins') || '[]');
          if (!plugins.some(p => p.url === url)) {
            plugins.push({ url, code, id: newlyRegisteredId });
            localStorage.setItem('noyza_installed_plugins', JSON.stringify(plugins));
          }
          
          urlInput.value = '';
          renderPluginsList();
        } else {
          alert("Failed to fetch plugin.");
        }
      } catch (e) {
        alert("An error occurred while installing the plugin.");
      }
    });
  }
}

function renderPluginsList() {
  const container = document.getElementById('installed-plugins-list');
  if (!container) return;
  container.innerHTML = '';
  
  window.Noyza.extensions.plugins.forEach(p => {
    const info = p.getInfo();
    const row = document.createElement('div');
    row.className = 'plugin-row';
    
    const infoBlock = document.createElement('div');
    infoBlock.className = 'plugin-info-block';
    
    if (info.icon) {
      const iconImg = document.createElement('img');
      iconImg.className = 'plugin-icon-img';
      iconImg.src = info.icon;
      infoBlock.appendChild(iconImg);
    }
    
    const nameSpan = document.createElement('span');
    nameSpan.className = 'body-md';
    nameSpan.textContent = `${info.name} (by ${info.author})`;
    infoBlock.appendChild(nameSpan);
    
    row.appendChild(infoBlock);
    
    const uninstallBtn = document.createElement('button');
    uninstallBtn.className = 'btn-uninstall';
    uninstallBtn.textContent = 'Uninstall';
    uninstallBtn.addEventListener('click', () => {
      uninstallPlugin(info.id);
    });
    row.appendChild(uninstallBtn);
    
    container.appendChild(row);
  });
}

function uninstallPlugin(pluginId) {
  let plugins = JSON.parse(localStorage.getItem('noyza_installed_plugins') || '[]');
  plugins = plugins.filter(p => p.id !== pluginId && !p.url.includes(pluginId));
  localStorage.setItem('noyza_installed_plugins', JSON.stringify(plugins));
  window.location.reload();
}

async function checkForAppUpdates() {
  try {
    const res = await fetch('/api/needs-update');
    if (res.ok) {
      const data = await res.json();
      if (data.needsUpdate) {
        showUpdatePrompt();
      }
    }
  } catch (e) {}
}

function showUpdatePrompt() {
  const overlay = document.createElement('div');
  overlay.className = 'update-prompt-overlay';
  
  const card = document.createElement('div');
  card.className = 'update-prompt-card bg-pastel-3';
  
  const title = document.createElement('h3');
  title.className = 'title-sm';
  title.textContent = 'App Update Available';
  
  const body = document.createElement('p');
  body.className = 'body-md';
  body.textContent = 'A new version of Noyza is available. Please update to continue.';
  
  const btn = document.createElement('button');
  btn.className = 'btn-primary';
  btn.textContent = 'Update Now';
  btn.addEventListener('click', () => {
    window.location.href = '/update';
  });
  
  card.appendChild(title);
  card.appendChild(body);
  card.appendChild(btn);
  overlay.appendChild(card);
  document.body.appendChild(overlay);
}

async function renderTrackPage() {
  const hash = window.location.hash; 
  if(!hash.startsWith('#/')) return;
  const parts = hash.split('/');
  if(parts.length < 3) return;
  
  const pluginId = parts[1];
  const trackId = parts[2];
  const plugin = getPlugin(pluginId);
  if(!plugin) return;
  if(plugin.init) await plugin.init();
  
  try {
    const meta = await plugin.getSongMeta(trackId);
    const coverEl = document.getElementById('track-cover');
    const titleEl = document.getElementById('track-title');
    const artistEl = document.getElementById('track-artist');
    const descEl = document.getElementById('track-desc');
    const playBtn = document.getElementById('track-play-btn');
    
    if(coverEl) coverEl.style.backgroundImage = `url('${meta.cover}')`;
    if(titleEl) titleEl.textContent = meta.title;
    
    if(artistEl) {
      artistEl.innerHTML = '';
      const artistLink = document.createElement('a');
      artistLink.className = 'artist-link';
      artistLink.href = `/search.html?q=from:${encodeURIComponent(meta.artist)}`;
      artistLink.textContent = meta.artist;
      artistEl.appendChild(artistLink);
    }
    
    if(descEl) descEl.textContent = meta.desc;
    
    if(playBtn) {
      playBtn.addEventListener('click', () => {
        playQueue([meta], 0, pluginId);
      });
    }
  } catch(e) {}
}

function setAutoplayMode(mode) {
  autoplayMode = mode;
  const shuffleBtnImg = document.getElementById('icon-shuffle');
  if (shuffleBtnImg) shuffleBtnImg.src = modeIcons[mode];
  playerState.autoplayMode = mode;
  savePlayerState();
  
  if (mode === 'shuffle') {
    if (currentQueue.length > 0 && !isShuffle) {
      const current = currentQueue[queueIndex];
      originalQueue = [...currentQueue];
      const rest = currentQueue.filter((_, i) => i !== queueIndex);
      rest.sort(() => Math.random() - 0.5);
      currentQueue = [current, ...rest];
      queueIndex = 0;
    }
    isShuffle = true;
  } else {
    if (currentQueue.length > 0 && isShuffle) {
      const current = currentQueue[queueIndex];
      currentQueue = [...originalQueue];
      queueIndex = currentQueue.findIndex(s => s.id === current.id);
    }
    isShuffle = false;
  }
  updateQueueUI();
}

async function restoreSession() {
  const saved = localStorage.getItem('noyza_player_state');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      playerState = { ...playerState, ...parsed };
      currentQueue = playerState.queue || [];
      originalQueue = playerState.originalQueue || [];
      queueIndex = playerState.index;
      currentPluginId = playerState.pluginId;
      isPlaying = playerState.isPlaying;
      
      if (playerState.autoplayMode) {
        setAutoplayMode(playerState.autoplayMode);
      } else {
        setAutoplayMode('shuffle');
      }

      if (currentQueue.length > 0 && queueIndex >= 0) {
        updateQueueUI();
        const plugin = getPlugin(currentPluginId);
        if (plugin) {
          const baseSong = currentQueue[queueIndex];
          try {
            const fullSong = await plugin.getSong(baseSong.id);
            const audio = document.getElementById('audio-element');
            const titleDisplay = document.getElementById('player-title');
            const playerArt = document.getElementById('player-art');
            
            if (audio && titleDisplay) {
              audio.src = fullSong.url;
              titleDisplay.textContent = fullSong.title;
              if (playerArt) {
                playerArt.src = fullSong.cover;
                playerArt.style.display = 'block';
              }
              audio.currentTime = playerState.currentTime || 0;
              
              if (isPlaying) {
                const playPromise = audio.play();
                if (playPromise !== undefined) {
                  playPromise.catch(() => {
                    isPlaying = false;
                    setPlayIconState('paused');
                  });
                }
              }

              clearTimeout(downloadTimer);
              pollDownloadProgress();
            }
          } catch(e) {}
        }
      }
    } catch (e) {}
  }
}

function setPlayIconState(state) {
  const icon = document.getElementById('icon-play');
  if (!icon) return;
  icon.classList.remove('spinner');
  
  if (state === 'loading') {
    icon.src = '/assets/images/Loader.svg';
    icon.classList.add('spinner');
  } else if (state === 'playing') {
    icon.src = '/assets/images/player/Pause.svg';
  } else {
    icon.src = '/assets/images/player/Play.svg';
  }
}

async function playQueue(list, index, pluginId) {
  currentQueue = [...list];
  originalQueue = [...list];
  queueIndex = index;
  currentPluginId = pluginId;
  isShuffle = false; 
  
  setAutoplayMode(autoplayMode); 
  await loadAndPlayCurrent();
}

async function loadAndPlayCurrent() {
  if (queueIndex < 0 || queueIndex >= currentQueue.length) return;
  const plugin = getPlugin(currentPluginId);
  if (!plugin) return;
  
  const baseSong = currentQueue[queueIndex];
  try {
    setPlayIconState('loading');
    const fullSong = await plugin.getSong(baseSong.id);
    const audio = document.getElementById('audio-element');
    const titleDisplay = document.getElementById('player-title');
    const playerArt = document.getElementById('player-art');
    const dlFill = document.getElementById('download-fill');
    
    if (audio && titleDisplay) {
      audio.src = fullSong.url;
      titleDisplay.textContent = fullSong.title;
      if (playerArt) {
        playerArt.src = fullSong.cover;
        playerArt.style.display = 'block';
      }
      if (dlFill) dlFill.style.width = `${fullSong.downloadProgress !== undefined ? fullSong.downloadProgress : 100}%`;
      
      audio.play().then(() => { isPlaying = true; savePlayerState(); }).catch(()=>{});
    }

    clearTimeout(downloadTimer);
    pollDownloadProgress();
    savePlayerState();
  } catch (err) {
    setPlayIconState('paused');
  }
}

async function pollDownloadProgress() {
  if (queueIndex < 0 || queueIndex >= currentQueue.length) return;
  const plugin = getPlugin(currentPluginId);
  if (!plugin || !plugin.updateTrack) return;

  const baseSong = currentQueue[queueIndex];
  try {
    const updated = await plugin.updateTrack(baseSong.id);
    const dlProgress = updated.downloadProgress !== undefined ? updated.downloadProgress : 100;
    const dlFill = document.getElementById('download-fill');
    if (dlFill) dlFill.style.width = `${dlProgress}%`;
    if (dlProgress < 100) {
      clearTimeout(downloadTimer);
      downloadTimer = setTimeout(pollDownloadProgress, 1000);
    }
  } catch (e) {}
}

function updateQueueUI() {
  const list = document.getElementById('queue-list');
  if (!list) return;
  list.innerHTML = '';
  
  currentQueue.forEach((s, i) => {
    const div = document.createElement('div');
    div.className = 'queue-item' + (i === queueIndex ? ' active' : '');
    div.textContent = s.title;
    div.addEventListener('click', () => {
      queueIndex = i;
      updateQueueUI();
      loadAndPlayCurrent();
    });
    list.appendChild(div);
  });
}

function initPlayer() {
  const audio = document.getElementById('audio-element');
  const playBtn = document.getElementById('btn-play-pause');
  const nextBtn = document.getElementById('btn-next');
  const prevBtn = document.getElementById('btn-prev');
  const shuffleBtn = document.getElementById('btn-shuffle');
  const playlistBtn = document.getElementById('btn-playlist');
  const openBtn = document.getElementById('btn-open');
  const queuePanel = document.getElementById('queue-panel');
  const autoplayMenu = document.getElementById('autoplay-menu');
  const progTrack = document.getElementById('progress-track');
  const progFill = document.getElementById('progress-fill');
  const progThumb = document.getElementById('progress-thumb');
  const volTrack = document.getElementById('volume-track');
  const volFill = document.getElementById('volume-fill');
  const volThumb = document.getElementById('volume-thumb');
  
  if (!audio) return;

  audio.volume = accountData.volume;
  updateVolumeUI(audio.volume);

  playBtn.addEventListener('click', () => {
    if (audio.src) {
      if (isPlaying) { audio.pause(); } else { audio.play(); }
    }
  });

  audio.addEventListener('loadstart', () => { if (audio.src) setPlayIconState('loading'); });
  audio.addEventListener('waiting', () => setPlayIconState('loading'));
  
  audio.addEventListener('canplay', () => {
    if (isPlaying) setPlayIconState('playing');
    else setPlayIconState('paused');
  });

  audio.addEventListener('play', () => {
    isPlaying = true;
    setPlayIconState('playing');
    savePlayerState();
  });

  audio.addEventListener('pause', () => {
    isPlaying = false;
    setPlayIconState('paused');
    savePlayerState();
  });
  
  audio.addEventListener('ended', () => {
    if (autoplayMode === 'loop1') {
      audio.currentTime = 0;
      audio.play();
    } else if (autoplayMode === 'noautoplay') {
      isPlaying = false;
      setPlayIconState('paused');
    } else if (autoplayMode === 'repeat') {
      if (queueIndex < currentQueue.length - 1) {
        queueIndex++;
      } else {
        queueIndex = 0;
      }
      updateQueueUI();
      loadAndPlayCurrent();
    } else {
      if (queueIndex < currentQueue.length - 1) {
        queueIndex++;
        updateQueueUI();
        loadAndPlayCurrent();
      } else {
        isPlaying = false;
        setPlayIconState('paused');
      }
    }
  });

  nextBtn.addEventListener('click', () => {
    if (queueIndex < currentQueue.length - 1) {
      queueIndex++;
      updateQueueUI();
      loadAndPlayCurrent();
    }
  });

  prevBtn.addEventListener('click', () => {
    if (queueIndex > 0) {
      queueIndex--;
      updateQueueUI();
      loadAndPlayCurrent();
    } else {
      audio.currentTime = 0;
    }
  });

  shuffleBtn.addEventListener('click', () => {
    let idx = modes.indexOf(autoplayMode);
    idx = (idx + 1) % modes.length;
    setAutoplayMode(modes[idx]);
  });

  shuffleBtn.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (autoplayMenu) {
      autoplayMenu.classList.remove('hidden');
      const rect = shuffleBtn.getBoundingClientRect();
      autoplayMenu.style.left = `${rect.left}px`;
      autoplayMenu.style.bottom = `${window.innerHeight - rect.top + 10}px`;
    }
  });

  document.addEventListener('click', (e) => {
    if (autoplayMenu && !e.target.closest('#btn-shuffle') && !e.target.closest('#autoplay-menu')) {
      autoplayMenu.classList.add('hidden');
    }
  });

  document.querySelectorAll('.menu-item').forEach(item => {
    item.addEventListener('click', () => {
      setAutoplayMode(item.getAttribute('data-mode'));
      if (autoplayMenu) autoplayMenu.classList.add('hidden');
    });
  });

  playlistBtn.addEventListener('click', () => {
    queuePanel.classList.toggle('hidden');
  });

  openBtn.addEventListener('click', () => {
    if (queueIndex >= 0 && currentQueue.length > 0) {
      const s = currentQueue[queueIndex];
      window.location.href = `/track.html#/${currentPluginId}/${s.id}`;
    }
  });

  audio.addEventListener('timeupdate', () => {
    if (!isDraggingProgress && audio.duration) {
      const pct = audio.currentTime / audio.duration;
      updateProgressUI(pct);
    }
    playerState.currentTime = audio.currentTime;
    const now = Date.now();
    if (now - lastSaveTime > 1000) {
      savePlayerState();
      lastSaveTime = now;
    }
  });

  let isDraggingProgress = false;
  progTrack.addEventListener('mousedown', (e) => {
    e.preventDefault();
    isDraggingProgress = true;
    document.body.classList.add('is-dragging');
    setProgressFromEvent(e);
  });
  
  let isDraggingVol = false;
  volTrack.addEventListener('mousedown', (e) => {
    e.preventDefault();
    isDraggingVol = true;
    document.body.classList.add('is-dragging');
    setVolumeFromEvent(e);
  });

  document.addEventListener('mousemove', (e) => {
    if (isDraggingProgress) {
      e.preventDefault();
      setProgressFromEvent(e);
    }
    if (isDraggingVol) {
      e.preventDefault();
      setVolumeFromEvent(e);
    }
  });
  
  document.addEventListener('mouseup', () => {
    isDraggingProgress = false;
    isDraggingVol = false;
    document.body.classList.remove('is-dragging');
  });

  function setProgressFromEvent(e) {
    const rect = progTrack.getBoundingClientRect();
    let pct = (e.clientX - rect.left) / rect.width;
    pct = Math.max(0, Math.min(1, pct));
    updateProgressUI(pct);
    if (audio.duration) {
      audio.currentTime = pct * audio.duration;
      playerState.currentTime = audio.currentTime;
      savePlayerState();
    }
  }

  function updateProgressUI(pct) {
    progFill.style.width = `${pct * 100}%`;
    progThumb.style.left = `calc(${pct * 100}% - 12px)`;
  }

  function setVolumeFromEvent(e) {
    const rect = volTrack.getBoundingClientRect();
    let pct = (rect.bottom - e.clientY) / rect.height;
    pct = Math.max(0, Math.min(1, pct));
    audio.volume = pct;
    accountData.volume = pct;
    saveAccount();
    updateVolumeUI(pct);
  }

  function updateVolumeUI(pct) {
    volFill.style.height = `${pct * 100}%`;
    volThumb.style.bottom = `calc(${pct * 100}% - 12px)`;
  }
}
