"""
Investigate the landing page to find out why Google OAuth button isn't visible in tests.
This will show us exactly what's being rendered.
"""
from playwright.sync_api import sync_playwright
import json
import sys
import io

# Fix Windows console encoding
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

def investigate_landing_page():
    with sync_playwright() as p:
        # Launch browser in headless mode
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        print("=" * 80)
        print("[INVESTIGATION] LANDING PAGE AT http://localhost:5173")
        print("=" * 80)

        # Navigate to landing page
        print("\n1️⃣ Navigating to landing page...")
        page.goto('http://localhost:5173', wait_until='networkidle', timeout=30000)
        print("✅ Page loaded")

        # Wait a bit more for any lazy-loaded components
        print("\n2️⃣ Waiting for dynamic content to load...")
        page.wait_for_timeout(2000)
        print("✅ Wait complete")

        # Take screenshot
        print("\n3️⃣ Taking screenshot...")
        screenshot_path = 'D:/RestoreAssist/landing_page_investigation.png'
        page.screenshot(path=screenshot_path, full_page=True)
        print(f"✅ Screenshot saved: {screenshot_path}")

        # Get page title
        print("\n4️⃣ Page Title:")
        print(f"   {page.title()}")

        # Get current URL
        print("\n5️⃣ Current URL:")
        print(f"   {page.url}")

        # Find all buttons
        print("\n6️⃣ Finding ALL buttons on page...")
        buttons = page.locator('button').all()
        print(f"✅ Found {len(buttons)} button(s)")

        for i, button in enumerate(buttons):
            try:
                text = button.inner_text(timeout=1000)
                visible = button.is_visible(timeout=1000)
                enabled = button.is_enabled(timeout=1000)
                print(f"\n   Button #{i+1}:")
                print(f"      Text: '{text}'")
                print(f"      Visible: {visible}")
                print(f"      Enabled: {enabled}")
            except Exception as e:
                print(f"\n   Button #{i+1}: Error reading - {e}")

        # Search for Google-related text
        print("\n7️⃣ Searching for Google-related text...")
        google_texts = [
            "Sign up with Google",
            "Sign in with Google",
            "Continue with Google",
            "Google",
            "OAuth"
        ]

        for search_text in google_texts:
            try:
                elements = page.get_by_text(search_text, exact=False).all()
                if elements:
                    print(f"   ✅ Found '{search_text}': {len(elements)} instance(s)")
                    for el in elements:
                        print(f"      - Visible: {el.is_visible()}, Tag: {el.evaluate('el => el.tagName')}")
                else:
                    print(f"   ❌ NOT found: '{search_text}'")
            except Exception as e:
                print(f"   ❌ Error searching '{search_text}': {e}")

        # Check for iframes (GoogleLogin might be in iframe)
        print("\n8️⃣ Checking for iframes...")
        iframes = page.locator('iframe').all()
        print(f"   Found {len(iframes)} iframe(s)")
        for i, iframe in enumerate(iframes):
            try:
                src = iframe.get_attribute('src')
                name = iframe.get_attribute('name') or 'unnamed'
                print(f"   Iframe #{i+1}: name='{name}', src='{src}'")
            except Exception as e:
                print(f"   Iframe #{i+1}: Error - {e}")

        # Get visible text content
        print("\n9️⃣ Visible text on page (first 500 chars):")
        visible_text = page.evaluate('''() => {
            const body = document.body;
            return body ? body.innerText.substring(0, 500) : 'No body element';
        }''')
        print(f"   {visible_text}")

        # Check console errors
        print("\n🔟 Console Messages:")
        console_messages = []

        def handle_console(msg):
            console_messages.append(f"   [{msg.type}] {msg.text}")

        page.on('console', handle_console)

        # Reload to catch console messages
        page.reload(wait_until='networkidle')
        page.wait_for_timeout(2000)

        if console_messages:
            for msg in console_messages[-10:]:  # Last 10 messages
                print(msg)
        else:
            print("   No console messages")

        # Get HTML of the main content area
        print("\n1️⃣1️⃣ HTML structure (first 1000 chars):")
        html = page.content()
        print(f"   {html[:1000]}")

        print("\n" + "=" * 80)
        print("🎯 INVESTIGATION COMPLETE")
        print("=" * 80)

        browser.close()

if __name__ == '__main__':
    try:
        investigate_landing_page()
    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        import traceback
        traceback.print_exc()
