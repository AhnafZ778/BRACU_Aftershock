import { useMemo, useState, useCallback, useEffect } from 'react';
import { useAppStore, type SeverityLevel } from '../store/useAppStore';
import { useScenarioStore } from '../store/useScenarioStore';
import { useMeshStore } from '../store/useMeshStore';

const SEVERITY_CONFIG: Record<
  SeverityLevel,
  { gradient: string; icon: string; label: string; labelBn: string; description: string; descriptionBn: string }
> = {
  critical: {
    gradient: 'from-red-900 to-amber-700',
    icon: '🌀',
    label: 'CYCLONE WARNING',
    labelBn: 'ঘূর্ণিঝড় সতর্কতা',
    description: 'A severe cyclone is approaching your area. Immediate action required.',
    descriptionBn: 'একটি তীব্র ঘূর্ণিঝড় আপনার এলাকার দিকে এগিয়ে আসছে। এখনই পদক্ষেপ নিন।',
  },
  high: {
    gradient: 'from-orange-800 to-amber-600',
    icon: '⚠️',
    label: 'HIGH ALERT',
    labelBn: 'উচ্চ সতর্কতা',
    description: 'Storm surge risk is high. Prepare to evacuate low-lying areas.',
    descriptionBn: 'জলোচ্ছ্বাসের ঝুঁকি বেশি। নিচু এলাকা ছেড়ে যেতে প্রস্তুত হন।',
  },
  moderate: {
    gradient: 'from-amber-700 to-yellow-600',
    icon: '⚡',
    label: 'MODERATE ALERT',
    labelBn: 'মাঝারি সতর্কতা',
    description: 'Weather conditions may worsen. Stay alert and prepare.',
    descriptionBn: 'আবহাওয়া আরো খারাপ হতে পারে। সতর্ক থাকুন এবং প্রস্তুত হন।',
  },
  low: {
    gradient: 'from-green-800 to-emerald-600',
    icon: 'ℹ️',
    label: 'ADVISORY',
    labelBn: 'পরামর্শ',
    description: 'Minor weather activity expected. No immediate risk.',
    descriptionBn: 'হালকা আবহাওয়া পরিবর্তন হতে পারে। তাৎক্ষণিক ঝুঁকি নেই।',
  },
  safe: {
    gradient: 'from-emerald-900 to-teal-700',
    icon: '✅',
    label: 'ALL CLEAR',
    labelBn: 'নিরাপদ',
    description: 'No active weather threats in your area. Stay informed.',
    descriptionBn: 'আপনার এলাকায় কোনো আবহাওয়া হুমকি নেই। তথ্য রাখুন।',
  },
};

const ACTIONS_BY_SEVERITY: Record<SeverityLevel, { icon: string; textBn: string }[]> = {
  critical: [
    { icon: '🏃', textBn: 'এখনই আশ্রয়কেন্দ্রে যান' },
    { icon: '🏠', textBn: 'জানালা-দরজা বন্ধ করুন' },
    { icon: '🎒', textBn: 'জরুরি সামগ্রী নিন' },
  ],
  high: [
    { icon: '📦', textBn: 'জরুরি ব্যাগ প্রস্তুত করুন' },
    { icon: '📻', textBn: 'খবর শুনতে থাকুন' },
    { icon: '🏃', textBn: 'সরানোর প্রস্তুতি নিন' },
  ],
  moderate: [
    { icon: '📻', textBn: 'আবহাওয়ার খবর রাখুন' },
    { icon: '🔋', textBn: 'ব্যাটারি ও পানি রাখুন' },
    { icon: '📱', textBn: 'যোগাযোগ প্রস্তুত রাখুন' },
  ],
  low: [
    { icon: '📻', textBn: 'খবর অনুসরণ করুন' },
    { icon: '🌧️', textBn: 'বৃষ্টির প্রস্তুতি রাখুন' },
    { icon: '✅', textBn: 'স্বাভাবিক কাজ চালিয়ে যান' },
  ],
  safe: [
    { icon: '✅', textBn: 'স্বাভাবিক কাজ চালিয়ে যান' },
    { icon: '📱', textBn: 'সতর্কতা আপডেট পান' },
    { icon: '🤝', textBn: 'প্রতিবেশীদের সাথে শেয়ার করুন' },
  ],
};

// Bangla transliteration map for pilot localities
const LOCALITY_BANGLA: Record<string, { bn: string; en: string }> = {
  'teknaf':       { bn: 'টেকনাফ',       en: 'Teknaf Sadar' },
  'ukhiya':       { bn: 'উখিয়া',        en: 'Ukhia' },
  'moheshkhali':  { bn: 'মহেশখালী',      en: 'Moheshkhali' },
  'cox-sadar':    { bn: 'কক্সবাজার সদর',  en: "Cox's Bazar Sadar" },
  'kutubdia':     { bn: 'কুতুবদিয়া',     en: 'Kutubdia' },
};

export function CommunityPage() {
  const { communitySeverity, setCommunitySeverity } = useAppStore();
  const { localities, selectedLocalityId } = useScenarioStore();
  const meshAlerts = useMeshStore((s) => s.alerts);
  const meshPeerCount = useMeshStore((s) => s.peerCount);
  const meshStatus = useMeshStore((s) => s.networkStatus);

  // Auto-update community severity when a mesh CAP alert arrives
  useEffect(() => {
    if (meshAlerts.length === 0) return;
    const latest = meshAlerts[0];
    const level = latest.info?.[0]?.communityLevel;
    if (level && level !== communitySeverity) {
      setCommunitySeverity(level as SeverityLevel);
    }
  }, [meshAlerts, communitySeverity, setCommunitySeverity]);

  const latestAlert = meshAlerts[0];
  const config = SEVERITY_CONFIG[communitySeverity];
  const actions = ACTIONS_BY_SEVERITY[communitySeverity];
  const isDanger = communitySeverity !== 'safe' && communitySeverity !== 'low';

  // Resolve selected locality or fallback to highest-scored
  const activeLocality = localities.find(l => l.id === selectedLocalityId) ?? localities[0];
  const localityInfo = LOCALITY_BANGLA[activeLocality?.id ?? ''] ?? { bn: 'টেকনাফ', en: 'Teknaf Sadar' };

  // Step 1 Fix: Pre-generate waveform heights once (no Math.random in render)
  const waveformHeights = useMemo(
    () => Array.from({ length: 30 }, () => Math.random() * 100),
    []
  );

  // Step 9: Audio playback via Web Speech API
  const [isSpeaking, setIsSpeaking] = useState(false);
  const handlePlay = useCallback(() => {
    if ('speechSynthesis' in window) {
      if (window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
        setIsSpeaking(false);
        return;
      }
      const utterance = new SpeechSynthesisUtterance(config.descriptionBn);
      utterance.lang = 'bn-BD';
      utterance.rate = 0.9;
      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);
      window.speechSynthesis.speak(utterance);
    }
  }, [config.descriptionBn]);

  return (
    <div
      className={`h-full flex flex-col items-center overflow-y-auto bg-gradient-to-b ${config.gradient}`}
    >
      <div className="w-full max-w-md flex flex-col items-center py-8 px-6 text-community-text">
        {/* Severity Icon + Signal */}
        <div className={`w-20 h-20 rounded-full flex items-center justify-center text-4xl mb-4 ${
          isDanger ? 'bg-white/15 animate-pulse' : 'bg-white/10'
        }`}>
          {config.icon}
        </div>

        <p className="text-sm font-medium uppercase tracking-widest opacity-80 mb-1">
          {config.label}
        </p>
        <h1 className="text-2xl font-bold font-bangla mb-1">
          {config.labelBn}
        </h1>

        {/* Locality name — dynamic */}
        <h2 className="text-4xl font-bold font-bangla mt-4 mb-2">{localityInfo.bn}</h2>
        <p className="text-sm opacity-70 mb-6">{localityInfo.en}</p>

        {/* Description */}
        <div className="w-full bg-white/10 backdrop-blur-sm rounded-2xl p-4 mb-6">
          <p className="font-bangla text-base leading-relaxed">{config.descriptionBn}</p>
          <p className="text-xs opacity-60 mt-2">{config.description}</p>
        </div>

        {/* Action Tiles */}
        <div className="w-full grid grid-cols-3 gap-3 mb-6">
          {actions.map((action, i) => (
            <div
              key={i}
              className="flex flex-col items-center gap-2 bg-white/10 backdrop-blur-sm rounded-xl p-4 text-center"
            >
              <span className="text-3xl">{action.icon}</span>
              <span className="font-bangla text-xs leading-tight">{action.textBn}</span>
            </div>
          ))}
        </div>

        {/* Shelter Info — only for danger states */}
        {isDanger && (
          <div className="w-full bg-white/10 backdrop-blur-sm rounded-2xl p-4 mb-6 flex items-center gap-4">
            <span className="text-3xl">🏛️</span>
            <div>
              <p className="text-xs uppercase tracking-wider opacity-60">Where to Go</p>
              <p className="font-bangla font-bold">{localityInfo.bn} আশ্রয়কেন্দ্র</p>
              <p className="text-xs opacity-60">
                Nearest Cyclone Shelter — {activeLocality?.metrics.sheltersNearby ?? '?'} nearby
              </p>
            </div>
          </div>
        )}

        {/* Audio Playback Bar — Step 9: functional via Web Speech API */}
        <div className="w-full bg-white/15 backdrop-blur-sm rounded-2xl p-4 mb-4">
          <p className="text-xs uppercase tracking-wider opacity-60 mb-3 text-center font-bangla">
            শুনুন
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={handlePlay}
              className={`w-12 h-12 rounded-full flex items-center justify-center text-2xl transition-all shrink-0 ${
                isSpeaking ? 'bg-white/40 animate-pulse' : 'bg-white/20 hover:bg-white/30'
              }`}
            >
              {isSpeaking ? '⏸' : '▶'}
            </button>
            <div className="flex-1 h-8 bg-white/10 rounded-lg flex items-center px-3">
              <div className="flex gap-0.5 h-4 items-end">
                {waveformHeights.map((h, i) => (
                  <div
                    key={i}
                    className={`w-1 rounded-full ${isSpeaking ? 'bg-white/70' : 'bg-white/40'}`}
                    style={{ height: `${h}%`, minHeight: '2px' }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Mesh Network Status ─────────────────────────────── */}
        <div className="w-full bg-white/10 backdrop-blur-sm rounded-2xl p-3 mb-4">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${
                meshStatus === 'online' ? 'bg-emerald-400 animate-pulse' :
                meshStatus === 'mesh-only' ? 'bg-amber-400 animate-pulse' :
                'bg-red-400'
              }`} />
              <span className="font-bangla opacity-80">
                {meshStatus === 'online' ? 'মেশ নেটওয়ার্ক সক্রিয়' :
                 meshStatus === 'mesh-only' ? 'শুধু মেশ — ইন্টারনেট নেই' :
                 'অফলাইন'}
              </span>
            </div>
            <span className="opacity-50 font-mono">
              {meshPeerCount} peer{meshPeerCount !== 1 ? 's' : ''}
            </span>
          </div>
          {meshStatus === 'mesh-only' && (
            <p className="text-[10px] opacity-50 mt-1 font-bangla">
              সতর্কতা পিয়ার-টু-পিয়ার মেশ নেটওয়ার্কের মাধ্যমে আসছে
            </p>
          )}
        </div>

        {/* ── Latest CAP Alert (from mesh) ────────────────────── */}
        {latestAlert && latestAlert.info?.[0] && (
          <div className="w-full bg-white/15 backdrop-blur-sm rounded-2xl p-4 mb-4 border border-white/20">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">⚡</span>
              <span className="text-xs uppercase tracking-wider opacity-70 font-bold">
                CAP Alert — {latestAlert.info[0].severity}
              </span>
              <span className="text-[10px] opacity-40 ml-auto font-mono">
                {latestAlert.identifier.slice(-8)}
              </span>
            </div>
            <p className="font-bangla font-bold text-base mb-1">
              {latestAlert.info[0].headline}
            </p>
            {latestAlert.info[0].instruction && (
              <p className="font-bangla text-sm opacity-80">
                {latestAlert.info[0].instruction}
              </p>
            )}
            {latestAlert.info[0].areas?.[0] && (
              <p className="text-[10px] opacity-40 mt-2 font-bangla">
                📍 {latestAlert.info[0].areas[0].areaDesc}
              </p>
            )}
            <p className="text-[10px] opacity-30 mt-1">
              {latestAlert.sent ? new Date(latestAlert.sent).toLocaleString('bn-BD') : ''}
            </p>
          </div>
        )}

        {/* Channel Tabs */}
        <div className="w-full flex rounded-xl overflow-hidden bg-white/10 text-sm font-medium">
          <button className="flex-1 py-2.5 text-center bg-white/10">SMS</button>
          <button className="flex-1 py-2.5 text-center opacity-60 hover:opacity-100 transition-opacity">
            IVR
          </button>
          <button className="flex-1 py-2.5 text-center opacity-60 hover:opacity-100 transition-opacity">
            Mesh
          </button>
        </div>
      </div>
    </div>
  );
}
