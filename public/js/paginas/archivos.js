// Mis archivos: subir, descargar y borrar dentro de la cuota de cada usuario.
import { api, crear, avisar, formatearBytes, plural } from '../comun.js';

const entradaArchivo = document.querySelector('#archivo-input');
const lista = document.querySelector('#archivos-lista');
const mensaje = document.querySelector('#mensaje-archivo');
let espacioDisponibleBytes = Infinity;

const iconoArchivo = nombre => (nombre.includes('.') ? nombre.split('.').pop().toUpperCase() : 'FILE').slice(0, 4);

function crearFila(archivo) {
  const borrar = crear('button', { clase: 'btn danger', type: 'button', texto: 'Borrar' });
  borrar.addEventListener('click', async () => {
    if (!window.confirm(`¿Borrar “${archivo.nombre_original}”?`)) return;
    try {
      await api(`/api/archivos/${archivo.id}`, { metodo: 'DELETE' });
      await cargarArchivos();
    } catch (error) {
      avisar(mensaje, error.message, true);
    }
  });
  return crear('article', { clase: 'archivo-fila' }, [
    crear('span', { clase: 'archivo-icono', texto: iconoArchivo(archivo.nombre_original) }),
    crear('strong', { texto: archivo.nombre_original }),
    crear('span', { texto: archivo.mime_type }),
    crear('span', { texto: formatearBytes(Number(archivo.tamano_bytes)) }),
    crear('div', { clase: 'archivo-acciones' }, [
      crear('a', { clase: 'btn secondary', href: `/api/archivos/${archivo.id}/descargar`, texto: 'Descargar', download: '' }),
      borrar
    ])
  ]);
}

async function cargarArchivos() {
  const datos = await api('/api/archivos');
  espacioDisponibleBytes = datos.cuotaBytes - datos.usadosBytes;
  document.querySelector('#cuota-texto').textContent = `${formatearBytes(datos.usadosBytes)} de ${formatearBytes(datos.cuotaBytes)}`;
  document.querySelector('#cuota-progreso').style.width = `${Math.min(100, datos.usadosBytes / datos.cuotaBytes * 100)}%`;
  document.querySelector('#contador-archivos').textContent = plural(datos.archivos.length, 'elemento', 'elementos');
  lista.replaceChildren(...(datos.archivos.length
    ? datos.archivos.map(crearFila)
    : [crear('p', { clase: 'explorador-vacio', texto: 'Esta carpeta está vacía. Pulsa “Subir archivo” para empezar.' })]));
}

entradaArchivo.addEventListener('change', async () => {
  const archivo = entradaArchivo.files[0];
  if (!archivo) return;
  if (archivo.size > espacioDisponibleBytes) {
    avisar(mensaje, `${archivo.name} no cabe en tu cuota: te quedan ${formatearBytes(Math.max(0, espacioDisponibleBytes))}.`, true);
    entradaArchivo.value = '';
    return;
  }
  const datos = new FormData();
  datos.append('archivo', archivo);
  avisar(mensaje, `Subiendo ${archivo.name}...`);
  entradaArchivo.disabled = true;
  try {
    await api('/api/archivos', { metodo: 'POST', cuerpo: datos });
    avisar(mensaje, 'Archivo subido correctamente.');
    await cargarArchivos();
  } catch (error) {
    avisar(mensaje, error.message, true);
  } finally {
    entradaArchivo.value = '';
    entradaArchivo.disabled = false;
  }
});

cargarArchivos().catch(error => avisar(mensaje, error.message, true));
