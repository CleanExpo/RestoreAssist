#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Test Stripe checkout flow on production RestoreAssist app
Verifies Stripe payments are 100% working with no CORS errors
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

def test_stripe_checkout():
    """Test complete Stripe checkout flow"""

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
        cors_errors = []

        def handle_console(msg):
            console_logs.append({
                'type': msg.type,
                'text': msg.text
            })
            if msg.type in ['error', 'warning']:
                errors.append(f"[{msg.type.upper()}] {msg.text}")

                # Check for CORS in console errors
                if 'cors' in msg.text.lower() or 'blocked by cors' in msg.text.lower():
                    cors_errors.append(msg.text)

        page.on('console', handle_console)

        # Track network requests
        stripe_requests = []
        failed_requests = []

        def handle_response(response):
            url = response.url
            status = response.status

            # Track Stripe-related requests
            if '/api/stripe' in url or 'stripe.com' in url:
                stripe_requests.append({
                    'url': url,
                    'status': status,
                    'method': response.request.method,
                    'ok': response.ok
                })

                # Log failures
                if status >= 400:
                    failed_requests.append({
                        'url': url,
                        'status': status,
                        'statusText': response.status_text
                    })

        page.on('response', handle_response)

        try:
            print("=" * 80)
            print("TESTING STRIPE CHECKOUT FLOW")
            print("=" * 80)

            # Step 1: Login first
            print("\n[1/7] Logging in...")
            page.goto('https://restoreassist.app', wait_until='load', timeout=60000)
            page.wait_for_timeout(3000)

            # Quick login
            login_selectors = ['text=Login', 'text=Sign In', 'a:has-text("Login")']
            for selector in login_selectors:
                try:
                    if page.locator(selector).first.is_visible(timeout=2000):
                        page.locator(selector).first.click()
                        break
                except:
                    continue

            page.wait_for_load_state('networkidle')

            # Fill login form
            try:
                page.locator('input[type="email"]').first.fill('admin@restoreassist.com')
                page.locator('input[type="password"]').first.fill('admin123')
                page.locator('button[type="submit"]').first.click()
                page.wait_for_load_state('networkidle', timeout=15000)
                page.wait_for_timeout(2000)
                print("✓ Logged in successfully")
            except Exception as e:
                print(f"⚠ Login step encountered issue: {e}")
                # Continue anyway - might already be logged in

            page.screenshot(path='/tmp/stripe_01_logged_in.png', full_page=True)

            # Step 2: Navigate to pricing page
            print("\n[2/7] Navigating to pricing page...")

            pricing_selectors = [
                'text=Pricing',
                'a:has-text("Pricing")',
                '[href*="pricing"]',
                'text=Subscribe',
                'text=Plans'
            ]

            found_pricing = False
            for selector in pricing_selectors:
                try:
                    elem = page.locator(selector).first
                    if elem.is_visible(timeout=2000):
                        print(f"✓ Found pricing link: {selector}")
                        elem.click()
                        found_pricing = True
                        break
                except:
                    continue

            if not found_pricing:
                # Try direct URL
                print("  Trying direct URL: /pricing")
                page.goto('https://restoreassist.app/pricing', wait_until='networkidle')

            page.wait_for_load_state('networkidle')
            page.wait_for_timeout(2000)
            page.screenshot(path='/tmp/stripe_02_pricing_page.png', full_page=True)
            print("✓ On pricing page")

            # Step 3: Find subscription buttons
            print("\n[3/7] Looking for subscription buttons...")

            # Common subscription button patterns
            subscription_selectors = [
                'button:has-text("Subscribe")',
                'button:has-text("Get Started")',
                'button:has-text("Choose Plan")',
                'button:has-text("Monthly")',
                'button:has-text("Yearly")',
                'button:has-text("Select")',
                '[data-plan]',
                'button:has-text("Buy")'
            ]

            buttons_found = []
            for selector in subscription_selectors:
                try:
                    elements = page.locator(selector).all()
                    for elem in elements:
                        if elem.is_visible():
                            text = elem.inner_text()[:50]
                            buttons_found.append((selector, text, elem))
                except:
                    continue

            if not buttons_found:
                print("✗ No subscription buttons found")
                print("\nAvailable buttons:")
                all_buttons = page.locator('button').all()
                for i, btn in enumerate(all_buttons[:15]):
                    try:
                        print(f"  Button {i+1}: {btn.inner_text()}")
                    except:
                        pass
                return False

            print(f"✓ Found {len(buttons_found)} subscription button(s)")
            for i, (selector, text, _) in enumerate(buttons_found[:5]):
                print(f"  {i+1}. {selector}: '{text}'")

            # Step 4: Click first subscription button
            print("\n[4/7] Clicking subscription button...")

            # Clear previous requests to isolate checkout API call
            stripe_requests.clear()
            failed_requests.clear()
            cors_errors.clear()

            selected_button = buttons_found[0][2]
            selected_button.click()
            print("✓ Clicked subscription button")

            # Wait for API call
            page.wait_for_timeout(3000)

            page.screenshot(path='/tmp/stripe_03_after_click.png', full_page=True)

            # Step 5: Check for CORS errors
            print("\n[5/7] Checking for CORS errors...")

            if cors_errors:
                print(f"❌ CORS ERRORS DETECTED ({len(cors_errors)}):")
                for err in cors_errors:
                    print(f"  {err}")
                print("\n⚠ VERDICT: STRIPE CHECKOUT HAS CORS ERRORS - NOT FIXED")
                return False
            else:
                print("✓ No CORS errors detected")

            # Step 6: Check Stripe API requests
            print("\n[6/7] Analyzing Stripe API requests...")

            if not stripe_requests:
                print("⚠ No Stripe API requests detected")
                print("  This could mean:")
                print("  - Button doesn't trigger checkout")
                print("  - Different endpoint being used")
            else:
                print(f"✓ Captured {len(stripe_requests)} Stripe-related request(s):")
                for req in stripe_requests:
                    status_icon = "✓" if req['ok'] else "✗"
                    print(f"  {status_icon} {req['method']} {req['url']}")
                    print(f"     Status: {req['status']}")

            # Step 7: Check for checkout session creation
            print("\n[7/7] Verifying checkout session creation...")

            checkout_created = False
            for req in stripe_requests:
                if 'create-checkout-session' in req['url']:
                    if req['status'] == 200:
                        print(f"✓ Checkout session created successfully")
                        checkout_created = True
                    elif req['status'] == 500:
                        print(f"✗ Checkout session returned 500 Internal Server Error")
                        print(f"  URL: {req['url']}")
                        return False
                    else:
                        print(f"⚠ Checkout session returned status {req['status']}")

            # Check if redirected to Stripe
            current_url = page.url
            if 'checkout.stripe.com' in current_url:
                print(f"✓ Successfully redirected to Stripe checkout")
                print(f"  URL: {current_url}")
                page.screenshot(path='/tmp/stripe_04_checkout_page.png', full_page=True)
                checkout_created = True
            else:
                print(f"⚠ Not redirected to Stripe (current URL: {current_url})")

                # Wait a bit more in case redirect is slow
                print("  Waiting 5 more seconds for potential redirect...")
                page.wait_for_timeout(5000)
                current_url = page.url
                if 'checkout.stripe.com' in current_url:
                    print(f"✓ Successfully redirected to Stripe checkout (after delay)")
                    checkout_created = True
                else:
                    print(f"  Still at: {current_url}")

            # Final report
            print("\n" + "=" * 80)
            print("STRIPE CHECKOUT TEST RESULTS")
            print("=" * 80)

            print(f"\n📊 Stripe API Requests: {len(stripe_requests)}")
            for req in stripe_requests:
                print(f"  - {req['method']} {req['url']} → {req['status']}")

            print(f"\n🚫 Failed Requests: {len(failed_requests)}")
            if failed_requests:
                for req in failed_requests:
                    print(f"  ✗ {req['url']} → {req['status']} ({req['statusText']})")

            print(f"\n🔒 CORS Errors: {len(cors_errors)}")
            if cors_errors:
                for err in cors_errors:
                    print(f"  ✗ {err}")

            print(f"\n⚠ Console Errors: {len([e for e in errors if 'error' in e.lower()])}")
            critical_errors = [e for e in errors if 'error' in e.lower() and 'stripe' in e.lower()]
            if critical_errors:
                for err in critical_errors[:5]:
                    print(f"  {err}")

            print("\n" + "=" * 80)

            if cors_errors:
                print("VERDICT: STRIPE HAS CORS ERRORS - NOT FIXED ❌")
                print("=" * 80)
                return False
            elif any(req['status'] == 500 for req in stripe_requests if 'checkout-session' in req['url']):
                print("VERDICT: STRIPE RETURNS 500 ERROR - NOT FIXED ❌")
                print("=" * 80)
                return False
            elif checkout_created:
                print("VERDICT: STRIPE CHECKOUT IS WORKING ✓")
                print("=" * 80)
                return True
            else:
                print("VERDICT: STRIPE CHECKOUT STATUS UNCLEAR ⚠")
                print("  - No CORS errors")
                print("  - No 500 errors")
                print("  - But checkout session creation unclear")
                print("=" * 80)
                return False

        except Exception as e:
            print(f"\n❌ ERROR: {str(e)}")
            page.screenshot(path='/tmp/stripe_error.png', full_page=True)
            import traceback
            traceback.print_exc()
            return False

        finally:
            browser.close()

if __name__ == '__main__':
    success = test_stripe_checkout()
    sys.exit(0 if success else 1)
