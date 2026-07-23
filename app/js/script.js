window.Noyza = {
  PluginType: {
    Provider: "provider"
  },
  extensions: {
    plugins: [],
    register(plugin) {
      this.plugins.push(plugin);
    }
  }
};

let accountData = {
  theme: 'serenity',
  mode: 'dark',
  volume: 1.0
};

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
  if (link) {
    link.href = `/themes/${accountData.theme}.css`;
  }
  document.body.setAttribute('data-theme-mode', accountData.mode);
}

function formatTitle(title) {
  const stripped = title.toUpperCase().replace(/\s+/g, '');
  return `[ ${stripped.split('').join(' ')} ]`;
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
          
          card.addEventListener('click', async () => {
            try {
              const fullSong = await plugin.getSong(song.id);
              playSong(fullSong);
            } catch (err) {}
          });
          grid.appendChild(card);
        });
      } catch (err) {}
    }
  }

  initPlayer();
});

let isPlaying = false;

function initPlayer() {
  const audio = document.getElementById('audio-element');
  const playBtn = document.getElementById('btn-play-pause');
  const playIcon = document.getElementById('icon-play');
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
    playIcon.src = '/assets/images/player/NoPlay.svg';
  });

  audio.addEventListener('pause', () => {
    isPlaying = false;
    playIcon.src = '/assets/images/player/Play.svg';
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

function playSong(song) {
  const audio = document.getElementById('audio-element');
  const titleDisplay = document.getElementById('player-title');
  if (audio && titleDisplay) {
    audio.src = song.url;
    titleDisplay.textContent = formatTitle(song.title);
    audio.play();
  }
}
