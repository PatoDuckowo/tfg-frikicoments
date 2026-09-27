require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const { pool } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const superAdministrador = (process.env.LOGIN_USERNAME || '').trim();
const cuotaArchivosBytes = 500 * 1024 * 1024;
const directorioArchivos = path.join(__dirname, 'storage', 'usuarios');
const maximoArchivosPorUsuario = 1000;
const limitesLogin = new Map();
const limitesSubida = new Map();

fs.mkdirSync(directorioArchivos, { recursive: true });

const subidaArchivo = multer({
  storage: multer.diskStorage({
    destination: directorioArchivos,
    filename: (req, file, callback) => {
      callback(null, `${Date.now()}-${crypto.randomBytes(16).toString('hex')}`);
    }
  }),
  limits: { fileSize: cuotaArchivosBytes }
});

app.use(express.json());

const duracionSesionMs = 8 * 60 * 60 * 1000;

function obtenerTokenSesion(req) {
  const cookies = req.headers.cookie || '';
  const cookieSesion = cookies.split('; ').find(cookie => cookie.startsWith('frikicoments_session='));
  return cookieSesion ? cookieSesion.split('=')[1] : null;
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function puedeContinuar(limites, clave, maximo, ventanaMs) {
  const ahora = Date.now();
  const actual = limites.get(clave);
  if (!actual || ahora - actual.inicio >= ventanaMs) {
    limites.set(clave, { inicio: ahora, cantidad: 1 });
    return true;
  }
  if (actual.cantidad >= maximo) return false;
  actual.cantidad += 1;
  return true;
}

async function requerirInicioSesion(req, res, next) {
  const token = obtenerTokenSesion(req);
  let sesion = null;

  try {
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
  } catch (error) {
    console.error('Error al comprobar la sesión:', error.code || error.message);
    return res.status(500).json({ error: 'No se pudo comprobar la sesión.' });
  }

  if (!sesion) {
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ error: 'Debes iniciar sesión.' });
    }
    return res.redirect('/');
  }

  req.usuario = sesion.usuario;
  req.rol = sesion.rol || 'usuario';
  req.usuarioId = sesion.id;
  next();
}

function requerirSuperAdministrador(req, res, next) {
  if (req.usuario !== superAdministrador) {
    return res.status(403).json({ error: 'No tienes permisos de superadministrador.' });
  }
  next();
}

app.post('/api/usuarios/login', async (req, res) => {
  const ip = req.ip || req.socket.remoteAddress || 'desconocida';
  if (!puedeContinuar(limitesLogin, ip, 10, 15 * 60 * 1000)) {
    return res.status(429).json({ error: 'Demasiados intentos. Espera unos minutos.' });
  }
  const usuario = String(req.body.usuario || '').trim();
  const contrasena = String(req.body.contrasena || '');

  try {
    const [filas] = await pool.execute(
      'SELECT id, nombre_usuario, password_hash, rol FROM usuarios WHERE nombre_usuario = ?',
      [usuario]
    );
    const cuenta = filas[0];
    const contrasenaValida = cuenta && await bcrypt.compare(contrasena, cuenta.password_hash);

    if (!contrasenaValida) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    await pool.execute('DELETE FROM sesiones WHERE expira_en <= NOW()');
    await pool.execute(
      'INSERT INTO sesiones (token_hash, usuario_id, expira_en) VALUES (?, ?, ?)',
      [hashToken(token), cuenta.id, new Date(Date.now() + duracionSesionMs)]
    );
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    res.setHeader('Set-Cookie', `frikicoments_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800${secure}`);
    res.json({ ok: true });
  } catch (error) {
    console.error('Error al iniciar sesión:', error.code || error.message);
    res.status(500).json({ error: 'No se pudo iniciar sesión. Comprueba la conexión con la base de datos.' });
  }
});

app.get('/api/usuarios/me', requerirInicioSesion, (req, res) => {
  res.json({
    id: req.usuarioId,
    usuario: req.usuario,
    rol: req.rol,
    esSuperAdministrador: req.usuario === superAdministrador
  });
});

app.get('/api/superadmin/usuarios', requerirInicioSesion, requerirSuperAdministrador, async (req, res) => {
  try {
    const [usuarios] = await pool.execute(
      'SELECT id, nombre_usuario, rol, creado_en FROM usuarios ORDER BY nombre_usuario'
    );
    res.json(usuarios);
  } catch (error) {
    console.error('Error al listar usuarios:', error.code || error.message);
    res.status(500).json({ error: 'No se pudieron cargar los usuarios.' });
  }
});

app.patch('/api/superadmin/usuarios/:id/contrasena', requerirInicioSesion, requerirSuperAdministrador, async (req, res) => {
  const contrasena = String(req.body.contrasena || '');

  if (contrasena.length < 8) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres.' });
  }

  try {
    const hash = await bcrypt.hash(contrasena, 12);
    const [resultado] = await pool.execute(
      'UPDATE usuarios SET password_hash = ? WHERE id = ?',
      [hash, req.params.id]
    );

    if (resultado.affectedRows === 0) {
      return res.status(404).json({ error: 'No existe ese usuario.' });
    }
    res.json({ ok: true });
  } catch (error) {
    console.error('Error al cambiar contraseña:', error.code || error.message);
    res.status(500).json({ error: 'No se pudo cambiar la contraseña.' });
  }
});

app.patch('/api/usuarios/password', requerirInicioSesion, async (req, res) => {
  const contrasenaActual = String(req.body.contrasenaActual || '');
  const contrasenaNueva = String(req.body.contrasenaNueva || '');
  const token = obtenerTokenSesion(req);

  if (contrasenaNueva.length < 8) {
    return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 8 caracteres.' });
  }

  try {
    const [filas] = await pool.execute(
      'SELECT password_hash FROM usuarios WHERE id = ?',
      [req.usuarioId]
    );
    const cuenta = filas[0];

    if (!cuenta || !(await bcrypt.compare(contrasenaActual, cuenta.password_hash))) {
      return res.status(400).json({ error: 'La contraseña actual no es correcta.' });
    }

    const hash = await bcrypt.hash(contrasenaNueva, 12);
    await pool.execute(
      'UPDATE usuarios SET password_hash = ? WHERE id = ?',
      [hash, req.usuarioId]
    );
    if (token) {
      await pool.execute('DELETE FROM sesiones WHERE token_hash = ?', [hashToken(token)]);
    }
    res.setHeader('Set-Cookie', 'frikicoments_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
    res.json({ ok: true, mensaje: 'Contraseña actualizada. Inicia sesión de nuevo.' });
  } catch (error) {
    console.error('Error al cambiar la contraseña propia:', error.code || error.message);
    res.status(500).json({ error: 'No se pudo cambiar la contraseña.' });
  }
});

// No hay registro público: una cuenta existente debe iniciar sesión para invitar a otra.
app.post('/api/usuarios/registro', requerirInicioSesion, async (req, res) => {
  const usuario = String(req.body.usuario || '').trim();
  const contrasena = String(req.body.contrasena || '');

  if (usuario.length < 3 || contrasena.length < 8) {
    return res.status(400).json({ error: 'El usuario debe tener 3 caracteres y la contraseña al menos 8.' });
  }

  try {
    const hash = await bcrypt.hash(contrasena, 12);
    await pool.execute(
      "INSERT INTO usuarios (nombre_usuario, password_hash, rol) VALUES (?, ?, 'usuario')",
      [usuario, hash]
    );
    res.status(201).json({ ok: true });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Ese nombre de usuario ya existe.' });
    }
    console.error('Error al crear usuario:', error.code || error.message);
    res.status(500).json({ error: 'No se pudo guardar el usuario en MySQL.' });
  }
});

app.get('/api/archivos', requerirInicioSesion, async (req, res) => {
  try {
    const [archivos] = await pool.execute(
      `SELECT id, nombre_original, mime_type, tamano_bytes, creado_en
       FROM archivos_usuario WHERE usuario_id = ? ORDER BY nombre_original`,
      [req.usuarioId]
    );
    const usados = archivos.reduce((total, archivo) => total + Number(archivo.tamano_bytes), 0);
    res.json({ cuotaBytes: cuotaArchivosBytes, usadosBytes: usados, archivos });
  } catch (error) {
    console.error('Error al listar archivos:', error.code || error.message);
    res.status(500).json({ error: 'No se pudieron cargar tus archivos.' });
  }
});

app.post('/api/archivos', requerirInicioSesion, (req, res, next) => {
  if (!puedeContinuar(limitesSubida, String(req.usuarioId), 30, 60 * 60 * 1000)) {
    return res.status(429).json({ error: 'Has alcanzado el límite temporal de subidas. Inténtalo más tarde.' });
  }
  subidaArchivo.single('archivo')(req, res, error => {
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'El archivo supera la cuota máxima de 500 MB.' });
    }
    if (error) return next(error);
    next();
  });
}, async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Selecciona un archivo.' });

  try {
    const [filas] = await pool.execute(
      'SELECT COALESCE(SUM(tamano_bytes), 0) AS usados FROM archivos_usuario WHERE usuario_id = ?',
      [req.usuarioId]
    );
    const usados = Number(filas[0].usados);
    const [conteo] = await pool.execute(
      'SELECT COUNT(*) AS total FROM archivos_usuario WHERE usuario_id = ?',
      [req.usuarioId]
    );
    if (Number(conteo[0].total) >= maximoArchivosPorUsuario) {
      await fs.promises.unlink(req.file.path).catch(() => {});
      return res.status(413).json({ error: `Has alcanzado el máximo de ${maximoArchivosPorUsuario} archivos.` });
    }
    if (usados + req.file.size > cuotaArchivosBytes) {
      await fs.promises.unlink(req.file.path).catch(() => {});
      return res.status(413).json({ error: 'Has superado tu cuota de 500 MB.' });
    }

    const [resultado] = await pool.execute(
      `INSERT INTO archivos_usuario
       (usuario_id, nombre_original, nombre_disco, mime_type, tamano_bytes)
       VALUES (?, ?, ?, ?, ?)`,
      [req.usuarioId, req.file.originalname.slice(0, 255), req.file.filename, req.file.mimetype || 'application/octet-stream', req.file.size]
    );
    res.status(201).json({ ok: true, id: resultado.insertId });
  } catch (error) {
    await fs.promises.unlink(req.file.path).catch(() => {});
    console.error('Error al guardar archivo:', error.code || error.message);
    res.status(500).json({ error: 'No se pudo guardar el archivo.' });
  }
});

app.get('/api/archivos/:id/descargar', requerirInicioSesion, async (req, res) => {
  try {
    const [filas] = await pool.execute(
      'SELECT nombre_original, nombre_disco FROM archivos_usuario WHERE id = ? AND usuario_id = ?',
      [req.params.id, req.usuarioId]
    );
    const archivo = filas[0];
    if (!archivo) return res.status(404).json({ error: 'Archivo no encontrado.' });
    res.download(path.join(directorioArchivos, archivo.nombre_disco), archivo.nombre_original);
  } catch (error) {
    console.error('Error al descargar archivo:', error.code || error.message);
    res.status(500).json({ error: 'No se pudo descargar el archivo.' });
  }
});

app.delete('/api/archivos/:id', requerirInicioSesion, async (req, res) => {
  try {
    const [filas] = await pool.execute(
      'SELECT nombre_disco FROM archivos_usuario WHERE id = ? AND usuario_id = ?',
      [req.params.id, req.usuarioId]
    );
    const archivo = filas[0];
    if (!archivo) return res.status(404).json({ error: 'Archivo no encontrado.' });
    await fs.promises.unlink(path.join(directorioArchivos, archivo.nombre_disco)).catch(() => {});
    await pool.execute('DELETE FROM archivos_usuario WHERE id = ? AND usuario_id = ?', [req.params.id, req.usuarioId]);
    res.json({ ok: true });
  } catch (error) {
    console.error('Error al borrar archivo:', error.code || error.message);
    res.status(500).json({ error: 'No se pudo borrar el archivo.' });
  }
});

app.get('/api/comentarios', requerirInicioSesion, async (req, res) => {
  try {
    const [comentarios] = await pool.execute(
      `SELECT id, nombre_usuario AS usuario, juego, contenido, creado_en
       FROM comentarios ORDER BY creado_en DESC LIMIT 100`
    );
    res.json(comentarios);
  } catch (error) {
    console.error('Error al consultar comentarios:', error.code || error.message);
    res.status(500).json({ error: 'No se pudieron cargar los comentarios.' });
  }
});

app.post('/api/comentarios', requerirInicioSesion, async (req, res) => {
  const juego = String(req.body.juego || '').trim();
  const contenido = String(req.body.contenido || '').trim();

  if (!juego || juego.length > 160 || !contenido || contenido.length > 5000) {
    return res.status(400).json({ error: 'Indica un juego y un comentario de hasta 5000 caracteres.' });
  }

  try {
    const [resultado] = await pool.execute(
      'INSERT INTO comentarios (usuario_id, nombre_usuario, juego, contenido) VALUES (?, ?, ?, ?)',
      [req.usuarioId, req.usuario, juego, contenido]
    );
    res.status(201).json({
      id: resultado.insertId,
      usuario: req.usuario,
      juego,
      contenido
    });
  } catch (error) {
    console.error('Error al guardar comentario:', error.code || error.message);
    res.status(500).json({ error: 'No se pudo guardar el comentario en MySQL.' });
  }
});

app.post('/api/usuarios/logout', async (req, res) => {
  const token = obtenerTokenSesion(req);
  if (token) {
    await pool.execute('DELETE FROM sesiones WHERE token_hash = ?', [hashToken(token)]);
  }
  res.setHeader('Set-Cookie', 'frikicoments_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
  res.redirect(303, '/usuarios/iniciar-sesion.html');
});

// 1. Ruta principal
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'inicio.html'), {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, private'
    }
  });
});

// 2. Ruta de resultados
app.get('/resultados', requerirInicioSesion, (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.sendFile(path.join(__dirname, 'public', 'resultados.html'));
});

app.get('/resultados.html', requerirInicioSesion, (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.sendFile(path.join(__dirname, 'public', 'resultados.html'));
});

// La página de cuenta no se sirve si no hay una sesión válida.
app.get('/usuarios/mi-cuenta.html', requerirInicioSesion, (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.sendFile(path.join(__dirname, 'public', 'usuarios', 'mi-cuenta.html'));
});

app.get('/usuarios/superadmin.html', requerirInicioSesion, requerirSuperAdministrador, (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.sendFile(path.join(__dirname, 'public', 'usuarios', 'superadmin.html'));
});

app.get(['/usuarios/crear-usuario.html', '/usuarios/invitar-usuario.html'], requerirInicioSesion, (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.sendFile(path.join(__dirname, 'public', 'usuarios', 'crear-usuario.html'));
});

app.get('/juego.html', requerirInicioSesion, (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.sendFile(path.join(__dirname, 'public', 'juego.html'));
});

app.get('/usuarios/archivos.html', requerirInicioSesion, (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.sendFile(path.join(__dirname, 'public', 'usuarios', 'archivos.html'));
});

// 3. Servir archivos estáticos
app.use(express.static(path.join(__dirname, 'public'), {
  index: false,
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  }
}));

// 4. Comprobación MySQL
app.get('/api/health', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT 1 AS ok');
    res.json({ ok: true, message: 'Conectado a MySQL', result: rows[0] });
  } catch (error) {
    res.status(500).json({ ok: false, message: 'No se pudo conectar a MySQL', error: error.message });
  }
});

// Variables para reutilizar el token de Twitch
let igdbToken = null;
let igdbTokenExpiresAt = 0;

async function getTwitchToken() {
  const clientId = (process.env.IGDB_CLIENT_ID || '').trim();
  const clientSecret = (process.env.IGDB_CLIENT_SECRET || '').trim();

  if (!clientId || !clientSecret) {
    throw new Error('Faltan IGDB_CLIENT_ID o IGDB_CLIENT_SECRET en .env');
  }

  // Reutilizar token si sigue vigente
  if (igdbToken && Date.now() < igdbTokenExpiresAt) {
    return igdbToken;
  }

  const res = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`, {
    method: 'POST'
  });

  if (!res.ok) {
    const errorData = await res.text();
    throw new Error(`Fallo autenticando en Twitch: ${errorData}`);
  }

  const data = await res.json();
  igdbToken = data.access_token;
  igdbTokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000;
  return igdbToken;
}

// 5. Endpoint de búsqueda en IGDB con paginación
app.get('/api/juegos/buscar', requerirInicioSesion, async (req, res) => {
  const query = String(req.query.q || '').trim();
  const terminoBusqueda = query
    .replace(/[^\p{L}\p{N}\s._:-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
  const page = Math.max(1, Math.min(100, Number.parseInt(req.query.page, 10) || 1));
  const limit = 12;
  const offset = (page - 1) * limit;

  if (!terminoBusqueda) {
    return res.status(400).json({ error: 'Falta término de búsqueda' });
  }

  try {
    const token = await getTwitchToken();
    const clientId = process.env.IGDB_CLIENT_ID.trim();

    const igdbQuery = `
      search "${terminoBusqueda}";
      fields name, first_release_date, rating, cover.image_id, summary;
      limit ${limit};
      offset ${offset};
    `;

    const igdbRes = await fetch('https://api.igdb.com/v4/games', {
      method: 'POST',
      headers: {
        'Client-ID': clientId,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'text/plain'
      },
      body: igdbQuery
    });

    if (!igdbRes.ok) {
      const errText = await igdbRes.text();
      return res.status(igdbRes.status).json({ error: 'IGDB error', detalles: errText });
    }

    const games = await igdbRes.json();

    const resultados = games.map(game => ({
      id: game.id,
      name: game.name,
      released: game.first_release_date
        ? new Date(game.first_release_date * 1000).getFullYear().toString()
        : 'N/D',
      rating: game.rating ? (game.rating / 20).toFixed(1) : 'N/D',
      summary: game.summary || null,
      background_image: game.cover && game.cover.image_id
        ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${game.cover.image_id}.jpg`
        : null
    }));

    res.json(resultados);
  } catch (error) {
    res.status(500).json({ error: 'Error al consultar IGDB', mensaje: error.message });
  }
});

async function consultarJuegoIGDB(id) {
  const token = await getTwitchToken();
  const clientId = process.env.IGDB_CLIENT_ID.trim();
  const igdbRes = await fetch('https://api.igdb.com/v4/games', {
    method: 'POST',
    headers: {
      'Client-ID': clientId,
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'text/plain'
    },
    body: `fields name, first_release_date, rating, cover.image_id, summary; where id = ${id};`
  });

  if (!igdbRes.ok) throw new Error(`IGDB respondió con ${igdbRes.status}.`);
  const juegos = await igdbRes.json();
  const juego = juegos[0];
  if (!juego) return null;

  return {
    id: juego.id,
    name: juego.name,
    released: juego.first_release_date
      ? new Date(juego.first_release_date * 1000).getFullYear().toString()
      : 'N/D',
    rating: juego.rating ? (juego.rating / 20).toFixed(1) : 'N/D',
    summary: juego.summary || null,
    background_image: juego.cover && juego.cover.image_id
      ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${juego.cover.image_id}.jpg`
      : null
  };
}

app.get('/api/juegos/:id', requerirInicioSesion, async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ error: 'Identificador de juego no válido.' });
  }

  try {
    const juego = await consultarJuegoIGDB(id);
    if (!juego) return res.status(404).json({ error: 'Juego no encontrado.' });
    res.json(juego);
  } catch (error) {
    console.error('Error al consultar el detalle del juego:', error.message);
    res.status(500).json({ error: 'No se pudo cargar el juego.' });
  }
});

app.get('/api/juegos/:id/estado', requerirInicioSesion, async (req, res) => {
  try {
    const [filas] = await pool.execute(
      'SELECT estado FROM juegos_usuario WHERE usuario_id = ? AND juego_id = ?',
      [req.usuarioId, req.params.id]
    );
    res.json({ estado: filas[0]?.estado || null });
  } catch (error) {
    console.error('Error al consultar el estado del juego:', error.code || error.message);
    res.status(500).json({ error: 'No se pudo consultar tu estado del juego.' });
  }
});

app.put('/api/juegos/:id/estado', requerirInicioSesion, async (req, res) => {
  const estadosPermitidos = ['jugado', 'pendiente', 'abandonado'];
  const estado = String(req.body.estado || '');
  if (estado === '') {
    try {
      await pool.execute(
        'DELETE FROM juegos_usuario WHERE usuario_id = ? AND juego_id = ?',
        [req.usuarioId, req.params.id]
      );
      return res.json({ ok: true, estado: null });
    } catch (error) {
      console.error('Error al borrar el estado del juego:', error.code || error.message);
      return res.status(500).json({ error: 'No se pudo borrar el estado del juego.' });
    }
  }
  if (!estadosPermitidos.includes(estado)) {
    return res.status(400).json({ error: 'Estado no válido.' });
  }

  try {
    await pool.execute(
      `INSERT INTO juegos_usuario (usuario_id, juego_id, estado)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE estado = VALUES(estado)`,
      [req.usuarioId, req.params.id, estado]
    );
    res.json({ ok: true, estado });
  } catch (error) {
    console.error('Error al guardar el estado del juego:', error.code || error.message);
    res.status(500).json({ error: 'No se pudo guardar el estado del juego.' });
  }
});

app.get('/api/juegos/:id/comentarios', requerirInicioSesion, async (req, res) => {
  try {
    const [comentarios] = await pool.execute(
      `SELECT id, nombre_usuario AS usuario, contenido, creado_en
       FROM comentarios_juegos WHERE juego_id = ? ORDER BY creado_en DESC`,
      [req.params.id]
    );
    res.json(comentarios);
  } catch (error) {
    console.error('Error al consultar comentarios del juego:', error.code || error.message);
    res.status(500).json({ error: 'No se pudieron cargar los comentarios.' });
  }
});

app.post('/api/juegos/:id/comentarios', requerirInicioSesion, async (req, res) => {
  const contenido = String(req.body.contenido || '').trim();
  if (!contenido || contenido.length > 5000) {
    return res.status(400).json({ error: 'Escribe un comentario de hasta 5000 caracteres.' });
  }

  try {
    const [resultado] = await pool.execute(
      `INSERT INTO comentarios_juegos (usuario_id, nombre_usuario, juego_id, contenido)
       VALUES (?, ?, ?, ?)`,
      [req.usuarioId, req.usuario, req.params.id, contenido]
    );
    res.status(201).json({ id: resultado.insertId, usuario: req.usuario, contenido });
  } catch (error) {
    console.error('Error al guardar comentario del juego:', error.code || error.message);
    res.status(500).json({ error: 'No se pudo guardar el comentario.' });
  }
});

// Página para rutas web inexistentes; las rutas API responden con JSON.
app.use((req, res) => {
  if (req.path === '/api' || req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Endpoint no encontrado' });
  }

  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

async function iniciarServidor() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sesiones (
      token_hash CHAR(64) NOT NULL,
      usuario_id INT UNSIGNED NOT NULL,
      expira_en DATETIME NOT NULL,
      PRIMARY KEY (token_hash),
      KEY ix_sesiones_expira (expira_en),
      CONSTRAINT fk_sesiones_usuario
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
        ON UPDATE CASCADE ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS juegos_usuario (
      usuario_id INT UNSIGNED NOT NULL,
      juego_id INT UNSIGNED NOT NULL,
      estado ENUM('jugado', 'pendiente', 'abandonado') NOT NULL,
      actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (usuario_id, juego_id),
      CONSTRAINT fk_juegos_usuario_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
        ON UPDATE CASCADE ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS comentarios_juegos (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      usuario_id INT UNSIGNED NOT NULL,
      nombre_usuario VARCHAR(80) NOT NULL,
      juego_id INT UNSIGNED NOT NULL,
      contenido TEXT NOT NULL,
      creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY ix_comentarios_juego (juego_id, creado_en),
      CONSTRAINT fk_comentarios_juegos_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
        ON UPDATE CASCADE ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS archivos_usuario (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      usuario_id INT UNSIGNED NOT NULL,
      nombre_original VARCHAR(255) NOT NULL,
      nombre_disco VARCHAR(100) NOT NULL,
      mime_type VARCHAR(160) NOT NULL,
      tamano_bytes BIGINT UNSIGNED NOT NULL,
      creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_archivos_nombre_disco (nombre_disco),
      KEY ix_archivos_usuario (usuario_id, nombre_original),
      CONSTRAINT fk_archivos_usuario_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
        ON UPDATE CASCADE ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
  });
}

iniciarServidor().catch(error => {
  console.error('No se pudo iniciar el servidor:', error.code || error.message);
  process.exitCode = 1;
});