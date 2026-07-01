// kontakt.js — SIB v1
// Formular-Handler: sendet Kontaktanfragen an Supabase-Tabelle `kontakt_anfragen`

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const SUPABASE_URL = 'https://ezruwstzpncunbjzwdfk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV6cnV3c3R6cG5jdW5ianp3ZGZrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDIzOTIwODUsImV4cCI6MjA1Nzk2ODA4NX0.pHrrGet83bm-R3PkHyYZPm-TtpwWLFkRQhFymqIb0UE';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const form = document.getElementById('kontakt-form');
const feedback = document.getElementById('kontakt-feedback');

if (form) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    feedback.className = '';
    feedback.textContent = '';

    const name = form.querySelector('[name="name"]').value.trim();
    const email = form.querySelector('[name="email"]').value.trim();
    const betreff = form.querySelector('[name="betreff"]').value.trim();
    const nachricht = form.querySelector('[name="nachricht"]').value.trim();

    if (!name || !email || !betreff || !nachricht) {
      feedback.className = 'is-error';
      feedback.textContent = 'Bitte füll alle Felder aus.';
      return;
    }

    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Wird gesendet…';

    const { error } = await supabase
      .from('kontakt_anfragen')
      .insert({ name, email, betreff, nachricht });

    btn.disabled = false;
    btn.textContent = 'Nachricht senden';

    if (error) {
      // Fallback: mailto öffnen
      const mailtoUrl = `mailto:support@shoppeninbraunschweig.de?subject=${encodeURIComponent(betreff)}&body=${encodeURIComponent(`Von: ${name} (${email})\n\n${nachricht}`)}`;
      window.location.href = mailtoUrl;
      return;
    }

    feedback.className = 'is-success';
    feedback.textContent = 'Nachricht gesendet — wir melden uns bald bei dir!';
    form.reset();
  });
}

// Burger-Menü (wie alle anderen Seiten)
const burger = document.querySelector('.site-header__burger');
const mobileMenu = document.getElementById('mobile-menu');
if (burger && mobileMenu) {
  burger.addEventListener('click', () => {
    const open = mobileMenu.hidden;
    mobileMenu.hidden = !open;
    burger.setAttribute('aria-expanded', String(open));
  });
}
