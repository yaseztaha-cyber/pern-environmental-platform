import {
  forwardRef,
  useEffect,
  useRef,
  type ButtonHTMLAttributes,
  type AnchorHTMLAttributes,
  type ReactNode,
} from "react";
import gsap from "gsap";
import { cn } from "../../utils/cn";
import { prefersReducedMotion } from "../../hooks/usePrefersReducedMotion";

type BaseProps = {
  variant?: "primary" | "secondary" | "ghost";
  size?: "md" | "lg" | "xl";
  children: ReactNode;
  asChild?: boolean;
};

type ButtonProps = BaseProps & ButtonHTMLAttributes<HTMLButtonElement> & { href?: undefined };
type LinkProps = BaseProps & AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };

type Props = ButtonProps | LinkProps;

export const Button = forwardRef<HTMLButtonElement & HTMLAnchorElement, Props>(
  ({ className, variant = "primary", size = "md", children, href, ...rest }, ref) => {
    const innerRef = useRef<HTMLElement | null>(null);

    useEffect(() => {
      const el = innerRef.current as HTMLElement | null;
      if (!el || variant === "ghost") return;
      if (!window.matchMedia("(pointer: fine)").matches) return;
      if (prefersReducedMotion()) return;

      const quickX = gsap.quickTo(el, "x", {
        duration: 0.4,
        ease: "power3.out",
      });
      const quickY = gsap.quickTo(el, "y", {
        duration: 0.4,
        ease: "power3.out",
      });

      const onMove = (e: MouseEvent) => {
        const r = el.getBoundingClientRect();
        const dx = (e.clientX - r.left - r.width / 2) * 0.35;
        const dy = (e.clientY - r.top - r.height / 2) * 0.35;
        quickX(dx);
        quickY(dy);
      };
      const onLeave = () => {
        quickX(0);
        quickY(0);
      };

      el.addEventListener("mousemove", onMove);
      el.addEventListener("mouseleave", onLeave);
      return () => {
        el.removeEventListener("mousemove", onMove);
        el.removeEventListener("mouseleave", onLeave);
      };
    }, [variant]);

    const classes = cn(
      "relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-full font-semibold tracking-tight transition-[background-color,border-color,color,box-shadow,scale] duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/60 active:scale-[0.97]",
      size === "md" && "px-5 py-2.5 text-sm",
      size === "lg" && "px-7 py-3.5 text-base",
      size === "xl" && "px-10 py-5 text-lg sm:text-xl",
      variant === "primary" &&
        "bg-pern-primary text-slate-950 shadow-[0_0_40px_-10px_rgba(0,212,170,0.55)] hover:scale-105 hover:bg-[#2ee6bf] hover:shadow-[0_0_50px_-8px_rgba(0,212,170,0.75)]",
      variant === "secondary" &&
        "glass text-slate-100 hover:scale-105 hover:border-teal-400/30 hover:bg-white/5",
      variant === "ghost" &&
        "text-slate-300 hover:text-white hover:underline underline-offset-4",
      className
    );

    if (href !== undefined) {
      const { asChild, ...anchorRest } = rest as AnchorHTMLAttributes<HTMLAnchorElement> & { asChild?: boolean };
      return (
        <a
          ref={(node) => {
            innerRef.current = node;
            if (typeof ref === "function") ref(node as never);
            else if (ref) (ref as { current: unknown }).current = node;
          }}
          href={href}
          data-cursor="hover"
          className={classes}
          {...anchorRest}
        >
          {children}
        </a>
      );
    }

    const { asChild, ...buttonRest } = rest as ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean };
    return (
      <button
        ref={(node) => {
          innerRef.current = node;
          if (typeof ref === "function") ref(node as never);
          else if (ref) (ref as { current: unknown }).current = node;
        }}
        data-cursor="hover"
        className={classes}
        {...buttonRest}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";
