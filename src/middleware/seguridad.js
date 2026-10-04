// Cabeceras de seguridad para todas las respuestas.
const config = require('../config');

// Solo se cargan scripts, estilos e imágenes de la propia web, más la fuente de Google Fonts
// y las carátulas de IGDB. No se permite JavaScript en línea ni meter la web en un iframe.
const politicaContenido = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' https://fonts.googleapis.com",
  'font-src https://fonts.gstatic.com',
  "img-src 'self' data: https://images.igdb.com",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'"
].join('; ');

function cabecerasSeguridad(req, res, next) {
  res.setHeader('Content-Security-Policy', politicaContenido);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  // En producción la web solo se sirve por HTTPS (Tailscale Funnel).
  if (config.produccion) res.setHeader('Strict-Transport-Security', 'max-age=15552000');
  next();
}

module.exports = { cabecerasSeguridad };
