# Usuarios, registro y cambio de contraseña

Guía para añadir una ventana de usuarios al proyecto `tfg-frikicoments`.

## 1. Objetivo y decisión recomendada

El proyecto ya utiliza:

- Node.js
- Express
- `mysql2`
- Un pool de conexión en `db.js`

Por tanto, **no es necesario PHP**. Añadir PHP supondría mantener dos backends distintos. La solución más sencilla es continuar con Node.js y Express.

Para las contraseñas:

- Nunca se guardan en texto plano.
- Se guarda un hash creado con `bcrypt`.
- El navegador no debe conectarse directamente a MySQL.
- El servidor Node.js valida los datos y habla con la base de datos.

El objetivo no es solamente crear una pantalla. El flujo completo será:

```text
Formulario HTML
  |
  | fetch()
  v
API Express
  |
  | valida datos, aplica reglas y comprueba la sesión
  v
Servicio de autenticación
  |
  | bcrypt y consultas parametrizadas
  v
MySQL
```

Cada capa tiene una responsabilidad concreta:

| Capa | Responsabilidad | No debería hacer |
|---|---|---|
| HTML/CSS/JS | Mostrar formularios y enviar datos | Conectarse a MySQL |
| Rutas/API | Recibir peticiones y devolver respuestas HTTP | Dibujar la interfaz |
| Autenticación | Hash, login, sesión y permisos | Construir HTML |
| Base de datos | Persistir usuarios y sesiones | Validar contraseñas en texto plano |

Separar estas responsabilidades facilita encontrar errores. Por ejemplo, si el formulario funciona pero devuelve `500`, el problema está después del navegador: en la API, la autenticación o la base de datos.

## 2. Arquitectura ordenada

La estructura recomendada para este proyecto es:

```text
 tfg-frikicoments/
 |-- db.js
 |-- server.js                 # Arranque y configuración general
 |-- package.json
 |-- .env
 |-- .env.example
 |-- sql/
 |   `-- usuarios.sql
 |-- middleware/
 |   `-- auth.js               # Comprueba si hay sesión
 |-- controllers/
 |   `-- usuariosController.js  # Coordina cada caso de uso
 |-- services/
 |   `-- authService.js          # Reglas de registro y login
 |-- repositories/
 |   `-- usuariosRepository.js   # Consultas SQL de usuarios
 |-- routes/
 |   `-- usuarios.js             # URLs y métodos HTTP
 |-- public/
 |   |-- inicio.html
 |   |-- usuarios.html
 |   |-- css/
 |   |   `-- styles.css
 |   `-- js/
 |       `-- usuarios.js
 `-- memoria-soluciones/
     `-- guia-usuarios-autenticacion-node-mysql.md
```

### Qué hace cada archivo

- `db.js`: crea y exporta el pool de conexiones. No contiene reglas de login.
- `server.js`: configura Express, JSON, sesiones, archivos estáticos y registra las rutas.
- `routes/usuarios.js`: relaciona, por ejemplo, `POST /login` con un controlador.
- `controllers/usuariosController.js`: traduce una petición HTTP a un caso de uso y decide el código de respuesta.
- `services/authService.js`: contiene la lógica de registro, comparación con `bcrypt` y cambio de contraseña.
- `repositories/usuariosRepository.js`: contiene `SELECT`, `INSERT` y `UPDATE` usando `pool.execute`.
- `middleware/auth.js`: bloquea las rutas que necesitan una sesión.
- `public/js/usuarios.js`: recoge formularios y muestra el resultado de la API.

Esta separación no es obligatoria para una primera prueba. Para aprender, puedes empezar con una sola ruta en `server.js`; cuando esa ruta funcione, mover cada parte a su carpeta. Lo importante es conservar las responsabilidades, no crear carpetas por obligación.

## 3. Orden de construcción y comprobaciones

Construye la funcionalidad en este orden. Cada fase debe funcionar antes de pasar a la siguiente.

### Fase 1: conexión

1. Configura `.env`.
2. Ejecuta el SQL de la sección siguiente.
3. Arranca el servidor con `npm run dev`.
4. Abre `http://localhost:3000/api/health`.

**Comprobación:** debe responder con `ok: true`. Si falla, todavía no necesitas tocar formularios: revisa MySQL, credenciales y `db.js`.

### Fase 2: crear usuarios sin login

1. Implementa solo `POST /api/usuarios/registro`.
2. Prueba la petición con Thunder Client, Postman o `fetch`.
3. Comprueba en MySQL que existe la fila.
4. Comprueba que `password_hash` no coincide con la contraseña escrita.

**Comprobación:** un email repetido debe devolver un error controlado, no un error HTML ni un cierre del servidor.

### Fase 3: iniciar y cerrar sesión

1. Añade la configuración de sesiones.
2. Implementa `POST /login`.
3. Implementa `GET /me` para saber quién está conectado.
4. Implementa `POST /logout`.

**Comprobación:** después del login, `/me` devuelve el usuario; después del logout, `/me` devuelve `401`.

### Fase 4: proteger una ruta

1. Crea `requireAuth`.
2. Colócalo antes de una ruta privada.
3. Prueba esa ruta sin cookie y con cookie.

**Comprobación:** una petición sin sesión nunca debe poder leer ni modificar datos privados.

### Fase 5: cambiar contraseña

1. Obtén el usuario desde `req.session.usuarioId`, nunca desde un `id` enviado libremente por el navegador.
2. Comprueba la contraseña actual.
3. Genera un nuevo hash para la contraseña nueva.
4. Destruye la sesión y exige un nuevo login.

**Comprobación:** la contraseña antigua deja de funcionar y la nueva funciona después de iniciar sesión otra vez.

### Fase 6: interfaz

Solo cuando la API esté comprobada, crea `usuarios.html` y conecta sus formularios. Así puedes distinguir un error visual de un error de backend.

## 4. Base de datos MySQL

## 3. Base de datos MySQL

Crear una base de datos y una tabla para los usuarios. El email será único para impedir cuentas duplicadas.

Archivo `sql/usuarios.sql`:

```sql
CREATE DATABASE IF NOT EXISTS tfg
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE tfg;

CREATE TABLE IF NOT EXISTS usuarios (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nombre VARCHAR(80) NOT NULL,
  email VARCHAR(190) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  rol ENUM('usuario', 'admin') NOT NULL DEFAULT 'usuario',
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_usuarios_email (email)
) ENGINE=InnoDB;
```

No se debe crear una columna llamada `password` para guardar la contraseña original. La columna `password_hash` contiene únicamente el resultado de `bcrypt`.

## 4. Configuración del entorno

Instalar las dependencias desde la carpeta del proyecto:

```bash
npm install bcrypt express-session express-mysql-session
```

El proyecto ya tiene `express`, `mysql2` y `dotenv`.

Crear `.env` en la raíz:

```env
PORT=3000
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=tu_password_mysql
DB_NAME=tfg
SESSION_SECRET=cambia-esta-clave-por-una-larga-y-aleatoria
```

Crear también `.env.example`, sin contraseñas reales:

```env
PORT=3000
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=tfg
SESSION_SECRET=
```

Añadir `.env` a `.gitignore` para no publicar credenciales.

## 5. Sesiones de usuario

Para una aplicación web tradicional, una sesión almacenada en una cookie `httpOnly` es una opción clara y sencilla:

1. El usuario envía email y contraseña.
2. El servidor comprueba el hash con `bcrypt.compare`.
3. El servidor guarda `usuarioId` en la sesión.
4. El navegador recibe una cookie, pero nunca recibe la contraseña.
5. Las rutas privadas consultan esa sesión.

No conviene guardar la sesión solamente en memoria cuando la aplicación se publique, porque se perdería al reiniciar el servidor. `express-mysql-session` permite guardarla en MySQL.

Ejemplo de configuración en `server.js`:

```js
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);

const sessionStore = new MySQLStore({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

app.use(session({
  name: 'tfg_session',
  secret: process.env.SESSION_SECRET,
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 24 * 7,
  },
}));
```

En producción, la aplicación debe funcionar con HTTPS para que `secure: true` proteja la cookie.

## 6. Middleware para rutas privadas

Archivo `middleware/auth.js`:

```js
function requireAuth(req, res, next) {
  if (!req.session.usuarioId) {
    return res.status(401).json({ error: 'Debes iniciar sesión' });
  }

  next();
}

module.exports = { requireAuth };
```

## 7. Endpoints necesarios

| Método | Ruta | Privada | Función |
|---|---|---:|---|
| `POST` | `/api/usuarios/registro` | No | Crear una cuenta |
| `POST` | `/api/usuarios/login` | No | Iniciar sesión |
| `POST` | `/api/usuarios/logout` | Sí | Cerrar sesión |
| `GET` | `/api/usuarios/me` | Sí | Obtener el usuario actual |
| `PATCH` | `/api/usuarios/password` | Sí | Cambiar contraseña |

### Registro

Datos recibidos:

```json
{
  "nombre": "Ana",
  "email": "ana@example.com",
  "password": "UnaClaveSegura123!"
}
```

Pasos del endpoint:

1. Comprobar que nombre, email y contraseña existen.
2. Normalizar el email con `trim().toLowerCase()`.
3. Validar una longitud mínima de contraseña, por ejemplo 8 caracteres.
4. Consultar si el email ya está registrado.
5. Crear el hash: `bcrypt.hash(password, 12)`.
6. Insertar el usuario usando parámetros SQL (`?`).
7. Crear la sesión con el nuevo `usuarioId`.
8. Responder sin enviar `password_hash`.

Ejemplo del núcleo de registro:

```js
const bcrypt = require('bcrypt');

const emailNormalizado = email.trim().toLowerCase();
const passwordHash = await bcrypt.hash(password, 12);

const [result] = await pool.execute(
  'INSERT INTO usuarios (nombre, email, password_hash) VALUES (?, ?, ?)',
  [nombre.trim(), emailNormalizado, passwordHash]
);

req.session.usuarioId = result.insertId;
```

### Inicio de sesión

Pasos:

1. Buscar el usuario por email.
2. Comparar la contraseña recibida con `bcrypt.compare`.
3. Si coincide, guardar el `id` en la sesión.
4. Devolver solo `id`, `nombre` y `email`.

```js
const [rows] = await pool.execute(
  'SELECT id, nombre, email, password_hash FROM usuarios WHERE email = ?',
  [emailNormalizado]
);

const usuario = rows[0];
const passwordCorrecta = usuario
  && await bcrypt.compare(password, usuario.password_hash);

if (!passwordCorrecta) {
  return res.status(401).json({ error: 'Email o contraseña incorrectos' });
}

req.session.usuarioId = usuario.id;
```

Usar el mismo mensaje para email inexistente y contraseña incorrecta evita revelar qué emails están registrados.

### Cambio de contraseña

Datos recibidos:

```json
{
  "passwordActual": "ClaveAnterior123!",
  "passwordNueva": "ClaveNueva456!"
}
```

Pasos:

1. Exigir sesión mediante `requireAuth`.
2. Obtener el hash actual usando `req.session.usuarioId`.
3. Comprobar `passwordActual` con `bcrypt.compare`.
4. Validar la contraseña nueva.
5. Crear un nuevo hash.
6. Actualizar `password_hash`.
7. Destruir la sesión y pedir al usuario que vuelva a iniciar sesión.

```js
const [rows] = await pool.execute(
  'SELECT password_hash FROM usuarios WHERE id = ?',
  [req.session.usuarioId]
);

if (!rows[0] || !(await bcrypt.compare(passwordActual, rows[0].password_hash))) {
  return res.status(400).json({ error: 'La contraseña actual no es correcta' });
}

const nuevoHash = await bcrypt.hash(passwordNueva, 12);

await pool.execute(
  'UPDATE usuarios SET password_hash = ? WHERE id = ?',
  [nuevoHash, req.session.usuarioId]
);

req.session.destroy(() => {
  res.json({ ok: true, message: 'Contraseña actualizada. Inicia sesión de nuevo.' });
});
```

## 8. Ventana de usuarios

Crear `public/usuarios.html` con tres estados o formularios:

- **Crear cuenta:** nombre, email, contraseña y confirmación.
- **Iniciar sesión:** email y contraseña.
- **Mi cuenta:** datos del usuario y cambio de contraseña.

El JavaScript de `public/js/usuarios.js` debe usar `fetch` contra la API:

```js
const response = await fetch('/api/usuarios/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'same-origin',
  body: JSON.stringify({ email, password }),
});

const data = await response.json();

if (!response.ok) {
  throw new Error(data.error || 'No se pudo iniciar sesión');
}
```

La interfaz debe mostrar mensajes de error sin imprimir contraseñas ni hashes. Las validaciones del navegador mejoran la experiencia, pero el servidor debe repetirlas porque las validaciones del frontend se pueden saltar.

## 9. Orden de implementación

1. Crear la base de datos y ejecutar `sql/usuarios.sql`.
2. Configurar `.env` y comprobar `GET /api/health`.
3. Instalar `bcrypt` y las dependencias de sesión.
4. Añadir la configuración de sesiones después de `express.json()`.
5. Crear los endpoints de registro, login, logout, usuario actual y cambio de contraseña.
6. Añadir `middleware/auth.js` para las rutas privadas.
7. Crear `usuarios.html` y su JavaScript.
8. Añadir un enlace a la ventana de usuarios desde `inicio.html`.
9. Probar errores: email duplicado, contraseña incorrecta, sesión ausente y contraseña actual incorrecta.
10. Probar todo mediante HTTPS antes de desplegarlo.

## 10. Opciones de almacenamiento gratuitas

### MySQL local o MariaDB

Es la opción gratuita más estable para desarrollar en el ordenador. MariaDB es compatible con gran parte de la sintaxis MySQL y evita depender de un servicio externo durante el desarrollo.

### MySQL en un proveedor gratuito

Los planes gratuitos cambian con frecuencia y pueden tener límites de horas, almacenamiento o suspensión. Antes de escoger uno hay que comprobar el precio y los límites actuales. La aplicación debe seguir funcionando con cualquier servidor MySQL compatible usando las variables `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD` y `DB_NAME`.

### SQLite

SQLite es completamente gratuito y no necesita un servidor separado. Es una buena alternativa para una aplicación pequeña o un prototipo. Sin embargo, como el proyecto ya usa MySQL y `mysql2`, cambiar ahora a SQLite implica modificar la conexión, los tipos SQL y el almacenamiento de sesiones.

**Recomendación:** usar MySQL o MariaDB localmente durante el desarrollo. Para publicar, usar un MySQL compatible con copias de seguridad y revisar el plan gratuito vigente del proveedor elegido.

## 11. Seguridad mínima

- No guardar contraseñas en texto plano.
- No subir `.env` a Git.
- Usar consultas parametrizadas con `?`.
- Usar `bcrypt` con un coste de 12 o el recomendado por la versión instalada.
- Activar HTTPS en producción.
- Usar cookies `httpOnly`, `sameSite` y `secure` en producción.
- Limitar intentos de login si la aplicación se hace pública.
- No devolver `password_hash` en ninguna respuesta.
- Validar y limitar la longitud de nombre, email y contraseña.
- Añadir protección CSRF si se incorporan operaciones sensibles con cookies de sesión.
- Hacer copias de seguridad de la base de datos.

## 12. ¿Cuándo usar PHP?

PHP solo sería necesario si el proyecto se desplegara en un hosting pensado para PHP o si se quisiera construir el backend completo con PHP. En el proyecto actual no aporta una ventaja: ya existe un servidor Express y una conexión MySQL funcional.

La arquitectura final recomendada es:

```text
Navegador
   |
   | fetch /api/usuarios/...
   v
Node.js + Express
   |
   | bcrypt + sesiones
   v
MySQL o MariaDB
```
