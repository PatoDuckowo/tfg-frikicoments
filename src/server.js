// Arranque: aplica las migraciones pendientes, programa la limpieza y abre el servidor.
const config = require('./config');
const { pool } = require('./db/pool');
const { migrar } = require('./db/migrar');
const { crearApp } = require('./app');
const igdb = require('./servicios/igdb');

// Borra lo caducado: sesiones, enlaces de recuperación, chat de más de 24 h y avisos vencidos.
async function limpiar() {
  await pool.execute('DELETE FROM sesiones WHERE expira_en <= NOW()');
  await pool.execute('DELETE FROM recuperaciones_contrasena WHERE expira_en <= NOW()');
  await pool.execute('DELETE FROM chat_mensajes WHERE creado_en <= DATE_SUB(NOW(), INTERVAL 24 HOUR)');
  await pool.execute('DELETE FROM mensajes_laterales WHERE expira_en <= NOW()');
}

async function iniciar() {
  await migrar({ igdb });
  await limpiar();
  setInterval(() => {
    limpiar().catch(error => console.error('[LIMPIEZA]', error.code || error.message));
  }, 10 * 60 * 1000).unref();

  crearApp().listen(config.puerto, config.host, () => {
    console.log(`Servidor corriendo en http://${config.host}:${config.puerto}`);
  });
}

iniciar().catch(error => {
  console.error('No se pudo iniciar el servidor:', error.code || error.message);
  process.exit(1);
});
