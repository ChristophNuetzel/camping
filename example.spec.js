import fs from 'fs';
import FormData from 'form-data';
import { test } from '@playwright/test';

test.setTimeout(120000);

let TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
let CHAT_ID = process.env.CHAT_ID;
// trim secrets (vermeidet führende/folgende Leerzeichen)
if (TELEGRAM_TOKEN) TELEGRAM_TOKEN = TELEGRAM_TOKEN.trim();
if (CHAT_ID) CHAT_ID = CHAT_ID.toString().trim();

async function sendTelegram(text) {
 if (!TELEGRAM_TOKEN || !CHAT_ID) {
   console.warn('Telegram credentials missing — skipping text message');
   return;
 }
 try {
   const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({ chat_id: CHAT_ID, text })
   });
   const body = await res.text();
   if (!res.ok) console.warn('sendMessage failed', res.status, body);
   else console.log('sendMessage OK');
 } catch (e) {
   console.warn('Failed to send Telegram message:', e.message);
 }
}

// Versuche sendPhoto; falls Telegram 400/Fehler => sendDocument als Fallback
async function sendTelegramFile(filePath, caption = '') {
 if (!TELEGRAM_TOKEN || !CHAT_ID) {
   console.warn('Telegram credentials missing — skipping file');
   return;
 }
 if (!fs.existsSync(filePath)) {
   console.warn('File not found:', filePath);
   return;
 }

 const trySend = async (endpoint, fieldName) => {
   const form = new FormData();
   form.append('chat_id', CHAT_ID);
   form.append(fieldName, fs.createReadStream(filePath));
   if (caption) form.append('caption', caption);
   const headers = form.getHeaders();
   try {
     const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/${endpoint}`, {
       method: 'POST',
       headers,
       body: form
     });
     const text = await res.text();
     return { ok: res.ok, status: res.status, body: text };
   } catch (e) {
     return { ok: false, error: e.message };
   }
 };

 // 1) Versuch: sendPhoto
 const photoRes = await trySend('sendPhoto', 'photo');
 if (photoRes.ok) {
   console.log('sendPhoto OK');
   return;
 }
 console.warn('sendPhoto failed:', photoRes.status ?? '', photoRes.body ?? photoRes.error);

 // 2) Fallback: sendDocument (robuster)
 const docRes = await trySend('sendDocument', 'document');
 if (docRes.ok) {
   console.log('sendDocument OK');
   return;
 }
 console.warn('sendDocument failed:', docRes.status ?? '', docRes.body ?? docRes.error);
}

// Robustes Warten auf die Ergebnisseite
async function waitForResultsRendered(page, timeout = 15000) {
 // Prüfe auf typische Ergebnis-Indikatoren: deutscher/englischer Text oder bekannte Container-Klassen
 const start = Date.now();
 while (Date.now() - start < timeout) {
   // 1) sichtbarer Text im Body
   const bodyText = await page.evaluate(() => document.body.innerText || '');
   if (bodyText.includes('Im ausgewählten Zeitraum verfügbar') ||
       bodyText.includes('available in the selected period') ||
       bodyText.match(/keine.*Verfügbarkeit/i) ||
       bodyText.match(/no.*availability/i)) {
     return true;
   }
   // 2) spezifische Ergebnis-Container im DOM
   const found = await page.evaluate(() => {
     const selectors = ['.results', '.search-results', '.availability', '.camping-results', '#results', '.no-results'];
     return selectors.some(s => !!document.querySelector(s));
   });
   if (found) return true;

   // kurz warten und erneut prüfen
   await page.waitForTimeout(250);
 }
 // Timeout erreicht — false zurückgeben (Screenshot trotzdem möglich als Fallback)
 return false;
}

// Datum-Helfer (dd/MM/yyyy) und readonly-Setzer
function formatDDMMYYYY(d) {
 const dd = String(d.getDate()).padStart(2, '0');
 const mm = String(d.getMonth() + 1).padStart(2, '0');
 const yyyy = d.getFullYear();
 return `${dd}/${mm}/${yyyy}`;
}
async function setReadonlyDateInput(page, selector, value) {
 await page.evaluate(({ selector, value }) => {
   const el = document.querySelector(selector);
   if (!el) return false;
   el.removeAttribute('readonly');
   el.value = value;
   el.dispatchEvent(new Event('input', { bubbles: true }));
   el.dispatchEvent(new Event('change', { bubbles: true }));
   el.dispatchEvent(new Event('blur', { bubbles: true }));
   el.setAttribute('readonly', '');
   return true;
 }, { selector, value });
 await page.waitForTimeout(200);
 const cur = await page.$eval(selector, el => el.value).catch(() => null);
 return cur === value;
}

// Simplified cookie-neutralizer for overlays (iubenda etc.)
async function neutralizeCookieOverlay(page) {
 try {
   await page.evaluate(() => {
     const sels = ['#iubenda-cs-banner', '.iubenda-cs', '#iubenda-cs-overlay', '.iubenda-cs-overlay', '#onetrust-consent-sdk'];
     sels.forEach(sel => document.querySelectorAll(sel).forEach(el => {
       el.style.pointerEvents = 'none';
       el.style.display = 'none';
       el.style.visibility = 'hidden';
     }));
   });
   await page.waitForTimeout(200);
 } catch (e) {
   // ignore
 }
}

test('Verfügbarkeit prüfen', async ({ page }) => {
 page.setDefaultTimeout(20000);
 page.setDefaultNavigationTimeout(30000);

 if (!fs.existsSync('test-results')) fs.mkdirSync('test-results', { recursive: true });

 let screenshotPath = null;

 try {
   await page.goto('https://buchung.mare.unionlido.com/');

   // Versuche Cookie-Banner zu akzeptieren, sonst neutralisieren
   try {
     // versuche typische Buttons
     const acceptBtns = [
       page.getByRole('button', { name: /accept all/i }),
       page.locator('button:has-text("Accept all")'),
       page.locator('text=Accept all'),
       page.locator('text=Alle akzeptieren'),
       page.locator('#onetrust-accept-btn-handler'),
       page.locator('#iubenda-accept-btn, #iubenda-accept-all')
     ];
     let accepted = false;
     for (const b of acceptBtns) {
       if (await b.count() > 0) {
         try { await b.first().click({ timeout: 3000 }); accepted = true; break; } catch {}
       }
     }
     if (!accepted) await neutralizeCookieOverlay(page);
   } catch (e) { await neutralizeCookieOverlay(page); }

   // Unterkunftstyp
   await page.getByRole('button', { name: 'Wählen' }).click();
   await page.getByRole('strong').filter({ hasText: 'Stellplatz' }).click();

   // Gäste - schützen mit screenshot bei Fehler
   try {
     await page.locator('.dropdown-toggle.form-control.d-flex.justify-content-between.click-me').click();
     await page.getByRole('button', { name: 'add_circle' }).first().click();
     await page.getByRole('button', { name: 'add_circle' }).first().click();
     await page.getByRole('button', { name: 'add_circle' }).nth(1).click();
   } catch (err) {
     const errShot = `test-results/error-guests-${Date.now()}.png`;
     if (!page.isClosed?.() && await page.title().catch(() => true)) {
       await page.screenshot({ path: errShot, fullPage: true });
       console.log('Error screenshot saved:', errShot);
       await sendTelegramFile(errShot, `Fehler beim Gäste-Handling: ${err.message}`);
     }
     throw err;
   }

   await page.locator('app-search-form-guests-counter')
     .filter({ hasText: 'Junior 0 - 17' })
     .getByRole('combobox')
     .selectOption('9: 8');
   await page.getByRole('button', { name: 'Bestätigen' }).click();

   // Datum setzen
   const arrivalStr = formatDDMMYYYY(new Date(2026, 7, 2));
   const departureStr = formatDDMMYYYY(new Date(2026, 7, 12));
   await setReadonlyDateInput(page, '#arrivalDate', arrivalStr);
   await setReadonlyDateInput(page, '#departureDate', departureStr);

   // Suche klicken und ROBUST auf das Ergebnis warten
   await page.getByRole('button', { name: 'suche' }).click();
   // Warte auf eindeutige Indikatoren der Ergebnisseite (Text oder Ergebnis-Container)
   const ok = await waitForResultsRendered(page, 20000);
   if (!ok) {
     console.warn('Ergebnisseite offenbar nicht vollständig innerhalb Timeout gerendert - mache trotzdem Screenshot (Fallback)');
     await page.waitForTimeout(1000);
   }
   // Screenshot NUR hier
   screenshotPath = `test-results/final-${Date.now()}.png`;
   await page.screenshot({ path: screenshotPath, fullPage: true });
   console.log('Final screenshot saved to', screenshotPath);

   // Ergebnisse prüfen und senden
   const pageText = await page.textContent('body');
   const isAvailable = pageText.includes('Im ausgewählten Zeitraum verfügbar') ||
                       pageText.includes('available in the selected period');
   console.log('Available:', isAvailable);

   await sendTelegram(`🧪 TEST RUN\nVerfügbarkeit: ${isAvailable ? 'JA ✅' : 'NEIN ❌'}`);
   await sendTelegramFile(screenshotPath, `📸 Verfügbarkeitsprüfung - ${isAvailable ? 'JA' : 'NEIN'}`);

 } catch (err) {
   console.error('Test failed with error:', err.message);
   throw err;
 } finally {
   // nur Fallback screenshot, wenn Hauptbild nicht erstellt wurde
   try {
     if (!screenshotPath) {
       const fallback = `test-results/fallback-${Date.now()}.png`;
       if (!page.isClosed?.()) {
         await page.screenshot({ path: fallback, fullPage: true });
         console.log('Fallback screenshot saved to', fallback);
         await sendTelegramFile(fallback, '📸 Fallback Screenshot (Fehlerfall)');
       } else {
         fs.writeFileSync(`test-results/fallback-${Date.now()}.txt`, 'Page closed, no screenshot');
       }
     }
   } catch (e) {
     console.error('Final fallback screenshot failed:', e.message);
   }
 }
});
