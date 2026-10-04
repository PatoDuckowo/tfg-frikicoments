// Mi biblioteca: juegos guardados, con me gusta o con estado, en el orden que elija el usuario
// (arrastrando las carátulas o con los botones < >).
import { api, crear, avisar, caratulaPorDefecto } from '../comun.js';

const lista = document.querySelector('#lista');
const mensaje = document.querySelector('#mensaje');
let biblioteca = [];
let filtro = 'todos';
let arrastrado = null;
let temporizadorGuardado = null;

const elementosVisibles = () => biblioteca.filter(item => filtro === 'todos' || Boolean(item[filtro]));

// Mueve un juego delante o detrás de otro. Se trabaja sobre la lista completa,
// así el orden se mantiene aunque haya un filtro activo.
function mover(juegoId, referenciaId, despues) {
  if (juegoId === referenciaId) return;
  const [elemento] = biblioteca.splice(biblioteca.findIndex(item => item.juego_id === juegoId), 1);
  const destino = biblioteca.findIndex(item => item.juego_id === referenciaId) + (despues ? 1 : 0);
  biblioteca.splice(destino, 0, elemento);
  pintar(juegoId);
  avisar(mensaje, 'Guardando orden...');
  clearTimeout(temporizadorGuardado);
  temporizadorGuardado = setTimeout(guardarOrden, 600);
}

async function guardarOrden() {
  try {
    await api('/api/mi-biblioteca/orden', { metodo: 'PUT', datos: { juegos: biblioteca.map(item => item.juego_id) } });
    avisar(mensaje, 'Orden guardado.');
  } catch (error) {
    avisar(mensaje, error.message, true);
  }
}

function botonMover(texto, etiqueta, desactivado, alPulsar) {
  const boton = crear('button', { type: 'button', clase: 'btn mover-juego', texto, 'aria-label': etiqueta, disabled: desactivado });
  boton.addEventListener('click', evento => {
    evento.stopPropagation(); // que no abra la ficha del juego
    alPulsar();
  });
  return boton;
}

function limpiarMarcas() {
  lista.querySelectorAll('.soltar-antes, .soltar-despues').forEach(tarjeta => tarjeta.classList.remove('soltar-antes', 'soltar-despues'));
}

function crearTarjeta(item, anterior, siguiente) {
  const juego = item.juego;
  const detalle = item.estado ? `Estado: ${item.estado}` : (item.me_gusta ? 'Me gusta' : 'Guardado');
  const tarjeta = crear('article', { clase: 'card juego-card', draggable: true, 'data-juego-id': item.juego_id }, [
    crear('div', { clase: 'card-cover' }, [
      crear('img', { src: juego.background_image || caratulaPorDefecto, alt: juego.name, draggable: false })
    ]),
    crear('div', { clase: 'card-body' }, [
      crear('div', { clase: 'card-title', texto: juego.name }),
      crear('div', { clase: 'card-meta', texto: detalle }),
      crear('div', { clase: 'controles-orden' }, [
        botonMover('<', `Mover ${juego.name} antes`, !anterior, () => mover(item.juego_id, anterior.juego_id, false)),
        botonMover('>', `Mover ${juego.name} después`, !siguiente, () => mover(item.juego_id, siguiente.juego_id, true))
      ])
    ])
  ]);

  tarjeta.addEventListener('click', () => { window.location.href = `/juego.html?id=${juego.id}`; });
  tarjeta.addEventListener('dragstart', evento => {
    arrastrado = item.juego_id;
    evento.dataTransfer.effectAllowed = 'move';
    evento.dataTransfer.setData('text/plain', String(item.juego_id));
    tarjeta.classList.add('arrastrando');
  });
  tarjeta.addEventListener('dragend', () => {
    arrastrado = null;
    tarjeta.classList.remove('arrastrando');
    limpiarMarcas();
  });
  tarjeta.addEventListener('dragover', evento => {
    if (arrastrado === null || arrastrado === item.juego_id) return;
    evento.preventDefault();
    const caja = tarjeta.getBoundingClientRect();
    limpiarMarcas();
    tarjeta.classList.add(evento.clientX > caja.left + caja.width / 2 ? 'soltar-despues' : 'soltar-antes');
  });
  tarjeta.addEventListener('drop', evento => {
    evento.preventDefault();
    if (arrastrado !== null) mover(arrastrado, item.juego_id, tarjeta.classList.contains('soltar-despues'));
  });
  return tarjeta;
}

function pintar(enfocarId) {
  const elementos = elementosVisibles();
  if (!elementos.length) {
    lista.replaceChildren(crear('p', { clase: 'status-msg', texto: 'No hay juegos en esta sección.' }));
    return;
  }
  lista.replaceChildren(...elementos.map((item, i) => crearTarjeta(item, elementos[i - 1], elementos[i + 1])));
  // Tras mover con los botones, el foco sigue en la tarjeta movida.
  if (enfocarId !== undefined) lista.querySelector(`[data-juego-id="${enfocarId}"] .mover-juego:not(:disabled)`)?.focus();
}

document.querySelectorAll('[data-filtro]').forEach(boton => {
  boton.addEventListener('click', () => {
    filtro = boton.dataset.filtro;
    document.querySelectorAll('[data-filtro]').forEach(otro => otro.setAttribute('aria-pressed', String(otro === boton)));
    pintar();
  });
});

try {
  biblioteca = await api('/api/mi-biblioteca');
  pintar();
} catch (error) {
  avisar(mensaje, error.message, true);
}
