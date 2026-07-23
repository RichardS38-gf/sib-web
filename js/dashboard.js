// js/dashboard.js — SIB Händler-Dashboard
// Geschützte Seite: nur eingeloggte Händler sehen ihre eigenen Daten.
// Verknüpfung Händler <-> Shop über shops.user_id = auth.uid().

import { supabase } from './supabase.js'
import { initHeaderSearch } from './header.js'
import { initProduktModal, oeffneProduktModal } from './produkt-modal.js?v=11'
import { naechsteAusgabe, monatDatum, monatName, ausgabeNummer } from './newsletter-zeitraum.js'
import { initProduktImport } from './produkt-import.js?v=9'

const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })

let shop = null // aktueller Shop des eingeloggten Händlers
let reservierungenListe = [] // Cache für die E-Mail-Daten beim Bestätigen

const NEWSLETTER_LIMIT = 3

// Wandelt eine Datenbank-Fehlermeldung in einen verständlichen Text um --
// insbesondere die Limit-Meldung des newsletter_eintraege-Triggers.
function newsletterFehlerText (err) {
  if ((err?.message || '').includes('newsletter_limit_erreicht')) {
    return `Limit erreicht: pro Ausgabe sind maximal ${NEWSLETTER_LIMIT} Artikel möglich.`
  }
  return 'Speichern fehlgeschlagen.'
}

function esc (value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatDatum (value) {
  if (!value) return '—'
  const d = new Date(value)
  if (isNaN(d)) return '—'
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// ── Mobile-Menü ──
function initMobileMenu () {
  const burger = document.querySelector('.site-header__burger')
  const menu = document.getElementById('mobile-menu')
  if (!burger || !menu) return
  burger.addEventListener('click', () => {
    const open = burger.getAttribute('aria-expanded') === 'true'
    burger.setAttribute('aria-expanded', String(!open))
    burger.setAttribute('aria-label', open ? 'Menü öffnen' : 'Menü schließen')
    menu.hidden = open
  })
}

// ── Tabs ──
function initTabs () {
  const tabs = document.querySelectorAll('.dash-tab')
  const panels = document.querySelectorAll('.dash-panel')
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const name = tab.dataset.tab
      tabs.forEach((t) => t.classList.toggle('is-active', t === tab))
      panels.forEach((p) => {
        const active = p.dataset.panel === name
        p.classList.toggle('is-active', active)
        p.hidden = !active
      })
    })
  })
}

// ── Logout ──
function initLogout () {
  const btn = document.getElementById('logout-btn')
  if (!btn) return
  btn.addEventListener('click', async () => {
    await supabase.auth.signOut()
    window.location.replace('haendler-login.html')
  })
}

// ── TAB 1: Reservierungen ──
function statusBadge (status) {
  const map = {
    offen: ['badge--outline', 'offen'],
    bestaetigt: ['badge', 'bestätigt'],
    abgelaufen: ['badge--muted', 'abgelaufen']
  }
  const [cls, label] = map[status] || ['badge--muted', status || '—']
  return `<span class="badge ${cls}">${esc(label)}</span>`
}

async function ladeReservierungen () {
  const el = document.getElementById('reservierungen-content')
  try {
    const { data, error } = await supabase
      .from('reservierungen')
      .select('*, produkte!inner(titel, shop_id)')
      .eq('produkte.shop_id', shop.id)
      .order('erstellt_am', { ascending: false })

    if (error) throw error
    const reservierungen = data || []
    reservierungenListe = reservierungen

    if (reservierungen.length === 0) {
      el.innerHTML = '<p class="dash-empty">Noch keine Reservierungen.</p>'
      return
    }

    const rows = reservierungen.map((r) => {
      const aktion = r.status === 'offen'
        ? `<button class="btn btn--primary" data-confirm="${esc(r.id)}" style="padding:0.4rem 0.9rem;font-size:var(--text-xs)">Bestätigen</button>`
        : '—'
      return `
        <tr>
          <td>${formatDatum(r.erstellt_am)}</td>
          <td class="is-wrap">${esc(r.produkte?.titel || '—')}</td>
          <td>${esc(r.kunde_name)}</td>
          <td>${esc(r.kunde_email)}</td>
          <td>${statusBadge(r.status)}</td>
          <td>${aktion}</td>
        </tr>`
    }).join('')

    el.innerHTML = `
      <div class="dash-table-wrap">
        <table class="dash-table">
          <thead>
            <tr>
              <th>Datum</th><th>Produkt</th><th>Kunde</th>
              <th>E-Mail</th><th>Status</th><th>Aktion</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`

    el.querySelectorAll('[data-confirm]').forEach((btn) => {
      btn.addEventListener('click', () => bestaetige(btn.dataset.confirm, btn))
    })
  } catch (err) {
    console.error('Reservierungen konnten nicht geladen werden:', err)
    el.innerHTML = '<p class="dash-empty">Reservierungen konnten nicht geladen werden.</p>'
  }
}

// Abholbereit-E-Mail an den Kunden (Edge Function) — stört den Ablauf nicht
async function sendeAbholbereitMail (r) {
  try {
    await supabase.functions.invoke('send-email', {
      body: {
        type: 'abholbereit',
        kunde_name: r.kunde_name,
        kunde_email: r.kunde_email,
        produkt_titel: r.produkte?.titel || 'dein Artikel',
        shop_name: shop?.name || 'dem Geschäft',
        shop_adresse: shop?.adresse || '',
        reservierung_id: r.id
      }
    })
  } catch (err) {
    console.error('Abholbereit-E-Mail konnte nicht gesendet werden:', err)
  }
}

async function bestaetige (id, btn) {
  btn.disabled = true
  btn.textContent = '…'
  try {
    const { error } = await supabase
      .from('reservierungen')
      .update({ status: 'bestaetigt' })
      .eq('id', id)
    if (error) throw error

    // Kunde benachrichtigen (nicht blockierend)
    const r = reservierungenListe.find((x) => x.id === id)
    if (r) sendeAbholbereitMail(r)

    ladeReservierungen()
  } catch (err) {
    console.error('Bestätigen fehlgeschlagen:', err)
    btn.disabled = false
    btn.textContent = 'Bestätigen'
  }
}

// ── TAB 2: Produkte ──
async function ladeProdukte () {
  const el = document.getElementById('produkte-content')
  try {
    const { data, error } = await supabase
      .from('produkte')
      .select('*, kategorien(name)')
      .eq('shop_id', shop.id)
      .order('erstellt_am', { ascending: false })

    if (error) throw error
    const produkte = data || []

    if (produkte.length === 0) {
      el.innerHTML = '<p class="dash-empty">Noch keine Produkte. Füge dein erstes Produkt hinzu.</p>'
      return
    }

    el.innerHTML = `<div class="dash-produkte-grid">${produkte.map((p) => {
      const bilder = Array.isArray(p.bilder) ? p.bilder.filter(Boolean) : []
      const bild = bilder[0]
        ? `<img class="dash-produkt__image" src="${esc(bilder[0])}" alt="${esc(p.titel)}" loading="lazy">`
        : '<div class="dash-produkt__image"></div>'
      const preis = (p.preis !== null && p.preis !== undefined) ? euro.format(p.preis) : ''
      const status = p.verfuegbar !== false ? 'Verfügbar: ja' : 'Verfügbar: nein'
      const freigabeBadge = p.freigegeben === true
        ? '<span class="badge badge--muted dash-produkt__badge">Freigegeben</span>'
        : '<span class="badge badge--outline dash-produkt__badge">Ausstehend</span>'

      return `
        <div class="dash-produkt">
          ${bild}
          ${freigabeBadge}
          <p class="dash-produkt__title">${esc(p.titel)}</p>
          ${p.ean ? `<p class="dash-produkt__ean">EAN: ${esc(p.ean)}</p>` : ''}
          <p class="dash-produkt__price">${esc(preis)}</p>
          <p class="dash-produkt__status">${status}</p>

          <div class="dash-produkt__actions">
            <button class="btn btn--outline dash-produkt__edit" data-edit="${esc(p.id)}">Bearbeiten</button>
            <button class="dash-produkt__delete" data-delete="${esc(p.id)}" data-titel="${esc(p.titel)}">Löschen</button>
          </div>
        </div>`
    }).join('')}</div>`

    el.querySelectorAll('[data-delete]').forEach((btn) => {
      btn.addEventListener('click', () => loesche(btn.dataset.delete, btn.dataset.titel))
    })

    el.querySelectorAll('[data-edit]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const p = produkte.find((x) => x.id === btn.dataset.edit)
        if (!p) return
        oeffneProduktModal({
          produkt: p,
          onSave: () => ladeProdukte()
        })
      })
    })
  } catch (err) {
    console.error('Produkte konnten nicht geladen werden:', err)
    el.innerHTML = '<p class="dash-empty">Produkte konnten nicht geladen werden.</p>'
  }
}

async function loesche (id, titel) {
  if (!window.confirm(`Produkt „${titel}" wirklich löschen?`)) return
  try {
    const { error } = await supabase.from('produkte').delete().eq('id', id)
    if (error) throw error
    ladeProdukte()
  } catch (err) {
    console.error('Löschen fehlgeschlagen:', err)
    window.alert('Das Produkt konnte nicht gelöscht werden.')
  }
}

async function ladeKategorienDropdown () {
  const select = document.getElementById('pf-kategorie')
  try {
    const { data, error } = await supabase.from('kategorien').select('id, name').order('name')
    if (error) throw error
    ;(data || []).forEach((k) => {
      const opt = document.createElement('option')
      opt.value = k.id
      opt.textContent = k.name
      select.appendChild(opt)
    })
  } catch (err) {
    console.error('Kategorien konnten nicht geladen werden:', err)
  }
}

function initProduktForm () {
  const toggleBtn = document.getElementById('toggle-produkt-form')
  if (!toggleBtn) return
  toggleBtn.addEventListener('click', () => {
    oeffneProduktModal({
      onSave: async (daten) => {
        const { data, error } = await supabase.from('produkte').insert({
          ...daten,
          shop_id: shop.id,
          freigegeben: false
        }).select('id').single()
        if (error) throw error
        ladeProdukte()
        return data.id
      }
    })
  })
}

// ── TAB: Newsletter ──
async function ladeNewsletterTab () {
  const el = document.getElementById('newsletter-content')
  const zielEl = document.getElementById('newsletter-ziel')
  if (!el) return

  const ziel = naechsteAusgabe()
  const monatStr = monatDatum(ziel)

  try {
    const [{ data: produkte, error: pErr }, { data: eintraege, error: eErr }] = await Promise.all([
      supabase.from('produkte')
        .select('id, titel, preis, bilder, angebotspreis, angebot_von, angebot_bis')
        .eq('shop_id', shop.id)
        .eq('freigegeben', true)
        .eq('verfuegbar', true)
        .order('titel'),
      supabase.from('newsletter_eintraege')
        .select('produkt_id, typ')
        .eq('shop_id', shop.id)
        .eq('monat', monatStr)
    ])
    if (pErr) throw pErr
    if (eErr) throw eErr

    const produkteListe = produkte || []

    const gesetzt = { neu: new Set(), sale: new Set() }
    ;(eintraege || []).forEach((e) => { gesetzt[e.typ]?.add(e.produkt_id) })
    const beteiligt = new Set([...gesetzt.neu, ...gesetzt.sale])
    const limitErreicht = beteiligt.size >= NEWSLETTER_LIMIT

    if (zielEl) {
      zielEl.textContent = `Für Ausgabe ${String(ausgabeNummer(ziel)).padStart(2, '0')} · ${monatName(ziel)} ${ziel.jahr} · ${beteiligt.size}/${NEWSLETTER_LIMIT} Artikel belegt`
    }

    if (produkteListe.length === 0) {
      el.innerHTML = '<p class="dash-empty">Noch keine freigegebenen Produkte, die du im Newsletter zeigen kannst.</p>'
      return
    }

    el.innerHTML = `<div class="dash-newsletter-liste">${produkteListe.map((p) => {
      const bild = p.bilder?.[0]
        ? `<img class="dash-newsletter__img" src="${esc(p.bilder[0])}" alt="${esc(p.titel)}" loading="lazy">`
        : '<div class="dash-newsletter__img"></div>'
      const preis = (p.preis !== null && p.preis !== undefined) ? euro.format(p.preis) : ''
      const saleAktiv = gesetzt.sale.has(p.id)
      const gesperrt = limitErreicht && !beteiligt.has(p.id)
      const gesperrtAttr = gesperrt ? 'disabled title="Limit von 3 Artikeln pro Ausgabe erreicht"' : ''

      return `
        <div class="dash-newsletter-item${gesperrt ? ' dash-newsletter-item--gesperrt' : ''}">
          <div class="dash-newsletter-row">
            ${bild}
            <div class="dash-newsletter-row__body">
              <p class="dash-newsletter-row__title">${esc(p.titel)}</p>
              <p class="dash-newsletter-row__price">${esc(preis)}</p>
            </div>
            <div class="dash-newsletter-row__checks">
              <label class="dash-check">
                <input type="checkbox" class="dash-newsletter-check" data-produkt="${esc(p.id)}" data-typ="neu" ${gesetzt.neu.has(p.id) ? 'checked' : ''} ${gesperrtAttr}>
                <span>Neu eingetroffen</span>
              </label>
              <label class="dash-check">
                <input type="checkbox" class="dash-newsletter-check" data-produkt="${esc(p.id)}" data-typ="sale" data-saved="${saleAktiv ? 'true' : 'false'}" ${saleAktiv ? 'checked' : ''} ${gesperrtAttr}>
                <span>Sonderangebot</span>
              </label>
              <button class="dash-newsletter-row-save" type="button" data-produkt="${esc(p.id)}" ${gesperrt ? 'disabled' : ''}>Speichern</button>
              <span class="dash-newsletter-row-feedback" data-produkt="${esc(p.id)}" aria-live="polite"></span>
            </div>
          </div>
          <div class="dash-newsletter-sale-form" data-produkt="${esc(p.id)}" ${saleAktiv ? '' : 'hidden'}>
            <div class="dash-newsletter-sale-form__row">
              <div class="dash-newsletter-sale-form__field">
                <label for="nl-sale-preis-${esc(p.id)}">Angebotspreis (€) *</label>
                <input class="form-input dash-newsletter-sale-preis" id="nl-sale-preis-${esc(p.id)}" type="number" min="0" step="0.01" value="${p.angebotspreis ?? ''}">
              </div>
              <div class="dash-newsletter-sale-form__field">
                <label for="nl-sale-von-${esc(p.id)}">Gültig ab</label>
                <input class="form-input dash-newsletter-sale-von" id="nl-sale-von-${esc(p.id)}" type="date" value="${p.angebot_von || ''}">
              </div>
              <div class="dash-newsletter-sale-form__field">
                <label for="nl-sale-bis-${esc(p.id)}">Gültig bis</label>
                <div class="dash-newsletter-sale-bis-wrap">
                  <input class="form-input dash-newsletter-sale-bis" id="nl-sale-bis-${esc(p.id)}" type="date" value="${p.angebot_bis || ''}">
                  <button class="dash-newsletter-sale-remove" type="button" title="Sonderangebot entfernen">&#x2715;</button>
                </div>
              </div>
            </div>
            <p class="dash-newsletter-sale-hint">Wird auch im Shop als Streichpreis angezeigt, solange der Zeitraum aktiv ist.</p>
            <div class="dash-newsletter-sale-form__bar">
              <button class="btn btn--outline dash-newsletter-sale-save" type="button">Speichern</button>
              <span class="dash-newsletter-sale-feedback" aria-live="polite"></span>
            </div>
          </div>
        </div>`
    }).join('')}</div>`

    el.querySelectorAll('.dash-newsletter-check').forEach((cb) => {
      if (cb.dataset.typ === 'sale') {
        cb.addEventListener('change', () => {
          const form = el.querySelector(`.dash-newsletter-sale-form[data-produkt="${CSS.escape(cb.dataset.produkt)}"]`)
          if (cb.checked) {
            if (form) {
              form.hidden = false
              form.querySelector('.dash-newsletter-sale-preis')?.focus()
            }
          } else {
            if (form) form.hidden = true
            if (cb.dataset.saved === 'true') {
              toggleNewsletterEintrag(cb.dataset.produkt, 'sale', monatStr, false, cb)
              cb.dataset.saved = 'false'
            }
          }
        })
      }
      // 'neu'-Checkbox speichert nicht mehr sofort -- erst per Zeilen-Speichern-Button
    })

    el.querySelectorAll('.dash-newsletter-row-save').forEach((btn) => {
      btn.addEventListener('click', () => {
        const produktId = btn.dataset.produkt
        const cb = el.querySelector(`.dash-newsletter-check[data-produkt="${CSS.escape(produktId)}"][data-typ="neu"]`)
        const feedback = el.querySelector(`.dash-newsletter-row-feedback[data-produkt="${CSS.escape(produktId)}"]`)
        speichereNeuStatus(produktId, monatStr, cb, btn, feedback)
      })
    })

    el.querySelectorAll('.dash-newsletter-sale-save').forEach((btn) => {
      btn.addEventListener('click', () => {
        const form = btn.closest('.dash-newsletter-sale-form')
        const produktId = form.dataset.produkt
        const cb = el.querySelector(`.dash-newsletter-check[data-produkt="${CSS.escape(produktId)}"][data-typ="sale"]`)
        speichereSaleAngebot(produktId, monatStr, form, cb)
      })
    })

    el.querySelectorAll('.dash-newsletter-sale-remove').forEach((btn) => {
      btn.addEventListener('click', () => {
        const form = btn.closest('.dash-newsletter-sale-form')
        const produktId = form.dataset.produkt
        const cb = el.querySelector(`.dash-newsletter-check[data-produkt="${CSS.escape(produktId)}"][data-typ="sale"]`)
        entferneSaleAngebot(produktId, monatStr, form, cb)
      })
    })
  } catch (err) {
    console.error('Newsletter-Tab konnte nicht geladen werden:', err)
    el.innerHTML = '<p class="dash-empty">Newsletter-Daten konnten nicht geladen werden.</p>'
  }
}

// Sonderangebot speichern: Streichpreis + Zeitraum auf dem Produkt selbst
// (dieselben Felder wie im Produkt-Bearbeiten-Modal) + Newsletter-Eintrag anlegen
async function speichereSaleAngebot (produktId, monatStr, formEl, cb) {
  const feedback = formEl.querySelector('.dash-newsletter-sale-feedback')
  const btn = formEl.querySelector('.dash-newsletter-sale-save')
  if (feedback) feedback.innerHTML = ''

  const angebotspreisRaw = formEl.querySelector('.dash-newsletter-sale-preis').value
  const von = formEl.querySelector('.dash-newsletter-sale-von').value || null
  const bis = formEl.querySelector('.dash-newsletter-sale-bis').value || null

  if (!angebotspreisRaw) {
    if (feedback) feedback.innerHTML = '<span class="error-msg">Bitte einen Angebotspreis angeben.</span>'
    return
  }

  btn.disabled = true
  btn.textContent = 'Wird gespeichert…'

  try {
    const { error: upErr } = await supabase.from('produkte')
      .update({ angebotspreis: parseFloat(angebotspreisRaw), angebot_von: von, angebot_bis: bis })
      .eq('id', produktId)
    if (upErr) throw upErr

    const { error: insErr } = await supabase.from('newsletter_eintraege')
      .insert({ produkt_id: produktId, shop_id: shop.id, typ: 'sale', monat: monatStr })
    if (insErr && insErr.code !== '23505') throw insErr

    ladeNewsletterTab()
  } catch (err) {
    console.error('Sonderangebot speichern fehlgeschlagen:', err)
    if (feedback) feedback.innerHTML = `<span class="error-msg">${newsletterFehlerText(err)}</span>`
  } finally {
    btn.disabled = false
    btn.textContent = 'Speichern'
  }
}

// Sonderangebot komplett entfernen: Streichpreis + Zeitraum auf dem Produkt
// löschen (spiegelt sich automatisch im Produkt-Bearbeiten-Modal wider),
// Häkchen raus, Newsletter-Eintrag löschen.
async function entferneSaleAngebot (produktId, monatStr, formEl, cb) {
  if (!window.confirm('Sonderangebot wirklich entfernen? Der Streichpreis wird dabei gelöscht.')) return

  const feedback = formEl.querySelector('.dash-newsletter-sale-feedback')
  const btn = formEl.querySelector('.dash-newsletter-sale-remove')
  if (feedback) feedback.innerHTML = ''
  btn.disabled = true

  try {
    const { error: upErr } = await supabase.from('produkte')
      .update({ angebotspreis: null, angebot_von: null, angebot_bis: null })
      .eq('id', produktId)
    if (upErr) throw upErr

    const { error: delErr } = await supabase.from('newsletter_eintraege')
      .delete().eq('produkt_id', produktId).eq('typ', 'sale').eq('monat', monatStr)
    if (delErr) throw delErr

    formEl.querySelector('.dash-newsletter-sale-preis').value = ''
    formEl.querySelector('.dash-newsletter-sale-von').value = ''
    formEl.querySelector('.dash-newsletter-sale-bis').value = ''
    ladeNewsletterTab()
  } catch (err) {
    console.error('Sonderangebot entfernen fehlgeschlagen:', err)
    if (feedback) feedback.innerHTML = '<span class="error-msg">Entfernen fehlgeschlagen.</span>'
  } finally {
    btn.disabled = false
  }
}

async function toggleNewsletterEintrag (produktId, typ, monatStr, checked, cb) {
  cb.disabled = true
  try {
    if (checked) {
      const { error } = await supabase.from('newsletter_eintraege')
        .insert({ produkt_id: produktId, shop_id: shop.id, typ, monat: monatStr })
      if (error && error.code !== '23505') throw error // 23505 = existiert schon, kein Problem
    } else {
      const { error } = await supabase.from('newsletter_eintraege')
        .delete().eq('produkt_id', produktId).eq('typ', typ).eq('monat', monatStr)
      if (error) throw error
    }
    ladeNewsletterTab()
  } catch (err) {
    console.error('Newsletter-Eintrag konnte nicht gespeichert werden:', err)
    cb.checked = !checked
    window.alert(newsletterFehlerText(err))
  } finally {
    cb.disabled = false
  }
}

// "Neu eingetroffen"-Häkchen wird erst beim Klick auf den Zeilen-Speichern-Button
// tatsächlich gespeichert -- kein Sofort-Speichern mehr beim Anklicken der Checkbox.
async function speichereNeuStatus (produktId, monatStr, cb, btn, feedbackEl) {
  const checked = cb.checked
  btn.disabled = true
  if (feedbackEl) feedbackEl.innerHTML = ''
  try {
    if (checked) {
      const { error } = await supabase.from('newsletter_eintraege')
        .insert({ produkt_id: produktId, shop_id: shop.id, typ: 'neu', monat: monatStr })
      if (error && error.code !== '23505') throw error
    } else {
      const { error } = await supabase.from('newsletter_eintraege')
        .delete().eq('produkt_id', produktId).eq('typ', 'neu').eq('monat', monatStr)
      if (error) throw error
    }
    if (feedbackEl) feedbackEl.innerHTML = '<span class="success-msg">Gespeichert.</span>'
    ladeNewsletterTab()
  } catch (err) {
    console.error('Neu-eingetroffen-Status speichern fehlgeschlagen:', err)
    cb.checked = !checked
    if (feedbackEl) feedbackEl.innerHTML = `<span class="error-msg">${newsletterFehlerText(err)}</span>`
  } finally {
    btn.disabled = false
  }
}

// ── TAB 4: Nachrichten ──
async function ladeNachrichten () {
  const statusEl = document.getElementById('nachrichten-content')
  const chatEl   = document.getElementById('dash-chat')
  const tabsEl   = document.getElementById('dash-chat-tabs')
  const msgsEl   = document.getElementById('dash-chat-messages')
  const input    = document.getElementById('dash-chat-input')
  const sendBtn  = document.getElementById('dash-chat-send')
  const badge    = document.getElementById('nachrichten-badge')

  try {
    // 1) Chats laden
    const { data: chats, error: e1 } = await supabase
      .from('chats')
      .select('id, sender_name, sender_email, gelesen, erstellt_am, aktualisiert_am')
      .eq('shop_id', shop.id)
      .order('aktualisiert_am', { ascending: false })
    if (e1) throw e1
    const alle = chats || []

    // 2) Alle Nachrichten laden
    let msgByChat = {}
    if (alle.length > 0) {
      const { data: nachrichten } = await supabase
        .from('chat_nachrichten')
        .select('id, chat_id, text, von_haendler, erstellt_am')
        .in('chat_id', alle.map(c => c.id))
        .order('erstellt_am', { ascending: true })
      ;(nachrichten || []).forEach(m => {
        if (!msgByChat[m.chat_id]) msgByChat[m.chat_id] = []
        msgByChat[m.chat_id].push(m)
      })
    }

    // Badge
    const ungelesen = alle.filter(c => !c.gelesen).length
    if (badge) { badge.hidden = ungelesen === 0; badge.textContent = ungelesen > 0 ? String(ungelesen) : '' }

    if (alle.length === 0) {
      statusEl.innerHTML = '<p class="dash-empty">Noch keine Nachrichten.</p>'
      chatEl.hidden = true
      return
    }

    statusEl.innerHTML = ''
    chatEl.hidden = false

    let aktiveChat = alle[0]

    // Reiter bauen
    function buildTabs () {
      tabsEl.innerHTML = alle.map((chat, i) => {
        const preview = (msgByChat[chat.id]?.[0]?.text || '').slice(0, 22)
        const unread  = !chat.gelesen
        return `<button class="dash-chat__tab${chat.id === aktiveChat.id ? ' active' : ''}" data-chat-id="${esc(chat.id)}">
          ${unread ? '<span class="dash-chat__tab-dot"></span>' : ''}
          Chat ${i + 1}${preview ? ' · ' + esc(preview) + '…' : ''}
          <button class="dash-chat__tab-del" data-del="${esc(chat.id)}" type="button" title="Löschen">×</button>
        </button>`
      }).join('')

      tabsEl.querySelectorAll('.dash-chat__tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
          if (e.target.closest('.dash-chat__tab-del')) return
          const id = tab.dataset.chatId
          aktiveChat = alle.find(c => c.id === id)
          // als gelesen markieren
          if (!aktiveChat.gelesen) {
            aktiveChat.gelesen = true
            supabase.from('chats').update({ gelesen: true }).eq('id', id)
            const nu = alle.filter(c => !c.gelesen).length
            if (badge) { badge.hidden = nu === 0; badge.textContent = nu > 0 ? String(nu) : '' }
          }
          tabsEl.querySelectorAll('.dash-chat__tab').forEach(t =>
            t.classList.toggle('active', t.dataset.chatId === id))
          renderMessages(msgByChat[id] || [])
        })
      })

      tabsEl.querySelectorAll('.dash-chat__tab-del').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation()
          const id = btn.dataset.del
          if (!confirm('Chat löschen?')) return
          await supabase.from('chat_nachrichten').delete().eq('chat_id', id)
          await supabase.from('chats').delete().eq('id', id)
          ladeNachrichten()
        })
      })
    }

    // Nachrichten rendern
    function renderMessages (msgs) {
      if (!msgs.length) {
        msgsEl.innerHTML = '<p class="dash-empty" style="text-align:center;padding:2rem 0">Noch keine Nachrichten.</p>'
        return
      }
      let lastDay = ''
      msgsEl.innerHTML = msgs.map(m => {
        const day = new Date(m.erstellt_am).toDateString()
        const sep = day !== lastDay ? `<div class="dash-chat__date">${formatDatum(m.erstellt_am)}</div>` : ''
        lastDay = day
        return `${sep}<div class="dash-chat__msg ${m.von_haendler ? 'out' : 'in'}">
          <div class="dash-chat__bubble">${esc(m.text)}</div>
          <span class="dash-chat__time">${formatDatum(m.erstellt_am, { hour: '2-digit', minute: '2-digit' })}</span>
        </div>`
      }).join('')
      msgsEl.scrollTop = msgsEl.scrollHeight
    }

    buildTabs()
    renderMessages(msgByChat[aktiveChat.id] || [])

    // Senden
    sendBtn.onclick = null
    sendBtn.onclick = async () => {
      const text = input.value.trim()
      if (!text) return
      sendBtn.disabled = true
      try {
        const { error } = await supabase.from('chat_nachrichten')
          .insert({ chat_id: aktiveChat.id, text, von_haendler: true })
        if (error) throw error
        await supabase.from('chats')
          .update({ aktualisiert_am: new Date().toISOString() }).eq('id', aktiveChat.id)
        input.value = ''
        if (!msgByChat[aktiveChat.id]) msgByChat[aktiveChat.id] = []
        msgByChat[aktiveChat.id].push({ text, von_haendler: true, erstellt_am: new Date().toISOString() })
        renderMessages(msgByChat[aktiveChat.id])
      } catch (err) { alert(err?.message || 'Fehler') }
      finally { sendBtn.disabled = false; input.focus() }
    }

    input.onkeydown = (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendBtn.click() }
    }
    input.oninput = () => {
      input.style.height = 'auto'
      input.style.height = Math.min(input.scrollHeight, 120) + 'px'
    }

  } catch (err) {
    console.error('Nachrichten laden:', err)
    document.getElementById('nachrichten-content').innerHTML =
      `<p class="dash-empty" style="color:red">${err?.message || JSON.stringify(err)}</p>`
  }
}

// ── TAB: Bewertungen ──
function sterneHtmlDash (n, max = 5) {
  const v = Math.max(0, Math.min(max, Math.round(n)))
  return '★'.repeat(v) + '☆'.repeat(max - v) + ` <span class="dash-bewertung__sterne-text">${v} von ${max}</span>`
}

async function ladeBewertungen () {
  const el = document.getElementById('bewertungen-content')
  const summaryEl = document.getElementById('dash-bewertung-summary')

  try {
    const { data, error } = await supabase
      .from('bewertungen')
      .select('*, produkte!inner(titel, shop_id)')
      .eq('produkte.shop_id', shop.id)
      .order('erstellt_am', { ascending: false })

    if (error) throw error
    const bewertungen = data || []

    if (bewertungen.length === 0) {
      summaryEl.innerHTML = ''
      el.innerHTML = '<p class="dash-empty">Noch keine Bewertungen für deine Produkte.</p>'
      return
    }

    const schnitt = bewertungen.reduce((s, b) => s + (b.sterne || 0), 0) / bewertungen.length
    summaryEl.innerHTML = `
      <span class="dash-bewertung-summary__star">★</span>
      <span class="dash-bewertung-summary__zahl">${schnitt.toFixed(1)}/5</span>
      <span class="dash-bewertung-summary__anzahl">(${bewertungen.length} Bewertung${bewertungen.length !== 1 ? 'en' : ''})</span>`

    el.innerHTML = `<div class="dash-bewertungen-liste">${bewertungen.map((b) => `
      <div class="dash-bewertung">
        <div class="dash-bewertung__kopf">
          <span class="dash-bewertung__autor">${esc(b.autor_name)}</span>
          <span class="dash-bewertung__datum">${formatDatum(b.erstellt_am)}</span>
        </div>
        <a class="dash-bewertung__produkt" href="produkt.html?id=${esc(b.produkt_id)}" target="_blank" rel="noopener">${esc(b.produkte?.titel || 'Unbekanntes Produkt')}</a>
        <div class="dash-bewertung__sterne">${sterneHtmlDash(b.sterne)}</div>
        ${b.text ? `<p class="dash-bewertung__text">${esc(b.text)}</p>` : ''}
      </div>`).join('')}</div>`
  } catch (err) {
    console.error('Bewertungen konnten nicht geladen werden:', err)
    el.innerHTML = '<p class="dash-empty">Bewertungen konnten nicht geladen werden.</p>'
  }
}

// ── TAB 3: Shop-Einstellungen ──

const TAGE_ORDER = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag']

function fuelleOeffnungszeiten (rohWert) {
  let eintraege = []
  if (Array.isArray(rohWert)) {
    eintraege = rohWert
  } else if (typeof rohWert === 'string' && rohWert.trim().startsWith('[')) {
    try { eintraege = JSON.parse(rohWert) } catch { eintraege = [] }
  }
  const byTag = {}
  eintraege.forEach((e) => { if (e?.tag) byTag[e.tag] = Array.isArray(e.zeiten) ? e.zeiten.join(', ') : (e.zeiten || '') })

  document.querySelectorAll('.dash-oz-row').forEach((row) => {
    const tag = row.dataset.tag
    const input = row.querySelector('input')
    input.value = byTag[tag] || ''
  })
}

function sammleOeffnungszeiten () {
  const eintraege = []
  document.querySelectorAll('.dash-oz-row').forEach((row) => {
    const tag = row.dataset.tag
    const wert = row.querySelector('input').value.trim()
    if (!wert) return
    eintraege.push({ tag, zeiten: [wert] })
  })
  return eintraege.length ? eintraege : null
}

function setzeBildPreview (containerId, url) {
  const el = document.getElementById(containerId)
  if (!el) return
  el.innerHTML = url ? `<img src="${esc(url)}" alt="Vorschau">` : '<span class="dash-file-preview__empty">Kein Bild</span>'
  el.dataset.url = url || ''
}

function setzeAgbAnzeige (url) {
  const wrap = document.getElementById('sf-agb-current')
  const link = document.getElementById('sf-agb-link')
  if (!wrap || !link) return
  if (url) {
    link.href = url
    wrap.hidden = false
    wrap.dataset.url = url
  } else {
    wrap.hidden = true
    wrap.dataset.url = ''
  }
}

async function ladeDateiHoch (datei, ordner = '') {
  const ext = datei.name.split('.').pop().toLowerCase()
  const pfad = `${ordner}${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
  const { data, error } = await supabase.storage
    .from('produkt-bilder')
    .upload(pfad, datei, { cacheControl: '3600', upsert: false })
  if (error) throw error
  const { data: { publicUrl } } = supabase.storage.from('produkt-bilder').getPublicUrl(data.path)
  return publicUrl
}

function initDateiUploads () {
  // Logo
  document.getElementById('sf-logo-input')?.addEventListener('change', async (e) => {
    const datei = e.target.files[0]
    if (!datei) return
    const status = document.getElementById('sf-logo-status')
    status.textContent = 'Lädt hoch…'
    try {
      const url = await ladeDateiHoch(datei, 'shop-logos/')
      setzeBildPreview('sf-logo-preview', url)
      status.textContent = 'Hochgeladen.'
    } catch (err) {
      console.error('Logo-Upload fehlgeschlagen:', err)
      status.textContent = 'Upload fehlgeschlagen.'
    }
    e.target.value = ''
  })

  // Banner
  document.getElementById('sf-banner-input')?.addEventListener('change', async (e) => {
    const datei = e.target.files[0]
    if (!datei) return
    const status = document.getElementById('sf-banner-status')
    status.textContent = 'Lädt hoch…'
    try {
      const url = await ladeDateiHoch(datei, 'shop-banner/')
      setzeBildPreview('sf-banner-preview', url)
      status.textContent = 'Hochgeladen.'
    } catch (err) {
      console.error('Banner-Upload fehlgeschlagen:', err)
      status.textContent = 'Upload fehlgeschlagen.'
    }
    e.target.value = ''
  })

  // Titelbild (Willkommens-/About-Bild)
  document.getElementById('sf-titelbild-input')?.addEventListener('change', async (e) => {
    const datei = e.target.files[0]
    if (!datei) return
    const status = document.getElementById('sf-titelbild-status')
    status.textContent = 'Lädt hoch…'
    try {
      const url = await ladeDateiHoch(datei, 'shop-titelbild/')
      setzeBildPreview('sf-titelbild-preview', url)
      status.textContent = 'Hochgeladen.'
    } catch (err) {
      console.error('Titelbild-Upload fehlgeschlagen:', err)
      status.textContent = 'Upload fehlgeschlagen.'
    }
    e.target.value = ''
  })

  // AGB-PDF
  document.getElementById('sf-agb-input')?.addEventListener('change', async (e) => {
    const datei = e.target.files[0]
    if (!datei) return
    const status = document.getElementById('sf-agb-status')
    status.textContent = 'Lädt hoch…'
    try {
      const url = await ladeDateiHoch(datei, 'shop-agb/')
      setzeAgbAnzeige(url)
      status.textContent = 'Hochgeladen.'
    } catch (err) {
      console.error('AGB-Upload fehlgeschlagen:', err)
      status.textContent = 'Upload fehlgeschlagen.'
    }
    e.target.value = ''
  })

  document.getElementById('sf-agb-remove')?.addEventListener('click', () => {
    setzeAgbAnzeige(null)
  })
}

function fuelleShopForm () {
  const f = document.getElementById('shop-form')
  f.name.value = shop.name || ''
  f.adresse.value = shop.adresse || ''
  f.email.value = shop.email || ''
  f.about_headline.value = shop.about_headline || ''
  f.beschreibung.value = shop.beschreibung || ''
  f.zahlungsmethoden.value = shop.zahlungsmethoden || ''
  f.rueckgaben.value = shop.rueckgaben || ''

  fuelleOeffnungszeiten(shop.oeffnungszeiten)
  setzeBildPreview('sf-logo-preview', shop.logo_url)
  setzeBildPreview('sf-banner-preview', shop.banner_url)
  setzeBildPreview('sf-titelbild-preview', shop.bild_url)
  setzeAgbAnzeige(shop.agb_url)

  const msgToggle = document.getElementById('sf-messaging')
  if (msgToggle) msgToggle.checked = !!shop.messaging_enabled
}

function initShopForm () {
  const form = document.getElementById('shop-form')
  const feedback = document.getElementById('shop-form-feedback')

  initDateiUploads()

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    feedback.innerHTML = ''

    const logoUrl = document.getElementById('sf-logo-preview')?.dataset.url || null
    const bannerUrl = document.getElementById('sf-banner-preview')?.dataset.url || null
    const titelbildUrl = document.getElementById('sf-titelbild-preview')?.dataset.url || null
    const agbUrl = document.getElementById('sf-agb-current')?.dataset.url || null

    const updates = {
      name: form.name.value.trim(),
      adresse: form.adresse.value.trim() || null,
      email: form.email.value.trim() || null,
      about_headline: form.about_headline.value.trim() || null,
      beschreibung: form.beschreibung.value.trim() || null,
      oeffnungszeiten: sammleOeffnungszeiten(),
      zahlungsmethoden: form.zahlungsmethoden.value.trim() || null,
      rueckgaben: form.rueckgaben.value.trim() || null,
      logo_url: logoUrl,
      banner_url: bannerUrl,
      bild_url: titelbildUrl,
      agb_url: agbUrl,
      messaging_enabled: document.getElementById('sf-messaging')?.checked ?? false
    }

    if (!updates.name) {
      feedback.innerHTML = '<div class="error-msg">Der Shop-Name darf nicht leer sein.</div>'
      return
    }

    const submitBtn = form.querySelector('button[type="submit"]')
    submitBtn.disabled = true
    submitBtn.textContent = 'Wird gespeichert…'

    try {
      const { error } = await supabase.from('shops').update(updates).eq('id', shop.id)
      if (error) throw error
      shop = { ...shop, ...updates }
      document.getElementById('dash-greeting').textContent = `Willkommen, ${shop.name}`
      feedback.innerHTML = '<div class="success-msg">Änderungen gespeichert.</div>'
    } catch (err) {
      console.error('Shop speichern fehlgeschlagen:', err)
      feedback.innerHTML = '<div class="error-msg">Die Änderungen konnten nicht gespeichert werden.</div>'
    } finally {
      submitBtn.disabled = false
      submitBtn.textContent = 'Speichern'
    }
  })
}

// ── Init: Auth-Schutz + Daten laden ──
async function init () {
  initMobileMenu()
  initHeaderSearch()

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    window.location.replace('haendler-login.html')
    return
  }

  const loading = document.getElementById('dashboard-loading')
  const dashboard = document.getElementById('dashboard')

  // Shop des eingeloggten Händlers laden
  try {
    const { data, error } = await supabase
      .from('shops')
      .select('*')
      .eq('user_id', session.user.id)
      .maybeSingle()

    if (error) throw error

    if (!data) {
      loading.innerHTML = `
        <div class="dash-empty">
          <p>Diesem Konto ist noch kein Geschäft zugeordnet.</p>
          <p style="margin-top:1rem"><button class="btn btn--outline" id="logout-btn2">Abmelden</button></p>
        </div>`
      document.getElementById('logout-btn2')?.addEventListener('click', async () => {
        await supabase.auth.signOut()
        window.location.replace('haendler-login.html')
      })
      return
    }

    shop = data
  } catch (err) {
    console.error('Shop konnte nicht geladen werden:', err)
    loading.textContent = 'Dein Geschäft konnte nicht geladen werden.'
    return
  }

  // UI vorbereiten
  // .style.display statt .hidden, da die .loading-Klasse (display:flex)
  // das [hidden]-Attribut überstimmen würde.
  loading.style.display = 'none'
  dashboard.hidden = false
  document.getElementById('dash-greeting').textContent = `Willkommen, ${shop.name}`

  initTabs()
  initLogout()
  initProduktModal()
  initProduktForm()
  initProduktImport({ getShop: () => shop, onImportiert: () => ladeProdukte() })
  initShopForm()

  ladeReservierungen()
  ladeProdukte()
  ladeNewsletterTab()
  ladeBewertungen()
  ladeNachrichten()
  fuelleShopForm()

  // Nachrichten-Badge alle 30s aktualisieren
  setInterval(async () => {
    const badge = document.getElementById('nachrichten-badge')
    if (!badge) return
    const { data } = await supabase
      .from('chats')
      .select('id', { count: 'exact' })
      .eq('shop_id', shop.id)
      .eq('gelesen', false)
    const n = data?.length ?? 0
    badge.hidden = n === 0
    badge.textContent = n > 0 ? String(n) : ''
  }, 30000)
}

init()
