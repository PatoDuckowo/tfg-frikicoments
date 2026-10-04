// Comunidad: chat de la portada, aviso lateral, personas, perfiles, seguir y chat privado.
// Dos personas solo pueden escribirse en privado si se siguen mutuamente.
const express = require('express');
const { pool } = require('../db/pool');
const { requerirInicioSesion, requerirOtroUsuario } = require('../middleware/sesion');
const { limitarIGDB, limitarMensajes } = require('../middleware/limites');
const { textoEntre } = require('../utilidades/validacion');
const igdb = require('../servicios/igdb');
const { cifrar, descifrar, ErrorCifradoChat } = require('../servicios/cifrado-chat');

const router = express.Router();

// ---- Chat de la portada (los mensajes duran 24 horas) y aviso lateral ----
// Los mensajes se guardan cifrados (AES-256-GCM, ver servicios/cifrado-chat.js).
// Los antiguos en texto plano se leen tal cual hasta que scripts/cifrar-chat.js los cifra.
const errorSinClave = { estado: 503, error: 'El chat no está disponible: falta configurar el cifrado en el servidor.' };
const errorDescifrado = { estado: 500, error: 'No se pudieron leer los mensajes del chat. Avisa a un administrador.' };

// Responde al error de cifrado con un mensaje seguro (sin datos del mensaje ni de la clave).
function responderErrorCifrado(res, error, mensajeId) {
  const fallo = error.codigo === 'SIN_CLAVE' ? errorSinClave : errorDescifrado;
  console.error(`[CHAT] ${error.codigo}${mensajeId ? ` en el mensaje ${mensajeId}` : ''}`);
  return res.status(fallo.estado).json({ error: fallo.error });
}

router.get('/api/chat', requerirInicioSesion, async (req, res) => {
  const [filas] = await pool.execute(
    `SELECT c.id, c.usuario_id, u.nombre_usuario AS usuario, c.contenido, c.contenido_cifrado, c.creado_en
     FROM chat_mensajes c INNER JOIN usuarios u ON u.id = c.usuario_id
     WHERE c.creado_en > DATE_SUB(NOW(), INTERVAL 24 HOUR)
     ORDER BY c.creado_en DESC, c.id DESC LIMIT 50`
  );
  const mensajes = [];
  for (const fila of filas.reverse()) {
    let contenido = fila.contenido; // mensaje antiguo, aún sin cifrar
    if (fila.contenido_cifrado !== null) {
      try {
        contenido = descifrar(fila.contenido_cifrado, fila.usuario_id);
      } catch (error) {
        if (error instanceof ErrorCifradoChat) return responderErrorCifrado(res, error, fila.id);
        throw error;
      }
    }
    mensajes.push({ id: fila.id, usuario: fila.usuario, contenido, creado_en: fila.creado_en });
  }
  res.json(mensajes);
});

router.post('/api/chat', requerirInicioSesion, limitarMensajes, async (req, res) => {
  const contenido = textoEntre(req.body.contenido, 500);
  if (!contenido) return res.status(400).json({ error: 'El mensaje debe tener entre 1 y 500 caracteres.' });
  let cifrado;
  try {
    cifrado = cifrar(contenido, req.usuarioId);
  } catch (error) {
    // Sin clave nunca se guarda el mensaje en texto plano.
    if (error instanceof ErrorCifradoChat) return responderErrorCifrado(res, error);
    throw error;
  }
  const [resultado] = await pool.execute(
    'INSERT INTO chat_mensajes (usuario_id, contenido_cifrado) VALUES (?, ?)', [req.usuarioId, cifrado]
  );
  res.status(201).json({ id: resultado.insertId, usuario: req.usuario, contenido });
});

router.get('/api/mensaje-lateral', requerirInicioSesion, async (req, res) => {
  const [mensajes] = await pool.execute(
    'SELECT contenido, expira_en FROM mensajes_laterales WHERE expira_en > NOW() ORDER BY creado_en DESC LIMIT 1'
  );
  res.json(mensajes[0] || null);
});

// ---- Personas, perfiles y seguir ----
async function consultarRelacion(yoId, otroId) {
  const [filas] = await pool.execute(
    `SELECT
       EXISTS(SELECT 1 FROM seguimientos WHERE seguidor_id = ? AND seguido_id = ?) AS lo_sigo,
       EXISTS(SELECT 1 FROM seguimientos WHERE seguidor_id = ? AND seguido_id = ?) AS me_sigue`,
    [yoId, otroId, otroId, yoId]
  );
  const loSigo = Boolean(filas[0].lo_sigo);
  const meSigue = Boolean(filas[0].me_sigue);
  return { loSigo, meSigue, mutuo: loSigo && meSigue };
}

router.get('/api/personas', requerirInicioSesion, async (req, res) => {
  const yo = req.usuarioId;
  const [filas] = await pool.execute(
    `SELECT u.id, u.nombre_usuario AS usuario,
       EXISTS(SELECT 1 FROM seguimientos s WHERE s.seguidor_id = ? AND s.seguido_id = u.id) AS lo_sigo,
       EXISTS(SELECT 1 FROM seguimientos s WHERE s.seguidor_id = u.id AND s.seguido_id = ?) AS me_sigue
     FROM usuarios u WHERE u.id <> ? ORDER BY u.nombre_usuario`,
    [yo, yo, yo]
  );
  res.json(filas.map(fila => ({
    id: fila.id,
    usuario: fila.usuario,
    loSigo: Boolean(fila.lo_sigo),
    meSigue: Boolean(fila.me_sigue),
    mutuo: Boolean(fila.lo_sigo && fila.me_sigue)
  })));
});

router.get('/api/perfiles/:nombre', requerirInicioSesion, limitarIGDB, async (req, res) => {
  const nombre = String(req.params.nombre || '').trim();
  const [usuarios] = nombre && nombre.length <= 80
    ? await pool.execute(
      `SELECT u.id, u.nombre_usuario,
         (SELECT COUNT(*) FROM seguimientos WHERE seguido_id = u.id) AS seguidores,
         (SELECT COUNT(*) FROM seguimientos WHERE seguidor_id = u.id) AS siguiendo
       FROM usuarios u WHERE u.nombre_usuario = ?`,
      [nombre])
    : [[]];
  const perfil = usuarios[0];
  if (!perfil) return res.status(404).json({ error: 'No existe ese usuario.' });

  const [[meGusta], [pendientes]] = await Promise.all([
    pool.execute('SELECT juego_id FROM juegos_me_gusta WHERE usuario_id = ? ORDER BY creado_en DESC LIMIT 200', [perfil.id]),
    pool.execute(
      `SELECT juego_id FROM juegos_usuario WHERE usuario_id = ? AND estado = 'pendiente'
       ORDER BY actualizado_en DESC LIMIT 200`, [perfil.id])
  ]);

  // Si IGDB falla, el perfil se muestra igual (seguir y chatear no dependen de IGDB).
  let juegos = new Map();
  let avisoJuegos = null;
  try {
    juegos = await igdb.obtenerJuegos([...meGusta, ...pendientes].map(fila => fila.juego_id));
  } catch (error) {
    console.error('[IGDB] perfil:', error.message);
    avisoJuegos = 'No se pudieron cargar los juegos ahora mismo.';
  }
  const aJuegos = filas => filas.map(fila => juegos.get(fila.juego_id)).filter(Boolean);
  const esPropio = perfil.id === req.usuarioId;

  res.json({
    id: perfil.id,
    usuario: perfil.nombre_usuario,
    esPropio,
    seguidores: Number(perfil.seguidores),
    siguiendo: Number(perfil.siguiendo),
    relacion: esPropio ? null : await consultarRelacion(req.usuarioId, perfil.id),
    meGusta: aJuegos(meGusta),
    pendientes: aJuegos(pendientes),
    avisoJuegos
  });
});

router.put('/api/usuarios/:id/seguir', requerirInicioSesion, requerirOtroUsuario, async (req, res) => {
  if (req.body.seguir) {
    await pool.execute('INSERT IGNORE INTO seguimientos (seguidor_id, seguido_id) VALUES (?, ?)', [req.usuarioId, req.otroUsuario.id]);
  } else {
    await pool.execute('DELETE FROM seguimientos WHERE seguidor_id = ? AND seguido_id = ?', [req.usuarioId, req.otroUsuario.id]);
  }
  res.json({ ok: true, relacion: await consultarRelacion(req.usuarioId, req.otroUsuario.id) });
});

// ---- Chat privado ----
// Una conversación por pareja, con los ids ordenados (usuario_menor_id < usuario_mayor_id).
function pareja(yo, otro) {
  const [menor, mayor] = yo < otro ? [yo, otro] : [otro, yo];
  return { menor, mayor, columnaLeido: yo === menor ? 'leido_menor_hasta' : 'leido_mayor_hasta' };
}

async function buscarConversacion(menor, mayor) {
  const [filas] = await pool.execute(
    'SELECT id FROM conversaciones WHERE usuario_menor_id = ? AND usuario_mayor_id = ?', [menor, mayor]
  );
  return filas[0]?.id || null;
}

// Mensajes sin leer en total: lo usa el aviso del menú.
router.get('/api/mensajes/no-leidos', requerirInicioSesion, async (req, res) => {
  const yo = req.usuarioId;
  const [filas] = await pool.execute(
    `SELECT COUNT(*) AS total
     FROM conversaciones c INNER JOIN mensajes_privados m ON m.conversacion_id = c.id
     WHERE m.autor_id <> ?
       AND ((c.usuario_menor_id = ? AND m.id > c.leido_menor_hasta)
         OR (c.usuario_mayor_id = ? AND m.id > c.leido_mayor_hasta))`,
    [yo, yo, yo]
  );
  res.json({ total: Number(filas[0].total) });
});

// Lista de chats: personas con seguimiento mutuo o con una conversación guardada.
router.get('/api/mensajes', requerirInicioSesion, async (req, res) => {
  const yo = req.usuarioId;
  const [filas] = await pool.execute(
    `SELECT u.id, u.nombre_usuario AS usuario, c.id AS conversacion_id,
       (EXISTS(SELECT 1 FROM seguimientos WHERE seguidor_id = ? AND seguido_id = u.id)
         AND EXISTS(SELECT 1 FROM seguimientos WHERE seguidor_id = u.id AND seguido_id = ?)) AS mutuo,
       (SELECT MAX(m.creado_en) FROM mensajes_privados m WHERE m.conversacion_id = c.id) AS ultimo_mensaje,
       (SELECT COUNT(*) FROM mensajes_privados m
        WHERE m.conversacion_id = c.id AND m.autor_id = u.id
          AND m.id > IF(c.usuario_menor_id = ?, c.leido_menor_hasta, c.leido_mayor_hasta)) AS no_leidos
     FROM usuarios u
     LEFT JOIN conversaciones c ON c.usuario_menor_id = LEAST(u.id, ?) AND c.usuario_mayor_id = GREATEST(u.id, ?)
     WHERE u.id <> ?
     HAVING conversacion_id IS NOT NULL OR mutuo
     ORDER BY ultimo_mensaje IS NULL, ultimo_mensaje DESC, usuario`,
    [yo, yo, yo, yo, yo, yo]
  );
  res.json(filas.map(fila => ({
    id: fila.id,
    usuario: fila.usuario,
    puedeEscribir: Boolean(fila.mutuo),
    ultimoMensaje: fila.ultimo_mensaje,
    noLeidos: Number(fila.no_leidos)
  })));
});

// Mensajes con otra persona. Con ?desde=<id> solo devuelve los posteriores (consulta periódica).
router.get('/api/mensajes/:id', requerirInicioSesion, requerirOtroUsuario, async (req, res) => {
  const yo = req.usuarioId;
  const { menor, mayor, columnaLeido } = pareja(yo, req.otroUsuario.id);
  const desde = Math.max(0, Number.parseInt(req.query.desde, 10) || 0);
  const relacion = await consultarRelacion(yo, req.otroUsuario.id);
  const conversacionId = await buscarConversacion(menor, mayor);

  let mensajes = [];
  if (conversacionId) {
    [mensajes] = desde > 0
      ? await pool.execute(
        `SELECT id, autor_id, contenido, creado_en FROM mensajes_privados
         WHERE conversacion_id = ? AND id > ? ORDER BY id LIMIT 200`, [conversacionId, desde])
      : await pool.execute(
        `SELECT * FROM (
           SELECT id, autor_id, contenido, creado_en FROM mensajes_privados
           WHERE conversacion_id = ? ORDER BY id DESC LIMIT 100
         ) ultimos ORDER BY id`, [conversacionId]);
    if (mensajes.length) {
      await pool.execute(
        `UPDATE conversaciones SET ${columnaLeido} = GREATEST(${columnaLeido}, ?) WHERE id = ?`,
        [mensajes.at(-1).id, conversacionId]
      );
    }
  }

  res.json({
    usuario: req.otroUsuario,
    relacion,
    puedeEscribir: relacion.mutuo,
    mensajes: mensajes.map(mensaje => ({
      id: Number(mensaje.id),
      propio: mensaje.autor_id === yo,
      contenido: mensaje.contenido,
      creadoEn: mensaje.creado_en
    }))
  });
});

router.post('/api/mensajes/:id', requerirInicioSesion, limitarMensajes, requerirOtroUsuario, async (req, res) => {
  const yo = req.usuarioId;
  const contenido = textoEntre(req.body.contenido, 1000);
  if (!contenido) return res.status(400).json({ error: 'El mensaje debe tener entre 1 y 1000 caracteres.' });
  if (!(await consultarRelacion(yo, req.otroUsuario.id)).mutuo) {
    return res.status(403).json({ error: 'Solo podéis escribiros si os seguís mutuamente.' });
  }

  const { menor, mayor, columnaLeido } = pareja(yo, req.otroUsuario.id);
  let conversacionId = await buscarConversacion(menor, mayor);
  if (!conversacionId) {
    // Si las dos personas escriben a la vez, LAST_INSERT_ID(id) devuelve la conversación ya creada.
    const [creada] = await pool.execute(
      `INSERT INTO conversaciones (usuario_menor_id, usuario_mayor_id) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`,
      [menor, mayor]
    );
    conversacionId = creada.insertId;
  }
  const [resultado] = await pool.execute(
    'INSERT INTO mensajes_privados (conversacion_id, autor_id, contenido) VALUES (?, ?, ?)', [conversacionId, yo, contenido]
  );
  await pool.execute(
    `UPDATE conversaciones SET ${columnaLeido} = GREATEST(${columnaLeido}, ?) WHERE id = ?`,
    [resultado.insertId, conversacionId]
  );
  res.status(201).json({ id: Number(resultado.insertId), propio: true, contenido, creadoEn: new Date() });
});

module.exports = router;
