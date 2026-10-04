-- Esquema de partida: todas las tablas tal como estaban antes de usar migraciones.
-- En una base existente no cambia nada (CREATE TABLE IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS usuarios (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nombre_usuario VARCHAR(80) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  rol ENUM('usuario', 'admin') NOT NULL DEFAULT 'usuario',
  cuota_archivos_bytes BIGINT UNSIGNED NOT NULL DEFAULT 524288000,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_usuarios_nombre (nombre_usuario)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS comentarios (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id INT UNSIGNED NOT NULL,
  nombre_usuario VARCHAR(80) NOT NULL,
  juego VARCHAR(160) NOT NULL,
  contenido TEXT NOT NULL,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_comentarios_creado (creado_en),
  CONSTRAINT fk_comentarios_usuario
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sesiones (
  token_hash CHAR(64) NOT NULL,
  usuario_id INT UNSIGNED NOT NULL,
  expira_en DATETIME NOT NULL,
  PRIMARY KEY (token_hash),
  KEY ix_sesiones_expira (expira_en),
  CONSTRAINT fk_sesiones_usuario
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS juegos_usuario (
  usuario_id INT UNSIGNED NOT NULL,
  juego_id INT UNSIGNED NOT NULL,
  estado ENUM('jugado', 'pendiente', 'abandonado') NOT NULL,
  actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (usuario_id, juego_id),
  CONSTRAINT fk_juegos_usuario_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS juegos_guardados (
  usuario_id INT UNSIGNED NOT NULL,
  juego_id INT UNSIGNED NOT NULL,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (usuario_id, juego_id),
  CONSTRAINT fk_juegos_guardados_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS juegos_me_gusta (
  usuario_id INT UNSIGNED NOT NULL,
  juego_id INT UNSIGNED NOT NULL,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (usuario_id, juego_id),
  CONSTRAINT fk_juegos_me_gusta_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS comentarios_juegos (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id INT UNSIGNED NOT NULL,
  nombre_usuario VARCHAR(80) NOT NULL,
  juego_id INT UNSIGNED NOT NULL,
  contenido TEXT NOT NULL,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_comentarios_juego (juego_id, creado_en),
  CONSTRAINT fk_comentarios_juegos_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mensajes_laterales (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  contenido VARCHAR(1000) NOT NULL,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expira_en DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY ix_mensajes_laterales_expira (expira_en)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS chat_mensajes (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id INT UNSIGNED NOT NULL,
  nombre_usuario VARCHAR(80) NOT NULL,
  contenido VARCHAR(500) NOT NULL,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_chat_mensajes_creado (creado_en),
  CONSTRAINT fk_chat_mensajes_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS archivos_usuario (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id INT UNSIGNED NOT NULL,
  nombre_original VARCHAR(255) NOT NULL,
  nombre_disco VARCHAR(100) NOT NULL,
  mime_type VARCHAR(160) NOT NULL,
  tamano_bytes BIGINT UNSIGNED NOT NULL,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_archivos_nombre_disco (nombre_disco),
  KEY ix_archivos_usuario (usuario_id, nombre_original),
  CONSTRAINT fk_archivos_usuario_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS biblioteca_orden (
  usuario_id INT UNSIGNED NOT NULL,
  juego_id INT UNSIGNED NOT NULL,
  posicion INT UNSIGNED NOT NULL,
  PRIMARY KEY (usuario_id, juego_id),
  CONSTRAINT fk_biblioteca_orden_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS recuperaciones_contrasena (
  token_hash CHAR(64) NOT NULL,
  usuario_id INT UNSIGNED NOT NULL,
  creado_por INT UNSIGNED NULL,
  expira_en DATETIME NOT NULL,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (token_hash),
  KEY ix_recuperaciones_usuario (usuario_id),
  CONSTRAINT fk_recuperaciones_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_recuperaciones_creador FOREIGN KEY (creado_por) REFERENCES usuarios(id)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS seguimientos (
  seguidor_id INT UNSIGNED NOT NULL,
  seguido_id INT UNSIGNED NOT NULL,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (seguidor_id, seguido_id),
  KEY ix_seguimientos_seguido (seguido_id),
  CONSTRAINT fk_seguimientos_seguidor FOREIGN KEY (seguidor_id) REFERENCES usuarios(id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_seguimientos_seguido FOREIGN KEY (seguido_id) REFERENCES usuarios(id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Una conversación por pareja: usuario_menor_id < usuario_mayor_id.
-- leido_*_hasta guarda el último mensaje que ha visto cada participante.
CREATE TABLE IF NOT EXISTS conversaciones (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_menor_id INT UNSIGNED NOT NULL,
  usuario_mayor_id INT UNSIGNED NOT NULL,
  leido_menor_hasta BIGINT UNSIGNED NOT NULL DEFAULT 0,
  leido_mayor_hasta BIGINT UNSIGNED NOT NULL DEFAULT 0,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_conversaciones_pareja (usuario_menor_id, usuario_mayor_id),
  KEY ix_conversaciones_mayor (usuario_mayor_id),
  CONSTRAINT fk_conversaciones_menor FOREIGN KEY (usuario_menor_id) REFERENCES usuarios(id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_conversaciones_mayor FOREIGN KEY (usuario_mayor_id) REFERENCES usuarios(id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mensajes_privados (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  conversacion_id INT UNSIGNED NOT NULL,
  autor_id INT UNSIGNED NOT NULL,
  contenido VARCHAR(1000) NOT NULL,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_mensajes_privados_conversacion (conversacion_id, id),
  CONSTRAINT fk_mensajes_privados_conversacion FOREIGN KEY (conversacion_id) REFERENCES conversaciones(id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_mensajes_privados_autor FOREIGN KEY (autor_id) REFERENCES usuarios(id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
