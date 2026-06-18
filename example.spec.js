import { test, expect } from '@playwright/test';
import FormData from 'form-data';
import { test } from '@playwright/test';

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

test('test', async ({ page }) => {
  await page.goto('https://buchung.mare.unionlido.com/');
  await page.getByRole('button', { name: 'Accept all' }).click();
  await page.getByRole('button', { name: 'Wählen' }).click();
  await page.getByRole('strong').filter({ hasText: 'Stellplatz' }).click();
  await page.locator('.dropdown-toggle.form-control.d-flex.justify-content-between.click-me').click();
  await page.getByRole('button', { name: 'add_circle' }).first().click();
  await page.getByRole('button', { name: 'Bestätigen' }).click();
  await page.getByRole('textbox', { name: 'Ankunftsdatum' }).click();
  await page.getByRole('button', { name: 'chevron_right' }).click();
  await page.getByRole('button', { name: 'chevron_right' }).click();
  await page.getByLabel('Dienstag, 4. August').getByText('4', { exact: true }).click();
  await page.getByRole('textbox', { name: 'Abreisedatum' }).click();
  await page.getByText('12', { exact: true }).click();

	await page.waitForTimeout(1000); 
	
	// Suche-Button klicken und 5s warten
	const sel = 'button[type="submit"].btn.btn-primary.main-button.mb-3';
	await page.locator(sel).focus();
	await page.keyboard.press('Enter');

	await page.waitForTimeout(1000); 
	
	// Ergebnisse prüfen und senden
   const pageText = await page.textContent('body');
   const isAvailable = pageText.includes('Im ausgewählten Zeitraum verfügbar') ||
                       pageText.includes('available in the selected period');
   console.log('Available:', isAvailable);

	
});
