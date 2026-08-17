import type { ReactNode } from "react";
import { cn } from "../../utils/cn";

export function Pill({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "glass inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-medium tracking-wide text-slate-200 sm:text-sm",
        className
      )}
    >
      {children}
    </span>
  );
}
