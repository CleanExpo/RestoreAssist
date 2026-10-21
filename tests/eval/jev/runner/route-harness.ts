/**
 * JEV route harness — call an app/api route handler in-process.
 *
 * invokeRoute() never throws: an import-time throw, a missing handler, a
 * handler throw or a timeout all come back as { status: null, error }.
 * Families record that as INCONCLUSIVE, never PASS.
 */
import fs from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";

export const REPO = path.resolve(__dirname, "../../../..");
const API = path.join(REPO, "app/api");
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
export type Method = (typeof METHODS)[number];

export interface RouteInfo {
  /** Repo-relative path, e.g. app/api/clients/[id]/route.ts */
  file: string;
  /** URL path, e.g. /api/clients/[id] */
  route: string;
  /** Dynamic segment names in order, e.g. ["id"] */
  params: string[];
  methods: Method[];
}

export interface InvokeOptions {
  body?: unknown;
  rawBody?: string;
  /** Multipart body; the request then carries the form's own content-type. */
  form?: FormData;
  headers?: Record<string, string>;
  params?: Record<string, string>;
  query?: string;
  timeoutMs?: number;
}

export interface InvokeResult {
  status: number | null;
  text: string;
  error?: string;
}

function walk(dir: string, out: string[]): void {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "__tests__" || e.name === "node_modules") continue;
      walk(p, out);
    } else if (e.name === "route.ts") out.push(p);
  }
}

export function listRoutes(): RouteInfo[] {
  const files: string[] = [];
  walk(API, files);
  return files.sort().map((abs) => {
    const src = fs.readFileSync(abs, "utf8");
    const methods = METHODS.filter((m) =>
      new RegExp(`export\\s+(async\\s+)?(function\\s+${m}\\b|const\\s+${m}\\b)|export\\s*\\{[^}]*\\b${m}\\b`).test(src),
    );
    const rel = path.relative(REPO, abs);
    const route = "/" + path.dirname(path.relative(path.join(REPO, "app"), abs)).split(path.sep).join("/");
    const params = [...route.matchAll(/\[(?:\.\.\.)?([^\]]+)\]/g)].map((m) => m[1]);
    return { file: rel, route, params, methods };
  });
}

function fillPath(route: string, params: Record<string, string>): string {
  return route.replace(/\[(?:\.\.\.)?([^\]]+)\]/g, (_, k) => encodeURIComponent(params[k] ?? "x"));
}

function errorText(err: unknown): string {
  return err instanceof Error ? `${err.name}: ${err.message}`.slice(0, 300) : String(err).slice(0, 300);
}

const modCache = new Map<string, Promise<Record<string, unknown>>>();

export async function loadRoute(file: string): Promise<Record<string, unknown>> {
  let p = modCache.get(file);
  if (!p) {
    p = import(path.join(REPO, file)) as Promise<Record<string, unknown>>;
    modCache.set(file, p);
  }
  return p;
}

export async function invokeRoute(info: Pick<RouteInfo, "file" | "route">, method: Method, opts: InvokeOptions = {}): Promise<InvokeResult> {
  let mod: Record<string, unknown>;
  try {
    mod = await loadRoute(info.file);
  } catch (err) {
    return { status: null, text: "", error: `import: ${errorText(err)}` };
  }
  const handler = mod[method];
  if (typeof handler !== "function") return { status: null, text: "", error: `no ${method} export` };
  const params = opts.params ?? {};
  const url = `http://localhost${fillPath(info.route, params)}${opts.query ? `?${opts.query}` : ""}`;
  const hasBody = method !== "GET";
  const body = opts.rawBody ?? (opts.body === undefined ? undefined : JSON.stringify(opts.body));
  const req = opts.form
    ? new NextRequest(url, { method, headers: opts.headers ?? {}, body: opts.form })
    : new NextRequest(url, {
        method,
        headers: { "content-type": "application/json", ...(opts.headers ?? {}) },
        body: hasBody ? body : undefined,
      });
  (globalThis as { __jevReqHeaders?: Headers }).__jevReqHeaders = new Headers(req.headers);
  const timeoutMs = opts.timeoutMs ?? 15_000;
  let timer: NodeJS.Timeout | undefined;
  try {
    const res = (await Promise.race([
      (handler as (r: NextRequest, c: unknown) => Promise<Response>)(req, { params: Promise.resolve(params) }),
      new Promise<never>((_, rej) => {
        timer = setTimeout(() => rej(new Error(`timeout ${timeoutMs}ms`)), timeoutMs);
      }),
    ])) as Response;
    if (!res || typeof (res as Response).status !== "number") return { status: null, text: "", error: "handler returned no Response" };
    let text = "";
    try {
      text = await res.text();
    } catch {
      text = "";
    }
    // Large enough for a read-back of J5's 100k-character payloads.
    return { status: res.status, text: text.slice(0, 400_000) };
  } catch (err) {
    // next/navigation redirect() and notFound() throw tagged errors.
    const digest = (err as { digest?: string })?.digest;
    if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) return { status: 307, text: digest };
    if (typeof digest === "string" && digest.includes("NEXT_NOT_FOUND")) return { status: 404, text: "" };
    return { status: null, text: "", error: `handler: ${errorText(err)}` };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
