// Cifra los mensajes antiguos del chat de la portada. Se ejecuta a mano tras desplegar:
//   node scripts/cifrar-chat.js --comprobar   (solo cuenta y verifica, no cambia nada)
//   node scripts/cifrar-chat.js               (cifra los pendientes)
// Se puede interrumpir y volver a lanzar: continúa donde se quedó y nunca cifra dos veces.
// Solo muestra recuentos e ids, nunca el contenido de los mensajes ni la clave.
const { pool } = require('../src/db/pool');
const { obtenerClave, ErrorCifradoChat } = require('../src/servicios/cifrado-chat');
const { contarPendientes, cifrarMensajesPendientes, comprobarCifrados } = require('../src/servicios/migrar-chat');

async function principal() {
  obtenerClave();
  const soloComprobar = process.argv.includes('--comprobar');
  console.log(`Mensajes antiguos sin cifrar: ${await contarPendientes()}`);
  if (!soloComprobar) console.log(`Cifrados ahora: ${await cifrarMensajesPendientes()}`);
  const { total, fallidos } = await comprobarCifrados();
  console.log(`Mensajes cifrados: ${total}. Se descifran bien: ${total - fallidos.length}.`);
  if (fallidos.length) {
    console.error(`No se pueden descifrar los mensajes con id: ${fallidos.join(', ')}. ¿Es la clave correcta?`);
    process.exitCode = 1;
  }
}

principal()
  .catch(error => {
    console.error('No se pudo completar:', error instanceof ErrorCifradoChat ? error.message : (error.code || error.message));
    process.exitCode = 1;
  })
  .finally(() => pool.end());
