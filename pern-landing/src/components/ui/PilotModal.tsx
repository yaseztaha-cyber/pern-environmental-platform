import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Loader2, Send, X } from "lucide-react";
import { contactEmail } from "../../data/content";
import { cn } from "../../utils/cn";
import { Button } from "./Button";

const ORGS = [
  "Municipality / Governorate",
  "School / University",
  "Factory / Industry",
  "Agriculture / Farm",
  "NGO / Research",
  "Other",
];

type Props = {
  open: boolean;
  onClose: () => void;
};

export function PilotModal({ open, onClose }: Props) {
  const nameId = useId();
  const orgId = useId();
  const orgTypeId = useId();
  const messageId = useId();
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [name, setName] = useState("");
  const [org, setOrg] = useState("");
  const [orgType, setOrgType] = useState("");
  const [message, setMessage] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setStatus("idle");
    const prev = document.activeElement as HTMLElement | null;
    const t = window.setTimeout(() => {
      panelRef.current?.querySelector<HTMLInputElement>("input")?.focus();
    }, 60);
    return () => {
      window.clearTimeout(t);
      prev?.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const el = panelRef.current;
    if (!el) return;
    const onScroll = (e: Event) => e.stopPropagation();
    el.addEventListener("wheel", onScroll, { passive: false });
    return () => el.removeEventListener("wheel", onScroll);
  }, [open]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !org.trim()) return;
    setStatus("sending");
    const subject = encodeURIComponent("Pilot Deployment Request — PERN");
    const body = encodeURIComponent(
      `Name: ${name}\nOrganization: ${org}\nType: ${orgType || "Not specified"}\n\n${message}`
    );
    window.setTimeout(() => {
      window.location.href = `mailto:${contactEmail}?subject=${subject}&body=${body}`;
      setStatus("sent");
    }, 350);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[150] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-label="Request a pilot deployment"
        >
          <motion.div
            ref={panelRef}
            className="glass-strong relative w-full max-w-md rounded-3xl p-6 shadow-2xl sm:p-8"
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 300, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={onClose}
              aria-label="Close dialog"
              className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full text-slate-400 transition hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>

            {status === "sent" ? (
              <div className="flex flex-col items-center gap-4 py-8 text-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-pern-primary/15 text-pern-primary">
                  <Check className="h-7 w-7" />
                </span>
                <div>
                  <div className="text-lg font-semibold text-white">
                    Request drafted
                  </div>
                  <p className="mt-1 text-sm text-slate-400">
                    Your email client opened with the details pre-filled. Send it
                    and we'll respond within 24h.
                  </p>
                </div>
                <Button size="md" onClick={onClose}>
                  Done
                </Button>
              </div>
            ) : (
              <form onSubmit={submit}>
                <div className="mb-6">
                  <div className="eyebrow mb-1 text-[11px] text-pern-primary/80">
                    Pilot Deployment
                  </div>
                  <h3 className="text-xl font-semibold text-white">
                    Deploy PERN at your site
                  </h3>
                  <p className="mt-1 text-sm text-slate-400">
                    Tell us where you operate. A STEM Gharbiya team member will
                    reach out within 24 hours.
                  </p>
                </div>

                <div className="space-y-4">
                  <div>
                    <label
                      htmlFor={nameId}
                      className="mb-1.5 block text-xs font-medium text-slate-300"
                    >
                      Name
                    </label>
                    <input
                      id={nameId}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      placeholder="Your name"
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-pern-primary/60 focus:outline-none"
                    />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label
                        htmlFor={orgId}
                        className="mb-1.5 block text-xs font-medium text-slate-300"
                      >
                        Organization
                      </label>
                      <input
                        id={orgId}
                        value={org}
                        onChange={(e) => setOrg(e.target.value)}
                        required
                        placeholder="Organization name"
                        className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-pern-primary/60 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor={orgTypeId}
                        className="mb-1.5 block text-xs font-medium text-slate-300"
                      >
                        Sector
                      </label>
                      <select
                        id={orgTypeId}
                        value={orgType}
                        onChange={(e) => setOrgType(e.target.value)}
                        className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-2.5 text-sm text-white focus:border-pern-primary/60 focus:outline-none"
                      >
                        <option value="">Select…</option>
                        {ORGS.map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor={messageId}
                      className="mb-1.5 block text-xs font-medium text-slate-300"
                    >
                      What do you want to monitor?{" "}
                      <span className="text-slate-500">(optional)</span>
                    </label>
                    <textarea
                      id={messageId}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      rows={3}
                      placeholder="e.g. PM2.5, water quality near the canal…"
                      className="w-full resize-none rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-pern-primary/60 focus:outline-none"
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  className="mt-6 w-full"
                  disabled={status === "sending"}
                >
                  {status === "sending" ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Preparing…
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      Submit Request
                    </>
                  )}
                </Button>
                <p
                  className={cn(
                    "mt-3 text-center text-[11px] text-slate-500"
                  )}
                >
                  Opens your email client with the request pre-filled — no data
                  stored.
                </p>
              </form>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
