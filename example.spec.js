import { test, expect } from '@playwright/test';
import FormData from 'form-data';

let TELEGRAM_TOKEN = "8906050489:AAGIRTv3yv_b94hetw6tN6y_0f3U2lGdeC8";
let CHAT_ID = "1864810585";

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
  //Accept Cookies
  await page.getByRole('button', { name: 'Accept all' }).click();
  
  //Stellplatz wählen
  await page.getByRole('button', { name: 'Wählen' }).click();
  await page.getByRole('strong').filter({ hasText: 'Stellplatz' }).click();
  
  //Personen wählen 2x
  await page.locator('.dropdown-toggle.form-control.d-flex.justify-content-between.click-me').click();
  await page.getByRole('button', { name: 'add_circle' }).first().click();
  await page.getByRole('button', { name: 'add_circle' }).first().click();
  await page.getByRole('button', { name: 'Bestätigen' }).click();
  
  //Wähle Ankunftsdatum
  await page.getByRole('textbox', { name: 'Ankunftsdatum' }).click();
  //await page.getByRole('button', { name: 'chevron_right' }).click();
  //await page.getByRole('button', { name: 'chevron_right' }).click();
  await page.getByLabel('Dienstag, 23. Juni').getByText('23', { exact: true }).click();
  
    //Wähle Abreisedatum
  await page.getByRole('textbox', { name: 'Abreisedatum' }).click();
  await page.getByText('25', { exact: true }).click();

  await page.waitForTimeout(1000); 
	
  // Suche-Button klicken und 5s warten
  const sel = 'button[type="submit"].btn.btn-primary.main-button.mb-3';
  await page.locator(sel).focus();
  await page.keyboard.press('Enter');

  await page.waitForTimeout(5000); 
	
  // Ergebnisse prüfen und senden
  const pageText = await page.textContent('body');
  const isAvailable = pageText.includes('Im ausgewählten Zeitraum verfügbar');
  console.log('Available:', isAvailable);
   
  await page.waitForTimeout(5000); 
   
    // Nur bei Verfügbarkeit: Telegram-Nachricht senden
	 if (isAvailable) {
	   const msg = `🧪 TEST RUN\nVerfügbarkeit: JA`;
	   await sendTelegram(msg);
	 } else {
	   console.log('Ist Verfügbar');
	 }
	 
	 // Nur bei Verfügbarkeit: Telegram-Nachricht senden
	 if (!isAvailable) {
	   const msg = `🧪 TEST RUN\nVerfügbarkeit: NEIN`;
	   await sendTelegram(msg);
	 } else {
	   console.log('Ist Verfügbar');
	 }	
});
