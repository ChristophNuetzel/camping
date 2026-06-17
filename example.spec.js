import { test } from '@playwright/test';

const TELEGRAM_TOKEN = "8906050489:AAGIRTv3yv_b94hetw6tN6y_0f3U2lGdeC8";
const CHAT_ID = "1864810585";

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
  await page.getByRole('button', { name: 'Accept all' }).click();

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

  // Suche starten
  const pageText = await page.textContent("body");
  
  const isAvailable =
  pageText.includes("Im ausgewählten Zeitraum verfügbar") ||
  pageText.includes("available in the selected period");
  
  console.log("Available:", isAvailable);
  
  await sendTelegram(
  `🧪 TEST RUN\nVerfügbarkeit: ${isAvailable ? "JA" : "NEIN"}`
  );

});