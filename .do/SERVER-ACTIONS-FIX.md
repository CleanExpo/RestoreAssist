# Fix: "Failed to find Server Action" on Digital Ocean

After a new deployment you may see runtime errors like:

```
Error: Failed to find Server Action "abc123...". This request might be from an older or newer deployment.
```

This happens because Next.js generates new Server Action IDs on each build. Users with cached pages or old tabs send requests with old IDs that the new server doesn’t recognize.

## Fix: Set a persistent encryption key

1. **Generate a key once** (64-character hex string):
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

2. **Add it in Digital Ocean**
   - Open your App → **Settings** → **App-Level Environment Variables**
   - Add:
     - **Key:** `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`
     - **Value:** the hex string from step 1
   - Save and redeploy (or trigger a new deploy so the app restarts with the new env).

3. **Keep the same value** for all future deploys. If you change it, action IDs will change again and you may see the error until clients refresh.

After this, Server Action IDs stay stable across builds and the error should stop.
