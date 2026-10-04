// Superadministración: cuentas (nombre, contraseña, cuota y enlace de recuperación),
// aviso de la portada, chat de la portada y tamaño de los chats privados.
import { api, crear, avisar, fecha, formatearBytes, plural } from '../comun.js';

const $ = selector => document.querySelector(selector);
const lista = $('#lista-usuarios');

// Campo de una tarjeta: etiqueta arriba y, debajo, la entrada con su botón al lado.
function crearCampo(usuario, tipo, textoEtiqueta, entrada, textoBoton, claseBoton) {
  return crear('form', { clase: 'campo-admin', 'data-id': String(usuario.id), 'data-tipo': tipo }, [
    crear('label', { for: entrada.id, texto: textoEtiqueta }),
    crear('div', { clase: 'campo-admin-fila' }, [entrada, crear('button', { clase: `btn ${claseBoton}`, type: 'submit', texto: textoBoton })])
  ]);
}

// Bloque «Recuperación»: genera un enlace de un solo uso para que la persona elija
// su contraseña nueva. El administrador nunca llega a conocer esa contraseña.
function crearRecuperacion(usuario, aviso) {
  const generar = crear('button', { type: 'button', clase: 'btn primary', texto: 'Generar enlace de recuperación' });
  const enlace = crear('input', { type: 'text', readOnly: true, 'aria-label': `Enlace de recuperación de ${usuario.nombre_usuario}` });
  const copiar = crear('button', { type: 'button', clase: 'btn secondary', texto: 'Copiar' });
  const caducidad = crear('p', { clase: 'recuperacion-caducidad' });
  const resultado = crear('div', { clase: 'recuperacion-resultado', hidden: true }, [
    crear('div', { clase: 'campo-admin-fila' }, [enlace, copiar]),
    caducidad
  ]);

  generar.addEventListener('click', async () => {
    avisar(aviso, 'Generando enlace...');
    generar.disabled = true;
    try {
      const datos = await api(`/api/superadmin/usuarios/${usuario.id}/recuperacion`, { metodo: 'POST' });
      enlace.value = `${window.location.origin}/usuarios/recuperar.html#${datos.token}`;
      caducidad.textContent = `Un solo uso. Caduca el ${fecha(datos.expiraEn)}. Si generas otro, este deja de valer.`;
      resultado.hidden = false;
      generar.textContent = 'Generar otro enlace';
      avisar(aviso, 'Enlace generado. Envíaselo por un canal privado.');
      enlace.select();
    } catch (error) {
      avisar(aviso, error.message, true);
    } finally {
      generar.disabled = false;
    }
  });

  copiar.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(enlace.value);
      copiar.textContent = 'Copiado';
    } catch {
      // Sin permiso de portapapeles: se deja seleccionado para copiarlo a mano.
      enlace.select();
      copiar.textContent = 'Pulsa Ctrl+C';
    }
    setTimeout(() => { copiar.textContent = 'Copiar'; }, 2500);
  });

  return crear('div', { clase: 'recuperacion-admin' }, [
    crear('span', { clase: 'recuperacion-etiqueta', texto: 'Recuperación sin correo' }), generar, resultado
  ]);
}

function crearTarjeta(usuario) {
  const id = usuario.id;
  const aviso = crear('p', { clase: 'auth-message mensaje-cuenta', role: 'status', 'aria-live': 'polite' });
  const nombre = crear('input', { id: `nombre-${id}`, name: 'nombre_usuario', type: 'text', minLength: 3, maxLength: 30, value: usuario.nombre_usuario, required: true });
  const contrasena = crear('input', {
    id: `contrasena-${id}`, name: 'contrasena', type: 'password', minLength: 8, autocomplete: 'new-password', placeholder: 'Mínimo 8 caracteres', required: true
  });
  const cuota = crear('input', {
    id: `cuota-${id}`, name: 'megabytes', type: 'number', min: '500', max: '10240', step: '1',
    value: String(Math.round(Number(usuario.cuota_archivos_bytes) / 1024 / 1024)), required: true
  });

  return crear('article', { clase: 'cuenta-admin' }, [
    crear('div', { clase: 'cuenta-admin-cabecera' }, [
      crear('strong', { clase: 'cuenta-admin-nombre', texto: usuario.nombre_usuario }),
      crear('span', { clase: `rol-cuenta ${usuario.rol === 'admin' ? 'admin' : ''}`.trim(), texto: usuario.rol })
    ]),
    crearCampo(usuario, 'nombre', 'Nombre de usuario', nombre, 'Guardar', 'secondary'),
    crearCampo(usuario, 'contrasena', 'Nueva contraseña', contrasena, 'Restablecer', 'primary'),
    crearCampo(usuario, 'cuota', 'Espacio máximo (MB)', cuota, 'Guardar', 'secondary'),
    crearRecuperacion(usuario, aviso),
    aviso
  ]);
}

async function cargarUsuarios() {
  const usuarios = await api('/api/superadmin/usuarios');
  lista.replaceChildren(...usuarios.map(crearTarjeta));
}

// Un único manejador para los formularios de todas las tarjetas.
const cambios = {
  nombre: formulario => ({ datos: { nombre_usuario: formulario.nombre_usuario.value.trim() }, exito: 'Nombre actualizado.' }),
  contrasena: formulario => ({ datos: { contrasena: formulario.contrasena.value }, exito: 'Contraseña actualizada.' }),
  cuota: formulario => ({ datos: { megabytes: Number(formulario.megabytes.value) }, exito: 'Espacio actualizado.' })
};

lista.addEventListener('submit', async evento => {
  evento.preventDefault();
  const formulario = evento.target;
  const { tipo, id } = formulario.dataset;
  const tarjeta = formulario.closest('.cuenta-admin');
  const aviso = tarjeta.querySelector('.mensaje-cuenta');
  const boton = formulario.querySelector('button');
  const { datos, exito } = cambios[tipo](formulario);
  boton.disabled = true;
  avisar(aviso, 'Guardando...');
  try {
    await api(`/api/superadmin/usuarios/${id}/${tipo}`, { metodo: 'PATCH', datos });
    if (tipo === 'contrasena') formulario.reset();
    if (tipo === 'nombre') tarjeta.querySelector('.cuenta-admin-nombre').textContent = datos.nombre_usuario;
    avisar(aviso, exito);
  } catch (error) {
    avisar(aviso, error.message, true);
  } finally {
    boton.disabled = false;
  }
});

// ---- Aviso de la portada y chat de la portada ----
const formularioAviso = $('#form-mensaje-lateral');
formularioAviso.addEventListener('submit', async evento => {
  evento.preventDefault();
  try {
    const datos = await api('/api/superadmin/mensaje-lateral', {
      metodo: 'POST', datos: { contenido: formularioAviso['contenido-mensaje-lateral'].value }
    });
    formularioAviso.reset();
    avisar($('#mensaje-aviso'), datos.mensaje);
  } catch (error) {
    avisar($('#mensaje-aviso'), error.message, true);
  }
});

$('#vaciar-chat').addEventListener('click', async () => {
  if (!window.confirm('¿Quieres borrar todos los mensajes del chat?')) return;
  try {
    avisar($('#mensaje-chat'), (await api('/api/superadmin/chat', { metodo: 'DELETE' })).mensaje);
  } catch (error) {
    avisar($('#mensaje-chat'), error.message, true);
  }
});

// ---- Chats privados: solo tamaño, nunca contenido ----
const mensajeConversaciones = $('#mensaje-conversaciones');

function crearConversacion(conversacion) {
  const nombres = conversacion.usuarios.join(' y ');
  const ultimo = conversacion.ultimoMensaje ? fecha(conversacion.ultimoMensaje) : 'sin mensajes';
  const borrar = crear('button', { type: 'button', clase: 'btn danger', texto: 'Borrar' });
  borrar.addEventListener('click', async () => {
    if (!window.confirm(`¿Borrar la conversación entre ${nombres}? No se puede deshacer.`)) return;
    borrar.disabled = true;
    try {
      avisar(mensajeConversaciones, (await api(`/api/superadmin/conversaciones/${conversacion.id}`, { metodo: 'DELETE' })).mensaje);
      await cargarConversaciones();
    } catch (error) {
      avisar(mensajeConversaciones, error.message, true);
      borrar.disabled = false;
    }
  });
  return crear('article', { clase: 'conversacion-admin' }, [
    crear('div', {}, [
      crear('strong', { texto: nombres }),
      crear('span', { texto: `${formatearBytes(conversacion.bytes)} · ${plural(conversacion.mensajes, 'mensaje', 'mensajes')} · último: ${ultimo}` })
    ]),
    borrar
  ]);
}

async function cargarConversaciones() {
  const conversaciones = await api('/api/superadmin/conversaciones');
  const totalBytes = conversaciones.reduce((suma, c) => suma + c.bytes, 0);
  const totalMensajes = conversaciones.reduce((suma, c) => suma + c.mensajes, 0);
  $('#resumen-conversaciones').textContent = conversaciones.length
    ? `${plural(conversaciones.length, 'conversación', 'conversaciones')} · ${plural(totalMensajes, 'mensaje', 'mensajes')} · ${formatearBytes(totalBytes)} de texto en total.`
    : 'Todavía no hay conversaciones privadas.';
  $('#lista-conversaciones').replaceChildren(...conversaciones.map(crearConversacion));
}

cargarUsuarios().catch(error => avisar($('#mensaje'), error.message, true));
cargarConversaciones().catch(error => avisar(mensajeConversaciones, error.message, true));
