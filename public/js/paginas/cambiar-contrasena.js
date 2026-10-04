// Cambiar la contraseña propia. Al guardarla se cierran todas las sesiones de la cuenta.
import { api, avisar } from '../comun.js';

const formulario = document.querySelector('#form-cambiar-contrasena');
const mensaje = document.querySelector('#mensaje');

formulario.addEventListener('submit', async evento => {
  evento.preventDefault();
  if (formulario['password-nueva'].value !== formulario['confirmar-password-nueva'].value) {
    avisar(mensaje, 'Las contraseñas nuevas no coinciden.', true);
    return;
  }
  try {
    const datos = await api('/api/usuarios/password', {
      metodo: 'PATCH',
      datos: { contrasenaActual: formulario['password-actual'].value, contrasenaNueva: formulario['password-nueva'].value }
    });
    avisar(mensaje, datos.mensaje);
    setTimeout(() => { window.location.href = '/'; }, 1200);
  } catch (error) {
    avisar(mensaje, error.message, true);
  }
});
