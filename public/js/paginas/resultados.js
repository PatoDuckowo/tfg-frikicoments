// Resultados de búsqueda en IGDB, de 12 en 12.
import { api, crear, tarjetaJuego } from '../comun.js';

const parametros = new URLSearchParams(window.location.search);
const busqueda = parametros.get('q') || '';
const pagina = Math.max(1, Number.parseInt(parametros.get('page'), 10) || 1);
const grid = document.querySelector('#grid-juegos');
const anterior = document.querySelector('#btn-prev');
const siguiente = document.querySelector('#btn-next');

document.querySelector('#query-title').textContent = busqueda ? `"${busqueda}"` : '(vacío)';
document.querySelector('#num-pagina').textContent = `Página ${pagina}`;
const irAPagina = numero => { window.location.href = `/resultados?q=${encodeURIComponent(busqueda)}&page=${numero}`; };
anterior.disabled = pagina <= 1;
anterior.addEventListener('click', () => irAPagina(pagina - 1));
siguiente.addEventListener('click', () => irAPagina(pagina + 1));

function mostrarMensaje(texto, esError = false) {
  grid.replaceChildren(crear('p', { clase: esError ? 'status-msg error' : 'status-msg', texto }));
}

async function cargarResultados() {
  if (!busqueda) {
    mostrarMensaje('No se especificó ningún término de búsqueda.');
    anterior.disabled = siguiente.disabled = true;
    return;
  }
  try {
    const juegos = await api(`/api/juegos/buscar?q=${encodeURIComponent(busqueda)}&page=${pagina}`);
    siguiente.disabled = juegos.length < 12;
    if (!juegos.length) {
      mostrarMensaje('No se encontraron más resultados.');
      return;
    }
    grid.replaceChildren(...juegos.map(juego => tarjetaJuego(juego, `${juego.released} · ★ ${juego.rating}`)));
  } catch (error) {
    mostrarMensaje(`Error al cargar resultados: ${error.message}`, true);
  }
}

cargarResultados();
