// Invitar: un administrador crea la cuenta con una contraseña inicial.
import { api, avisar } from '../comun.js';

const formulario = document.querySelector('#form-crear-usuario');
const mensaje = document.querySelector('#mensaje');

formulario.addEventListener('submit', async evento => {
  evento.preventDefault();
  if (formulario.contrasena.value !== formulario['confirmar-contrasena'].value) {
    avisar(mensaje, 'Las contraseñas no coinciden.', true);
    return;
  }
  try {
    await api('/api/usuarios/registro', {
      metodo: 'POST',
      datos: { usuario: formulario.usuario.value.trim(), contrasena: formulario.contrasena.value }
    });
    formulario.reset();
    avisar(mensaje, 'Cuenta creada. Comparte las credenciales iniciales solo con la persona invitada.');
  } catch (error) {
    avisar(mensaje, error.message, true);
  }
});
