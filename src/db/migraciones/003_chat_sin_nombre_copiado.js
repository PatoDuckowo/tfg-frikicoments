// El chat guardaba una copia del nombre de usuario en cada mensaje.
// Ahora el nombre se lee siempre de la tabla usuarios, así un cambio de nombre no deja copias viejas.
module.exports = async function migrar(conexion) {
  const [columnas] = await conexion.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'chat_mensajes' AND column_name = 'nombre_usuario'`
  );
  if (columnas.length) await conexion.query('ALTER TABLE chat_mensajes DROP COLUMN nombre_usuario');
};
