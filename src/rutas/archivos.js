// Archivos personales con cuota por usuario y protección contra llenar el disco.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
const config = require('../config');
const { pool } = require('../db/pool');
const { requerirInicioSesion } = require('../middleware/sesion');
const { crearRegistro, puedeContinuar } = require('../utilidades/limites');
const { idPositivo } = require('../utilidades/validacion');

const router = express.Router();
const { directorioArchivos } = config;
const { maximoPorUsuario, espacioLibreMinimoBytes, margenMultipartBytes } = config.archivos;
fs.mkdirSync(directorioArchivos, { recursive: true });

const limitesSubida = crearRegistro();
const subidasEnCurso = new Set();

const almacenamiento = multer.diskStorage({
  destination: directorioArchivos,
  filename: (req, file, callback) => callback(null, `${Date.now()}-${crypto.randomBytes(16).toString('hex')}`)
});

// El límite de tamaño es lo que le queda al usuario de su cuota, no el máximo global:
// así multer corta la subida en cuanto se excede, en vez de escribir el archivo entero.
function crearSubida(limiteBytes) {
  return multer({ storage: almacenamiento, limits: { fileSize: limiteBytes, files: 1, fields: 5 } }).single('archivo');
}

async function consultarUso(usuarioId) {
  const [filas] = await pool.execute(
    `SELECT u.cuota_archivos_bytes AS cuota, COALESCE(SUM(a.tamano_bytes), 0) AS usados, COUNT(a.id) AS total
     FROM usuarios u
     LEFT JOIN archivos_usuario a ON a.usuario_id = u.id
     WHERE u.id = ?
     GROUP BY u.id`,
    [usuarioId]
  );
  return { cuotaBytes: Number(filas[0].cuota), usadosBytes: Number(filas[0].usados), total: Number(filas[0].total) };
}

router.get('/api/archivos', requerirInicioSesion, async (req, res) => {
  const [archivos] = await pool.execute(
    `SELECT id, nombre_original, mime_type, tamano_bytes, creado_en
     FROM archivos_usuario WHERE usuario_id = ? ORDER BY nombre_original`,
    [req.usuarioId]
  );
  const { cuotaBytes, usadosBytes } = await consultarUso(req.usuarioId);
  res.json({ cuotaBytes, usadosBytes, archivos });
});

// Todas las comprobaciones se hacen ANTES de leer el cuerpo, para no escribir en disco
// archivos que luego se van a rechazar.
async function prepararSubida(req, res, next) {
  const clave = String(req.usuarioId);
  if (subidasEnCurso.has(clave)) {
    return res.status(429).json({ error: 'Ya tienes una subida en curso. Espera a que termine.' });
  }
  if (!puedeContinuar(limitesSubida, clave, 30, 60 * 60 * 1000)) {
    return res.status(429).json({ error: 'Has alcanzado el límite temporal de subidas. Inténtalo más tarde.' });
  }

  const uso = await consultarUso(req.usuarioId);
  if (uso.total >= maximoPorUsuario) {
    return res.status(413).json({ error: `Has alcanzado el máximo de ${maximoPorUsuario} archivos.` });
  }
  const disponibleBytes = uso.cuotaBytes - uso.usadosBytes;
  const tamanoPeticion = Number(req.headers['content-length']) || 0;
  if (disponibleBytes <= 0 || tamanoPeticion > disponibleBytes + margenMultipartBytes) {
    res.setHeader('Connection', 'close');
    return res.status(413).json({ error: 'El archivo no cabe en el espacio que te queda de tu cuota.' });
  }
  const disco = await fs.promises.statfs(directorioArchivos);
  if (disco.bavail * disco.bsize - (tamanoPeticion || disponibleBytes) < espacioLibreMinimoBytes) {
    res.setHeader('Connection', 'close');
    return res.status(507).json({ error: 'El servidor no tiene espacio suficiente. Avisa a un administrador.' });
  }

  // Una subida a la vez por usuario: evita que dos subidas simultáneas superen la cuota.
  req.limiteSubidaBytes = disponibleBytes;
  subidasEnCurso.add(clave);
  res.on('close', () => subidasEnCurso.delete(clave));
  next();
}

function recibirArchivo(req, res, next) {
  crearSubida(req.limiteSubidaBytes)(req, res, error => {
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'El archivo no cabe en el espacio que te queda de tu cuota.' });
    }
    if (error instanceof multer.MulterError) {
      return res.status(400).json({ error: 'La subida no es válida. Envía un único archivo.' });
    }
    next(error);
  });
}

router.post('/api/archivos', requerirInicioSesion, prepararSubida, recibirArchivo, async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Selecciona un archivo.' });
  const borrarSubido = () => fs.promises.unlink(req.file.path).catch(() => {});

  try {
    // Comprobación final por si la cuota cambió durante la subida.
    const { cuotaBytes, usadosBytes, total } = await consultarUso(req.usuarioId);
    if (total >= maximoPorUsuario) {
      await borrarSubido();
      return res.status(413).json({ error: `Has alcanzado el máximo de ${maximoPorUsuario} archivos.` });
    }
    if (usadosBytes + req.file.size > cuotaBytes) {
      await borrarSubido();
      return res.status(413).json({ error: 'Has superado tu cuota de almacenamiento.' });
    }
    const [resultado] = await pool.execute(
      `INSERT INTO archivos_usuario (usuario_id, nombre_original, nombre_disco, mime_type, tamano_bytes)
       VALUES (?, ?, ?, ?, ?)`,
      [req.usuarioId, req.file.originalname.slice(0, 255), req.file.filename, req.file.mimetype || 'application/octet-stream', req.file.size]
    );
    res.status(201).json({ ok: true, id: resultado.insertId });
  } catch (error) {
    await borrarSubido();
    throw error;
  }
});

async function archivoPropio(req) {
  const id = idPositivo(req.params.id);
  if (!id) return null;
  const [filas] = await pool.execute(
    'SELECT id, nombre_original, nombre_disco FROM archivos_usuario WHERE id = ? AND usuario_id = ?',
    [id, req.usuarioId]
  );
  return filas[0] || null;
}

router.get('/api/archivos/:id/descargar', requerirInicioSesion, async (req, res) => {
  const archivo = await archivoPropio(req);
  if (!archivo) return res.status(404).json({ error: 'Archivo no encontrado.' });
  res.download(path.join(directorioArchivos, archivo.nombre_disco), archivo.nombre_original);
});

router.delete('/api/archivos/:id', requerirInicioSesion, async (req, res) => {
  const archivo = await archivoPropio(req);
  if (!archivo) return res.status(404).json({ error: 'Archivo no encontrado.' });
  await pool.execute('DELETE FROM archivos_usuario WHERE id = ?', [archivo.id]);
  await fs.promises.unlink(path.join(directorioArchivos, archivo.nombre_disco)).catch(() => {});
  res.json({ ok: true });
});

module.exports = router;
