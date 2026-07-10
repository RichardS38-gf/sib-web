// js/newsletter-zeitraum.js — SIB Newsletter: Zeitraum-Logik
// ============================================================
// Zentrale Stelle für "welche Ausgabe ist gerade aktuell / als nächstes dran".
// Sowohl newsletter.html (öffentliche Seite) als auch dashboard.html
// (Händler-Planung) importieren diese Funktionen, damit beide Seiten
// IMMER dieselbe Ausgabe meinen — ganz ohne manuelles Nachtragen.
//
// Wie es automatisch weiterläuft:
// - Jede Ausgabe wird aus dem heutigen Datum berechnet, nicht aus einem
//   gespeicherten Wert. Genau am 1. jeden Monats (Mitternacht) kippt die
//   Webseite von selbst auf die neue Ausgabe um — kein manueller Eingriff.
// - Händler pflegen im Dashboard immer die Ausgabe des kommenden Monats.
//   Sobald der 1. dieses kommenden Monats erreicht ist, geht ihre Auswahl
//   automatisch live, und im Dashboard öffnet sich direkt die nächste
//   Planungs-Ausgabe (der Monat danach) — Händler können also bis
//   einschließlich dem letzten Tag vor dem 1. Änderungen vornehmen.
// - Ausgabe-Nummer zählt automatisch hoch, ausgehend vom Start-Monat.

// Ausgabe 1 = Januar 2026 (Referenzpunkt für die automatische Durchnummerierung)
const START_JAHR = 2026
const START_MONAT = 1

function normalisiere (jahr, monat) {
  while (monat > 12) { monat -= 12; jahr += 1 }
  while (monat < 1) { monat += 12; jahr -= 1 }
  return { jahr, monat }
}

// Die Ausgabe, die auf der öffentlichen Newsletter-Seite gerade live ist
// (immer der aktuelle Kalendermonat — wechselt exakt am 1. des Monats).
export function aktuelleAusgabe (heute = new Date()) {
  return normalisiere(heute.getFullYear(), heute.getMonth() + 1)
}

// Die Ausgabe, für die Händler im Dashboard gerade Artikel einplanen
// (immer die auf die aktuelle folgende Ausgabe).
export function naechsteAusgabe (heute = new Date()) {
  const { jahr, monat } = aktuelleAusgabe(heute)
  return normalisiere(jahr, monat + 1)
}

// Fortlaufende Ausgabe-Nummer, z.B. 7 für Juli 2026.
export function ausgabeNummer ({ jahr, monat }) {
  return (jahr - START_JAHR) * 12 + (monat - START_MONAT) + 1
}

// Erster Tag des Zielmonats als 'YYYY-MM-DD' — so werden Newsletter-Einträge
// in der Datenbank einem Monat zugeordnet (Spalte "monat").
export function monatDatum ({ jahr, monat }) {
  return `${jahr}-${String(monat).padStart(2, '0')}-01`
}

// Monatsname auf Deutsch, z.B. "Juli".
export function monatName ({ jahr, monat }) {
  return new Date(jahr, monat - 1, 1).toLocaleDateString('de-DE', { month: 'long' })
}
