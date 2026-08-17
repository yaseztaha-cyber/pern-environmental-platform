import { memo, useId } from "react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
} from "recharts";

type Props = {
  data: number[];
  color?: string;
  height?: number;
};

export const Sparkline = memo(function Sparkline({
  data,
  color = "#00D4AA",
  height = 40,
}: Props) {
  const chartData = data.map((v, i) => ({ i, v }));
  const uid = useId().replace(/[:]/g, "");
  const id = `spark-${uid}-${color.replace("#", "")}`;

  return (
    <div className="sparkline-wrap h-full w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.45} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={1.5}
            fill={`url(#${id})`}
            isAnimationActive
            animationDuration={900}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
});
