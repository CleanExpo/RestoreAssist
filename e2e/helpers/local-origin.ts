/**
 * The one place that says where the local E2E server listens (UNI-3468).
 *
 * GitHub never sets E2E_PORT, so CI uses localhost:3000 as before. The release gate's local CI
 * mirror sets it to a free port, because on a shared Mac another session's dev server often
 * holds 3000 and Playwright then refuses to start. The Playwright config and every spec that
 * needs the local origin import it from here; none of them writes localhost:3000 itself.
 */
export const LOCAL_PORT = process.env.E2E_PORT || "3000";
export const LOCAL_ORIGIN = `http://localhost:${LOCAL_PORT}`;
