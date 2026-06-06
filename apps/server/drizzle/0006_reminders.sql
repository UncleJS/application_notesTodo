-- Reminders fire via email (SMTP from settings) and/or webhook.
-- channels: comma-separated subset of email,webhook.
-- next_fire_at_UTC drives the scheduler; locked_* is the worker claim.

CREATE TABLE reminders (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  item_id BIGINT UNSIGNED NOT NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  recipient_user_id BIGINT UNSIGNED NULL,
  remind_at_UTC DATETIME NULL,
  offset_minutes INT NULL,
  channels VARCHAR(32) NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  next_fire_at_UTC DATETIME NULL,
  locked_at_UTC DATETIME NULL,
  locked_by VARCHAR(64) NULL,
  created_at_UTC DATETIME NOT NULL DEFAULT (UTC_TIMESTAMP()),
  updated_at_UTC DATETIME NOT NULL DEFAULT (UTC_TIMESTAMP()),
  archived_at_UTC DATETIME NULL,
  KEY idx_reminders_due (enabled, next_fire_at_UTC),
  KEY idx_reminders_item (item_id),
  CONSTRAINT fk_reminders_item FOREIGN KEY (item_id) REFERENCES items (id),
  CONSTRAINT fk_reminders_creator FOREIGN KEY (created_by) REFERENCES users (id),
  CONSTRAINT fk_reminders_recipient FOREIGN KEY (recipient_user_id) REFERENCES users (id),
  CONSTRAINT chk_reminders_when CHECK (remind_at_UTC IS NOT NULL OR offset_minutes IS NOT NULL)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Dispatch log. The generated unique column makes "sent once per
-- (reminder, occurrence, channel)" a hard DB guarantee (restart-safe).
CREATE TABLE reminder_dispatch (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  reminder_id BIGINT UNSIGNED NOT NULL,
  item_id BIGINT UNSIGNED NOT NULL,
  occurrence_at_UTC DATETIME NOT NULL,
  channel ENUM('email','webhook') NOT NULL,
  status ENUM('sent','failed') NOT NULL,
  attempt INT NOT NULL DEFAULT 1,
  error TEXT NULL,
  dispatched_at_UTC DATETIME NOT NULL DEFAULT (UTC_TIMESTAMP()),
  created_at_UTC DATETIME NOT NULL DEFAULT (UTC_TIMESTAMP()),
  sent_unique VARCHAR(128) GENERATED ALWAYS AS (
    CASE WHEN status = 'sent'
      THEN CONCAT(reminder_id, '-', occurrence_at_UTC, '-', channel) ELSE NULL END
  ) VIRTUAL,
  UNIQUE KEY uk_dispatch_sent (sent_unique),
  KEY idx_dispatch_reminder (reminder_id),
  CONSTRAINT fk_dispatch_reminder FOREIGN KEY (reminder_id) REFERENCES reminders (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
