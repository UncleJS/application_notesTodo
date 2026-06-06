-- Per-item sharing to users and groups at view/edit level.
-- Exactly one of user_id / group_id is set (real FKs on both).

CREATE TABLE item_shares (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  item_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NULL,
  group_id BIGINT UNSIGNED NULL,
  level ENUM('view','edit') NOT NULL,
  created_at_UTC DATETIME NOT NULL DEFAULT (UTC_TIMESTAMP()),
  updated_at_UTC DATETIME NOT NULL DEFAULT (UTC_TIMESTAMP()),
  archived_at_UTC DATETIME NULL,
  user_pair_active VARCHAR(64) GENERATED ALWAYS AS (
    CASE WHEN archived_at_UTC IS NULL AND user_id IS NOT NULL
      THEN CONCAT(item_id, '-', user_id) ELSE NULL END
  ) VIRTUAL,
  group_pair_active VARCHAR(64) GENERATED ALWAYS AS (
    CASE WHEN archived_at_UTC IS NULL AND group_id IS NOT NULL
      THEN CONCAT(item_id, '-', group_id) ELSE NULL END
  ) VIRTUAL,
  UNIQUE KEY uk_item_shares_user_active (user_pair_active),
  UNIQUE KEY uk_item_shares_group_active (group_pair_active),
  KEY idx_item_shares_item (item_id),
  KEY idx_item_shares_user (user_id),
  KEY idx_item_shares_group (group_id),
  CONSTRAINT fk_item_shares_item FOREIGN KEY (item_id) REFERENCES items (id),
  CONSTRAINT fk_item_shares_user FOREIGN KEY (user_id) REFERENCES users (id),
  CONSTRAINT fk_item_shares_group FOREIGN KEY (group_id) REFERENCES `groups` (id),
  CONSTRAINT chk_item_shares_one_grantee CHECK ((user_id IS NULL) <> (group_id IS NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
