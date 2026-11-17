import { cn } from "@/lib/utils";

const SITE = "https://zykosince94.github.io";

/** The author's credit line, on the sign-in screen and at the foot of every page. */
export function DeveloperCredit({ className }: { className?: string }) {
  return (
    <p className={cn("text-center text-xs text-muted-foreground", className)}>
      Developed by Rishabh Pandey <span aria-hidden>|</span>{" "}
      <a
        href={SITE}
        target="_blank"
        rel="noopener noreferrer"
        className="rounded-sm text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {SITE}
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    </p>
  );
}
