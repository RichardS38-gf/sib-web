// ─────────────────────────────────────────
// CHAT WIDGET
// ─────────────────────────────────────────
function initChatWidget (shop) {
  if (!shop.messaging_enabled) return

  const widget   = document.getElementById('chat-widget')
  const trigger  = document.getElementById('chat-trigger')
  const panel    = document.getElementById('chat-panel')
  const closeBtn = document.getElementById('chat-panel-close')
  const intro    = document.getElementById('chat-intro')
  const introForm = document.getElementById('chat-intro-form')
  const thread   = document.getElementById('chat-thread')
  const messages = document.getElementById('chat-messages')
  const input    = document.getElementById('chat-input')
  const sendBtn  = document.getElementById('chat-send')
  const badge    = document.getElementById('chat-trigger-badge')
  const ciSubmit = document.getElementById('ci-submit')
  const ciFeedback = document.getElementById('ci-feedback')

  if (!widget) return

  // Header befüllen
  widget.hidden = false
  document.getElementById('chat-panel-name').textContent = shop.name
  const logoEl = document.getElementById('chat-panel-logo')
  if (shop.logo_url) { logoEl.src = shop.logo_url; logoEl.hidden = false }

  // Session aus localStorage laden
  const SESSION_KEY = `sib_chat_${shop.id}`
  let session = null
  try { session = JSON.parse(localStorage.getItem(SESSION_KEY)) } catch {}

  let pollTimer = null
  let lastCount = 0
  let panelOpen = false

  // ── Panel öffnen/schließen ──
  function openPanel () {
    panelOpen = true
    panel.hidden = false
    trigger.setAttribute('aria-expanded', 'true')
    trigger.classList.add('is-open')
    if (session?.chat_id) {
      showThread()
      loadMessages()
      startPolling()
    }
  }

  function closePanel () {
    panelOpen = false
    panel.hidden = true
    trigger.setAttribute('aria-expanded', 'false')
    trigger.classList.remove('is-open')
    stopPolling()
  }

  // ── "Nachricht" Button in der Infobar öffnet auch das Widget ──
  const infoBarBtn = document.getElementById('chat-open-btn')
  if (infoBarBtn) infoBarBtn.addEventListener('click', openPanel)

  trigger.addEventListener('click', () => panelOpen ? closePanel() : openPanel())
  closeBtn.addEventListener('click', closePanel)

  // ── Thread anzeigen ──
  function showThread () {
    intro.hidden = true
    thread.hidden = false
  }

  // ── Nachrichten laden ──
  async function loadMessages () {
    if (!session?.chat_id) return
    try {
      const { data, error } = await supabase
        .from('chat_nachrichten')
        .select('*')
        .eq('chat_id', session.chat_id)
        .order('erstellt_am', { ascending: true })

      if (error) throw error
      const msgs = data || []

      // Badge bei neuen Händler-Nachrichten (wenn Panel zu)
      const haendlerNeu = msgs.filter(m => m.von_haendler).length
      if (!panelOpen && haendlerNeu > lastCount) {
        badge.hidden = false
        badge.textContent = haendlerNeu - lastCount
      }
      lastCount = haendlerNeu

      renderMessages(msgs)
    } catch (err) {
      console.error('Chat-Nachrichten laden fehlgeschlagen:', err)
    }
  }

  function renderMessages (msgs) {
    if (msgs.length === 0) {
      messages.innerHTML = '<p class="chat-empty">Schreib deine erste Nachricht!</p>'
      return
    }
    messages.innerHTML = msgs.map(m => `
      <div class="chat-msg ${m.von_haendler ? 'chat-msg--in' : 'chat-msg--out'}">
        <div class="chat-msg__bubble">${esc(m.text)}</div>
        <span class="chat-msg__time">${formatMsgTime(m.erstellt_am)}</span>
      </div>`).join('')
    messages.scrollTop = messages.scrollHeight
  }

  function formatMsgTime (value) {
    if (!value) return ''
    const d = new Date(value)
    return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
  }

  function startPolling () {
    stopPolling()
    pollTimer = setInterval(loadMessages, 10000)
  }

  function stopPolling () {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
  }

  // ── Intro-Formular: Chat starten ──
  introForm.addEventListener('submit', async (e) => {
    e.preventDefault()
    ciFeedback.innerHTML = ''

    const nameVal  = introForm.querySelector('[name="name"]').value.trim()
    const emailVal = introForm.querySelector('[name="email"]').value.trim()
    const textVal  = introForm.querySelector('[name="text"]').value.trim()

    if (!nameVal || !emailVal || !textVal) {
      ciFeedback.innerHTML = '<div class="error-msg">Bitte alle Felder ausfüllen.</div>'
      return
    }

    ciSubmit.disabled = true
    ciSubmit.textContent = 'Verbinden…'

    try {
      // Chat erstellen
      const { data: chat, error: chatErr } = await supabase
        .from('chats')
        .insert({ shop_id: shop.id, sender_name: nameVal, sender_email: emailVal })
        .select('id')
        .single()
      if (chatErr) throw chatErr

      // Erste Nachricht
      const { error: msgErr } = await supabase
        .from('chat_nachrichten')
        .insert({ chat_id: chat.id, text: textVal, von_haendler: false })
      if (msgErr) throw msgErr

      // Session speichern
      session = { chat_id: chat.id, name: nameVal, email: emailVal }
      localStorage.setItem(SESSION_KEY, JSON.stringify(session))

      showThread()
      await loadMessages()
      startPolling()
    } catch (err) {
      console.error('Chat starten fehlgeschlagen:', err)
      ciFeedback.innerHTML = '<div class="error-msg">Verbindung fehlgeschlagen. Bitte erneut versuchen.</div>'
      ciSubmit.disabled = false
      ciSubmit.textContent = 'Starte den Chat'
    }
  })

  // ── Nachricht senden (im Thread) ──
  async function sendMessage () {
    const text = input.value.trim()
    if (!text || !session?.chat_id) return

    input.value = ''
    input.style.height = 'auto'
    sendBtn.disabled = true

    try {
      const { error } = await supabase
        .from('chat_nachrichten')
        .insert({ chat_id: session.chat_id, text, von_haendler: false })
      if (error) throw error

      // aktualisiert_am updaten damit Händler-Dashboard die Reihenfolge sieht
      await supabase
        .from('chats')
        .update({ aktualisiert_am: new Date().toISOString() })
        .eq('id', session.chat_id)

      await loadMessages()
    } catch (err) {
      console.error('Nachricht senden fehlgeschlagen:', err)
      input.value = text // zurückschreiben
    } finally {
      sendBtn.disabled = false
    }
  }

  sendBtn.addEventListener('click', sendMessage)
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  })

  // Textarea auto-grow
  input.addEventListener('input', () => {
    input.style.height = 'auto'
    input.style.height = Math.min(input.scrollHeight, 120) + 'px'
  })

  // Badge leeren wenn Panel geöffnet
  trigger.addEventListener('click', () => {
    badge.hidden = true
    badge.textContent = ''
  })
}
