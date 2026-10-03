# Comentarios guardados en Node.js y MySQL

Esta guía explica cómo guardar los comentarios que escriben los usuarios en Frikicoments.

La idea principal es sencilla:

```text
Usuario escribe un comentario
        |
        | formulario HTML + JavaScript
        v
API de Node.js / Express
        |
        | valida los datos y ejecuta una consulta
        v
MySQL guarda el comentario
```

## 1. Relación con la guía de usuarios

Esta guía se centra únicamente en los comentarios. La explicación general de Node.js, Express, MySQL, sesiones, contraseñas y la decisión de no usar PHP está en [guia-usuarios-autenticacion-node-mysql.md](guia-usuarios-autenticacion-node-mysql.md).

La regla común es que el navegador habla con la API y la API habla con MySQL. El navegador nunca debe conectarse directamente a la base de datos.

## 2. ¿Dónde se guarda un comentario?

Un comentario debería guardarse en una tabla de MySQL. Una primera versión puede ser esta:

```sql
CREATE TABLE comentarios (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  juego_id INT NOT NULL,
  usuario_id INT UNSIGNED NULL,
  texto TEXT NOT NULL,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_comentarios_usuario
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);
```

### Qué significa cada columna

| Columna | Significado |
|---|---|
| `id` | Identificador único del comentario. MySQL lo genera automáticamente. |
| `juego_id` | Identificador del videojuego al que pertenece el comentario. |
| `usuario_id` | Usuario que escribió el comentario. Puede ser `NULL` mientras no haya login obligatorio. |
| `texto` | Contenido escrito por el usuario. |
| `creado_en` | Fecha y hora de creación. |
| `actualizado_en` | Fecha y hora de la última modificación. |

El `juego_id` debe coincidir con el identificador que devuelve IGDB. Más adelante se podría crear una tabla propia de videojuegos, pero para empezar puede bastar con guardar ese identificador.

## 3. La pantalla HTML

En la página del videojuego habría un formulario parecido a este:

```html
<form id="form-comentario">
  <label for="texto-comentario">Escribe un comentario</label>
  <textarea id="texto-comentario" required></textarea>
  <button type="submit">Publicar comentario</button>
</form>

<section id="lista-comentarios"></section>
```

El formulario solo recoge los datos. No guarda nada por sí mismo y no debe contener una consulta SQL.

El identificador del juego puede estar en la URL, por ejemplo:

```text
/juego.html?id=123
```

En ese caso, JavaScript puede leerlo con `URLSearchParams`.

## 4. JavaScript del navegador

El archivo podría llamarse `public/js/comentarios.js`.

Su trabajo consiste en:

1. Leer el identificador del juego.
2. Detectar el envío del formulario.
3. Enviar el comentario a la API usando `fetch`.
4. Pedir los comentarios existentes.
5. Pintar los comentarios en el HTML.

Ejemplo de publicación:

```js
const parametros = new URLSearchParams(window.location.search);
const juegoId = Number(parametros.get('id'));
const formulario = document.querySelector('#form-comentario');
const campoTexto = document.querySelector('#texto-comentario');

formulario.addEventListener('submit', async (evento) => {
  evento.preventDefault();

  const respuesta = await fetch('/api/comentarios', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      juegoId,
      texto: campoTexto.value
    })
  });

  const resultado = await respuesta.json();

  if (!respuesta.ok) {
    alert(resultado.error);
    return;
  }

  campoTexto.value = '';
  cargarComentarios();
});
```

Este código no inserta directamente en MySQL. Envía una petición HTTP al servidor:

```text
POST /api/comentarios
```

## 5. La ruta de Node.js

La API recibe la petición y decide qué hacer con ella. Una primera versión puede estar en `server.js`:

```js
app.post('/api/comentarios', async (req, res) => {
  const { juegoId, texto } = req.body;

  if (!Number.isInteger(juegoId) || !texto?.trim()) {
    return res.status(400).json({
      error: 'El juego y el texto son obligatorios'
    });
  }

  try {
    const [resultado] = await pool.execute(
      'INSERT INTO comentarios (juego_id, texto) VALUES (?, ?)',
      [juegoId, texto.trim()]
    );

    res.status(201).json({
      id: resultado.insertId,
      mensaje: 'Comentario guardado'
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: 'No se pudo guardar el comentario'
    });
  }
});
```

### Por qué se utiliza `?` en la consulta

La consulta utiliza parámetros:

```js
'INSERT INTO comentarios (juego_id, texto) VALUES (?, ?)',
[juegoId, texto.trim()]
```

Esto es importante porque `mysql2` escapa los valores correctamente y reduce el riesgo de inyección SQL.

No se debe construir una consulta concatenando texto recibido del navegador:

```js
// Incorrecto
`INSERT INTO comentarios (texto) VALUES ('${texto}')`
```

## 6. Obtener los comentarios

Para mostrar los comentarios, la página puede llamar a:

```text
GET /api/comentarios/123
```

La ruta correspondiente sería:

```js
app.get('/api/comentarios/:juegoId', async (req, res) => {
  const juegoId = Number(req.params.juegoId);

  if (!Number.isInteger(juegoId)) {
    return res.status(400).json({ error: 'Identificador no válido' });
  }

  try {
    const [comentarios] = await pool.execute(
      `SELECT id, juego_id, usuario_id, texto, creado_en
       FROM comentarios
       WHERE juego_id = ?
       ORDER BY creado_en DESC`,
      [juegoId]
    );

    res.json(comentarios);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'No se pudieron cargar los comentarios' });
  }
});
```

Después, `comentarios.js` recorrería la respuesta y crearía los elementos visuales para cada comentario.

Al insertar texto recibido del usuario, es preferible usar `textContent`:

```js
const elemento = document.createElement('p');
elemento.textContent = comentario.texto;
```

Esto evita que el contenido del comentario se interprete como HTML.

## 7. Relación con usuarios y sesiones

La creación del login, las sesiones y el middleware `requireAuth` se explica en [guia-usuarios-autenticacion-node-mysql.md](guia-usuarios-autenticacion-node-mysql.md). Aquí solo se muestra cómo afecta al guardado de comentarios.

Mientras no haya usuarios conectados, `usuario_id` puede dejarse como `NULL` durante las primeras pruebas.

Cuando el login esté terminado, el servidor debe obtener el usuario desde la sesión:

```js
const usuarioId = req.session.usuarioId;
```

No se debe confiar en un `usuarioId` enviado libremente por el navegador. Si el navegador pudiera enviar cualquier ID, un usuario podría publicar comentarios haciéndose pasar por otra persona.

La ruta quedaría conceptualmente así:

```js
const usuarioId = req.session.usuarioId;

if (!usuarioId) {
  return res.status(401).json({ error: 'Debes iniciar sesión' });
}
```

Y la inserción incluiría el usuario:

```js
await pool.execute(
  'INSERT INTO comentarios (juego_id, usuario_id, texto) VALUES (?, ?, ?)',
  [juegoId, usuarioId, texto.trim()]
);
```

## 8. Organización recomendada de archivos

Al principio se puede probar todo en `server.js`. Cuando funcione, se puede separar así:

```text
public/
|-- js/
|   `-- comentarios.js
|
routes/
|-- comentarios.js
|
controllers/
|-- comentariosController.js
|
repositories/
|-- comentariosRepository.js
|
sql/
`-- comentarios.sql
```

Cada parte tendría una responsabilidad:

- `public/js/comentarios.js`: formulario, `fetch` y representación visual.
- `routes/comentarios.js`: URLs y métodos HTTP.
- `controllers/comentariosController.js`: recibe la petición y devuelve la respuesta.
- `repositories/comentariosRepository.js`: consultas `SELECT` e `INSERT`.
- `sql/comentarios.sql`: creación de la tabla.
- `db.js`: conexión reutilizable con MySQL.

No es necesario crear todas las carpetas el primer día. Es mejor construir una versión pequeña que funcione y separar los archivos cuando `server.js` empiece a crecer.

## 9. Orden recomendado para construirlo

### Paso 1: crear la tabla

Ejecutar el SQL en MySQL y comprobar que la tabla `comentarios` existe.

### Paso 2: crear la ruta `POST`

Probar el guardado con Thunder Client, Postman o `fetch`.

Comprobar en MySQL:

```sql
SELECT * FROM comentarios ORDER BY id DESC;
```

### Paso 3: crear la ruta `GET`

Abrir, por ejemplo:

```text
http://localhost:3000/api/comentarios/123
```

Debe devolver un array JSON, aunque esté vacío:

```json
[]
```

### Paso 4: conectar el formulario

Añadir `public/js/comentarios.js` y comprobar que al publicar aparece una fila nueva en MySQL.

### Paso 5: añadir login

Cuando el sistema de usuarios funcione, hacer que solo los usuarios autenticados puedan publicar y guardar `usuario_id` desde la sesión.

### Paso 6: añadir editar y borrar

Para esas operaciones hay que comprobar que el comentario pertenece al usuario conectado o a un administrador.

## 10. Resumen mental

La parte importante puede recordarse así:

```text
HTML muestra el formulario.
JavaScript recoge el formulario y llama a fetch().
Express recibe la petición.
Node.js valida los datos.
mysql2 ejecuta INSERT o SELECT.
MySQL guarda o devuelve los comentarios.
Express responde en JSON.
JavaScript actualiza la página.
```

PHP no interviene porque el backend elegido para Frikicoments es Node.js.
