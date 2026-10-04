// Reseñas (tabla única), marcadores, biblioteca y validación de ids de juego.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { arrancar, parar, conSesion, peticion } = require('./ayuda');

let ana;

before(async () => {
  await arrancar();
  ana = await conSesion('ana');
});
after(parar);

const publicar = (datos, quien = ana) => peticion('/api/resenas', { metodo: 'POST', cookie: quien.cookie, datos });

test('publicar una reseña la muestra en la portada, en la ficha y en el contador', async () => {
  const creada = await publicar({ juegoId: 1, contenido: 'Muy bueno' });
  assert.equal(creada.estado, 201);
  assert.deepEqual(creada.datos.juego, { id: 1, nombre: 'Juego Uno' });

  const portada = await peticion('/api/resenas', { cookie: ana.cookie });
  assert.equal(portada.datos[0].contenido, 'Muy bueno');
  assert.equal(portada.datos[0].usuario, 'ana');
  assert.equal(portada.datos[0].juego.nombre, 'Juego Uno');

  const ficha = await peticion('/api/juegos/1/resenas', { cookie: ana.cookie });
  assert.equal(ficha.datos.length, 1);
  assert.equal((await peticion('/api/estadisticas', { cookie: ana.cookie })).datos.resenas, 1);
});

test('reseñas no válidas: sin juego, juego inexistente o texto vacío', async () => {
  assert.equal((await publicar({ contenido: 'x' })).estado, 400);
  assert.equal((await publicar({ juegoId: 999, contenido: 'x' })).estado, 400);
  assert.equal((await publicar({ juegoId: 1, contenido: '   ' })).estado, 400);
  assert.equal((await publicar({ juegoId: 1, contenido: 'x'.repeat(5001) })).estado, 400);
});

test('juegos recientes: los últimos reseñados, sin repetir', async () => {
  await publicar({ juegoId: 2, contenido: 'Otro' });
  await publicar({ juegoId: 2, contenido: 'Otra vez' });
  const recientes = await peticion('/api/juegos/recientes', { cookie: ana.cookie });
  assert.deepEqual(recientes.datos.map(juego => juego.id).sort(), [1, 2]);
});

test('ids de juego no válidos devuelven 400, no un error interno', async () => {
  for (const ruta of ['/api/juegos/abc', '/api/juegos/abc/estado', '/api/juegos/0/marcadores', '/api/juegos/-1/resenas']) {
    assert.equal((await peticion(ruta, { cookie: ana.cookie })).estado, 400, ruta);
  }
  const marcar = await peticion('/api/juegos/abc/me-gusta', { metodo: 'PUT', cookie: ana.cookie, datos: { meGusta: true } });
  assert.equal(marcar.estado, 400);
});

test('marcadores y estado del juego', async () => {
  await peticion('/api/juegos/2/me-gusta', { metodo: 'PUT', cookie: ana.cookie, datos: { meGusta: true } });
  await peticion('/api/juegos/3/guardado', { metodo: 'PUT', cookie: ana.cookie, datos: { guardado: true } });
  assert.equal((await peticion('/api/juegos/1/estado', { metodo: 'PUT', cookie: ana.cookie, datos: { estado: 'raro' } })).estado, 400);
  await peticion('/api/juegos/1/estado', { metodo: 'PUT', cookie: ana.cookie, datos: { estado: 'jugado' } });
  // Segundo cambio sobre el mismo juego: prueba la rama ON DUPLICATE KEY UPDATE.
  await peticion('/api/juegos/1/estado', { metodo: 'PUT', cookie: ana.cookie, datos: { estado: 'pendiente' } });

  assert.deepEqual((await peticion('/api/juegos/2/marcadores', { cookie: ana.cookie })).datos, { guardado: false, meGusta: true });
  assert.equal((await peticion('/api/juegos/1/estado', { cookie: ana.cookie })).datos.estado, 'pendiente');
});

test('la biblioteca respeta el orden guardado', async () => {
  const antes = await peticion('/api/mi-biblioteca', { cookie: ana.cookie });
  assert.deepEqual(antes.datos.map(item => item.juego_id), [1, 2, 3]);

  const orden = await peticion('/api/mi-biblioteca/orden', { metodo: 'PUT', cookie: ana.cookie, datos: { juegos: [3, 1, 2] } });
  assert.equal(orden.estado, 200);
  const despues = await peticion('/api/mi-biblioteca', { cookie: ana.cookie });
  assert.deepEqual(despues.datos.map(item => item.juego_id), [3, 1, 2]);

  const repetido = await peticion('/api/mi-biblioteca/orden', { metodo: 'PUT', cookie: ana.cookie, datos: { juegos: [1, 1] } });
  assert.equal(repetido.estado, 400);
});

test('solo el autor puede borrar su reseña', async () => {
  const beto = await conSesion('beto');
  const { datos } = await publicar({ juegoId: 3, contenido: 'La borraré' });
  const deAna = await peticion('/api/juegos/3/resenas', { cookie: ana.cookie });
  assert.equal(deAna.datos.find(r => r.id === datos.id).propia, true);
  const deBeto = await peticion('/api/juegos/3/resenas', { cookie: beto.cookie });
  assert.equal(deBeto.datos.find(r => r.id === datos.id).propia, false);

  assert.equal((await peticion(`/api/resenas/${datos.id}`, { metodo: 'DELETE', cookie: beto.cookie })).estado, 404);
  assert.equal((await peticion('/api/resenas/abc', { metodo: 'DELETE', cookie: ana.cookie })).estado, 404);
  assert.equal((await peticion(`/api/resenas/${datos.id}`, { metodo: 'DELETE' })).estado, 401);
  assert.equal((await peticion(`/api/resenas/${datos.id}`, { metodo: 'DELETE', cookie: ana.cookie })).estado, 200);
  assert.equal((await peticion('/api/juegos/3/resenas', { cookie: ana.cookie })).datos.length, 0);
  assert.equal((await peticion(`/api/resenas/${datos.id}`, { metodo: 'DELETE', cookie: ana.cookie })).estado, 404);
});
