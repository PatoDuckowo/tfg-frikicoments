// Panel de superadministración: cuentas, invitaciones, avisos, chat de la portada y chats privados.
const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const config = require('../config');
const { pool } = require('../db/pool');
const {
  hashToken, obtenerTokenSesion, requerirInicioSesion, requerirAdministrador, requerirCuentaGestionable
} = require('../middleware/sesion');
const { esNombreSuperAdministrador, errorNombreUsuario, idPositivo, textoEntre } = require('../utilidades/validacion');
const { renombrarUsuario } = require('../servicios/usuarios');

const router = express.Router();
const soloAdmin = [requerirInicioSesion, requerirAdministrador];
const cuentaGestionable = [...soloAdmin, requerirCuentaGestionable];

router.get('/api/superadmin/usuarios', soloAdmin, async (req, res) => {
  const [usuarios] = await pool.execute(
    'SELECT id, nombre_usuario, rol, cuota_archivos_bytes, creado_en FROM usuarios ORDER BY nombre_usuario'
  );
  res.json(usuarios);
});

// No hay registro público: solo un administrador invita a personas nuevas.
router.post('/api/usuarios/registro', soloAdmin, async (req, res) => {
  const usuario = String(req.body.usuario || '').trim();
  const contrasena = String(req.body.contrasena || '');
  const error = errorNombreUsuario(usuario);
  if (error) return res.status(400).json({ error });
  if (contrasena.length < 8 || contrasena.length > 200) {
    return res.status(400).json({ error: 'La contraseña debe tener entre 8 y 200 caracteres.' });
  }

  const hash = await bcrypt.hash(contrasena, 12);
  try {
    await pool.execute("INSERT INTO usuarios (nombre_usuario, password_hash, rol) VALUES (?, ?, 'usuario')", [usuario, hash]);
  } catch (errorBase) {
    if (errorBase.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Ese nombre de usuario ya existe.' });
    throw errorBase;
  }
  res.status(201).json({ ok: true });
});

router.patch('/api/superadmin/usuarios/:id/nombre', cuentaGestionable, async (req, res) => {
  const nuevoNombre = String(req.body.nombre_usuario || '').trim();
  // El superadministrador se identifica por LOGIN_USERNAME: su nombre no se cambia desde la web.
  if (esNombreSuperAdministrador(req.cuentaObjetivo.nombre_usuario)) {
    return res.status(403).json({ error: 'El nombre del superadministrador solo se cambia en la configuración del servidor.' });
  }
  const error = errorNombreUsuario(nuevoNombre);
  if (error) return res.status(400).json({ error });

  try {
    await renombrarUsuario(req.cuentaObjetivo.id, nuevoNombre);
  } catch (errorBase) {
    if (errorBase.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Ese nombre de usuario ya está siendo usado por otra persona.' });
    }
    throw errorBase;
  }
  res.json({ ok: true });
});

router.patch('/api/superadmin/usuarios/:id/contrasena', cuentaGestionable, async (req, res) => {
  const contrasena = String(req.body.contrasena || '');
  if (contrasena.length < 8 || contrasena.length > 200) {
    return res.status(400).json({ error: 'La contraseña debe tener entre 8 y 200 caracteres.' });
  }
  const hash = await bcrypt.hash(contrasena, 12);
  await pool.execute('UPDATE usuarios SET password_hash = ? WHERE id = ?', [hash, req.cuentaObjetivo.id]);
  // Cierra las sesiones abiertas con la contraseña anterior (salvo la del propio administrador).
  await pool.execute(
    'DELETE FROM sesiones WHERE usuario_id = ? AND token_hash <> ?',
    [req.cuentaObjetivo.id, hashToken(obtenerTokenSesion(req) || '')]
  );
  res.json({ ok: true });
});

// Recuperación sin correo: enlace de un solo uso que el administrador envía a la persona.
router.post('/api/superadmin/usuarios/:id/recuperacion', cuentaGestionable, async (req, res) => {
  const token = crypto.randomBytes(32).toString('base64url');
  const expiraEn = new Date(Date.now() + config.duracionRecuperacionMs);
  // Un enlace nuevo invalida el anterior de esa cuenta.
  await pool.execute('DELETE FROM recuperaciones_contrasena WHERE usuario_id = ?', [req.cuentaObjetivo.id]);
  await pool.execute(
    'INSERT INTO recuperaciones_contrasena (token_hash, usuario_id, creado_por, expira_en) VALUES (?, ?, ?, ?)',
    [hashToken(token), req.cuentaObjetivo.id, req.usuarioId, expiraEn]
  );
  res.status(201).json({ token, expiraEn: expiraEn.toISOString() });
});

router.patch('/api/superadmin/usuarios/:id/cuota', cuentaGestionable, async (req, res) => {
  const megabytes = Number(req.body.megabytes);
  const bytes = megabytes * 1024 * 1024;
  if (!Number.isInteger(megabytes) || bytes < config.archivos.cuotaPorDefectoBytes || bytes > config.archivos.cuotaMaximaBytes) {
    return res.status(400).json({ error: 'La cuota debe ser un número entero entre 500 MB y 10 GB.' });
  }
  await pool.execute('UPDATE usuarios SET cuota_archivos_bytes = ? WHERE id = ?', [bytes, req.cuentaObjetivo.id]);
  res.json({ ok: true, cuotaBytes: bytes });
});

router.post('/api/superadmin/mensaje-lateral', soloAdmin, async (req, res) => {
  const contenido = textoEntre(req.body.contenido, 1000);
  if (!contenido) return res.status(400).json({ error: 'Escribe un mensaje de entre 1 y 1000 caracteres.' });
  await pool.execute(
    'INSERT INTO mensajes_laterales (contenido, expira_en) VALUES (?, DATE_ADD(NOW(), INTERVAL 24 HOUR))',
    [contenido]
  );
  res.status(201).json({ ok: true, mensaje: 'Mensaje publicado durante 24 horas.' });
});

router.delete('/api/superadmin/chat', soloAdmin, async (req, res) => {
  await pool.execute('DELETE FROM chat_mensajes');
  res.json({ ok: true, mensaje: 'Chat vaciado.' });
});

// Chats privados: tamaño de cada conversación, nunca su contenido.
router.get('/api/superadmin/conversaciones', soloAdmin, async (req, res) => {
  const [filas] = await pool.execute(
    `SELECT c.id, ua.nombre_usuario AS usuario_a, ub.nombre_usuario AS usuario_b, c.creado_en,
       COUNT(m.id) AS mensajes,
       COALESCE(SUM(LENGTH(m.contenido)), 0) AS bytes,
       MAX(m.creado_en) AS ultimo_mensaje
     FROM conversaciones c
     INNER JOIN usuarios ua ON ua.id = c.usuario_menor_id
     INNER JOIN usuarios ub ON ub.id = c.usuario_mayor_id
     LEFT JOIN mensajes_privados m ON m.conversacion_id = c.id
     GROUP BY c.id, ua.nombre_usuario, ub.nombre_usuario, c.creado_en
     ORDER BY bytes DESC, c.id`
  );
  res.json(filas.map(fila => ({
    id: fila.id,
    usuarios: [fila.usuario_a, fila.usuario_b],
    mensajes: Number(fila.mensajes),
    bytes: Number(fila.bytes),
    creadoEn: fila.creado_en,
    ultimoMensaje: fila.ultimo_mensaje
  })));
});

router.delete('/api/superadmin/conversaciones/:id', soloAdmin, async (req, res) => {
  const id = idPositivo(req.params.id);
  const [resultado] = id ? await pool.execute('DELETE FROM conversaciones WHERE id = ?', [id]) : [{ affectedRows: 0 }];
  if (resultado.affectedRows === 0) return res.status(404).json({ error: 'No existe esa conversación.' });
  res.json({ ok: true, mensaje: 'Conversación borrada.' });
});

module.exports = router;
