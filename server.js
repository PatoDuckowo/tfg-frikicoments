require('dotenv').config();
const express = require('express');
const path = require('path');
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
    return res.redirect('/usuarios/iniciar-sesion.html');
  }

  req.usuario = sesion.usuario;
  next();
}

app.post('/api/usuarios/login', (req, res) => {
  const usuario = String(req.body.usuario || '').trim();
  const contrasena = String(req.body.contrasena || '');
  const usuarioConfigurado = process.env.LOGIN_USERNAME;
  const contrasenaConfigurada = process.env.LOGIN_PASSWORD;

  if (!usuarioConfigurado || !contrasenaConfigurada) {
    return res.status(503).json({ error: 'Falta configurar LOGIN_USERNAME y LOGIN_PASSWORD en .env.' });
  }

  if (usuario !== usuarioConfigurado || contrasena !== contrasenaConfigurada) {
    return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
  }

  const token = crypto.randomBytes(32).toString('hex');
  sesiones.set(token, { usuario, expiraEn: Date.now() + duracionSesionMs });
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `frikicoments_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800${secure}`);
  res.json({ ok: true });
});

app.get('/api/usuarios/me', requerirInicioSesion, (req, res) => {
  res.json({ usuario: req.usuario });
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
app.get('/resultados', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.sendFile(path.join(__dirname, 'public', 'resultados.html'));
});

// La página de cuenta no se sirve si no hay una sesión válida.
app.get('/usuarios/mi-cuenta.html', requerirInicioSesion, (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.sendFile(path.join(__dirname, 'public', 'usuarios', 'mi-cuenta.html'));
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
app.get('/api/juegos/buscar', async (req, res) => {
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

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});