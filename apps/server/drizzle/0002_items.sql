-- Lookups (settings-managed, FK'd from items) + class-table-inheritance items.

CREATE TABLE categories (
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
  UNIQUE KEY uk_categories_name_active (name_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE priorities (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(64) NOT NULL,
  weight INT NOT NULL DEFAULT 0,
  color VARCHAR(16) NULL,
  created_at_UTC DATETIME NOT NULL DEFAULT (UTC_TIMESTAMP()),
  updated_at_UTC DATETIME NOT NULL DEFAULT (UTC_TIMESTAMP()),
  archived_at_UTC DATETIME NULL,
  name_active VARCHAR(64) GENERATED ALWAYS AS (
    CASE WHEN archived_at_UTC IS NULL THEN name ELSE NULL END
  ) VIRTUAL,
  UNIQUE KEY uk_priorities_name_active (name_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Base table: links/tags/shares/reminders all FK here.
CREATE TABLE items (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  item_type ENUM('note','todo','calendar') NOT NULL,
  owner_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(512) NOT NULL,
  category_id BIGINT UNSIGNED NULL,
  priority_id BIGINT UNSIGNED NULL,
  created_at_UTC DATETIME NOT NULL DEFAULT (UTC_TIMESTAMP()),
  updated_at_UTC DATETIME NOT NULL DEFAULT (UTC_TIMESTAMP()),
  archived_at_UTC DATETIME NULL,
  KEY idx_items_owner (owner_id),
  KEY idx_items_type (item_type),
  KEY idx_items_archived (archived_at_UTC),
  CONSTRAINT fk_items_owner FOREIGN KEY (owner_id) REFERENCES users (id),
  CONSTRAINT fk_items_category FOREIGN KEY (category_id) REFERENCES categories (id),
  CONSTRAINT fk_items_priority FOREIGN KEY (priority_id) REFERENCES priorities (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE notes (
  item_id BIGINT UNSIGNED PRIMARY KEY,
  body_md MEDIUMTEXT NULL,
  pinned BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT fk_notes_item FOREIGN KEY (item_id) REFERENCES items (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE todos (
  item_id BIGINT UNSIGNED PRIMARY KEY,
  done BOOLEAN NOT NULL DEFAULT FALSE,
  done_at_UTC DATETIME NULL,
  due_at_UTC DATETIME NULL,
  notes_md TEXT NULL,
  KEY idx_todos_due (due_at_UTC),
  CONSTRAINT fk_todos_item FOREIGN KEY (item_id) REFERENCES items (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE calendar_items (
  item_id BIGINT UNSIGNED PRIMARY KEY,
  start_at_UTC DATETIME NOT NULL,
  end_at_UTC DATETIME NULL,
  all_day BOOLEAN NOT NULL DEFAULT FALSE,
  location VARCHAR(255) NULL,
  description_md TEXT NULL,
  rrule VARCHAR(1024) NULL,
  timezone VARCHAR(64) NULL,
  KEY idx_cal_start (start_at_UTC),
  CONSTRAINT fk_cal_item FOREIGN KEY (item_id) REFERENCES items (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE calendar_exdates (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  calendar_item_id BIGINT UNSIGNED NOT NULL,
  exdate_at_UTC DATETIME NOT NULL,
  KEY idx_exdates_item (calendar_item_id),
  CONSTRAINT fk_exdates_cal FOREIGN KEY (calendar_item_id) REFERENCES calendar_items (item_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO priorities (name, weight, color) VALUES
  ('Low', 1, '#4ade80'),
  ('Medium', 2, '#facc15'),
  ('High', 3, '#f87171');

INSERT INTO categories (name, sort_order) VALUES
  ('Personal', 1),
  ('Work', 2);
