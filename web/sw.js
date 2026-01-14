const CACHE_NAME = 'g-connect-v1';
const ASSETS = [
    '/',
    '/index.html',
    '/style.css',
    '/main.js',
    '/components/Login.js',
    '/components/Dashboard.js',
    '/components/Feed.js',
    '/components/Planner.js',
    '/components/Market.js'
];

self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
    );
});

self.addEventListener('fetch', (e) => {
    e.respondWith(
        caches.match(e.request).then((response) => response || fetch(e.request))
    );
});
