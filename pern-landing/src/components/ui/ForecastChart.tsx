import { useId, useMemo } from "react";
import {
  Area,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { buildForecast } from "../../data/content";

function ForecastTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ name?: string; value?: number; color?: string; payload?: { hour: string } }>;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload.find((p) => p.name === "historical" || p.name === "predicted");
  const isHistory = payload.some((p) => p.name === "historical" && p.value != null);
  const val = row?.value;
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/90 px-3 py-2 text-xs backdrop-blur">
      <div className="mb-1 font-mono text-slate-400">{row?.payload?.hour}</div>
      {val != null && (
        <div className="font-semibold text-white">
          {isHistory ? "Observed" : "Predicted"}: {Math.round(val)} µg/m³
        </div>
      )}
      <div className="text-slate-500">PM2.5 · WHO AQG band</div>
    </div>
  );
}

export function ForecastChart() {
  const data = useMemo(() => buildForecast(), []);
  const uid = useId().replace(/[:]/g, "");
  const hist = `hist-${uid}`;
  const pred = `pred-${uid}`;
  const band = `band-${uid}`;

  return (
    <div className="h-[260px] w-full sm:h-[300px]">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
          <defs>
            <linearGradient id={hist} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#00D4AA" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#00D4AA" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id={pred} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#A78BFA" stopOpacity={0} />
              <stop offset="100%" stopColor="#A78BFA" stopOpacity={0.5} />
            </linearGradient>
            <linearGradient id={band} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#A78BFA" stopOpacity={0} />
              <stop offset="100%" stopColor="#A78BFA" stopOpacity={0.18} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="hour"
            tick={{ fill: "#475569", fontSize: 10, fontFamily: "JetBrains Mono, monospace" }}
            axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
            tickLine={false}
            interval={3}
          />
          <YAxis
            tick={{ fill: "#475569", fontSize: 10, fontFamily: "JetBrains Mono, monospace" }}
            axisLine={false}
            tickLine={false}
            width={40}
          />
          <Tooltip
            content={<ForecastTooltip />}
            cursor={{ stroke: "rgba(255,255,255,0.15)", strokeDasharray: "4 4" }}
          />
          <ReferenceArea
            x1="14:00"
            x2="23:00"
            fill="rgba(167,139,250,0.04)"
            stroke="none"
          />
          <ReferenceLine
            y={35}
            stroke="#F59E0B"
            strokeDasharray="4 4"
            strokeOpacity={0.35}
            label={{
              value: "WHO Safe 35",
              position: "insideTopLeft",
              fill: "#F59E0B",
              fontSize: 9,
              fontFamily: "JetBrains Mono, monospace",
            }}
          />
          <ReferenceLine
            y={90}
            stroke="#EF4444"
            strokeDasharray="4 4"
            strokeOpacity={0.35}
            label={{
              value: "Critical 90",
              position: "insideTopRight",
              fill: "#EF4444",
              fontSize: 9,
              fontFamily: "JetBrains Mono, monospace",
            }}
          />
          <ReferenceLine
            x="14:00"
            stroke="#E2E8F0"
            strokeOpacity={0.4}
            strokeDasharray="6 3"
            label={{
              value: "NOW",
              position: "insideTopLeft",
              fill: "#E2E8F0",
              fontSize: 10,
              fontWeight: 700,
              fontFamily: "JetBrains Mono, monospace",
            }}
          />
          <Area
            type="monotone"
            dataKey="bandHi"
            stroke="none"
            fill={`url(#${band})`}
            isAnimationActive
            animationDuration={1400}
          />
          <Area
            type="monotone"
            dataKey="bandLo"
            stroke="none"
            fill={`url(#${band})`}
            isAnimationActive
            animationDuration={1400}
          />
          <Line
            type="monotone"
            dataKey="historical"
            name="historical"
            stroke="#00D4AA"
            strokeWidth={2.5}
            dot={false}
            strokeLinecap="round"
            isAnimationActive
            animationDuration={1400}
          />
          <Line
            type="monotone"
            dataKey="predicted"
            name="predicted"
            stroke="#A78BFA"
            strokeWidth={2.5}
            strokeDasharray="7 5"
            dot={false}
            strokeLinecap="round"
            isAnimationActive
            animationDuration={1400}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
