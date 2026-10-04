# Frikicoments

Frikicoments es un proyecto de foro sobre videojuegos realizado como Trabajo de Fin de Grado de Formación Profesional.

La idea principal es recuperar el estilo de los foros clásicos de Internet: un sitio sencillo donde los usuarios puedan hablar de videojuegos, publicar opiniones, crear conversaciones y responder a otros miembros de la comunidad.

## Tecnologías utilizadas

- **Node.js** para ejecutar el servidor.
- **Express** para crear el servidor web y las rutas de la aplicación.
- **HTML y CSS** para la interfaz.
- **JavaScript** para la interacción con la página y las peticiones a la API.
- **MySQL** para guardar los datos del proyecto.
- **mysql2** para conectar Node.js con MySQL.
- **IGDB y Twitch** para buscar información sobre videojuegos.

## Arquitectura

Es una aplicación monolítica sencilla: un único servidor Express sirve las páginas HTML y una API JSON, y MySQL guarda los datos. Las páginas no usan frameworks: cada una carga un módulo de JavaScript que pide los datos a la API.

```text
 tfg-frikicoments/
 |-- src/
 |   |-- server.js            # Arranque: migraciones, limpieza periódica y servidor
 |   |-- app.js               # Configuración de Express (la usan el servidor y los tests)
 |   |-- config.js            # Variables de entorno y constantes
 |   |-- db/
 |   |   |-- pool.js          # Conexión con MySQL y transacciones
 |   |   |-- migrar.js        # Aplica las migraciones pendientes
 |   |   `-- migraciones/     # Cambios de la base, numerados (001_..., 002_...)
 |   |-- middleware/          # Sesión y permisos, límites de peticiones, errores
 |   |-- servicios/           # IGDB (con caché) y usuarios
 |   `-- rutas/               # cuentas, admin, archivos, juegos, comunidad, páginas
 |-- public/
 |   |-- *.html, usuarios/    # Páginas
 |   |-- js/comun.js          # Utilidades compartidas y menú de la cabecera
 |   |-- js/paginas/          # El código de cada página
 |   `-- css/                 # Estilos (styles.css y catalogo.css)
 |-- scripts/                 # Inicializar la base y restablecer el administrador
 |-- Dockerfile, docker-compose.yml
 `-- storage/                 # Archivos subidos (fuera del repositorio)
```

## Funcionamiento actual

- **Cuentas por invitación.** No hay registro público: un administrador crea la cuenta con una contraseña inicial. Las contraseñas se guardan como hashes bcrypt y la sesión es una cookie HttpOnly cuyo token solo se guarda en la base como hash SHA-256.
- **Recuperar la contraseña sin correo.** Un administrador genera un enlace de un solo uso (caduca en 24 horas) y se lo envía a la persona, que elige la contraseña nueva.
- **Juegos.** La búsqueda y las fichas vienen de IGDB. Los datos de cada juego se guardan en caché 24 horas.
- **Reseñas.** Una sola tabla, identificada por el id de IGDB: lo que se publica en la portada aparece también en la ficha del juego.
- **Biblioteca.** Juegos guardados, con «me gusta» o con estado (pendiente, jugado, abandonado), ordenables a mano.
- **Perfiles y chat privado.** Se puede ver lo que le gusta y tiene pendiente cada persona y seguirla. Si dos personas se siguen mutuamente, pueden hablar por chat privado. Los administradores solo ven cuánto ocupa cada conversación y pueden borrarla.
- **Archivos personales** con cuota por usuario y comprobación del espacio libre en disco.
- **Protección contra abusos:** límites de peticiones por IP y por usuario, y bloqueo progresivo de los intentos de login fallidos.

### Base de datos y migraciones

Las tablas no se crean a mano. Al arrancar, el servidor aplica en orden las migraciones de `src/db/migraciones` que todavía no estén en la tabla `migraciones`. Para cambiar la base, se añade un archivo nuevo con el número siguiente; nunca se modifica uno ya aplicado.

### Cifrado en reposo del chat

Los mensajes del chat de la portada se guardan cifrados con AES-256-GCM: si alguien obtiene la base de datos o una copia de seguridad, no puede leerlos. El servidor tiene la clave y sí puede descifrarlos, así que **no es cifrado de extremo a extremo**.

- La clave va en `CHAT_ENCRYPTION_KEY` (`.env`, nunca en Git): 32 bytes aleatorios en base64. Para crearla sin que aparezca en pantalla:
  `printf 'CHAT_ENCRYPTION_KEY=%s\n' "$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")" >> .env`
- **Guarda una copia de la clave aparte de las copias de la base** (por ejemplo, en un gestor de contraseñas). Sin ella, los mensajes cifrados no se pueden recuperar.
- Sin clave, el chat responde con un error claro y no guarda nada en texto plano.
- Los mensajes antiguos en texto plano se cifran con `node scripts/cifrar-chat.js` (`--comprobar` solo cuenta y verifica). Se puede repetir o interrumpir sin peligro.

### Inicializar una instalación nueva

Configura en `.env` `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `LOGIN_USERNAME`, `LOGIN_PASSWORD`, `IGDB_CLIENT_ID` e `IGDB_CLIENT_SECRET`. La cuenta `LOGIN_USERNAME` es el superadministrador.

```bash
npm install
npm run db:init   # aplica las migraciones y crea el superadministrador
```

Si se olvida la contraseña del superadministrador, cambia `LOGIN_PASSWORD` en `.env` y ejecuta `npm run db:reset-admin`.

### Despliegue con Docker

Docker Compose lee la configuración privada desde `.env` (no se copia a la imagen). Para una instalación nueva define también `MYSQL_ROOT_PASSWORD`. Los datos de MySQL viven en el volumen `tfg-frikicoments_db_data` y los archivos subidos en `./storage`.

```bash
docker compose config --quiet
docker compose up -d db
docker compose run --rm --no-deps web npm run db:init   # solo la primera vez
docker compose up -d --build web
```

El despliegue de cambios es manual:

```bash
git pull
docker compose up -d --build web
```

La web solo escucha en `127.0.0.1:3001`; desde fuera únicamente se accede a través de Tailscale Funnel. Para comprobar que responde: `curl http://127.0.0.1:3001/api/health`.

### Tests

Los tests (`test/*.test.js`, con `node:test`) arrancan la aplicación contra una base vacía, aplican las migraciones desde cero y prueban login, permisos, recuperación, reseñas, biblioteca, chat privado y seguridad. IGDB se sustituye por juegos falsos, así que no necesitan internet.

**Borran la base que se les indique**: por eso exigen que `DB_NAME` contenga «test». En la Raspberry se ejecutan dentro de Docker contra la MySQL de pruebas:

```bash
scripts/tests-docker.sh
```

## Ejecución en local

```bash
npm install
npm run dev
```

La aplicación se abre en `http://localhost:3000`.


