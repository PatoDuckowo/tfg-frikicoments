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

## Estructura principal

```text
 tfg-frikicoments/
 |-- server.js                         # Servidor Express
 |-- db.js                             # Conexión con MySQL
 |-- package.json                      # Dependencias y comandos
 |-- public/
 |   |-- inicio.html                   # Página principal
 |   |-- resultados.html               # Resultados de búsqueda
 |   |-- css/                          # Estilos de la aplicación
 |   `-- usuarios/                     # Pantallas de usuarios
 |       |-- usuarios.html
 |       |-- crear-usuario.html
 |       |-- iniciar-sesion.html
 |       |-- mi-cuenta.html
 |       `-- cambiar-contrasena.html
 `-- memoria-soluciones/               # Documentación del desarrollo
```

## Funcionamiento actual

La página principal permite buscar videojuegos. El servidor recibe la búsqueda, consulta la API de IGDB y devuelve los resultados para mostrarlos en la página.

La aplicación guarda las cuentas y comentarios en MySQL. Las contraseñas se guardan como hashes bcrypt. El formulario «Administrar usuarios» solo permite altas a un administrador; las cuentas nuevas tienen rol `usuario`. Los archivos adjuntos se implementarán aparte: el archivo irá al disco y MySQL guardará sus metadatos.

### Inicializar MySQL en una instalación nueva

Configura en `.env` `DB_NAME=frikicoments`, `DB_USER`, `DB_PASSWORD`, `LOGIN_USERNAME` y `LOGIN_PASSWORD`. La cuenta `LOGIN_USERNAME` se crea como administrador inicial. Desde la carpeta del proyecto ejecuta:

```bash
npm install
npm run db:init
```

El script crea las tablas `usuarios` y `comentarios`, guarda el admin con bcrypt e importa las cuentas existentes de `usuarios.json` como hashes, si el archivo privado está presente. Las cuentas duplicadas no se sobrescriben. Conserva el JSON privado hasta comprobar que las cuentas importadas pueden iniciar sesión; nunca lo subas a GitHub.

### Prueba de extremo a extremo

1. Inicia sesión con el administrador configurado en `.env`.
2. Abre «Administrar usuarios» y crea una cuenta de prueba con una contraseña de al menos 8 caracteres.
3. Cierra sesión, inicia con la cuenta de prueba y publica un comentario de prueba.
4. Recarga la página: el comentario debe seguir apareciendo porque quedó guardado en MySQL.

Para comprobar la conexión sin mostrar credenciales, usa `curl http://localhost:3000/api/health` en la Raspberry. En la aplicación desplegada, reinicia el proceso de Node con PM2 después de actualizar el código.

## Ejecución en local

Para instalar las dependencias:

```bash
npm install
```

Para iniciar el servidor en desarrollo:

```bash
npm run dev
```

La aplicación se puede abrir en:

```text
http://localhost:3000
```

## Despliegue

El proyecto está alojado en una **Raspberry Pi**. Para poder acceder a él desde fuera de la red local se utiliza **Tailscale**, que crea una red privada entre los dispositivos autorizados.

Actualmente se puede acceder a la aplicación mediante:

"Aquí ira el autentico enlace que tenemos con Taiscale"

La Raspberry Pi ejecuta el servidor Node.js y Tailscale permite acceder a él usando esa dirección.

## Objetivo final

La finalidad del proyecto es crear una pequeña comunidad de videojuegos con el ambiente de los foros de antes, dando importancia a las conversaciones, las opiniones de los usuarios y la organización por videojuegos.

Como próximas mejoras se plantean:

- Guardado, borrado y límites de tamaño para archivos adjuntos.
- Perfiles de usuario.
- Creación de hilos y respuestas.
- Administración y moderación de comentarios.
- Moderación básica del contenido.
