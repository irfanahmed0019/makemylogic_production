import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { CalendarDays, Check, CheckCircle2, ChevronDown, Code2, FolderOpen, Flame, Pause, Play, RotateCcw, ShieldCheck, Sparkles, Timer, Upload, X, XCircle } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { applyBuildSessionEvidence, applySarvamDashboardPlan, getLoopState, logActivity, recordMissionEvidence, setLoopState, useLoop } from "@/lib/loop-store";
import type { BuildSessionState, SessionReview } from "@/lib/loop-types";
import { aiRetunePlan, aiReviewProjectZip, aiReviewSession } from "@/lib/sarvam.functions";
import { getAuthSessionForApi } from "@/lib/auth";
import type { ProjectReview } from "@/lib/project-review";

export const Route = createFileRoute("/sessions")({ head: () => ({ meta: [{ title: "Sessions — BuildMyLogic" }] }), component: Sessions });
function fmt(total: number) { return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`; }
const BRIDGE_URL = "http://127.0.0.1:8091";
type RemoteSessionState = BuildSessionState & { extension_status: string };

function Sessions() {
  const state = useLoop();
  const plan = state.plan;
  const sessionPlan = plan?.session;
  const planned = sessionPlan?.totalMinutes ?? 45;
  const missions = plan?.missions ?? [];
  const activeMission = missions.find((m) => state.missionProgress[m.id]?.status !== "done") ?? missions[0];
  const storedStartedAt = typeof window !== "undefined" ? Number(window.localStorage.getItem("loop-session-started-at") || 0) : 0;
  const storedDuration = typeof window !== "undefined" ? Number(window.localStorage.getItem("loop-session-duration") || 0) : 0;
  const initialRemaining = storedStartedAt && storedDuration ? Math.max(0, storedDuration - Math.floor((Date.now() - storedStartedAt) / 1000)) : planned * 60;
  const [seconds, setSeconds] = useState(initialRemaining);
  const [running, setRunning] = useState(Boolean(storedStartedAt && initialRemaining > 0));
  const [done, setDone] = useState<number[]>([]);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [review, setReview] = useState<SessionReview | null>(null);
  const [projectReview, setProjectReview] = useState<ProjectReview | null>(null);
  const [zipBusy, setZipBusy] = useState(false);
  const [zipName, setZipName] = useState("");
  const [selectedHistory, setSelectedHistory] = useState<number | null>(null);
  const [workspacePath, setWorkspacePath] = useState("");
  const [projectFolder, setProjectFolder] = useState("");
  const [projectFileCount, setProjectFileCount] = useState(0);
  const [pickingProject, setPickingProject] = useState(false);
  const [vscodeSession, setVscodeSession] = useState<{ sessionId: string; status?: string } | null>(null);
  const [remoteState, setRemoteState] = useState<RemoteSessionState | null>(null);
  const [pickerError, setPickerError] = useState("");
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const startRef = useRef(planned * 60);
  const retuneKeyRef = useRef("");

  useEffect(() => {
    const saved = window.localStorage.getItem("loop-vscode-path") ?? "";
    const savedProject = window.localStorage.getItem("loop-project-folder") ?? "";
    const savedSession = window.localStorage.getItem("bml-vscode-session");
    setWorkspacePath(saved);
    setProjectFolder(savedProject);
    if (savedSession) {
      try {
        const parsed = JSON.parse(savedSession) as { sessionId?: string; status?: string };
        if (parsed.sessionId) setVscodeSession(parsed.status ? { sessionId: parsed.sessionId, status: parsed.status } : { sessionId: parsed.sessionId });
      } catch { window.localStorage.removeItem("bml-vscode-session"); }
    }
    folderInputRef.current?.setAttribute("webkitdirectory", "");
    folderInputRef.current?.setAttribute("directory", "");
  }, []);

  useEffect(() => {
    if (window.localStorage.getItem("loop-session-started-at")) return;
    startRef.current = planned * 60;
    setSeconds(planned * 60);
  }, [planned]);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setSeconds((value) => { if (value <= 1) { setRunning(false); window.localStorage.removeItem("loop-session-started-at"); window.localStorage.removeItem("loop-session-duration"); return 0; } return value - 1; }), 1000);
    return () => window.clearInterval(id);
  }, [running]);

  useEffect(() => {
    if (window.localStorage.getItem("loop-auto-start-session") !== "1") return;
    window.localStorage.removeItem("loop-auto-start-session");
    const duration = planned * 60;
    startRef.current = duration;
    setSeconds(duration);
    setRunning(true);
    window.localStorage.setItem("loop-session-started-at", String(Date.now()));
    window.localStorage.setItem("loop-session-duration", String(duration));
    const savedPath = window.localStorage.getItem("loop-vscode-path") ?? "";
    if (savedPath) {
      window.setTimeout(() => { void fetch(`${BRIDGE_URL}/open-vscode`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: savedPath }) }); }, 100);
    }
  }, []);

  useEffect(() => {
    if (!vscodeSession) return;
    let cancelled = false;
    const sync = async () => {
      try {
        const response = await fetch(`/api/sessions/${encodeURIComponent(vscodeSession.sessionId)}/state`, { cache: "no-store" });
        const result = await response.json() as { ok?: boolean; state?: RemoteSessionState };
        if (!cancelled && result.ok && result.state) {
          setRemoteState(result.state);
          setVscodeSession((current) => {
            if (!current) return current;
            const status = result.state?.extension_status ?? result.state?.status;
            return status ? { ...current, status } : current;
          });
        } else if (!cancelled && (response.status === 401 || response.status === 404)) {
          setVscodeSession(null);
          setRemoteState(null);
          window.localStorage.removeItem("bml-vscode-session");
          setPickerError("That VS Code session expired after the server restarted. Start a new session to generate a fresh Session ID.");
        }
      } catch { /* Retain the last confirmed state while offline. */ }
    };
    void sync(); const id = window.setInterval(() => void sync(), 5000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [vscodeSession?.sessionId]);

  useEffect(() => {
    if (!remoteState || !activeMission) return;
    const completed = remoteState.status === "completed";
    const shouldRetune = completed || remoteState.status === "failed" || Boolean(remoteState.potential_struggle);
    if (!shouldRetune) return;
    applyBuildSessionEvidence(remoteState);
    const retuneKey = `${remoteState.session_id}:${remoteState.status}:${remoteState.attempts}:${remoteState.test_score?.passed ?? 0}:${remoteState.potential_struggle ? "struggle" : "normal"}`;
    if (retuneKeyRef.current === retuneKey) return;
    retuneKeyRef.current = retuneKey;
    const current = getLoopState();
    if (!current.profile || !current.plan) return;
    void aiRetunePlan({ data: { profile: current.profile, plan: current.plan, activity: current.activity } }).then((suggested) => {
      applySarvamDashboardPlan(suggested);
      logActivity({ kind: "ai", text: completed ? "Vibe retuned your path after a proven challenge." : "Vibe retuned your path around the weak point." });
    }).catch(() => {
      // Deterministic recovery/practice changes remain active when Sarvam is unavailable.
    });
  }, [activeMission, remoteState]);

  const elapsed = Math.max(1, Math.round((startRef.current - seconds) / 60));
  const pct = startRef.current ? Math.min(100, ((startRef.current - seconds) / startRef.current) * 100) : 0;
  const total = state.sessions.reduce((sum, item) => sum + item.minutes, 0);
  const currentTasks = sessionPlan?.tasks ?? [{ title: "Read the mission brief", minutes: 5 }, { title: "Implement the next piece", minutes: 25 }, { title: "Run and verify your work", minutes: 10 }, { title: "Write down what changed", minutes: 5 }];
  const currentHistory = state.sessions.filter((item) => item.missionTitle === activeMission?.title);
  const extensionStatus = remoteState?.extension_status ?? vscodeSession?.status ?? "waiting";
  const extensionConnected = extensionStatus === "active" || extensionStatus === "connected";
  const sessionLabel = extensionStatus === "completed" ? "Challenge completed" : extensionStatus === "failed" ? "Recovery mode" : extensionStatus === "disconnected" ? "VS Code disconnected" : extensionConnected ? "VS Code connected" : "Waiting for VS Code";
  const score = remoteState?.test_score ? `${remoteState.test_score.passed}/${remoteState.test_score.total}` : "Not run";

  async function createVscodeSession() {
    if (!activeMission) throw new Error("No active mission is selected.");
    const auth = await getAuthSessionForApi();
    const userId = auth?.uid || "local-user";
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (auth?.idToken) headers.Authorization = `Bearer ${auth.idToken}`;
    const response = await fetch("/api/sessions/start", {
      method: "POST",
      headers,
      body: JSON.stringify({ challenge_id: activeMission.id, user_id: userId, title: activeMission.title, language: activeMission.stack, concept: activeMission.skills[0] ?? "problem solving", instructions: activeMission.description + "\n\nRequirements:\n" + activeMission.steps.map((step, index) => `Step ${index + 1}: ${step.title} — ${step.detail}`).join("\n"), checkpoints: activeMission.steps.map((step, index) => ({ index, title: step.title, detail: step.detail })), expected_skills: activeMission.skills, test_command: activeMission.id === "cli-calculator" ? "gcc -std=c11 -Wall -Wextra -o /tmp/buildmylogic-cli-calculator main.c" : undefined }),
    });
    const result = (await response.json()) as { ok?: boolean; session_id?: string; state?: RemoteSessionState; error?: string };
    if (!response.ok || !result.ok || !result.session_id) throw new Error(result.error || "Could not create the BuildMyLogic VS Code session.");
    const session = { sessionId: result.session_id, status: "waiting" };
    setVscodeSession(session);
    setRemoteState(result.state ?? null);
    window.localStorage.setItem("bml-vscode-session", JSON.stringify(session));
    return { ...session, userId };
  }

  async function connectExtension(session: { sessionId: string }) {
    const uri = `vscode://buildmylogic.logic-analyser/connect?sessionId=${encodeURIComponent(session.sessionId)}&apiBaseUrl=${encodeURIComponent(window.location.origin)}`;
    const anchor = document.createElement("a");
    anchor.href = uri;
    anchor.rel = "noopener";
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }

  async function openVsCode(session?: { sessionId: string }) {
    let path = workspacePath.trim();
    if (!path) {
      path = await pickProjectFolder();
      if (!path) {
      const anchor = document.createElement("a");
      anchor.href = "vscode://";
      anchor.click();
      if (session) await connectExtension(session);
      return;
      }
    }
    try {
      const response = await fetch(`${BRIDGE_URL}/${session ? "open-vscode-session" : "open-vscode"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(session ? { path, session_id: session.sessionId, api_base_url: window.location.origin } : { path }),
        signal: AbortSignal.timeout(1200),
      }).catch(() => null);

      if (response && response.ok) {
        return;
      }
      // Fallback: use native VS Code URI protocol handler
      const formattedPath = path.startsWith("/") ? path : `/${path}`;
      const anchor = document.createElement("a");
      anchor.href = `vscode://file${encodeURI(formattedPath)}`;
      anchor.click();
      if (session) await connectExtension(session);
    } catch {
      const formattedPath = path.startsWith("/") ? path : `/${path}`;
      const anchor = document.createElement("a");
      anchor.href = `vscode://file${encodeURI(formattedPath)}`;
      anchor.click();
      if (session) await connectExtension(session);
    }
  }

  async function pickProjectFolder() {
    setPickingProject(true);
    setPickerError("");
    try {
      // 1. Try desktop bridge helper if available
      try {
        const health = await fetch(`${BRIDGE_URL}/health`, {
          cache: "no-store",
          signal: AbortSignal.timeout(800),
        }).catch(() => null);

        if (health && health.ok) {
          const response = await fetch(`${BRIDGE_URL}/pick-folder`, { method: "POST" });
          const result = (await response.json()) as { ok?: boolean; path?: string; error?: string };
          if (response.ok && result.ok && result.path) {
            const path = result.path.trim().replace(/[\\/]+$/, "");
            const folder = path.split(/[\\/]/).filter(Boolean).pop() || path;
            setWorkspacePath(path);
            setProjectFolder(folder);
            setProjectFileCount(0);
            window.localStorage.setItem("loop-vscode-path", path);
            window.localStorage.setItem("loop-project-folder", folder);
            return path;
          }
        }
      } catch {
        // Desktop bridge unavailable; proceed to browser folder picker
      }

      // 2. Browser native file/directory picker fallback
      folderInputRef.current?.click();
      return "";
    } catch {
      folderInputRef.current?.click();
      return "";
    } finally {
      setPickingProject(false);
    }
  }

  function saveWorkspace(value: string) {
    setWorkspacePath(value);
    window.localStorage.setItem("loop-vscode-path", value.trim());
  }

  function selectProjectFolder(files: FileList | null) {
    if (!files?.length) return;
    const first = files[0];
    if (!first) return;
    const relative = (first as File & { webkitRelativePath?: string }).webkitRelativePath ?? first.name;
    const folder = relative.split("/")[0] || first.name;
    setProjectFolder(folder);
    setProjectFileCount(files.length);
    window.localStorage.setItem("loop-project-folder", folder);
  }

  async function startSession(forceNew = false) {
    if (running && !forceNew) {
      setRunning(false);
      window.localStorage.removeItem("loop-session-started-at");
      window.localStorage.removeItem("loop-session-duration");
      return;
    }
    try {
      const connected = forceNew ? await createVscodeSession() : vscodeSession ?? await createVscodeSession();
      const startedAt = Date.now();
      if (forceNew) setSeconds(startRef.current);
      window.localStorage.setItem("loop-session-started-at", String(startedAt));
      window.localStorage.setItem("loop-session-duration", String(seconds));
      setRunning(true);
      if (!vscodeSession) {
        await openVsCode(connected);
      }
    } catch (error) {
      setPickerError(error instanceof Error ? error.message : "Could not start the BuildMyLogic session.");
      setRunning(false);
    }
  }

  async function openAndConnectVsCode() {
    try {
      const connected = vscodeSession ?? await createVscodeSession();
      if (!workspacePath.trim()) {
        const selected = await pickProjectFolder();
        if (!selected) return;
      }
      await openVsCode(connected);
    } catch (error) {
      setPickerError(error instanceof Error ? error.message : "Could not connect VS Code.");
    }
  }

  async function finish() {
    if (saving || !activeMission) return;
    setSaving(true);
    setRunning(false);
    try {
      const result = await aiReviewSession({ data: { missionTitle: activeMission.title, note, minutes: elapsed } });
      setReview(result);
      setLoopState((prev) => ({ ...prev, sessions: [{ at: Date.now(), minutes: elapsed, missionTitle: activeMission.title, note, tasks: currentTasks, completedTasks: done, review: result }, ...prev.sessions].slice(0, 40) }));
      logActivity({ kind: "session", text: `Logged a ${elapsed} min session on ${activeMission.title}` });
      recordMissionEvidence(activeMission.id, 2);
      if (done.length) {
        setLoopState((prev) => ({ ...prev, missionProgress: { ...prev.missionProgress, [activeMission.id]: { ...(prev.missionProgress[activeMission.id] ?? { status: "active", completedSteps: [] }), completedSteps: Array.from(new Set([...(prev.missionProgress[activeMission.id]?.completedSteps ?? []), ...done])) } } }));
      }
      setNote("");
      window.localStorage.removeItem("loop-session-started-at");
      window.localStorage.removeItem("loop-session-duration");
    } catch (error) {
      setReview({ feedback: error instanceof Error ? error.message : "Could not review this session.", nextStep: "Try logging the session again.", skillBoost: "—" });
    } finally {
      setSaving(false);
    }
  }

  function completeMission() {
    if (!activeMission) return;
    const index = missions.findIndex((m) => m.id === activeMission.id);
    const next = missions[index + 1];
    window.localStorage.removeItem("loop-session-started-at");
    window.localStorage.removeItem("loop-session-duration");
    setLoopState((prev) => ({
      ...prev,
      missionProgress: {
        ...prev.missionProgress,
        [activeMission.id]: { ...(prev.missionProgress[activeMission.id] ?? { status: "active", completedSteps: [] }), status: "done", completedSteps: Array.from({ length: activeMission.steps.length }, (_, i) => i) },
        ...(next ? { [next.id]: { ...(prev.missionProgress[next.id] ?? { status: "locked", completedSteps: [] }), status: "active" } } : {}),
      },
    }));
    recordMissionEvidence(activeMission.id, 5);
    logActivity({ kind: "mission", text: `Completed mission “${activeMission.title}”` });
  }

  async function reviewZip(file: File | undefined) {
    if (!file || zipBusy) return;
    if (!file.name.toLowerCase().endsWith(".zip")) { setReview({ feedback: "Please choose a .zip project archive.", nextStep: "Zip the completed project source and upload it again.", skillBoost: "Project hygiene" }); return; }
    if (file.size > 8 * 1024 * 1024) { setReview({ feedback: "That ZIP is over the 8 MB upload limit.", nextStep: "Remove node_modules, dist and build folders, then upload the source ZIP.", skillBoost: "Project hygiene" }); return; }
    setZipBusy(true); setZipName(file.name);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = "";
      for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      const result = await aiReviewProjectZip({ data: activeMission?.title ? { fileName: file.name, dataBase64: btoa(binary), missionTitle: activeMission.title } : { fileName: file.name, dataBase64: btoa(binary) } });
      setProjectReview(result);
      logActivity({ kind: "ai", text: `AI reviewed ${file.name}` });
    } catch (error) {
      setReview({ feedback: error instanceof Error ? error.message : "Could not review the project ZIP.", nextStep: "Check the archive and try again.", skillBoost: "—" });
    } finally { setZipBusy(false); }
  }

  return <AppShell crumb="Sessions" title="Your Learning Sessions" subtitle="Stay consistent. Build a better you, one session at a time." quote="Small sessions, big progress." wide>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex gap-2"><button className="btn-base btn-ink">All Sessions</button><button className="btn-base btn-outline">Current</button><button className="btn-base btn-outline">Upcoming</button><button className="btn-base btn-outline">Past</button></div>
      <button type="button" onClick={() => { void startSession(true); }} className="btn-base btn-ink"><span className="text-lg leading-none">+</span> Start a New Session</button>
    </div>

    <ExtensionInstallBanner />
    {remoteState?.project_review && <SessionProjectReview review={remoteState.project_review} />}
    <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="space-y-5">
        <section className="card-surface p-5">
          <div className="flex items-center justify-between"><div><p className="text-[11px] font-black uppercase tracking-wider text-primary">Current session</p><h2 className="mt-1 text-xl font-black">{activeMission?.title ?? "Your build"}</h2></div><span className="pill bg-primary-soft text-black">{running ? "✦ Live Now" : seconds < startRef.current ? "Ⅱ Paused" : "○ Ready"}</span></div>
          <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_220px]">
            <div className="flex gap-4"><div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-black text-white"><Code2 className="h-7 w-7" /></div><div className="min-w-0 flex-1"><p className="text-sm font-black">{activeMission?.stack ?? "Build"} <span className="mx-1">•</span> Difficulty {activeMission?.difficulty ?? 1}</p><p className="mt-2 text-sm font-semibold">{activeMission?.description ?? "Build something useful and prove what you learned."}</p><div className="mt-4 h-2.5 rounded-full bg-black/10"><div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} /></div><div className="mt-2 flex justify-between text-xs font-black"><span>{elapsed} min elapsed</span><span>{Math.max(0, Math.ceil(seconds / 60))} min remaining</span></div></div></div>
            <div className="border-t-2 border-black/10 pt-4 lg:border-l-2 lg:border-t-0 lg:pl-5"><p className="text-xs font-black">Tests / Tasks Passed</p><p className="display text-2xl font-black">{done.length} / {currentTasks.length}</p><p className="mt-4 text-xs font-black">Attempts</p><p className="text-xl font-black">{Math.max(1, state.sessions.length + 1)}</p><button type="button" onClick={() => { void startSession(); }} className="btn-base btn-ink mt-4 w-full">{running ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}{running ? "Pause" : "Start Session"}</button><button type="button" onClick={() => { void openAndConnectVsCode(); }} className="btn-base btn-outline mt-2 w-full"><Code2 className="h-4 w-4" />Open VS Code</button><button type="button" onClick={() => { setRunning(false); setSeconds(startRef.current); }} className="btn-base btn-outline mt-2 w-full"><RotateCcw className="h-3.5 w-3.5" />Reset</button></div>
          </div>
        </section>

        {vscodeSession && <section className="card-surface border-2 border-primary/30 bg-primary-soft/30 p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-[11px] font-black uppercase tracking-wider text-primary">BuildMyLogic ↔ VS Code</p><h2 className="mt-1 text-lg font-black">{remoteState?.title ?? activeMission?.title}</h2></div><span className={`rounded-full px-3 py-1 text-xs font-black ${extensionStatus === "completed" || extensionConnected ? "bg-emerald-100 text-emerald-800" : extensionStatus === "failed" || extensionStatus === "disconnected" ? "bg-amber-100 text-amber-800" : "bg-white text-black/60"}`}>● {sessionLabel}</span></div><div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4"><div className="rounded-xl bg-white p-3"><p className="text-[10px] font-black uppercase text-black/50">Attempts</p><p className="mt-1 text-xl font-black">{remoteState?.attempts ?? 0}</p></div><div className="rounded-xl bg-white p-3"><p className="text-[10px] font-black uppercase text-black/50">Tests</p><p className="mt-1 text-xl font-black">{score}</p></div><div className="rounded-xl bg-white p-3"><p className="text-[10px] font-black uppercase text-black/50">Hints</p><p className="mt-1 text-xl font-black">{remoteState?.hints_used ?? 0}</p></div><div className="rounded-xl bg-white p-3"><p className="text-[10px] font-black uppercase text-black/50">Learning state</p><p className="mt-1 text-sm font-black">{remoteState?.status === "completed" ? "Skill proven ✓" : remoteState?.potential_struggle ? "Needs attention" : remoteState?.status ?? "active"}</p></div></div>{remoteState?.latest_mentor_feedback && <p className="mt-4 rounded-xl bg-black px-4 py-3 text-sm font-bold text-white">Vibe: {remoteState.latest_mentor_feedback}</p>}</section>}

        <section className="card-surface p-5"><div className="flex items-center justify-between"><div><h2 className="text-lg font-black">Session Tasks</h2><p className="mt-1 text-sm font-semibold">Work through these in order. BuildMyLogic records exactly what you finished.</p></div><span className="text-xs font-black">{done.length}/{currentTasks.length}</span></div><div className="mt-4 space-y-2">{currentTasks.map((task, index) => { const checked = done.includes(index); return <button type="button" key={`${task.title}-${index}`} onClick={() => setDone((prev) => checked ? prev.filter((x) => x !== index) : [...prev, index])} className={`flex w-full items-center gap-3 rounded-xl border p-4 text-left ${checked ? "border-primary bg-primary-soft" : "border-black/10 bg-white"}`}><span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border-2 ${checked ? "border-primary bg-primary text-white" : "border-black/20"}`}>{checked && <Check className="h-4 w-4" />}</span><span className="min-w-0 flex-1"><b className="block text-sm">{task.title}</b><span className="mt-1 block text-xs font-semibold">{task.minutes} minutes</span></span></button>; })}</div></section>

        <section className="card-surface p-5"><div className="flex items-center justify-between"><h2 className="text-lg font-black">Upcoming Sessions</h2><span className="text-xs font-black">View All →</span></div><div className="mt-3 divide-y divide-black/10">{missions.slice(1, 3).map((mission) => <div key={mission.id} className="flex items-center gap-4 py-4"><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-black text-white"><Timer className="h-5 w-5" /></div><div className="min-w-0 flex-1"><p className="text-sm font-black">{mission.title}</p><p className="mt-1 text-xs font-semibold">{mission.stack} · Difficulty {mission.difficulty} · Tomorrow, {state.profile?.startTime ?? "19:00"}</p><p className="mt-1 text-xs font-semibold">{mission.description}</p></div><button type="button" onClick={() => { setRunning(true); window.localStorage.setItem("loop-auto-start-session", "1"); openVsCode(); }} className="btn-base btn-outline hidden md:inline-flex">Start Session</button></div>)}</div></section>

        <section><div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-black">Past Sessions</h2><span className="text-xs font-black">{total} min total</span></div><div className="card-surface overflow-hidden">{state.sessions.length === 0 ? <p className="p-6 text-center text-sm font-bold">No past sessions yet. Your first completed session will appear here.</p> : state.sessions.slice(0, 8).map((item) => { const open = selectedHistory === item.at; return <div key={item.at} className="border-b border-black/10 last:border-0"><button type="button" onClick={() => setSelectedHistory(open ? null : item.at)} className="grid w-full grid-cols-[1fr_1.6fr_.7fr_.8fr_28px] items-center gap-3 px-4 py-4 text-left hover:bg-primary-soft/40"><span className="text-xs font-black">{new Date(item.at).toLocaleDateString()}</span><span className="truncate text-xs font-black">{item.missionTitle}</span><span className="text-xs font-black">{item.minutes} min</span><span className="flex items-center gap-1 text-xs font-black"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-700" />Completed</span><ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} /></button>{open && <div className="bg-black p-5 text-white"><p className="text-[11px] font-black uppercase tracking-wider text-white">Session history</p><p className="mt-2 text-sm font-black">{item.note || "No note added."}</p>{item.completedTasks?.length ? <p className="mt-3 text-xs font-bold">Tasks completed: {item.completedTasks.length}/{item.tasks?.length ?? 0}</p> : null}{item.review && <div className="mt-4 grid gap-3 md:grid-cols-3"><div><p className="text-[10px] font-black uppercase">What BuildMyLogic saw</p><p className="mt-1 text-xs font-bold">{item.review.feedback}</p></div><div><p className="text-[10px] font-black uppercase">Next</p><p className="mt-1 text-xs font-bold">{item.review.nextStep}</p></div><div><p className="text-[10px] font-black uppercase">Skill</p><p className="mt-1 text-xs font-bold">{item.review.skillBoost}</p></div></div>}</div>}</div>; })}</div></section>

        <section className="card-surface p-5"><div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-black">Submit completed project</h2><p className="mt-1 text-sm font-semibold">Select your real project folder on this computer, or upload a ZIP for AI review.</p></div><ShieldCheck className="h-5 w-5 text-primary" /></div><div className="mt-4 grid gap-3 md:grid-cols-2"><button type="button" onClick={() => { void pickProjectFolder(); }} disabled={pickingProject} className="flex min-h-24 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-primary/40 bg-primary-soft/40 px-4 py-5 text-sm font-black text-black hover:bg-primary-soft disabled:cursor-wait disabled:opacity-60"><FolderOpen className="h-5 w-5" />{pickingProject ? "Opening folder picker…" : projectFolder ? `Project: ${projectFolder}` : "Select your project folder"}</button><input ref={folderInputRef} type="file" multiple className="hidden" onChange={(e) => selectProjectFolder(e.target.files)} /><label className="flex min-h-24 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-black/15 bg-white px-4 py-5 text-sm font-black text-black hover:bg-black/[0.02]"><Upload className="h-4 w-4" />{zipBusy ? "Analyzing ZIP…" : zipName ? `Review ${zipName}` : "Upload project ZIP for AI review"}<input type="file" accept=".zip,application/zip" className="hidden" disabled={zipBusy} onChange={(e) => { void reviewZip(e.target.files?.[0]); e.currentTarget.value = ""; }} /></label></div>{projectFolder && <div className="mt-3 rounded-xl border border-black/10 bg-white px-4 py-3"><p className="text-[10px] font-black uppercase tracking-wider text-black/50">Selected project</p><div className="mt-1 flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-black">{projectFolder}</p>{projectFileCount > 0 && <span className="text-xs font-bold text-black/60">{projectFileCount} files selected</span>}</div><p className="mt-2 break-all text-[10px] font-bold text-black/45">{workspacePath}</p></div>}{pickerError && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-bold text-red-700">{pickerError}</p>}<p className="mt-3 text-xs font-bold text-black/55">BuildMyLogic's local bridge reads the exact folder path on your computer, so VS Code can open that workspace directly.</p></section>

        {projectReview && <ProjectReviewCard review={projectReview} onClose={() => setProjectReview(null)} />}
        {review && <section className="rounded-2xl border-2 border-primary bg-primary-soft p-5"><div className="flex items-center justify-between"><h2 className="flex items-center gap-2 text-base font-black"><Sparkles className="h-4 w-4 text-primary" /> Session review</h2><button type="button" onClick={() => setReview(null)}><XCircle className="h-4 w-4" /></button></div><p className="mt-3 text-sm font-black">{review.feedback}</p><div className="mt-4 grid gap-3 md:grid-cols-2"><div className="rounded-xl bg-white p-4"><p className="text-[10px] font-black uppercase">Next action</p><p className="mt-1 text-sm font-black">{review.nextStep}</p></div><div className="rounded-xl bg-white p-4"><p className="text-[10px] font-black uppercase">Skill evidence</p><p className="mt-1 text-sm font-black">{review.skillBoost}</p></div></div></section>}

        <section className="card-surface p-5"><h2 className="text-lg font-black">Close the session</h2><p className="mt-1 text-sm font-semibold">Write what you actually built. BuildMyLogic keeps this as your learning history.</p><textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="I wired the form to the API but validation is still broken…" className="mt-3 w-full rounded-xl border border-black/15 bg-white p-3 text-sm font-semibold outline-none focus:border-primary" /><div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={finish} disabled={saving || !activeMission} className="btn-base btn-primary-solid"><Timer className="h-4 w-4" />{saving ? "Reviewing…" : `Log ${elapsed} min & get feedback`}</button><button type="button" onClick={completeMission} disabled={!activeMission} className="btn-base btn-outline"><Check className="h-4 w-4" />Complete mission</button></div></section>
      </div>

      <aside className="space-y-5">
        <section className="card-surface p-5"><div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-soft text-primary"><Flame className="h-6 w-6" /></span><div><p className="text-sm font-black">Session Streak</p><p className="display text-2xl font-black">{streak(state.sessions)} days</p></div></div><p className="mt-2 text-xs font-semibold">Consistency compounds.</p></section>
        <section className="card-surface p-5"><div className="flex items-center justify-between"><h2 className="text-sm font-black">{new Date().toLocaleDateString(undefined, { month: "long", year: "numeric" })}</h2><CalendarDays className="h-4 w-4" /></div><MiniCalendar sessions={state.sessions} progress={pct} running={running} /></section>
        <section className="card-surface border-2 border-black/10 p-5"><div className="flex items-center justify-between gap-3"><h2 className="text-sm font-black">Session ID</h2><span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-black ${vscodeSession?.status === "active" || vscodeSession?.status === "connected" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}><span className={`h-2 w-2 rounded-full ${vscodeSession?.status === "active" || vscodeSession?.status === "connected" ? "bg-emerald-500" : "bg-red-500"}`} />{vscodeSession?.status === "active" || vscodeSession?.status === "connected" ? "Connected" : "Not connected"}</span></div>{vscodeSession ? <><button type="button" title="Click to copy session ID" aria-label="Copy session ID" onClick={() => void navigator.clipboard.writeText(vscodeSession.sessionId)} className="mt-3 flex min-h-16 w-full items-center justify-center rounded-xl bg-black px-3 py-3 text-center text-2xl font-black tracking-[0.08em] text-white shadow-sm transition hover:bg-primary hover:text-black">{vscodeSession.sessionId}</button><p className="mt-2 text-center text-[10px] font-black uppercase tracking-wider text-black/60">Click the ID to copy</p></> : <p className="mt-3 rounded-xl bg-black/[0.04] px-3 py-4 text-center text-xs font-semibold text-black/55">Start a session to generate an ID.</p>}</section>
        <section className="card-surface p-5"><h2 className="text-sm font-black">Session Insights</h2><div className="mt-3 rounded-xl bg-primary-soft p-4"><p className="text-sm font-black">{state.sessions.length ? "You are building a real history." : "Your first session starts the history."}</p><p className="mt-2 text-xs font-semibold">Average logged time: {state.sessions.length ? Math.round(total / state.sessions.length) : 0} minutes.</p></div></section>
        <section className="card-surface p-5"><div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /><h2 className="text-sm font-black">Tips from Vibe</h2></div><p className="mt-3 text-sm font-semibold">“Consistency beats intensity. Even a small session can move a skill forward.”</p><p className="mt-2 text-xs font-black">— Vibe</p></section>
        <section className="card-surface p-5"><h2 className="text-sm font-black">Code with VS Code</h2><p className="mt-1 text-sm font-semibold">BuildMyLogic opens the selected project and connects the existing extension to this same Session ID.</p>{vscodeSession && <div className="mt-3 rounded-xl border border-primary/30 bg-primary-soft p-3"><p className="text-[10px] font-black uppercase tracking-wider">Build session</p><p className="mt-2 flex items-center gap-1.5 text-[10px] font-bold"><span className={`h-2 w-2 rounded-full ${vscodeSession.status === "active" || vscodeSession.status === "connected" ? "bg-emerald-500" : "bg-red-500"}`} />{vscodeSession.status === "active" || vscodeSession.status === "connected" ? "VS Code connected." : "Paste this Session ID into the extension."}</p></div>}<button type="button" onClick={() => { void pickProjectFolder(); }} disabled={pickingProject} className="btn-base btn-outline mt-3 w-full disabled:cursor-wait disabled:opacity-60"><FolderOpen className="h-4 w-4" />{pickingProject ? "Selecting…" : workspacePath ? "Change project folder" : "Select project folder"}</button><div className="mt-3 rounded-xl border border-black/10 bg-black/[0.02] px-3 py-2.5"><p className="text-[10px] font-black uppercase tracking-wider text-black/45">Workspace</p><p className="mt-1 break-all text-xs font-bold">{workspacePath || "No project selected"}</p></div><p className="mt-2 text-[10px] font-bold">The extension uses only the BuildMyLogic Session ID to join the same challenge.</p></section>
      </aside>
    </div>
  </AppShell>;
}

function streak(sessions: { at: number }[]) { const days = new Set(sessions.map((s) => new Date(s.at).toDateString())); let cursor = new Date(); let count = 0; while (days.has(cursor.toDateString())) { count += 1; cursor.setDate(cursor.getDate() - 1); } return count; }
function MiniCalendar({ sessions, progress, running }: { sessions: { at: number }[]; progress: number; running: boolean }) { const now = new Date(); const today = now.toDateString(); const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate(); const leading = new Date(now.getFullYear(), now.getMonth(), 1).getDay(); const active = new Set(sessions.map((s) => new Date(s.at).toDateString())); return <><div className="mt-3 flex items-center justify-between rounded-xl bg-primary-soft px-3 py-2"><div><p className="text-[10px] font-black uppercase tracking-wider">Today</p><p className="mt-0.5 text-xs font-black">{now.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}</p></div><p className="text-xs font-black">{Math.round(progress)}% {running ? "in progress" : "complete"}</p></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-black/10"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} /></div><div className="mt-4 grid grid-cols-7 gap-y-3 text-center text-[10px] font-black">{["S", "M", "T", "W", "T", "F", "S"].map((x, i) => <span key={`${x}-${i}`}>{x}</span>)}{Array.from({ length: leading + days }, (_, i) => { const day = i - leading + 1; if (day < 1) return <span key={i} />; const d = new Date(now.getFullYear(), now.getMonth(), day); const date = d.toDateString(); const on = active.has(date); const isToday = date === today; return <span key={i} className={`mx-auto flex h-6 w-6 items-center justify-center rounded-full ${on ? "bg-primary text-white" : isToday ? "border-2 border-primary text-primary" : ""}`}>{day}</span>; })}</div><div className="mt-4 text-[10px] font-black">● Session completed &nbsp; ◉ Today &nbsp; ○ No session</div></>; }

function ProjectReviewCard({ review, onClose }: { review: ProjectReview; onClose: () => void }) { const groups: [string, string[]][] = [["Strengths", review.strengths], ["Issues", review.issues], ["Security", review.security], ["Missing", review.missing], ["Next steps", review.nextSteps]]; return <section className="card-surface overflow-hidden"><div className="bg-black px-5 py-4 text-white"><div className="flex items-center justify-between"><h2 className="flex items-center gap-2 text-base font-black"><ShieldCheck className="h-4 w-4" /> Project Review</h2><div className="flex items-center gap-2"><span className="rounded-full bg-white px-3 py-1 text-xs font-black text-black">{review.score}/100</span><button type="button" onClick={onClose}><X className="h-4 w-4" /></button></div></div><p className="mt-3 text-sm font-black">{review.verdict}</p></div><div className="grid gap-5 p-5 md:grid-cols-2">{groups.map(([title, items]) => <div key={title} className="rounded-xl border border-black/10 bg-white p-4"><h3 className="text-sm font-black">{title}</h3><ul className="mt-2 space-y-2">{items.length ? items.map((item, i) => <li key={i} className="text-sm font-bold leading-5">• {item}</li>) : <li className="text-sm font-bold">• None reported.</li>}</ul></div>)}</div></section>; }
function SessionProjectReview({ review }: { review: NonNullable<RemoteSessionState["project_review"]> }) { const groups: [string, string[]][] = [["Strengths", review.strengths], ["Issues", review.issues], ["Missing", review.missing], ["Next steps", review.nextSteps]]; return <section className="card-surface overflow-hidden border-2 border-primary/30"><div className="bg-black px-5 py-4 text-white"><div className="flex items-center justify-between gap-3"><h2 className="flex items-center gap-2 text-base font-black"><ShieldCheck className="h-4 w-4" /> BuildMyLogic project review</h2><span className="rounded-full bg-white px-3 py-1 text-xs font-black text-black">{review.score}/100</span></div><p className="mt-3 text-sm font-black">{review.verdict}</p></div><div className="grid gap-3 p-4 md:grid-cols-4">{groups.map(([title, items]) => <div key={title} className="rounded-xl border border-black/10 bg-white p-3"><h3 className="text-xs font-black">{title}</h3><p className="mt-2 text-xs font-bold leading-5">{items[0] ?? "None reported."}</p></div>)}</div></section>; }
function ExtensionInstallBanner() { return <section className="card-surface flex flex-wrap items-center justify-between gap-4 border-2 border-primary/30 bg-primary-soft/40 p-4"><div><p className="text-[10px] font-black uppercase tracking-wider text-primary">VS Code connection</p><h2 className="mt-1 text-base font-black">Are you using the BuildMyLogic extension?</h2><p className="mt-1 text-xs font-semibold">Install it once to run checkpoints locally, submit your whole project, and receive Vibe's review here.</p></div><a href="/extension.html" className="btn-base btn-ink whitespace-nowrap">Install the extension →</a></section>; }
