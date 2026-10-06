import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import {
  LayoutGrid,
  BookOpen,
  Rocket,
  Sparkles,
  TrendingUp,
  Timer,
  Settings as SettingsIcon,
  LogOut,
  Bell,
  ChevronDown,
  Menu,
  MessageCircle,
  X,
} from "lucide-react";
import {
  getLoopState,
  resetLoop,
  setLoopState,
  useLoop,
} from "@/lib/loop-store";
import { GoogleSignIn } from "@/components/GoogleSignIn";
import { AUTH_TEMPORARILY_DISABLED } from "@/lib/auth-flag";
import { signOut, useAuth } from "@/lib/auth";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutGrid },
  { to: "/learn", label: "Learn", icon: BookOpen },
  { to: "/mentor", label: "Chatbot", icon: MessageCircle },
  { to: "/missions", label: "Missions", icon: Rocket },
  { to: "/skills", label: "Skills", icon: Sparkles },
  { to: "/progress", label: "Progress", icon: TrendingUp },
  { to: "/sessions", label: "Sessions", icon: Timer },
] as const;

const linkBase =
  "group flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-[14px] font-medium text-foreground/75 transition-colors hover:bg-muted hover:text-foreground";
const linkActive =
  "bg-primary-soft font-semibold text-accent-foreground shadow-[inset_2px_0_0_0_var(--color-primary)]";

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const state = useLoop();
  const auth = useAuth();
  const navigate = useNavigate();
  const name = state.profile?.name?.trim() || "Builder";

  return (
    <div className="flex h-full flex-col justify-between px-4 py-6">
      <div>
        <Link to="/dashboard" className="block px-2" onClick={onNavigate}>
          <span className="display flex items-center text-[22px] font-extrabold tracking-[-0.05em]">
            BuildMyLogic
            <span className="mb-3 ml-0.5 h-1.5 w-1.5 rounded-full bg-primary" />
          </span>
        </Link>
        <nav className="mt-9 space-y-1.5">
          {NAV.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              onClick={onNavigate}
              className={`${linkBase} ${linkActive}`}
              activeProps={{ className: `${linkBase} ${linkActive}` }}
              inactiveProps={{ className: linkBase }}
            >
              <Icon className="h-[19px] w-[19px]" strokeWidth={1.9} />
              {label}
            </Link>
          ))}
        </nav>
      </div>

      <div>
        <div className="mb-6 space-y-1 border-t border-border pt-5">
          <Link
            to="/settings"
            onClick={onNavigate}
            className={`${linkBase} text-muted-foreground`}
            activeProps={{ className: `${linkBase} ${linkActive}` }}
            inactiveProps={{ className: `${linkBase} text-muted-foreground` }}
          >
            <SettingsIcon className="h-[19px] w-[19px]" strokeWidth={1.9} />
            Settings
          </Link>
          {!AUTH_TEMPORARILY_DISABLED && (
            <button
              type="button"
              onClick={() => {
                void signOut();
                resetLoop();
                void navigate({ to: "/" });
              }}
              className={`${linkBase} w-full text-muted-foreground`}
            >
              <LogOut className="h-[19px] w-[19px]" strokeWidth={1.9} />
              Logout
            </button>
          )}
          {auth && <GoogleSignIn compact />}
        </div>

        <div className="rounded-2xl border border-primary/15 bg-primary-soft px-4 py-4">
          <p className="text-[13px] font-bold">Keep Building.</p>
          <p className="mt-1 text-[12px] leading-5 text-muted-foreground">
            A better you is a more capable builder.
          </p>
          <div className="mt-2 text-right text-xl text-primary">↗</div>
        </div>
      </div>
    </div>
  );
}

export function AppShell({
  crumb,
  title,
  subtitle,
  quote,
  children,
  wide = false,
}: {
  crumb: string;
  title: string;
  subtitle: string;
  quote?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  const state = useLoop();
  const auth = useAuth();
  const router = useRouter();
  const navigate = useNavigate();
  const [notice, setNotice] = useState<string | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const name = state.profile?.name?.trim() || "Builder";

  useEffect(() => {
    // Read the authoritative store, not the render snapshot: during hydration
    // the snapshot is the server value (empty state), which used to bounce
    // full page loads of /sessions, /learn, etc. back to / and then /dashboard.
    if (!getLoopState().onboarded) {
      void navigate({ to: "/" });
    }
  }, [navigate]);

  // Close the mobile drawer whenever the learner moves to another page.
  useEffect(() => {
    setNavOpen(false);
  }, [router.state.location.pathname]);

  useEffect(() => {
    if (
      auth?.displayName &&
      state.profile &&
      (state.profile.name === "Builder" || !state.profile.name)
    ) {
      setLoopState((prev) => ({
        ...prev,
        profile: prev.profile
          ? { ...prev.profile, name: auth.displayName }
          : prev.profile,
      }));
    }
  }, [auth, state.profile]);

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop rail */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[236px] border-r border-border bg-surface/95 backdrop-blur-sm lg:block">
        <SidebarContent />
      </aside>

      {/* Mobile drawer */}
      {navOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setNavOpen(false)}
            className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]"
          />
          <aside className="absolute inset-y-0 left-0 flex w-[264px] flex-col bg-surface shadow-2xl">
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => setNavOpen(false)}
              className="absolute right-3 top-5 rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
            >
              <X className="h-4.5 w-4.5" />
            </button>
            <SidebarContent onNavigate={() => setNavOpen(false)} />
          </aside>
        </div>
      )}

      <div className="lg:ml-[236px]">
        <header className="sticky top-0 z-20 flex h-[68px] items-center gap-3 border-b border-border/60 bg-background/85 px-4 backdrop-blur-md lg:px-8">
          <button
            type="button"
            aria-label="Open menu"
            onClick={() => setNavOpen(true)}
            className="rounded-xl border border-border bg-surface p-2 text-foreground lg:hidden"
          >
            <Menu className="h-4.5 w-4.5" />
          </button>
          <p className="truncate text-[13px] font-semibold text-muted-foreground lg:hidden">
            {crumb}
          </p>

          <div className="ml-auto flex items-center gap-4">
            <button
              type="button"
              onClick={() =>
                setNotice(`${state.activity.length} updates in your build log.`)
              }
              aria-label="Notifications"
              className="relative rounded-full p-2 text-foreground transition-colors hover:bg-muted"
            >
              <Bell className="h-[21px] w-[21px]" strokeWidth={1.8} />
              {state.activity.length > 0 && (
                <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary" />
              )}
            </button>
            <div className="flex items-center gap-3">
              {!auth && <GoogleSignIn compact />}
              <Link
                to="/settings"
                className="flex items-center gap-2.5 rounded-xl px-1.5 py-1.5 transition-colors hover:bg-muted"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-ink text-xs font-semibold text-ink-foreground">
                  {name.slice(0, 1).toUpperCase()}
                </span>
                <span className="hidden text-sm font-semibold sm:inline">
                  {name}
                </span>
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </Link>
            </div>
          </div>
        </header>

        <main
          className={`mx-auto px-4 pb-14 pt-7 sm:px-7 lg:px-8 ${wide ? "max-w-[1420px]" : "max-w-[1320px]"}`}
        >
          <div className="mb-8 flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
            <div>
              <p className="eyebrow mb-2">{crumb}</p>
              <h1 className="display text-[34px] font-extrabold leading-[1.05] tracking-[-0.055em] sm:text-[42px]">
                {title}
              </h1>
              <p className="mt-2 max-w-4xl text-[15px] leading-6 text-muted-foreground sm:text-[17px]">
                {subtitle}
              </p>
            </div>
            {quote && (
              <p className="max-w-[190px] border-l-2 border-primary/30 pl-3 text-right text-[13px] leading-5 text-muted-foreground lg:pt-3">
                “{quote}”
              </p>
            )}
          </div>
          {notice && (
            <div className="mb-5 rounded-xl border border-primary/20 bg-primary-soft px-4 py-3 text-xs font-medium text-accent-foreground">
              {notice}
            </div>
          )}
          <div className="rise">{children}</div>
        </main>
      </div>
    </div>
  );
}
