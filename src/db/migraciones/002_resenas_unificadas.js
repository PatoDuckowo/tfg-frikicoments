// Une las dos tablas de reseñas en una sola, identificada por el id del juego en IGDB:
// - comentarios_juegos (ficha del juego) ya tenía el id de IGDB.
// - comentarios (portada) guardaba el nombre del juego como texto: se busca su id en IGDB.
// Si algún nombre no se encuentra, la migración falla sin borrar nada.

async function existeTabla(conexion, tabla) {
  const [filas] = await conexion.query(
    'SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?',
    [tabla]
  );
  return filas.length > 0;
}

module.exports = async function migrar(conexion, { igdb }) {
  await conexion.query(`
    CREATE TABLE IF NOT EXISTS resenas (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      usuario_id INT UNSIGNED NOT NULL,
      juego_id INT UNSIGNED NOT NULL,
      contenido TEXT NOT NULL,
      creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY ix_resenas_juego (juego_id, creado_en),
      KEY ix_resenas_creado (creado_en),
      CONSTRAINT fk_resenas_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
        ON UPDATE CASCADE ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  const hayFicha = await existeTabla(conexion, 'comentarios_juegos');
  const hayPortada = await existeTabla(conexion, 'comentarios');
  const [[{ yaCopiadas }]] = await conexion.query('SELECT COUNT(*) AS yaCopiadas FROM resenas');

  // Si una ejecución anterior ya copió las reseñas, solo queda borrar las tablas viejas.
  if (yaCopiadas === 0) {
    const [dePortada] = hayPortada
      ? await conexion.query('SELECT usuario_id, juego, contenido, creado_en FROM comentarios ORDER BY id')
      : [[]];

    const idsPorNombre = new Map();
    for (const nombre of new Set(dePortada.map(fila => fila.juego))) {
      const id = await igdb.buscarIdPorNombre(nombre);
      if (!id) throw new Error(`No se encontró en IGDB el juego "${nombre}". No se ha borrado nada.`);
      idsPorNombre.set(nombre, id);
    }

    await conexion.beginTransaction();
    try {
      if (hayFicha) {
        await conexion.query(
          `INSERT INTO resenas (usuario_id, juego_id, contenido, creado_en)
           SELECT usuario_id, juego_id, contenido, creado_en FROM comentarios_juegos ORDER BY id`
        );
      }
      for (const fila of dePortada) {
        await conexion.query(
          'INSERT INTO resenas (usuario_id, juego_id, contenido, creado_en) VALUES (?, ?, ?, ?)',
          [fila.usuario_id, idsPorNombre.get(fila.juego), fila.contenido, fila.creado_en]
        );
      }
      await conexion.commit();
    } catch (error) {
      await conexion.rollback();
      throw error;
    }
  }

  if (hayFicha) await conexion.query('DROP TABLE comentarios_juegos');
  if (hayPortada) await conexion.query('DROP TABLE comentarios');
};
