// Portada: login a pantalla completa sin sesión; con sesión, chat, reseñas, estadísticas y formulario.
import {
  api, crear, avisar, fecha, formatearCantidad, colorDeUsuario, enlacePerfil, avatar, vigilarMensajesSinLeer
} from '../comun.js';

const $ = selector => document.querySelector(selector);
const formularioLogin = $('#login-form');
const mensajeLogin = $('#login-mensaje');

// ---- Sesión ----
async function comprobarSesion() {
  let datos;
  try {
    datos = await api('/api/usuarios/me', { redirigirSinSesion: false });
  } catch {
    return false;
  }
  document.body.classList.remove('sin-sesion');
  const nombreCuenta = $('#account-name');
  nombreCuenta.textContent = `Sesión: ${datos.usuario}`;
  nombreCuenta.href = `/usuarios/perfil.html?u=${encodeURIComponent(datos.usuario)}`;
  $('#superadmin-link').hidden = !datos.esAdministrador;
  formularioLogin.hidden = true;
  $('#account-actions').hidden = false;
  $('#contenido-principal').hidden = false;

  comprobarConexion();
  cargarAviso();
  cargarChat();
  cargarResenas();
  cargarEstadisticas();
  setInterval(actualizarChat, 10000);
  setInterval(cargarEstadisticas, 30000);
  vigilarMensajesSinLeer();
  return true;
}

formularioLogin.addEventListener('submit', async evento => {
  evento.preventDefault();
  avisar(mensajeLogin, 'Comprobando datos...');
  try {
    await api('/api/usuarios/login', {
      metodo: 'POST',
      redirigirSinSesion: false,
      datos: { usuario: formularioLogin.usuario.value, contrasena: formularioLogin.contrasena.value }
    });
    formularioLogin.reset();
    avisar(mensajeLogin, '');
    if (!await comprobarSesion()) throw new Error('No se pudo recuperar la sesión iniciada.');
  } catch (error) {
    avisar(mensajeLogin, error.message, true);
  }
});

$('#logout-button').addEventListener('click', async () => {
  try {
    await fetch('/api/usuarios/logout', { method: 'POST' });
    window.location.reload();
  } catch {
    avisar(mensajeLogin, 'No se pudo cerrar la sesión. Inténtalo de nuevo.', true);
  }
});

// ---- Estado del sitio, aviso del administrador y estadísticas ----
async function comprobarConexion() {
  const estado = $('#estado-sitio');
  try {
    const { ok } = await api('/api/health');
    estado.textContent = ok ? 'Conexión MySQL OK' : 'MySQL no disponible';
    estado.classList.toggle('caido', !ok);
  } catch {
    estado.textContent = 'Sin conexión';
    estado.classList.add('caido');
  }
}

async function cargarAviso() {
  const aviso = await api('/api/mensaje-lateral').catch(() => null);
  if (!aviso) return;
  $('#aviso-admin-texto').textContent = aviso.contenido;
  $('#aviso-admin').hidden = false;
}

async function cargarEstadisticas() {
  if (document.hidden) return;
  try {
    const { resenas } = await api('/api/estadisticas');
    $('#stat-resenas').textContent = formatearCantidad(resenas);
    $('#stat-resenas').title = `${resenas.toLocaleString('es-ES')} reseñas`;
  } catch {
    // Se mantiene el último valor mostrado.
  }
}

// ---- Chat de la portada ----
const chat = $('#mensaje-lateral');
const chatMensajes = $('#chat-mensajes');
const chatForm = $('#chat-form');
let actualizandoChat = false;

async function cargarChat() {
  try {
    const mensajes = await api('/api/chat');
    chatMensajes.replaceChildren(...mensajes.map(mensaje => {
      const elemento = crear('article', { clase: 'chat-mensaje' }, [
        crear('strong', {}, [enlacePerfil(mensaje.usuario)]),
        crear('p', { texto: mensaje.contenido })
      ]);
      elemento.style.setProperty('--usuario-color', colorDeUsuario(mensaje.usuario));
      return elemento;
    }));
    if (window.innerWidth > 800) chat.hidden = false;
  } catch (error) {
    // Se muestra el motivo (p. ej. cifrado sin configurar) en vez de ocultar el chat sin más.
    chatMensajes.replaceChildren(crear('p', { clase: 'auth-message error', texto: error.message }));
  }
}

async function actualizarChat() {
  if (actualizandoChat || document.hidden) return;
  actualizandoChat = true;
  try {
    await cargarChat();
  } finally {
    actualizandoChat = false;
  }
}

function cerrarChat() {
  document.body.classList.remove('chat-abierto');
  chat.hidden = true;
}

$('#chat-toggle').addEventListener('click', () => {
  chat.hidden = false;
  document.body.classList.add('chat-abierto');
  window.history.pushState({ chat: true }, '', window.location.href);
});
$('#chat-cerrar').addEventListener('click', cerrarChat);
window.addEventListener('popstate', cerrarChat);

chatForm.addEventListener('submit', async evento => {
  evento.preventDefault();
  const aviso = $('#chat-mensaje');
  avisar(aviso, '');
  try {
    await api('/api/chat', { metodo: 'POST', datos: { contenido: chatForm.contenido.value } });
    chatForm.reset();
    await cargarChat();
  } catch (error) {
    avisar(aviso, error.message, true);
  }
});

// ---- Últimas reseñas ----
async function cargarResenas() {
  const lista = $('#comment-list');
  try {
    const resenas = await api('/api/resenas');
    if (!resenas.length) {
      lista.replaceChildren(crear('p', { clase: 'status', texto: 'Todavía no hay comentarios. ¡Publica el primero!' }));
      return;
    }
    lista.replaceChildren(...resenas.map(resena => {
      const juego = resena.juego.nombre
        ? crear('a', { clase: 'game-tag', href: `/juego.html?id=${resena.juego.id}`, texto: resena.juego.nombre })
        : crear('span', { clase: 'game-tag', texto: 'Juego' });
      const articulo = crear('article', { clase: 'comment' }, [
        crear('div', { clase: 'comment-header' }, [
          crear('div', { clase: 'user' }, [avatar(resena.usuario), enlacePerfil(resena.usuario, 'username')]),
          juego
        ]),
        crear('p', { texto: resena.contenido }),
        crear('small', { clase: 'comment-date', texto: fecha(resena.creado_en) })
      ]);
      articulo.style.setProperty('--usuario-color', colorDeUsuario(resena.usuario));
      return articulo;
    }));
  } catch (error) {
    lista.replaceChildren(crear('p', { clase: 'status', texto: error.message }));
  }
}

// ---- Formulario de reseña con buscador de juegos ----
// Vacío muestra los juegos reseñados hace poco; al escribir busca en IGDB. El juego se elige de la lista.
const formularioResena = $('#form-comentario');
const entradaJuego = $('#juego-comentario');
const listaSugerencias = $('#sugerencias-juego');
let juegoElegido = null; // { id, nombre }
let sugerencias = [];
let indiceActivo = -1;
let temporizadorBusqueda = null;
let busquedaActual = 0;
let juegosRecientes = null;

function cerrarSugerencias() {
  listaSugerencias.hidden = true;
  entradaJuego.setAttribute('aria-expanded', 'false');
  entradaJuego.removeAttribute('aria-activedescendant');
  indiceActivo = -1;
}

function mostrarSugerencias(titulo, juegos) {
  sugerencias = juegos;
  indiceActivo = -1;
  listaSugerencias.replaceChildren();
  if (titulo) listaSugerencias.append(crear('li', { clase: 'sugerencias-titulo', texto: titulo, role: 'presentation' }));
  juegos.forEach((juego, indice) => {
    const opcion = crear('li', {
      clase: 'sugerencia-juego', texto: juego.nombre, id: `sugerencia-juego-${indice}`, role: 'option', 'aria-selected': 'false'
    });
    if (juego.anio && juego.anio !== 'N/D') opcion.append(crear('span', { clase: 'sugerencia-anio', texto: ` (${juego.anio})` }));
    // mousedown en vez de click: se elige antes de que el campo pierda el foco.
    opcion.addEventListener('mousedown', evento => {
      evento.preventDefault();
      elegirJuego(indice);
    });
    listaSugerencias.append(opcion);
  });
  const abierta = listaSugerencias.childElementCount > 0;
  listaSugerencias.hidden = !abierta;
  entradaJuego.setAttribute('aria-expanded', String(abierta));
}

function elegirJuego(indice) {
  const juego = sugerencias[indice];
  if (!juego) return;
  entradaJuego.value = juego.nombre;
  juegoElegido = { id: juego.id, nombre: juego.nombre };
  cerrarSugerencias();
}

function marcarActivo(indice) {
  const opciones = listaSugerencias.querySelectorAll('[role="option"]');
  if (!opciones.length) return;
  indiceActivo = (indice + opciones.length) % opciones.length;
  opciones.forEach((opcion, i) => opcion.setAttribute('aria-selected', String(i === indiceActivo)));
  entradaJuego.setAttribute('aria-activedescendant', opciones[indiceActivo].id);
  opciones[indiceActivo].scrollIntoView({ block: 'nearest' });
}

async function mostrarJuegosRecientes() {
  try {
    juegosRecientes ??= await api('/api/juegos/recientes');
    if (entradaJuego.value.trim() === '' && document.activeElement === entradaJuego) {
      mostrarSugerencias(juegosRecientes.length ? 'Reseñados recientemente' : '', juegosRecientes);
    }
  } catch {
    // Sin recientes, se puede buscar escribiendo.
  }
}

async function buscarJuegos(texto) {
  const numero = ++busquedaActual;
  mostrarSugerencias('Buscando...', []);
  try {
    const juegos = await api(`/api/juegos/buscar?q=${encodeURIComponent(texto)}`);
    if (numero !== busquedaActual) return; // ya hay una búsqueda más nueva
    const opciones = juegos.slice(0, 8).map(juego => ({ id: juego.id, nombre: juego.name, anio: juego.released }));
    mostrarSugerencias(opciones.length ? '' : 'Sin resultados', opciones);
  } catch {
    if (numero === busquedaActual) mostrarSugerencias('No se pudo buscar ahora mismo', []);
  }
}

entradaJuego.addEventListener('input', () => {
  juegoElegido = null;
  clearTimeout(temporizadorBusqueda);
  const texto = entradaJuego.value.trim();
  if (texto === '') {
    busquedaActual++;
    mostrarJuegosRecientes();
  } else if (texto.length < 2) {
    cerrarSugerencias();
  } else {
    temporizadorBusqueda = setTimeout(() => buscarJuegos(texto), 300);
  }
});
entradaJuego.addEventListener('focus', () => {
  if (entradaJuego.value.trim() === '') mostrarJuegosRecientes();
});
entradaJuego.addEventListener('blur', cerrarSugerencias);
entradaJuego.addEventListener('keydown', evento => {
  if (listaSugerencias.hidden) return;
  if (evento.key === 'ArrowDown') {
    evento.preventDefault();
    marcarActivo(indiceActivo + 1);
  } else if (evento.key === 'ArrowUp') {
    evento.preventDefault();
    marcarActivo(indiceActivo - 1);
  } else if (evento.key === 'Enter' && indiceActivo >= 0) {
    evento.preventDefault();
    elegirJuego(indiceActivo);
  } else if (evento.key === 'Escape') {
    cerrarSugerencias();
  }
});

formularioResena.addEventListener('submit', async evento => {
  evento.preventDefault();
  const aviso = $('#comentario-mensaje');
  if (!juegoElegido || entradaJuego.value.trim() !== juegoElegido.nombre) {
    avisar(aviso, 'Elige el juego de la lista de sugerencias.', true);
    entradaJuego.focus();
    return;
  }
  avisar(aviso, 'Publicando...');
  try {
    await api('/api/resenas', { metodo: 'POST', datos: { juegoId: juegoElegido.id, contenido: formularioResena.contenido.value } });
    formularioResena.reset();
    juegoElegido = null;
    juegosRecientes = null; // la reseña nueva cambia la lista de recientes
    avisar(aviso, 'Comentario publicado. También aparece en la ficha del juego.');
    await Promise.all([cargarResenas(), cargarEstadisticas()]);
  } catch (error) {
    avisar(aviso, error.message, true);
  }
});

comprobarSesion().finally(() => document.body.classList.remove('comprobando'));
