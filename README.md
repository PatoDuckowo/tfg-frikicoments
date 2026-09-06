# Frikicoments

Frikicoments es un proyecto de foro sobre videojuegos inspirado en los foros clásicos de Internet. La idea es crear un lugar sencillo y reconocible donde la comunidad pueda hablar de videojuegos, publicar opiniones, descubrir recomendaciones y debatir sin que toda la experiencia dependa de algoritmos o de una red social.

El objetivo es recuperar parte de la sensación de los foros de antes:

- Usuarios con un nombre y un perfil propio.
- Comentarios visibles y conversaciones entre personas.
- Reseñas y opiniones organizadas por videojuegos.
- Una comunidad que participa porque tiene algo que aportar.
- Una interfaz con personalidad pixel art, cercana a la cultura retro y videojueguil.

## Estado actual

El proyecto está en desarrollo. Actualmente incluye:

- Página principal con la presentación de Frikicoments.
- Buscador de videojuegos.
- Resultados obtenidos desde IGDB mediante la API de Twitch.
- Estilos visuales pixel art.
- Conexión preparada con MySQL.
- Estructura HTML inicial para futuras cuentas de usuario.
- Guías de arquitectura y autenticación en `memoria-soluciones/`.

Las páginas de usuarios son actualmente una maqueta visual. Sus formularios todavía no crean cuentas ni inician sesiones.

## Tecnologías utilizadas

### Node.js

Es el entorno que ejecuta JavaScript en el servidor. Se utiliza como base del backend.

### Express

Es el framework que organiza el servidor web y las rutas HTTP. Se encarga de:

- Servir los archivos de `public/`.
- Recibir peticiones de la aplicación.
- Crear endpoints de la API.
- Devolver respuestas al navegador.

### MySQL y `mysql2`

MySQL será la base de datos donde se podrán guardar usuarios, comentarios, reseñas y otros datos del foro. El archivo `db.js` crea un pool de conexiones usando el paquete `mysql2`.

El navegador nunca debe conectarse directamente a MySQL. El flujo correcto es:

```text
Navegador -> Express/Node.js -> MySQL
```

### HTML y CSS

Los archivos HTML forman las páginas que ve el usuario. Los archivos CSS definen la apariencia pixel art, los colores, los paneles, los botones y el diseño responsive.

### API de IGDB y Twitch

IGDB proporciona información sobre videojuegos. Para consultar su API se utiliza una autenticación de Twitch mediante:

- `IGDB_CLIENT_ID`
- `IGDB_CLIENT_SECRET`

El servidor obtiene un token de Twitch y después consulta los juegos en IGDB. La clave secreta se guarda en `.env` y no debe publicarse.

### `dotenv`

Carga las variables privadas del archivo `.env`, como las credenciales de MySQL y las claves de IGDB.

## Estructura del proyecto

```text
 tfg-frikicoments/
 |-- server.js                         # Servidor Express y endpoints actuales
 |-- db.js                             # Pool de conexiones MySQL
 |-- package.json                      # Dependencias y comandos del proyecto
 |-- package-lock.json                 # Versiones exactas instaladas
 |-- .env                              # Credenciales locales, no se publica
 |-- .env.example                      # Plantilla de variables de entorno
 |-- public/
 |   |-- inicio.html                   # Página principal
 |   |-- resultados.html               # Resultados del buscador
 |   |-- css/
 |   |   |-- styles.css                # Estilos generales pixel art
 |   |   `-- catalogo.css              # Estilos del catálogo de resultados
 |   `-- usuarios/
 |       |-- usuarios.html             # Menú de la zona de usuarios
 |       |-- crear-usuario.html        # Maqueta de registro
 |       |-- iniciar-sesion.html        # Maqueta de login
 |       |-- mi-cuenta.html             # Maqueta de perfil
 |       `-- cambiar-contrasena.html    # Maqueta de cambio de contraseña
 |-- memoria-soluciones/
 |   |-- guia-cache-html-css.md        # Soluciones para problemas de caché
 |   |-- guia-usuarios-autenticacion-node-mysql.md
 |   `-- ...                            # Otras guías del proyecto
 |-- README.md                          # Documentación general del proyecto
 `-- css/
     `-- styles.css                    # Archivo antiguo o pendiente de revisar
```

> La carpeta `css/` de la raíz contiene un archivo antiguo. Los estilos que utiliza actualmente la web están en `public/css/`.

## Cómo funciona actualmente

### 1. Arranque del servidor

El punto de entrada es `server.js`. Al iniciarlo:

1. Se cargan las variables de `.env`.
2. Se crea la aplicación Express.
3. Se habilita la lectura de JSON.
4. Se sirven los archivos estáticos de `public/`.
5. Se registran las rutas principales.
6. Se inicia el servidor en el puerto configurado.

Por defecto, la página se abre en:

```text
http://localhost:3000
```

### 2. Página principal

La ruta `/` muestra `public/inicio.html`. Desde ella se puede escribir el nombre de un videojuego en el buscador.

### 3. Búsqueda de videojuegos

El formulario de inicio envía el término a:

```text
GET /resultados?q=nombre-del-juego
```

La página `resultados.html` llama al endpoint:

```text
GET /api/juegos/buscar?q=nombre-del-juego&page=1
```

Después, `server.js`:

1. Comprueba que existe el término de búsqueda.
2. Obtiene un token de Twitch si no tiene uno válido.
3. Consulta la API de IGDB.
4. Convierte los resultados al formato que necesita la página.
5. Devuelve los videojuegos en formato JSON.
6. `resultados.html` crea las tarjetas de juegos en el navegador.

### 4. Comprobación de MySQL

La ruta:

```text
GET /api/health
```

comprueba si el servidor puede ejecutar una consulta sencilla en MySQL. Es útil para comprobar primero la conexión antes de crear usuarios o comentarios.

## Cómo instalar y arrancar

### Requisitos

- Node.js instalado.
- MySQL o MariaDB instalado y funcionando.
- Credenciales de IGDB/Twitch para utilizar el buscador.

### Instalación

Desde la carpeta raíz del proyecto:

```bash
npm install
```

Crear un archivo `.env` con una configuración parecida a esta:

```env
PORT=3000
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=tu_password_mysql
DB_NAME=tfg
IGDB_CLIENT_ID=tu_client_id
IGDB_CLIENT_SECRET=tu_client_secret
```

No se deben subir las claves reales a GitHub.

### Ejecutar en desarrollo

```bash
npm run dev
```

### Ejecutar normalmente

```bash
npm start
```

## Rutas HTML actuales

| URL | Archivo | Función |
|---|---|---|
| `/` | `public/inicio.html` | Página de inicio |
| `/resultados?q=zelda` | `public/resultados.html` | Resultados de búsqueda |
| `/usuarios/usuarios.html` | `public/usuarios/usuarios.html` | Zona de usuarios |
| `/usuarios/crear-usuario.html` | `public/usuarios/crear-usuario.html` | Crear usuario |
| `/usuarios/iniciar-sesion.html` | `public/usuarios/iniciar-sesion.html` | Iniciar sesión |
| `/usuarios/mi-cuenta.html` | `public/usuarios/mi-cuenta.html` | Ver la cuenta |
| `/usuarios/cambiar-contrasena.html` | `public/usuarios/cambiar-contrasena.html` | Cambiar contraseña |

Las cinco páginas de usuarios son solamente HTML de referencia. Para hacerlas funcionar habrá que añadir una API, una tabla de usuarios, sesiones y JavaScript para enviar los formularios.

## Próxima arquitectura del foro

La evolución prevista es separar el proyecto por responsabilidades:

```text
public/                  Interfaz HTML, CSS y JavaScript
routes/                  URLs de la API
controllers/             Respuestas HTTP y control de peticiones
services/                Reglas del negocio
repositories/            Consultas a MySQL
middleware/              Sesiones y permisos
db.js                    Conexión con la base de datos
```

Por ejemplo, al crear un comentario:

```text
Formulario de comentario
        |
        v
POST /api/comentarios
        |
        v
Controlador de comentarios
        |
        v
Servicio que valida el comentario
        |
        v
Repositorio que lo guarda en MySQL
```

Esta separación permite entender dónde está cada problema y evita que `server.js` termine mezclando HTML, SQL, contraseñas y reglas del foro.

## Funcionalidades previstas

### Usuarios

- Crear una cuenta.
- Iniciar y cerrar sesión.
- Ver el perfil.
- Cambiar la contraseña.
- Guardar contraseñas como hash con `bcrypt`.

### Foro

- Crear hilos de conversación.
- Responder a otros usuarios.
- Organizar conversaciones por videojuego.
- Editar o eliminar los propios comentarios.
- Moderar contenido si el usuario tiene rol de administrador.

### Comunidad

- Perfil con nombre, avatar y fecha de registro.
- Historial de reseñas y comentarios.
- Valoraciones de videojuegos.
- Listas de juegos favoritos.
- Posibilidad de recuperar la conversación y el ambiente de los foros clásicos.

## Principios del proyecto

1. **La comunidad es lo primero.** El contenido lo crean las personas, no un algoritmo que decide toda la portada.
2. **Las conversaciones deben ser legibles.** Los hilos, respuestas y autores deben distinguirse fácilmente.
3. **La interfaz debe tener personalidad.** El estilo pixel art conecta el proyecto con los videojuegos y con la estética retro.
4. **La privacidad es importante.** Las contraseñas y credenciales nunca se guardan ni se publican de forma insegura.
5. **Cada parte debe poder entenderse.** La arquitectura se irá separando conforme crezca el proyecto, sin añadir complejidad innecesaria.

## Documentación adicional

- [Guía de autenticación y usuarios](memoria-soluciones/guia-usuarios-autenticacion-node-mysql.md)
- [Guía sobre caché de HTML y CSS](memoria-soluciones/guia-cache-html-css.md)
