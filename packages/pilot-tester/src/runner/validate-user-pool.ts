import { loadUserPool } from "../client/auth.js";

const poolPath = process.argv[2] ?? "./user-pool.json";

try {
  const pool = await loadUserPool(poolPath);
  console.log(`[pilot-tester] user pool contains ${pool.length} exact sandbox identities`);
} catch (error) {
  console.error(
    `[pilot-tester] invalid user pool: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 2;
}
