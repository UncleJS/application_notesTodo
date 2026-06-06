-- Todo template items can carry a status, copied onto the created todo at
-- instantiation.

ALTER TABLE template_items
  ADD COLUMN status_id BIGINT UNSIGNED NULL,
  ADD CONSTRAINT fk_template_items_status FOREIGN KEY (status_id) REFERENCES statuses (id);
