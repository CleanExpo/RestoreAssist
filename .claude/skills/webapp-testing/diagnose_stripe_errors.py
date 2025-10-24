#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Diagnose actual Stripe checkout errors in production
Captures network requests to identify failing endpoints
"""

from playwright.sync_api import sync_playwright
import sys
import json

# Fix Windows encoding
if sys.platform == 'win32':
    import codecs
    sys.stdout = codecs.getwriter('utf-8')(sys.stdout.buffer, 'strict')
    sys.stderr = codecs.getwriter('utf-8')(sys.stderr.buffer, 'strict')

def diagnose_stripe_errors():
    """Capture all network requests and identify failures"""

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        context = browser.new_context(
            viewport={'width': 1920, 'height': 1080}
        )
        page = context.new_page()

        # Track all network requests and failures
        requests = []
        failed_requests = []

        def handle_request(request):
            requests.append({
                'url': request.url,
                'method': request.method,
                'headers': dict(request.headers)
            })

        def handle_response(response):
            url = response.url
            status = response.status

            if status >= 400:
                failed_requests.append({
                    'url': url,
                    'method': response.request.method,
                    'status': status,
                    'statusText': response.status_text,
                    'headers': dict(response.headers),
                    'body': None  # Will try to get body
                })

                # Try to get response body for failed requests
                try:
                    body = response.text()
                    failed_requests[-1]['body'] = body
                except:
                    pass

        page.on('request', handle_request)
        page.on('response', handle_response)

        try:
            print("=" * 80)
            print("DIAGNOSING STRIPE CHECKOUT ERRORS")
            print("=" * 80)

            # Navigate to pricing page
            print("\n[1/3] Loading pricing page...")
            page.goto('https://restoreassist.app/pricing', wait_until='load', timeout=60000)
            page.wait_for_timeout(3000)
            print("✓ Pricing page loaded")

            # Wait for any initial API calls to complete
            page.wait_for_timeout(2000)

            # Clear previous requests
            failed_requests.clear()

            # Click Get Started button for Monthly plan
            print("\n[2/3] Clicking 'Get Started' for Monthly plan...")
            try:
                # Try multiple selectors
                selectors = [
                    'button:has-text("Get Started")',
                    '.pricing-card button',
                    '[data-plan] button'
                ]

                clicked = False
                for selector in selectors:
                    try:
                        buttons = page.locator(selector).all()
                        if len(buttons) >= 2:  # Second button is Monthly
                            buttons[1].click()
                            clicked = True
                            print(f"✓ Clicked using selector: {selector}")
                            break
                    except:
                        continue

                if not clicked:
                    print("✗ Could not click Get Started button")
                    return False

            except Exception as e:
                print(f"✗ Error clicking button: {e}")
                return False

            # Wait for API calls
            page.wait_for_timeout(5000)

            # Check for redirect to Stripe
            current_url = page.url
            print(f"\n[3/3] Current URL: {current_url}")

            if 'checkout.stripe.com' in current_url:
                print("✓ Successfully redirected to Stripe checkout!")
            else:
                print("✗ Not redirected to Stripe checkout")

            # Report all failed requests
            print("\n" + "=" * 80)
            print("FAILED NETWORK REQUESTS")
            print("=" * 80)

            if failed_requests:
                for i, req in enumerate(failed_requests, 1):
                    print(f"\n[{i}] {req['method']} {req['url']}")
                    print(f"    Status: {req['status']} {req['statusText']}")

                    if req['body']:
                        print(f"    Response Body:")
                        try:
                            parsed = json.loads(req['body'])
                            print(f"      {json.dumps(parsed, indent=6)}")
                        except:
                            print(f"      {req['body'][:500]}")
            else:
                print("\n✓ No failed requests!")

            # Report Stripe-specific requests
            stripe_requests = [r for r in requests if 'stripe' in r['url'].lower()]

            print("\n" + "=" * 80)
            print("STRIPE-RELATED REQUESTS")
            print("=" * 80)

            if stripe_requests:
                for i, req in enumerate(stripe_requests, 1):
                    print(f"[{i}] {req['method']} {req['url']}")
            else:
                print("No Stripe-related requests found")

            # Report subscription endpoint requests
            subscription_requests = [r for r in requests if '/subscription' in r['url']]

            print("\n" + "=" * 80)
            print("SUBSCRIPTION ENDPOINT REQUESTS")
            print("=" * 80)

            if subscription_requests:
                for i, req in enumerate(subscription_requests, 1):
                    print(f"[{i}] {req['method']} {req['url']}")
            else:
                print("No subscription endpoint requests found")

            page.screenshot(path='/tmp/stripe_diagnosis.png', full_page=True)

            return len(failed_requests) == 0

        except Exception as e:
            print(f"\n❌ ERROR: {str(e)}")
            page.screenshot(path='/tmp/error_diagnosis.png', full_page=True)
            import traceback
            traceback.print_exc()
            return False

        finally:
            browser.close()

if __name__ == '__main__':
    success = diagnose_stripe_errors()
    sys.exit(0 if success else 1)
