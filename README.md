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

El proyecto también tiene preparada la conexión con MySQL mediante el archivo `db.js`. El inicio de sesión permite autorizar manualmente varias cuentas desde `usuarios.json`, en la carpeta raíz del servidor. Ese archivo no se publica ni se sirve al navegador. Si no existe, se usa la cuenta configurada en `.env`, que tiene rol de administrador. No hay registro público ni cuentas en MySQL.

Para crear usuarios manualmente, copia `usuarios.example.json` como `usuarios.json` junto a `server.js` y escribe solo las cuentas que quieras autorizar:

```json
[
	{
		"usuario": "nombre_que_autorizas",
		"contrasena": "clave_privada",
		"rol": "admin"
	},
	{
		"usuario": "otra_persona",
		"contrasena": "otra_clave_privada",
		"rol": "usuario"
	}
]
```

Solo las cuentas con rol `admin` pueden abrir «Administrar usuarios» y crear cuentas desde la web. Las cuentas nuevas reciben automáticamente el rol `usuario`. La cuenta configurada en `.env` siempre será administradora. Guarda `usuarios.json` también en la Raspberry Pi: `.gitignore` evita que se suba a GitHub. Los cambios manuales en la lista se leen en el siguiente intento de inicio de sesión. En esta versión las claves están en texto plano dentro de un archivo privado, adecuado solo para una prueba controlada. Para un sitio público, deben guardarse como hashes con bcrypt.

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

- Registro y autenticación persistente de usuarios en MySQL.
- Perfiles de usuario.
- Creación de hilos y respuestas.
- Publicación de reseñas.
- Guardado de comentarios en MySQL.
- Moderación básica del contenido.
