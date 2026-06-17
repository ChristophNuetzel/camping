from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=False)  # Browser sichtbar öffnen
    page = browser.new_page()

    page.goto("https://buchung.mare.unionlido.com/booking/accommodations/")

    print(page.title())

    input("Drücke Enter zum Beenden...")
    browser.close()