-- Todo statuses lookup (planned / WIP / on hold — seeded by migrate.ts) and
-- the status reference on todos. Mirrors the categories lookup shape.

CREATE TABLE statuses (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(128) NOT NULL,
  color VARCHAR(16) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at_UTC DATETIME NOT NULL DEFAULT (UTC_TIMESTAMP()),
  updated_at_UTC DATETIME NOT NULL DEFAULT (UTC_TIMESTAMP()),
  archived_at_UTC DATETIME NULL,
  name_active VARCHAR(128) GENERATED ALWAYS AS (
    CASE WHEN archived_at_UTC IS NULL THEN name ELSE NULL END
  ) VIRTUAL,
  UNIQUE KEY uk_statuses_name_active (name_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE todos
  ADD COLUMN status_id BIGINT UNSIGNED NULL,
  ADD CONSTRAINT fk_todos_status FOREIGN KEY (status_id) REFERENCES statuses (id);
