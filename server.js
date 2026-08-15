const express = require('express');
const path = require('path');
const { pool } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'inicio.html'));
});

app.get('/api/health', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT 1 AS ok');
    res.json({
      ok: true,
      message: 'Conectado a MySQL',
      result: rows[0],
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: 'No se pudo conectar a MySQL',
      error: error.message,
    });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
