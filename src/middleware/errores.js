const path = require('path');
const config = require('../config');

const esAPI = req => req.path === '/api' || req.path.startsWith('/api/');

// Rutas inexistentes: JSON para la API, página 404 para el resto.
function noEncontrado(req, res) {
  if (esAPI(req)) return res.status(404).json({ error: 'Endpoint no encontrado' });
  res.status(404).sendFile(path.join(config.directorioPublico, '404.html'));
}

// Cualquier error no previsto (también los de rutas async, que Express 5 recoge solo).
// Se registra en el log sin datos del usuario y se responde con un mensaje genérico.
// eslint-disable-next-line no-unused-vars
function manejarErrores(error, req, res, next) {
  if (res.headersSent) return res.end();
  if (error.type === 'entity.parse.failed') return res.status(400).json({ error: 'El cuerpo de la petición no es JSON válido.' });
  if (error.type === 'entity.too.large') return res.status(413).json({ error: 'La petición es demasiado grande.' });

  console.error(`[ERROR] ${req.method} ${req.path}:`, error.code || error.message);
  if (esAPI(req)) return res.status(500).json({ error: 'Ha fallado algo en el servidor. Inténtalo de nuevo.' });
  res.status(500).type('text').send('Ha fallado algo en el servidor. Inténtalo de nuevo.');
}

module.exports = { noEncontrado, manejarErrores };
