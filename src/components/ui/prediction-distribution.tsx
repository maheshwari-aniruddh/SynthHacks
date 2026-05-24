"use client";

import { cn } from "@/lib/utils";

type DistributionItem = { label: string; probability: number };

interface PredictionDistributionProps {
  distribution: DistributionItem[];
}

export function PredictionDistribution({ distribution }: PredictionDistributionProps) {
  if (!distribution?.length) return null;
  const sorted = [...distribution].sort((a, b) => b.probability - a.probability);
  const top = sorted[0].label;

  return (
    <div className="space-y-4">
      {sorted.map((p) => {
        const pct = Math.round(p.probability * 100);
        const isTop = p.label === top;
        const label = p.label.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
        return (
          <div key={p.label} className="space-y-1.5 group text-left">
            <div className="flex justify-between items-center text-xs">
              <span className={isTop ? "font-bold text-ink" : "text-ink-muted group-hover:text-ink transition-colors duration-300"}>
                {label}
              </span>
              <span className={isTop ? "text-[#D20A2E] font-mono font-bold" : "text-ink-muted font-mono"}>
                {pct}%
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-surface-3 border border-surface-4/40 overflow-hidden relative shadow-inner">
              <div
                className={isTop ? "h-full rounded-full transition-all duration-1000 ease-out shadow-[0_0_8px_rgba(210,10,46,0.35)]" : "h-full rounded-full transition-all duration-1000 ease-out"}
                style={{
                  width: `${pct}%`,
                  backgroundColor: isTop ? "#D20A2E" : "#E8A0AA",
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
