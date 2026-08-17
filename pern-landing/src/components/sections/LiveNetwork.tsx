import { Activity, Radio } from "lucide-react";
import { LiveDataGlobe } from "../three/LiveDataGlobe";
import { liveNetworkNodes } from "../../data/content";
import { GlassCard } from "../ui/GlassCard";
import { SectionHeader } from "../ui/SectionHeader";
import { SectionReveal } from "../ui/SectionReveal";

const bandColor: Record<string, string> = {
  safe: "#00D4AA",
  warning: "#F59E0B",
  critical: "#DC2626",
};

const bandBg: Record<string, string> = {
  safe: "rgba(0,212,170,0.08)",
  warning: "rgba(245,158,11,0.08)",
  critical: "rgba(220,38,38,0.08)",
};

export function LiveNetwork() {
  const avgPm25 =
    liveNetworkNodes.reduce((s, n) => s + n.pm25, 0) / liveNetworkNodes.length;
  const warningCount = liveNetworkNodes.filter(
    (n) => n.band === "warning" || n.band === "critical"
  ).length;

  return (
    <section id="live-network" className="section-pad relative overflow-hidden">
      <div className="mx-auto max-w-7xl">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <SectionReveal>
            <SectionHeader
              number="09"
              eyebrow={
                <>
                  <Activity className="h-3.5 w-3.5 text-pern-secondary" />
                  Live Data Network
                </>
              }
              title="Real-Time Sensor Mesh Across Egypt"
              description="Every ESP32 station streams telemetry to the cloud over MQTT. The globe below shows live node positions, inter-node data arcs, and per-city PM2.5 readings — drag to explore, watch the data packets flow."
            />

            <div className="mb-8 flex flex-wrap gap-3">
              <GlassCard className="flex items-center gap-3 px-5 py-3">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#00D4AA] shadow-[0_0_10px_rgba(0,212,170,0.8)]" />
                <div>
                  <div className="text-xs text-slate-400">Avg PM2.5</div>
                  <div className="text-lg font-bold text-white">
                    {avgPm25.toFixed(0)}{" "}
                    <span className="text-xs font-normal text-slate-500">
                      µg/m³
                    </span>
                  </div>
                </div>
              </GlassCard>
              <GlassCard className="flex items-center gap-3 px-5 py-3">
                <Radio className="h-4 w-4 text-[#F59E0B]" />
                <div>
                  <div className="text-xs text-slate-400">Active Nodes</div>
                  <div className="text-lg font-bold text-white">
                    {liveNetworkNodes.length}
                  </div>
                </div>
              </GlassCard>
              <GlassCard className="flex items-center gap-3 px-5 py-3">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ background: "#F59E0B" }}
                />
                <div>
                  <div className="text-xs text-slate-400">Warnings</div>
                  <div className="text-lg font-bold text-white">
                    {warningCount}
                  </div>
                </div>
              </GlassCard>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {liveNetworkNodes.map((n) => (
                <div
                  key={n.name}
                  className="rounded-2xl border px-3 py-2.5 text-center transition hover:-translate-y-0.5"
                  style={{
                    borderColor: `${bandColor[n.band]}33`,
                    background: bandBg[n.band],
                  }}
                >
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    {n.name}
                  </div>
                  <div
                    className="mt-1 text-base font-bold"
                    style={{ color: bandColor[n.band] }}
                  >
                    {n.pm25}
                  </div>
                  <div className="font-mono text-[9px] text-slate-600">
                    µg/m³
                  </div>
                </div>
              ))}
            </div>
          </SectionReveal>

          <SectionReveal delay={0.1}>
            <GlassCard glow className="overflow-hidden p-2">
              <LiveDataGlobe />
            </GlassCard>
          </SectionReveal>
        </div>
      </div>
    </section>
  );
}
