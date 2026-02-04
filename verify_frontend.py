from playwright.sync_api import sync_playwright, expect

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page()

    # Navigate to app
    try:
        page.goto("http://localhost:5173")
    except Exception as e:
        print(f"Failed to load page: {e}")
        browser.close()
        return

    # Check for main panels
    try:
        expect(page.get_by_text("DESIGN SCHEMATIC")).to_be_visible(timeout=10000)
        expect(page.get_by_text("AI DESIGN ASSISTANT")).to_be_visible()
        expect(page.get_by_text("COMPONENT INFO")).to_be_visible()
        expect(page.get_by_text("KNOWLEDGE GRAPH")).to_be_visible()

        print("Panels are visible.")

        # Test Interaction
        # 1. Click 'Detailed' view button
        page.get_by_role("button", name="DETAILED").click()

        # 2. Chat interaction
        page.get_by_placeholder("Type a message...").fill("convert to detailed design")
        page.get_by_role("button", name="SEND").click()

        # Wait for AI response
        expect(page.get_by_text("Translating Conceptual Design")).to_be_visible(timeout=5000)
        print("AI response received.")

    except Exception as e:
        print(f"Test failed: {e}")

    # Screenshot
    page.screenshot(path="verification_screenshot.png")
    print("Screenshot saved to verification_screenshot.png")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
