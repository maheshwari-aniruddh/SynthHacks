"use client";

import React, { useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface FlowHoverButtonProps {
  icon?: LucideIcon;
  variant?: "cherry" | "butter" | "neutral";
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  disabled?: boolean;
}

export function FlowHoverButton({
  icon: Icon,
  variant = "cherry",
  children,
  className,
  onClick,
  disabled,
}: FlowHoverButtonProps) {
  const [isHovered, setIsHovered] = useState(false);

  const variants = {
    cherry: {
      bg: "bg-white/40",
      hoverBg: "bg-cherry",
      text: "text-ink",
      hoverText: "text-white",
      border: "border-white/60",
      glow: "shadow-[0_0_20px_rgba(25,25,112,0.2)]",
    },
    butter: {
      bg: "bg-white/40",
      hoverBg: "bg-butter",
      text: "text-ink",
      hoverText: "text-white",
      border: "border-white/60",
      glow: "shadow-[0_0_20px_rgba(232,184,75,0.2)]",
    },
    neutral: {
      bg: "bg-white/40",
      hoverBg: "bg-ink",
      text: "text-ink",
      hoverText: "text-white",
      border: "border-white/60",
      glow: "shadow-[0_0_20px_rgba(0,0,0,0.1)]",
    },
  };

  const v = variants[variant];

  return (
    <motion.button
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      whileTap={{ scale: 0.98 }}
      className={cn(
        "group relative flex items-center justify-center gap-2 overflow-hidden rounded-xl border px-6 py-3 transition-all duration-500 backdrop-blur-md",
        v.bg,
        v.border,
        v.text,
        isHovered && v.glow,
        className
      )}
      onClick={onClick}
      disabled={disabled}
    >
      {/* Background Flow Effect */}
      <div
        className={cn(
          "absolute inset-0 z-0 scale-0 rounded-full transition-transform duration-700 ease-in-out group-hover:scale-[2.5]",
          v.hoverBg
        )}
      />

      {/* Content */}
      <span className={cn("relative z-10 flex items-center gap-2 transition-colors duration-300", isHovered && v.hoverText)}>
        {Icon && <Icon className="h-4 w-4" strokeWidth={2.5} />}
        <span className="font-semibold tracking-tight">{children}</span>
      </span>
    </motion.button>
  );
}
