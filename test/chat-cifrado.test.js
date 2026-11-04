// Cifrado en reposo del chat de la portada (AES-256-GCM).
const { test, before, after, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { pool, arrancar, parar, conSesion, peticion } = require('./ayuda');
const { cifrar, descifrar, ErrorCifradoChat } = require('../src/servicios/cifrado-chat');

const claveOriginal = process.env.CHAT_ENCRYPTION_KEY;
const otraClave = () => crypto.randomBytes(32).toString('base64');
let ana;

before(async () => {
  await arrancar();
  ana = await conSesion('ana');
});
afterEach(() => { process.env.CHAT_ENCRYPTION_KEY = claveOriginal; });
after(parar);

const fallaCon = codigo => error => error instanceof ErrorCifradoChat && error.codigo === codigo;
const enviar = contenido => peticion('/api/chat', { metodo: 'POST', cookie: ana.cookie, datos: { contenido } });
const leer = () => peticion('/api/chat', { cookie: ana.cookie });
const filaDe = async id => (await pool.execute('SELECT contenido_cifrado FROM chat_mensajes WHERE id = ?', [id]))[0][0];

// ---- Servicio de cifrado ----
test('cifra y descifra (también emojis y acentos) con formato versionado', () => {
  const texto = 'Hola, ¿qué tal? 🎮👾';
  const cifrado = cifrar(texto, 7);
  assert.match(cifrado, /^v1:[\w-]+:[\w-]+:[\w-]+$/);
  assert.ok(!cifrado.includes('Hola'));
  assert.equal(descifrar(cifrado, 7), texto);
});

test('cada mensaje usa un IV distinto', () => {
  assert.notEqual(cifrar('igual', 1), cifrar('igual', 1));
});

test('con otra clave no se descifra', () => {
  const cifrado = cifrar('secreto', 1);
  process.env.CHAT_ENCRYPTION_KEY = otraClave();
  assert.throws(() => descifrar(cifrado, 1), fallaCon('DESCIFRADO'));
});

test('cualquier alteración se detecta: cifrado, etiqueta, IV, autor o versión', () => {
  const cifrado = cifrar('mensaje original', 1);
  const [version, iv, etiqueta, datos] = cifrado.split(':');
  const cambiar = parte => Buffer.from(parte, 'base64url').map((byte, i) => (i === 0 ? byte ^ 1 : byte)).toString('base64url');
  for (const alterado of [
    [version, iv, etiqueta, cambiar(datos)].join(':'),
    [version, iv, cambiar(etiqueta), datos].join(':'),
    [version, cambiar(iv), etiqueta, datos].join(':'),
    ['v2', iv, etiqueta, datos].join(':'),
    'texto plano normal',
    'v1:a:b'
  ]) {
    assert.throws(() => descifrar(alterado, 1), fallaCon('DESCIFRADO'), alterado);
  }
  // Mismo mensaje atribuido a otra persona.
  assert.throws(() => descifrar(cifrado, 2), fallaCon('DESCIFRADO'));
});

test('sin clave, o con una clave que no son 32 bytes, falla con SIN_CLAVE', () => {
  for (const valor of ['', 'corta', Buffer.alloc(16).toString('base64'), `${'A'.repeat(43)}`]) {
    process.env.CHAT_ENCRYPTION_KEY = valor;
    assert.throws(() => cifrar('x', 1), fallaCon('SIN_CLAVE'), valor);
  }
});

// ---- Rutas del chat ----
test('los mensajes nuevos se guardan cifrados y se leen descifrados', async () => {
  const enviado = await enviar('hola cifrado');
  assert.equal(enviado.estado, 201);
  const fila = await filaDe(enviado.datos.id);
  assert.match(fila.contenido_cifrado, /^v1:/);
  assert.ok(!fila.contenido_cifrado.includes('hola'));
  assert.equal((await leer()).datos.at(-1).contenido, 'hola cifrado');
});

test('la tabla del chat no tiene columna de texto plano', async () => {
  const [columnas] = await pool.query(
    "SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'chat_mensajes' AND column_name = 'contenido'"
  );
  assert.equal(columnas.length, 0);
});

test('se mantiene el límite de 500 caracteres', async () => {
  assert.equal((await enviar('a'.repeat(500))).estado, 201);
  assert.equal((await enviar('👾'.repeat(250))).estado, 201); // 500 unidades, caracteres de 4 bytes
  assert.equal((await enviar('a'.repeat(501))).estado, 400);
  assert.equal((await enviar('   ')).estado, 400);
});

test('sin clave: el chat responde 503 claro y no guarda nada en texto plano', async () => {
  const [[{ antes }]] = await pool.query('SELECT COUNT(*) AS antes FROM chat_mensajes');
  process.env.CHAT_ENCRYPTION_KEY = '';
  const escribir = await enviar('no debería guardarse');
  assert.equal(escribir.estado, 503);
  assert.match(escribir.datos.error, /cifrado/);
  const lectura = await leer();
  assert.equal(lectura.estado, 503);
  const [[{ despues }]] = await pool.query('SELECT COUNT(*) AS despues FROM chat_mensajes');
  assert.equal(despues, antes);
});

test('un mensaje alterado en la base da un error seguro, sin mostrar el cifrado', async () => {
  const { datos } = await enviar('se va a alterar');
  const fila = await filaDe(datos.id);
  const alterado = fila.contenido_cifrado.slice(0, -2) + (fila.contenido_cifrado.endsWith('AA') ? 'BB' : 'AA');
  await pool.execute('UPDATE chat_mensajes SET contenido_cifrado = ? WHERE id = ?', [alterado, datos.id]);

  const lectura = await leer();
  assert.equal(lectura.estado, 500);
  assert.match(lectura.datos.error, /No se pudieron leer/);
  assert.ok(!lectura.texto.includes('v1:'));
  await pool.execute('DELETE FROM chat_mensajes WHERE id = ?', [datos.id]);
});
