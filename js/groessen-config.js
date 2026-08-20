// js/groessen-config.js — SIB: zentrale Größen-Logik
// ============================================================
// Statt einer einzigen globalen Größenliste bekommt jedes Produkt sein
// passendes Größenset über Kategorie + (bei "Mode & Accessoires") die
// Unterkategorie zugewiesen. Wird von produkt-modal.js, dashboard.js und
// produkt-import.js gemeinsam genutzt, damit die Logik nicht auseinanderläuft.

export const MODE_KATEGORIE_NAME = 'Mode & Accessoires'
export const LEBENSMITTEL_KATEGORIE_NAME = 'Lebensmittel'

// Unterkategorien je Hauptkategorie. Frueher gab es Unterkategorien nur bei
// Mode & Accessoires; seit den Lebensmitteln ist das eine Zuordnung pro
// Kategorie.
export const UNTERKATEGORIEN_NACH_KATEGORIE = {
  [MODE_KATEGORIE_NAME]: [
    { value: 'oberteile', label: 'Oberteile' },
    { value: 'hosen', label: 'Hosen' },
    { value: 'kinderkleidung', label: 'Kinderkleidung' },
    { value: 'schuhe', label: 'Schuhe' },
    { value: 'taschen', label: 'Taschen' }
  ],
  [LEBENSMITTEL_KATEGORIE_NAME]: [
    { value: 'gewuerzmischungen', label: 'Gewürzmischungen' }
  ]
}

// Flache Liste aller Unterkategorien, u.a. fuer die Label-Aufloesung und den
// CSV-Import.
export const UNTERKATEGORIEN = Object.values(UNTERKATEGORIEN_NACH_KATEGORIE).flat()

export function unterkategorienFuer (kategorieName) {
  return UNTERKATEGORIEN_NACH_KATEGORIE[kategorieName] || []
}

export function hatUnterkategorien (kategorieName) {
  return unterkategorienFuer(kategorieName).length > 0
}

function baueHosenGroessen () {
  const weiten = [26, 27, 28, 29, 30, 31, 32, 33, 34, 36, 38, 40]
  const laengen = [28, 30, 32, 34]
  const out = []
  weiten.forEach((w) => laengen.forEach((l) => out.push(`W${w}/L${l}`)))
  // Sicherstellen, dass W28/L28 auf jeden Fall enthalten ist (explizit
  // angefragte Größe -- falls sie durch eine künftige Änderung der Weiten/
  // Längen-Listen oben mal rausfallen sollte).
  if (!out.includes('W28/L28')) out.splice(out.indexOf('W28/L30'), 0, 'W28/L28')
  return out
}

export const GROESSEN_SETS = {
  oberteile: ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'],
  hosen: baueHosenGroessen(),
  kinderkleidung: ['92', '98', '104', '110', '116', '122', '128', '134', '140', '146', '152', '158', '164'],
  schuhe: ['36', '37', '38', '39', '40', '41', '42', '43', '44', '45', '46'],
  taschen: ['Einheitsgröße'],
  gewuerzmischungen: ['Klein (20 g)', 'Groß (80 g)'],
  einheitsgroesse: ['Einheitsgröße'] // Fallback fuer Kategorien ohne eigenes Set
}

// Alle jemals möglichen Größenwerte, dedupliziert -- fürs permissive CSV-Einlesen
// (die Vorlage zeigt zwar nur die passende Teilmenge, aber falls jemand eine
// Datei manuell erweitert oder eine ältere Vorlage wiederverwendet, wird trotzdem
// jede erkannte Größen-Spalte korrekt gelesen).
export const ALLE_GROESSEN_LABELS = [...new Set(Object.values(GROESSEN_SETS).flat())]

// Ermittelt das passende Groessenset fuer ein Produkt. Massgeblich ist die
// Unterkategorie; die Hauptkategorie dient nur noch als Rueckfallebene.
export function ermittleGroessenSet (kategorieName, unterkategorie) {
  if (unterkategorie && GROESSEN_SETS[unterkategorie]) {
    return GROESSEN_SETS[unterkategorie]
  }
  return GROESSEN_SETS.einheitsgroesse
}

export function unterkategorieLabel (value) {
  return UNTERKATEGORIEN.find((u) => u.value === value)?.label || value
}
