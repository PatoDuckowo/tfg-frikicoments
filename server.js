require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { pool } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Sesiones sencillas en memoria: desaparecen al reiniciar el servidor.
const sesiones = new Map();
const duracionSesionMs = 8 * 60 * 60 * 1000;

function obtenerTokenSesion(req) {
  const cookies = req.headers.cookie || '';
  const cookieSesion = cookies.split('; ').find(cookie => cookie.startsWith('frikicoments_session='));
  return cookieSesion ? cookieSesion.split('=')[1] : null;
}

function requerirInicioSesion(req, res, next) {
  const token = obtenerTokenSesion(req);
  const sesion = token ? sesiones.get(token) : null;

  if (!sesion || sesion.expiraEn < Date.now()) {
    if (token) sesiones.delete(token);
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ error: 'Debes iniciar sesión.' });
    }
    return res.redirect('/');
  }

  req.usuario = sesion.usuario;
  req.rol = sesion.rol || 'usuario';
  next();
}

function requerirAdministrador(req, res, next) {
  requerirInicioSesion(req, res, () => {
    if (req.rol === 'admin') return next();

    if (req.path.startsWith('/api/')) {
      return res.status(403).json({ error: 'Acceso reservado al administrador.' });
    }

    res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
  });
}

function obtenerUsuariosAutorizados() {
  const archivoUsuarios = path.join(__dirname, 'usuarios.json');
  let usuarios = [];

  if (fs.existsSync(archivoUsuarios)) {
    usuarios = JSON.parse(fs.readFileSync(archivoUsuarios, 'utf8'));
    if (!Array.isArray(usuarios)) {
      throw new Error('usuarios.json debe contener una lista de usuarios.');
    }
  }

  // La cuenta fijada en .env siempre es administradora y puede gestionar la lista.
  if (process.env.LOGIN_USERNAME && process.env.LOGIN_PASSWORD) {
    const indiceAdmin = usuarios.findIndex(cuenta =>
      cuenta && typeof cuenta.usuario === 'string'
      && cuenta.usuario.trim().toLowerCase() === process.env.LOGIN_USERNAME.trim().toLowerCase()
    );
    const administrador = {
      usuario: process.env.LOGIN_USERNAME.trim(),
      contrasena: process.env.LOGIN_PASSWORD,
      rol: 'admin'
    };

    if (indiceAdmin >= 0) usuarios[indiceAdmin] = administrador;
    else usuarios.push(administrador);
  }

  return usuarios;
}

app.post('/api/usuarios/login', (req, res) => {
  const usuario = String(req.body.usuario || '').trim();
  const contrasena = String(req.body.contrasena || '');
  let usuariosAutorizados;

  try {
    usuariosAutorizados = obtenerUsuariosAutorizados();
  } catch (error) {
    console.error('No se pudo leer usuarios.json:', error.message);
    return res.status(500).json({ error: 'No se pudo leer la lista privada de usuarios.' });
  }

  if (usuariosAutorizados.length === 0) {
    return res.status(503).json({ error: 'No hay usuarios configurados en usuarios.json ni en .env.' });
  }

  const cuentaAutorizada = usuariosAutorizados.find(cuenta =>
    cuenta && typeof cuenta.usuario === 'string' && typeof cuenta.contrasena === 'string'
    && cuenta.usuario.trim().toLowerCase() === usuario.toLowerCase() && cuenta.contrasena === contrasena
  );

  if (!cuentaAutorizada) {
    return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
  }

  const esAdministrador = cuentaAutorizada.rol === 'admin';
  const token = crypto.randomBytes(32).toString('hex');
  sesiones.set(token, {
    usuario: cuentaAutorizada.usuario.trim(),
    rol: esAdministrador ? 'admin' : 'usuario',
    expiraEn: Date.now() + duracionSesionMs
  });
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `frikicoments_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800${secure}`);
  res.json({ ok: true });
});

app.get('/api/usuarios/me', requerirInicioSesion, (req, res) => {
  res.json({ usuario: req.usuario, rol: req.rol });
});

app.post('/api/usuarios/registro', requerirAdministrador, (req, res) => {
  const usuario = String(req.body.usuario || '').trim();
  const contrasena = String(req.body.contrasena || '');

  if (usuario.length < 3 || contrasena.length < 8) {
    return res.status(400).json({ error: 'El usuario debe tener 3 caracteres y la contraseña al menos 8.' });
  }

  try {
    const usuarios = obtenerUsuariosAutorizados();
    const yaExiste = usuarios.some(cuenta =>
      cuenta && typeof cuenta.usuario === 'string'
      && cuenta.usuario.trim().toLowerCase() === usuario.toLowerCase()
    );

    if (yaExiste) return res.status(409).json({ error: 'Ese nombre de usuario ya está autorizado.' });

    usuarios.push({ usuario, contrasena, rol: 'usuario' });
    fs.writeFileSync(
      path.join(__dirname, 'usuarios.json'),
      `${JSON.stringify(usuarios, null, 2)}\n`,
      { encoding: 'utf8', mode: 0o600 }
    );
    res.status(201).json({ ok: true });
  } catch (error) {
    console.error('No se pudo actualizar usuarios.json:', error.message);
    res.status(500).json({ error: 'No se pudo guardar el usuario en la lista privada.' });
  }
});

app.post('/api/usuarios/logout', (req, res) => {
  const token = obtenerTokenSesion(req);
  if (token) sesiones.delete(token);
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

app.get('/usuarios/crear-usuario.html', requerirAdministrador, (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.sendFile(path.join(__dirname, 'public', 'usuarios', 'crear-usuario.html'));
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
  const query = req.query.q;
  const page = parseInt(req.query.page) || 1;
  const limit = 12;
  const offset = (page - 1) * limit;

  if (!query) {
    return res.status(400).json({ error: 'Falta término de búsqueda' });
  }

  try {
    const token = await getTwitchToken();
    const clientId = process.env.IGDB_CLIENT_ID.trim();

    const igdbQuery = `
      search "${query.replace(/"/g, '')}";
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
      background_image: game.cover && game.cover.image_id
        ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${game.cover.image_id}.jpg`
        : null
    }));

    res.json(resultados);
  } catch (error) {
    res.status(500).json({ error: 'Error al consultar IGDB', mensaje: error.message });
  }
});

// Página para rutas web inexistentes; las rutas API responden con JSON.
app.use((req, res) => {
  if (req.path === '/api' || req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Endpoint no encontrado' });
  }

  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});