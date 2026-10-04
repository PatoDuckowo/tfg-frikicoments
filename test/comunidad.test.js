// Seguir, chat privado (solo con seguimiento mutuo), mensajes sin leer y chat de la portada.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { arrancar, parar, conSesion, peticion } = require('./ayuda');

let ana;
let beto;
let carla;

before(async () => {
  await arrancar();
  ana = await conSesion('ana');
  beto = await conSesion('beto');
  carla = await conSesion('carla');
});
after(parar);

const seguir = (quien, otro, valor = true) =>
  peticion(`/api/usuarios/${otro.id}/seguir`, { metodo: 'PUT', cookie: quien.cookie, datos: { seguir: valor } });
const escribir = (quien, otro, contenido) =>
  peticion(`/api/mensajes/${otro.id}`, { metodo: 'POST', cookie: quien.cookie, datos: { contenido } });

test('sin seguimiento mutuo no se puede escribir', async () => {
  assert.equal((await escribir(ana, beto, 'hola')).estado, 403);
  const respuesta = await seguir(ana, beto);
  assert.deepEqual(respuesta.datos.relacion, { loSigo: true, meSigue: false, mutuo: false });
  assert.equal((await escribir(ana, beto, 'hola')).estado, 403);
});

test('con seguimiento mutuo se escribe, y el otro ve los mensajes sin leer', async () => {
  const respuesta = await seguir(beto, ana);
  assert.equal(respuesta.datos.relacion.mutuo, true);
  assert.equal((await escribir(ana, beto, 'Hola Beto')).estado, 201);
  assert.equal((await escribir(ana, beto, '¿Qué tal?')).estado, 201);

  assert.equal((await peticion('/api/mensajes/no-leidos', { cookie: beto.cookie })).datos.total, 2);
  const conversacion = await peticion(`/api/mensajes/${ana.id}`, { cookie: beto.cookie });
  assert.deepEqual(conversacion.datos.mensajes.map(m => [m.contenido, m.propio]), [['Hola Beto', false], ['¿Qué tal?', false]]);
  assert.equal((await peticion('/api/mensajes/no-leidos', { cookie: beto.cookie })).datos.total, 0);
});

test('la consulta periódica con ?desde solo trae lo nuevo', async () => {
  const todos = await peticion(`/api/mensajes/${beto.id}`, { cookie: ana.cookie });
  const ultimo = todos.datos.mensajes.at(-1).id;
  await escribir(beto, ana, 'Bien, ¿y tú?');
  const nuevos = await peticion(`/api/mensajes/${beto.id}?desde=${ultimo}`, { cookie: ana.cookie });
  assert.deepEqual(nuevos.datos.mensajes.map(m => m.contenido), ['Bien, ¿y tú?']);
});

test('una tercera persona no ve la conversación de otros', async () => {
  const respuesta = await peticion(`/api/mensajes/${beto.id}`, { cookie: carla.cookie });
  assert.equal(respuesta.datos.mensajes.length, 0);
  assert.equal(respuesta.datos.puedeEscribir, false);
});

test('al dejar de seguir, el historial queda en solo lectura', async () => {
  await seguir(ana, beto, false);
  assert.equal((await escribir(ana, beto, 'hola')).estado, 403);
  const respuesta = await peticion(`/api/mensajes/${beto.id}`, { cookie: ana.cookie });
  assert.equal(respuesta.datos.puedeEscribir, false);
  assert.equal(respuesta.datos.mensajes.length, 3);
});

test('validaciones del chat privado', async () => {
  await seguir(ana, beto);
  assert.equal((await escribir(ana, beto, '')).estado, 400);
  assert.equal((await escribir(ana, beto, 'x'.repeat(1001))).estado, 400);
  assert.equal((await peticion(`/api/mensajes/${ana.id}`, { cookie: ana.cookie })).estado, 400);
  assert.equal((await peticion('/api/mensajes/999999', { cookie: ana.cookie })).estado, 404);
});

test('el texto se guarda tal cual (sin interpretar HTML)', async () => {
  await escribir(ana, beto, '<img src=x onerror=alert(1)>');
  const respuesta = await peticion(`/api/mensajes/${ana.id}`, { cookie: beto.cookie });
  assert.equal(respuesta.datos.mensajes.at(-1).contenido, '<img src=x onerror=alert(1)>');
});

test('el chat de la portada muestra el nombre actual aunque se cambie', async () => {
  const dani = await conSesion('dani');
  await peticion('/api/chat', { metodo: 'POST', cookie: dani.cookie, datos: { contenido: 'hola a todos' } });
  await peticion('/api/usuarios/nombre', { metodo: 'PATCH', cookie: dani.cookie, datos: { nombre_usuario: 'daniela' } });
  const chat = await peticion('/api/chat', { cookie: ana.cookie });
  assert.equal(chat.datos.at(-1).usuario, 'daniela');
});

test('perfil: muestra me gusta y pendientes', async () => {
  await peticion('/api/juegos/1/me-gusta', { metodo: 'PUT', cookie: beto.cookie, datos: { meGusta: true } });
  await peticion('/api/juegos/2/estado', { metodo: 'PUT', cookie: beto.cookie, datos: { estado: 'pendiente' } });
  const perfil = await peticion('/api/perfiles/beto', { cookie: ana.cookie });
  assert.deepEqual(perfil.datos.meGusta.map(j => j.name), ['Juego Uno']);
  assert.deepEqual(perfil.datos.pendientes.map(j => j.name), ['Juego Dos']);
  assert.equal(perfil.datos.esPropio, false);
  assert.equal((await peticion('/api/perfiles/nadie_existe', { cookie: ana.cookie })).estado, 404);
});
