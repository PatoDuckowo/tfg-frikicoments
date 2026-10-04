// Limitadores compartidos por varias rutas (cada uno tiene su propio contador).
const { crearLimitador, porIP, porUsuario } = require('../utilidades/limites');

module.exports = {
  // Frena avalanchas antes de leer el cuerpo, tocar MySQL o calcular bcrypt.
  limitarGeneral: crearLimitador({
    maximo: 600, ventanaMs: 60 * 1000, clave: porIP, mensaje: 'Demasiadas peticiones. Espera un minuto.'
  }),
  // IGDB es un servicio externo con límite propio (unas 4 peticiones por segundo).
  limitarIGDB: crearLimitador({
    maximo: 60, ventanaMs: 60 * 1000, clave: porUsuario, mensaje: 'Demasiadas consultas de juegos seguidas. Espera un minuto.'
  }),
  // Chat de la portada y mensajes privados.
  limitarMensajes: crearLimitador({
    maximo: 30, ventanaMs: 60 * 1000, clave: porUsuario, mensaje: 'Estás enviando mensajes muy rápido. Espera un poco.'
  }),
  limitarRecuperacion: crearLimitador({
    maximo: 20, ventanaMs: 15 * 60 * 1000, clave: porIP, mensaje: 'Demasiados intentos. Espera unos minutos.'
  })
};
