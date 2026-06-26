// js/chat-global.js
// Läuft auf ALLEN Seiten via header.js.
// Zeigt Chat-Bubble wenn eine Session in localStorage existiert.
// Auf der Shop-Seite übernimmt shop.js — dieses Modul tut dort nichts.

import { supabase } from './supabase.js'

function esc (v) {
  return String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

function formatTime (value) {
  if (!value) return ''
  const d = new Date(value)
  const heute = new Date()
  if (d.toDateString() === heute.toDateString())
    return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) + ' ' +
         d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
}

function findSession () {
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key?.startsWith('sib_chat_')) {
      try {
        const s = JSON.parse(localStorage.getItem(key))
        if (s?.chat_id) return s
      } catch {}
    }
  }
  return null
}

function injectStyles () {
  if (document.getElementById('gcw-styles')) return
  const s = document.createElement('style')
  s.id = 'gcw-styles'
  s.textContent = `
    .gcw-bubble{position:fixed;bottom:1.5rem;right:1.5rem;z-index:900}
    .gcw-trigger{width:56px;height:56px;border-radius:50%;background:#0D0D0D;color:#fff;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 16px rgba(0,0,0,.25);transition:transform .2s,box-shadow .2s;position:relative}
    .gcw-trigger:hover{transform:scale(1.08);box-shadow:0 6px 20px rgba(0,0,0,.3)}
    .gcw-trigger svg path{fill:currentColor}
    .gcw-trigger-close{display:none}
    .gcw-trigger.open .gcw-trigger-open{display:none}
    .gcw-trigger.open .gcw-trigger-close{display:block}
    .gcw-badge{position:absolute;top:-4px;right:-4px;background:#ef4444;color:#fff;font-size:.65rem;font-weight:700;border-radius:999px;min-width:18px;height:18px;display:flex;align-items:center;justify-content:center;padding:0 4px;border:2px solid #fff}
    .gcw-badge[hidden]{display:none!important}
    .gcw-panel{position:fixed;bottom:5rem;right:1.5rem;width:360px;max-height:520px;background:#fff;border-radius:16px;box-shadow:0 8px 40px rgba(0,0,0,.18);display:flex;flex-direction:column;overflow:hidden;animation:gcwSlide .2s ease;z-index:900}
    @keyframes gcwSlide{from{opacity:0;transform:translateY(12px) scale(.97)}to{opacity:1;transform:translateY(0) scale(1)}}
    @media(max-width:480px){.gcw-panel{width:calc(100vw - 2rem);right:1rem;max-height:75vh}}
    .gcw-panel[hidden]{display:none!important}
    .gcw-head{background:#0D0D0D;color:#fff;padding:.9rem 1rem .9rem 1.25rem;display:flex;align-items:center;justify-content:space-between;gap:.75rem;flex-shrink:0}
    .gcw-head-shop{display:flex;align-items:center;gap:.6rem;min-width:0}
    .gcw-logo{width:32px;height:32px;border-radius:6px;object-fit:cover;flex-shrink:0}
    .gcw-shop-name{font-weight:700;font-size:.9rem;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .gcw-shop-sub{font-size:.7rem;opacity:.7;display:block}
    .gcw-close{background:none;border:none;color:rgba(255,255,255,.7);cursor:pointer;padding:.25rem;border-radius:4px;display:flex;transition:color .15s}
    .gcw-close:hover{color:#fff}
    .gcw-messages{flex:1;overflow-y:auto;padding:1rem;display:flex;flex-direction:column;gap:.5rem;min-height:0}
    .gcw-empty{text-align:center;color:#888;font-size:.8rem;padding:2rem 0}
    .gcw-date{text-align:center;font-size:.65rem;color:#aaa;margin:.5rem 0}
    .gcw-msg{display:flex;flex-direction:column;max-width:80%}
    .gcw-msg.out{align-self:flex-end;align-items:flex-end}
    .gcw-msg.in{align-self:flex-start;align-items:flex-start}
    .gcw-bubble-text{padding:.5rem .75rem;border-radius:12px;font-size:.875rem;line-height:1.5;word-break:break-word;white-space:pre-wrap}
    .gcw-msg.out .gcw-bubble-text{background:#0D0D0D;color:#fff;border-bottom-right-radius:4px}
    .gcw-msg.in .gcw-bubble-text{background:#f5f5f5;color:#0D0D0D;border-bottom-left-radius:4px;border:1px solid #e5e5e5}
    .gcw-time{font-size:.62rem;color:#aaa;margin-top:2px;padding:0 2px}
    .gcw-footer{border-top:1px solid #e5e5e5;flex-shrink:0}
    .gcw-input-wrap{display:flex;align-items:flex-end;gap:.5rem;padding:.75rem}
    .gcw-input{flex:1;border:1px solid #e5e5e5;border-radius:20px;padding:.5rem .9rem;font-family:inherit;font-size:.875rem;resize:none;max-height:120px;outline:none;line-height:1.4;transition:border-color .15s}
    .gcw-input:focus{border-color:#0D0D0D}
    .gcw-send{width:36px;height:36px;border-radius:50%;background:#0D0D0D;color:#fff;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:opacity .15s}
    .gcw-send:hover{opacity:.85}
    .gcw-send:disabled{opacity:.4;cursor:not-allowed}
    .gcw-send svg path{stroke:currentColor}
  `
  document.head.appendChild(s)
}

function initGlobalChat () {
  // Auf Shop-Seite: shop.js übernimmt
  if (document.getElementById('chat-widget')) return

  const session = findSession()
  if (!session) return

  injectStyles()

  // Bubble
  const bubble = document.createElement('div')
  bubble.className = 'gcw-bubble'
  bubble.innerHTML = `
    <button class="gcw-trigger" id="gcw-trigger" type="button" aria-label="Chat öffnen">
      <svg class="gcw-trigger-open" viewBox="0 0 24 24" width="22" height="22"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
      <svg class="gcw-trigger-close" viewBox="0 0 24 24" width="22" height="22"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" fill="none"/></svg>
      <span class="gcw-badge" id="gcw-badge" hidden></span>
    </button>`

  // Panel
  const panel = document.createElement('div')
  panel.className = 'gcw-panel'
  panel.id = 'gcw-panel'
  panel.hidden = true
  const logoHtml = session.shop_logo
    ? `<img class="gcw-logo" src="${esc(session.shop_logo)}" alt="">`
    : ''
  panel.innerHTML = `
    <div class="gcw-head">
      <div class="gcw-head-shop">
        ${logoHtml}
        <div>
          <span class="gcw-shop-name">${esc(session.shop_name || 'Chat')}</span>
          <span class="gcw-shop-sub">Schreib uns</span>
        </div>
      </div>
      <button class="gcw-close" id="gcw-close" type="button" aria-label="Schließen">
        <svg viewBox="0 0 24 24" width="18" height="18"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/></svg>
      </button>
    </div>
    <div class="gcw-messages" id="gcw-messages"></div>
    <div class="gcw-footer">
      <div class="gcw-input-wrap">
        <textarea class="gcw-input" id="gcw-input" placeholder="Nachricht…" rows="1"></textarea>
        <button class="gcw-send" id="gcw-send" type="button" aria-label="Senden">
          <svg viewBox="0 0 24 24" width="18" height="18"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>
        </button>
      </div>
    </div>`

  document.body.appendChild(bubble)
  document.body.appendChild(panel)

  const trigger  = document.getElementById('gcw-trigger')
  const closeBtn = document.getElementById('gcw-close')
  const messages = document.getElementById('gcw-messages')
  const input    = document.getElementById('gcw-input')
  const sendBtn  = document.getElementById('gcw-send')
  const badge    = document.getElementById('gcw-badge')

  let isOpen = false
  let pollTimer = null
  let lastHaendlerCount = 0

  function openPanel () {
    isOpen = true
    panel.hidden = false
    trigger.classList.add('open')
    badge.hidden = true
    loadMessages()
    startPolling()
    setTimeout(() => input.focus(), 80)
  }

  function closePanel () {
    isOpen = false
    panel.hidden = true
    trigger.classList.remove('open')
    stopPolling()
  }

  trigger.addEventListener('click', () => isOpen ? closePanel() : openPanel())
  closeBtn.addEventListener('click', closePanel)

  function renderMessages (msgs) {
    if (!msgs.length) { messages.innerHTML = '<p class="gcw-empty">Noch keine Nachrichten.</p>'; return }
    let lastDay = ''
    messages.innerHTML = msgs.map(m => {
      const day = new Date(m.erstellt_am).toDateString()
      const sep = day !== lastDay ? `<div class="gcw-date">${new Date(m.erstellt_am).toLocaleDateString('de-DE')}</div>` : ''
      lastDay = day
      return `${sep}<div class="gcw-msg ${m.von_haendler ? 'in' : 'out'}">
        <div class="gcw-bubble-text">${esc(m.text)}</div>
        <span class="gcw-time">${formatTime(m.erstellt_am)}</span>
      </div>`
    }).join('')
    messages.scrollTop = messages.scrollHeight
  }

  async function loadMessages () {
    try {
      const { data } = await supabase
        .from('chat_nachrichten').select('*')
        .eq('chat_id', session.chat_id).order('erstellt_am', { ascending: true })
      const msgs = data || []
      renderMessages(msgs)
      const hc = msgs.filter(m => m.von_haendler).length
      if (!isOpen && hc > lastHaendlerCount) { badge.hidden = false; badge.textContent = hc - lastHaendlerCount }
      lastHaendlerCount = hc
    } catch (e) { console.error('GCW laden:', e) }
  }

  function startPolling () { stopPolling(); pollTimer = setInterval(loadMessages, 10000) }
  function stopPolling  () { if (pollTimer) { clearInterval(pollTimer); pollTimer = null } }

  async function sendMessage () {
    const text = input.value.trim()
    if (!text) return
    sendBtn.disabled = true
    try {
      const { error } = await supabase.from('chat_nachrichten')
        .insert({ chat_id: session.chat_id, text, von_haendler: false })
      if (error) throw error
      await supabase.from('chats')
        .update({ aktualisiert_am: new Date().toISOString() }).eq('id', session.chat_id)
      input.value = ''
      input.style.height = 'auto'
      await loadMessages()
    } catch (e) { console.error('GCW senden:', e) }
    finally { sendBtn.disabled = false; input.focus() }
  }

  sendBtn.addEventListener('click', sendMessage)
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  })
  input.addEventListener('input', () => {
    input.style.height = 'auto'
    input.style.height = Math.min(input.scrollHeight, 120) + 'px'
  })

  // Initial load für Badge
  loadMessages()
}

initGlobalChat()
