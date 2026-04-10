import { useState } from 'react';
import { AlertCircle, ChevronRight } from 'lucide-react';

export function SeverityLegend() {
  const [isOpen, setIsOpen] = useState(false);

  const severities = [
    { label: 'Critical (0–30km)', color: 'bg-severity-critical' },
    { label: 'High (30–80km)', color: 'bg-severity-high' },
    { label: 'Moderate (80–150km)', color: 'bg-severity-moderate' },
    { label: 'Low (150–250km)', color: 'bg-severity-low' },
    { label: 'Safe (250km+)', color: 'bg-severity-safe' },
  ];

  return (
    <div className="flex items-center justify-end h-12 shadow-2xl pointer-events-auto select-none">
      <div 
        className={`flex items-center bg-zinc-900/85 backdrop-blur-xl border border-white/10 rounded-full transition-all duration-500 ease-in-out overflow-hidden h-full ${
          isOpen ? 'max-w-[600px] border-white/20' : 'max-w-[48px] cursor-pointer hover:bg-zinc-800/90'
        }`}
        onClick={() => !isOpen && setIsOpen(true)}
      >
        
        {/* Toggle Button */}
        <button 
          onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }}
          className={`relative z-10 flex-shrink-0 flex items-center justify-center w-12 h-12 rounded-full transition-colors duration-300 ${isOpen ? 'hover:bg-white/10' : ''}`}
          aria-label="Toggle Severity Legend"
        >
          <div className="relative">
            {isOpen ? (
              <ChevronRight className="w-5 h-5 text-zinc-400" />
            ) : (
              <>
                 <div className="absolute inset-0 rounded-full blur-[6px] bg-orange-500/40" />
                 <AlertCircle className="w-5 h-5 text-zinc-300 relative z-10" />
              </>
            )}
          </div>
        </button>

        {/* Legend Content */}
        <div 
          className={`flex items-center gap-6 pr-6 transition-all duration-500 whitespace-nowrap ${
            isOpen ? 'opacity-100 translate-x-0 ml-1' : 'opacity-0 translate-x-4 ml-0 pointer-events-none'
          }`}
        >
          <div className="h-4 w-px bg-white/10"></div>
          
          <h4 className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 pt-0.5">
            Locality Severity
          </h4>
          
          <div className="flex items-center gap-5">
            {severities.map(({ label, color }) => (
              <div key={label} className="flex items-center gap-2.5">
                <div className="relative flex items-center justify-center">
                   <div className={`absolute inset-0 rounded-full blur-[3px] ${color} opacity-80`} />
                   <div className={`relative w-2 h-2 rounded-full border border-white/20 ${color}`} />
                </div>
                <span className="text-[12px] text-zinc-300 font-medium tracking-wide">{label}</span>
              </div>
            ))}
          </div>
        </div>
        
      </div>
    </div>
  );
}
