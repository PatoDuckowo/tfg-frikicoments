# Guía rápida: cómo solucionar que una página siga mostrando CSS/HTML antiguos

## Síntoma
La web sigue mostrando estilos viejos, aunque ya hemos editado el CSS o el HTML localmente.

Ejemplo típico:
- un botón debería estar rojo, pero sigue azul
- un cambio visual no aparece aunque el código ya está actualizado

## Causa más frecuente
Es un problema de caché del navegador o del servidor.

El navegador guarda versiones antiguas de CSS, HTML o assets y las reutiliza sin recargarlas.

## Qué comprobar primero
1. Revisa si el archivo local realmente tiene el cambio.
2. Abre la herramienta de desarrollo del navegador.
3. Comprueba si la hoja CSS cargada tiene la versión nueva o una vieja.
4. En la pestaña Network, activa "Disable cache".
5. Recarga la página con Ctrl + F5.

## Soluciones rápidas

### 1) Recarga forzada del navegador
- Windows: Ctrl + F5
- o abre la página en modo incógnito

### 2) Desactivar caché en DevTools
1. Abre F12
2. Ve a Network
3. Marca "Disable cache"
4. Recarga la página

### 3) Añadir versión al archivo CSS
Cuando el navegador cachea los archivos, añadir un parámetro de versión ayuda mucho:

```html
<link rel="stylesheet" href="/css/styles.css?v=20260831-1">
```

Esto fuerza al navegador a cargar una versión nueva.

### 4) Añadir cabeceras de no-cache en el servidor
En Express (Node.js), por ejemplo:

```js
app.get('/resultados', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.sendFile(path.join(__dirname, 'public', 'resultados.html'));
});

app.use(express.static(path.join(__dirname, 'public'), {
  index: false,
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  }
}));
```

### 5) Reiniciar el servidor o desplegar nuevamente
Si la versión remota sigue mostrando estilos viejos, es posible que el servidor siga sirviendo la versión anterior.

Haz lo siguiente:
- reinicia el backend
- vuelve a desplegar la app
- limpia caché del navegador

## Diagnóstico útil
En el navegador puedes inspeccionar el enlace CSS y ver la URL exacta que está cargando.

Si la ruta es:

```text
/css/styles.css
```

pero sin versión nueva, es probable que el navegador esté sirviendo una copia antigua.

## Regla práctica
Cuando cambies CSS/HTML y sigan apareciendo viejos:

1. recarga forzada
2. desactiva caché
3. añade query string o versión
4. desactiva caché en el servidor
5. reinicia app

## Ejemplo de referencia
Este patrón suele funcionar bien:

```html
<link rel="stylesheet" href="/css/styles.css?v=20260831-1">
```

```css
header .btn-volver,
header .btn-volver:visited {
  color: #d12237 !important;
}
```

## Resumen
Si el navegador todavía muestra el color antiguo, no se trata del selector, sino de una copia en caché.

La solución más efectiva suele ser combinar:
- versión en el archivo CSS
- cabeceras no-cache
- recarga forzada
- reinicio del servidor

## Nota final
Este problema es muy común en frontend y no significa que el código esté mal escrito. Lo normal es que el navegador o el servidor reutilicen contenidos antiguos.
