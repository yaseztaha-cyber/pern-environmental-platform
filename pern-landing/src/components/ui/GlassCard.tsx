import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "../../utils/cn";

type Props = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  glow?: boolean;
  strong?: boolean;
  solid?: boolean;
};

export const GlassCard = forwardRef<HTMLDivElement, Props>(
  ({ children, className, glow, strong, solid, ...rest }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          solid
            ? "border border-white/[0.08] bg-pern-surface/90"
            : strong
              ? "glass-strong"
              : "glass",
          glow && "glass-glow",
          "rounded-3xl",
          className
        )}
        {...rest}
      >
        {children}
      </div>
    );
  }
);

GlassCard.displayName = "GlassCard";
