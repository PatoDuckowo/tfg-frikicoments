// Service worker de Frikicoments.
// - CSS y JS: primero la red y, sin conexión, la copia guardada. Los módulos JS se importan entre sí
//   y deben ir siempre en la misma versión (servirlos de caché podría mezclar archivos viejos y nuevos).
// - Imágenes: de la caché, actualizándose en segundo plano.
// - Páginas: siempre de la red; sin conexión se muestra /offline.html.
// - La API (/api/) nunca se guarda: son datos privados de cada persona.
// Cambiar el nombre al modificar este archivo borra la caché anterior.
const CACHE = 'frikicoments-v2';
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

  if (/^\/(css|js)\//.test(url.pathname)) {
    evento.respondWith(fetch(peticion).then(respuesta => {
      if (respuesta.ok) {
        const copia = respuesta.clone();
        caches.open(CACHE).then(cache => cache.put(peticion, copia));
      }
      return respuesta;
    }).catch(() => caches.match(peticion)));
    return;
  }

  if (url.pathname.startsWith('/img/')) {
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
