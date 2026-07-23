(function () {
    class ArchiveCH {
        constructor() {}
    
        getInfo() {
            return {
                id: "ArchiveCH",
                name: "CH Archive",
                author: "pooiod7",
                icon: "https://pooiod.github.io/ChMusicArchive/cover.webp",
                source: "https://pooiod.github.io/ChMusicArchive",
                type: Noyza.PluginType.Provider
            };
        }

        async init() {}

        async getSong(id) {
            const response = await fetch("https://pooiod.github.io/ChMusicArchive/songs.json");
            if (!response.ok) {
                throw new Error("Failed to fetch data from CH Archive");
            }
            const data = await response.json();
            const song = data.find(song => song.title.replace(/\s+/g, "_").toLowerCase() === id);
            if (!song) {
                throw new Error("Song not found in CH Archive");
            }
            return {
                id: song.title.replace(/\s+/g, "_").toLowerCase(),
                title: song.title,
                artist: "CH__",
                cover: "https://pooiod.github.io/ChMusicArchive/cover.webp",
                source: "https://pooiod.github.io/ChMusicArchive",
                url: "https://pooiod.github.io/ChMusicArchive/music/" + song.file
            };
        }

        async search(query) {
            const response = await fetch("https://pooiod.github.io/ChMusicArchive/songs.json");
            if (!response.ok) {
                throw new Error("Failed to fetch data from CH Archive");
            }
            const data = await response.json();
            const results = data.filter(song => song.title.toLowerCase().includes(query.toLowerCase()));
            return results.map(song => ({
                id: song.title.replace(/\s+/g, "_").toLowerCase(),
                title: song.title,
                cover: "https://pooiod.github.io/ChMusicArchive/cover.webp",
                artist: "CH__"
            }));
        }

        async browse(type) {
            const response = await fetch("https://pooiod.github.io/ChMusicArchive/songs.json");
            if (!response.ok) {
                throw new Error("Failed to fetch data from CH Archive");
            }
            const data = await response.json();
            let results = [];
            switch (type) {
                case "recomended":
                case "popular":
                case "trending":
                    results = data.sort(() => 0.5 - Math.random()).slice(0, 10);
                    break;
                case "latest":
                    results = data.sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 10);
                    break;
                default:
                    throw new Error("Unknown category type");
            }
            return results.map(song => ({
                id: song.title.replace(/\s+/g, "_").toLowerCase(),
                title: song.title,
                cover: "https://pooiod.github.io/ChMusicArchive/cover.webp",
                artist: "CH__"
            }));
        }
    }
  
    Noyza.extensions.register(new ArchiveCH());
})();
