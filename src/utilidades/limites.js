// Límites de peticiones en memoria (una sola instancia del servidor).
// Cada limitador cuenta peticiones por clave (IP o usuario) dentro de una ventana de tiempo.

const registros = new Set();

function crearRegistro() {
  const registro = new Map();
  registros.add(registro);
  return registro;
}

function puedeContinuar(registro, clave, maximo, ventanaMs) {
  const ahora = Date.now();
  const actual = registro.get(clave);
  if (!actual || ahora - actual.inicio >= ventanaMs) {
    registro.set(clave, { inicio: ahora, cantidad: 1 });
    return true;
  }
  if (actual.cantidad >= maximo) return false;
  actual.cantidad += 1;
  return true;
}

function ipCliente(req) {
  return req.ip || req.socket.remoteAddress || 'desconocida';
}

// Crea un middleware que responde 429 al superar `maximo` peticiones por clave en `ventanaMs`.
function crearLimitador({ maximo, ventanaMs, clave, mensaje }) {
  const registro = crearRegistro();
  return function limitar(req, res, next) {
    if (!puedeContinuar(registro, clave(req), maximo, ventanaMs)) {
      res.setHeader('Retry-After', String(Math.ceil(ventanaMs / 1000)));
      return res.status(429).json({ error: mensaje });
    }
    next();
  };
}

const porIP = req => ipCliente(req);
const porUsuario = req => String(req.usuarioId);

// Limpieza periódica: ninguna ventana dura más de una hora, así que lo más viejo sobra.
setInterval(() => {
  const ahora = Date.now();
  for (const registro of registros) {
    for (const [clave, { inicio }] of registro) {
      if (ahora - inicio >= 60 * 60 * 1000) registro.delete(clave);
    }
  }
}, 10 * 60 * 1000).unref();

module.exports = { crearRegistro, puedeContinuar, crearLimitador, ipCliente, porIP, porUsuario };
