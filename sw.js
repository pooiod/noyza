// Capsule (v1), a multi-platform app kit by pooiod7
// https://github.com/pooiod/Capsule

const dbName = 'AppFilesDB';
const storeName = 'files';
const whitelist = ["/update", "/update.html", "/update/"];

const mimeTypes = {
    'html': 'text/html',
    'js': 'application/javascript',
    'css': 'text/css',
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'gif': 'image/gif',
    'svg': 'image/svg+xml',
    'json': 'application/json',
    'txt': 'text/plain',
    'woff': 'font/woff',
    'woff2': 'font/woff2'
};

function getDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(dbName, 1);
        request.onsuccess = e => resolve(e.target.result);
        request.onerror = e => reject(e.target.error);
    });
}

async function getConfig() {
    let appurl = '/app.zip';
    let root = '/';
    try {
        const res = await fetch('/update.html');
        if (res.ok) {
            const text = await res.text();
            const urlMatch = text.match(/var\s+appurl\s*=\s*["']([^"']+)["']/);
            const rootMatch = text.match(/var\s+root\s*=\s*["']([^"']+)["']/);
            if (urlMatch) appurl = urlMatch[1];
            if (rootMatch) root = rootMatch[1];
        }
    } catch (e) {}
    return { appurl, root };
}

async function checkHasFiles() {
    try {
        const db = await getDB();

        if (!db.objectStoreNames.contains(storeName)) {
            return false;
        }

        return new Promise((resolve) => {
            const tx = db.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const req = store.get('index.html');
            req.onsuccess = () => resolve(!!req.result);
            req.onerror = () => resolve(false);
        });
    } catch (e) {
        return false;
    }
}

async function getFile(path) {
    try {
        const db = await getDB();
        return new Promise((resolve) => {
            const tx = db.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const req = store.get(path);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => resolve(null);
        });
    } catch (e) {
        return null;
    }
}

function getMimeType(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    return mimeTypes[ext] || 'application/octet-stream';
}

async function processTemplate(text) {
    const regex = /\{\{(.+?)\}\}/g;
    const matches = [...new Set(text.match(regex))];
    if (!matches || matches.length === 0) return text;

    for (const match of matches) {
        const innerPath = match.slice(2, -2).trim();
        try {
            let content = match;
            if (innerPath.startsWith('//')) {
                const res = await fetch('https:' + innerPath);
                if (res.ok) {
                    content = await res.text();
                }
            } else if (innerPath.startsWith('/')) {
                const cleanPath = innerPath.substring(1);
                const fileBlob = await getFile(cleanPath);
                if (fileBlob) {
                    content = await fileBlob.text();
                }
            }
            text = text.split(match).join(content);
        } catch(e) {}
    }
    return text;
}

self.addEventListener('install', event => {
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    event.waitUntil((async () => {
        try {
            const db = await getDB();
            const tx = db.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const req = store.get('__meta_version__');
            req.onsuccess = async () => {
                if (!req.result) {
                    try {
                        const config = await getConfig();
                        const res = await fetch(config.appurl, { method: 'HEAD' });
                        const version = res.headers.get('ETag') || res.headers.get('Last-Modified') || res.headers.get('Content-Length');
                        if (version) {
                            const tx2 = db.transaction(storeName, 'readwrite');
                            tx2.objectStore(storeName).put(new Blob([version]), '__meta_version__');
                        }
                    } catch (e) {}
                }
            };
        } catch (e) {}
        await self.clients.claim();
    })());
});

self.addEventListener('message', async (event) => {
    if (event.data && event.data.type === 'status') {
        const hasFiles = await checkHasFiles();
        event.source.postMessage({ type: 'status', hasFiles });
    }
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    if (url.pathname === '/app.js') {
        const appScript = `
            window.app = {
                async NeedsUpdate() {
                    try {
                        const res = await fetch('/api/needs-update');
                        const data = await res.json();
                        return data.needsUpdate;
                    } catch(e) { return false; }
                },
                Update() {
                    window.location.href = '/update.html';
                },
                async GetFileCount() {
                    try {
                        const res = await fetch('/api/file-count');
                        const data = await res.json();
                        return Math.max(0, data.count - (data.hasMeta ? 1 : 0));
                    } catch(e) { return 0; }
                },
                ClearStorage() {
                    indexedDB.deleteDatabase('${dbName}');
                    window.location.reload();
                }
            };
        `;
        event.respondWith(new Response(appScript, {
            status: 200,
            headers: { 'Content-Type': 'application/javascript' }
        }));
        return;
    }

    if (url.pathname === '/api/needs-update') {
        event.respondWith((async () => {
            try {
                const config = await getConfig();
                const res = await fetch(config.appurl, { method: 'HEAD', cache: 'no-store' });
                const currentVersion = res.headers.get('ETag') || res.headers.get('Last-Modified') || res.headers.get('Content-Length');

                const db = await getDB();
                return new Promise((resolve) => {
                    const tx = db.transaction(storeName, 'readonly');
                    const store = tx.objectStore(storeName);
                    const req = store.get('__meta_version__');
                    
                    req.onsuccess = async () => {
                        let needsUpdate = false;
                        if (req.result && currentVersion) {
                            const storedVersion = await req.result.text();
                            needsUpdate = (currentVersion !== storedVersion);
                        } else if (!req.result && currentVersion) {
                            needsUpdate = true;
                        }
                        resolve(new Response(JSON.stringify({ needsUpdate }), {
                            status: 200,
                            headers: { 'Content-Type': 'application/json' }
                        }));
                    };
                    req.onerror = () => resolve(new Response('{"needsUpdate":false}'));
                });
            } catch (e) {
                return new Response(JSON.stringify({ needsUpdate: false }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' }
                });
            }
        })());
        return;
    }

    if (url.pathname === '/api/file-count') {
        event.respondWith((async () => {
            try {
                const db = await getDB();
                return new Promise((resolve) => {
                    const tx = db.transaction(storeName, 'readonly');
                    const store = tx.objectStore(storeName);
                    const reqCount = store.count();
                    reqCount.onsuccess = () => {
                        const reqMeta = store.get('__meta_version__');
                        reqMeta.onsuccess = () => {
                            resolve(new Response(JSON.stringify({ count: reqCount.result, hasMeta: !!reqMeta.result }), {
                                status: 200,
                                headers: { 'Content-Type': 'application/json' }
                            }));
                        };
                        reqMeta.onerror = () => {
                             resolve(new Response(JSON.stringify({ count: reqCount.result, hasMeta: false }), {
                                status: 200,
                                headers: { 'Content-Type': 'application/json' }
                            }));
                        }
                    };
                    reqCount.onerror = () => resolve(new Response('{"count":0, "hasMeta":false}'));
                });
            } catch (e) {
                return new Response('{"count":0, "hasMeta":false}');
            }
        })());
        return;
    }

    if (url.pathname.endsWith('.zip') && event.request.method === 'GET') {
        event.respondWith((async () => {
            const config = await getConfig();
            if (url.pathname === config.appurl) {
                try {
                    const response = await fetch(event.request);
                    const clone = response.clone();
                    const version = clone.headers.get('ETag') || clone.headers.get('Last-Modified') || clone.headers.get('Content-Length');
                    if (version) {
                        const db = await getDB();
                        const tx = db.transaction(storeName, 'readwrite');
                        tx.objectStore(storeName).put(new Blob([version]), '__meta_version__');
                    }
                    return response;
                } catch (e) {
                    return new Response(null, { status: 503 });
                }
            }
            return fetch(event.request);
        })());
        return;
    }

    if (url.origin !== self.location.origin) {
        return;
    }

    if (whitelist.includes(url.pathname)) {
        return;
    }

    if (event.request.method !== 'GET') {
        return;
    }

    event.respondWith((async () => {
        let path = url.pathname.substring(1);
        
        if (path === '' || path.endsWith('/')) {
            path += 'index.html';
        }

        const blob = await getFile(path);

        if (blob) {
            let mime = getMimeType(path);
            let finalBody = blob;

            if (['text/html', 'application/javascript', 'text/css', 'image/svg+xml', 'application/json', 'text/plain'].includes(mime)) {
                try {
                    let text = await blob.text();
                    text = await processTemplate(text);
                    finalBody = text;
                } catch (e) {}
            }

            return new Response(finalBody, {
                status: 200,
                headers: {
                    'Content-Type': mime
                }
            });
        }

        try {
            return await fetch(event.request);
        } catch (err) {
            return new Response('File not found.', { 
                status: 503,
                headers: { 'Content-Type': 'text/plain' }
            });
        }
    })());
});
