-- Append-only audit trail for items. One row per logical mutation event.
-- NEVER updated, archived, or deleted (the one table exempt from the archive
-- lifecycle — no archived_at_UTC). category_id / priority_id are snapshots
-- captured at write time so admin filtering does not depend on the item's
-- current state or the item still existing.
--
-- No FK on item_id on purpose: audit rows must outlive the item they describe.
-- FK on actor_user_id is safe — users are soft-archived, never hard-deleted.

CREATE TABLE audit_logs (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  item_id BIGINT UNSIGNED NOT NULL,
  item_type ENUM('note','todo','calendar') NOT NULL,
  actor_user_id BIGINT UNSIGNED NOT NULL,
  action ENUM(
    'create','update','archive','restore',
    'tag_add','tag_remove','link_add','link_remove',
    'share_grant','share_revoke','share_update'
  ) NOT NULL,
  changes JSON NULL,
  category_id BIGINT UNSIGNED NULL,
  priority_id BIGINT UNSIGNED NULL,
  created_at_UTC DATETIME NOT NULL DEFAULT (UTC_TIMESTAMP()),
  KEY idx_audit_item (item_id),
  KEY idx_audit_actor (actor_user_id),
  KEY idx_audit_created (created_at_UTC),
  KEY idx_audit_type (item_type),
  KEY idx_audit_actor_created (actor_user_id, created_at_UTC),
  CONSTRAINT fk_audit_actor FOREIGN KEY (actor_user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
