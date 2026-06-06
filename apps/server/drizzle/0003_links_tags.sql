-- Shared tag pool + any↔any item links.

CREATE TABLE tags (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(64) NOT NULL,
  color VARCHAR(16) NULL,
  created_at_UTC DATETIME NOT NULL DEFAULT (UTC_TIMESTAMP()),
  updated_at_UTC DATETIME NOT NULL DEFAULT (UTC_TIMESTAMP()),
  archived_at_UTC DATETIME NULL,
  name_active VARCHAR(64) GENERATED ALWAYS AS (
    CASE WHEN archived_at_UTC IS NULL THEN name ELSE NULL END
  ) VIRTUAL,
  UNIQUE KEY uk_tags_name_active (name_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE item_tags (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  item_id BIGINT UNSIGNED NOT NULL,
  tag_id BIGINT UNSIGNED NOT NULL,
  created_at_UTC DATETIME NOT NULL DEFAULT (UTC_TIMESTAMP()),
  updated_at_UTC DATETIME NOT NULL DEFAULT (UTC_TIMESTAMP()),
  archived_at_UTC DATETIME NULL,
  pair_active VARCHAR(64) GENERATED ALWAYS AS (
    CASE WHEN archived_at_UTC IS NULL THEN CONCAT(item_id, '-', tag_id) ELSE NULL END
  ) VIRTUAL,
  UNIQUE KEY uk_item_tags_active (pair_active),
  KEY idx_item_tags_item (item_id),
  KEY idx_item_tags_tag (tag_id),
  CONSTRAINT fk_item_tags_item FOREIGN KEY (item_id) REFERENCES items (id),
  CONSTRAINT fk_item_tags_tag FOREIGN KEY (tag_id) REFERENCES tags (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Stored once per pair; rendered bidirectionally. Ordered generated pair
-- prevents duplicates regardless of direction.
CREATE TABLE item_links (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  from_item_id BIGINT UNSIGNED NOT NULL,
  to_item_id BIGINT UNSIGNED NOT NULL,
  link_type VARCHAR(64) NULL,
  created_at_UTC DATETIME NOT NULL DEFAULT (UTC_TIMESTAMP()),
  updated_at_UTC DATETIME NOT NULL DEFAULT (UTC_TIMESTAMP()),
  archived_at_UTC DATETIME NULL,
  pair_active VARCHAR(64) GENERATED ALWAYS AS (
    CASE WHEN archived_at_UTC IS NULL
      THEN CONCAT(LEAST(from_item_id, to_item_id), '-', GREATEST(from_item_id, to_item_id))
      ELSE NULL END
  ) VIRTUAL,
  UNIQUE KEY uk_item_links_active (pair_active),
  KEY idx_item_links_from (from_item_id),
  KEY idx_item_links_to (to_item_id),
  CONSTRAINT fk_item_links_from FOREIGN KEY (from_item_id) REFERENCES items (id),
  CONSTRAINT fk_item_links_to FOREIGN KEY (to_item_id) REFERENCES items (id),
  CONSTRAINT chk_item_links_distinct CHECK (from_item_id <> to_item_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
