// Permisos de administración: quién puede gestionar qué cuenta, invitaciones y chats privados.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { pool, arrancar, parar, crearUsuario, conSesion, sesion, peticion } = require('./ayuda');

let superadmin;
let admin;
let otroAdmin;
let usuario;

before(async () => {
  await arrancar();
  superadmin = await conSesion('superadmin_test', { rol: 'admin' });
  admin = await conSesion('admin_a', { rol: 'admin' });
  otroAdmin = await conSesion('admin_b', { rol: 'admin' });
  usuario = await conSesion('normal');
});
after(parar);

const cambiarCuota = (quien, id, megabytes) =>
  peticion(`/api/superadmin/usuarios/${id}/cuota`, { metodo: 'PATCH', cookie: quien.cookie, datos: { megabytes } });

test('un usuario normal no entra en la administración', async () => {
  assert.equal((await peticion('/api/superadmin/usuarios', { cookie: usuario.cookie })).estado, 403);
  assert.equal((await peticion('/usuarios/superadmin.html', { cookie: usuario.cookie })).estado, 403);
  assert.equal((await peticion('/api/superadmin/usuarios')).estado, 401);
});

test('un admin gestiona cuentas normales, la suya, pero no la de otro admin ni la del superadmin', async () => {
  assert.equal((await cambiarCuota(admin, usuario.id, 600)).estado, 200);
  assert.equal((await cambiarCuota(admin, admin.id, 600)).estado, 200);
  assert.equal((await cambiarCuota(admin, otroAdmin.id, 600)).estado, 403);
  assert.equal((await cambiarCuota(admin, superadmin.id, 600)).estado, 403);
  assert.equal((await cambiarCuota(superadmin, otroAdmin.id, 600)).estado, 200);
  assert.equal((await cambiarCuota(admin, 999999, 600)).estado, 404);
});

test('la cuota debe estar entre 500 MB y 10 GB', async () => {
  assert.equal((await cambiarCuota(admin, usuario.id, 499)).estado, 400);
  assert.equal((await cambiarCuota(admin, usuario.id, 10241)).estado, 400);
  assert.equal((await cambiarCuota(admin, usuario.id, 'mucho')).estado, 400);
});

test('restablecer la contraseña de otro cierra sus sesiones', async () => {
  const respuesta = await peticion(`/api/superadmin/usuarios/${usuario.id}/contrasena`, {
    metodo: 'PATCH', cookie: admin.cookie, datos: { contrasena: 'Restablecida123' }
  });
  assert.equal(respuesta.estado, 200);
  assert.equal((await peticion('/api/usuarios/me', { cookie: usuario.cookie })).estado, 401);
  usuario.cookie = await sesion(usuario.id); // nueva sesión para los tests siguientes
});

test('invitar: solo administradores y con nombre válido', async () => {
  const invitar = (quien, datos) => peticion('/api/usuarios/registro', { metodo: 'POST', cookie: quien.cookie, datos });
  assert.equal((await invitar(usuario, { usuario: 'nuevo_1', contrasena: 'Contrasena123' })).estado, 403);
  assert.equal((await invitar(admin, { usuario: 'con espacio', contrasena: 'Contrasena123' })).estado, 400);
  assert.equal((await invitar(admin, { usuario: 'nuevo_1', contrasena: 'corta' })).estado, 400);
  assert.equal((await invitar(admin, { usuario: 'nuevo_1', contrasena: 'Contrasena123' })).estado, 201);
  assert.equal((await invitar(admin, { usuario: 'nuevo_1', contrasena: 'Contrasena123' })).estado, 409);
});

test('chats privados: el admin ve tamaños pero nunca el contenido, y puede borrar', async () => {
  const a = await crearUsuario('charla_a');
  const b = await crearUsuario('charla_b');
  const [conversacion] = await pool.execute(
    'INSERT INTO conversaciones (usuario_menor_id, usuario_mayor_id) VALUES (?, ?)', [Math.min(a, b), Math.max(a, b)]
  );
  await pool.execute('INSERT INTO mensajes_privados (conversacion_id, autor_id, contenido) VALUES (?, ?, ?)',
    [conversacion.insertId, a, 'secreto muy privado']);

  const lista = await peticion('/api/superadmin/conversaciones', { cookie: admin.cookie });
  assert.equal(lista.estado, 200);
  assert.doesNotMatch(lista.texto, /secreto/);
  const fila = lista.datos.find(c => c.id === conversacion.insertId);
  assert.deepEqual(fila.usuarios, ['charla_a', 'charla_b']);
  assert.equal(fila.mensajes, 1);
  assert.equal(fila.bytes, 'secreto muy privado'.length);

  assert.equal((await peticion(`/api/superadmin/conversaciones/${fila.id}`, { metodo: 'DELETE', cookie: usuario.cookie })).estado, 403);
  assert.equal((await peticion(`/api/superadmin/conversaciones/${fila.id}`, { metodo: 'DELETE', cookie: admin.cookie })).estado, 200);
  const [quedan] = await pool.execute('SELECT COUNT(*) AS n FROM mensajes_privados WHERE conversacion_id = ?', [fila.id]);
  assert.equal(quedan[0].n, 0);
});
