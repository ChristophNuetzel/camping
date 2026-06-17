const { chromium } = require("playwright");

const TELEGRAM_TOKEN = "8906050489:AAG8SNuwQg1e62mYytQI3keaWLMlv1aGJfE";
const CHAT_ID = "1864810585";

let lastStatus = null;

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

async function checkAvailability() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto("DEINE_URL", { waitUntil: "networkidle" });

  // 🔍 bessere Logik als "BUCHEN Button zählen"
  const pageText = await page.textContent("body");

  const isAvailable =
    pageText.includes("Buchen") ||
    pageText.includes("Book now") ||
    pageText.includes("Jetzt buchen");

  let status = isAvailable ? "available" : "unavailable";

  console.log("Status:", status);

  // 🔔 nur bei Änderung senden
  if (status !== lastStatus) {
    if (status === "available") {
      await sendTelegram("✅ VERFÜGBARKEIT GEFUNDEN!");
    } else {
      await sendTelegram("❌ aktuell keine Verfügbarkeit");
    }

    lastStatus = status;
  }

  await browser.close();
}

// erste Ausführung
checkAvailability();

// ⏱️ alle 10 Minuten
setInterval(checkAvailability, 10 * 60 * 1000);