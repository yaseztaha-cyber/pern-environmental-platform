import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bot, Check, Sparkles, Activity, Cpu, BrainCircuit } from "lucide-react";
import { aiFeatures, chatDemo } from "../../data/content";
import { GlassCard } from "../ui/GlassCard";
import { PredictionPanel } from "../ui/PredictionPanel";
import { SectionHeader } from "../ui/SectionHeader";
import { SectionReveal } from "../ui/SectionReveal";
import { prefersReducedMotion } from "../../hooks/usePrefersReducedMotion";

type Msg = { role: "user" | "ai"; text: string };

function ThinkingDots() {
  return (
    <span className="inline-flex items-center gap-1.5 py-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="think-dot h-1.5 w-1.5 rounded-full bg-teal-300"
          style={{ animationDelay: `${i * 0.18}s` }}
        />
      ))}
    </span>
  );
}

function useChatTimeline(messages: readonly Msg[]) {
  const [count, setCount] = useState(0);
  const [typed, setTyped] = useState(0);
  const [thinking, setThinking] = useState(false);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    return () => timers.current.forEach(window.clearTimeout);
  }, []);

  useEffect(() => {
    if (prefersReducedMotion()) {
      setCount(messages.length);
      setTyped(0);
      setThinking(false);
      return;
    }
    if (count >= messages.length) {
      if (prefersReducedMotion()) return;
      const reset = window.setTimeout(() => setCount(0), 4000);
      timers.current.push(reset);
      return;
    }

    const msg = messages[count];
    const ids = timers.current;

    if (msg.role === "user") {
      const t = window.setTimeout(() => {
        setCount((c) => c + 1);
      }, 1700);
      ids.push(t);
      return;
    }

    setThinking(true);
    setTyped(0);
    const tThink = window.setTimeout(() => {
      setThinking(false);
      const iv = window.setInterval(() => {
        setTyped((t) => {
          const next = Math.min(msg.text.length, t + 2);
          if (next >= msg.text.length) {
            window.clearInterval(iv);
            setCount((c) => c + 1);
          }
          return next;
        });
      }, 22);
      ids.push(iv);
    }, 1300);
    ids.push(tThink);
  }, [count, messages]);

  const shown = messages.slice(0, Math.min(count + 1, messages.length));
  return { shown, count, typed, thinking };
}

function Bubble({ msg, inProgress, text }: {
  msg: Msg;
  inProgress: boolean;
  text?: string;
}) {
  const isUser = msg.role === "user";
  return (
    <motion.div
      initial={{ opacity: 0, y: 14, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 26 }}
      className={
        isUser
          ? "ml-8 rounded-2xl rounded-br-md bg-pern-primary/15 px-4 py-3 text-sm text-teal-50"
          : "mr-6 rounded-2xl rounded-bl-md border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200"
      }
    >
      {isUser ? (
        msg.text
      ) : inProgress ? (
        <span>
          {text}
          <span className="stream-cursor ml-0.5 inline-block h-3.5 w-[2px] translate-y-[2px] bg-teal-300" />
        </span>
      ) : (
        msg.text
      )}
    </motion.div>
  );
}

function PipelineFlow() {
  const steps = [
    { icon: Cpu, label: "Nodes", sub: "14 physical + 10 virtual" },
    { icon: Activity, label: "Features", sub: "correlated & cleaned" },
    { icon: BrainCircuit, label: "Random Forest", sub: "94% accuracy" },
    { icon: Sparkles, label: "Forecast", sub: "24h + confidence" },
  ];
  return (
    <div className="mb-8 grid grid-cols-4 gap-2">
      {steps.map((s, i) => (
        <div key={s.label} className="flex items-center gap-2">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.12 }}
            className="glass flex-1 rounded-2xl p-3 text-center"
          >
            <s.icon className="mx-auto mb-1.5 h-4 w-4 text-pern-primary" />
            <div className="text-[11px] font-semibold text-white">{s.label}</div>
            <div className="mt-0.5 text-[9px] leading-tight text-slate-500">
              {s.sub}
            </div>
          </motion.div>
          {i < steps.length - 1 && (
            <div className="relative h-px w-2 flex-none overflow-visible sm:w-3">
              <motion.span
                initial={{ opacity: 0, scaleX: 0 }}
                whileInView={{ opacity: 1, scaleX: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.12 + 0.25, duration: 0.4 }}
                className="absolute inset-0 origin-left bg-gradient-to-r from-pern-primary/60 to-transparent"
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function AI() {
  const { shown, count, typed, thinking } = useChatTimeline(chatDemo);

  return (
    <section id="ai" className="section-pad relative overflow-hidden">
      <div className="mx-auto max-w-7xl">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <SectionReveal>
            <SectionHeader
              number="04"
              eyebrow={
                <>
                  <Sparkles className="h-3.5 w-3.5 text-pern-primary" />
                  Think in Natural Language
                </>
              }
              title="An AI Copilot for Environmental Data"
              description="Ask anything. PERN Copilot answers with live telemetry, forecasts, and compliance guidance in seconds."
            />
            <PipelineFlow />
            <ul className="mb-8 space-y-4">
              {aiFeatures.map((f, i) => (
                <motion.li
                  key={f.title}
                  initial={{ x: -16 }}
                  whileInView={{ x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.08 }}
                  className="flex gap-3"
                >
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-pern-primary/15 text-pern-primary">
                    <Check className="h-3.5 w-3.5" />
                  </span>
                  <div>
                    <div className="font-semibold text-white">{f.title}</div>
                    <div className="text-sm text-slate-400">{f.description}</div>
                  </div>
                </motion.li>
              ))}
            </ul>
          </SectionReveal>

          <SectionReveal delay={0.1}>
            <div className="perspective-1000 relative mx-auto max-w-md lg:max-w-none">
              <div
                className="preserve-3d relative"
                style={{
                  transform: "rotateY(-8deg) rotateX(5deg)",
                }}
              >
                <GlassCard strong glow className="conic-border shine relative overflow-hidden p-5 sm:p-6">
                  <div className="mb-5 flex items-center gap-3 border-b border-white/10 pb-4">
                    <span className="relative flex h-10 w-10 items-center justify-center rounded-full bg-pern-primary/20">
                      <Bot className="h-5 w-5 text-pern-primary" />
                      <span className="absolute inset-0 animate-ping rounded-full bg-pern-primary/20" />
                    </span>
                    <div>
                      <div className="text-sm font-semibold">PERN Copilot</div>
                      <div className="flex items-center gap-1.5 text-xs text-emerald-400">
                        <span className="relative flex h-1.5 w-1.5">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                        </span>
                        Streaming · Online
                      </div>
                    </div>
                    <div className="ml-auto h-px w-16 bg-gradient-to-r from-transparent via-teal-400/60 to-transparent" />
                  </div>

                  <div className="flex min-h-[330px] flex-col justify-end gap-3">
                    <AnimatePresence mode="popLayout" initial={false}>
                      {shown.map((msg, i) => {
                        const isCurrent = i === count && count < chatDemo.length;
                        if (isCurrent && msg.role === "ai" && thinking) {
                          return null;
                        }
                        const text =
                          isCurrent && msg.role === "ai" && !thinking
                            ? msg.text.slice(0, typed)
                            : msg.text;
                        return (
                          <Bubble
                            key={`${msg.role}-${i}`}
                            msg={msg}
                            inProgress={isCurrent && msg.role === "ai"}
                            text={text}
                          />
                        );
                      })}
                      {shown.length > 0 &&
                        count < chatDemo.length &&
                        chatDemo[count]?.role === "ai" &&
                        thinking && (
                          <motion.div
                            key="thinking"
                            initial={{ opacity: 0, y: 10, scale: 0.96 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            transition={{ type: "spring", stiffness: 300, damping: 26 }}
                            className="mr-6 w-fit rounded-2xl rounded-bl-md border border-white/10 bg-white/5 px-4 py-3"
                          >
                            <ThinkingDots />
                          </motion.div>
                        )}
                    </AnimatePresence>
                  </div>
                </GlassCard>
              </div>
              <div
                aria-hidden
                className="pointer-events-none absolute -right-4 -top-4 h-24 w-24 rounded-full"
                style={{
                  background:
                    "radial-gradient(circle, rgba(45,212,191,0.25), transparent 70%)",
                }}
              />
            </div>
          </SectionReveal>
        </div>

        <SectionReveal delay={0.15} className="mt-14">
          <PredictionPanel />
        </SectionReveal>
      </div>
    </section>
  );
}
