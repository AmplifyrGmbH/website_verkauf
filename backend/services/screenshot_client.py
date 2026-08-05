from playwright.sync_api import sync_playwright


def take_screenshots(url: str) -> tuple[bytes, bytes]:
    """Returns (desktop_bytes, mobile_bytes). Raises on failure."""
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--no-sandbox", "--disable-setuid-sandbox"])
        try:
            # Desktop
            page = browser.new_page(viewport={"width": 1280, "height": 800})
            page.goto(url, timeout=20000, wait_until="domcontentloaded")
            page.wait_for_timeout(2000)
            desktop = page.screenshot(full_page=False)
            page.close()

            # Mobile
            page = browser.new_page(viewport={"width": 390, "height": 844})
            page.goto(url, timeout=20000, wait_until="domcontentloaded")
            page.wait_for_timeout(2000)
            mobile = page.screenshot(full_page=False)
            page.close()
        finally:
            browser.close()

    return desktop, mobile
