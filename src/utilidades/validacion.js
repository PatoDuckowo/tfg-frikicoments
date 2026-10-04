const config = require('../config');

// Entero positivo que cabe en INT UNSIGNED; si no, null.
function idPositivo(valor) {
  const id = Number(valor);
  return Number.isInteger(id) && id > 0 && id <= 4294967295 ? id : null;
}

function esNombreSuperAdministrador(nombre) {
  return Boolean(config.superAdministrador)
    && String(nombre).toLowerCase() === config.superAdministrador.toLowerCase();
}

// Nombres: 3-30 letras, números, guion, guion bajo o punto (sin espacios ni símbolos raros).
function errorNombreUsuario(nombre) {
  if (!/^[\p{L}\p{N}_.-]{3,30}$/u.test(nombre)) {
    return 'El nombre debe tener entre 3 y 30 caracteres: letras, números, guion, guion bajo o punto.';
  }
  if (esNombreSuperAdministrador(nombre)) return 'Ese nombre de usuario está reservado.';
  return null;
}

// Texto obligatorio recortado, de 1 a `maximo` caracteres; si no cumple, null.
function textoEntre(valor, maximo) {
  const texto = String(valor ?? '').trim();
  return texto && texto.length <= maximo ? texto : null;
}

module.exports = { idPositivo, esNombreSuperAdministrador, errorNombreUsuario, textoEntre };
