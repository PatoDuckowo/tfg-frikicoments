// Utilidades compartidas por todas las páginas (módulo ES).
// Al importarlo también pinta el menú de la cabecera y el aviso de mensajes sin leer.

// ---- Peticiones a la API ----

// Llama a la API y devuelve el JSON. Si la respuesta es un error, lanza Error con el mensaje del servidor.
// Sin sesión (401) lleva a la portada, salvo que se pida lo contrario.
export async function api(url, { metodo = 'GET', datos, cuerpo, redirigirSinSesion = true } = {}) {
  const opciones = { method: metodo, headers: {} };
  if (datos !== undefined) {
    opciones.headers['Content-Type'] = 'application/json';
    opciones.body = JSON.stringify(datos);
  } else if (cuerpo !== undefined) {
    opciones.body = cuerpo; // FormData, por ejemplo
  }
  const respuesta = await fetch(url, opciones);
  const json = await respuesta.json().catch(() => ({}));
  if (respuesta.status === 401 && redirigirSinSesion) window.location.href = '/';
  if (!respuesta.ok) {
    const error = new Error(json.error || 'Algo ha fallado. Inténtalo de nuevo.');
    error.estado = respuesta.status;
    throw error;
  }
  return json;
}

// ---- Construcción del DOM ----

// crear('a', { clase: 'btn', texto: 'Hola', href: '/' }, [hijos...])
export function crear(etiqueta, { clase, texto, ...atributos } = {}, hijos = []) {
  const elemento = document.createElement(etiqueta);
  if (clase) elemento.className = clase;
  if (texto !== undefined && texto !== null) elemento.textContent = texto;
  for (const [nombre, valor] of Object.entries(atributos)) {
    if (valor === undefined || valor === null) continue;
    // Booleanos y números como propiedad (draggable, disabled, tabIndex...); el resto como atributo.
    if (typeof valor !== 'string' && nombre in elemento) elemento[nombre] = valor;
    else if (valor !== false) elemento.setAttribute(nombre, valor === true ? '' : valor);
  }
  elemento.append(...hijos);
  return elemento;
}

// Mensaje de estado bajo un formulario (role="status"): normal o de error.
export function avisar(elemento, texto, esError = false) {
  elemento.textContent = texto;
  elemento.classList.toggle('error', esError);
}

// ---- Formatos ----

export const fecha = valor => new Date(valor).toLocaleString('es-ES');

export function formatearBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const unidades = ['KB', 'MB', 'GB'];
  let valor = bytes;
  let unidad = -1;
  do {
    valor /= 1024;
    unidad += 1;
  } while (valor >= 1024 && unidad < unidades.length - 1);
  return `${valor.toFixed(valor >= 10 ? 0 : 1)} ${unidades[unidad]}`;
}

// 950 -> "950", 12400 -> "12.4k", 1500000 -> "1.5M"
export function formatearCantidad(numero) {
  if (numero < 1000) return String(numero);
  if (numero < 999950) return `${(numero / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return `${(numero / 1000000).toFixed(1).replace(/\.0$/, '')}M`;
}

export const plural = (cantidad, singular, varios) => `${cantidad} ${cantidad === 1 ? singular : varios}`;

// ---- Usuarios y juegos ----

// Mismo color para el mismo nombre en toda la web.
export function colorDeUsuario(nombre) {
  const colores = ['#8be9fd', '#50fa7b', '#f7d51d', '#ff79c6', '#ffb86c', '#bd93f9'];
  let hash = 0;
  for (let i = 0; i < nombre.length; i++) hash = (hash * 31 + nombre.charCodeAt(i)) >>> 0;
  return colores[hash % colores.length];
}

export const rutaPerfil = nombre => `/usuarios/perfil.html?u=${encodeURIComponent(nombre)}`;

export function enlacePerfil(nombre, clase = '') {
  return crear('a', { clase: `enlace-perfil ${clase}`.trim(), href: rutaPerfil(nombre), texto: nombre });
}

// Avatar de usuario. Hoy es la inicial con su color; aquí se pondrá el icono de perfil.
export function avatar(nombre, clase = '') {
  const elemento = crear('div', { clase: `avatar ${clase}`.trim(), texto: nombre.slice(0, 1).toUpperCase(), 'aria-hidden': 'true' });
  elemento.style.setProperty('--usuario-color', colorDeUsuario(nombre));
  return elemento;
}

export const caratulaPorDefecto = '/img/sin-caratula.svg';

// Tarjeta de juego con carátula que lleva a su ficha. `detalle` es la línea bajo el título.
export function tarjetaJuego(juego, detalle) {
  const imagen = crear('img', { src: juego.background_image || caratulaPorDefecto, alt: juego.name, loading: 'lazy', draggable: false });
  const cuerpo = crear('div', { clase: 'card-body' }, [crear('div', { clase: 'card-title', texto: juego.name, title: juego.name })]);
  if (detalle) cuerpo.append(crear('div', { clase: 'card-meta', texto: detalle }));
  return crear('a', { clase: 'card juego-card', href: `/juego.html?id=${juego.id}` }, [
    crear('div', { clase: 'card-cover' }, [imagen]),
    cuerpo
  ]);
}

// ---- Menú de la cabecera ----
// <nav class="cabecera-nav" data-menu="biblioteca"> marca la página actual;
// data-menu="publico" deja solo «Portada»; data-volver añade «< Volver» al principio.
const opcionesMenu = [
  ['portada', '/', 'Portada'],
  ['personas', '/usuarios/perfil.html', 'Personas'],
  ['mensajes', '/usuarios/mensajes.html', 'Mensajes'],
  ['biblioteca', '/usuarios/biblioteca.html', 'Mi biblioteca'],
  ['archivos', '/usuarios/archivos.html', 'Mis archivos'],
  ['cuenta', '/usuarios/mi-cuenta.html', 'Mi cuenta']
];

function pintarMenu() {
  const menu = document.querySelector('nav[data-menu]');
  if (!menu) return;
  const actual = menu.dataset.menu;
  const opciones = actual === 'publico' ? opcionesMenu.slice(0, 1) : opcionesMenu;
  if ('volver' in menu.dataset) {
    const volver = crear('a', { clase: 'btn secondary', href: '/', texto: '< Volver' });
    volver.addEventListener('click', evento => {
      if (window.history.length > 1) {
        evento.preventDefault();
        window.history.back();
      }
    });
    menu.append(volver);
  }
  for (const [clave, ruta, texto] of opciones) {
    menu.append(crear('a', { clase: 'btn primary', href: ruta, texto, 'aria-current': clave === actual ? 'page' : null }));
  }
  if (actual !== 'publico') vigilarMensajesSinLeer();
}

// ---- Aviso de mensajes privados sin leer (en el enlace «Mensajes») ----
let temporizadorMensajes = null;

export async function actualizarAvisoMensajes() {
  const enlaces = document.querySelectorAll('a[href="/usuarios/mensajes.html"]');
  if (!enlaces.length || document.hidden) return;
  try {
    const respuesta = await fetch('/api/mensajes/no-leidos');
    if (respuesta.status === 401) {
      clearInterval(temporizadorMensajes); // sin sesión no hay nada que avisar
      return;
    }
    if (!respuesta.ok) return;
    const { total } = await respuesta.json();
    for (const enlace of enlaces) {
      let aviso = enlace.querySelector('.aviso-no-leidos');
      if (!total) {
        aviso?.remove();
        continue;
      }
      aviso ??= enlace.appendChild(crear('span', { clase: 'aviso-no-leidos' }));
      aviso.textContent = total > 99 ? '99+' : String(total);
      aviso.title = plural(total, 'mensaje sin leer', 'mensajes sin leer');
    }
  } catch {
    // Sin conexión: se vuelve a intentar en la siguiente vuelta.
  }
}

export function vigilarMensajesSinLeer() {
  if (temporizadorMensajes) return;
  actualizarAvisoMensajes();
  temporizadorMensajes = setInterval(actualizarAvisoMensajes, 30000);
  document.addEventListener('visibilitychange', actualizarAvisoMensajes);
}

pintarMenu();

// PWA: el service worker permite instalar la web y muestra una página propia sin conexión.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
