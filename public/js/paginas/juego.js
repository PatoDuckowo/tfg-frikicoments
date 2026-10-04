// Ficha de un juego: datos de IGDB, estado y marcadores propios, y reseñas de la comunidad.
import { api, crear, avisar, fecha, colorDeUsuario, enlacePerfil, caratulaPorDefecto, botonBorrarResena } from '../comun.js';

const $ = selector => document.querySelector(selector);
const juegoId = new URLSearchParams(window.location.search).get('id');
const estado = $('#estado-juego');
const botonGuardar = $('#guardar-juego');
const botonMeGusta = $('#me-gusta-juego');
const formulario = $('#form-comentario');
let marcadores = { guardado: false, meGusta: false };

function mostrarResenas(resenas) {
  const lista = $('#lista-comentarios');
  if (!resenas.length) {
    lista.replaceChildren(crear('p', { clase: 'status-msg', texto: 'Todavía no hay comentarios. Sé el primero.' }));
    return;
  }
  lista.replaceChildren(...resenas.map(resena => {
    const articulo = crear('article', { clase: 'comment' }, [
      crear('strong', {}, [enlacePerfil(resena.usuario)]),
      crear('p', { texto: resena.contenido }),
      crear('small', { clase: 'comment-date', texto: fecha(resena.creado_en) })
    ]);
    if (resena.propia) {
      articulo.append(botonBorrarResena(resena, async () => mostrarResenas(await api(`/api/juegos/${juegoId}/resenas`)), $('#mensaje-comentario')));
    }
    articulo.style.setProperty('--usuario-color', colorDeUsuario(resena.usuario));
    return articulo;
  }));
}

function mostrarMarcadores() {
  botonGuardar.textContent = marcadores.guardado ? 'Quitar de guardados' : 'Guardar juego';
  botonMeGusta.textContent = marcadores.meGusta ? 'Quitar me gusta' : 'Me gusta';
}

async function cargar() {
  if (!/^\d+$/.test(juegoId || '')) throw new Error('No se ha indicado un juego válido.');
  const [juego, datosEstado, datosMarcadores, resenas] = await Promise.all([
    api(`/api/juegos/${juegoId}`),
    api(`/api/juegos/${juegoId}/estado`),
    api(`/api/juegos/${juegoId}/marcadores`),
    api(`/api/juegos/${juegoId}/resenas`)
  ]);
  $('#titulo-juego').textContent = juego.name;
  document.title = `${juego.name} - Frikicoments`;
  $('#meta-juego').textContent = `${juego.released} · ★ ${juego.rating}`;
  $('#resumen-juego').textContent = juego.summary || 'IGDB no tiene un resumen disponible para este juego.';
  $('#portada-juego').append(crear('img', { src: juego.background_image || caratulaPorDefecto, alt: `Carátula de ${juego.name}` }));
  estado.value = datosEstado.estado || '';
  marcadores = datosMarcadores;
  mostrarMarcadores();
  mostrarResenas(resenas);
}

async function cambiarMarcador(ruta, campo) {
  const aviso = $('#mensaje-marcadores');
  try {
    const datos = await api(`/api/juegos/${juegoId}/${ruta}`, { metodo: 'PUT', datos: { [campo]: !marcadores[campo] } });
    marcadores[campo] = datos[campo];
    mostrarMarcadores();
    avisar(aviso, 'Guardado.');
  } catch (error) {
    avisar(aviso, error.message, true);
  }
}
botonGuardar.addEventListener('click', () => cambiarMarcador('guardado', 'guardado'));
botonMeGusta.addEventListener('click', () => cambiarMarcador('me-gusta', 'meGusta'));

estado.addEventListener('change', async () => {
  const aviso = $('#mensaje-estado');
  try {
    await api(`/api/juegos/${juegoId}/estado`, { metodo: 'PUT', datos: { estado: estado.value } });
    avisar(aviso, 'Estado guardado.');
  } catch (error) {
    avisar(aviso, error.message, true);
  }
});

formulario.addEventListener('submit', async evento => {
  evento.preventDefault();
  const aviso = $('#mensaje-comentario');
  try {
    await api('/api/resenas', { metodo: 'POST', datos: { juegoId: Number(juegoId), contenido: formulario.contenido.value } });
    formulario.reset();
    avisar(aviso, 'Comentario publicado.');
    mostrarResenas(await api(`/api/juegos/${juegoId}/resenas`));
  } catch (error) {
    avisar(aviso, error.message, true);
  }
});

cargar().catch(error => {
  avisar($('#mensaje-juego'), error.message, true);
  $('#resumen-juego').textContent = '';
});
