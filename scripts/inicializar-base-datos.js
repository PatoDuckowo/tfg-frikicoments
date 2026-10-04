// Prepara una instalación nueva: aplica las migraciones y crea el superadministrador de .env.
const bcrypt = require('bcryptjs');
const config = require('../src/config');
const { pool } = require('../src/db/pool');
const { migrar } = require('../src/db/migrar');
const igdb = require('../src/servicios/igdb');

async function inicializarBaseDatos() {
  await migrar({ igdb });

  const contrasena = process.env.LOGIN_PASSWORD || '';
  if (!config.superAdministrador || !contrasena) {
    throw new Error('Configura LOGIN_USERNAME y LOGIN_PASSWORD en .env para crear el administrador inicial.');
  }
  const hash = await bcrypt.hash(contrasena, 12);
  await pool.execute(
    `INSERT INTO usuarios (nombre_usuario, password_hash, rol) VALUES (?, ?, 'admin')
     ON DUPLICATE KEY UPDATE rol = 'admin'`,
    [config.superAdministrador, hash]
  );
  console.log('Esquema listo y administrador inicial asegurado.');
}

inicializarBaseDatos()
  .catch(error => {
    console.error('No se pudo inicializar MySQL:', error.code || error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
