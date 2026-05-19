import { cn } from "@/lib/utils";
import React from "react";

export function GlassCard({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "bg-white/40 backdrop-blur-[16px] border border-white/60 shadow-[0_8px_32px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.8)] rounded-2xl relative overflow-hidden",
        className
      )}
      {...props}
    >
      {/* Liquid reflection overlay */}
      <div className="absolute inset-0 bg-gradient-to-tr from-white/10 via-transparent to-transparent pointer-events-none" />
      
      {/* Children are now direct flex items if className includes flex */}
      {children}
    </div>
  );
}
