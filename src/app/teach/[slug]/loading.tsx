export default function TeachLoading() {
  return (
    <div className="flex h-screen bg-teach-bg items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 border-2 border-teach-accent-bright/30 border-t-teach-accent-bright rounded-full animate-spin" />
        <span className="font-mono text-[11px] text-teach-text-muted uppercase tracking-wider">
          Loading training module…
        </span>
      </div>
    </div>
  );
}
