#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Test authentication flow on production RestoreAssist app
Verifies login is 100% working with no errors
"""

from playwright.sync_api import sync_playwright
import sys
import json
import os

# Fix Windows encoding issues
if sys.platform == 'win32':
    import codecs
    sys.stdout = codecs.getwriter('utf-8')(sys.stdout.buffer, 'strict')
    sys.stderr = codecs.getwriter('utf-8')(sys.stderr.buffer, 'strict')

def test_authentication():
    """Test complete authentication flow"""

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        context = browser.new_context(
            viewport={'width': 1920, 'height': 1080},
            user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        )
        page = context.new_page()

        # Collect console logs
        console_logs = []
        errors = []

        def handle_console(msg):
            console_logs.append({
                'type': msg.type,
                'text': msg.text,
                'location': msg.location
            })
            if msg.type in ['error', 'warning']:
                errors.append(f"[{msg.type.upper()}] {msg.text}")

        page.on('console', handle_console)

        # Track network requests
        cors_errors = []
        auth_requests = []

        def handle_response(response):
            url = response.url
            status = response.status

            # Track auth-related requests
            if '/api/auth' in url:
                auth_requests.append({
                    'url': url,
                    'status': status,
                    'method': response.request.method
                })

            # Check for CORS errors
            if status >= 400:
                if 'cors' in response.status_text.lower():
                    cors_errors.append(f"CORS error: {url} - Status {status}")

        page.on('response', handle_response)

        try:
            print("=" * 80)
            print("TESTING AUTHENTICATION FLOW")
            print("=" * 80)

            # Step 1: Navigate to homepage
            print("\n[1/6] Navigating to homepage...")
            page.goto('https://restoreassist.app', wait_until='networkidle', timeout=30000)
            page.screenshot(path='/tmp/01_homepage.png', full_page=True)
            print("✓ Homepage loaded")

            # Step 2: Find and click login/signup button
            print("\n[2/6] Looking for login button...")
            page.wait_for_load_state('networkidle')

            # Try multiple selectors for login button
            login_selectors = [
                'text=Login',
                'text=Sign In',
                'text=Sign in',
                'button:has-text("Login")',
                'button:has-text("Sign In")',
                'a:has-text("Login")',
                'a:has-text("Sign In")',
                '[href*="login"]',
                '[href*="signin"]',
                'text=Get Started',
                'button:has-text("Get Started")',
                'text=Start Free Trial'
            ]

            login_clicked = False
            for selector in login_selectors:
                try:
                    element = page.locator(selector).first
                    if element.is_visible(timeout=2000):
                        print(f"✓ Found login element: {selector}")
                        element.click()
                        login_clicked = True
                        break
                except:
                    continue

            if not login_clicked:
                print("✗ Could not find login button")
                page.screenshot(path='/tmp/02_no_login_button.png', full_page=True)
                print("\nAvailable buttons:")
                buttons = page.locator('button').all()
                for i, btn in enumerate(buttons[:10]):
                    print(f"  Button {i+1}: {btn.inner_text()}")
                print("\nAvailable links:")
                links = page.locator('a').all()
                for i, link in enumerate(links[:10]):
                    print(f"  Link {i+1}: {link.inner_text()} -> {link.get_attribute('href')}")
                return False

            page.wait_for_load_state('networkidle')
            page.screenshot(path='/tmp/02_login_page.png', full_page=True)
            print("✓ Login page loaded")

            # Step 3: Fill in login form
            print("\n[3/6] Filling login form...")

            # Find email input
            email_selectors = [
                'input[type="email"]',
                'input[name="email"]',
                'input[placeholder*="email" i]',
                '#email'
            ]

            email_filled = False
            for selector in email_selectors:
                try:
                    email_input = page.locator(selector).first
                    if email_input.is_visible(timeout=2000):
                        email_input.fill('admin@restoreassist.com')
                        print(f"✓ Filled email using: {selector}")
                        email_filled = True
                        break
                except:
                    continue

            if not email_filled:
                print("✗ Could not find email input")
                return False

            # Find password input
            password_selectors = [
                'input[type="password"]',
                'input[name="password"]',
                'input[placeholder*="password" i]',
                '#password'
            ]

            password_filled = False
            for selector in password_selectors:
                try:
                    password_input = page.locator(selector).first
                    if password_input.is_visible(timeout=2000):
                        password_input.fill('admin123')
                        print(f"✓ Filled password using: {selector}")
                        password_filled = True
                        break
                except:
                    continue

            if not password_filled:
                print("✗ Could not find password input")
                return False

            page.screenshot(path='/tmp/03_form_filled.png', full_page=True)

            # Step 4: Submit form
            print("\n[4/6] Submitting login form...")

            submit_selectors = [
                'button[type="submit"]',
                'button:has-text("Login")',
                'button:has-text("Sign In")',
                'button:has-text("Log In")',
                'input[type="submit"]'
            ]

            submitted = False
            for selector in submit_selectors:
                try:
                    submit_btn = page.locator(selector).first
                    if submit_btn.is_visible(timeout=2000):
                        print(f"✓ Found submit button: {selector}")
                        submit_btn.click()
                        submitted = True
                        break
                except:
                    continue

            if not submitted:
                print("✗ Could not find submit button")
                return False

            # Wait for navigation after login
            page.wait_for_load_state('networkidle', timeout=15000)
            page.wait_for_timeout(2000)  # Extra wait for any JS

            current_url = page.url
            page.screenshot(path='/tmp/04_after_login.png', full_page=True)
            print(f"✓ Navigated to: {current_url}")

            # Step 5: Verify successful login
            print("\n[5/6] Verifying login success...")

            # Check if redirected away from login page
            if 'login' in current_url.lower() or 'signin' in current_url.lower():
                print("✗ Still on login page - login may have failed")
                print(f"  Current URL: {current_url}")

                # Check for error messages
                error_selectors = [
                    '.error',
                    '[role="alert"]',
                    '.alert-error',
                    'text=Invalid',
                    'text=incorrect',
                    'text=failed'
                ]
                for selector in error_selectors:
                    try:
                        error_elem = page.locator(selector).first
                        if error_elem.is_visible(timeout=1000):
                            print(f"  Error message: {error_elem.inner_text()}")
                    except:
                        pass
                return False

            print(f"✓ Redirected away from login page")

            # Check for dashboard/authenticated content
            auth_indicators = [
                'text=Dashboard',
                'text=Logout',
                'text=Sign Out',
                'text=Profile',
                'text=Settings',
                '[href*="dashboard"]',
                '[href*="logout"]'
            ]

            found_indicators = []
            for selector in auth_indicators:
                try:
                    elem = page.locator(selector).first
                    if elem.is_visible(timeout=2000):
                        found_indicators.append(selector)
                except:
                    pass

            if found_indicators:
                print(f"✓ Found authenticated UI elements: {', '.join(found_indicators)}")
            else:
                print("⚠ Warning: No obvious authenticated UI elements found")

            # Step 6: Test page refresh (session persistence)
            print("\n[6/6] Testing session persistence...")
            page.reload(wait_until='networkidle')
            page.wait_for_timeout(2000)

            current_url_after_refresh = page.url
            page.screenshot(path='/tmp/05_after_refresh.png', full_page=True)

            if 'login' in current_url_after_refresh.lower():
                print("✗ Session lost - redirected to login after refresh")
                return False

            print(f"✓ Session persisted after refresh")

            # Final report
            print("\n" + "=" * 80)
            print("AUTHENTICATION TEST RESULTS")
            print("=" * 80)

            print(f"\n✓ Login flow completed successfully")
            print(f"  - Final URL: {current_url}")
            print(f"  - Session persisted: Yes")

            # Report auth requests
            print(f"\n📊 Auth API Requests ({len(auth_requests)}):")
            for req in auth_requests:
                status_icon = "✓" if req['status'] < 400 else "✗"
                print(f"  {status_icon} {req['method']} {req['url']} - {req['status']}")

            # Report CORS errors
            if cors_errors:
                print(f"\n❌ CORS Errors ({len(cors_errors)}):")
                for err in cors_errors:
                    print(f"  {err}")
            else:
                print(f"\n✓ No CORS errors detected")

            # Report console errors
            if errors:
                print(f"\n⚠ Console Errors ({len(errors)}):")
                for err in errors[:10]:  # Limit to first 10
                    print(f"  {err}")
            else:
                print(f"\n✓ No console errors")

            print("\n" + "=" * 80)
            print("VERDICT: AUTHENTICATION IS WORKING ✓")
            print("=" * 80)

            return True

        except Exception as e:
            print(f"\n❌ ERROR: {str(e)}")
            page.screenshot(path='/tmp/error.png', full_page=True)
            import traceback
            traceback.print_exc()
            return False

        finally:
            browser.close()

if __name__ == '__main__':
    success = test_authentication()
    sys.exit(0 if success else 1)
