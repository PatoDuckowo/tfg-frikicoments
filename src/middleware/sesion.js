// Sesiones: la cookie lleva un token aleatorio y en la base solo se guarda su hash SHA-256.
const crypto = require('crypto');
const config = require('../config');
const { pool } = require('../db/pool');
const { esNombreSuperAdministrador, idPositivo } = require('../utilidades/validacion');

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function obtenerTokenSesion(req) {
  const cookies = req.headers.cookie || '';
  const cookie = cookies.split(/;\s*/).find(valor => valor.startsWith(`${config.sesion.cookie}=`));
  return cookie ? cookie.slice(config.sesion.cookie.length + 1) : null;
}

function ponerCookieSesion(res, token) {
  const segura = config.produccion ? '; Secure' : '';
  const maxAge = Math.floor(config.sesion.duracionMs / 1000);
  res.setHeader('Set-Cookie', `${config.sesion.cookie}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${segura}`);
}

function borrarCookieSesion(res) {
  res.setHeader('Set-Cookie', `${config.sesion.cookie}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
}

// Carga req.usuarioId, req.usuario y req.rol, o corta con 401 (API) / redirección (páginas).
async function requerirInicioSesion(req, res, next) {
  const token = obtenerTokenSesion(req);
  let sesion = null;
  if (token) {
    const [filas] = await pool.execute(
      `SELECT s.usuario_id AS id, u.nombre_usuario AS usuario, u.rol
       FROM sesiones s
       INNER JOIN usuarios u ON u.id = s.usuario_id
       WHERE s.token_hash = ? AND s.expira_en > NOW()`,
      [hashToken(token)]
    );
    sesion = filas[0] || null;
  }

  if (!sesion) {
    if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Debes iniciar sesión.' });
    return res.redirect('/');
  }

  req.usuarioId = sesion.id;
  req.usuario = sesion.usuario;
  req.rol = sesion.rol || 'usuario';
  next();
}

function requerirAdministrador(req, res, next) {
  if (req.rol !== 'admin') {
    return res.status(403).json({ error: 'Solo los administradores pueden hacer esto.' });
  }
  next();
}

// Un administrador solo puede gestionar cuentas de usuario normales (y la suya propia).
// Las cuentas de administrador, incluida la del superadministrador, solo las gestiona el superadministrador.
async function requerirCuentaGestionable(req, res, next) {
  const id = idPositivo(req.params.id);
  const [filas] = id
    ? await pool.execute('SELECT id, nombre_usuario, rol FROM usuarios WHERE id = ?', [id])
    : [[]];
  const cuenta = filas[0];
  if (!cuenta) return res.status(404).json({ error: 'No existe ese usuario.' });

  const solicitanteEsSuperAdministrador = esNombreSuperAdministrador(req.usuario);
  const esCuentaPropia = cuenta.id === req.usuarioId;
  const cuentaProtegida = esNombreSuperAdministrador(cuenta.nombre_usuario) || cuenta.rol === 'admin';
  if (cuentaProtegida && !esCuentaPropia && !solicitanteEsSuperAdministrador) {
    return res.status(403).json({ error: 'Solo el superadministrador puede modificar cuentas de administrador.' });
  }
  req.cuentaObjetivo = cuenta;
  next();
}

// Carga en req.otroUsuario a la persona indicada en :id (que no puede ser uno mismo).
async function requerirOtroUsuario(req, res, next) {
  const id = idPositivo(req.params.id);
  if (!id) return res.status(404).json({ error: 'No existe ese usuario.' });
  if (id === req.usuarioId) return res.status(400).json({ error: 'No puedes hacer esto contigo mismo.' });
  const [filas] = await pool.execute('SELECT id, nombre_usuario FROM usuarios WHERE id = ?', [id]);
  if (!filas[0]) return res.status(404).json({ error: 'No existe ese usuario.' });
  req.otroUsuario = { id: filas[0].id, usuario: filas[0].nombre_usuario };
  next();
}

module.exports = {
  hashToken,
  obtenerTokenSesion,
  ponerCookieSesion,
  borrarCookieSesion,
  requerirInicioSesion,
  requerirAdministrador,
  requerirCuentaGestionable,
  requerirOtroUsuario
};
