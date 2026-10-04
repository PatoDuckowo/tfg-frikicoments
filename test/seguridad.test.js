// Cabeceras de seguridad, errores controlados y páginas protegidas.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { arrancar, parar, conSesion, peticion } = require('./ayuda');

let ana;

before(async () => {
  await arrancar();
  ana = await conSesion('ana');
});
after(parar);

test('las respuestas llevan cabeceras de seguridad', async () => {
  const { cabeceras } = await peticion('/');
  assert.match(cabeceras.get('content-security-policy'), /script-src 'self'/);
  assert.match(cabeceras.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal(cabeceras.get('x-content-type-options'), 'nosniff');
  assert.equal(cabeceras.get('x-frame-options'), 'DENY');
  assert.equal(cabeceras.get('x-powered-by'), null);
});

test('las páginas HTML no se guardan en caché; CSS y JS se revalidan', async () => {
  assert.match((await peticion('/')).cabeceras.get('cache-control'), /no-store/);
  const css = await peticion('/css/styles.css');
  assert.equal(css.cabeceras.get('cache-control'), 'no-cache');
  assert.ok(css.cabeceras.get('etag'));
});

test('errores controlados: JSON roto, ruta inexistente y página inexistente', async () => {
  const roto = await peticion('/api/chat', { metodo: 'POST', cookie: ana.cookie, cuerpoCrudo: '{roto', cabeceras: { 'Content-Type': 'application/json' } });
  assert.equal(roto.estado, 400);
  assert.equal((await peticion('/api/no-existe')).estado, 404);
  const pagina = await peticion('/no-existe');
  assert.equal(pagina.estado, 404);
  assert.match(pagina.texto, /<html/i);
});

test('sin sesión: la API responde 401 y las páginas privadas llevan a la portada', async () => {
  assert.equal((await peticion('/api/usuarios/me')).estado, 401);
  for (const ruta of ['/juego.html', '/usuarios/mensajes.html', '/usuarios/perfil.html', '/usuarios/biblioteca.html']) {
    const respuesta = await peticion(ruta);
    assert.equal(respuesta.estado, 302, ruta);
    assert.equal(respuesta.cabeceras.get('location'), '/', ruta);
  }
  assert.equal((await peticion('/usuarios/mensajes.html', { cookie: ana.cookie })).estado, 200);
});

test('la comprobación de salud no revela detalles', async () => {
  const salud = await peticion('/api/health');
  assert.deepEqual(salud.datos, { ok: true });
});
