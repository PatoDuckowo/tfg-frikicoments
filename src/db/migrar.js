// Aplica en orden las migraciones de src/db/migraciones que aún no estén registradas.
// Cada migración es un .sql (sentencias separadas por ";") o un .js que exporta async (conexion, utilidades).
const fs = require('fs');
const path = require('path');
const { pool } = require('./pool');

const directorio = path.join(__dirname, 'migraciones');

function sentenciasSQL(texto) {
  return texto
    .split('\n').filter(linea => !linea.trim().startsWith('--')).join('\n')
    .split(';').map(sentencia => sentencia.trim()).filter(Boolean);
}

async function migrar(utilidades = {}) {
  const conexion = await pool.getConnection();
  try {
    // Un candado evita que dos procesos migren la misma base a la vez.
    const [[{ candado }]] = await conexion.query("SELECT GET_LOCK('frikicoments_migraciones', 60) AS candado");
    if (candado !== 1) throw new Error('Otra instancia está migrando la base de datos.');

    await conexion.query(`
      CREATE TABLE IF NOT EXISTS migraciones (
        nombre VARCHAR(190) NOT NULL,
        aplicada_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (nombre)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    const [filas] = await conexion.query('SELECT nombre FROM migraciones');
    const aplicadas = new Set(filas.map(fila => fila.nombre));
    const pendientes = fs.readdirSync(directorio)
      .filter(nombre => /^\d{3}_.+\.(sql|js)$/.test(nombre) && !aplicadas.has(nombre))
      .sort();

    for (const nombre of pendientes) {
      const ruta = path.join(directorio, nombre);
      if (nombre.endsWith('.sql')) {
        for (const sentencia of sentenciasSQL(fs.readFileSync(ruta, 'utf8'))) {
          await conexion.query(sentencia);
        }
      } else {
        await require(ruta)(conexion, utilidades);
      }
      await conexion.query('INSERT INTO migraciones (nombre) VALUES (?)', [nombre]);
      console.log(`Migración aplicada: ${nombre}`);
    }
    return pendientes;
  } finally {
    await conexion.query("SELECT RELEASE_LOCK('frikicoments_migraciones')").catch(() => {});
    conexion.release();
  }
}

module.exports = { migrar };
