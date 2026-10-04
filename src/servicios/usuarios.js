const { pool } = require('../db/pool');

// El nombre solo vive en la tabla usuarios: reseñas, chat y mensajes lo leen de ahí.
async function renombrarUsuario(usuarioId, nuevoNombre) {
  const [resultado] = await pool.execute('UPDATE usuarios SET nombre_usuario = ? WHERE id = ?', [nuevoNombre, usuarioId]);
  return resultado.affectedRows > 0;
}

module.exports = { renombrarUsuario };
