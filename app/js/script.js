window.Noyza = {
  PluginType: { Provider: "provider" },
  extensions: {
    plugins: [],
    register(plugin) { this.plugins.push(plugin); }
  }
};

let accountData = { theme: 'serenity', mode: 'system', volume: 1.0 };
let playerState = { queue: [], originalQueue: [], index: -1, shuffle: false, pluginId: "", isPlaying: false, currentTime: 0 };
let currentQueue = [];
let originalQueue = [];
let queueIndex = -1;
let isShuffle = false;
let currentPluginId = "";
let isPlaying = false;
let downloadTimer = null;
let lastSaveTime = 0;

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
  playerState.shuffle = isShuffle;
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

document.addEventListener("DOMContentLoaded", async () => {
  await loadAccount();
  initUIBindings();

  if (window.location.pathname.includes('track.html')) {
    renderTrackPage();
  } else {
    initSections();
  }

  await restoreSession();
  initPlayer();
});

function initUIBindings() {
  const currentPath = window.location.pathname;
  const navHome = document.getElementById('nav-home');
  const navSettings = document.getElementById('nav-settings');
  if (currentPath.includes('settings.html') && navSettings) navSettings.classList.add('active');
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
      if (plugin.init) await plugin.init();
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
          
          const artist = document.createElement('p');
          artist.className = 'label-caps';
          artist.textContent = song.artist;
          
          info.appendChild(title); info.appendChild(artist);
          card.appendChild(art); card.appendChild(info);
          
          card.addEventListener('click', () => playQueue(songs, index, plugin.getInfo().id));
          grid.appendChild(card);
        });
      } catch (err) {}
    }
  }
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
    if(artistEl) artistEl.textContent = meta.artist;
    if(descEl) descEl.textContent = meta.desc;
    
    if(playBtn) {
      playBtn.addEventListener('click', () => {
        playQueue([meta], 0, pluginId);
      });
    }
  } catch(e) {}
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
      isShuffle = playerState.shuffle;
      currentPluginId = playerState.pluginId;
      isPlaying = playerState.isPlaying;
      
      const shuffleBtn = document.getElementById('btn-shuffle');
      if (isShuffle && shuffleBtn) shuffleBtn.classList.add('active');

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
    icon.src = '/assets/images/player/Spinner.svg';
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
  
  if (isShuffle) {
    const selected = currentQueue[index];
    currentQueue.splice(index, 1);
    currentQueue.sort(() => Math.random() - 0.5);
    currentQueue.unshift(selected);
    queueIndex = 0;
  }
  
  updateQueueUI();
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
    if (queueIndex < currentQueue.length - 1) {
      queueIndex++;
      updateQueueUI();
      loadAndPlayCurrent();
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
    isShuffle = !isShuffle;
    shuffleBtn.classList.toggle('active', isShuffle);
    
    if (isShuffle) {
      if (currentQueue.length > 0) {
        const current = currentQueue[queueIndex];
        originalQueue = [...currentQueue];
        const rest = currentQueue.filter((_, i) => i !== queueIndex);
        rest.sort(() => Math.random() - 0.5);
        currentQueue = [current, ...rest];
        queueIndex = 0;
      }
    } else {
      if (currentQueue.length > 0) {
        const current = currentQueue[queueIndex];
        currentQueue = [...originalQueue];
        queueIndex = currentQueue.findIndex(s => s.id === current.id);
      }
    }
    updateQueueUI();
    savePlayerState();
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
    isDraggingProgress = true;
    setProgressFromEvent(e);
  });
  document.addEventListener('mousemove', (e) => {
    if (isDraggingProgress) setProgressFromEvent(e);
  });
  document.addEventListener('mouseup', () => {
    isDraggingProgress = false;
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

  let isDraggingVol = false;
  volTrack.addEventListener('mousedown', (e) => {
    isDraggingVol = true;
    setVolumeFromEvent(e);
  });
  document.addEventListener('mousemove', (e) => {
    if (isDraggingVol) setVolumeFromEvent(e);
  });
  document.addEventListener('mouseup', () => {
    isDraggingVol = false;
  });

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
