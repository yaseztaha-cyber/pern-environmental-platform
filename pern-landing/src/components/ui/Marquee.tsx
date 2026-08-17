const ITEMS = [
  "24/7 Real-time Monitoring",
  "MQTT Telemetry",
  "AI Pollution Forecasting",
  "WHO / EPA / NSF Compliant",
  "Sub-2s Alert Latency",
  "Multi-Organization RBAC",
  "Nile Delta Deployments",
  "Open REST API",
  "Cloud + On-Prem",
];

export function Marquee() {
  const track = [...ITEMS, ...ITEMS];

  return (
    <div className="relative overflow-hidden border-y border-white/5 bg-white/[0.02] py-3 [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-pern-primary/25 to-transparent" />
      <div className="marquee-track flex items-center">
        {track.map((item, i) => (
          <span
            key={i}
            className="eyebrow flex items-center whitespace-nowrap text-[11px] text-slate-400"
          >
            <span className="px-6">{item}</span>
            <span
              className={
                i % 2
                  ? "text-[10px] text-pern-secondary"
                  : "text-[10px] text-pern-primary"
              }
            >
              ✦
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
