// Cifra los mensajes antiguos del chat (texto plano en "contenido").
// Reanudable e idempotente: solo toca filas sin cifrar, de lote en lote, y cada fila se actualiza
// con la condición "contenido_cifrado IS NULL", así nunca se cifra dos veces. Antes de escribir,
// comprueba que el texto cifrado se descifra igual que el original.
const { pool } = require('../db/pool');
const { cifrar, descifrar, obtenerClave } = require('./cifrado-chat');

async function contarPendientes() {
  const [[fila]] = await pool.query(
    'SELECT COUNT(*) AS total FROM chat_mensajes WHERE contenido_cifrado IS NULL AND contenido IS NOT NULL'
  );
  return Number(fila.total);
}

async function cifrarMensajesPendientes({ lote = 100 } = {}) {
  obtenerClave(); // falla pronto y con un mensaje claro si no hay clave
  let cifrados = 0;
  let ultimoId = 0;
  for (;;) {
    const [filas] = await pool.query(
      `SELECT id, usuario_id, contenido FROM chat_mensajes
       WHERE contenido_cifrado IS NULL AND contenido IS NOT NULL AND id > ?
       ORDER BY id LIMIT ?`,
      [ultimoId, lote]
    );
    if (!filas.length) break;
    for (const fila of filas) {
      ultimoId = fila.id;
      const cifrado = cifrar(fila.contenido, fila.usuario_id);
      if (descifrar(cifrado, fila.usuario_id) !== fila.contenido) {
        throw new Error(`La comprobación del mensaje ${fila.id} no coincide. No se ha modificado.`);
      }
      const [resultado] = await pool.execute(
        'UPDATE chat_mensajes SET contenido_cifrado = ?, contenido = NULL WHERE id = ? AND contenido_cifrado IS NULL',
        [cifrado, fila.id]
      );
      cifrados += resultado.affectedRows;
    }
  }
  return cifrados;
}

// Comprueba que todos los mensajes cifrados se pueden descifrar con la clave actual.
// Devuelve los ids que fallan (nunca su contenido).
async function comprobarCifrados() {
  const [filas] = await pool.query('SELECT id, usuario_id, contenido_cifrado FROM chat_mensajes WHERE contenido_cifrado IS NOT NULL');
  const fallidos = [];
  for (const fila of filas) {
    try {
      descifrar(fila.contenido_cifrado, fila.usuario_id);
    } catch {
      fallidos.push(fila.id);
    }
  }
  return { total: filas.length, fallidos };
}

module.exports = { contarPendientes, cifrarMensajesPendientes, comprobarCifrados };
