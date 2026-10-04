// Recuperar contraseña con el enlace de un solo uso que envía un administrador.
import { api, avisar } from '../comun.js';

const formulario = document.querySelector('#form-recuperar');
const estadoEnlace = document.querySelector('#estado-enlace');
const mensaje = document.querySelector('#mensaje');

// El código va detrás de "#": el navegador no lo envía al servidor al abrir la página.
// Se quita de la barra de direcciones para que no quede a la vista ni en el historial.
const token = window.location.hash.slice(1);
window.history.replaceState(null, '', window.location.pathname);

function enlaceNoValido(texto) {
  avisar(estadoEnlace, texto, true);
  formulario.hidden = true;
}

async function comprobarEnlace() {
  if (!token) {
    enlaceNoValido('Falta el código de recuperación. Abre el enlace completo que te ha enviado un administrador.');
    return;
  }
  try {
    const datos = await api('/api/recuperacion/comprobar', { metodo: 'POST', datos: { token }, redirigirSinSesion: false });
    avisar(estadoEnlace, `Cuenta: ${datos.usuario}. El enlace caduca el ${new Date(datos.expiraEn).toLocaleString('es-ES')}.`);
    formulario.hidden = false;
    formulario.contrasena.focus();
  } catch (error) {
    enlaceNoValido(error.message);
  }
}

formulario.addEventListener('submit', async evento => {
  evento.preventDefault();
  if (formulario.contrasena.value !== formulario['confirmar-contrasena'].value) {
    avisar(mensaje, 'Las contraseñas no coinciden.', true);
    return;
  }
  const boton = formulario.querySelector('button');
  boton.disabled = true;
  try {
    const datos = await api('/api/recuperacion', {
      metodo: 'POST', datos: { token, contrasena: formulario.contrasena.value }, redirigirSinSesion: false
    });
    formulario.reset();
    formulario.hidden = true;
    avisar(estadoEnlace, 'Listo. Este enlace ya no se puede volver a usar.');
    avisar(mensaje, datos.mensaje);
    document.querySelector('#ir-login').hidden = false;
  } catch (error) {
    avisar(mensaje, error.message, true);
    boton.disabled = false;
  }
});

comprobarEnlace();
