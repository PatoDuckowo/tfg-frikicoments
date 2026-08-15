require('dotenv').config();
const express = require('express');
const path = require('path');
const { pool } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

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
  res.sendFile(path.join(__dirname, 'public', 'resultados.html'));
});

// 3. Servir archivos estáticos
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

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

// 5. Endpoint de búsqueda en IGDB
app.get('/api/juegos/buscar', async (req, res) => {
  const query = req.query.q;
  if (!query) return res.status(400).json({ error: 'Falta término de búsqueda' });

  try {
    const token = await getTwitchToken();
    const clientId = process.env.IGDB_CLIENT_ID.trim();

    // Consulta en formato APICalypse a IGDB
    const igdbQuery = `
      search "${query.replace(/"/g, '')}";
      fields name, first_release_date, rating, cover.image_id, summary;
      limit 12;
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

    // Normalizar formato de salida para el frontend
    const resultados = games.map(game => ({
      name: game.name,
      released: game.first_release_date ? new Date(game.first_release_date * 1000).getFullYear().toString() : 'N/D',
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