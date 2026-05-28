const baseUrl =
  process.env.PLAYWRIGHT_BASE_URL ??
  process.env.PUBLIC_SMOKE_BASE_URL ??
  "https://restoreassist.app";

const iterations = Number(
  process.argv.find((arg) => arg.startsWith("--iterations="))?.split("=")[1] ??
    "1",
);
const totalChecksArg = process.argv.find((arg) => arg.startsWith("--checks="));
const totalChecks = totalChecksArg
  ? Number(totalChecksArg.split("=")[1])
  : undefined;

const routes = [
  "/",
  "/about",
  "/features",
  "/pricing",
  "/help",
  "/faq",
  "/support",
  "/terms",
  "/privacy",
  "/login",
  "/signup",
  "/status",
];
const requestTimeoutMs = Number(process.env.PUBLIC_SMOKE_TIMEOUT_MS ?? "15000");
const concurrency = Number(process.env.PUBLIC_SMOKE_CONCURRENCY ?? "6");

type Failure = {
  iteration: number;
  route: string;
  status?: number;
  finalUrl?: string;
  error?: string;
};

const failures: Failure[] = [];
const jobs: Array<{ iteration: number; route: string }> = [];

if (totalChecks) {
  for (let index = 0; index < totalChecks; index += 1) {
    jobs.push({
      iteration: Math.floor(index / routes.length) + 1,
      route: routes[index % routes.length],
    });
  }
} else {
  for (
    let iteration = 1;
    iteration <= Math.max(1, iterations);
    iteration += 1
  ) {
    for (const route of routes) {
      jobs.push({ iteration, route });
    }
  }
}

async function checkRoute(iteration: number, route: string) {
  const url = new URL(route, baseUrl).toString();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
    });
    if (response.status >= 400) {
      failures.push({
        iteration,
        route,
        status: response.status,
        finalUrl: response.url,
      });
    }
  } catch (error) {
    failures.push({
      iteration,
      route,
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    clearTimeout(timeout);
  }
}

for (let index = 0; index < jobs.length; index += concurrency) {
  const batch = jobs.slice(index, index + concurrency);
  await Promise.all(batch.map((job) => checkRoute(job.iteration, job.route)));
}

console.log(
  JSON.stringify(
    {
      baseUrl,
      iterations,
      requestedChecks: totalChecks ?? null,
      routes: routes.length,
      checks: jobs.length,
      requestTimeoutMs,
      concurrency,
      failures: failures.length,
      failureSamples: failures.slice(0, 20),
    },
    null,
    2,
  ),
);

if (failures.length > 0) {
  process.exitCode = 1;
}
