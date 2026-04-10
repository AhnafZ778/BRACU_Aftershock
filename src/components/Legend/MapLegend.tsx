import { useState, useMemo } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useEmployeeStore } from '../../store/useEmployeeStore';
import { 
  Route,
  Check,
  MapIcon,
  Hexagon,
  PanelLeftClose,
  PanelLeftOpen,
  Droplets,
  Building2,
  Trees,
  Waves,
  AlertTriangle,
  Loader2,
  Flame,
  Users,
} from 'lucide-react';
import type { TakeLayerDef } from '../../hooks/useTakeLayers';

// ─── Icon mapping for Take layer IDs ────────────────────────────────────
const TAKE_ICONS: Record<string, any> = {
  dhaka_waterways: Waves,
  dhaka_risk_waterways: AlertTriangle,
  dhaka_water: Droplets,
  dhaka_landuse: Trees,
  dhaka_buildings: Building2,
};

// ─── CheckboxItem ───────────────────────────────────────────────────────
function CheckboxItem({ 
  checked, 
  onChange, 
  label, 
  Icon, 
  colorClass,
  swatchColor,
  isExpanded = true 
}: { 
  checked: boolean; 
  onChange: (v: boolean) => void; 
  label: string; 
  Icon?: any; 
  colorClass?: string;
  swatchColor?: string;
  isExpanded?: boolean;
}) {
  const iconBaseClass = `${isExpanded ? 'w-4 h-4' : 'w-[18px] h-[18px]'} group-hover:text-zinc-300 transition-colors drop-shadow-md z-10`;
  const iconColorClass = checked
    ? (swatchColor ? '' : (colorClass || 'text-zinc-200'))
    : 'text-zinc-500';

  return (
    <label 
      className={`flex items-center ${
        isExpanded 
          ? 'gap-2.5 px-3 py-1.5 w-full' 
          : 'justify-center w-[38px] h-[38px] mb-0.5'
      } cursor-pointer group rounded-xl transition-all duration-300 relative ${
        !isExpanded && checked ? 'bg-white/10 shadow-[inset_0_1px_4px_rgba(0,0,0,0.5)] border border-white/10' : 'hover:bg-white/5 border border-transparent'
      }`}
      title={label}
    >
      {isExpanded && (
        <div className={`relative flex items-center justify-center flex-shrink-0 w-4 h-4 rounded-[5px] border transition-all duration-300 ${checked ? 'bg-emerald-500/20 border-emerald-500/50' : 'bg-black/40 border-white/10 group-hover:border-white/20'}`}>
          <input 
            type="checkbox" 
            checked={checked} 
            onChange={(e) => onChange(e.target.checked)} 
            className="peer sr-only" 
          />
          <Check className="w-[10px] h-[10px] text-emerald-400 opacity-0 peer-checked:opacity-100 transition-opacity duration-300 drop-shadow-[0_0_8px_rgba(52,211,153,0.8)]" strokeWidth={3.5} />
        </div>
      )}
      
      {!isExpanded && (
        <input 
          type="checkbox" 
          checked={checked} 
          onChange={(e) => onChange(e.target.checked)} 
          className="peer sr-only" 
        />
      )}

      {Icon && (
        <div className="relative flex items-center justify-center">
          <Icon 
            className={`${iconBaseClass} ${iconColorClass}`.trim()}
            style={checked && swatchColor ? { color: swatchColor } : undefined}
          />
          {!isExpanded && checked && (
            <div 
              className="absolute inset-0 blur-[6px] opacity-40 rounded-full scale-125"
              style={swatchColor ? { backgroundColor: swatchColor } : undefined}
            />
          )}
        </div>
      )}

      {isExpanded && (
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className={`text-[12.5px] tracking-[0.01em] truncate transition-colors ${checked ? 'text-zinc-200 font-medium' : 'text-zinc-400 font-normal group-hover:text-zinc-300'}`}>
            {label}
          </span>
          {swatchColor && isExpanded && (
            <span 
              className="flex-shrink-0 w-2.5 h-2.5 rounded-full border border-white/10"
              style={{ backgroundColor: swatchColor }}
            />
          )}
        </div>
      )}
    </label>
  );
}

// ─── Divider ────────────────────────────────────────────────────────────
function Divider({ isExpanded }: { isExpanded: boolean }) {
  return <div className={`h-px bg-white/5 flex-shrink-0 ${isExpanded ? 'w-full my-2' : 'w-5 mx-auto my-2'}`} />;
}

// ─── Category Header ────────────────────────────────────────────────────
function CategoryHeader({ label, isExpanded }: { label: string; isExpanded: boolean }) {
  if (!isExpanded) return null;
  return (
    <div className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500 px-3 pt-2 pb-0.5">
      {label}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────
export function MapLegend({
  takeDefs = [],
  takeActiveIds = new Set<string>(),
  onTakeToggle,
  takeLoading = false,
}: {
  takeDefs?: TakeLayerDef[];
  takeActiveIds?: Set<string>;
  onTakeToggle?: (id: string) => void;
  takeLoading?: boolean;
}) {
  const { 
    showRoads, setShowRoads,
    showAllRoads, setShowAllRoads,
    showHoneycomb, setShowHoneycomb,
  } = useAppStore();

  const {
    showHeatmap, setShowHeatmap,
    showEmployees, setShowEmployees,
  } = useEmployeeStore();

  const [isExpanded, setIsExpanded] = useState(false);

  // Group Take layers by category
  const groupedTake = useMemo(() => {
    const map = new Map<string, TakeLayerDef[]>();
    for (const def of takeDefs) {
      if (!map.has(def.category)) map.set(def.category, []);
      map.get(def.category)!.push(def);
    }
    // Sort categories
    const sorted = [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
    return sorted;
  }, [takeDefs]);

  return (
    <div 
      className={`bg-zinc-950/70 backdrop-blur-2xl transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] border-y border-r border-white/10 shadow-[8px_0_32px_-8px_rgba(0,0,0,0.6)] overflow-y-auto overflow-x-hidden [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] select-none pointer-events-auto flex flex-col relative ${
        isExpanded 
          ? 'w-[240px] rounded-r-2xl p-4 h-fit max-h-[85vh]' 
          : 'w-14 rounded-r-2xl py-4 flex flex-col items-center h-fit max-h-[85vh]'
      }`}
    >
      
      {/* Toggle Button */}
      <button 
        onClick={() => setIsExpanded(!isExpanded)}
        className={`flex flex-shrink-0 items-center justify-center rounded-full bg-white/5 hover:bg-white/10 border border-white/5 text-zinc-400 hover:text-white transition-all z-10 outline-none shadow-md ${
          isExpanded ? 'absolute top-3.5 right-3.5 w-[26px] h-[26px]' : 'w-9 h-9 mb-4'
        }`}
        title={isExpanded ? "Collapse Panel" : "Expand Panel"}
      >
        {isExpanded ? <PanelLeftClose className="w-3.5 h-3.5" /> : <PanelLeftOpen className="w-[18px] h-[18px]" />}
      </button>

      {isExpanded && <h3 className="text-zinc-100 font-medium text-[13px] tracking-wide mb-3 px-1.5">Map Layers</h3>}

      <div className={`flex flex-col ${isExpanded ? 'space-y-0' : 'w-full items-center mb-0'}`}>
        
        {/* ── Employee Coverage (heatmap + markers) ── */}
        <CategoryHeader label="Employee Coverage" isExpanded={isExpanded} />
        <CheckboxItem 
          isExpanded={isExpanded}
          checked={showHeatmap} 
          onChange={setShowHeatmap} 
          label="Coverage Heatmap" 
          Icon={Flame}
          colorClass="text-orange-400"
        />
        <CheckboxItem 
          isExpanded={isExpanded}
          checked={showEmployees} 
          onChange={setShowEmployees} 
          label="Field Employees" 
          Icon={Users}
          colorClass="text-emerald-400"
        />

        <Divider isExpanded={isExpanded} />

        {/* ── Road Layers (from existing store) ── */}
        <CategoryHeader label="Roads" isExpanded={isExpanded} />
        <CheckboxItem 
          isExpanded={isExpanded}
          checked={showRoads} 
          onChange={setShowRoads} 
          label="Major Roads" 
          Icon={Route}
          colorClass="text-zinc-300"
        />
        <CheckboxItem 
          isExpanded={isExpanded}
          checked={showAllRoads} 
          onChange={setShowAllRoads} 
          label="All Roads" 
          Icon={MapIcon}
          colorClass="text-cyan-400"
        />

        <Divider isExpanded={isExpanded} />

        {/* ── Risk Overlay ── */}
        <CategoryHeader label="Risk Overlay" isExpanded={isExpanded} />
        <CheckboxItem
          isExpanded={isExpanded}
          checked={showHoneycomb}
          onChange={setShowHoneycomb}
          label="Honeycomb Zones"
          Icon={Hexagon}
          colorClass="text-rose-400"
        />

        {/* ── Take Layers (from GeoPackage server) ── */}
        {takeLoading && (
          <>
            <Divider isExpanded={isExpanded} />
            {isExpanded ? (
              <div className="flex items-center gap-2 px-3 py-2 text-zinc-500 text-xs">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Loading layers...
              </div>
            ) : (
              <Loader2 className="w-4 h-4 text-zinc-500 animate-spin" />
            )}
          </>
        )}

        {!takeLoading && groupedTake.map(([category, layers]) => (
          <div key={category}>
            <Divider isExpanded={isExpanded} />
            <CategoryHeader label={category} isExpanded={isExpanded} />
            {layers.map((def) => (
              <CheckboxItem
                key={def.id}
                isExpanded={isExpanded}
                checked={takeActiveIds.has(def.id)}
                onChange={() => onTakeToggle?.(def.id)}
                label={def.label}
                Icon={TAKE_ICONS[def.id] || Droplets}
                swatchColor={def.color}
              />
            ))}
          </div>
        ))}
      </div>

    </div>
  );
}
