// Utilidades comunes de los tests: base de datos limpia, servidor en un puerto libre,
// usuarios con sesión e IGDB sustituido por juegos falsos (los tests no salen a internet).
// La base la indican DB_HOST, DB_USER, DB_PASSWORD y DB_NAME: ¡nunca la de producción!
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

process.env.NODE_ENV = 'test';
process.env.LOGIN_USERNAME = 'superadmin_test';
process.env.IGDB_CLIENT_ID = '';
process.env.IGDB_CLIENT_SECRET = '';
process.env.DIRECTORIO_ARCHIVOS = fs.mkdtempSync(path.join(os.tmpdir(), 'frikicoments-tests-'));
if (!/test/i.test(process.env.DB_NAME || '')) {
  throw new Error('Los tests borran la base: DB_NAME debe contener "test".');
}

const bcrypt = require('bcryptjs');
const { pool } = require('../src/db/pool');
const { migrar } = require('../src/db/migrar');
const { crearApp } = require('../src/app');
const igdb = require('../src/servicios/igdb');

const juegosFalsos = new Map([
  [1, { id: 1, name: 'Juego Uno', released: '2001', rating: '4.0', summary: null, background_image: null }],
  [2, { id: 2, name: 'Juego Dos', released: '2002', rating: '3.5', summary: null, background_image: null }],
  [3, { id: 3, name: 'Juego Tres', released: 'N/D', rating: 'N/D', summary: null, background_image: null }]
]);
igdb.obtenerJuegos = async ids => new Map(ids.map(Number).filter(id => juegosFalsos.has(id)).map(id => [id, juegosFalsos.get(id)]));
igdb.obtenerJuego = async id => juegosFalsos.get(Number(id)) || null;
igdb.buscar = async texto => [...juegosFalsos.values()].filter(juego => juego.name.toLowerCase().includes(String(texto).toLowerCase()));
igdb.buscarIdPorNombre = async nombre => [...juegosFalsos.values()].find(juego => juego.name === nombre)?.id || null;

// Borra todas las tablas y aplica las migraciones desde cero (como una instalación nueva).
async function prepararBase() {
  const [tablas] = await pool.query('SELECT table_name AS nombre FROM information_schema.tables WHERE table_schema = DATABASE()');
  await pool.query('SET FOREIGN_KEY_CHECKS = 0');
  for (const { nombre } of tablas) await pool.query(`DROP TABLE \`${nombre}\``);
  await pool.query('SET FOREIGN_KEY_CHECKS = 1');
  await migrar({ igdb });
}

let servidor;
let base;

async function arrancar() {
  await prepararBase();
  servidor = crearApp().listen(0, '127.0.0.1');
  await new Promise(resolver => servidor.once('listening', resolver));
  base = `http://127.0.0.1:${servidor.address().port}`;
}

async function parar() {
  await new Promise(resolver => servidor.close(resolver));
  await pool.end();
}

async function crearUsuario(nombre, { rol = 'usuario', contrasena = 'Contrasena123' } = {}) {
  const hash = await bcrypt.hash(contrasena, 4);
  const [resultado] = await pool.execute(
    'INSERT INTO usuarios (nombre_usuario, password_hash, rol) VALUES (?, ?, ?)', [nombre, hash, rol]
  );
  return resultado.insertId;
}

// Sesión creada directamente en la base (así los tests no chocan con el límite de logins).
async function sesion(usuarioId) {
  const token = crypto.randomBytes(32).toString('hex');
  await pool.execute(
    'INSERT INTO sesiones (token_hash, usuario_id, expira_en) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 1 HOUR))',
    [crypto.createHash('sha256').update(token).digest('hex'), usuarioId]
  );
  return `frikicoments_session=${token}`;
}

// Usuario + cookie de sesión en un paso.
async function conSesion(nombre, opciones) {
  const id = await crearUsuario(nombre, opciones);
  return { id, cookie: await sesion(id) };
}

async function peticion(ruta, { cookie, metodo = 'GET', datos, cuerpoCrudo, cabeceras = {} } = {}) {
  const opciones = { method: metodo, headers: { ...cabeceras }, redirect: 'manual' };
  if (cookie) opciones.headers.Cookie = cookie;
  if (datos !== undefined) {
    opciones.headers['Content-Type'] = 'application/json';
    opciones.body = JSON.stringify(datos);
  } else if (cuerpoCrudo !== undefined) {
    opciones.body = cuerpoCrudo;
  }
  const respuesta = await fetch(base + ruta, opciones);
  const texto = await respuesta.text();
  let json = null;
  try {
    json = JSON.parse(texto);
  } catch {
    // No era JSON (una página HTML, por ejemplo).
  }
  return { estado: respuesta.status, datos: json, texto, cabeceras: respuesta.headers };
}

module.exports = { pool, arrancar, parar, crearUsuario, sesion, conSesion, peticion };
