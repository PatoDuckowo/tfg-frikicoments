// Los mensajes del chat duran 24 horas: ya no puede quedar ninguno de antes del cifrado,
// así que scripts/cifrar-chat.js deja de hacer falta y se quita la columna de texto plano.
// Se puede repetir sin error: si la columna ya no está, no hace nada.
module.exports = async function migrar(conexion) {
  const [columnas] = await conexion.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'chat_mensajes' AND column_name = 'contenido'`
  );
  if (!columnas.length) return;
  await conexion.query('DELETE FROM chat_mensajes WHERE contenido_cifrado IS NULL');
  await conexion.query('ALTER TABLE chat_mensajes DROP COLUMN contenido, MODIFY contenido_cifrado TEXT NOT NULL');
};
