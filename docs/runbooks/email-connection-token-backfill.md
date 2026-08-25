# EmailConnection token encryption backfill

`EmailConnection` stores Gmail or Microsoft OAuth access and refresh tokens.
Application reads and writes must use `lib/email/email-connection-tokens.ts` so
tokens are authenticated AES-256-GCM ciphertext at rest and legacy plaintext,
corrupt ciphertext, or a wrong vault key fails closed.

## Release order

1. Deploy migration `20260825141000_email_connection_token_encryption_guard`.
   Its `NOT VALID` checks permit existing legacy rows but immediately reject
   new plaintext writes.
2. Confirm the application has the stable production
   `CREDENTIAL_ENCRYPTION_KEY` (or legacy `INTEGRATION_ENCRYPTION_KEY`). Do not
   use `NEXTAUTH_SECRET` for this backfill.
3. Supply the same direct-database identity variables used by the release gate:
   `DIRECT_URL`, `EXPECTED_DIRECT_DATABASE_HOST`,
   `EXPECTED_DIRECT_DATABASE_NAME`, `EXPECTED_DIRECT_DATABASE_SCHEMA`, and
   `EXPECTED_DATABASE_FINGERPRINT`.
4. Inspect without writes:

   ```sh
   npm run backfill:email-connection-tokens -- --dry-run
   ```

5. After owner approval, encrypt and validate both database constraints:

   ```sh
   npm run backfill:email-connection-tokens -- --apply
   ```

The script does not log row IDs, tokens, connection strings, or encryption
keys. It uses optimistic compare-and-swap updates and stops before constraint
validation if a row changes concurrently, contains an empty credential, cannot
authenticate under the configured key, or the database identity differs.

If an empty or undecryptable row is reported, disconnect that provider record
through the approved production procedure and require the user to reconnect.
Do not weaken the encrypted-only constraint or add a plaintext read fallback.
