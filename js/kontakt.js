// kontakt.js — SIB
// Formular-Handler: speichert Kontaktanfragen in der Supabase-Tabelle
// `kontakt_anfragen` UND schickt eine Benachrichtigung an
// info@shoppeninbraunschweig.de, damit die Anfrage nicht unbemerkt in der
// Datenbank liegen bleibt.

import { supabase } from './supabase.js';

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
    feedback.textContent = 'Nachricht gesendet. Wir melden uns bald bei dir!';
    form.reset();

    // Benachrichtigung an uns. Schlaegt sie fehl, ist die Anfrage trotzdem
    // gespeichert, deshalb kein Fehler fuer die absendende Person.
    try {
      await supabase.functions.invoke('send-email', {
        body: {
          type: 'kontakt',
          absender_name: name,
          absender_email: email,
          betreff,
          nachricht
        }
      });
    } catch (mailErr) {
      console.error('Kontakt-Benachrichtigung fehlgeschlagen:', mailErr);
    }
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
