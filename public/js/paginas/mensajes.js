// Chat privado entre personas que se siguen mutuamente.
// La conversación abierta pide cada 4 s solo los mensajes nuevos; la lista de chats, cada 20 s.
import { api, crear, avisar, fecha, rutaPerfil, actualizarAvisoMensajes } from '../comun.js';

const $ = selector => document.querySelector(selector);
const mensaje = $('#mensaje');
const listaChats = $('#lista-chats');
const titulo = $('#conversacion-titulo');
const enlacePerfil = $('#conversacion-perfil');
const contenedorMensajes = $('#conversacion-mensajes');
const formulario = $('#form-mensaje');
const texto = $('#texto-mensaje');
const avisoEscribir = $('#aviso-escribir');

let chats = [];
let actual = null; // id de la persona con la que se habla
let ultimoId = 0; // último mensaje recibido
let idsPintados = new Set();

function pintarLista() {
  if (!chats.length) {
    listaChats.replaceChildren(crear('p', { clase: 'admin-ayuda' }, [
      'Aún no tienes chats. Busca gente en ',
      crear('a', { clase: 'enlace-perfil', href: '/usuarios/perfil.html', texto: 'Personas' }),
      ' y seguíos mutuamente.'
    ]));
    return;
  }
  listaChats.replaceChildren(...chats.map(chat => {
    const detalle = chat.puedeEscribir ? (chat.ultimoMensaje ? fecha(chat.ultimoMensaje) : 'Sin mensajes todavía') : 'Solo lectura';
    const boton = crear('button', { type: 'button', clase: 'chat-contacto', 'aria-current': String(chat.id === actual) }, [
      crear('span', { texto: chat.usuario }, [crear('small', { texto: detalle })])
    ]);
    if (chat.noLeidos > 0 && chat.id !== actual) {
      boton.append(crear('span', { clase: 'aviso-no-leidos', texto: chat.noLeidos > 99 ? '99+' : String(chat.noLeidos), title: `${chat.noLeidos} sin leer` }));
    }
    boton.addEventListener('click', () => abrirChat(chat.id));
    return boton;
  }));
}

async function cargarLista() {
  chats = await api('/api/mensajes');
  pintarLista();
}

const estaAbajo = () => contenedorMensajes.scrollHeight - contenedorMensajes.scrollTop - contenedorMensajes.clientHeight < 80;

function pintarMensajes(mensajes, forzarScroll) {
  const bajar = forzarScroll || estaAbajo();
  for (const datos of mensajes) {
    if (idsPintados.has(datos.id)) continue;
    idsPintados.add(datos.id);
    ultimoId = Math.max(ultimoId, datos.id);
    const cuando = new Date(datos.creadoEn);
    contenedorMensajes.append(crear('article', { clase: datos.propio ? 'burbuja propia' : 'burbuja' }, [
      crear('p', { texto: datos.contenido }),
      crear('time', { dateTime: cuando.toISOString(), texto: cuando.toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }) })
    ]));
  }
  if (idsPintados.size) $('#conversacion-vacia')?.remove();
  if (bajar) contenedorMensajes.scrollTop = contenedorMensajes.scrollHeight;
}

function mostrarPermiso(datos) {
  formulario.hidden = !datos.puedeEscribir;
  avisoEscribir.hidden = datos.puedeEscribir;
  if (!datos.puedeEscribir) {
    avisoEscribir.textContent = datos.relacion.loSigo
      ? `Para escribir, ${datos.usuario.usuario} también tiene que seguirte.`
      : `Para escribir, tenéis que seguiros mutuamente. Puedes seguir a ${datos.usuario.usuario} desde su perfil.`;
  }
}

async function abrirChat(usuarioId, enfocar = true) {
  actual = usuarioId;
  ultimoId = 0;
  idsPintados = new Set();
  avisar(mensaje, '');
  window.history.replaceState(null, '', `/usuarios/mensajes.html?con=${usuarioId}`);
  titulo.textContent = 'Cargando...';
  contenedorMensajes.replaceChildren();
  try {
    const datos = await api(`/api/mensajes/${usuarioId}`);
    if (actual !== usuarioId) return; // se cambió de chat mientras cargaba
    titulo.textContent = datos.usuario.usuario;
    enlacePerfil.href = rutaPerfil(datos.usuario.usuario);
    enlacePerfil.hidden = false;
    if (!datos.mensajes.length) {
      contenedorMensajes.append(crear('p', {
        clase: 'conversacion-vacia', id: 'conversacion-vacia', texto: datos.puedeEscribir ? 'Todavía no hay mensajes. Saluda.' : 'No hay mensajes.'
      }));
    }
    pintarMensajes(datos.mensajes, true);
    mostrarPermiso(datos);
    const chat = chats.find(item => item.id === usuarioId);
    if (chat) chat.noLeidos = 0;
    pintarLista();
    actualizarAvisoMensajes();
    if (datos.puedeEscribir && enfocar) texto.focus();
  } catch (error) {
    titulo.textContent = 'Chat no disponible';
    formulario.hidden = true;
    enlacePerfil.hidden = true;
    avisar(mensaje, error.message, true);
  }
}

// Consulta periódica: solo los mensajes posteriores al último que ya se ve.
async function buscarNuevos() {
  if (actual === null || document.hidden) return;
  const usuarioId = actual;
  try {
    const datos = await api(`/api/mensajes/${usuarioId}?desde=${ultimoId}`);
    if (actual !== usuarioId) return;
    pintarMensajes(datos.mensajes, false);
    mostrarPermiso(datos);
  } catch {
    // Fallo puntual de red: se reintenta en la siguiente vuelta.
  }
}

async function enviar() {
  const contenido = texto.value.trim();
  if (!contenido || actual === null) return;
  const boton = formulario.querySelector('button');
  boton.disabled = true;
  avisar(mensaje, '');
  try {
    const datos = await api(`/api/mensajes/${actual}`, { metodo: 'POST', datos: { contenido } });
    texto.value = '';
    pintarMensajes([datos], true);
    const chat = chats.find(item => item.id === actual);
    if (chat) chat.ultimoMensaje = datos.creadoEn;
  } catch (error) {
    avisar(mensaje, error.message, true);
  } finally {
    boton.disabled = false;
    texto.focus();
  }
}

formulario.addEventListener('submit', evento => {
  evento.preventDefault();
  enviar();
});

// Intro envía; Mayúsculas+Intro hace salto de línea.
texto.addEventListener('keydown', evento => {
  if (evento.key === 'Enter' && !evento.shiftKey && !evento.isComposing) {
    evento.preventDefault();
    enviar();
  }
});

try {
  await cargarLista();
  const pedido = Number(new URLSearchParams(window.location.search).get('con'));
  if (Number.isInteger(pedido) && pedido > 0) await abrirChat(pedido, false);
  else if (chats.length) await abrirChat(chats[0].id, false);
  setInterval(buscarNuevos, 4000);
  setInterval(() => { if (!document.hidden) cargarLista().catch(() => {}); }, 20000);
  document.addEventListener('visibilitychange', buscarNuevos);
} catch (error) {
  avisar(mensaje, error.message, true);
}
