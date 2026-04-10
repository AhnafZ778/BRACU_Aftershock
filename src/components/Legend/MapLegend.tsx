import { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { 
  Route,
  Check,
  MapIcon,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';

function CheckboxItem({ 
  checked, 
  onChange, 
  label, 
  Icon, 
  colorClass, 
  isExpanded = true 
}: { 
  checked: boolean; 
  onChange: (v: boolean) => void; 
  label: string; 
  Icon?: any; 
  colorClass?: string;
  isExpanded?: boolean;
}) {
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
          <Icon className={`${isExpanded ? 'w-4 h-4' : 'w-[18px] h-[18px]'} ${checked ? (colorClass || 'text-zinc-200') : 'text-zinc-500'} group-hover:text-zinc-300 transition-colors drop-shadow-md z-10`} />
          {!isExpanded && checked && (
            <div className={`absolute inset-0 blur-[6px] opacity-40 rounded-full scale-125 ${colorClass && colorClass.includes('text-') ? colorClass.replace('text-', 'bg-') : 'bg-white'}`} />
          )}
        </div>
      )}

      {isExpanded && (
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className={`text-[12.5px] tracking-[0.01em] truncate transition-colors ${checked ? 'text-zinc-200 font-medium' : 'text-zinc-400 font-normal group-hover:text-zinc-300'}`}>
            {label}
          </span>
        </div>
      )}
    </label>
  );
}

export function MapLegend() {
  const { 
    showRoads, setShowRoads,
    showAllRoads, setShowAllRoads,
  } = useAppStore();

  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div 
      className={`bg-zinc-950/70 backdrop-blur-2xl transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] border-y border-r border-white/10 shadow-[8px_0_32px_-8px_rgba(0,0,0,0.6)] overflow-y-auto overflow-x-hidden [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] select-none pointer-events-auto flex flex-col relative ${
        isExpanded 
          ? 'w-[230px] rounded-r-2xl p-4 h-fit max-h-[85vh]' 
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

      {isExpanded && <h3 className="text-zinc-100 font-medium text-[13px] tracking-wide mb-3 px-1.5">Road Layers</h3>}

      <div className={`flex flex-col ${isExpanded ? 'space-y-0.5' : 'w-full items-center mb-0'}`}>
        
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
      </div>

    </div>
  );
}
