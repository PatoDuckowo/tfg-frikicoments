// Juegos (IGDB), marcadores del usuario, biblioteca y reseñas.
const express = require('express');
const { pool, conTransaccion } = require('../db/pool');
const { requerirInicioSesion } = require('../middleware/sesion');
const { limitarIGDB } = require('../middleware/limites');
const { idPositivo, textoEntre } = require('../utilidades/validacion');
const igdb = require('../servicios/igdb');

const router = express.Router();

// Valida :id y lo deja en req.juegoId.
function requerirJuegoId(req, res, next) {
  req.juegoId = idPositivo(req.params.id);
  if (!req.juegoId) return res.status(400).json({ error: 'Identificador de juego no válido.' });
  next();
}

// Si IGDB no responde se devuelve 502, sin detalles internos.
async function conIGDB(res, trabajo) {
  try {
    return await trabajo();
  } catch (error) {
    console.error('[IGDB]', error.message);
    res.status(502).json({ error: 'No se pudo consultar IGDB. Inténtalo en un momento.' });
    return undefined;
  }
}

// «propia» indica si la reseña es de quien la pide (solo su autor puede borrarla).
const aResena = (fila, usuarioId) => ({
  id: fila.id, usuario: fila.usuario, contenido: fila.contenido, creado_en: fila.creado_en, propia: fila.usuario_id === usuarioId
});

// Añade a cada reseña el nombre del juego. Si IGDB falla, la reseña se muestra igual sin nombre.
async function conNombresDeJuego(filas, usuarioId) {
  const juegos = await igdb.obtenerJuegos(filas.map(fila => fila.juego_id)).catch(() => new Map());
  return filas.map(fila => ({ ...aResena(fila, usuarioId), juego: { id: fila.juego_id, nombre: juegos.get(fila.juego_id)?.name || null } }));
}

const consultaResenas = `
  SELECT r.id, r.juego_id, r.usuario_id, u.nombre_usuario AS usuario, r.contenido, r.creado_en
  FROM resenas r INNER JOIN usuarios u ON u.id = r.usuario_id`;

// ---- Búsqueda y ficha ----
router.get('/api/juegos/buscar', requerirInicioSesion, limitarIGDB, async (req, res) => {
  const pagina = Math.max(1, Math.min(100, Number.parseInt(req.query.page, 10) || 1));
  const juegos = await conIGDB(res, () => igdb.buscar(req.query.q || '', pagina, 12));
  if (juegos === undefined) return;
  if (juegos === null) return res.status(400).json({ error: 'Falta término de búsqueda' });
  res.json(juegos);
});

// Juegos con reseñas recientes, sin repetir. Va antes de /api/juegos/:id para que "recientes" no se tome como id.
router.get('/api/juegos/recientes', requerirInicioSesion, limitarIGDB, async (req, res) => {
  const [filas] = await pool.execute(
    'SELECT juego_id, MAX(creado_en) AS ultima FROM resenas GROUP BY juego_id ORDER BY ultima DESC LIMIT 8'
  );
  const juegos = await igdb.obtenerJuegos(filas.map(fila => fila.juego_id)).catch(() => new Map());
  res.json(filas.filter(fila => juegos.has(fila.juego_id)).map(fila => ({ id: fila.juego_id, nombre: juegos.get(fila.juego_id).name })));
});

router.get('/api/juegos/:id', requerirInicioSesion, limitarIGDB, requerirJuegoId, async (req, res) => {
  const juego = await conIGDB(res, () => igdb.obtenerJuego(req.juegoId));
  if (juego === undefined) return;
  if (!juego) return res.status(404).json({ error: 'Juego no encontrado.' });
  res.json(juego);
});

// ---- Marcadores del usuario: estado, guardado y me gusta ----
router.get('/api/juegos/:id/estado', requerirInicioSesion, requerirJuegoId, async (req, res) => {
  const [filas] = await pool.execute(
    'SELECT estado FROM juegos_usuario WHERE usuario_id = ? AND juego_id = ?', [req.usuarioId, req.juegoId]
  );
  res.json({ estado: filas[0]?.estado || null });
});

router.put('/api/juegos/:id/estado', requerirInicioSesion, requerirJuegoId, async (req, res) => {
  const estado = String(req.body.estado || '');
  if (estado === '') {
    await pool.execute('DELETE FROM juegos_usuario WHERE usuario_id = ? AND juego_id = ?', [req.usuarioId, req.juegoId]);
    return res.json({ ok: true, estado: null });
  }
  if (!['jugado', 'pendiente', 'abandonado'].includes(estado)) return res.status(400).json({ error: 'Estado no válido.' });
  await pool.execute(
    // Sintaxis con alias (MySQL 8.0.19+): VALUES(col) está obsoleto y se eliminará.
    `INSERT INTO juegos_usuario (usuario_id, juego_id, estado) VALUES (?, ?, ?) AS nuevo
     ON DUPLICATE KEY UPDATE estado = nuevo.estado`,
    [req.usuarioId, req.juegoId, estado]
  );
  res.json({ ok: true, estado });
});

router.get('/api/juegos/:id/marcadores', requerirInicioSesion, requerirJuegoId, async (req, res) => {
  const [filas] = await pool.execute(
    `SELECT
       EXISTS(SELECT 1 FROM juegos_guardados WHERE usuario_id = ? AND juego_id = ?) AS guardado,
       EXISTS(SELECT 1 FROM juegos_me_gusta WHERE usuario_id = ? AND juego_id = ?) AS me_gusta`,
    [req.usuarioId, req.juegoId, req.usuarioId, req.juegoId]
  );
  res.json({ guardado: Boolean(filas[0].guardado), meGusta: Boolean(filas[0].me_gusta) });
});

// Marca o desmarca el juego en una tabla de marcadores (guardados o me gusta).
function rutaMarcador(tabla, campo) {
  return async (req, res) => {
    const activo = Boolean(req.body[campo]);
    if (activo) {
      await pool.execute(`INSERT IGNORE INTO ${tabla} (usuario_id, juego_id) VALUES (?, ?)`, [req.usuarioId, req.juegoId]);
    } else {
      await pool.execute(`DELETE FROM ${tabla} WHERE usuario_id = ? AND juego_id = ?`, [req.usuarioId, req.juegoId]);
    }
    res.json({ ok: true, [campo]: activo });
  };
}
router.put('/api/juegos/:id/guardado', requerirInicioSesion, requerirJuegoId, rutaMarcador('juegos_guardados', 'guardado'));
router.put('/api/juegos/:id/me-gusta', requerirInicioSesion, requerirJuegoId, rutaMarcador('juegos_me_gusta', 'meGusta'));

// ---- Biblioteca ----
router.get('/api/mi-biblioteca', requerirInicioSesion, limitarIGDB, async (req, res) => {
  const yo = req.usuarioId;
  const [filas] = await pool.execute(
    `SELECT b.juego_id, b.guardado, b.me_gusta, b.estado
     FROM (
       SELECT juego_id, MAX(guardado) AS guardado, MAX(me_gusta) AS me_gusta, MAX(estado) AS estado
       FROM (
         SELECT juego_id, 1 AS guardado, 0 AS me_gusta, NULL AS estado FROM juegos_guardados WHERE usuario_id = ?
         UNION ALL
         SELECT juego_id, 0, 1, NULL FROM juegos_me_gusta WHERE usuario_id = ?
         UNION ALL
         SELECT juego_id, 0, 0, estado FROM juegos_usuario WHERE usuario_id = ?
       ) marcas
       GROUP BY juego_id
     ) b
     LEFT JOIN biblioteca_orden o ON o.usuario_id = ? AND o.juego_id = b.juego_id
     ORDER BY o.posicion IS NULL, o.posicion, b.juego_id`,
    [yo, yo, yo, yo]
  );
  const juegos = await conIGDB(res, () => igdb.obtenerJuegos(filas.map(fila => fila.juego_id)));
  if (juegos === undefined) return;
  res.json(filas.filter(fila => juegos.has(fila.juego_id)).map(fila => ({ ...fila, juego: juegos.get(fila.juego_id) })));
});

// Guarda el orden elegido por el usuario (lista completa de ids).
router.put('/api/mi-biblioteca/orden', requerirInicioSesion, async (req, res) => {
  const juegos = req.body.juegos;
  const valido = Array.isArray(juegos) && juegos.length <= 1000
    && juegos.every(id => idPositivo(id) === id) && new Set(juegos).size === juegos.length;
  if (!valido) return res.status(400).json({ error: 'El orden enviado no es válido.' });

  await conTransaccion(async conexion => {
    await conexion.execute('DELETE FROM biblioteca_orden WHERE usuario_id = ?', [req.usuarioId]);
    if (juegos.length) {
      await conexion.query('INSERT INTO biblioteca_orden (usuario_id, juego_id, posicion) VALUES ?',
        [juegos.map((juegoId, posicion) => [req.usuarioId, juegoId, posicion])]);
    }
  });
  res.json({ ok: true });
});

// ---- Reseñas (una sola tabla, por id de IGDB) ----
router.get('/api/resenas', requerirInicioSesion, limitarIGDB, async (req, res) => {
  const [resenas] = await pool.execute(`${consultaResenas} ORDER BY r.creado_en DESC, r.id DESC LIMIT 50`);
  res.json(await conNombresDeJuego(resenas, req.usuarioId));
});

router.get('/api/juegos/:id/resenas', requerirInicioSesion, requerirJuegoId, async (req, res) => {
  const [resenas] = await pool.execute(
    `${consultaResenas} WHERE r.juego_id = ? ORDER BY r.creado_en DESC, r.id DESC LIMIT 200`, [req.juegoId]
  );
  res.json(resenas.map(fila => aResena(fila, req.usuarioId)));
});

router.post('/api/resenas', requerirInicioSesion, limitarIGDB, async (req, res) => {
  const juegoId = idPositivo(req.body.juegoId);
  const contenido = textoEntre(req.body.contenido, 5000);
  if (!juegoId || !contenido) {
    return res.status(400).json({ error: 'Elige un juego y escribe una reseña de hasta 5000 caracteres.' });
  }
  // Solo se aceptan juegos que existen en IGDB (lo normal es que ya estén en caché).
  const juego = await conIGDB(res, () => igdb.obtenerJuego(juegoId));
  if (juego === undefined) return;
  if (!juego) return res.status(400).json({ error: 'Ese juego no existe en IGDB.' });

  const [resultado] = await pool.execute(
    'INSERT INTO resenas (usuario_id, juego_id, contenido) VALUES (?, ?, ?)', [req.usuarioId, juegoId, contenido]
  );
  res.status(201).json({ id: resultado.insertId, usuario: req.usuario, contenido, propia: true, juego: { id: juegoId, nombre: juego.name } });
});

// Solo el autor puede borrar su reseña. Si no es suya, se responde igual que si no existiera.
router.delete('/api/resenas/:id', requerirInicioSesion, async (req, res) => {
  const id = idPositivo(req.params.id);
  const [resultado] = id
    ? await pool.execute('DELETE FROM resenas WHERE id = ? AND usuario_id = ?', [id, req.usuarioId])
    : [{ affectedRows: 0 }];
  if (resultado.affectedRows === 0) return res.status(404).json({ error: 'No existe esa reseña o no es tuya.' });
  res.json({ ok: true, mensaje: 'Reseña borrada.' });
});

router.get('/api/estadisticas', requerirInicioSesion, async (req, res) => {
  const [filas] = await pool.execute('SELECT COUNT(*) AS resenas FROM resenas');
  res.json({ resenas: Number(filas[0].resenas) });
});

module.exports = router;
