import { cn } from "@/lib/utils";

type Props = {
  className?: string;
  /** Line weight in the 48-unit drawing. The mark is thinner when it is drawn very large. */
  strokeWidth?: number;
};

/**
 * Query Pulse's mark: a database cylinder with a pulse inside it, nothing more. It is drawn with the current
 * text colour, so it takes any colour you give it (the sidebar's blue, a theme's accent, a faint
 * background wash). It is decorative: the name beside it says what it is.
 */
export function Logo({ className, strokeWidth = 2.5 }: Props) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("shrink-0", className)}
    >
      {/* The database: a cylinder. */}
      <ellipse cx="24" cy="10" rx="14" ry="5" />
      <path d="M10 10v28c0 2.8 6.3 5 14 5s14-2.2 14-5V10" />
      {/* The pulse: a heartbeat across its body, from wall to wall and no further. */}
      <path d="M10 27h6l3.5-9 5 16 4-11 2.2 4H38" strokeWidth={strokeWidth * 1.15} />
    </svg>
  );
}
