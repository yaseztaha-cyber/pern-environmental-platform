import { type ReactNode } from "react";
import { cn } from "../../utils/cn";

type Props = {
  number?: string;
  eyebrow: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  align?: "left" | "center";
  className?: string;
};

export function SectionHeader({
  number,
  eyebrow,
  title,
  description,
  align = "left",
  className,
}: Props) {
  return (
    <div className={cn("mb-12", align === "center" && "text-center", className)}>
      <div
        className={cn(
          "mb-5 flex items-center gap-3",
          align === "center" && "justify-center"
        )}
      >
        {number && <span className="section-chip">{number}</span>}
        <span className="pill inline-flex items-center gap-2 border border-white/10 bg-white/5 px-3.5 py-1.5 text-[11px] font-medium text-slate-300">
          <span className="h-1.5 w-1.5 rounded-full bg-pern-primary shadow-[0_0_8px_rgba(0,212,170,0.9)]" />
          {eyebrow}
        </span>
        {align === "left" && (
          <span className="h-px flex-1 bg-gradient-to-r from-white/15 to-transparent" />
        )}
      </div>
      <h2 className="heading-lg text-white">{title}</h2>
      {description && (
        <p
          className={cn(
            "mt-4 max-w-2xl text-base leading-relaxed text-slate-400 sm:text-lg",
            align === "center" && "mx-auto"
          )}
        >
          {description}
        </p>
      )}
      {align === "center" && (
        <div className="mx-auto mt-6 h-px w-24 bg-gradient-to-r from-transparent via-pern-primary/60 to-transparent" />
      )}
    </div>
  );
}
