// Cifrado en reposo del chat de la portada (AES-256-GCM).
// El servidor guarda la clave, así que puede descifrar: protege los mensajes si alguien
// obtiene la base de datos o una copia de seguridad, pero NO es cifrado de extremo a extremo.
//
// Formato guardado (versionado): v1:<iv>:<etiqueta>:<cifrado>, cada parte en base64url.
// El id del autor va como dato autenticado: un mensaje cifrado no se puede atribuir a otra persona.
const crypto = require('crypto');

const VERSION = 'v1';
const ALGORITMO = 'aes-256-gcm';
const BYTES_IV = 12;
const BYTES_ETIQUETA = 16;

class ErrorCifradoChat extends Error {
  // codigo: 'SIN_CLAVE' (falta o no es válida) o 'DESCIFRADO' (clave incorrecta o datos alterados).
  constructor(codigo, mensaje) {
    super(mensaje);
    this.codigo = codigo;
  }
}

// La clave se lee de CHAT_ENCRYPTION_KEY: 32 bytes en base64 (44 caracteres).
// Se lee en cada uso para que un cambio de configuración no deje una clave vieja en memoria.
function obtenerClave() {
  const valor = (process.env.CHAT_ENCRYPTION_KEY || '').trim();
  const clave = /^[A-Za-z0-9+/]{43}=$/.test(valor) ? Buffer.from(valor, 'base64') : null;
  if (!clave || clave.length !== 32) {
    throw new ErrorCifradoChat('SIN_CLAVE', 'CHAT_ENCRYPTION_KEY falta o no son 32 bytes en base64.');
  }
  return clave;
}

const datosAutenticados = usuarioId => Buffer.from(`frikicoments:chat:${VERSION}:${usuarioId}`);

function cifrar(texto, usuarioId) {
  const iv = crypto.randomBytes(BYTES_IV);
  const cifrador = crypto.createCipheriv(ALGORITMO, obtenerClave(), iv, { authTagLength: BYTES_ETIQUETA });
  cifrador.setAAD(datosAutenticados(usuarioId));
  const cifrado = Buffer.concat([cifrador.update(String(texto), 'utf8'), cifrador.final()]);
  return [VERSION, iv, cifrador.getAuthTag(), cifrado].map(parte => (Buffer.isBuffer(parte) ? parte.toString('base64url') : parte)).join(':');
}

function descifrar(valor, usuarioId) {
  const clave = obtenerClave();
  const partes = String(valor).split(':');
  const formatoValido = partes.length === 4 && partes[0] === VERSION && partes.slice(1).every(p => /^[A-Za-z0-9_-]*$/.test(p));
  const [iv, etiqueta, cifrado] = formatoValido ? partes.slice(1).map(p => Buffer.from(p, 'base64url')) : [];
  if (!formatoValido || iv.length !== BYTES_IV || etiqueta.length !== BYTES_ETIQUETA) {
    throw new ErrorCifradoChat('DESCIFRADO', 'Formato de mensaje cifrado no reconocido.');
  }
  try {
    const descifrador = crypto.createDecipheriv(ALGORITMO, clave, iv, { authTagLength: BYTES_ETIQUETA });
    descifrador.setAAD(datosAutenticados(usuarioId));
    descifrador.setAuthTag(etiqueta);
    return Buffer.concat([descifrador.update(cifrado), descifrador.final()]).toString('utf8');
  } catch {
    // GCM detecta clave incorrecta o datos alterados. No se incluye ningún dato del mensaje.
    throw new ErrorCifradoChat('DESCIFRADO', 'No se pudo descifrar el mensaje (clave incorrecta o datos alterados).');
  }
}

module.exports = { cifrar, descifrar, obtenerClave, ErrorCifradoChat, VERSION };
