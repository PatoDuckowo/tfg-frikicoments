// Prepara chat_mensajes para el cifrado en reposo:
// - contenido_cifrado guarda el mensaje cifrado (formato v1:iv:etiqueta:cifrado).
// - contenido queda solo para los mensajes antiguos en texto plano, que se cifran
//   después con scripts/cifrar-chat.js. Por eso pasa a admitir NULL.
// Cada paso comprueba antes si ya está hecho: se puede repetir sin error.
async function columna(conexion, nombre) {
  const [filas] = await conexion.query(
    `SELECT is_nullable AS nulo FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'chat_mensajes' AND column_name = ?`,
    [nombre]
  );
  return filas[0] || null;
}

module.exports = async function migrar(conexion) {
  if (!await columna(conexion, 'contenido_cifrado')) {
    await conexion.query('ALTER TABLE chat_mensajes ADD COLUMN contenido_cifrado TEXT NULL AFTER contenido');
  }
  if ((await columna(conexion, 'contenido'))?.nulo === 'NO') {
    await conexion.query('ALTER TABLE chat_mensajes MODIFY contenido VARCHAR(500) NULL');
  }
};
