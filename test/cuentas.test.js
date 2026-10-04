// Login, sesión, cambio de nombre y contraseña, y recuperación con enlace.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { pool, arrancar, parar, crearUsuario, conSesion, sesion, peticion } = require('./ayuda');

before(arrancar);
after(parar);

// Cada login sale de una IP distinta (X-Forwarded-For) para no agotar el límite de 10 por IP.
let ultimaIP = 0;
const entrar = (usuario, contrasena, ip = `10.0.0.${++ultimaIP}`) =>
  peticion('/api/usuarios/login', { metodo: 'POST', datos: { usuario, contrasena }, cabeceras: { 'X-Forwarded-For': ip } });

test('login correcto: cookie HttpOnly y /me devuelve la cuenta', async () => {
  await crearUsuario('ana');
  const respuesta = await entrar('ana', 'Contrasena123');
  assert.equal(respuesta.estado, 200);
  const cookie = respuesta.cabeceras.get('set-cookie');
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);

  const yo = await peticion('/api/usuarios/me', { cookie: cookie.split(';')[0] });
  assert.equal(yo.estado, 200);
  assert.equal(yo.datos.usuario, 'ana');
  assert.equal(yo.datos.esAdministrador, false);
});

test('en la base solo se guarda el hash del token de sesión', async () => {
  const respuesta = await entrar('ana', 'Contrasena123');
  const token = respuesta.cabeceras.get('set-cookie').split(';')[0].split('=')[1];
  const [filas] = await pool.execute('SELECT COUNT(*) AS n FROM sesiones WHERE token_hash = ?', [token]);
  assert.equal(filas[0].n, 0);
});

test('contraseña incorrecta: 401, y tras 5 fallos se bloquea con 429', async () => {
  await crearUsuario('bloqueo');
  for (let i = 0; i < 5; i++) assert.equal((await entrar('bloqueo', 'mala', '10.9.9.9')).estado, 401);
  const bloqueado = await entrar('bloqueo', 'Contrasena123', '10.9.9.9');
  assert.equal(bloqueado.estado, 429);
  assert.ok(bloqueado.cabeceras.get('retry-after'));
});

test('logout borra la sesión', async () => {
  const { cookie } = await conSesion('salir');
  const respuesta = await peticion('/api/usuarios/logout', { metodo: 'POST', cookie });
  assert.equal(respuesta.estado, 303);
  assert.equal((await peticion('/api/usuarios/me', { cookie })).estado, 401);
});

test('cambiar la contraseña exige la actual y cierra todas las sesiones', async () => {
  const { id, cookie } = await conSesion('cambio');
  const otroDispositivo = await sesion(id);
  const mala = await peticion('/api/usuarios/password', { metodo: 'PATCH', cookie, datos: { contrasenaActual: 'no', contrasenaNueva: 'NuevaClave456' } });
  assert.equal(mala.estado, 400);

  const buena = await peticion('/api/usuarios/password', { metodo: 'PATCH', cookie, datos: { contrasenaActual: 'Contrasena123', contrasenaNueva: 'NuevaClave456' } });
  assert.equal(buena.estado, 200);
  assert.equal((await peticion('/api/usuarios/me', { cookie: otroDispositivo })).estado, 401);
  assert.equal((await entrar('cambio', 'NuevaClave456')).estado, 200);
});

test('cambio de nombre: valida, evita duplicados y reservados, y el login usa el nuevo', async () => {
  const { cookie } = await conSesion('renombre');
  await crearUsuario('ocupado');
  const cambiar = nombre => peticion('/api/usuarios/nombre', { metodo: 'PATCH', cookie, datos: { nombre_usuario: nombre } });

  assert.equal((await cambiar('con espacio')).estado, 400);
  assert.equal((await cambiar('<b>x</b>')).estado, 400);
  assert.equal((await cambiar('ab')).estado, 400);
  assert.equal((await cambiar('superadmin_test')).estado, 400);
  assert.equal((await cambiar('ocupado')).estado, 409);

  const bien = await cambiar('renombrado');
  assert.equal(bien.estado, 200);
  assert.equal((await peticion('/api/usuarios/me', { cookie })).datos.usuario, 'renombrado');
  assert.equal((await entrar('renombre', 'Contrasena123')).estado, 401);
  assert.equal((await entrar('renombrado', 'Contrasena123')).estado, 200);
});

test('el superadministrador no puede cambiarse el nombre desde la web', async () => {
  const { cookie } = await conSesion('superadmin_test', { rol: 'admin' });
  const respuesta = await peticion('/api/usuarios/nombre', { metodo: 'PATCH', cookie, datos: { nombre_usuario: 'otro_nombre' } });
  assert.equal(respuesta.estado, 403);
});

test('recuperación: enlace de un solo uso que cierra las sesiones', async () => {
  const admin = await conSesion('admin_rec', { rol: 'admin' });
  const persona = await conSesion('olvidadiza');

  const generado = await peticion(`/api/superadmin/usuarios/${persona.id}/recuperacion`, { metodo: 'POST', cookie: admin.cookie });
  assert.equal(generado.estado, 201);
  const { token } = generado.datos;
  assert.equal(token.length, 43);

  const comprobado = await peticion('/api/recuperacion/comprobar', { metodo: 'POST', datos: { token } });
  assert.equal(comprobado.datos.usuario, 'olvidadiza');

  assert.equal((await peticion('/api/recuperacion', { metodo: 'POST', datos: { token, contrasena: 'corta' } })).estado, 400);
  assert.equal((await peticion('/api/recuperacion', { metodo: 'POST', datos: { token, contrasena: 'Recuperada789' } })).estado, 200);
  assert.equal((await peticion('/api/recuperacion', { metodo: 'POST', datos: { token, contrasena: 'OtraVez789' } })).estado, 404);
  assert.equal((await peticion('/api/usuarios/me', { cookie: persona.cookie })).estado, 401);
  assert.equal((await entrar('olvidadiza', 'Recuperada789')).estado, 200);
});

test('generar un enlace nuevo invalida el anterior', async () => {
  const admin = await conSesion('admin_rec2', { rol: 'admin' });
  const persona = await crearUsuario('dos_enlaces');
  const generar = () => peticion(`/api/superadmin/usuarios/${persona}/recuperacion`, { metodo: 'POST', cookie: admin.cookie });
  const primero = (await generar()).datos.token;
  const segundo = (await generar()).datos.token;
  assert.equal((await peticion('/api/recuperacion/comprobar', { metodo: 'POST', datos: { token: primero } })).estado, 404);
  assert.equal((await peticion('/api/recuperacion/comprobar', { metodo: 'POST', datos: { token: segundo } })).estado, 200);
});
