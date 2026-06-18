import fs from 'fs';
import { test } from '@playwright/test';

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

async function sendTelegram(text) {
 if (!TELEGRAM_TOKEN || !CHAT_ID) {
   console.warn('Telegram credentials missing — skipping notification');
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

async function acceptCookiesRobust(page) {
 await page.waitForLoadState('domcontentloaded');

 const cookieLocators = [
   page.getByRole('button', { name: /accept all/i }),
   page.locator('button:has-text("Accept all")'),
   page.locator('text=Accept all'),
   page.locator('text=Alle akzeptieren'),
   page.locator('button:has-text("Alle akzeptieren")'),
   page.locator('button:has-text("Akzeptieren")'),
   page.locator('#onetrust-accept-btn-handler'),
   page.locator('[aria-label*="accept" i]'),
 ];

 for (const loc of cookieLocators) {
   try {
     if (await loc.count() > 0) {
       await loc.first().click({ timeout: 5000 });
       return true;
     }
   } catch (e) { /* fallback */ }
 }

 // iFrames prüfen
 for (const frame of page.frames()) {
   try {
     const fLoc = frame.locator('button:has-text("Accept all"), button:has-text("Alle akzeptieren"), text=Accept all, text=Alle akzeptieren');
     if (await fLoc.count() > 0) {
       await fLoc.first().click({ timeout: 5000 });
       return true;
     }
   } catch (e) { /* ignore */ }
 }

 // letzter Versuch: Cookie setzen und reload
 try {
   const hostname = new URL(page.url()).hostname;
   await page.context().addCookies([{
     name: 'cookie_consent',
     value: 'true',
     domain: hostname,
     path: '/'
   }]);
   await page.reload();
   await page.waitForTimeout(1000);
   return true;
 } catch (e) {
   console.warn('Cookie Banner nicht gefunden und Bypass fehlgeschlagen');
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
 if (!fs.existsSync('test-results')) fs.mkdirSync('test-results', { recursive: true });
 const screenshotPath = `test-results/final-${Date.now()}.png`;

 try {
   await page.goto('https://buchung.mare.unionlido.com/');

   await acceptCookiesRobust(page);

   // Unterkunftstyp wählen
   await page.getByRole('button', { name: 'Wählen' }).click();
   await page.getByRole('strong').filter({ hasText: 'Stellplatz' }).click();

   // Gäste
   await page.locator('.dropdown-toggle.form-control.d-flex.justify-content-between.click-me').click();
   await page.getByRole('button', { name: 'add_circle' }).first().click();
   await page.getByRole('button', { name: 'add_circle' }).first().click();
   await page.getByRole('button', { name: 'add_circle' }).nth(1).click();
   await page.locator('app-search-form-guests-counter')
     .filter({ hasText: 'Junior 0 - 17' })
     .getByRole('combobox')
     .selectOption('9: 8');
   await page.getByRole('button', { name: 'Bestätigen' }).click();

   // Datum setzen (Example: 02/08/2026 - 12/08/2026)
   const arrivalStr = formatDDMMYYYY(new Date(2026, 7, 2));
   const departureStr = formatDDMMYYYY(new Date(2026, 7, 12));
   await setReadonlyDateInput(page, '#arrivalDate', arrivalStr);
   await setReadonlyDateInput(page, '#departureDate', departureStr);

   await page.getByRole('button', { name: 'suche' }).click();
   await page.waitForLoadState('networkidle');
   await page.waitForTimeout(5000);

   const pageText = await page.textContent('body');
   const isAvailable = pageText.includes('Im ausgewählten Zeitraum verfügbar') ||
                       pageText.includes('available in the selected period');
   console.log('Available:', isAvailable);

   await sendTelegram(`🧪 TEST RUN\nVerfügbarkeit: ${isAvailable ? 'JA' : 'NEIN'}`);
 } finally {
   try {
     await page.screenshot({ path: screenshotPath, fullPage: true });
     console.log('Screenshot saved to', screenshotPath);
   } catch (e) {
     console.error('Failed to capture final screenshot:', e.message);
   }
 }
});
