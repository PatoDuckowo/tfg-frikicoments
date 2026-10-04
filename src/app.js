// Construye la aplicación Express (sin arrancarla): la usan el servidor y los tests.
const express = require('express');
const { limitarGeneral } = require('./middleware/limites');
const { cabecerasSeguridad } = require('./middleware/seguridad');
const { noEncontrado, manejarErrores } = require('./middleware/errores');

function crearApp() {
  const app = express();
  app.disable('x-powered-by');
  // Detrás de Tailscale Funnel: la IP real del cliente llega en X-Forwarded-For.
  app.set('trust proxy', 1);

  app.use(cabecerasSeguridad);
  app.use(limitarGeneral);
  app.use(express.json({ limit: '100kb' }));
  // Express 5 deja req.body sin definir si la petición no trae JSON.
  app.use((req, res, next) => {
    req.body ??= {};
    next();
  });

  app.use(require('./rutas/cuentas'));
  app.use(require('./rutas/admin'));
  app.use(require('./rutas/archivos'));
  app.use(require('./rutas/juegos'));
  app.use(require('./rutas/comunidad'));
  app.use(require('./rutas/paginas'));

  app.use(noEncontrado);
  app.use(manejarErrores);
  return app;
}

module.exports = { crearApp };
