/**
 * End-to-end check for website → VS Code instant sync.
 *
 * It exercises the exact HTTP contract the extension uses
 * (`SessionClient` from vscode-extension/src) against the running dev server:
 *
 *   1. start a session without a bearer token (auth is temporarily paused)
 *   2. connect with the short Session ID
 *   3. open a long-poll state read (`?since=<rev>&wait=8000`)
 *   4. make a website-side change 700ms later
 *   5. assert the long-poll returns in well under the old 15s poll interval
 *
 * Usage:  node scripts/verify-instant-sync.mjs [baseUrl]
 * Default baseUrl: http://localhost:8080
 */

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const esbuild = require("../vscode-extension/node_modules/esbuild/lib/main.js");

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const baseUrl = (process.argv[2] || "http://localhost:8080").replace(/\/$/, "");

/** Bundle the real extension client so we test shipped code, not a copy of it. */
async function loadSessionClient() {
  const result = await esbuild.build({
    entryPoints: [path.join(root, "vscode-extension/src/sessionClient.ts")],
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
    write: false,
    logLevel: "silent",
  });
  const code = result.outputFiles[0].text;
  const url = `data:text/javascript;base64,${Buffer.from(code, "utf8").toString("base64")}`;
  return (await import(url)).SessionClient;
}

const checks = [];
function check(name, passed, detail) {
  checks.push({ name, passed, detail });
  console.log(
    `${passed ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`,
  );
}

async function post(pathname, body) {
  const response = await fetch(baseUrl + pathname, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await response.json();
  return { response, json };
}

const SessionClient = await loadSessionClient();
console.log(`Target: ${baseUrl}\n`);

// 1 — session creation must work without an Authorization header while auth is paused.
const started = await post("/api/sessions/start", {
  challenge_id: "sync-latency-check",
  user_id: "local-builder",
  title: "Instant sync latency check",
  language: "Python",
  concept: "loops",
  instructions:
    "Run the loop challenge.\n\nRequirements:\nStep 1: Build the loop",
  checkpoints: [
    {
      index: 0,
      title: "Build the loop",
      detail: "Write a loop that prints 1 to 5.",
    },
  ],
  expected_skills: ["python", "loops"],
});
check(
  "session starts without sign-in (auth paused)",
  started.response.ok && started.json.ok === true,
  started.json.ok ? started.json.session_id : started.json.error,
);

if (!started.json.session_id) {
  console.log("\nCannot continue without a session.");
  process.exit(1);
}

const sessionId = started.json.session_id;
const firstRev = started.json.state?.rev ?? 0;

// 2 — extension connects with the short ID.
const client = new SessionClient(baseUrl);
const connectStartedAt = Date.now();
const connected = await client.connect(sessionId);
const connectMs = Date.now() - connectStartedAt;
check("extension connects", Boolean(connected.session), `${connectMs}ms`);

// 3 — long-poll for a change that has not happened yet.
const since = connected.session?.rev ?? firstRev;
const pollStartedAt = Date.now();
const poll = client.state(sessionId, { since, waitMs: 8000 });

// 4 — website-side change 700ms later (this is what the site does on save/hint/test).
await new Promise((resolve) => setTimeout(resolve, 700));
const changed = await post(
  `/api/sessions/${encodeURIComponent(sessionId)}/events`,
  {
    // 1 of 2 checks green: a real update, but not a completed challenge, so the
    // session stays open for the follow-up hint below.
    event_type: "test_result",
    payload: {
      passed: 1,
      total: 2,
      score: 1,
      status: "partial",
      stdout: "first check green",
    },
  },
);
const pollMs = Date.now() - pollStartedAt;
const polled = await poll;

check(
  "change bumps the session revision",
  (polled.state?.rev ?? 0) > since,
  `rev ${since} → ${polled.state?.rev}`,
);
check(
  "long-poll wakes on the change instead of waiting 8s",
  pollMs < 3000,
  `${pollMs}ms (old poll interval: 15000ms)`,
);
check(
  "website sees the event immediately",
  changed.json.ok === true && (changed.json.state?.attempts ?? 0) >= 1,
  `attempts=${changed.json.state?.attempts}`,
);

// 5 — a second change must also arrive without waiting for a timer.
const secondSince = polled.state?.rev;
const secondStartedAt = Date.now();
let pollResolvedAt = 0;
const secondPoll = client
  .state(sessionId, { since: secondSince, waitMs: 8000 })
  .then((value) => {
    pollResolvedAt = Date.now() - secondStartedAt;
    return value;
  });
await new Promise((resolve) => setTimeout(resolve, 400));
const hintResult = await post(
  `/api/sessions/${encodeURIComponent(sessionId)}/hint`,
  {},
);
const hintAt = Date.now() - secondStartedAt;
const timedOut = await secondPoll;

// After the website finishes its change, the extension's very next read must
// return the new state immediately — no timer, no 15s wait.
const freshStartedAt = Date.now();
const fresh = await client.state(sessionId, {
  since: timedOut.state?.rev ?? secondSince,
  waitMs: 8000,
});
const freshMs = Date.now() - freshStartedAt;
const guidanceArrived =
  typeof fresh.state?.latest_mentor_feedback === "string" &&
  fresh.state.latest_mentor_feedback.length > 0;
check(
  "website change is picked up on the extension's next read",
  freshMs < 1000 &&
    (fresh.state?.rev ?? 0) > (secondSince ?? Number.MAX_SAFE_INTEGER) &&
    guidanceArrived,
  `resolved in ${freshMs}ms, rev ${secondSince} → ${fresh.state?.rev}, hint returned at ${hintAt}ms ok=${hintResult.json.ok}, guidance=${guidanceArrived}`,
);

const failed = checks.filter((item) => !item.passed);
console.log(
  `\n${checks.length - failed.length}/${checks.length} checks passed.`,
);
if (failed.length) process.exit(1);
