-- Todo templates: a named set of template items; instantiating creates todos
-- with due dates offset by relative_due_days from the chosen base date.

CREATE TABLE todo_templates (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  owner_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(255) NOT NULL,
  description VARCHAR(512) NULL,
  created_at_UTC DATETIME NOT NULL DEFAULT (UTC_TIMESTAMP()),
  updated_at_UTC DATETIME NOT NULL DEFAULT (UTC_TIMESTAMP()),
  archived_at_UTC DATETIME NULL,
  name_active VARCHAR(300) GENERATED ALWAYS AS (
    CASE WHEN archived_at_UTC IS NULL THEN CONCAT(owner_id, '-', name) ELSE NULL END
  ) VIRTUAL,
  UNIQUE KEY uk_todo_templates_name_active (name_active),
  KEY idx_todo_templates_owner (owner_id),
  CONSTRAINT fk_todo_templates_owner FOREIGN KEY (owner_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE todo_template_items (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  template_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(512) NOT NULL,
  category_id BIGINT UNSIGNED NULL,
  priority_id BIGINT UNSIGNED NULL,
  relative_due_days INT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at_UTC DATETIME NOT NULL DEFAULT (UTC_TIMESTAMP()),
  updated_at_UTC DATETIME NOT NULL DEFAULT (UTC_TIMESTAMP()),
  archived_at_UTC DATETIME NULL,
  KEY idx_tti_template (template_id),
  CONSTRAINT fk_tti_template FOREIGN KEY (template_id) REFERENCES todo_templates (id),
  CONSTRAINT fk_tti_category FOREIGN KEY (category_id) REFERENCES categories (id),
  CONSTRAINT fk_tti_priority FOREIGN KEY (priority_id) REFERENCES priorities (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
