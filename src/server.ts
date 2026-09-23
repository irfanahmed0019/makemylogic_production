import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { connectLearningSession, failSession, getHint, getRunPlan, recordEvent, startLearningSession, stateOf, submitProject, verifySession } from "./lib/learning-sessions.server";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}


function allowedOrigin(request: Request): string | undefined {
  const origin = request.headers.get("origin")?.trim();
  if (!origin) return undefined;
  const requestOrigin = new URL(request.url).origin;
  const configured = (process.env["ALLOWED_ORIGINS"] ?? "")
    .split(",")
    .map(value => value.trim())
    .filter(Boolean);
  return origin === requestOrigin || configured.includes(origin) ? origin : undefined;
}

function corsHeaders(request: Request): Record<string, string> {
  const origin = allowedOrigin(request);
  return {
    ...(origin ? { "access-control-allow-origin": origin, vary: "Origin" } : {}),
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type, authorization",
  };
}

function jsonResponse(request: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...corsHeaders(request),
    },
  });
}


async function readJson(request: Request): Promise<Record<string, unknown>> {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > 1_000_000) return {};
  try {
    const body = await request.json();
    return body && typeof body === "object" ? body as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function clean(value: unknown, max = 500): string {
  return String(value ?? "").trim().slice(0, max);
}

type RateBucket = { count: number; resetsAt: number };
type SecurityRuntime = typeof globalThis & { __buildMyLogicRateLimits?: Map<string, RateBucket> };
const rateLimits = (globalThis as SecurityRuntime).__buildMyLogicRateLimits ??= new Map<string, RateBucket>();

function rateLimit(request: Request, scope: string, limit: number, windowMs = 60_000): boolean {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const client = forwarded || request.headers.get("cf-connecting-ip")?.trim() || "unknown";
  const key = `${scope}:${client}`;
  const now = Date.now();
  const bucket = rateLimits.get(key);
  if (!bucket || bucket.resetsAt <= now) {
    rateLimits.set(key, { count: 1, resetsAt: now + windowMs });
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count += 1;
  return true;
}

async function authenticatedUserId(request: Request): Promise<string | undefined> {
  const authorization = request.headers.get("authorization")?.trim() ?? "";
  const accessToken = authorization.toLowerCase().startsWith("bearer ") ? authorization.slice(7).trim() : "";
  if (!accessToken) return undefined;
  const supabaseUrl = process.env["VITE_SUPABASE_URL"]?.trim();
  const supabaseAnonKey = process.env["VITE_SUPABASE_ANON_KEY"]?.trim();
  if (!supabaseUrl || !supabaseAnonKey) return undefined;
  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { apikey: supabaseAnonKey, authorization: `Bearer ${accessToken}` } });
    if (!response.ok) return undefined;
    const user = await response.json() as { id?: unknown };
    return typeof user.id === "string" && user.id ? user.id : undefined;
  } catch { return undefined; }
}

async function handleBuildMyLogicApi(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  const pathname = url.pathname;
  if (!pathname.startsWith("/api/")) return null;

  if (request.method === "OPTIONS") {
    if (request.headers.get("origin") && !allowedOrigin(request)) return new Response(null, { status: 403 });
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }
  if (request.headers.get("origin") && !allowedOrigin(request)) {
    return jsonResponse(request, { ok: false, error: "Origin is not allowed." }, 403);
  }

  // Learning sessions are the shared source of truth for the web dashboard and VS Code.
  // The website authenticates session creation. The extension joins the same session with
  // the short Session ID copied from the website.
  if (request.method === "POST" && pathname === "/api/sessions/start") {
    if (!rateLimit(request, "session-start", 10)) return jsonResponse(request, { ok: false, error: "Too many session requests. Try again shortly." }, 429);
    const body = await readJson(request);
    const configuredSupabase = Boolean(process.env["VITE_SUPABASE_URL"]?.trim() && process.env["VITE_SUPABASE_ANON_KEY"]?.trim());
    const authenticatedId = await authenticatedUserId(request);
    const requestedId = clean(body.user_id ?? body.userId, 180);
    const localDevelopment = ["localhost", "127.0.0.1"].includes(url.hostname) && process.env.NODE_ENV !== "production";
    if (configuredSupabase && !authenticatedId && !localDevelopment) return jsonResponse(request, { ok: false, error: "Sign in to BuildMyLogic before starting a VS Code session." }, 401);
    if (authenticatedId && requestedId && authenticatedId !== requestedId) return jsonResponse(request, { ok: false, error: "Session user does not match the authenticated learner." }, 403);
    body.user_id = authenticatedId ?? (requestedId || "local-builder");
    try {
      const session = await startLearningSession(body);
      return jsonResponse(request, { ok: true, session_id: session.sessionId, state: stateOf(session) });
    } catch (error) { return jsonResponse(request, { ok: false, error: error instanceof Error ? error.message : "Could not start session." }, 400); }
  }

  if (request.method === "POST" && pathname === "/api/sessions/connect") {
    if (!rateLimit(request, "session-connect", 20)) return jsonResponse(request, { ok: false, error: "Too many connection attempts. Try again shortly." }, 429);
    const body = await readJson(request); const state = await connectLearningSession(body);
    return state ? jsonResponse(request, { ok: true, session: state }) : jsonResponse(request, { ok: false, error: "Session ID was not found or has expired. Start a new session on the BuildMyLogic website." }, 404);
  }

  const learningMatch = pathname.match(/^\/api\/sessions\/([^/]+)(?:\/(events|test-result|hint|stuck|failed|complete|run-plan|submit|state))?$/);
  if (learningMatch) {
    if (!rateLimit(request, "session-action", 120)) return jsonResponse(request, { ok: false, error: "Too many requests. Try again shortly." }, 429);
    const session = await verifySession(decodeURIComponent(learningMatch[1] ?? "").toUpperCase(), learningMatch[2] === "state");
    if (!session) return jsonResponse(request, { ok: false, error: "Invalid, expired, or unauthorized session." }, 401);
    const action = learningMatch[2] ?? "state";
    if (request.method === "GET" && action === "state") return jsonResponse(request, { ok: true, state: stateOf(session) });
    if (request.method !== "POST") return jsonResponse(request, { ok: false, error: "Method not allowed." }, 405);
    const body = await readJson(request);
    try {
      if (action === "events") return jsonResponse(request, { ok: true, state: recordEvent(session, clean(body.event_type, 80), body.payload && typeof body.payload === "object" ? body.payload as Record<string, unknown> : {}) });
      if (action === "test-result") return jsonResponse(request, { ok: true, state: recordEvent(session, "test_result", body) });
      if (action === "hint") return jsonResponse(request, { ok: true, ...(await getHint(session)) });
      if (action === "stuck") return jsonResponse(request, { ok: true, ...(await getHint(session, true)) });
      if (action === "failed") return jsonResponse(request, { ok: true, ...(await failSession(session, clean(body.reason, 1000))) });
      if (action === "run-plan") return jsonResponse(request, { ok: true, run_plan: await getRunPlan(session, clean(body["platform"], 40) || "linux"), state: stateOf(session) });
      if (action === "submit") return jsonResponse(request, { ok: true, ...(await submitProject(session, body["files"])) });
      if (action === "complete") return jsonResponse(request, { ok: true, state: recordEvent(session, "test_result", { passed: 1, total: 1 }) });
      return jsonResponse(request, { ok: false, error: "Unknown session action." }, 404);
    } catch (error) { return jsonResponse(request, { ok: false, error: error instanceof Error ? error.message : "Could not update session." }, 400); }
  }


  return jsonResponse(request, { ok: false, error: "BuildMyLogic API endpoint not found." }, 404);
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      // Cloudflare/Lovable injects secrets into the Worker `env` object at request time.
      // TanStack server functions in this app read secrets from process.env per request.
      // Bridge the Worker binding here so SARVAM_API_KEY is available in production.
      const runtimeEnv = env as Record<string, unknown> | null | undefined;
      const sarvamApiKey = runtimeEnv?.SARVAM_API_KEY;
      if (typeof sarvamApiKey === "string" && sarvamApiKey.trim()) {
        process.env.SARVAM_API_KEY = sarvamApiKey;
      }
      for (const name of ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"]) {
        const value = runtimeEnv?.[name];
        if (typeof value === "string" && value.trim()) process.env[name] = value;
      }

      const apiResponse = await handleBuildMyLogicApi(request);
      if (apiResponse) return apiResponse;

      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
