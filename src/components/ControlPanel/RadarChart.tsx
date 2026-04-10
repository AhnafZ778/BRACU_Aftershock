import React, { useState } from 'react';

interface RadarData {
  label: string;
  value: number; // 0 to 1
}

interface RadarChartProps {
  data: RadarData[];
  size?: number;
}

const RadarChart: React.FC<RadarChartProps> = ({ data, size = 200 }) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const center = size / 2;
  const radius = (size / 2) * 0.8;
  const angleStep = (Math.PI * 2) / data.length;

  // Sanitize data: clamp NaN/undefined/Infinity to 0, and keep values in [0,1]
  const safeData = data.map(d => ({
    ...d,
    value: Number.isFinite(d.value) ? Math.max(0, Math.min(1, d.value)) : 0,
  }));

  // Generate points for the data polygon
  const points = safeData.map((d, i) => {
    const angle = i * angleStep - Math.PI / 2;
    const r = d.value * radius;
    return {
      x: center + r * Math.cos(angle),
      y: center + r * Math.sin(angle),
    };
  });

  const pointsString = points.map(p => `${p.x},${p.y}`).join(' ');

  // Generate grid circles
  const gridLevels = [0.2, 0.4, 0.6, 0.8, 1];

  return (
    <div className="flex flex-col items-center justify-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="overflow-visible">
        {/* Grid Lines (Circles) */}
        {gridLevels.map((lvl, i) => (
          <circle
            key={`grid-${i}`}
            cx={center}
            cy={center}
            r={lvl * radius}
            fill="none"
            stroke="white"
            strokeWidth="0.5"
            strokeOpacity="0.1"
          />
        ))}

        {/* Axis Lines */}
        {safeData.map((_, i) => {
          const angle = i * angleStep - Math.PI / 2;
          const x2 = center + radius * Math.cos(angle);
          const y2 = center + radius * Math.sin(angle);
          return (
            <line
              key={`axis-${i}`}
              x1={center}
              y1={center}
              x2={x2}
              y2={y2}
              stroke="white"
              strokeWidth="0.5"
              strokeOpacity="0.1"
            />
          );
        })}

        {/* Data Polygon */}
        <polygon
          points={pointsString}
          fill="rgba(239, 68, 68, 0.2)"
          stroke="rgba(239, 68, 68, 0.8)"
          strokeWidth="2"
          strokeLinejoin="round"
          className="drop-shadow-[0_0_8px_rgba(239,68,68,0.4)]"
        />

        {/* Axis Labels */}
        {safeData.map((d, i) => {
          const angle = i * angleStep - Math.PI / 2;
          const labelR = radius + 20;
          const lx = center + labelR * Math.cos(angle);
          const ly = center + labelR * Math.sin(angle);
          
          return (
            <text
              key={`label-${i}`}
              x={lx}
              y={ly}
              textAnchor="middle"
              dominantBaseline="middle"
              className="fill-slate-500 text-[8px] font-bold uppercase tracking-tighter"
            >
              {d.label}
            </text>
          );
        })}

        {/* Data Points with hover interaction */}
        {points.map((p, i) => (
          <g key={`point-${i}`}>
            {/* Invisible larger hit area for hover */}
            <circle
              cx={p.x}
              cy={p.y}
              r="10"
              fill="transparent"
              className="cursor-pointer"
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex(null)}
            />
            {/* Visible point */}
            <circle
              cx={p.x}
              cy={p.y}
              r={hoveredIndex === i ? 4 : 2}
              fill="#ef4444"
              className="drop-shadow-[0_0_4px_#ef4444] transition-all duration-150"
            />
          </g>
        ))}

        {/* Hover Tooltip */}
        {hoveredIndex !== null && (() => {
          const d = safeData[hoveredIndex];
          const p = points[hoveredIndex];
          const tooltipX = p.x;
          const tooltipY = p.y - 16;
          return (
            <g>
              <rect
                x={tooltipX - 32}
                y={tooltipY - 12}
                width={64}
                height={22}
                rx={6}
                fill="rgba(15, 23, 42, 0.95)"
                stroke="rgba(239, 68, 68, 0.4)"
                strokeWidth={1}
              />
              <text
                x={tooltipX}
                y={tooltipY}
                textAnchor="middle"
                dominantBaseline="middle"
                className="fill-red-400 text-[9px] font-bold"
              >
                {(d.value * 100).toFixed(0)}%
              </text>
            </g>
          );
        })()}
      </svg>
    </div>
  );
};

export default RadarChart;
