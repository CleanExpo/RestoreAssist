/**
 * Shared Playwright auth-state path. Lives in a NON-test module so spec files
 * can import it without Playwright's "a test file must not import another test
 * file" error (auth.setup.ts is a setup-project test file as of RA-6764).
 */
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Serialized browser storage state written by e2e/auth.setup.ts. */
export const AUTH_FILE = path.join(__dirname, "../playwright-auth-dir/.auth/user.json");
