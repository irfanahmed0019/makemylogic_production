/**
 * BuildMyLogic — Reactive Learner State Store
 * 
 * Provides a lightweight, external store synchronized across React components
 * via `useSyncExternalStore`. Integrates seamlessly with localStorage caching
 * and asynchronous Supabase cloud persistence.
 */

import { useSyncExternalStore } from "react";
import { emptyState, type ActivityItem, type BuildSessionState, type LearningChat, type LoopState, type MissionProgress, type Plan } from "./loop-types";

const KEY = "loop.state.v1";

let state: LoopState = emptyState;
let loaded = false;
const listeners = new Set<() => void>();

function isLegacyStarterState(candidate: Partial<LoopState>): boolean {
  // Remove only the old, shipped demo state. Real learner plans are preserved.
  return candidate.onboarded === true &&
    candidate.plan?.projectTitle === "CLI Arithmetic & Logic Engine" &&
    candidate.profile?.projectIdea === "CLI Arithmetic Calculator in C" &&
    candidate.plan?.missions?.[0]?.id === "cli-calculator";
}

/**
 * Converts persisted data from older app versions into the current safe shape.
 * This is intentionally shared with cloud hydration: otherwise an old demo
 * record in Supabase could put the C calculator back after local cleanup.
 */
export function normalizeLoopState(candidate: Partial<LoopState> | null | undefined): LoopState {
  if (!candidate || isLegacyStarterState(candidate)) return emptyState;

  return {
    ...emptyState,
    ...candidate,
    onboarded: candidate.onboarded ?? false,
    profile: candidate.profile ?? emptyState.profile,
    plan: candidate.plan ?? emptyState.plan,
    missionProgress: Object.keys(candidate.missionProgress ?? {}).length > 0
      ? candidate.missionProgress!
      : emptyState.missionProgress,
    learningChats: candidate.learningChats ?? {},
    selectedLearningMissionId: candidate.selectedLearningMissionId ?? emptyState.selectedLearningMissionId,
    skillMemory: candidate.skillMemory ?? {},
  };
}

/**
 * Hydrates learner state from local cache on client startup
 */
function load(): LoopState {
  if (typeof window === "undefined") return emptyState;
  if (loaded) return state;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<LoopState>;
      state = normalizeLoopState(parsed);
    } else {
      state = emptyState;
    }
  } catch {
    state = emptyState;
  }
  return state;
}

/**
 * Synchronizes in-memory state to localStorage and notifies React subscribers
 */
function persist() {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage full or unavailable */
  }
  listeners.forEach((l) => l());
}

/**
 * Synchronously retrieves current snapshot of the learner state
 */
export function getLoopState(): LoopState {
  return load();
}

/**
 * Updates learner state with functional transformer and triggers persistence
 */
export function setLoopState(update: (prev: LoopState) => LoopState) {
  state = update(load());
  persist();
}

/**
 * Resets state to clean slate (e.g., on sign-out)
 */
export function resetLoop() {
  state = emptyState;
  persist();
}

/**
 * Appends a timestamped telemetry or milestone event to the activity log
 */
export function logActivity(item: Omit<ActivityItem, "at">) {
  setLoopState((prev) => ({
    ...prev,
    activity: [{ ...item, at: Date.now() }, ...prev.activity].slice(0, 40),
  }));
}

/**
 * Records evidence for a specific programming concept or skill
 * Evidence is weighted depending on source (test pass, checkpoint solve, scaffold)
 */
export function recordSkillEvidence(
  skillName: string,
  description: string,
  weight = 5,
  source: "code_test" | "checkpoint_answer" | "scaffold_completed" | "independent_solution" = "checkpoint_answer"
) {
  setLoopState((prev) => {
    const key = skillName.toLowerCase().trim();
    const existing = prev.skillMemory?.[key] ?? { level: 0, evidence: [] };
    const newLevel = Math.min(100, existing.level + weight);
    const newEvidence = [{ description, at: Date.now(), weight, source }, ...existing.evidence].slice(0, 50);
    const updatedSkillMemory = {
      ...(prev.skillMemory ?? {}),
      [key]: { level: newLevel, evidence: newEvidence, lastPracticedAt: Date.now() },
    };
    return { ...prev, skillMemory: updatedSkillMemory };
  });
}

/**
 * Advances overall mission-level skill competency when milestones are achieved
 */
export function recordMissionEvidence(missionId: string, amount = 2) {
  setLoopState((prev) => {
    if (!prev.plan) return prev;
    const mission = prev.plan.missions.find((item) => item.id === missionId);
    if (!mission) return prev;
    const missionSkills = mission.skills.map((skill) => skill.toLowerCase());
    const skills = prev.plan.skills.map((skill) => {
      const name = skill.name.toLowerCase();
      const matches = missionSkills.some((missionSkill) => name.includes(missionSkill) || missionSkill.includes(name));
      return matches ? { ...skill, level: Math.min(100, skill.level + amount) } : skill;
    });
    return { ...prev, plan: { ...prev.plan, skills } };
  });
}

/** Applies objective VS Code evidence to the learner dashboard immediately. */
export function applyBuildSessionEvidence(remote: BuildSessionState) {
  setLoopState((prev) => {
    if (!prev.plan) return prev;
    const mission = prev.plan.missions.find((item) => item.id === remote.challenge_id) ?? prev.plan.missions.find((item) => prev.missionProgress[item.id]?.status === "active") ?? prev.plan.missions[0];
    if (!mission) return prev;
    const score = remote.test_score;
    const completed = remote.status === "completed" || Boolean(score && score.total > 0 && score.passed >= score.total);
    const struggling = !completed && Boolean(remote.potential_struggle);
    const failed = remote.status === "failed";
    if (!completed && !struggling && !failed) return prev;
    const signature = `build-session:${remote.session_id}:${remote.status}:${remote.attempts}:${score?.passed ?? 0}:${remote.hints_used}`;
    if (prev.activity.some((item) => item.text.includes(signature))) return prev;

    const missionProgress = { ...prev.missionProgress };
    const skills = prev.plan.skills.map((skill) => {
      const matches = mission.skills.some((name) => skill.name.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(skill.name.toLowerCase()));
      if (!matches) return skill;
      const delta = completed ? 10 : failed ? -4 : -2;
      return { ...skill, level: Math.max(0, Math.min(100, skill.level + delta)), note: completed ? "Proven through a passing VS Code challenge." : "Needs a smaller follow-up before returning to the full challenge." };
    });

    let missions = [...prev.plan.missions];
    if (completed) {
      missionProgress[mission.id] = { ...(missionProgress[mission.id] ?? { status: "active", completedSteps: [] }), status: "done", completedSteps: Array.from({ length: mission.steps.length }, (_, index) => index) };
      const next = missions.find((item) => item.id !== mission.id && missionProgress[item.id]?.status !== "done");
      if (next && (!missionProgress[next.id] || missionProgress[next.id]?.status === "locked")) missionProgress[next.id] = { ...(missionProgress[next.id] ?? { status: "locked", completedSteps: [] }), status: "active" };
    } else {
      missionProgress[mission.id] = { ...(missionProgress[mission.id] ?? { status: "active", completedSteps: [] }), status: "active" };
      const followUpId = `${mission.id}-${failed ? "recovery" : "practice"}`;
      const followUp: typeof mission = {
        ...mission,
        id: followUpId,
        title: failed ? `Recovery: ${mission.title}` : `Targeted practice: ${mission.title}`,
        difficulty: Math.max(0, mission.difficulty - 1),
        description: failed
          ? `Vibe found a missing foundation in ${mission.title}. Complete this smaller task before retrying the full challenge.`
          : `Vibe detected repeated difficulty in ${mission.title}. Practice the weak point with one smaller, focused build.`,
        steps: [
          { title: "Name the failing case", detail: remote.latest_mentor_feedback || "Explain what should happen in the edge case." },
          { title: "Build the smallest check", detail: remote.recovery || "Write one condition or test that handles the failing case." },
        ],
        deliverable: "A small passing recovery exercise that proves the weak concept.",
        prerequisites: [],
        next_mission: mission.id,
      };
      missions = [followUp, ...missions.filter((item) => item.id !== followUpId)];
      missionProgress[followUpId] = { ...(missionProgress[followUpId] ?? { status: "locked", completedSteps: [] }), status: "active" };
    }

    const insight = completed
      ? `Challenge proven in VS Code. Vibe is moving you to the next level after ${remote.attempts} attempt${remote.attempts === 1 ? "" : "s"}.`
      : `${failed ? "Recovery mode" : "Needs attention"}: Vibe created a smaller follow-up for ${mission.title}.`;
    const activityText = `${signature} ${insight}`;
    return {
      ...prev,
      plan: { ...prev.plan, missions, skills, headline: completed ? "You proved the skill. Now build the next layer." : "Your path has been adjusted around the exact point that needs practice.", progress: { ...prev.plan.progress, insights: [insight, ...prev.plan.progress.insights].slice(0, 6) } },
      missionProgress,
      activity: [{ at: Date.now(), kind: completed ? "skill" : "ai", text: activityText }, ...prev.activity].slice(0, 40),
    };
  });
}

/** Merges Sarvam's retuning without losing local mission IDs or recovery tasks. */
export function applySarvamDashboardPlan(suggested: Plan) {
  setLoopState((prev) => {
    if (!prev.plan) return prev;
    const baseMissions = prev.plan.missions.filter((mission) => !/-recovery$|-practice$/.test(mission.id));
    const missions = prev.plan.missions.map((mission) => {
      const index = baseMissions.findIndex((item) => item.id === mission.id);
      const proposal = index >= 0 ? (suggested.missions.find((item) => item.id === mission.id) ?? suggested.missions[index]) : undefined;
      return proposal ? { ...mission, ...proposal, id: mission.id } : mission;
    });
    const skills = prev.plan.skills.map((skill, index) => {
      const proposal = suggested.skills.find((item) => item.name.toLowerCase() === skill.name.toLowerCase()) ?? suggested.skills[index];
      return proposal ? { ...skill, level: Math.max(0, Math.min(100, proposal.level)), note: proposal.note || skill.note } : skill;
    });
    return { ...prev, plan: { ...prev.plan, headline: suggested.headline || prev.plan.headline, profileSummary: suggested.profileSummary || prev.plan.profileSummary, quote: suggested.quote || prev.plan.quote, skills, missions, session: suggested.session, progress: suggested.progress } };
  });
}

/**
 * Patches progress for a specific mission (status, completed checkpoints)
 */
export function setMissionProgress(id: string, patch: Partial<MissionProgress>) {
  setLoopState((prev) => {
    const current: MissionProgress = prev.missionProgress[id] ?? { status: "active", completedSteps: [] };
    return { ...prev, missionProgress: { ...prev.missionProgress, [id]: { ...current, ...patch } } };
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * React hook that returns live reactive state with automatic re-renders
 */
export function useLoop(): LoopState {
  return useSyncExternalStore(
    subscribe,
    () => load(),
    () => emptyState,
  );
}

/**
 * Selects an active learning mission in the Vibe chat coach
 */
export function selectLearningMission(missionId: string) {
  setLoopState((prev) => ({ ...prev, selectedLearningMissionId: missionId }));
}

/**
 * Persists an ongoing conversation thread and its micro-lesson state
 */
export function saveLearningChat(key: string, chat: LearningChat) {
  setLoopState((prev) => ({
    ...prev,
    learningChats: { ...prev.learningChats, [key]: chat },
  }));
}

/**
 * Clears conversation history for a topic while preserving learned state
 */
export function clearLearningChatMessages(key: string) {
  setLoopState((prev) => {
    const existing = prev.learningChats[key];
    if (!existing) return prev;
    return {
      ...prev,
      learningChats: { ...prev.learningChats, [key]: { ...existing, messages: [], updatedAt: Date.now() } },
    };
  });
}
