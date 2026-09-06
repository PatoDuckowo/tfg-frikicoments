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

El proyecto también tiene preparada la conexión con MySQL mediante el archivo `db.js`. La zona de usuarios está creada actualmente como una maqueta HTML. En una fase posterior se añadirán el registro, el inicio de sesión, los perfiles y los comentarios guardados en la base de datos.

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

https://castorcito.azules-quillback.ts.net/

La Raspberry Pi ejecuta el servidor Node.js y Tailscale permite acceder a él usando esa dirección.

## Objetivo final

La finalidad del proyecto es crear una pequeña comunidad de videojuegos con el ambiente de los foros de antes, dando importancia a las conversaciones, las opiniones de los usuarios y la organización por videojuegos.

Como próximas mejoras se plantean:

- Registro e inicio de sesión.
- Perfiles de usuario.
- Creación de hilos y respuestas.
- Publicación de reseñas.
- Guardado de comentarios en MySQL.
- Moderación básica del contenido.
