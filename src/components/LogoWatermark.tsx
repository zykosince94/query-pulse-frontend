import { Logo } from "@/components/Logo";
import { cn } from "@/lib/utils";

/**
 * The logo as a very faint, very large background wash. It is decoration only: hidden from
 * assistive technology, never catches the pointer, and drawn in the theme's accent colour at a
 * low opacity chosen by the caller (it has to stay quiet enough that text over it keeps its
 * contrast). The caller places and sizes it.
 */
export function LogoWatermark({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("pointer-events-none select-none text-primary", className)}>
      <Logo className="size-full" strokeWidth={1.1} />
    </div>
  );
}
