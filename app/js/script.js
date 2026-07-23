window.Noyza = {
  PluginType: { Provider: "provider" },
  extensions: {
    plugins: [],
    register(plugin) { this.plugins.push(plugin); }
  }
};

let accountData = {
  theme: 'serenity',
  mode: 'system',
  volume: 1.0
};

let currentQueue = [];
let originalQueue = [];
let queueIndex = -1;
let isShuffle = false;
let currentPluginId = "";
let isPlaying = false;

async function loadAccount() {
  const local = localStorage.getItem('noyza_account');
  if (local) {
    accountData = JSON.parse(local);
  } else {
    try {
      const res = await fetch('/data/account.json');
      if (res.ok) {
        accountData = await res.json();
        saveAccount();
      }
    } catch (e) {}
  }
  applyTheme();
}

function saveAccount() {
  localStorage.setItem('noyza_account', JSON.stringify(accountData));
}

function applyTheme() {
  const link = document.getElementById('theme-stylesheet');
  if (link) link.href = `/themes/${accountData.theme}.css`;

  let mode = accountData.mode;
  if (mode === 'system') {
    mode = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.body.setAttribute('data-theme-mode', mode);
}

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (accountData.mode === 'system') applyTheme();
});

function formatTitle(title) {
  const stripped = title.toUpperCase().replace(/\s+/g, '');
  return `[ ${stripped.split('').join(' ')} ]`;
}

function getPlugin(id) {
  return window.Noyza.extensions.plugins.find(p => p.getInfo().id === id);
}

document.addEventListener("DOMContentLoaded", async () => {
  await loadAccount();

  const currentPath = window.location.pathname;
  const navHome = document.getElementById('nav-home');
  const navSettings = document.getElementById('nav-settings');
  if (currentPath.includes('settings.html') && navSettings) {
    navSettings.classList.add('active');
  } else if (navHome) {
    navHome.classList.add('active');
  }

  const themeSelect = document.getElementById('theme-select');
  const modeSelect = document.getElementById('mode-select');

  if (themeSelect && modeSelect) {
    themeSelect.value = accountData.theme;
    modeSelect.value = accountData.mode;

    themeSelect.addEventListener('change', (e) => {
      accountData.theme = e.target.value;
      saveAccount();
      applyTheme();
    });

    modeSelect.addEventListener('change', (e) => {
      accountData.mode = e.target.value;
      saveAccount();
      applyTheme();
    });
  }

  const grid = document.querySelector('.music-grid');
  if (grid) {
    for (const plugin of window.Noyza.extensions.plugins) {
      if (plugin.init) await plugin.init();
      try {
        const songs = await plugin.browse('foryou');
        songs.forEach((song, index) => {
          const pastelClass = `bg-pastel-${(index % 4) + 1}`;
          const card = document.createElement('div');
          card.className = `album-card ${pastelClass}`;
          
          const art = document.createElement('div');
          art.className = 'album-art';
          art.style.backgroundImage = `url('${song.cover}')`;
          art.style.backgroundSize = 'cover';
          
          const info = document.createElement('div');
          info.className = 'album-info';
          
          const title = document.createElement('h3');
          title.className = 'title-sm';
          title.textContent = song.title;
          
          const artist = document.createElement('p');
          artist.className = 'label-caps';
          artist.textContent = song.artist;
          
          info.appendChild(title);
          info.appendChild(artist);
          card.appendChild(art);
          card.appendChild(info);
          
          card.addEventListener('click', () => {
            playQueue(songs, index, plugin.getInfo().id);
          });
          grid.appendChild(card);
        });
      } catch (err) {}
    }
  }

  initPlayer();
});

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
    const fullSong = await plugin.getSong(baseSong.id);
    const audio = document.getElementById('audio-element');
    const titleDisplay = document.getElementById('player-title');
    
    if (audio && titleDisplay) {
      audio.src = fullSong.url;
      titleDisplay.textContent = formatTitle(fullSong.title);
      audio.play();
    }
  } catch (err) {}
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
  const playIcon = document.getElementById('icon-play');
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
      if (isPlaying) {
        audio.pause();
      } else {
        audio.play();
      }
    }
  });

  audio.addEventListener('play', () => {
    isPlaying = true;
    playIcon.src = '/assets/images/player/Pause.svg';
  });

  audio.addEventListener('pause', () => {
    isPlaying = false;
    playIcon.src = '/assets/images/player/Play.svg';
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
  });

  playlistBtn.addEventListener('click', () => {
    queuePanel.classList.toggle('hidden');
  });

  openBtn.addEventListener('click', () => {
    if (queueIndex >= 0 && currentQueue.length > 0) {
      const s = currentQueue[queueIndex];
      window.location.href = `/track/#/${currentPluginId}/${s.id}`;
    }
  });

  audio.addEventListener('timeupdate', () => {
    if (audio.duration) {
      const pct = audio.currentTime / audio.duration;
      progFill.style.width = `${pct * 100}%`;
      progThumb.style.left = `calc(${pct * 100}% - 8px)`;
    }
  });

  progTrack.addEventListener('click', (e) => {
    if (audio.duration) {
      const rect = progTrack.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      audio.currentTime = pct * audio.duration;
    }
  });

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
    volThumb.style.bottom = `calc(${pct * 100}% - 8px)`;
  }
}
