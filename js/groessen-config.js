// js/groessen-config.js — SIB: zentrale Größen-Logik
// ============================================================
// Statt einer einzigen globalen Größenliste bekommt jedes Produkt sein
// passendes Größenset über Kategorie + (bei "Mode & Accessoires") die
// Unterkategorie zugewiesen. Wird von produkt-modal.js, dashboard.js und
// produkt-import.js gemeinsam genutzt, damit die Logik nicht auseinanderläuft.

export const MODE_KATEGORIE_NAME = 'Mode & Accessoires'

export const UNTERKATEGORIEN = [
  { value: 'oberteile', label: 'Oberteile' },
  { value: 'hosen', label: 'Hosen' },
  { value: 'kinderkleidung', label: 'Kinderkleidung' },
  { value: 'schuhe', label: 'Schuhe' },
  { value: 'taschen', label: 'Taschen' }
]

function baueHosenGroessen () {
  const weiten = [26, 27, 28, 29, 30, 31, 32, 33, 34, 36, 38, 40]
  const laengen = [30, 32, 34]
  const out = []
  weiten.forEach((w) => laengen.forEach((l) => out.push(`W${w}/L${l}`)))
  return out
}

export const GROESSEN_SETS = {
  oberteile: ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'],
  hosen: baueHosenGroessen(),
  kinderkleidung: ['92', '98', '104', '110', '116', '122', '128', '134', '140', '146', '152', '158', '164'],
  schuhe: ['36', '37', '38', '39', '40', '41', '42', '43', '44', '45', '46'],
  taschen: ['Einheitsgröße'],
  einheitsgroesse: ['Einheitsgröße'] // Fallback für alle Kategorien außer Mode & Accessoires
}

// Alle jemals möglichen Größenwerte, dedupliziert -- fürs permissive CSV-Einlesen
// (die Vorlage zeigt zwar nur die passende Teilmenge, aber falls jemand eine
// Datei manuell erweitert oder eine ältere Vorlage wiederverwendet, wird trotzdem
// jede erkannte Größen-Spalte korrekt gelesen).
export const ALLE_GROESSEN_LABELS = [...new Set(Object.values(GROESSEN_SETS).flat())]

// Ermittelt das passende Größenset für ein Produkt.
export function ermittleGroessenSet (kategorieName, unterkategorie) {
  if (kategorieName === MODE_KATEGORIE_NAME && unterkategorie && GROESSEN_SETS[unterkategorie]) {
    return GROESSEN_SETS[unterkategorie]
  }
  return GROESSEN_SETS.einheitsgroesse
}

export function unterkategorieLabel (value) {
  return UNTERKATEGORIEN.find((u) => u.value === value)?.label || value
}
