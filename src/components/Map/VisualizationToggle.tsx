import { useAppStore } from '../../store/useAppStore';
import type { CycloneVisMode } from '../../store/useAppStore';

/**
 * Floating toggle for cyclone visualization intensity.
 * Full     = IR-satellite shader with full bloom + atmosphere (faithful to cyclone.html)
 * Reduced  = Dimmed shader, no bloom, storm still visible but honeycombs readable
 * Off      = Storm shader completely hidden — only hex grid visible
 */
export function VisualizationToggle() {
  const cycloneVisMode = useAppStore((s) => s.cycloneVisMode);
  const setCycloneVisMode = useAppStore((s) => s.setCycloneVisMode);

  const modes: { key: CycloneVisMode; label: string; icon: string; title: string }[] = [
    { key: 'full', label: 'Full', icon: '🌀', title: 'Full IR-satellite shader with bloom' },
    { key: 'reduced', label: 'Reduced', icon: '◐', title: 'Dimmed shader — honeycombs readable' },
    { key: 'off', label: 'Off', icon: '○', title: 'Storm shader hidden — hex grid only' },
  ];

  return (
    <div className="flex bg-zinc-900/60 backdrop-blur-md rounded-lg overflow-hidden border border-white/10 w-full mb-2">
      {modes.map((m) => {
        const active = cycloneVisMode === m.key;
        return (
          <button
            key={m.key}
            onClick={() => setCycloneVisMode(m.key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[11px] font-medium transition-all ${
              active 
                ? 'bg-blue-500/30 text-white' 
                : 'text-white/50 hover:bg-white/5 hover:text-white/80'
            }`}
            title={m.title}
          >
            <span className="text-[13px]">{m.icon}</span>
            {m.label}
          </button>
        );
      })}
    </div>
  );
}
