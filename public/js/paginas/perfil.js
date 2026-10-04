// Personas y perfiles.
// Sin ?u=: lista de la comunidad con botón de seguir.
// Con ?u=nombre: perfil con sus juegos (me gusta y pendientes); en el propio, también la configuración.
import { api, crear, avisar, plural, avatar, rutaPerfil, tarjetaJuego } from '../comun.js';

const $ = selector => document.querySelector(selector);
const mensaje = $('#mensaje');
const nombrePerfil = new URLSearchParams(window.location.search).get('u');
let perfil = null;
let listaActiva = 'meGusta';

function etiquetaRelacion(relacion) {
  const texto = relacion.mutuo ? 'Os seguís' : relacion.meSigue ? 'Te sigue' : relacion.loSigo ? 'Le sigues' : '';
  return texto ? crear('span', { clase: relacion.mutuo ? 'relacion mutua' : 'relacion', texto }) : null;
}

// Botón Seguir / Dejar de seguir. Al cambiar, llama a alCambiar con la relación nueva.
function botonSeguir(usuarioId, relacion, alCambiar) {
  const boton = crear('button', {
    type: 'button',
    clase: relacion.loSigo ? 'btn secondary' : 'btn primary',
    texto: relacion.loSigo ? 'Dejar de seguir' : 'Seguir'
  });
  boton.addEventListener('click', async () => {
    boton.disabled = true;
    avisar(mensaje, '');
    try {
      const datos = await api(`/api/usuarios/${usuarioId}/seguir`, { metodo: 'PUT', datos: { seguir: !relacion.loSigo } });
      alCambiar(datos.relacion);
    } catch (error) {
      avisar(mensaje, error.message, true);
      boton.disabled = false;
    }
  });
  return boton;
}

const botonChat = usuarioId => crear('a', { clase: 'btn secondary', href: `/usuarios/mensajes.html?con=${usuarioId}`, texto: 'Abrir chat' });

// ---- Listado de personas ----
function crearPersona(persona) {
  const fila = crear('article', { clase: 'persona' });
  const acciones = crear('div', { clase: 'perfil-acciones' }, [
    botonSeguir(persona.id, persona, nueva => {
      Object.assign(persona, nueva);
      fila.replaceWith(crearPersona(persona));
    })
  ]);
  if (persona.mutuo) acciones.append(botonChat(persona.id));
  const info = crear('div', { clase: 'persona-info' }, [
    crear('a', { clase: 'enlace-perfil persona-nombre', href: rutaPerfil(persona.usuario), texto: persona.usuario })
  ]);
  const relacion = etiquetaRelacion(persona);
  if (relacion) info.append(relacion);
  fila.append(info, acciones);
  return fila;
}

async function cargarPersonas() {
  const personas = await api('/api/personas');
  $('#lista-personas').replaceChildren(...(personas.length
    ? personas.map(crearPersona)
    : [crear('p', { clase: 'admin-ayuda', texto: 'Todavía no hay más personas en la comunidad.' })]));
  $('#seccion-personas').hidden = false;
}

// ---- Perfil de una persona ----
function pintarCabecera() {
  // Hoy el avatar es la inicial; aquí se mostrará el icono de perfil.
  const nuevoAvatar = avatar(perfil.usuario, 'perfil-avatar');
  nuevoAvatar.id = 'perfil-avatar';
  $('#perfil-avatar').replaceWith(nuevoAvatar);
  $('#perfil-nombre').textContent = perfil.usuario;
  $('#perfil-datos').textContent = [
    plural(perfil.seguidores, 'seguidor', 'seguidores'),
    `Sigue a ${perfil.siguiendo}`,
    `${perfil.meGusta.length} me gusta`,
    plural(perfil.pendientes.length, 'pendiente', 'pendientes')
  ].join(' · ');

  const acciones = $('#perfil-acciones');
  acciones.replaceChildren();
  if (perfil.esPropio) {
    acciones.append(crear('span', { clase: 'relacion', texto: 'Este es tu perfil' }));
    return;
  }
  const relacion = etiquetaRelacion(perfil.relacion);
  if (relacion) acciones.append(relacion);
  acciones.append(botonSeguir(perfil.id, perfil.relacion, async () => {
    // Cambian los contadores de seguidores: se vuelve a pedir el perfil.
    perfil = await api(`/api/perfiles/${encodeURIComponent(perfil.usuario)}`);
    pintarCabecera();
  }));
  if (perfil.relacion.mutuo) acciones.append(botonChat(perfil.id));
}

function pintarJuegos() {
  const juegos = perfil[listaActiva];
  const vacio = perfil.esPropio
    ? { meGusta: 'Todavía no has marcado ningún juego con me gusta.', pendientes: 'No tienes juegos pendientes.' }
    : { meGusta: 'Todavía no ha marcado ningún juego con me gusta.', pendientes: 'No tiene juegos pendientes.' };
  $('#juegos').replaceChildren(...(juegos.length
    ? juegos.map(juego => tarjetaJuego(juego, juego.released !== 'N/D' ? juego.released : null))
    : [crear('p', { clase: 'status-msg', texto: perfil.avisoJuegos || vacio[listaActiva] })]));
}

document.querySelectorAll('[data-lista]').forEach(boton => {
  boton.addEventListener('click', () => {
    listaActiva = boton.dataset.lista;
    document.querySelectorAll('[data-lista]').forEach(otro => otro.setAttribute('aria-pressed', String(otro === boton)));
    pintarJuegos();
  });
});

async function cargarPerfil() {
  perfil = await api(`/api/perfiles/${encodeURIComponent(nombrePerfil)}`);
  document.title = `${perfil.usuario} - Frikicoments`;
  $('#titulo').textContent = perfil.esPropio ? 'Mi perfil' : 'Perfil';
  $('#descripcion').textContent = perfil.esPropio
    ? 'Así ven los demás tus juegos con me gusta y pendientes.'
    : 'Sus juegos con me gusta y pendientes.';
  pintarCabecera();
  pintarJuegos();
  $('#seccion-perfil').hidden = false;
  $('#seccion-juegos').hidden = false;
  if (perfil.esPropio) {
    $('#form-nombre').nombre_usuario.value = perfil.usuario;
    $('#seccion-configuracion').hidden = false;
  }
}

// ---- Configuración (solo en el propio perfil) ----
const formularioNombre = $('#form-nombre');
formularioNombre.addEventListener('submit', async evento => {
  evento.preventDefault();
  const aviso = $('#mensaje-configuracion');
  const boton = formularioNombre.querySelector('button');
  boton.disabled = true;
  avisar(aviso, '');
  try {
    const datos = await api('/api/usuarios/nombre', { metodo: 'PATCH', datos: { nombre_usuario: formularioNombre.nombre_usuario.value.trim() } });
    perfil.usuario = datos.usuario;
    window.history.replaceState(null, '', rutaPerfil(datos.usuario));
    document.title = `${datos.usuario} - Frikicoments`;
    pintarCabecera();
    avisar(aviso, `Nombre cambiado. A partir de ahora inicias sesión como ${datos.usuario}.`);
  } catch (error) {
    avisar(aviso, error.message, true);
  } finally {
    boton.disabled = false;
  }
});

(nombrePerfil ? cargarPerfil() : cargarPersonas()).catch(error => avisar(mensaje, error.message, true));
