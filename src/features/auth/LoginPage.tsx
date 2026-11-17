import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Info, ScanSearch, ShieldCheck, Sparkles } from "lucide-react";
import { type ComponentType, type FormEvent, type SVGProps, useState } from "react";
import { DeveloperCredit } from "@/components/DeveloperCredit";
import { Logo } from "@/components/Logo";
import { LogoWatermark } from "@/components/LogoWatermark";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authConfigQuery, useDemoLogin, useLogin } from "./queries";

type Point = { icon: ComponentType<SVGProps<SVGSVGElement>>; title: string; text: string };

/** What it does, in the order a finding travels: found by rules, explained by AI, left to you. */
const POINTS: Point[] = [
  {
    icon: ScanSearch,
    title: "Rules find it",
    text: "Deterministic rules read the workload and the query plans, then raise a finding for a missing index, a full scan, a blocking sort or an index nobody uses. Each one cites its evidence. Nothing is guessed.",
  },
  {
    icon: Sparkles,
    title: "AI explains it",
    text: "An optional assistant turns a finding into plain words and drafts a fix to review. It only sees a redacted evidence bundle (no values, hosts or credentials), must cite that evidence claim by claim, and has its answer thrown away if it cites anything that wasn't sent.",
  },
  {
    icon: ShieldCheck,
    title: "You decide",
    text: "Connections are read-only, and Query Pulse never runs a draft for you. You get the exact query, its plan and a fix you can check, then you choose.",
  },
];

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <span className="grid size-10 place-items-center rounded-lg bg-primary/15 text-primary ring-1 ring-primary/30">
        <Logo className="size-6" />
      </span>
      <span className="text-sm font-bold tracking-[0.2em] text-foreground">QUERY PULSE</span>
    </div>
  );
}

/**
 * The sign-in screen: what Query Pulse is on the left (wide screens only), the form on the
 * right. Colours come from the theme tokens, so it follows light and dark and every colour theme.
 */
export function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const login = useLogin();
  const demoLogin = useDemoLogin();
  const { data: config } = useQuery(authConfigQuery);

  const pending = login.isPending || demoLogin.isPending;
  const error = login.error ?? demoLogin.error;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    demoLogin.reset();
    login.mutate({ username, password });
  }

  return (
    <div className="grid min-h-svh bg-background lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
      <section
        aria-label="About Query Pulse"
        className="relative hidden flex-col justify-between gap-8 overflow-hidden border-r p-10 lg:flex xl:p-12"
        style={{
          background:
            "radial-gradient(ellipse 70% 60% at 55% 55%, color-mix(in srgb, var(--primary) 16%, transparent), transparent 70%), var(--background)",
        }}
      >
        {/* The logo, huge and faint, behind the words. */}
        <LogoWatermark className="absolute top-1/2 -right-28 size-[46rem] -translate-y-1/2 opacity-[0.07]" />

        <div className="relative">
          <Brand />
        </div>

        <div className="relative flex max-w-3xl flex-col gap-5 xl:pl-10">
          <p className="text-xs font-semibold tracking-[0.18em] text-primary">
            DATABASE INTELLIGENCE FOR POSTGRESQL AND MONGODB
          </p>
          <p className="text-5xl leading-[1.05] font-bold tracking-tight text-foreground xl:text-[3.5rem]">
            Your database is talking.
            <span className="block text-primary">We translate.</span>
          </p>
          <p className="max-w-xl text-base leading-relaxed text-muted-foreground">
            Every database already reports what it spends its time on. Query Pulse listens, ranks
            the operations that cost the most, reads their plans, and tells you which one to fix,
            and why, before it becomes an incident.
          </p>

          <ul className="flex max-w-xl flex-col gap-4">
            {POINTS.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-4">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg border bg-card/60 text-primary">
                  <Icon aria-hidden className="size-4.5" />
                </span>
                <div className="flex flex-col gap-1">
                  <p className="text-sm font-semibold text-foreground">{title}</p>
                  <p className="text-sm leading-relaxed text-muted-foreground">{text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <DeveloperCredit className="relative text-left" />
      </section>

      <main className="relative flex flex-col justify-center overflow-hidden px-6 py-12 sm:px-12">
        {/* On a phone there is no side panel, so the wash goes behind the form. */}
        <LogoWatermark className="absolute -right-24 -bottom-24 size-[26rem] opacity-[0.05] lg:hidden" />

        <div className="relative mx-auto flex w-full max-w-sm flex-col gap-8">
          <div className="lg:hidden">
            <Brand />
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold tracking-[0.18em] text-primary">WELCOME BACK</p>
            <h1 className="text-3xl font-semibold tracking-tight">Sign in</h1>
            <p className="text-sm text-muted-foreground">
              Database performance intelligence for PostgreSQL and MongoDB.
            </p>
          </div>

          <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
            {error && <Alert variant="destructive">{error.message}</Alert>}

            <div className="flex flex-col gap-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                name="username"
                autoComplete="username"
                required
                className="h-11"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="h-11"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <Button
              type="submit"
              className="h-11 w-full"
              disabled={pending || !username || !password}
            >
              {login.isPending ? "Signing in…" : "Sign in"}
              <ArrowUpRight aria-hidden />
            </Button>

            {config?.demo_enabled && (
              <>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="h-px flex-1 bg-border" />
                  or
                  <span className="h-px flex-1 bg-border" />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 w-full"
                  disabled={pending}
                  onClick={() => {
                    login.reset();
                    demoLogin.mutate();
                  }}
                >
                  {demoLogin.isPending ? "Opening the demo…" : "Try the demo"}
                </Button>
                <div className="flex gap-3 rounded-lg border bg-card/60 p-3.5 text-xs leading-relaxed text-muted-foreground">
                  <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
                  <p>
                    The demo is read-only: you can explore everything but change nothing. No
                    password needed, and each planted problem comes with sample AI answers.
                  </p>
                </div>
              </>
            )}
          </form>

          <DeveloperCredit className="lg:hidden" />
        </div>
      </main>
    </div>
  );
}
