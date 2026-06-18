import fs from 'fs';
import FormData from 'form-data';
import { test } from '@playwright/test';

test.setTimeout(120000); // Gesamt-Testtimeout 2 Minuten

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

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
   const stat = fs.statSync(filePath);
   const sizeMB = stat.size / (1024 * 1024);
   console.log(`Preparing to send photo (${sizeMB.toFixed(2)} MB) to Telegram...`);

   const form = new FormData();
   form.append('chat_id', CHAT_ID.toString());
   form.append('photo', fs.createReadStream(filePath));
   if (caption) form.append('caption', caption);

   const headers = form.getHeaders();

   const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendPhoto`, {
     method: 'POST',
     headers,
     body: form
   });

   const text = await res.text();
   if (!res.ok) {
     console.warn(`Telegram sendPhoto failed (${res.status}): ${text}`);
   } else {
     console.log('Telegram photo sent:', text);
   }
 } catch (e) {
   console.warn('Failed to send Telegram photo:', e.message);
 }
}

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
       const stillIntercepts = await page.evaluate(() => {
         const banner = document.querySelector('#iubenda-cs-banner, .iubenda-cs, #iubenda-cs-overlay, .iubenda-cs-overlay');
         if (!banner) return false;
         const style = window.getComputedStyle(banner);
         return !(style.display === 'none' || style.visibility === 'hidden' || style.pointerEvents === 'none');
       });
       if (!stillIntercepts) return true;
     }
   } catch (e) { /* fallback */ }
 }

 // check if banner is in iframes
 for (const frame of page.frames()) {
   try {
     const fLoc = frame.locator('button:has-text("Accept all"), button:has-text("Accept")');
     if (await fLoc.count() > 0) {
       await fLoc.first().click({ timeout: 3000 });
       await page.waitForTimeout(300);
       return true;
     }
   } catch (e) { /* ignore */ }
 }

 // last resort: neutralize overlay
 try {
   await page.evaluate(() => {
     const selectors = ['#iubenda-cs-banner', '.iubenda-cs', '#iubenda-cs-overlay', '.iubenda-cs-overlay', '#iubenda-consent'];
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
 page.setDefaultTimeout(20000);
 page.setDefaultNavigationTimeout(30000);

 if (!fs.existsSync('test-results')) fs.mkdirSync('test-results', { recursive: true });

 // screenshotPath wird erst hier gesetzt, nach dem Suche-Block
 let screenshotPath = null;

 try {
   await page.goto('https://buchung.mare.unionlido.com/');

   await acceptCookiesRobust(page);

   // ensure no overlay intercepts before clicking
   await page.waitForFunction(() => {
     const els = document.querySelectorAll('#iubenda-cs-banner, .iubenda-cs, #iubenda-cs-overlay, .iubenda-cs-overlay');
     for (const el of els) {
       const st = window.getComputedStyle(el);
       if (st.display !== 'none' && st.visibility !== 'hidden' && st.pointerEvents !== 'none') return false;
     }
     return true;
   }, { timeout: 5000 }).catch(() => { /* ignore */ });

   // Unterkunftstyp wählen
   await page.getByRole('button', { name: 'Wählen' }).click();
   await page.getByRole('strong').filter({ hasText: 'Stellplatz' }).click();

   // Gäste - protected by try/catch to capture errors early
   try {
     await page.locator('.dropdown-toggle.form-control.d-flex.justify-content-between.click-me').click();

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
     // capture screenshot immediately if guests interaction fails
     try {
       const errShot = `test-results/error-${Date.now()}.png`;
       const pageOpen = (typeof page.isClosed === 'function') ? !page.isClosed() : true;
       if (pageOpen) {
         await page.screenshot({ path: errShot, fullPage: true });
         console.log('Error screenshot saved to', errShot);
         await sendTelegramPhoto(errShot, `Fehler beim Gäste-Handling: ${err.message}`);
       } else {
         fs.writeFileSync(`test-results/error-${Date.now()}.txt`, `Page already closed. Error: ${err.message}`);
       }
     } catch (sErr) {
       console.error('Failed to capture screenshot on error:', sErr.message);
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
   const ok1 = await setReadonlyDateInput(page, '#arrivalDate', arrivalStr);
   const ok2 = await setReadonlyDateInput(page, '#departureDate', departureStr);
   if (!ok1 || !ok2) console.warn('Datum-Felder eventuell nicht gesetzt (fallback evtl. nötig)');

   // --- HIER: Suche klicken und warten; direkt danach erst Screenshot erzeugen ---
   await page.getByRole('button', { name: 'suche' }).click();
   await page.waitForLoadState('networkidle');
   await page.waitForTimeout(3000);

   // Screenshot NUR hier erstellen (letzte Seite)
   screenshotPath = `test-results/final-${Date.now()}.png`;
   await page.screenshot({ path: screenshotPath, fullPage: true });
   console.log('Final screenshot saved to', screenshotPath);

   // Ergebnis prüfen / Text senden
   const pageText = await page.textContent('body');
   const isAvailable = pageText.includes('Im ausgewählten Zeitraum verfügbar') ||
                       pageText.includes('available in the selected period');
   console.log('Available:', isAvailable);

   // Telegram: Text + Foto
   await sendTelegram(`🧪 TEST RUN\nVerfügbarkeit: ${isAvailable ? 'JA ✅' : 'NEIN ❌'}`);
   await sendTelegramPhoto(screenshotPath, `📸 Verfügbarkeitsprüfung - ${isAvailable ? 'JA' : 'NEIN'}`);

 } catch (err) {
   console.error('Test failed with error:', err.message);
   throw err;
 } finally {
   // kein neuer Screenshot mehr hier; nur Fallback falls kein Screenshot erstellt wurde
   try {
     if (!screenshotPath) {
       const pageOpen = (typeof page.isClosed === 'function') ? !page.isClosed() : true;
       if (pageOpen) {
         const fallback = `test-results/fallback-${Date.now()}.png`;
         await page.screenshot({ path: fallback, fullPage: true });
         console.log('Fallback screenshot saved to', fallback);
       } else {
         fs.writeFileSync(`test-results/fallback-${Date.now()}.txt`, 'Page already closed - no screenshot');
       }
     }
   } catch (e) {
     console.error('Final fallback screenshot failed:', e.message);
   }
 }
});
