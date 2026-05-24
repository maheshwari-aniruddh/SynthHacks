"use client";

import { useEffect } from "react";

export default function ModuleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Module page error:", error);
  }, [error]);

  return (
    <div className="flex h-screen bg-surface-2 items-center justify-center">
      <div className="flex flex-col items-center gap-6 max-w-sm text-center px-6">
        <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center border border-red-200">
          <span className="text-2xl">⚠</span>
        </div>
        <div>
          <h2 className="font-display text-xl font-semibold text-ink mb-2">
            Something went wrong
          </h2>
          <p className="text-sm text-ink-muted leading-relaxed">
            The module could not be loaded. This may be a transient error — try again.
          </p>
        </div>
        <button
          onClick={reset}
          className="px-6 py-2.5 bg-[#D20A2E] text-white rounded-xl font-medium text-sm hover:bg-[#B20A27] transition-colors"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
