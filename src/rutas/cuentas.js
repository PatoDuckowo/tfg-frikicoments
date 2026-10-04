// Sesión y cuenta propia: login, logout, datos, nombre, contraseña y recuperación con enlace.
const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const config = require('../config');
const { pool, conTransaccion } = require('../db/pool');
const {
  hashToken, obtenerTokenSesion, ponerCookieSesion, borrarCookieSesion, requerirInicioSesion
} = require('../middleware/sesion');
const { crearRegistro, puedeContinuar, ipCliente } = require('../utilidades/limites');
const { limitarRecuperacion } = require('../middleware/limites');
const { esNombreSuperAdministrador, errorNombreUsuario } = require('../utilidades/validacion');
const { renombrarUsuario } = require('../servicios/usuarios');

const router = express.Router();

// ---- Login con límite por IP y bloqueo progresivo por IP+usuario ----
const limitesLogin = crearRegistro();
const fallosLogin = new Map(); // clave -> { cantidad, ultimo }
const bloqueosLogin = new Map(); // clave -> fecha (ms) hasta la que está bloqueado

function obtenerBloqueo(clave) {
  const hasta = bloqueosLogin.get(clave) || 0;
  if (hasta <= Date.now()) {
    bloqueosLogin.delete(clave);
    return 0;
  }
  return hasta;
}

function registrarFallo(clave) {
  const cantidad = (fallosLogin.get(clave)?.cantidad || 0) + 1;
  fallosLogin.set(clave, { cantidad, ultimo: Date.now() });
  if (cantidad >= 10) bloqueosLogin.set(clave, Date.now() + 5 * 60 * 1000);
  else if (cantidad >= 5) bloqueosLogin.set(clave, Date.now() + 30 * 1000);
}

setInterval(() => {
  const ahora = Date.now();
  for (const [clave, { ultimo }] of fallosLogin) if (ahora - ultimo >= 60 * 60 * 1000) fallosLogin.delete(clave);
  for (const [clave, hasta] of bloqueosLogin) if (hasta <= ahora) bloqueosLogin.delete(clave);
}, 10 * 60 * 1000).unref();

router.post('/api/usuarios/login', async (req, res) => {
  const ip = ipCliente(req);
  if (!puedeContinuar(limitesLogin, ip, 10, 15 * 60 * 1000)) {
    return res.status(429).json({ error: 'Demasiados intentos. Espera unos minutos.' });
  }
  const usuario = String(req.body.usuario || '').trim();
  const contrasena = String(req.body.contrasena || '');
  const clave = `${ip}|${usuario.toLowerCase()}`;
  const bloqueadoHasta = obtenerBloqueo(clave);
  if (bloqueadoHasta) {
    const segundos = Math.ceil((bloqueadoHasta - Date.now()) / 1000);
    res.setHeader('Retry-After', String(segundos));
    return res.status(429).json({ error: `Demasiados intentos. Espera ${segundos} segundos.` });
  }

  const [filas] = await pool.execute(
    'SELECT id, password_hash FROM usuarios WHERE nombre_usuario = ?',
    [usuario]
  );
  const cuenta = filas[0];
  const valida = cuenta && await bcrypt.compare(contrasena, cuenta.password_hash);
  // JSON.stringify evita que un nombre con saltos de línea falsee el log.
  if (!valida) {
    console.warn(`[LOGIN FALLIDO] Usuario: ${JSON.stringify(usuario.slice(0, 80))} | IP: ${ip}`);
    registrarFallo(clave);
    return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
  }

  console.log(`[LOGIN OK] Usuario: ${JSON.stringify(usuario)} | IP: ${ip}`);
  fallosLogin.delete(clave);
  bloqueosLogin.delete(clave);
  const token = crypto.randomBytes(32).toString('hex');
  await pool.execute(
    'INSERT INTO sesiones (token_hash, usuario_id, expira_en) VALUES (?, ?, ?)',
    [hashToken(token), cuenta.id, new Date(Date.now() + config.sesion.duracionMs)]
  );
  ponerCookieSesion(res, token);
  res.json({ ok: true });
});

router.post('/api/usuarios/logout', async (req, res) => {
  const token = obtenerTokenSesion(req);
  if (token) await pool.execute('DELETE FROM sesiones WHERE token_hash = ?', [hashToken(token)]);
  borrarCookieSesion(res);
  res.redirect(303, '/');
});

router.get('/api/usuarios/me', requerirInicioSesion, (req, res) => {
  res.json({
    id: req.usuarioId,
    usuario: req.usuario,
    rol: req.rol,
    esSuperAdministrador: esNombreSuperAdministrador(req.usuario),
    esAdministrador: req.rol === 'admin'
  });
});

// ---- Nombre y contraseña propios ----
const limitesCambioNombre = crearRegistro();

router.patch('/api/usuarios/nombre', requerirInicioSesion, async (req, res) => {
  const nuevoNombre = String(req.body.nombre_usuario || '').trim();
  if (esNombreSuperAdministrador(req.usuario)) {
    return res.status(403).json({ error: 'El nombre del superadministrador solo se cambia en la configuración del servidor.' });
  }
  const error = errorNombreUsuario(nuevoNombre);
  if (error) return res.status(400).json({ error });
  if (nuevoNombre === req.usuario) return res.json({ ok: true, usuario: nuevoNombre });
  if (!puedeContinuar(limitesCambioNombre, String(req.usuarioId), 5, 60 * 60 * 1000)) {
    return res.status(429).json({ error: 'Has cambiado de nombre demasiadas veces. Prueba dentro de una hora.' });
  }

  try {
    await renombrarUsuario(req.usuarioId, nuevoNombre);
  } catch (errorBase) {
    if (errorBase.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Ese nombre de usuario ya está siendo usado por otra persona.' });
    }
    throw errorBase;
  }
  res.json({ ok: true, usuario: nuevoNombre });
});

router.patch('/api/usuarios/password', requerirInicioSesion, async (req, res) => {
  const contrasenaActual = String(req.body.contrasenaActual || '');
  const contrasenaNueva = String(req.body.contrasenaNueva || '');
  if (contrasenaNueva.length < 8 || contrasenaNueva.length > 200) {
    return res.status(400).json({ error: 'La nueva contraseña debe tener entre 8 y 200 caracteres.' });
  }

  const [filas] = await pool.execute('SELECT password_hash FROM usuarios WHERE id = ?', [req.usuarioId]);
  if (!filas[0] || !(await bcrypt.compare(contrasenaActual, filas[0].password_hash))) {
    return res.status(400).json({ error: 'La contraseña actual no es correcta.' });
  }
  const hash = await bcrypt.hash(contrasenaNueva, 12);
  await pool.execute('UPDATE usuarios SET password_hash = ? WHERE id = ?', [hash, req.usuarioId]);
  // Se cierran todas las sesiones de la cuenta, también las de otros dispositivos.
  await pool.execute('DELETE FROM sesiones WHERE usuario_id = ?', [req.usuarioId]);
  borrarCookieSesion(res);
  res.json({ ok: true, mensaje: 'Contraseña actualizada. Inicia sesión de nuevo.' });
});

// ---- Recuperación con enlace de un solo uso (lo genera un administrador) ----
const mensajeEnlaceInvalido = 'El enlace no es válido o ha caducado. Pide uno nuevo a un administrador.';
const tokenRecuperacionValido = token => /^[A-Za-z0-9_-]{43}$/.test(token);

router.post('/api/recuperacion/comprobar', limitarRecuperacion, async (req, res) => {
  const token = String(req.body.token || '');
  if (!tokenRecuperacionValido(token)) return res.status(404).json({ error: mensajeEnlaceInvalido });
  const [filas] = await pool.execute(
    `SELECT u.nombre_usuario, r.expira_en
     FROM recuperaciones_contrasena r
     INNER JOIN usuarios u ON u.id = r.usuario_id
     WHERE r.token_hash = ? AND r.expira_en > NOW()`,
    [hashToken(token)]
  );
  if (!filas[0]) return res.status(404).json({ error: mensajeEnlaceInvalido });
  res.json({ usuario: filas[0].nombre_usuario, expiraEn: filas[0].expira_en });
});

router.post('/api/recuperacion', limitarRecuperacion, async (req, res) => {
  const token = String(req.body.token || '');
  const contrasena = String(req.body.contrasena || '');
  if (!tokenRecuperacionValido(token)) return res.status(404).json({ error: mensajeEnlaceInvalido });
  if (contrasena.length < 8 || contrasena.length > 200) {
    return res.status(400).json({ error: 'La contraseña debe tener entre 8 y 200 caracteres.' });
  }
  const hash = await bcrypt.hash(contrasena, 12);

  const usado = await conTransaccion(async conexion => {
    // FOR UPDATE: si se envía el mismo enlace dos veces a la vez, solo una petición lo usa.
    const [filas] = await conexion.execute(
      'SELECT usuario_id FROM recuperaciones_contrasena WHERE token_hash = ? AND expira_en > NOW() FOR UPDATE',
      [hashToken(token)]
    );
    if (!filas[0]) return false;
    const usuarioId = filas[0].usuario_id;
    await conexion.execute('UPDATE usuarios SET password_hash = ? WHERE id = ?', [hash, usuarioId]);
    await conexion.execute('DELETE FROM recuperaciones_contrasena WHERE usuario_id = ?', [usuarioId]);
    await conexion.execute('DELETE FROM sesiones WHERE usuario_id = ?', [usuarioId]);
    return true;
  });
  if (!usado) return res.status(404).json({ error: mensajeEnlaceInvalido });
  res.json({ ok: true, mensaje: 'Contraseña cambiada. Ya puedes iniciar sesión.' });
});

module.exports = router;
