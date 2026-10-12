import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  Bug,
  CheckCircle2,
  ChevronRight,
  Code2,
  Lightbulb,
  Loader2,
  RefreshCw,
  Sparkles,
  XCircle,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { logActivity, recordSkillEvidence } from "@/lib/loop-store";
import {
  aiCheckDebugFix,
  aiGenerateDebugChallenge,
} from "@/lib/sarvam.functions";

export const Route = createFileRoute("/debug")({
  head: () => ({ meta: [{ title: "Debug — BuildMyLogic" }] }),
  component: DebugLab,
});

type Challenge = {
  title: string;
  task: string;
  buggyCode: string;
  bugCount: number;
  bugs: { kind: "syntax" | "logic"; hint: string }[];
  solution: string;
};

type Verdict = {
  solved: boolean;
  verdict: string;
  fixedBugs: string[];
  remainingIssues: string[];
};

const LANGUAGES = ["Python", "JavaScript", "C"] as const;
const DIFFICULTIES = [
  { id: "easy", label: "Easy" },
  { id: "medium", label: "Medium" },
  { id: "hard", label: "Hard" },
] as const;

const HOW_IT_WORKS = [
  {
    Icon: Bug,
    title: "AI plants bugs",
    body: "Faulty logic and syntax, on purpose.",
  },
  {
    Icon: Code2,
    title: "You fix the code",
    body: "Edit the broken program directly.",
  },
  {
    Icon: CheckCircle2,
    title: "Vibe checks it",
    body: "Strict but fair feedback.",
  },
];

function DebugLab() {
  const [language, setLanguage] =
    useState<(typeof LANGUAGES)[number]>("Python");
  const [difficulty, setDifficulty] =
    useState<(typeof DIFFICULTIES)[number]["id"]>("easy");
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [code, setCode] = useState("");
  const [hintsShown, setHintsShown] = useState(0);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [showSolution, setShowSolution] = useState(false);
  const [busy, setBusy] = useState<"generate" | "check" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    if (busy) return;
    setBusy("generate");
    setError(null);
    setVerdict(null);
    setShowSolution(false);
    setHintsShown(0);
    try {
      const result = await aiGenerateDebugChallenge({
        data: { language, difficulty },
      });
      setChallenge(result);
      setCode(result.buggyCode);
      logActivity({
        kind: "skill",
        text: `Started a ${difficulty} ${language} debug challenge: ${result.title}`,
      });
    } catch (err) {
      setChallenge(null);
      setError(
        err instanceof Error
          ? err.message
          : "Vibe could not build a debug exercise. Please try again.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function checkFix() {
    if (busy || !challenge) return;
    setBusy("check");
    setError(null);
    try {
      const result = await aiCheckDebugFix({
        data: {
          language,
          task: challenge.task,
          buggyCode: challenge.buggyCode,
          fixedCode: code,
          solution: challenge.solution,
        },
      });
      setVerdict(result);
      if (result.solved) {
        recordSkillEvidence(
          "debugging",
          `Fixed ${challenge.bugCount} planted bug${challenge.bugCount === 1 ? "" : "s"} in "${challenge.title}" (${language}, ${difficulty}).`,
          8,
          "independent_solution",
        );
        logActivity({
          kind: "skill",
          text: `Solved debug challenge "${challenge.title}" (${language}, ${difficulty}).`,
        });
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Vibe could not check your fix. Please try again.",
      );
    } finally {
      setBusy(null);
    }
  }

  function resetToBuggy() {
    if (!challenge) return;
    setCode(challenge.buggyCode);
    setVerdict(null);
    setError(null);
  }

  return (
    <AppShell
      crumb="Debug Lab"
      title="Find the bug. Fix it. Prove it."
      subtitle="Vibe writes a short program and breaks it on purpose. Your job is to find every syntax and logic error and make it work again."
      quote="Debugging is being the detective in a crime movie where you are also the murderer."
      wide
    >
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <div className="lg:col-span-9">
          <section className="card-surface p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                {LANGUAGES.map((item) => (
                  <button
                    key={item}
                    onClick={() => setLanguage(item)}
                    disabled={busy !== null}
                    className={`btn-base px-4 py-2 ${language === item ? "btn-ink" : "btn-outline"}`}
                  >
                    {item}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {DIFFICULTIES.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setDifficulty(item.id)}
                    disabled={busy !== null}
                    className={`btn-base px-4 py-2 ${difficulty === item.id ? "btn-ink" : "btn-outline"}`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <button
                onClick={() => void generate()}
                disabled={busy !== null}
                className="btn-base btn-primary-solid"
              >
                {busy === "generate" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Bug className="h-4 w-4" />
                )}
                {challenge ? "New challenge" : "Start debugging"}
              </button>
            </div>
            {error && (
              <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-700">
                {error}
              </p>
            )}
          </section>

          {!challenge && busy !== "generate" && (
            <section className="card-surface mt-5 p-10 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-soft text-primary">
                <Bug className="h-7 w-7" />
              </div>
              <h2 className="display mt-4 text-xl font-bold">
                How Debug Lab works
              </h2>
              <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
                Pick a language and a difficulty. Vibe writes a small program
                and hides real bugs in it: syntax errors that stop it from
                running and logic errors that make it give wrong answers. Read
                the code, fix every bug, then ask Vibe to check your fix.
              </p>
              <div className="mx-auto mt-6 grid max-w-2xl grid-cols-1 gap-3 text-left sm:grid-cols-3">
                {HOW_IT_WORKS.map(({ Icon, title, body }) => (
                  <div
                    key={title}
                    className="rounded-2xl border border-border bg-surface p-4"
                  >
                    <Icon className="h-5 w-5 text-primary" />
                    <p className="mt-2 text-sm font-bold">{title}</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {body}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {busy === "generate" && (
            <section className="card-surface mt-5 flex items-center justify-center gap-3 p-10 text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              Vibe is writing buggy code for you…
            </section>
          )}

          {challenge && busy !== "generate" && (
            <section className="card-surface mt-5 p-5">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="display text-lg font-bold">{challenge.title}</h2>
                <span className="pill bg-primary-soft text-accent-foreground">
                  <Bug className="h-3 w-3" /> {challenge.bugCount} bug
                  {challenge.bugCount === 1 ? "" : "s"} hidden
                </span>
                <span className="pill bg-muted text-muted-foreground">
                  {language} · {difficulty}
                </span>
              </div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {challenge.task}
              </p>

              <div className="mt-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Fix this code
                  </p>
                  <button
                    onClick={resetToBuggy}
                    className="flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <RefreshCw className="h-3.5 w-3.5" /> Reset to buggy code
                  </button>
                </div>
                <textarea
                  value={code}
                  onChange={(event) => {
                    setCode(event.target.value);
                    setVerdict(null);
                  }}
                  spellCheck={false}
                  rows={Math.min(24, Math.max(10, code.split("\n").length + 1))}
                  className="mt-2 w-full rounded-xl border border-input bg-ink px-4 py-3 font-mono text-[13px] leading-6 text-ink-foreground outline-none focus:border-primary"
                />
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  onClick={() => void checkFix()}
                  disabled={busy !== null || !code.trim()}
                  className="btn-base btn-primary-solid"
                >
                  {busy === "check" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  Check my fix
                </button>
                {hintsShown < challenge.bugs.length && (
                  <button
                    onClick={() => setHintsShown((n) => n + 1)}
                    disabled={busy !== null}
                    className="btn-base btn-outline"
                  >
                    <Lightbulb className="h-4 w-4" />
                    Hint {hintsShown + 1} of {challenge.bugs.length}
                  </button>
                )}
                <button
                  onClick={() => setShowSolution((v) => !v)}
                  disabled={busy !== null}
                  className="btn-base btn-outline"
                >
                  <Code2 className="h-4 w-4" />
                  {showSolution ? "Hide solution" : "Show solution"}
                </button>
                <button
                  onClick={() => void generate()}
                  disabled={busy !== null}
                  className="btn-base btn-outline"
                >
                  Next challenge <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              {hintsShown > 0 && (
                <div className="mt-4 space-y-2">
                  {challenge.bugs.slice(0, hintsShown).map((bug, index) => (
                    <div
                      key={index}
                      className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900"
                    >
                      <Lightbulb className="mt-0.5 h-4 w-4 shrink-0" />
                      <p>
                        <span className="font-bold capitalize">
                          {bug.kind} bug:
                        </span>{" "}
                        {bug.hint}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {verdict && (
                <div
                  className={`mt-4 rounded-xl border px-4 py-4 ${
                    verdict.solved
                      ? "border-emerald-200 bg-emerald-50"
                      : "border-red-200 bg-red-50"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {verdict.solved ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-600" />
                    )}
                    <p
                      className={`text-sm font-bold ${verdict.solved ? "text-emerald-800" : "text-red-800"}`}
                    >
                      {verdict.solved
                        ? "All bugs fixed. Nice detective work! 🎉"
                        : "Not quite yet. Keep going."}
                    </p>
                  </div>
                  <p
                    className={`mt-2 text-xs leading-5 ${verdict.solved ? "text-emerald-800" : "text-red-800"}`}
                  >
                    {verdict.verdict}
                  </p>
                  {verdict.fixedBugs.length > 0 && (
                    <ul className="mt-2 space-y-1 text-xs text-emerald-800">
                      {verdict.fixedBugs.map((item, index) => (
                        <li key={index} className="flex items-start gap-1.5">
                          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  )}
                  {verdict.remainingIssues.length > 0 && (
                    <ul className="mt-2 space-y-1 text-xs text-red-800">
                      {verdict.remainingIssues.map((item, index) => (
                        <li key={index} className="flex items-start gap-1.5">
                          <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {showSolution && (
                <div className="mt-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Reference solution
                  </p>
                  <pre className="mt-2 overflow-x-auto rounded-xl border border-border bg-muted px-4 py-3 font-mono text-[13px] leading-6">
                    {challenge.solution}
                  </pre>
                </div>
              )}
            </section>
          )}
        </div>

        <aside className="space-y-5 lg:col-span-3">
          <section className="card-surface p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold">The two bug types</h3>
              <span className="pill bg-primary-soft text-accent-foreground">
                <Sparkles className="h-3 w-3" /> Know your enemy
              </span>
            </div>
            <div className="mt-4 space-y-3">
              <div className="rounded-xl border border-border bg-surface p-3.5">
                <p className="text-sm font-bold">Syntax errors</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Broken grammar of the language. A missing bracket, a wrong
                  keyword. The program refuses to run at all.
                </p>
              </div>
              <div className="rounded-xl border border-border bg-surface p-3.5">
                <p className="text-sm font-bold">Logic errors</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  The program runs, but does the wrong thing. A flipped
                  condition, an off-by-one loop, the wrong variable.
                </p>
              </div>
            </div>
          </section>
          <section className="card-surface p-5">
            <h3 className="text-sm font-bold">How to hunt bugs</h3>
            <ol className="mt-3 list-decimal space-y-2 pl-4 text-xs leading-5 text-muted-foreground">
              <li>Read the task first. Know what correct looks like.</li>
              <li>Run the code in your head, line by line.</li>
              <li>
                Check the usual suspects: brackets, operators, loop bounds.
              </li>
              <li>Fix one bug at a time, then re-check.</li>
              <li>Stuck? Take a hint. It costs nothing.</li>
            </ol>
          </section>
          <section className="rounded-2xl bg-primary-soft p-5">
            <p className="text-sm font-bold">Every bug you fix is evidence.</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Solved challenges count toward your Debugging skill on the Skills
              page.
            </p>
          </section>
        </aside>
      </div>
    </AppShell>
  );
}
