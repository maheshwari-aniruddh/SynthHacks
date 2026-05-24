"use client";

import { useEffect } from "react";

export default function TeachError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Teach page error:", error);
  }, [error]);

  return (
    <div className="flex h-screen bg-teach-bg items-center justify-center">
      <div className="flex flex-col items-center gap-6 max-w-sm text-center px-6">
        <div className="w-16 h-16 rounded-full bg-teach-bg-elevated flex items-center justify-center border border-teach-border">
          <span className="text-2xl">⚠</span>
        </div>
        <div>
          <h2 className="font-bold text-xl text-teach-text-primary mb-2">
            Something went wrong
          </h2>
          <p className="text-sm text-teach-text-secondary leading-relaxed">
            The training module could not be loaded. This may be a transient error — try again.
          </p>
        </div>
        <button
          onClick={reset}
          className="px-6 py-2.5 bg-teach-accent-bright text-teach-bg rounded-xl font-bold text-sm hover:opacity-90 transition-opacity"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
