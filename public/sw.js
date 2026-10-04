// Service worker de Frikicoments.
// - CSS, JS e imágenes de la web: se sirven de la caché y se actualizan en segundo plano.
// - Páginas: siempre de la red; sin conexión se muestra /offline.html.
// - La API (/api/) nunca se guarda: son datos privados de cada persona.
const CACHE = 'frikicoments-v1';
const PRECARGA = [
  '/offline.html', '/css/styles.css', '/css/catalogo.css', '/js/comun.js',
  '/img/escena-login.svg', '/img/sin-caratula.svg', '/img/icono.svg', '/img/icono-192.png'
];

self.addEventListener('install', evento => {
  evento.waitUntil(caches.open(CACHE).then(cache => cache.addAll(PRECARGA)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', evento => {
  evento.waitUntil(
    caches.keys()
      .then(nombres => Promise.all(nombres.filter(nombre => nombre !== CACHE).map(nombre => caches.delete(nombre))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', evento => {
  const peticion = evento.request;
  const url = new URL(peticion.url);
  if (peticion.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (peticion.mode === 'navigate') {
    evento.respondWith(fetch(peticion).catch(() => caches.match('/offline.html')));
    return;
  }

  if (/^\/(css|js|img)\//.test(url.pathname)) {
    evento.respondWith(caches.open(CACHE).then(async cache => {
      const guardada = await cache.match(peticion);
      const deRed = fetch(peticion).then(respuesta => {
        if (respuesta.ok) cache.put(peticion, respuesta.clone());
        return respuesta;
      }).catch(() => guardada);
      return guardada || deRed;
    }));
  }
});
