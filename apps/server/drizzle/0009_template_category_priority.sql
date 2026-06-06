-- Template-level category/priority: when set, they override every item's own
-- category/priority at instantiation (item-level applies only when unset).

ALTER TABLE templates
  ADD COLUMN category_id BIGINT UNSIGNED NULL,
  ADD COLUMN priority_id BIGINT UNSIGNED NULL,
  ADD CONSTRAINT fk_templates_category FOREIGN KEY (category_id) REFERENCES categories (id),
  ADD CONSTRAINT fk_templates_priority FOREIGN KEY (priority_id) REFERENCES priorities (id);
