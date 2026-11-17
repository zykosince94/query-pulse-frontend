import { useQuery } from "@tanstack/react-query";
import { Link, Outlet } from "@tanstack/react-router";
import { Database, Gauge, LogOut, Settings, TriangleAlert } from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import { DeveloperCredit } from "@/components/DeveloperCredit";
import { Logo } from "@/components/Logo";
import { LogoWatermark } from "@/components/LogoWatermark";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCurrentUser, useLogout } from "@/features/auth/queries";
import { findingsQuery } from "@/features/findings/queries";
import { SyncIndicator } from "./SyncIndicator";

type NavItem = {
  to: "/" | "/sources" | "/findings" | "/settings";
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
};

const NAV: NavItem[] = [
  { to: "/", label: "Workload", icon: Gauge },
  { to: "/sources", label: "Data sources", icon: Database },
  { to: "/findings", label: "Findings", icon: TriangleAlert },
  { to: "/settings", label: "Settings", icon: Settings },
];

const linkBase =
  "flex shrink-0 items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground [&_svg]:size-4";
const linkActive = "bg-secondary text-secondary-foreground";

export function AppShell() {
  const user = useCurrentUser();
  const logout = useLogout();
  const open = useQuery({ ...findingsQuery({ status: "open" }), enabled: Boolean(user) });
  const openCount = open.data?.counts.open ?? 0;
  if (!user) return null;

  return (
    <div className="flex min-h-svh flex-col md:flex-row">
      <aside className="border-b bg-card md:w-60 md:shrink-0 md:border-r md:border-b-0">
        <div className="flex h-14 items-center gap-2 px-4 text-primary">
          <Logo className="size-6" />
          <span className="font-semibold text-foreground">Query Pulse</span>
        </div>
        <nav aria-label="Main" className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:pb-0">
          {NAV.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className={linkBase}
              activeProps={{ className: linkActive, "aria-current": "page" }}
              activeOptions={{ exact: to === "/" }}
            >
              <Icon aria-hidden />
              {label}
              {to === "/findings" && openCount > 0 && (
                <Badge variant="warning" className="ml-auto" aria-label={`${openCount} open`}>
                  {openCount}
                </Badge>
              )}
            </Link>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex min-h-14 flex-wrap items-center justify-end gap-x-3 gap-y-1 border-b bg-card px-4 py-1.5">
          {user.read_only && (
            <Badge variant="warning" title="You can explore everything but change nothing">
              Read-only demo
            </Badge>
          )}
          <span className="text-sm text-muted-foreground">
            <span className="hidden sm:inline">Signed in as </span>
            <span className="font-medium text-foreground">{user.username}</span>
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => logout.mutate()}
            disabled={logout.isPending}
          >
            <LogOut aria-hidden />
            Sign out
          </Button>
        </header>

        <main className="flex-1 px-4 py-8 md:px-10">
          <Outlet />
        </main>
        <footer className="border-t px-4 py-5 pb-20 md:px-10">
          <DeveloperCredit />
        </footer>
      </div>
      {/* The logo, much fainter than on the sign-in screen, behind every page. */}
      <LogoWatermark className="fixed -right-24 -bottom-28 -z-10 size-[44rem] opacity-[0.035] print:hidden" />
      <SyncIndicator />
    </div>
  );
}
