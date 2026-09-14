import { sarvamJson } from "./sarvam.server";

export type LearningSession = {
  sessionId: string; userId: string; challengeId: string;
  title: string; language: string; concept: string; instructions: string; expectedSkills: string[];
  testCommand?: string; status: "active" | "connected" | "failed" | "completed" | "expired";
  startedAt: string; connectedAt?: string; lastSeenAt?: string; attempts: number; hintsUsed: number;
  testScore?: { passed: number; total: number }; latestFeedback?: string; recovery?: string;
  potentialStruggle: boolean; struggleSignal?: string;
  checkpoints: Array<{ index: number; title: string; detail: string; status: "locked" | "active" | "passed" | "failed"; evidence: "not_verified" | "detected" | "verified"; attempts: number; lastOutput?: string }>;
  projectFiles?: Array<{ path: string; content: string }>;
  projectReview?: { score: number; verdict: string; strengths: string[]; issues: string[]; missing: string[]; nextSteps: string[] };
  runGuidance?: string;
  events: Array<{ eventType: string; at: string; payload: Record<string, unknown> }>;
};

type SessionRuntime = typeof globalThis & { __buildMyLogicLearningSessions?: Map<string, LearningSession> };
const runtime = globalThis as SessionRuntime;
// Keep the development session repository on globalThis so Vite's SSR module reload
// does not invalidate an ID that the website has just handed to VS Code.
const sessions = runtime.__buildMyLogicLearningSessions ??= new Map<string, LearningSession>();
const allowedEvents = new Set(["heartbeat", "test_result", "build_result", "compiler_error", "runtime_error", "file_evidence", "stuck", "session_ended"]);
const SESSION_TTL_MS = 4 * 60 * 60 * 1000;
const HEARTBEAT_TIMEOUT_MS = 45 * 1000;
const text = (value: unknown, max = 1000) => String(value ?? "").trim().slice(0, max);
const code = () => `BML-${Array.from(crypto.getRandomValues(new Uint8Array(5)), x => (x % 36).toString(36).toUpperCase()).join("")}`;
const checkpointText = (value: unknown) => String(value ?? "").replace(/^\s*(?:•|-|\d+[.)])\s*/, "").trim().slice(0, 1000);

function makeCheckpoints(body: Record<string, unknown>, instructions: string) {
  const raw = Array.isArray(body["checkpoints"]) ? body["checkpoints"] : [];
  const source = raw.length ? raw : instructions.split(/\n+/).filter((line) => /^\s*(?:•|-|\d+[.)])\s+/.test(line));
  const checkpoints = source.map((item, index) => {
    const record = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const line = typeof item === "string" ? item : `${record["title"] ?? "Step ${index + 1}"}: ${record["detail"] ?? "Complete this step."}`;
    const [title, ...detailParts] = checkpointText(line).split(/:\s*/, 2);
    return { index, title: text(record["title"] ?? title, 180) || `Step ${index + 1}`, detail: text(record["detail"] ?? detailParts.join(": "), 1000) || checkpointText(line), status: index === 0 ? "active" as const : "locked" as const, evidence: "not_verified" as const, attempts: 0 };
  });
  return checkpoints.length ? checkpoints : [{ index: 0, title: "Complete the challenge", detail: "Build the requested project and verify it locally.", status: "active" as const, attempts: 0 }];
}

export function startLearningSession(body: Record<string, unknown>): LearningSession {
  const challengeId = text(body["challenge_id"] ?? body["challengeId"], 180);
  if (!challengeId) throw new Error("challenge_id is required.");
  let sessionId = code(); while (sessions.has(sessionId)) sessionId = code();
  const rawSkills = Array.isArray(body["expected_skills"]) ? body["expected_skills"] : [];
  const instructions = text(body["instructions"], 6000).replace(/\\n/g, "\n");
  const session: LearningSession = {
    sessionId, userId: text(body["user_id"] ?? body["userId"], 180) || "local-builder", challengeId,
    title: text(body["title"], 180) || challengeId, language: text(body["language"], 64) || "Python",
    concept: text(body["concept"], 180) || "problem solving", instructions,
    expectedSkills: rawSkills.map(x => text(x, 100)).filter(Boolean),
    status: "active", startedAt: new Date().toISOString(), attempts: 0, hintsUsed: 0,
    potentialStruggle: false, checkpoints: makeCheckpoints(body, instructions), events: [],
  };
  const configuredTest = text(body["test_command"], 500); if (configuredTest) session.testCommand = configuredTest;
  sessions.set(sessionId, session); return session;
}

export function verifySession(sessionId: string, allowFinished = false): LearningSession | undefined {
  const session = sessions.get(sessionId);
  if (!session || Date.now() - Date.parse(session.startedAt) > SESSION_TTL_MS) {
    if (session) session.status = "expired";
    return undefined;
  }
  if (!allowFinished && !["active", "connected"].includes(session.status)) return undefined;
  return session;
}

function compact(session: LearningSession) {
  const lastSeen = session.lastSeenAt ? Date.parse(session.lastSeenAt) : 0;
  const extensionStatus = session.status === "failed" || session.status === "completed"
    ? session.status
    : lastSeen && Date.now() - lastSeen <= HEARTBEAT_TIMEOUT_MS
      ? "active"
      : session.connectedAt
        ? "disconnected"
        : "waiting";
  const checkpointInstructions = session.checkpoints.map((item) => `• ${item.evidence === "verified" ? "✓ VERIFIED" : item.evidence === "detected" ? "◐ DETECTED" : item.status === "failed" ? "✗ NOT VERIFIED" : item.status === "active" ? "→ NOT VERIFIED" : "○ NOT VERIFIED"} · Step ${item.index + 1}: ${item.title} — ${item.detail}`).join("\n");
  return { session_id: session.sessionId, challenge_id: session.challengeId, title: session.title, language: session.language,
    concept: session.concept, instructions: `${session.instructions}${checkpointInstructions ? `\n\nSequential checkpoints:\n${checkpointInstructions}` : ""}`, expected_skills: session.expectedSkills, test_command: session.testCommand,
    status: session.status, started_at: session.startedAt, connected_at: session.connectedAt, attempts: session.attempts,
    hints_used: session.hintsUsed, test_score: session.testScore, latest_mentor_feedback: session.latestFeedback, recovery: session.recovery,
    potential_struggle: session.potentialStruggle, struggle_signal: session.struggleSignal,
    checkpoints: session.checkpoints, project_review: session.projectReview, run_guidance: session.runGuidance,
    extension_status: extensionStatus };
}

export function connectLearningSession(body: Record<string, unknown>) {
  const sessionId = text(body["session_id"], 40).toUpperCase(); const session = verifySession(sessionId);
  if (!session) return undefined;
  session.status = "connected"; session.connectedAt ??= new Date().toISOString(); session.lastSeenAt = new Date().toISOString();
  return compact(session);
}

export function stateOf(session: LearningSession) { return compact(session); }

function boundedPayload(payload: Record<string, unknown>) {
  const allowed = ["status", "passed", "failed", "errors", "score", "total", "attempt", "error", "stderr", "stdout", "file", "language", "signals", "diagnostics", "duration_ms", "checkpoint_results"];
  const result: Record<string, unknown> = {};
  for (const key of allowed) {
    const value = payload[key];
    if (value === undefined) continue;
    if (key === "diagnostics" && Array.isArray(value)) {
      result[key] = value.slice(0, 10).map((item) => text(typeof item === "object" ? JSON.stringify(item) : item, 500));
    } else if (typeof value === "object") {
      result[key] = text(JSON.stringify(value), 2000);
    } else if (typeof value === "number" || typeof value === "boolean") {
      result[key] = value;
    } else {
      result[key] = text(value, key === "stderr" || key === "stdout" ? 2000 : 500);
    }
  }
  return result;
}

function applyCheckpointResults(session: LearningSession, values: unknown) {
  if (!Array.isArray(values)) return;
  let blocked = false;
  for (const item of values) {
    if (!item || typeof item !== "object") continue;
    const result = item as Record<string, unknown>;
    const index = Number(result["index"]);
    const checkpoint = session.checkpoints[index];
    if (!checkpoint || blocked || index !== session.checkpoints.findIndex((candidate) => candidate.status !== "passed")) break;
    checkpoint.attempts += 1;
    checkpoint.lastOutput = text(result["output"], 1200);
    if (Boolean(result["passed"])) {
      checkpoint.status = "passed";
      checkpoint.evidence = "verified";
      const next = session.checkpoints[index + 1];
      if (next && next.status === "locked") next.status = "active";
    } else {
      checkpoint.status = "failed";
      checkpoint.evidence = "not_verified";
      blocked = true;
    }
  }
  const passed = session.checkpoints.filter((checkpoint) => checkpoint.status === "passed").length;
  session.testScore = { passed, total: session.checkpoints.length };
  if (passed === session.checkpoints.length) session.status = "completed";
}

function checkpointWasDetected(checkpoint: LearningSession["checkpoints"][number], payload: Record<string, unknown>) {
  const signals = Array.isArray(payload["signals"]) ? payload["signals"].map((value) => text(value, 120).toLowerCase()) : [];
  const haystack = [...signals, text(payload["file"], 240).toLowerCase(), text(payload["language"], 80).toLowerCase()].join(" ");
  if (!haystack.trim()) return false;
  const description = `${checkpoint.title} ${checkpoint.detail}`.toLowerCase();
  const signalRules: Array<[string[], string[]]> = [
    [["virtual environment", "venv"], ["venv", "virtual-environment", "workspace:venv"]],
    [["pandas"], ["pandas", "dependency:pandas", "import:pandas"]],
    [["matplotlib"], ["matplotlib", "dependency:matplotlib", "import:matplotlib"]],
    [["main.py"], ["file:main.py"]],
    [["print", "print statement"], ["code:print"]],
    [["project folder", "project directory"], ["workspace:project"]],
  ];
  if (signalRules.some(([terms, matches]) => terms.some((term) => description.includes(term)) && matches.some((match) => haystack.includes(match)))) return true;
  const ignored = new Set(["create", "install", "add", "with", "from", "into", "this", "that", "your", "step", "project", "folder", "file", "the", "and", "run"]);
  return description.split(/[^a-z0-9_.]+/).filter((word) => word.length >= 5 && !ignored.has(word)).some((word) => haystack.includes(word));
}

function applyDetectedEvidence(session: LearningSession, payload: Record<string, unknown>) {
  for (const checkpoint of session.checkpoints) {
    if (checkpoint.evidence === "verified" || checkpoint.evidence === "detected") continue;
    if (checkpointWasDetected(checkpoint, payload)) checkpoint.evidence = "detected";
  }
}

export function recordEvent(session: LearningSession, eventType: string, payload: Record<string, unknown>) {
  if (!allowedEvents.has(eventType)) throw new Error("Unsupported session event.");
  const at = new Date().toISOString(); session.lastSeenAt = at;
  // Evidence is deliberately structured and bounded; no whole workspace/code is retained.
  const safePayload = boundedPayload(payload);
  if (eventType === "file_evidence") applyDetectedEvidence(session, payload);
  if (eventType === "test_result") applyCheckpointResults(session, payload["checkpoint_results"]);
  session.events.push({ eventType, at, payload: safePayload }); if (session.events.length > 200) session.events.shift();
  if (eventType === "test_result") {
    session.attempts += 1; const passed = Math.max(0, Number(safePayload["passed"] ?? safePayload["score"] ?? 0)); const total = Math.max(passed, Number(safePayload["total"] ?? 0));
    if (!Array.isArray(payload["checkpoint_results"])) session.testScore = { passed, total };
    const failedTests = Number(safePayload["failed"] ?? safePayload["errors"] ?? (passed < total ? 1 : 0));
    const previousFailures = session.events.filter((item) => item.eventType === "test_result" && Number(item.payload["passed"] ?? item.payload["score"] ?? 0) < Number(item.payload["total"] ?? 1)).length;
    const currentError = text(safePayload["error"] ?? safePayload["stderr"], 500);
    const sameError = currentError && session.events.slice(0, -1).some((item) => text(item.payload["error"] ?? item.payload["stderr"], 500) === currentError);
    if (failedTests > 0 || passed < total) {
      session.potentialStruggle = previousFailures >= 2 || Boolean(sameError);
      if (session.potentialStruggle) session.struggleSignal = sameError ? "repeated_error" : "repeated_failed_tests";
    }
    if (total > 0 && passed >= total) session.status = "completed";
  }
  if (eventType === "session_ended") session.status = "expired";
  return stateOf(session);
}

function fallbackRunPlan(session: LearningSession, platform: string) {
  const language = session.language.toLowerCase();
  const windows = platform === "win32";
  if (session.testCommand) return { command: session.testCommand, guidance: `Run the configured ${session.language} challenge command from the project root.` };
  if (language.includes("python")) {
    const python = windows ? "py -3" : "python3";
    const instructions = session.instructions.toLowerCase();
    if (instructions.includes("uvicorn") || instructions.includes("fastapi")) return { command: `${python} -m uvicorn main:app --reload`, guidance: `On ${windows ? "Windows" : "Ubuntu/Linux"}, BuildMyLogic will run the FastAPI development server from your project root.` };
    if (instructions.includes("pytest") || instructions.includes("test")) return { command: `${python} -m pytest`, guidance: `On ${windows ? "Windows" : "Ubuntu/Linux"}, run the Python tests from the project root.` };
    return { command: `${python} main.py`, guidance: `On ${windows ? "Windows" : "Ubuntu/Linux"}, run the Python entry file from the project root.` };
  }
  if (language.includes("javascript") || language.includes("typescript")) return { command: "npm test", guidance: "BuildMyLogic will run the project's npm test script locally." };
  return { command: "", guidance: "Open the project terminal and configure a safe test command for this language." };
}

export async function getRunPlan(session: LearningSession, platform: string) {
  const fallback = fallbackRunPlan(session, platform);
  const apiKey = process.env["SARVAM_API_KEY"]?.trim();
  if (apiKey) {
    try {
      const answer = await sarvamJson<{ guidance?: string }>(apiKey,
        "You are a developer tooling mentor. Return JSON only: {\"guidance\":\"...\"}. Explain briefly how to run this project on the requested operating system. Never invent files or claim a command is safe if it is not obvious.",
        JSON.stringify({ language: session.language, platform, challenge: session.title, instructions: session.instructions, safe_command: fallback.command }), 300);
      session.runGuidance = text(answer.guidance, 1000) || fallback.guidance;
    } catch { session.runGuidance = fallback.guidance; }
  } else session.runGuidance = fallback.guidance;
  return { command: fallback.command, guidance: session.runGuidance, platform };
}

export async function submitProject(session: LearningSession, files: unknown) {
  if (!Array.isArray(files)) throw new Error("Project files are required.");
  const accepted = files.filter((item): item is { path: string; content: string } => Boolean(item && typeof item === "object" && typeof (item as Record<string, unknown>)["path"] === "string" && typeof (item as Record<string, unknown>)["content"] === "string")).slice(0, 250).map((file) => ({ path: text(file.path, 240), content: file.content.slice(0, 250000) }));
  const totalBytes = accepted.reduce((sum, file) => sum + file.content.length, 0);
  if (!accepted.length) throw new Error("No readable project files were found.");
  if (totalBytes > 8 * 1024 * 1024) throw new Error("Project submission is over the 8 MB limit. Exclude dependencies, build output and virtual environments.");
  session.projectFiles = accepted;
  const names = accepted.map((file) => file.path).join(", ").slice(0, 4000);
  const fallback = { score: session.status === "completed" ? 95 : 70, verdict: session.status === "completed" ? "Your project passed the BuildMyLogic evidence checks." : "Your project was submitted. BuildMyLogic found the next evidence you should strengthen.", strengths: accepted.length ? [`Submitted ${accepted.length} project files.`, `The ${session.language} project is connected to this learning session.`] : [], issues: session.status === "completed" ? [] : ["Complete the sequential checkpoints before claiming the project as proven."], missing: [], nextSteps: ["Review the checkpoint results, then run the project again."] };
  const apiKey = process.env["SARVAM_API_KEY"]?.trim();
  if (apiKey) {
    try {
      const answer = await sarvamJson<typeof fallback>(apiKey,
        "You are Vibe, a fair programming mentor. Return JSON only with score (0-100), verdict, strengths, issues, missing and nextSteps arrays. Review evidence, do not invent test results, and give concrete beginner-friendly next steps.",
        JSON.stringify({ challenge: session.title, language: session.language, checkpoints: session.checkpoints, files: names, code_samples: accepted.slice(0, 12).map((file) => ({ path: file.path, content: file.content.slice(0, 1200) })) }), 700);
      session.projectReview = { ...fallback, ...answer, score: Math.max(0, Math.min(100, Number(answer.score ?? fallback.score))) };
    } catch { session.projectReview = fallback; }
  } else session.projectReview = fallback;
  session.events.push({ eventType: "project_submitted", at: new Date().toISOString(), payload: { files: accepted.length, bytes: totalBytes } });
  return { review: session.projectReview, state: stateOf(session), file_count: accepted.length };
}

function recentError(session: LearningSession) {
  const item = [...session.events].reverse().find(e => ["test_result", "compiler_error", "runtime_error", "build_result"].includes(e.eventType));
  return text(item?.payload["error"] ?? item?.payload["stderr"], 1200) || "No specific error was reported.";
}

async function mentor(session: LearningSession, level: "hint" | "stuck" | "recovery") {
  const fallback = level === "recovery" ? "That is okay. Focus on one small condition related to the failing case, then try it before returning to the full challenge."
    : level === "stuck" ? `Let's isolate one small step. What condition should you check before the operation related to: ${recentError(session)}?`
    : `What happens in your program when this situation occurs: ${recentError(session)}?`;
  const apiKey = process.env["SARVAM_API_KEY"]?.trim(); if (!apiKey) return fallback;
  try {
    const answer = await sarvamJson<{ guidance?: string }>(apiKey,
      "You are Vibe, a patient beginner programming mentor. Return JSON only: {\"guidance\":\"...\"}. Do not give a complete solution. Ask one thinking question and give a progressively stronger, concise hint.",
      JSON.stringify({ level, language: session.language, challenge: session.title, current_concept: session.concept, error: recentError(session), attempts: session.attempts, test_score: session.testScore ? `${session.testScore.passed}/${session.testScore.total}` : "not run", previous_hints: session.hintsUsed, known_concepts: session.expectedSkills }), 400);
    return text(answer.guidance, 1200) || fallback;
  } catch { return fallback; }
}

export async function getHint(session: LearningSession, stuck = false) {
  if (stuck) recordEvent(session, "stuck", {}); else session.hintsUsed += 1;
  const guidance = await mentor(session, stuck ? "stuck" : "hint"); session.latestFeedback = guidance;
  return { guidance, intervention_level: stuck ? "guided" : session.hintsUsed > 1 ? "stronger_hint" : "hint", state: stateOf(session) };
}

export async function failSession(session: LearningSession, reason: string) {
  session.status = "failed"; const guidance = await mentor(session, "recovery"); session.recovery = guidance; session.latestFeedback = guidance;
  session.events.push({ eventType: "failed", at: new Date().toISOString(), payload: { reason: text(reason, 1000), attempts: session.attempts, test_score: session.testScore, hints_used: session.hintsUsed } });
  return { recovery: guidance, mini_task: `Write one ${session.language} condition that protects the failing case before retrying ${session.title}.`, state: stateOf(session) };
}
