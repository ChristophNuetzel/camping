import fs from 'fs';
import { test } from '@playwright/test';

test.setTimeout(120000); // Gesamt-Testtimeout 2 Minuten

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

// send simple text message
async function sendTelegram(text) {
 if (!TELEGRAM_TOKEN || !CHAT_ID) {
   console.warn('Telegram credentials missing — skipping text message');
   return;
 }
 try {
   await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({ chat_id: CHAT_ID, text })
   });
 } catch (e) {
   console.warn('Failed to send Telegram message:', e.message);
 }
}

// send photo (file upload) using FormData
async function sendTelegramPhoto(filePath, caption = '') {
 if (!TELEGRAM_TOKEN || !CHAT_ID) {
   console.warn('Telegram credentials missing — skipping photo');
   return;
 }
 if (!fs.existsSync(filePath)) {
   console.warn('Screenshot file not found:', filePath);
   return;
 }

 try {
   const form = new FormData();
   form.append('chat_id', CHAT_ID.toString());
   form.append('photo', fs.createReadStream(filePath));
   if (caption) form.append('caption', caption);

   const headers = form.getHeaders(); // sehr wichtig: enthält Boundary

   const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendPhoto`, {
     method: 'POST',
     headers,
     body: form
   });

// Robustes Entfernen/Akzeptieren von Cookie-Bannern (inkl. iubenda)
async function acceptCookiesRobust(page) {
 await page.waitForLoadState('domcontentloaded');

 const locators = [
   page.getByRole('button', { name: /accept all/i }),
   page.locator('button:has-text("Accept all")'),
   page.locator('text=Accept all'),
   page.locator('text=Alle akzeptieren'),
   page.locator('button:has-text("Alle akzeptieren")'),
   page.locator('button:has-text("Akzeptieren")'),
   page.locator('#onetrust-accept-btn-handler'),
   page.locator('#iubenda-accept-btn, #iubenda-accept-all, .iubenda-cs-accept'),
   page.locator('[aria-label*="accept" i]')
 ];

 for (const loc of locators) {
   try {
     if (await loc.count() > 0) {
       await loc.first().click({ timeout: 3000 });
       await page.waitForTimeout(300);
       // prüfe, ob Overlay noch interceptet
       const stillIntercepts = await page.evaluate(() => {
         const banner = document.querySelector('#iubenda-cs-banner, .iubenda-cs, #iubenda-cs-overlay, .iubenda-cs-overlay');
         if (!banner) return false;
         const style = window.getComputedStyle(banner);
         return !(style.display === 'none' || style.visibility === 'hidden' || style.pointerEvents === 'none');
       });
       if (!stillIntercepts) return true;
     }
   } catch (e) { /* weiter mit Fallbacks */ }
 }

 // iFrames prüfen
 for (const frame of page.frames()) {
   try {
     const fLoc = frame.locator('button:has-text("Accept all"), button:has-text("Accept"), button:has-text("Akzeptieren"), text=Accept all');
     if (await fLoc.count() > 0) {
       await fLoc.first().click({ timeout: 3000 });
       await page.waitForTimeout(300);
       return true;
     }
   } catch (e) { /* ignore */ }
 }

 // letzter Ausweg: Overlay neutralisieren per JS (pointer-events none / display none)
 try {
   await page.evaluate(() => {
     const selectors = ['#iubenda-cs-banner', '.iubenda-cs', '#iubenda-cs-overlay', '.iubenda-cs-overlay', '#iubenda-consent', '.iubenda-consent'];
     selectors.forEach(sel => {
       document.querySelectorAll(sel).forEach(el => {
         el.style.pointerEvents = 'none';
         el.style.display = 'none';
         el.style.visibility = 'hidden';
       });
     });
   });
   await page.waitForTimeout(250);
   return true;
 } catch (e) {
   console.warn('Failed to neutralize cookie overlay:', e.message);
   return false;
 }
}

// Helpers für Datum
function formatDDMMYYYY(d) {
 const dd = String(d.getDate()).padStart(2, '0');
 const mm = String(d.getMonth() + 1).padStart(2, '0');
 const yyyy = d.getFullYear();
 return `${dd}/${mm}/${yyyy}`;
}

async function setReadonlyDateInput(page, selector, dateString) {
 await page.evaluate(({ selector, dateString }) => {
   const el = document.querySelector(selector);
   if (!el) return false;
   el.removeAttribute('readonly');
   el.value = dateString;
   el.dispatchEvent(new Event('input', { bubbles: true }));
   el.dispatchEvent(new Event('change', { bubbles: true }));
   el.dispatchEvent(new Event('blur', { bubbles: true }));
   el.setAttribute('readonly', '');
   return true;
 }, { selector, dateString });
 await page.waitForTimeout(200);
 const current = await page.$eval(selector, el => el.value).catch(() => null);
 return current === dateString;
}

test('Verfügbarkeit prüfen', async ({ page }) => {
 // Default timeouts für page-Operationen
 page.setDefaultTimeout(20000);
 page.setDefaultNavigationTimeout(30000);

 if (!fs.existsSync('test-results')) fs.mkdirSync('test-results', { recursive: true });
 const finalScreenshot = `test-results/final-${Date.now()}.png`;

 try {
   await page.goto('https://buchung.mare.unionlido.com/');

   // Cookie Banner behandeln (inkl. iubenda)
   await acceptCookiesRobust(page);

   // Vor kritischen Klicks sicherstellen, dass kein Overlay mehr interceptet
   await page.waitForFunction(() => {
     const els = document.querySelectorAll('#iubenda-cs-banner, .iubenda-cs, #iubenda-cs-overlay, .iubenda-cs-overlay');
     for (const el of els) {
       const st = window.getComputedStyle(el);
       if (st.display !== 'none' && st.visibility !== 'hidden' && st.pointerEvents !== 'none') {
         return false; // noch vorhanden und aktiv
       }
     }
     return true;
   }, { timeout: 5000 }).catch(() => { /* timeouts ignored */ });

   // Unterkunftstyp wählen
   await page.getByRole('button', { name: 'Wählen' }).click();
   await page.getByRole('strong').filter({ hasText: 'Stellplatz' }).click();

   // Gäste - risikobehaftete Schritte in try/catch, damit wir bei Fehler sofort Screenshot machen
   try {
     await page.locator('.dropdown-toggle.form-control.d-flex.justify-content-between.click-me').click();
     // ensure overlay is not blocking
     await page.waitForFunction(() => {
       const els = document.querySelectorAll('#iubenda-cs-banner, .iubenda-cs, #iubenda-cs-overlay, .iubenda-cs-overlay');
       for (const el of els) {
         const st = window.getComputedStyle(el);
         if (st.display !== 'none' && st.visibility !== 'hidden' && st.pointerEvents !== 'none') return false;
       }
       return true;
     }, { timeout: 3000 });

     await page.getByRole('button', { name: 'add_circle' }).first().click();
     await page.getByRole('button', { name: 'add_circle' }).first().click();
     await page.getByRole('button', { name: 'add_circle' }).nth(1).click();
   } catch (err) {
     // sofort Screenshot, solange Seite noch offen ist
     try {
       const errShot = `test-results/error-${Date.now()}.png`;
       const pageOpen = (typeof page.isClosed === 'function') ? !page.isClosed() : true;
       if (pageOpen) {
         await page.screenshot({ path: errShot, fullPage: true });
         console.log('Error screenshot saved to', errShot);
         // optional: Telegram foto übermitteln
         await sendTelegramPhoto(errShot, `Fehler beim Gäste-Handling: ${err.message}`);
       } else {
         fs.writeFileSync(`test-results/error-${Date.now()}.txt`, `Page already closed. Error: ${err.message}`);
       }
     } catch (sErr) {
       console.error('Failed to capture screenshot on error:', sErr.message);
     }
     throw err; // Test soll weiterhin als failed markiert werden
   }

   // restliche Gäste-Eingabe
   await page.locator('app-search-form-guests-counter')
     .filter({ hasText: 'Junior 0 - 17' })
     .getByRole('combobox')
     .selectOption('9: 8');
   await page.getByRole('button', { name: 'Bestätigen' }).click();

   // Datum setzen (02/08/2026 - 12/08/2026)
   const arrivalStr = formatDDMMYYYY(new Date(2026, 7, 2));
   const departureStr = formatDDMMYYYY(new Date(2026, 7, 12));
   const ok1 = await setReadonlyDateInput(page, '#arrivalDate', arrivalStr);
   const ok2 = await setReadonlyDateInput(page, '#departureDate', departureStr);
   if (!ok1 || !ok2) console.warn('Datum-Felder eventuell nicht gesetzt (fallback evtl. nötig)');

   await page.getByRole('button', { name: 'suche' }).click();
   await page.waitForLoadState('networkidle');
   await page.waitForTimeout(3000);

   const pageText = await page.textContent('body');
   const isAvailable = pageText.includes('Im ausgewählten Zeitraum verfügbar') ||
                       pageText.includes('available in the selected period');
   console.log('Available:', isAvailable);

   // Optional: Telegram-Text
   await sendTelegram(`🧪 TEST RUN\nVerfügbarkeit: ${isAvailable ? 'JA ✅' : 'NEIN ❌'}`);
 } catch (err) {
   // Fehler auffangen, bereits in inneren Try/Catch behandelt; hier trotzdem final behandeln
   console.error('Test failed with error:', err.message);
   throw err;
 } finally {
   // finaler Screenshot nur, wenn Seite noch offen
   try {
     const pageOpen = (typeof page.isClosed === 'function') ? !page.isClosed() : true;
     if (pageOpen) {
       await page.screenshot({ path: finalScreenshot, fullPage: true });
       console.log('Final screenshot saved to', finalScreenshot);
       // optional: Screenshot per Telegram senden (achte auf Dateigröße <10MB)
       await sendTelegramPhoto(finalScreenshot, '📸 Final screenshot');
     } else {
       fs.writeFileSync(`test-results/final-${Date.now()}-no-page.txt`, 'Page already closed - no final screenshot');
     }
   } catch (e) {
     console.error('Failed to capture final screenshot:', e.message);
   }
 }
});
