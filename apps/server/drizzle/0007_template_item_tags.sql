-- Tags on template items: copied onto the created todos at instantiation.
-- Mirrors item_tags (archive-only lifecycle, unique-active pair).

CREATE TABLE todo_template_item_tags (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  template_item_id BIGINT UNSIGNED NOT NULL,
  tag_id BIGINT UNSIGNED NOT NULL,
  created_at_UTC DATETIME NOT NULL DEFAULT (UTC_TIMESTAMP()),
  updated_at_UTC DATETIME NOT NULL DEFAULT (UTC_TIMESTAMP()),
  archived_at_UTC DATETIME NULL,
  pair_active VARCHAR(64) GENERATED ALWAYS AS (
    CASE WHEN archived_at_UTC IS NULL THEN CONCAT(template_item_id, '-', tag_id) ELSE NULL END
  ) VIRTUAL,
  UNIQUE KEY uk_ttit_active (pair_active),
  KEY idx_ttit_item (template_item_id),
  KEY idx_ttit_tag (tag_id),
  CONSTRAINT fk_ttit_item FOREIGN KEY (template_item_id) REFERENCES todo_template_items (id),
  CONSTRAINT fk_ttit_tag FOREIGN KEY (tag_id) REFERENCES tags (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
