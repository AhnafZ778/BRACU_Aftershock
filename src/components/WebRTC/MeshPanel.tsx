import { useMeshStore } from '../../store/useMeshStore';
import { Share2, Signal, Users, ShieldCheck, Zap, Radio } from 'lucide-react';

export function MeshPanel() {
  const { peerId, signalingStatus, peers, lowBandwidthMode, setLowBandwidthMode } = useMeshStore();

  const isConnected = signalingStatus === 'connected';
  const peerIds = Object.keys(peers);

  return (
    <div className="flex flex-col h-full bg-zinc-950/50 p-5 custom-scrollbar overflow-y-auto">
      {/* Header Info */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-zinc-400 text-[10px] font-black uppercase tracking-[0.2em]">Network Status</h3>
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-zinc-900 border border-zinc-800">
             <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${isConnected ? 'bg-emerald-500' : 'bg-amber-500'}`} />
             <span className="text-[9px] font-bold text-zinc-300 uppercase">{signalingStatus}</span>
          </div>
        </div>
        <p className="text-zinc-500 text-xs leading-relaxed">
          P2P Mesh active. Signaling through regional relay nodes to establish direct browser-to-browser links.
        </p>
      </div>

      {/* Main Stats */}
      <div className="grid grid-cols-2 gap-3 mb-8">
        <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800 flex flex-col items-center justify-center text-center gap-2">
          <Users size={20} className="text-blue-400" />
          <div>
            <div className="text-xl font-black text-white">{peerIds.length}</div>
            <div className="text-[9px] font-bold text-zinc-500 uppercase">Direct Peers</div>
          </div>
        </div>
        <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800 flex flex-col items-center justify-center text-center gap-2">
          <Signal size={20} className="text-emerald-400" />
          <div>
            <div className="text-xl font-black text-white">4.2ms</div>
            <div className="text-[9px] font-bold text-zinc-500 uppercase">Avg Latency</div>
          </div>
        </div>
      </div>

      {/* Peer List */}
      <div className="space-y-3 mb-8">
        <h3 className="text-zinc-400 text-[10px] font-black uppercase tracking-[0.2em] mb-4">Connected Nodes</h3>
        {peerIds.length === 0 ? (
          <div className="py-8 border-2 border-dashed border-zinc-900 rounded-2xl flex flex-col items-center justify-center gap-2 text-zinc-600">
            <Share2 size={24} className="opacity-20" />
            <span className="text-xs font-medium">No direct peers found</span>
          </div>
        ) : (
          peerIds.map(pid => (
            <div key={pid} className="flex items-center justify-between p-3 rounded-xl bg-zinc-900 border border-zinc-800">
               <div className="flex items-center gap-3">
                 <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                    <ShieldCheck size={16} className="text-blue-400" />
                 </div>
                 <div>
                    <div className="text-xs font-bold text-zinc-200 font-mono">{pid === peerId ? `${pid} (You)` : pid}</div>
                    <div className="text-[9px] text-zinc-500 font-medium">Relay Mode: Active</div>
                 </div>
               </div>
               <div className="text-[9px] font-mono text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded">ONLINE</div>
            </div>
          ))
        )}
      </div>

      {/* Control Actions */}
      <div className="mt-auto pt-6 border-t border-zinc-900 space-y-3">
        <button 
          onClick={() => setLowBandwidthMode(!lowBandwidthMode)}
          className={`w-full py-4 rounded-xl border text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-3 transition-all ${
            lowBandwidthMode 
              ? 'bg-amber-500/20 border-amber-500/50 text-amber-500 shadow-[0_0_20px_rgba(245,158,11,0.15)]' 
              : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-white'
          }`}
        >
          <Zap size={14} />
          Low Bandwidth Mode {lowBandwidthMode ? 'ON' : 'OFF'}
        </button>

        <button 
          onClick={() => window.location.reload()}
          className="w-full py-4 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:border-blue-500 hover:text-blue-400 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-3 transition-all"
        >
          <Radio size={14} />
          Force Synchronization
        </button>
      </div>

      <div className="mt-6 text-center">
        <p className="text-[9px] text-zinc-600 font-medium uppercase tracking-tighter">
          Client Fingerprint: {peerId}
        </p>
      </div>
    </div>
  );
}
