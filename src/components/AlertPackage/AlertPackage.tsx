import { useScenarioStore } from '../../store/useScenarioStore';

// Bangla names for pilot localities
const LOCALITY_BANGLA: Record<string, string> = {
  'teknaf':      'টেকনাফ সদর',
  'ukhiya':      'উখিয়া',
  'moheshkhali': 'মহেশখালী',
  'cox-sadar':   'কক্সবাজার সদর',
  'kutubdia':    'কুতুবদিয়া',
};

// Severity-specific Bangla SMS content
const SEVERITY_SMS_BN: Record<string, { heading: string; body: string; actions: string[] }> = {
  critical: {
    heading: '🚨 জরুরি ঘূর্ণিঝড় সতর্কতা',
    body: 'তীব্র ঘূর্ণিঝড় এগিয়ে আসছে। জলোচ্ছ্বাসের আশঙ্কা রয়েছে।',
    actions: ['এখনই আশ্রয়কেন্দ্রে যান', 'জানালা-দরজা বন্ধ করুন', 'জরুরি সামগ্রী নিন'],
  },
  high: {
    heading: '⚠️ উচ্চ সতর্কতা',
    body: 'জলোচ্ছ্বাসের ঝুঁকি বেশি। নিচু এলাকা ছেড়ে যেতে প্রস্তুত হন।',
    actions: ['জরুরি ব্যাগ প্রস্তুত করুন', 'খবর শুনতে থাকুন', 'সরানোর প্রস্তুতি নিন'],
  },
  moderate: {
    heading: '⚡ মাঝারি সতর্কতা',
    body: 'আবহাওয়া আরো খারাপ হতে পারে। সতর্ক থাকুন এবং প্রস্তুত হন।',
    actions: ['আবহাওয়ার খবর রাখুন', 'ব্যাটারি ও পানি রাখুন', 'যোগাযোগ প্রস্তুত রাখুন'],
  },
  low: {
    heading: 'ℹ️ পরামর্শ',
    body: 'হালকা আবহাওয়া পরিবর্তন হতে পারে। তাৎক্ষণিক ঝুঁকি নেই।',
    actions: ['খবর অনুসরণ করুন', 'বৃষ্টির প্রস্তুতি রাখুন', 'স্বাভাবিক কাজ চালিয়ে যান'],
  },
  safe: {
    heading: '✅ নিরাপদ',
    body: 'আপনার এলাকায় কোনো আবহাওয়া হুমকি নেই।',
    actions: ['স্বাভাবিক কাজ চালিয়ে যান', 'সতর্কতা আপডেট পান', 'প্রতিবেশীদের সাথে শেয়ার করুন'],
  },
};

// English severity display labels
const SEVERITY_LABELS: Record<string, string> = {
  critical: 'Critical Severity',
  high: 'High Severity',
  moderate: 'Moderate Severity',
  low: 'Low Severity',
  safe: 'All Clear',
};

export function AlertPackage({ onClose }: { onClose?: () => void }) {
  const { localities, selectedLocalityId } = useScenarioStore();

  // Resolve the active locality (selected or first in ranked list)
  const activeLocality = localities.find(l => l.id === selectedLocalityId) ?? localities[0];
  const localityName = activeLocality?.name ?? 'Unknown';
  const localityBn = LOCALITY_BANGLA[activeLocality?.id ?? ''] ?? localityName;
  const severity = activeLocality?.severity ?? 'safe';
  const population = activeLocality?.metrics.population ?? '—';
  const shelters = activeLocality?.metrics.sheltersNearby ?? '—';
  const smsBn = SEVERITY_SMS_BN[severity] ?? SEVERITY_SMS_BN.safe;
  const sevLabel = SEVERITY_LABELS[severity] ?? 'Unknown';

  return (
    <div className="bg-ops-surface rounded-xl border border-ops-border shadow-2xl overflow-hidden w-full max-w-2xl flex flex-col max-h-[90vh]">
      {/* Header */}
      <div className="bg-severity-critical/10 border-b border-severity-critical/20 p-4 flex justify-between items-start">
        <div>
          <h3 className="text-lg font-semibold text-ops-text">Prepared Alert Package</h3>
          <p className="text-sm text-ops-text-muted mt-1">
            Targeting <span className="text-white font-medium">{localityName}</span> • {sevLabel}
          </p>
        </div>
        {onClose && (
          <button 
            onClick={onClose}
            className="text-ops-text-muted hover:text-white transition-colors"
          >
            ✕
          </button>
        )}
      </div>

      {/* Body */}
      <div className="p-6 overflow-y-auto space-y-6 flex-1">
        {/* Multichannel Preview Tabs */}
        <div className="flex gap-2 border-b border-ops-border pb-2">
          {['SMS / Text', 'Voice / IVR', 'Community Relay'].map((channel, i) => (
            <button 
              key={channel}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${i === 0 ? 'text-accent-primary border-b-2 border-accent-primary bg-accent-primary/5' : 'text-ops-text-muted hover:text-ops-text'}`}
            >
              {channel}
            </button>
          ))}
        </div>

        {/* Payload Content */}
        <div className="space-y-4">
          <div className="bg-ops-bg rounded-lg p-4 border border-ops-border relative">
            <span className="absolute top-2 right-4 text-[10px] text-ops-text-muted uppercase tracking-wider">SMS Payload</span>
            
            {/* English preview */}
            <div className="mb-4">
              <p className="text-xs uppercase tracking-wider text-ops-text-muted mb-2">English Original</p>
              <div className="text-sm text-ops-text space-y-2">
                <p><strong>🚨 {sevLabel.toUpperCase()} — {localityName}</strong></p>
                <p>{activeLocality?.reason || 'No active threats in this area.'}</p>
                <ul className="list-disc pl-4 space-y-1">
                  {smsBn.actions.map((_, i) => (
                    <li key={i}>
                      {severity === 'critical' && ['Move to cyclone shelter immediately', 'Secure doors and windows', 'Take emergency go-bag'][i]}
                      {severity === 'high' && ['Prepare emergency bags', 'Stay informed via radio', 'Get ready to evacuate'][i]}
                      {severity === 'moderate' && ['Monitor weather updates', 'Stock batteries and water', 'Keep communications ready'][i]}
                      {(severity !== 'critical' && severity !== 'high' && severity !== 'moderate') && ['Follow news updates', 'Prepare for rain', 'Continue normal activities'][i]}
                    </li>
                  ))}
                </ul>
                <p>Shelters nearby: {shelters} • Population: {population}</p>
              </div>
            </div>

            {/* Bangla preview — dynamic */}
            <div>
              <p className="text-xs uppercase tracking-wider text-ops-text-muted mb-2">Bangla Translation (Auto)</p>
              <div className="text-sm text-ops-text space-y-2 font-bangla">
                <p><strong>{smsBn.heading}</strong></p>
                <p>{localityBn} — {smsBn.body}</p>
                <ul className="list-disc pl-4 space-y-1">
                  {smsBn.actions.map((action, i) => (
                    <li key={i}>{action}</li>
                  ))}
                </ul>
                <p>নিকটবর্তী আশ্রয়কেন্দ্র: {shelters}টি</p>
              </div>
            </div>
          </div>

          {/* Audio Preview Box */}
          <div className="bg-ops-bg rounded-lg p-4 border border-ops-border">
            <p className="text-xs uppercase tracking-wider text-ops-text-muted mb-2">Audio Synthesis Preview</p>
            <div className="flex items-center gap-3">
               <button className="w-10 h-10 rounded-full bg-accent-primary/20 hover:bg-accent-primary/30 flex items-center justify-center text-accent-primary transition-colors shrink-0">
                ▶
              </button>
              <div className="flex-1">
                 <div className="h-1.5 bg-ops-border rounded-full overflow-hidden">
                    <div className="w-1/3 h-full bg-accent-primary rounded-full"></div>
                 </div>
                 <div className="flex justify-between text-[10px] text-ops-text-muted mt-1">
                   <span>0:12</span>
                   <span>0:45</span>
                 </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer / Actions */}
      <div className="p-4 border-t border-ops-border bg-ops-bg flex justify-end gap-3">
        <button 
          onClick={onClose}
          className="px-4 py-2 rounded-lg text-sm font-medium text-ops-text-muted hover:text-white transition-colors"
        >
          Cancel
        </button>
        <button className="px-6 py-2 rounded-lg bg-severity-critical text-white text-sm font-semibold hover:bg-severity-critical/90 transition-colors shadow-lg shadow-severity-critical/20 flex items-center gap-2">
          <span>Broadcast Alert</span>
          <span className="text-white/70 text-[10px] hidden sm:inline">({'>'} {population} recipients)</span>
        </button>
      </div>
    </div>
  );
}
