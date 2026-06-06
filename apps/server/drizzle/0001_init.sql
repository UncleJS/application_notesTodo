-- Users, groups, sessions, settings.
-- Archive-only lifecycle: archived_at_UTC NULL = active. Uniqueness among
-- active rows via VIRTUAL generated columns (MariaDB has no partial indexes).

CREATE TABLE users (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  username VARCHAR(64) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  display_name VARCHAR(128) NULL,
  is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  email VARCHAR(255) NULL,
  last_login_at_UTC DATETIME NULL,
  created_at_UTC DATETIME NOT NULL DEFAULT (UTC_TIMESTAMP()),
  updated_at_UTC DATETIME NOT NULL DEFAULT (UTC_TIMESTAMP()),
  archived_at_UTC DATETIME NULL,
  username_active VARCHAR(64) GENERATED ALWAYS AS (
    CASE WHEN archived_at_UTC IS NULL THEN username ELSE NULL END
  ) VIRTUAL,
  UNIQUE KEY uk_users_username_active (username_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `groups` (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(128) NOT NULL,
  description VARCHAR(512) NULL,
  created_at_UTC DATETIME NOT NULL DEFAULT (UTC_TIMESTAMP()),
  updated_at_UTC DATETIME NOT NULL DEFAULT (UTC_TIMESTAMP()),
  archived_at_UTC DATETIME NULL,
  name_active VARCHAR(128) GENERATED ALWAYS AS (
    CASE WHEN archived_at_UTC IS NULL THEN name ELSE NULL END
  ) VIRTUAL,
  UNIQUE KEY uk_groups_name_active (name_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE group_members (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  group_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  created_at_UTC DATETIME NOT NULL DEFAULT (UTC_TIMESTAMP()),
  updated_at_UTC DATETIME NOT NULL DEFAULT (UTC_TIMESTAMP()),
  archived_at_UTC DATETIME NULL,
  pair_active VARCHAR(64) GENERATED ALWAYS AS (
    CASE WHEN archived_at_UTC IS NULL THEN CONCAT(group_id, '-', user_id) ELSE NULL END
  ) VIRTUAL,
  UNIQUE KEY uk_group_members_active (pair_active),
  KEY idx_group_members_user (user_id),
  KEY idx_group_members_group (group_id),
  CONSTRAINT fk_group_members_group FOREIGN KEY (group_id) REFERENCES `groups` (id),
  CONSTRAINT fk_group_members_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- System table: expiry lifecycle, hard delete allowed.
CREATE TABLE sessions (
  id CHAR(36) PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  expires_at_UTC DATETIME NOT NULL,
  created_at_UTC DATETIME NOT NULL DEFAULT (UTC_TIMESTAMP()),
  last_seen_at_UTC DATETIME NOT NULL DEFAULT (UTC_TIMESTAMP()),
  KEY idx_sessions_user (user_id),
  KEY idx_sessions_expires (expires_at_UTC),
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Singleton app settings (id = 1).
CREATE TABLE settings (
  id TINYINT UNSIGNED PRIMARY KEY,
  smtp_host VARCHAR(255) NULL,
  smtp_port INT NULL,
  smtp_user VARCHAR(255) NULL,
  smtp_pass_enc TEXT NULL,
  smtp_from VARCHAR(255) NULL,
  smtp_tls ENUM('none','starttls','tls') NOT NULL DEFAULT 'starttls',
  webhook_url VARCHAR(1024) NULL,
  webhook_secret_enc TEXT NULL,
  webhook_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at_UTC DATETIME NOT NULL DEFAULT (UTC_TIMESTAMP()),
  updated_at_UTC DATETIME NOT NULL DEFAULT (UTC_TIMESTAMP()),
  CONSTRAINT chk_settings_singleton CHECK (id = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO settings (id) VALUES (1);
