export default function ModuleLoading() {
  return (
    <div className="flex h-screen bg-surface-2 items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 border-2 border-[#D20A2E]/30 border-t-[#D20A2E] rounded-full animate-spin" />
        <span className="font-mono text-[11px] text-ink-muted uppercase tracking-wider">
          Loading module…
        </span>
      </div>
    </div>
  );
}
