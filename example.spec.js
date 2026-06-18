import { test } from '@playwright/test';
import fs from 'fs';
import { test } from '@playwright/test';

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

async function sendTelegram(text) {
  await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      text
    })
  });
}

test('Verfügbarkeit prüfen', async ({ page }) => {
  await page.goto('https://buchung.mare.unionlido.com/');

  // Cookies akzeptieren
  async function acceptCookiesRobust(page) {
 await page.waitForLoadState('domcontentloaded');

 const cookieLocators = [
   page.getByRole('button', { name: /accept all/i }),
   page.locator('button:has-text("Accept all")'),
   page.locator('text=Accept all'),
   page.locator('text=Alle akzeptieren'),
   page.locator('button:has-text("Alle akzeptieren")'),
   page.locator('button:has-text("Akzeptieren")'),
   page.locator('#onetrust-accept-btn-handler'), // OneTrust common id
   page.locator('[aria-label*="accept" i]'),
 ];

 let clicked = false;
 for (const loc of cookieLocators) {
   try {
     if (await loc.count() > 0) {
       await loc.first().click({ timeout: 5000 });
       clicked = true;
       break;
     }
   } catch (e) {
     // Klick könnte fehlschlagen -> nächster Fallback
   }
 }

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

  // Datum
  await page.getByRole('textbox', { name: 'Ankunftsdatum' }).click();
  await page.getByRole('button', { name: 'chevron_right' }).click();
  await page.getByRole('button', { name: 'chevron_right' }).click();
  await page.getByLabel('Mittwoch, 5. August').getByText('5', { exact: true }).click();

  await page.getByRole('textbox', { name: 'Abreisedatum' }).click();
  await page.getByText('12', { exact: true }).click();
  
  await page.getByRole('button', { name: 'suche' }).click();
  
  await page.waitForLoadState('networkidle');

  await page.waitForTimeout(5000); 

  // Suche starten
  const pageText = await page.textContent("body");
  
  const isAvailable =
  pageText.includes("Im ausgewählten Zeitraum verfügbar") ||
  pageText.includes("available in the selected period");
  
  console.log("Available:", isAvailable);
  
  await sendTelegram(
  `🧪 TEST RUN\nVerfügbarkeit: ${isAvailable ? "JA" : "NEIN"}`
  );

  test('Verfügbarkeit prüfen', async ({ page }) => {
 // ... dein gesamter Ablauf bis zur Auswertung

 const pageText = await page.textContent('body');
 const isAvailable =
   pageText.includes('Im ausgewählten Zeitraum verfügbar') ||
   pageText.includes('available in the selected period');

 console.log('Available:', isAvailable);

 // Ensure results folder exists
 if (!fs.existsSync('test-results')) {
   fs.mkdirSync('test-results', { recursive: true });
 }

 // EIN Screenshot der letzten Seite (letzter Schritt)
 const screenshotPath = `test-results/final-${Date.now()}.png`;
 await page.screenshot({ path: screenshotPath, fullPage: true });

 // optional: Telegram-Text senden (ohne Bildanhang, Bild ist als Artifact verfügbar)
 await sendTelegram(`🧪 TEST RUN\nVerfügbarkeit: ${isAvailable ? 'JA' : 'NEIN'}`);
});

});
