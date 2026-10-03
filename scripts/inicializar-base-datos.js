require('dotenv').config();

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { pool } = require('../db');

async function inicializarBaseDatos() {
  const archivoEsquema = path.join(__dirname, '..', 'sql', 'schema.sql');
  const comandos = fs.readFileSync(archivoEsquema, 'utf8')
    .split(';')
    .map(comando => comando.trim())
    .filter(Boolean);

  for (const comando of comandos) {
    await pool.query(comando);
  }

  const nombreAdmin = (process.env.LOGIN_USERNAME || '').trim();
  const contrasenaAdmin = process.env.LOGIN_PASSWORD || '';

  if (!nombreAdmin || !contrasenaAdmin) {
    throw new Error('Configura LOGIN_USERNAME y LOGIN_PASSWORD en .env para crear el administrador inicial.');
  }

  const hashAdmin = await bcrypt.hash(contrasenaAdmin, 12);
  await pool.execute(
    `INSERT INTO usuarios (nombre_usuario, password_hash, rol)
     VALUES (?, ?, 'admin')
     ON DUPLICATE KEY UPDATE rol = 'admin'`,
    [nombreAdmin, hashAdmin]
  );
  console.log('Esquema listo y administrador inicial asegurado.');

  // Importa las cuentas privadas existentes una sola vez, almacenando hashes bcrypt.
  const archivoUsuarios = path.join(__dirname, '..', 'usuarios.json');
  if (fs.existsSync(archivoUsuarios)) {
    const cuentas = JSON.parse(fs.readFileSync(archivoUsuarios, 'utf8'));
    if (!Array.isArray(cuentas)) throw new Error('usuarios.json debe contener una lista.');

    let importados = 0;
    for (const cuenta of cuentas) {
      if (!cuenta || typeof cuenta.usuario !== 'string' || typeof cuenta.contrasena !== 'string') continue;
      const usuario = cuenta.usuario.trim();
      if (!usuario || usuario.toLowerCase() === nombreAdmin.toLowerCase()) continue;

      const hash = await bcrypt.hash(cuenta.contrasena, 12);
      const rol = cuenta.rol === 'admin' ? 'admin' : 'usuario';
      const [resultado] = await pool.execute(
        `INSERT IGNORE INTO usuarios (nombre_usuario, password_hash, rol)
         VALUES (?, ?, ?)`,
        [usuario, hash, rol]
      );
      importados += resultado.affectedRows;
    }
    console.log(`Cuentas privadas importadas a MySQL: ${importados}.`);
  }
}

inicializarBaseDatos()
  .catch(error => {
    console.error('No se pudo inicializar MySQL:', error.code || error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
