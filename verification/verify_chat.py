from playwright.sync_api import sync_playwright, expect

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()

        # 1. Load the app
        print("Navigating to app...")
        page.goto("http://localhost:5173/")

        # 2. Wait for app to be ready
        print("Waiting for load...")
        # Use exact=True to avoid partial matches in the welcome message
        expect(page.get_by_text("AI DESIGN ASSISTANT", exact=True)).to_be_visible()

        # 3. Find input and type
        print("Typing prompt...")
        # Locate by placeholder
        input_box = page.get_by_placeholder("Type 'Connect pump to heat exchanger'...")
        input_box.fill("Connect pump to heat exchanger")

        # 4. Click Send
        print("Sending...")
        page.get_by_role("button", name="SEND").click()

        # 5. Wait for Intent Review
        print("Waiting for Intent Review...")
        expect(page.get_by_text("INTENT DETECTED")).to_be_visible(timeout=8000)

        # 6. Screenshot
        print("Taking screenshot...")
        page.screenshot(path="verification/verification.png")
        print("Done.")

        browser.close()

if __name__ == "__main__":
    run()
