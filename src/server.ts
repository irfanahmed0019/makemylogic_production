import "./lib/error-capture";

import { authenticatedUserId } from "./lib/request-auth.server";
import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import {
  connectLearningSession,
  failSession,
  getHint,
  getRunPlan,
  recordEvent,
  startLearningSession,
  stateOf,
  submitProject,
  verifySession,
  waitForSessionChange,
} from "./lib/learning-sessions.server";

type ServerEntry = {
  fetch: (
    request: Request,
    env: unknown,
    ctx: unknown,
  ) => Promise<Response> | Response;
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
    .map((value) => value.trim())
    .filter(Boolean);
  return origin === requestOrigin || configured.includes(origin)
    ? origin
    : undefined;
}

function corsHeaders(request: Request): Record<string, string> {
  const origin = allowedOrigin(request);
  return {
    ...(origin
      ? { "access-control-allow-origin": origin, vary: "Origin" }
      : {}),
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
  if (Number.isFinite(contentLength) && contentLength > 1_000_000)
    throw new Error("Request body too large.");
  try {
    const reader = request.body?.getReader();
    if (!reader) return {};
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1_000_000) {
        await reader.cancel();
        return {};
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    const body = JSON.parse(new TextDecoder().decode(bytes));
    return body && typeof body === "object"
      ? (body as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function clean(value: unknown, max = 500): string {
  return String(value ?? "")
    .trim()
    .slice(0, max);
}

type RateBucket = { count: number; resetsAt: number };
type SecurityRuntime = typeof globalThis & {
  __buildMyLogicRateLimits?: Map<string, RateBucket>;
};
const rateLimits = ((globalThis as SecurityRuntime).__buildMyLogicRateLimits ??=
  new Map<string, RateBucket>());

function rateLimit(
  request: Request,
  scope: string,
  limit: number,
  windowMs = 60_000,
): boolean {
  const forwarded = request.headers
    .get("x-forwarded-for")
    ?.split(",")[0]
    ?.trim();
  const client =
    forwarded || request.headers.get("cf-connecting-ip")?.trim() || "unknown";
  const key = `${scope}:${client}`;
  const now = Date.now();
  if (rateLimits.size >= 10_000) {
    for (const [entry, value] of rateLimits)
      if (value.resetsAt <= now) rateLimits.delete(entry);
    if (rateLimits.size >= 10_000 && !rateLimits.has(key)) return false;
  }
  const bucket = rateLimits.get(key);
  if (!bucket || bucket.resetsAt <= now) {
    rateLimits.set(key, { count: 1, resetsAt: now + windowMs });
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count += 1;
  return true;
}

// A random 128-bit Session ID is the scoped VS Code capability. Only sessions
// created under verified login qualify. Supplied bearer tokens must match owner.
async function sessionAuthorized(request: Request, session: { userId: string; sessionId: string; authenticatedOwner?: boolean }): Promise<boolean> {
  if (session.authenticatedOwner !== true || !/^[0-9a-f-]{36}$/i.test(session.userId) || !/^BML-[A-F0-9]{32}$/.test(session.sessionId)) return false;
  if (!request.headers.has("authorization")) return true;
  return (await authenticatedUserId(request)) === session.userId;
}

async function handleBuildMyLogicApi(
  request: Request,
): Promise<Response | null> {
  const url = new URL(request.url);
  const pathname = url.pathname;
  if (!pathname.startsWith("/api/")) return null;

  if (request.method === "OPTIONS") {
    if (request.headers.get("origin") && !allowedOrigin(request))
      return new Response(null, { status: 403 });
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }
  if (request.headers.get("origin") && !allowedOrigin(request)) {
    return jsonResponse(
      request,
      { ok: false, error: "Origin is not allowed." },
      403,
    );
  }

  // Learning sessions are the shared source of truth for the web dashboard and VS Code.
  // The website authenticates session creation. The extension joins the same session with
  // the short Session ID copied from the website.
  if (request.method === "POST" && pathname === "/api/sessions/start") {
    if (!rateLimit(request, "session-start", 10))
      return jsonResponse(
        request,
        { ok: false, error: "Too many session requests. Try again shortly." },
        429,
      );
    const body = await readJson(request);
    const authenticatedId = await authenticatedUserId(request);
    if (!authenticatedId)
      return jsonResponse(request, { ok: false, error: "Sign in to BuildMyLogic before starting a VS Code session." }, 401);
    const requestedId = clean(body["user_id"] ?? body["userId"], 180);
    if (requestedId && requestedId !== authenticatedId)
      return jsonResponse(request, { ok: false, error: "Session user does not match the authenticated learner." }, 403);
    body["user_id"] = authenticatedId;
    delete body["userId"];
    try {
      const session = await startLearningSession(body, authenticatedId);
      return jsonResponse(request, {
        ok: true,
        session_id: session.sessionId,
        state: stateOf(session),
      });
    } catch (error) {
      return jsonResponse(
        request,
        {
          ok: false,
          error:
            error instanceof Error ? error.message : "Could not start session.",
        },
        400,
      );
    }
  }

  if (request.method === "POST" && pathname === "/api/sessions/connect") {
    if (!rateLimit(request, "session-connect", 20))
      return jsonResponse(
        request,
        {
          ok: false,
          error: "Too many connection attempts. Try again shortly.",
        },
        429,
      );
    const body = await readJson(request);
    const sessionId = clean(body["session_id"], 40).toUpperCase();
    const session = await verifySession(sessionId);
    if (!session || !(await sessionAuthorized(request, session)))
      return jsonResponse(request, { ok: false, error: "Invalid, expired, or unauthorized session." }, 401);
    const state = await connectLearningSession(body);
    return state
      ? jsonResponse(request, { ok: true, session: state })
      : jsonResponse(
          request,
          {
            ok: false,
            error:
              "Session ID was not found or has expired. Start a new session on the BuildMyLogic website.",
          },
          404,
        );
  }

  const learningMatch = pathname.match(
    /^\/api\/sessions\/([^/]+)(?:\/(events|test-result|hint|stuck|failed|complete|run-plan|submit|state))?$/,
  );
  if (learningMatch) {
    if (!rateLimit(request, "session-action", 120))
      return jsonResponse(
        request,
        { ok: false, error: "Too many requests. Try again shortly." },
        429,
      );
    const session = await verifySession(
      decodeURIComponent(learningMatch[1] ?? "").toUpperCase(),
      learningMatch[2] === "state",
    );
    if (!session || !(await sessionAuthorized(request, session)))
      return jsonResponse(
        request,
        { ok: false, error: "Invalid, expired, or unauthorized session." },
        401,
      );
    const action = learningMatch[2] ?? "state";
    if (request.method === "GET" && action === "state") {
      // Long-poll support: `?since=<rev>&wait=<ms>` holds the request until the
      // session actually changes, so the VS Code extension renders website
      // updates instantly instead of on a 15 second timer.
      const sinceRaw = url.searchParams.get("since");
      const since = sinceRaw === null ? Number.NaN : Number(sinceRaw);
      const wait = Math.max(
        0,
        Math.min(Number(url.searchParams.get("wait") ?? "0") || 0, 8_000),
      );
      if (wait > 0 && Number.isFinite(since) && (session.rev ?? 0) <= since) {
        await waitForSessionChange(session.sessionId, since, wait);
      }
      return jsonResponse(request, { ok: true, state: stateOf(session) });
    }
    if (request.method !== "POST")
      return jsonResponse(
        request,
        { ok: false, error: "Method not allowed." },
        405,
      );
    const body = await readJson(request);
    try {
      if (action === "events")
        return jsonResponse(request, {
          ok: true,
          state: recordEvent(
            session,
            clean(body["event_type"], 80),
            body["payload"] && typeof body["payload"] === "object"
              ? (body["payload"] as Record<string, unknown>)
              : {},
          ),
        });
      if (action === "test-result")
        return jsonResponse(request, {
          ok: true,
          state: recordEvent(session, "test_result", body),
        });
      if (action === "hint")
        return jsonResponse(request, { ok: true, ...(await getHint(session)) });
      if (action === "stuck")
        return jsonResponse(request, {
          ok: true,
          ...(await getHint(session, true)),
        });
      if (action === "failed")
        return jsonResponse(request, {
          ok: true,
          ...(await failSession(session, clean(body["reason"], 1000))),
        });
      if (action === "run-plan")
        return jsonResponse(request, {
          ok: true,
          run_plan: await getRunPlan(
            session,
            clean(body["platform"], 40) || "linux",
          ),
          state: stateOf(session),
        });
      if (action === "submit")
        return jsonResponse(request, {
          ok: true,
          ...(await submitProject(session, body["files"])),
        });
      if (action === "complete")
        return jsonResponse(request, {
          ok: true,
          state: recordEvent(session, "test_result", { passed: 1, total: 1 }),
        });
      return jsonResponse(
        request,
        { ok: false, error: "Unknown session action." },
        404,
      );
    } catch (error) {
      return jsonResponse(
        request,
        {
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : "Could not update session.",
        },
        400,
      );
    }
  }

  return jsonResponse(
    request,
    { ok: false, error: "BuildMyLogic API endpoint not found." },
    404,
  );
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(
  response: Response,
): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(
    consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`),
  );
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as {
      unhandled?: unknown;
      message?: unknown;
    };
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
      for (const name of [
        "VITE_SUPABASE_URL",
        "VITE_SUPABASE_ANON_KEY",
        "SUPABASE_SERVICE_ROLE_KEY",
      ]) {
        const value = runtimeEnv?.[name];
        if (typeof value === "string" && value.trim())
          process.env[name] = value;
      }

      const apiResponse = await handleBuildMyLogicApi(request);
      if (apiResponse) return apiResponse;

      const functionBase = process.env["TSS_SERVER_FN_BASE"] || "/_serverFn";
      if (new URL(request.url).pathname.startsWith(functionBase)) {
        if (request.method !== "POST")
          return jsonResponse(
            request,
            { ok: false, error: "Method not allowed." },
            405,
          );
        if (request.headers.get("origin") && !allowedOrigin(request))
          return jsonResponse(
            request,
            { ok: false, error: "Origin is not allowed." },
            403,
          );
        if (Number(request.headers.get("content-length") || "0") > 1_000_000)
          return jsonResponse(
            request,
            { ok: false, error: "Request body too large." },
            413,
          );
        if (!(await authenticatedUserId(request)))
          return jsonResponse(request, { ok: false, error: "Sign in to use BuildMyLogic AI." }, 401);
        if (!rateLimit(request, "ai-functions", 20))
          return jsonResponse(
            request,
            { ok: false, error: "Too many requests. Try again shortly." },
            429,
          );
      }
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
