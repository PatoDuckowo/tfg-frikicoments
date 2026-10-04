// Páginas HTML. Las privadas solo se sirven con sesión; el resto sale de public/ como archivo estático.
const path = require('path');
const express = require('express');
const config = require('../config');
const { pool } = require('../db/pool');
const { requerirInicioSesion, requerirAdministrador } = require('../middleware/sesion');

const router = express.Router();
const sinCache = { 'Cache-Control': 'no-store, no-cache, must-revalidate, private' };
const pagina = archivo => (req, res) => res.sendFile(path.join(config.directorioPublico, archivo), { headers: sinCache });

// La portada es pública: muestra el login o el contenido según haya sesión.
router.get('/', pagina('inicio.html'));

const paginasConSesion = {
  '/resultados': 'resultados.html',
  '/resultados.html': 'resultados.html',
  '/juego.html': 'juego.html',
  '/usuarios/mi-cuenta.html': 'usuarios/mi-cuenta.html',
  '/usuarios/archivos.html': 'usuarios/archivos.html',
  '/usuarios/biblioteca.html': 'usuarios/biblioteca.html',
  '/usuarios/perfil.html': 'usuarios/perfil.html',
  '/usuarios/mensajes.html': 'usuarios/mensajes.html'
};
for (const [ruta, archivo] of Object.entries(paginasConSesion)) {
  router.get(ruta, requerirInicioSesion, pagina(archivo));
}

const paginasDeAdministracion = {
  '/usuarios/superadmin.html': 'usuarios/superadmin.html',
  '/usuarios/crear-usuario.html': 'usuarios/crear-usuario.html',
  '/usuarios/invitar-usuario.html': 'usuarios/crear-usuario.html'
};
for (const [ruta, archivo] of Object.entries(paginasDeAdministracion)) {
  router.get(ruta, requerirInicioSesion, requerirAdministrador, pagina(archivo));
}

// HTML: nunca en caché. CSS, JS e imágenes: el navegador los guarda pero pregunta si han cambiado
// (ETag); si no, recibe un 304 vacío. Así no hace falta versionar los archivos a mano.
router.use(express.static(config.directorioPublico, {
  index: false,
  setHeaders: (res, ruta) => res.set(ruta.endsWith('.html') ? sinCache : { 'Cache-Control': 'no-cache' })
}));

// Comprobación de salud (la usa Docker): no devuelve detalles internos.
router.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  } catch (error) {
    console.error('[SALUD] MySQL no responde:', error.code || error.message);
    res.status(503).json({ ok: false });
  }
});

module.exports = router;
