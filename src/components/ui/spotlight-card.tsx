"use client";

import React, { useRef, useState, useCallback } from "react";
import { cn } from "@/lib/utils";

interface SpotlightCardProps extends React.HTMLAttributes<HTMLDivElement> {
  glowColor?: "cherry" | "butter" | "neutral" | "midnight" | "diag-primary" | "teach-accent-bright";
  customSize?: string;
}

export function SpotlightCard({
  glowColor = "neutral",
  customSize,
  className,
  children,
  ...props
}: SpotlightCardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [opacity, setOpacity] = useState(0);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    containerRef.current.style.setProperty("--mouse-x", `${e.clientX - rect.left}px`);
    containerRef.current.style.setProperty("--mouse-y", `${e.clientY - rect.top}px`);
  }, []);

  const handleMouseEnter = () => setOpacity(1);
  const handleMouseLeave = () => setOpacity(0);

  const colors = {
    cherry: "rgba(210, 10, 46, 0.12)",
    midnight: "rgba(25, 25, 112, 0.12)",
    butter: "rgba(181, 101, 10, 0.12)",
    neutral: "rgba(255, 255, 255, 0.4)",
    "diag-primary": "rgba(210, 10, 46, 0.12)",
    "teach-accent-bright": "rgba(56, 189, 248, 0.12)",
  };

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={cn(
        "relative overflow-hidden rounded-2xl border border-white/60 bg-white/40 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.8)]",
        className
      )}
      style={{
        width: customSize ? customSize.split(" ")[0] : undefined,
        height: customSize ? customSize.split(" ")[1] : undefined,
      }}
      {...props}
    >
      {/* Spotlight Glow — uses CSS custom properties for position */}
      <div
        className="pointer-events-none absolute -inset-px transition-opacity duration-500"
        style={{
          opacity,
          background: `radial-gradient(600px circle at var(--mouse-x, 50%) var(--mouse-y, 50%), ${colors[glowColor]}, transparent 40%)`,
        }}
      />

      {/* Surface reflection */}
      <div className="absolute inset-0 bg-gradient-to-tr from-white/10 via-transparent to-transparent pointer-events-none" />

      {/* Content */}
      <div className="relative z-10 h-full w-full">{children}</div>
    </div>
  );
}

export { SpotlightCard as GlowCard };
