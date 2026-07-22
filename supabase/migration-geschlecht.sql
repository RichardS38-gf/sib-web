-- Produktfeld "Geschlecht": Herren / Damen / Unisex
ALTER TABLE produkte
  ADD COLUMN IF NOT EXISTS geschlecht text
  CHECK (geschlecht IN ('Herren', 'Damen', 'Unisex'));

COMMENT ON COLUMN produkte.geschlecht IS 'Zielgruppe des Produkts: Herren, Damen oder Unisex';
