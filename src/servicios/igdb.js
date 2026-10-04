// Cliente de IGDB (la base de datos de juegos de Twitch).
// - El token de Twitch se reutiliza hasta que caduca, y nunca se piden dos a la vez.
// - Los juegos se guardan en caché 24 horas: una biblioteca o un perfil ya visitados no esperan a IGDB.
// - Toda llamada tiene un tiempo máximo, para que un IGDB colgado no deje peticiones esperando.
const config = require('../config');

const tiempoMaximoMs = 8000;
const duracionCacheMs = 24 * 60 * 60 * 1000;
const maximoEnCache = 5000;
const campos = 'name, first_release_date, rating, cover.image_id, summary';

let token = null;
let tokenCaducaEn = 0;
let tokenEnCurso = null;
const cache = new Map(); // id -> { juego, caducaEn }

async function pedirToken() {
  const { clientId, clientSecret } = config.igdb;
  if (!clientId || !clientSecret) throw new Error('Faltan IGDB_CLIENT_ID o IGDB_CLIENT_SECRET en .env');

  const respuesta = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: 'client_credentials' }),
    signal: AbortSignal.timeout(tiempoMaximoMs)
  });
  if (!respuesta.ok) throw new Error(`Twitch respondió ${respuesta.status} al pedir el token.`);
  const datos = await respuesta.json();
  token = datos.access_token;
  tokenCaducaEn = Date.now() + (datos.expires_in - 60) * 1000;
  return token;
}

async function obtenerToken() {
  if (token && Date.now() < tokenCaducaEn) return token;
  tokenEnCurso ??= pedirToken().finally(() => { tokenEnCurso = null; });
  return tokenEnCurso;
}

async function consultar(cuerpo) {
  const respuesta = await fetch('https://api.igdb.com/v4/games', {
    method: 'POST',
    headers: {
      'Client-ID': config.igdb.clientId,
      Authorization: `Bearer ${await obtenerToken()}`,
      'Content-Type': 'text/plain'
    },
    body: cuerpo,
    signal: AbortSignal.timeout(tiempoMaximoMs)
  });
  if (!respuesta.ok) throw new Error(`IGDB respondió ${respuesta.status}.`);
  return respuesta.json();
}

function formatear(juego) {
  return {
    id: juego.id,
    name: juego.name,
    released: juego.first_release_date
      ? new Date(juego.first_release_date * 1000).getFullYear().toString()
      : 'N/D',
    rating: juego.rating ? (juego.rating / 20).toFixed(1) : 'N/D',
    summary: juego.summary || null,
    background_image: juego.cover?.image_id
      ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${juego.cover.image_id}.jpg`
      : null
  };
}

function guardarEnCache(juego) {
  cache.delete(juego.id);
  cache.set(juego.id, { juego, caducaEn: Date.now() + duracionCacheMs });
  // Si se llena, se descarta lo más antiguo (el Map conserva el orden de inserción).
  while (cache.size > maximoEnCache) cache.delete(cache.keys().next().value);
}

// Devuelve un Map id -> juego. Lo que no está en caché se pide en lotes de 500 (máximo de IGDB).
async function obtenerJuegos(ids) {
  const juegos = new Map();
  const faltan = [];
  for (const id of new Set(ids.map(Number))) {
    if (!Number.isInteger(id) || id < 1) continue;
    const enCache = cache.get(id);
    if (enCache && enCache.caducaEn > Date.now()) juegos.set(id, enCache.juego);
    else faltan.push(id);
  }
  for (let inicio = 0; inicio < faltan.length; inicio += 500) {
    const lote = faltan.slice(inicio, inicio + 500);
    const resultado = await consultar(`fields ${campos}; where id = (${lote.join(',')}); limit ${lote.length};`);
    for (const datos of resultado) {
      const juego = formatear(datos);
      guardarEnCache(juego);
      juegos.set(juego.id, juego);
    }
  }
  return juegos;
}

async function obtenerJuego(id) {
  return (await obtenerJuegos([id])).get(Number(id)) || null;
}

// Búsqueda libre. Se quitan caracteres que romperían la consulta de IGDB.
async function buscar(texto, pagina, porPagina) {
  const termino = String(texto).replace(/[^\p{L}\p{N}\s._:-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 100);
  if (!termino) return null;
  const resultado = await consultar(
    `search "${termino}"; fields ${campos}; limit ${porPagina}; offset ${(pagina - 1) * porPagina};`
  );
  return resultado.map(datos => {
    const juego = formatear(datos);
    guardarEnCache(juego);
    return juego;
  });
}

// Id del juego cuyo nombre coincide exactamente (sin distinguir mayúsculas); si no hay, el primero.
async function buscarIdPorNombre(nombre) {
  const resultados = await buscar(nombre, 1, 20);
  if (!resultados?.length) return null;
  const exacto = resultados.find(juego => juego.name.toLowerCase() === nombre.trim().toLowerCase());
  return (exacto || resultados[0]).id;
}

module.exports = { obtenerJuegos, obtenerJuego, buscar, buscarIdPorNombre };
