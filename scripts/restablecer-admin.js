require('dotenv').config({ override: true });

const bcrypt = require('bcryptjs');
const { pool } = require('../db');

async function restablecerAdministrador() {
  const usuario = (process.env.LOGIN_USERNAME || '').trim();
  const contrasena = process.env.LOGIN_PASSWORD || '';

  if (!usuario || !contrasena) {
    throw new Error('Configura LOGIN_USERNAME y LOGIN_PASSWORD en .env antes de continuar.');
  }

  const hash = await bcrypt.hash(contrasena, 12);
  const [resultado] = await pool.execute(
    "UPDATE usuarios SET password_hash = ?, rol = 'admin' WHERE nombre_usuario = ?",
    [hash, usuario]
  );

  if (resultado.affectedRows === 0) {
    throw new Error('No existe ese administrador en MySQL. Ejecuta npm run db:init primero.');
  }

  console.log('Contraseña del administrador restablecida en MySQL.');
}

restablecerAdministrador()
  .catch(error => {
    console.error('No se pudo restablecer el administrador:', error.code || error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
