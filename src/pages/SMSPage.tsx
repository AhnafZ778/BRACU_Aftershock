import { useState } from 'react';
import { Send, Phone, MessageSquare } from 'lucide-react';
import { dispatchCapSms } from '../config/api';

export function SMSPage() {
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');

  const sendSMS = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone || !message) return;
    
    setStatus('sending');
    try {
      const result = await dispatchCapSms(phone, message);
      if (!result.ok) throw new Error(result.error || 'SMS dispatch failed.');
      
      setStatus('success');
      setTimeout(() => setStatus('idle'), 3000);
      setPhone('');
      setMessage('');
    } catch (err) {
      console.error(err);
      setStatus('error');
      setTimeout(() => setStatus('idle'), 3000);
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-ops-bg p-6 pt-24 sm:pt-28">
      <div className="max-w-md mx-auto bg-ops-surface rounded-xl p-6 border border-ops-border shadow-[0_8px_32px_0_rgba(0,0,0,0.36)]">
        <div className="flex items-center gap-4 mb-8">
          <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center border border-blue-500/30">
            <MessageSquare className="text-blue-400" size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-ops-text">Send SMS Alert</h1>
            <p className="text-sm text-ops-text-muted mt-0.5">Trigger MacroDroid remote device</p>
          </div>
        </div>

        <form onSubmit={sendSMS} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
              <Phone size={14} className="text-slate-500" /> Phone Number
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. 5550199"
              className="w-full bg-slate-900/50 border border-slate-700/50 rounded-lg px-4 py-2.5 text-slate-200 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all font-mono text-sm"
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
              <MessageSquare size={14} className="text-slate-500" /> Message
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Enter SMS alert message..."
              rows={4}
              className="w-full bg-slate-900/50 border border-slate-700/50 rounded-lg px-4 py-3 text-slate-200 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all resize-none font-mono text-sm leading-relaxed"
              required
            />
          </div>

          <button
            type="submit"
            disabled={status === 'sending' || !phone || !message}
            className={`w-full flex items-center justify-center gap-2 py-3 rounded-lg font-bold tracking-wide transition-all mt-4 border ${
              status === 'sending' ? 'bg-slate-800 text-slate-500 border-slate-700/50 cursor-not-allowed' :
              status === 'success' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.15)]' : 
              status === 'error' ? 'bg-red-500/10 text-red-400 border-red-500/30 shadow-[0_0_15px_rgba(239,68,68,0.15)]' :
              'bg-blue-600/20 text-blue-400 border-blue-500/30 hover:bg-blue-600/30 hover:border-blue-400/50 hover:shadow-[0_0_20px_rgba(59,130,246,0.2)]'
            }`}
          >
            {status === 'sending' ? (
              'Sending...'
            ) : status === 'success' ? (
              'Command Sent!'
            ) : status === 'error' ? (
              'Failed to Send'
            ) : (
              <>
                <Send size={16} /> Trigger MacroDroid
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
