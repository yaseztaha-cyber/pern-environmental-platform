import { motion } from "framer-motion";
import { Activity, BarChart3, BrainCircuit, TrendingUp } from "lucide-react";
import { aiMetrics, featureImportance } from "../../data/content";
import { ForecastChart } from "./ForecastChart";
import { GlassCard } from "./GlassCard";

export function PredictionPanel() {
  return (
    <GlassCard strong className="relative overflow-hidden p-5 sm:p-7">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(167,139,250,0.14), transparent 70%)",
        }}
      />
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-pern-primary/15">
          <TrendingUp className="h-4.5 w-4.5 text-pern-primary" />
        </span>
        <div>
          <div className="text-sm font-semibold text-white">
            Prediction Engine — 24h PM2.5 Forecast
          </div>
          <div className="text-xs text-slate-400">
            Random Forest regression · retrained daily · confidence band ±
          </div>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {aiMetrics.map((m, i) => (
          <motion.div
            key={m.label}
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.07 }}
            className="rounded-2xl border border-white/10 bg-white/[0.03] p-3"
          >
            <div className="text-[10px] uppercase tracking-wider text-slate-500">
              {m.label}
            </div>
            <div className="mt-1 font-mono text-lg font-semibold text-white">
              {m.value}
            </div>
            <div className="text-[11px] text-slate-400">{m.note}</div>
          </motion.div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div>
          <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-wider text-slate-500">
            <Activity className="h-3.5 w-3.5 text-pern-secondary" />
            Forecast trace
          </div>
          <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-3">
            <ForecastChart />
          </div>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-400">
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-5 rounded bg-emerald-400" /> Observed
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-5 rounded bg-[repeating-linear-gradient(90deg,#A78BFA_0_5px,transparent_5px_8px)]" />
              Predicted
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-5 rounded bg-violet-400/25" /> Confidence band
            </span>
          </div>
        </div>

        <div>
          <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-wider text-slate-500">
            <BarChart3 className="h-3.5 w-3.5 text-pern-secondary" />
            Feature importance
          </div>
          <div className="space-y-3">
            {featureImportance.map((f, i) => (
              <div key={f.feature}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-slate-300">{f.feature}</span>
                  <span className="font-mono text-slate-500">{f.value}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
                  <motion.div
                    initial={{ width: 0 }}
                    whileInView={{ width: `${f.value}%` }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.08, duration: 0.9, ease: "easeOut" }}
                    className="h-full rounded-full"
                    style={{
                      background: `linear-gradient(90deg, ${f.color}66, ${f.color})`,
                      boxShadow: `0 0 12px ${f.color}66`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-5 flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-xs text-slate-400">
            <BrainCircuit className="h-4 w-4 shrink-0 text-pern-primary" />
            Explains which inputs drive each risk decision, so alerts are never a
            black box.
          </div>
        </div>
      </div>
    </GlassCard>
  );
}
