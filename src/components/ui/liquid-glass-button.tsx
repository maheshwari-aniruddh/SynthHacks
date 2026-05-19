"use client";

import { cn } from "@/lib/utils";
import { motion, useMotionValue, useSpring, HTMLMotionProps } from "motion/react";
import React, { useCallback } from "react";

interface LiquidButtonProps extends HTMLMotionProps<"button"> {
  variant?: "default" | "cherry" | "ghost";
  children?: React.ReactNode;
}

export function LiquidButton({ className, children, variant = "default", ...props }: LiquidButtonProps) {
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const springConfig = { stiffness: 150, damping: 20 };
  const dx = useSpring(mouseX, springConfig);
  const dy = useSpring(mouseY, springConfig);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    mouseX.set(e.clientX - rect.left);
    mouseY.set(e.clientY - rect.top);
  }, [mouseX, mouseY]);

  const handleMouseLeave = useCallback(() => {
    mouseX.set(0);
    mouseY.set(0);
  }, [mouseX, mouseY]);

  const variants = {
    default: "bg-white/40 border-white/60 text-ink hover:bg-white/60 shadow-[0_2px_10px_-3px_rgba(0,0,0,0.07)]",
    cherry: "bg-gradient-to-br from-cherry to-[#D65050] border-white/20 text-white shadow-[0_4px_20px_-4px_rgba(201,64,64,0.4)] hover:shadow-[0_6px_25px_-4px_rgba(201,64,64,0.5)]",
    ghost: "bg-transparent border-transparent text-ink-muted hover:bg-white/20 hover:border-white/40",
  };

  return (
    <motion.button
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      whileHover={{ scale: 1.01, translateY: -1 }}
      whileTap={{ scale: 0.98 }}
      className={cn(
        "relative px-6 py-2.5 rounded-xl border backdrop-blur-md transition-all duration-300 font-semibold overflow-hidden group shadow-sm flex items-center justify-center gap-2 whitespace-nowrap",
        variants[variant],
        className
      )}
      {...props}
    >
      {/* Liquid Shine Effect */}
      <motion.div
        className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-500"
        style={{
          background: `radial-gradient(400px circle at ${dx}px ${dy}px, rgba(255,255,255,0.35), transparent 60%)`,
        }}
      />
      
      {/* Glossy Reflection */}
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/30 to-transparent pointer-events-none" />
      <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent pointer-events-none opacity-50" />
      
      <span className="relative z-10 flex items-center gap-2">
        {children}
      </span>
    </motion.button>
  );
}
