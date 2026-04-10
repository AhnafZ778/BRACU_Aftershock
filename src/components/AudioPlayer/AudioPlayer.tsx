export function AudioPlayer() {
  return (
    <div className="flex items-center gap-3 bg-ops-bg rounded-lg p-3 border border-ops-border">
      <button className="w-10 h-10 rounded-full bg-accent-primary/20 text-accent-primary flex items-center justify-center text-lg hover:bg-accent-primary/30 transition-colors shrink-0">
        ▶
      </button>
      <div className="flex-1">
        <p className="text-xs text-ops-text-muted">Bangla Audio Alert</p>
        <div className="h-2 bg-ops-border rounded-full mt-1">
          <div className="h-full w-0 bg-accent-primary rounded-full" />
        </div>
      </div>
      <span className="text-[10px] text-ops-text-muted font-mono">0:00</span>
    </div>
  );
}
