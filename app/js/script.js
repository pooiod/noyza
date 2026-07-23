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

const themes = [
  '/css/theme-light-1.css',
  '/css/theme-light-2.css',
  '/css/theme-dark-1.css',
  '/css/theme-dark-2.css'
];

let currentThemeIndex = 0;

document.addEventListener("DOMContentLoaded", async () => {
  const themeStylesheet = document.getElementById('theme-stylesheet');
  const themeToggleBtn = document.getElementById('theme-toggle');
  
  if (themeToggleBtn && themeStylesheet) {
    themeToggleBtn.addEventListener('click', () => {
      currentThemeIndex = (currentThemeIndex + 1) % themes.length;
      themeStylesheet.setAttribute('href', themes[currentThemeIndex]);
    });
  }

  const grid = document.querySelector('.music-grid');
  if (grid) {
    grid.innerHTML = '';
    
    for (const plugin of window.Noyza.extensions.plugins) {
      if (plugin.init) {
        await plugin.init();
      }
      
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
          art.style.backgroundPosition = 'center';
          
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
              const playerArt = document.querySelector('.now-playing .player-art');
              const playerTitle = document.querySelector('.now-playing .title-sm');
              const playerArtist = document.querySelector('.now-playing .label-caps');
              
              if (playerArt) {
                playerArt.style.backgroundImage = `url('${fullSong.cover}')`;
                playerArt.style.backgroundSize = 'cover';
                playerArt.style.backgroundPosition = 'center';
              }
              if (playerTitle) {
                playerTitle.textContent = fullSong.title;
              }
              if (playerArtist) {
                playerArtist.textContent = fullSong.artist;
              }
            } catch (err) {}
          });
          
          grid.appendChild(card);
        });
      } catch (err) {}
    }
  }
});
