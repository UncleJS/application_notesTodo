-- Generalize todo templates: a template can now hold notes, todos and calendar
-- events (item_type per item), plus template-level tags applied to every item
-- at instantiation (in addition to per-item tags).

RENAME TABLE
  todo_templates TO templates,
  todo_template_items TO template_items,
  todo_template_item_tags TO template_item_tags;

ALTER TABLE template_items
  ADD COLUMN item_type ENUM('note','todo','calendar') NOT NULL DEFAULT 'todo' AFTER template_id,
  -- note fields
  ADD COLUMN body_md MEDIUMTEXT NULL,
  -- calendar fields: start = base date + relative_due_days at start_time_UTC
  ADD COLUMN start_time_UTC TIME NULL,
  ADD COLUMN duration_minutes INT NULL,
  ADD COLUMN all_day BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN location VARCHAR(255) NULL,
  ADD COLUMN description_md TEXT NULL;

CREATE TABLE template_tags (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  template_id BIGINT UNSIGNED NOT NULL,
  tag_id BIGINT UNSIGNED NOT NULL,
  created_at_UTC DATETIME NOT NULL DEFAULT (UTC_TIMESTAMP()),
  updated_at_UTC DATETIME NOT NULL DEFAULT (UTC_TIMESTAMP()),
  archived_at_UTC DATETIME NULL,
  pair_active VARCHAR(64) GENERATED ALWAYS AS (
    CASE WHEN archived_at_UTC IS NULL THEN CONCAT(template_id, '-', tag_id) ELSE NULL END
  ) VIRTUAL,
  UNIQUE KEY uk_template_tags_active (pair_active),
  KEY idx_template_tags_template (template_id),
  KEY idx_template_tags_tag (tag_id),
  CONSTRAINT fk_template_tags_template FOREIGN KEY (template_id) REFERENCES templates (id),
  CONSTRAINT fk_template_tags_tag FOREIGN KEY (tag_id) REFERENCES tags (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
