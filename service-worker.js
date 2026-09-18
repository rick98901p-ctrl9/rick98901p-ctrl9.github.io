/* GeoAlerta — service worker
   Estratégias:
   - App shell (index, manifest, ícones): cache primeiro, atualizando em segundo plano.
   - Biblioteca do MapLibre (unpkg) e tiles/estilos do OpenFreeMap: cache + revalidação.
   - Nominatim, ViaCEP e demais APIs: sempre rede (nunca cacheados).
*/

const VERSION     = 'geoalerta-v1';
const SHELL_CACHE = VERSION + '-shell';
const ASSET_CACHE = VERSION + '-assets';
const TILE_CACHE  = VERSION + '-tiles';

const SHELL_FILES = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png'
];

// Nunca cachear: dados que precisam estar sempre atualizados
const NETWORK_ONLY = [
  'nominatim.openstreetmap.org',
  'viacep.com.br'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(cache => cache.addAll(SHELL_FILES))
      .then(() => self.skipWaiting())
      .catch(err => console.warn('[SW] Falha ao pré-cachear:', err))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => !k.startsWith(VERSION)).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

function staleWhileRevalidate(request, cacheName) {
  return caches.open(cacheName).then(cache =>
    cache.match(request).then(cached => {
      const network = fetch(request).then(response => {
        if (response && (response.ok || response.type === 'opaque')) {
          cache.put(request, response.clone());
        }
        return response;
      }).catch(() => cached);
      return cached || network;
    })
  );
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // APIs de geocodificação/CEP: sempre rede
  if (NETWORK_ONLY.some(host => url.hostname.endsWith(host))) return;

  // Navegação: tenta a rede, cai para o index em cache quando offline
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Estilos e tiles do OpenFreeMap (dados do OpenStreetMap)
  if (url.hostname.endsWith('openfreemap.org') || url.hostname.endsWith('arcgisonline.com')) {
    event.respondWith(staleWhileRevalidate(request, TILE_CACHE));
    return;
  }

  // MapLibre GL JS via CDN
  if (url.hostname.endsWith('unpkg.com')) {
    event.respondWith(staleWhileRevalidate(request, ASSET_CACHE));
    return;
  }

  // Arquivos da própria aplicação
  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(request, SHELL_CACHE));
  }
});
