// Mi cuenta: nombre de la sesión y accesos a perfil, contraseña y administración.
import { api, rutaPerfil } from '../comun.js';

const datos = await api('/api/usuarios/me');
document.querySelector('#nombre-usuario').textContent = datos.usuario;
document.querySelector('#enlace-mi-perfil').href = rutaPerfil(datos.usuario);
document.querySelector('#panel-superadmin').hidden = !datos.esAdministrador;
