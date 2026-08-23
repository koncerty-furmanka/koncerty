// Kôňcerty – service worker
// Cache: rýchly štart + offline záloha + obrázky podľa potreby.

const CACHE = 'koncerty-v19';
const SHELL = ['./', './index.html', './manifest.json', './vinyl.png'];

const DATA_URLS = [
  'https://raw.githubusercontent.com/koncerty-furmanka/koncerty/main/data.csv',
  'https://raw.githubusercontent.com/koncerty-furmanka/koncerty/main/onas.csv',
  'https://raw.githubusercontent.com/koncerty-furmanka/koncerty/main/galeria.csv'
];

const START_IMAGES = [
  'https://cdn.jsdelivr.net/gh/koncerty-furmanka/koncerty@main/ikony/Najblizsie-koncerty.webp'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);

    for (const url of SHELL) {
      try {
        await cache.add(url);
      } catch (_) {}
    }

    for (const url of DATA_URLS) {
      try {
        const response = await fetch(url, { cache: 'no-store' });
        if (response.ok) {
          await cache.put(url, response);
        }
      } catch (_) {}
    }

    for (const url of START_IMAGES) {
      try {
        const response = await fetch(url);

        if (response.ok || response.type === 'opaque') {
          await cache.put(url, response);
        }
      } catch (_) {}
    }

    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key =>
            key.startsWith('koncerty-') &&
            key !== CACHE
          )
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;

  if (request.method !== 'GET') {
    return;
  }

  let url;

  try {
    url = new URL(request.url);
  } catch (_) {
    return;
  }

  // OneSignal nechávame úplne bez zásahu.
  if (
    url.pathname.includes('/onesignal/') ||
    url.hostname.includes('onesignal')
  ) {
    return;
  }

  // HTML:
  // najprv internet, pri výpadku posledná uložená verzia.
  if (
    request.mode === 'navigate' ||
    request.destination === 'document'
  ) {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();

          caches.open(CACHE)
            .then(cache => cache.put(request, copy))
            .catch(() => {});

          return response;
        })
        .catch(() =>
          caches.match(request).then(cached =>
            cached || caches.match('./index.html')
          )
        )
    );

    return;
  }

  // CSV dáta:
  // najprv aktuálna verzia z GitHubu,
  // pri výpadku internetu cache.
  const isData =
    url.hostname === 'raw.githubusercontent.com' &&
    (
      url.pathname.endsWith('/data.csv') ||
      url.pathname.endsWith('/onas.csv') ||
      url.pathname.endsWith('/galeria.csv')
    );

  if (isData) {
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .then(response => {
          if (response.ok) {
            const copy = response.clone();

            caches.open(CACHE)
              .then(cache => cache.put(request, copy))
              .catch(() => {});
          }

          return response;
        })
        .catch(() => caches.match(request))
    );

    return;
  }

  // Obrázky:
  // najprv lokálna cache, až potom internet.
  const isImage =
    request.destination === 'image' ||
    url.hostname === 'cdn.jsdelivr.net' ||
    /\.(png|jpg|jpeg|webp|gif|svg)$/i.test(url.pathname);

  if (isImage) {
    event.respondWith(
      caches.match(request).then(cached => {

        if (cached) {
          return cached;
        }

        return fetch(request).then(response => {

          if (
            response.ok ||
            response.type === 'opaque'
          ) {
            const copy = response.clone();

            caches.open(CACHE)
              .then(cache => cache.put(request, copy))
              .catch(() => {});
          }

          return response;
        });
      })
    );

    return;
  }

  // Ostatné súbory:
  // cache → internet.
  event.respondWith(
    caches.match(request).then(cached => {

      if (cached) {
        return cached;
      }

      return fetch(request).then(response => {

        if (
          response.ok ||
          response.type === 'opaque'
        ) {
          const copy = response.clone();

          caches.open(CACHE)
            .then(cache => cache.put(request, copy))
            .catch(() => {});
        }

        return response;
      });
    })
  );
});
