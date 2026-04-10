import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation } from 'react-router-dom';
import { Activity, ShieldAlert, CloudLightning, X, Share2, Sparkles } from 'lucide-react';
import { HardwareGatewayPanel } from './HardwareGateway/HardwareGatewayPanel';
import { VolunteerManagementPanel } from './Volunteer/VolunteerManagementPanel';
import { SimulationPanel } from './Simulation/SimulationPanel';
import { MeshPanel } from './WebRTC/MeshPanel';
import { CopilotPanel } from './Copilot/CopilotPanel';
import { useAppStore } from '../store/useAppStore';
import { useSimulationStore } from '../store/useSimulationStore';
import { fetchSimulationProgressive } from '../services/mapDataAccess';

type PanelTab = 'gateway' | 'simulation' | 'sos' | 'mesh' | 'copilot' | null;

export function RightPanel() {
  const [activeTab, setActiveTab] = useState<PanelTab>(null);
  const location = useLocation();
  const { mode } = useAppStore(); // 'operations' or 'community'
  const { 
    isLoaded, isPlaying, loadTimeline, tick
  } = useSimulationStore();
  const isDashboard = location.pathname === '/dashboard';
  const isNonModalTab = activeTab === 'simulation' || activeTab === 'gateway' || activeTab === 'mesh' || activeTab === 'copilot';

  // Ref auto-close logic
  const panelRef = useRef<HTMLDivElement>(null);

  // Close when path changes
  useEffect(() => {
    setActiveTab(null);
  }, [location.pathname]);

  // Handle clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      // Non-modal tabs support side-by-side interaction and should not auto-close on outside click.
      if (isNonModalTab) return;

      // Don't close if clicking a toast or other overlay
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        // Only close if it's open
        if (activeTab) {
           // But wait, the trigger buttons might be outside. So maybe only if it's NOT a trigger button
           const target = e.target as HTMLElement;
           if (!target.closest('.right-panel-trigger')) {
             setActiveTab(null);
           }
        }
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [activeTab, isNonModalTab]);

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // Global simulation engine loops
  useEffect(() => {
    if (!isLoaded) {
      fetchSimulationProgressive('sidr_2007_v4', 12)
        .then(data => {
          if (!('error' in data) || !data.error) {
            loadTimeline(data);
            return;
          }
          throw new Error(data.error);
        })
        .catch(() => {
          fetch('/replay_sidr_2007_v4.json')
            .then(res => res.json())
            .then(data => loadTimeline(data))
            .catch(err => console.error("Failed to load simulation:", err));
        });
    }
  }, [isLoaded, loadTimeline]);

  useEffect(() => {
    if (isPlaying) {
      const timer = setInterval(() => {
        tick();
      }, 1500);
      return () => clearInterval(timer);
    }
  }, [isPlaying, tick]);

  const headerControls = typeof document !== 'undefined' ? document.getElementById('header-right-controls') : null;

  return (
    <>
      {/* Floating Action Buttons Area - Portal to AppLayout header */}
      {mounted && headerControls && createPortal(
        <div className="flex flex-row items-center justify-end gap-1.5 pr-2 max-w-full overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          {/* Copilot Button */}
          {isDashboard && (
            <button
              className={`shrink-0 right-panel-trigger relative flex items-center gap-1.5 px-2.5 py-1.5 xl:px-3 xl:py-2 rounded-full border text-xs xl:text-sm font-medium transition-all backdrop-blur-md whitespace-nowrap
                ${activeTab === 'copilot'
                  ? 'bg-cyan-600/20 border-cyan-500/50 text-cyan-300 shadow-[0_0_10px_rgba(34,211,238,0.3)]'
                  : 'bg-slate-900/80 border-slate-700/50 text-slate-400 hover:text-slate-300'
                }`}
              onClick={() => setActiveTab(activeTab === 'copilot' ? null : 'copilot')}
            >
              <Sparkles size={14} className="2xl:h-4 2xl:w-4" />
              <span className="hidden 2xl:inline">Copilot</span>
            </button>
          )}

          {/* Gateway Button */}
          {!isDashboard && (
            <button
              className={`shrink-0 right-panel-trigger relative flex items-center gap-1.5 px-2.5 py-1.5 xl:px-3 xl:py-2 rounded-full border text-xs xl:text-sm font-medium transition-all backdrop-blur-md whitespace-nowrap
                ${activeTab === 'gateway' 
                  ? 'bg-blue-600/20 border-blue-500/50 text-blue-400 shadow-[0_0_10px_rgba(59,130,246,0.3)]' 
                  : 'bg-slate-900/80 border-slate-700/50 text-slate-400 hover:text-slate-300'
                }`}
              onClick={() => setActiveTab(activeTab === 'gateway' ? null : 'gateway')}
            >
              <Activity size={14} className="2xl:h-4 2xl:w-4" />
              <span className="hidden 2xl:inline">Gateway</span>
            </button>
          )}

          {/* Mesh Network Button */}
          {!isDashboard && (
            <button
              className={`shrink-0 right-panel-trigger relative flex items-center gap-1.5 px-2.5 py-1.5 xl:px-3 xl:py-2 rounded-full border text-xs xl:text-sm font-medium transition-all backdrop-blur-md whitespace-nowrap
                ${activeTab === 'mesh' 
                  ? 'bg-emerald-600/20 border-emerald-500/50 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.3)]' 
                  : 'bg-slate-900/80 border-slate-700/50 text-slate-400 hover:text-slate-300'
                }`}
              onClick={() => setActiveTab(activeTab === 'mesh' ? null : 'mesh')}
            >
              <Share2 size={14} className="2xl:h-4 2xl:w-4" />
              <span className="hidden 2xl:inline">Mesh</span>
            </button>
          )}

          {/* Simulate Cyclone Button (Dashboard only) */}
          {isDashboard && (
            <button
              className={`shrink-0 right-panel-trigger relative flex items-center gap-1.5 px-2.5 py-1.5 xl:px-3 xl:py-2 rounded-full border text-xs xl:text-sm font-medium transition-all backdrop-blur-md whitespace-nowrap
                ${activeTab === 'simulation' 
                  ? 'bg-indigo-600/20 border-indigo-500/50 text-indigo-300 shadow-[0_0_10px_rgba(99,102,241,0.3)]' 
                  : 'bg-slate-900/80 border-slate-700/50 text-slate-400 hover:text-slate-300'
                }`}
              onClick={() => setActiveTab(activeTab === 'simulation' ? null : 'simulation')}
            >
              <CloudLightning size={14} className="2xl:h-4 2xl:w-4" />
              <span className="hidden 2xl:inline">Simulation</span>
            </button>
          )}

          {/* SOS Command Button (Only in operations mode) */}
          {mode === 'operations' && !isDashboard && (
            <button
              className={`shrink-0 right-panel-trigger relative flex items-center gap-1.5 px-2.5 py-1.5 xl:px-3 xl:py-2 rounded-full border text-xs xl:text-sm font-medium transition-all backdrop-blur-md whitespace-nowrap
                ${activeTab === 'sos' 
                  ? 'bg-red-600/20 border-red-500/50 text-red-400 shadow-[0_0_10px_rgba(220,38,38,0.3)]' 
                  : 'bg-slate-900/80 border-slate-700/50 text-slate-400 hover:text-slate-300'
                }`}
              onClick={() => setActiveTab(activeTab === 'sos' ? null : 'sos')}
            >
              <ShieldAlert size={14} className="2xl:h-4 2xl:w-4" />
              <span className="hidden 2xl:inline">SOS Command</span>
              {activeTab !== 'sos' && <div className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full border border-zinc-900 animate-pulse" />}
            </button>
          )}
        </div>,
        headerControls
      )}

      {/* Slide-out Panel Overlay */}
      <AnimatePresence>
        {activeTab && (
          <>
            {/* Backdrop for modal tabs only */}
            {!isNonModalTab && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setActiveTab(null)}
                className="fixed inset-0 z-[155] bg-black/40 backdrop-blur-sm"
              />
            )}
            
            {/* Panel Card */}
            <motion.div
              ref={panelRef}
              initial={{ x: '100%', opacity: 0.5 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: '100%', opacity: 0.5 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed top-16 right-5 bottom-4 w-96 bg-zinc-950/95 backdrop-blur-md border border-zinc-800/80 rounded-2xl shadow-2xl flex flex-col overflow-hidden z-[160]"
            >
              {/* Common Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 bg-zinc-900/50 flex-shrink-0">
                <div className="flex items-center gap-3">
                  {activeTab === 'gateway' ? (
                    <Activity className="text-blue-500" size={20} />
                  ) : activeTab === 'mesh' ? (
                    <Share2 className="text-emerald-500" size={20} />
                  ) : activeTab === 'simulation' ? (
                    <CloudLightning className="text-indigo-400" size={20} />
                  ) : activeTab === 'copilot' ? (
                    <Sparkles className="text-cyan-300" size={20} />
                  ) : (
                    <ShieldAlert className="text-red-500" size={20} />
                  )}
                  <h2 className="text-white font-bold tracking-wide">
                    {activeTab === 'gateway'
                      ? 'Hardware Gateway'
                      : activeTab === 'mesh'
                        ? 'P2P Mesh Network'
                        : activeTab === 'simulation'
                          ? 'Cyclone Simulation'
                            : activeTab === 'copilot'
                              ? 'Cyclone Path-to-Action Copilot'
                              : 'SOS Command Center'}
                  </h2>
                </div>
                <button
                  onClick={() => setActiveTab(null)}
                  className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Dynamic Content */}
              <div className="flex-1 overflow-hidden relative">
                {activeTab === 'gateway' && <HardwareGatewayPanel />}
                {activeTab === 'mesh' && <MeshPanel />}
                {activeTab === 'simulation' && <SimulationPanel embedded />}
                {activeTab === 'copilot' && <CopilotPanel />}
                {activeTab === 'sos' && <VolunteerManagementPanel />}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
