-- Produktfeld "Farbe": Freitext, optional (z.B. "Oliv", "Schwarz/Weiß")
ALTER TABLE produkte
  ADD COLUMN IF NOT EXISTS farbe text;

COMMENT ON COLUMN produkte.farbe IS 'Farbe des Produkts als Freitext, z.B. Oliv oder Schwarz/Weiß';
