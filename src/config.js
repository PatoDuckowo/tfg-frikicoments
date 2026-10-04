// Configuración leída del entorno (.env) y constantes de la aplicación.
require('dotenv').config();
const path = require('path');

const MB = 1024 * 1024;
const GB = 1024 * MB;

module.exports = {
  produccion: process.env.NODE_ENV === 'production',
  puerto: Number(process.env.PORT) || 3000,
  // Solo localhost: Tailscale Funnel es la única entrada. En Docker se usa HOST=0.0.0.0
  // y el puerto se publica únicamente en 127.0.0.1 del anfitrión.
  host: process.env.HOST || '127.0.0.1',
  superAdministrador: (process.env.LOGIN_USERNAME || '').trim(),

  db: {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'tfg'
  },

  igdb: {
    clientId: (process.env.IGDB_CLIENT_ID || '').trim(),
    clientSecret: (process.env.IGDB_CLIENT_SECRET || '').trim()
  },

  directorioPublico: path.join(__dirname, '..', 'public'),
  // Los tests usan una carpeta temporal.
  directorioArchivos: process.env.DIRECTORIO_ARCHIVOS || path.join(__dirname, '..', 'storage', 'usuarios'),

  sesion: {
    cookie: 'frikicoments_session',
    duracionMs: 8 * 60 * 60 * 1000
  },
  duracionRecuperacionMs: 24 * 60 * 60 * 1000,

  archivos: {
    cuotaPorDefectoBytes: 500 * MB,
    cuotaMaximaBytes: 10 * GB,
    maximoPorUsuario: 1000,
    // Espacio que siempre debe quedar libre en el disco tras una subida.
    espacioLibreMinimoBytes: 5 * GB,
    // Margen para las cabeceras multipart incluidas en Content-Length.
    margenMultipartBytes: 64 * 1024
  }
};
