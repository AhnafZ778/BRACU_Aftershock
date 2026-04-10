import { useRef, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Users, User, AlertTriangle, ArrowRight, Radio } from 'lucide-react';

export function LandingPage() {
  const navigate = useNavigate();
  const [lang, setLang] = useState<'en' | 'bn'>('en');

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const setSize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    setSize();

    type P = { x: number; y: number; v: number; o: number };
    let ps: P[] = [];
    let raf = 0;

    const make = () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      v: Math.random() * 0.25 + 0.05,
      o: Math.random() * 0.35 + 0.15,
    });

    const init = () => {
      ps = [];
      const count = Math.floor((canvas.width * canvas.height) / 9000);
      for (let i = 0; i < count; i++) ps.push(make());
    };

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ps.forEach((p) => {
        p.y -= p.v;
        if (p.y < 0) {
          p.x = Math.random() * canvas.width;
          p.y = canvas.height + Math.random() * 40;
          p.v = Math.random() * 0.25 + 0.05;
          p.o = Math.random() * 0.35 + 0.15;
        }
        ctx.fillStyle = `rgba(250,250,250,${p.o})`;
        ctx.fillRect(p.x, p.y, 0.7, 2.2);
      });
      raf = requestAnimationFrame(draw);
    };

    const onResize = () => {
      setSize();
      init();
    };

    window.addEventListener("resize", onResize);
    init();
    raf = requestAnimationFrame(draw);
    return () => {
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(raf);
    };
  }, []);

  const roles = [
    {
      title: lang === 'en' ? 'Admin' : 'অ্যাডমিন',
      description: lang === 'en' 
        ? 'System management and full operational control. Access dashboards, run forecasts, and manage alerts.' 
        : 'সিস্টেম পরিচালনা এবং পূর্ণ নিয়ন্ত্রণ। ড্যাশবোর্ড অ্যাক্সেস করুন, পূর্বাভাস চালান এবং অ্যালার্ট পরিচালনা করুন।',
      icon: Shield,
      path: '/dashboard',
      gradient: 'from-blue-500/10 to-blue-600/10 hover:from-blue-500/20 hover:to-blue-600/20',
      border: 'border-blue-500/20 hover:border-blue-500/50',
      iconColor: 'text-blue-400',
      glow: 'shadow-blue-500/20'
    },
    {
      title: lang === 'en' ? 'Community Leader' : 'কমিউনিটি লিডার',
      description: lang === 'en'
        ? 'Coordinate local responses, track volunteer teams, and broadcast localized alerts.'
        : 'স্থানীয় প্রতিক্রিয়া সমন্বয় করুন, স্বেচ্ছাসেবক দল ট্র্যাক করুন এবং স্থানীয় অ্যালার্ট সম্প্রচার করুন।',
      icon: Users,
      path: '/community',
      gradient: 'from-emerald-500/10 to-emerald-600/10 hover:from-emerald-500/20 hover:to-emerald-600/20',
      border: 'border-emerald-500/20 hover:border-emerald-500/50',
      iconColor: 'text-emerald-400',
      glow: 'shadow-emerald-500/20'
    },
    {
      title: lang === 'en' ? 'Local User' : 'সাধারণ ব্যবহারকারী',
      description: lang === 'en'
        ? 'Receive real-time alerts, view impact methodology, and understand localized risks.'
        : 'রিয়েল-টাইম অ্যালার্ট পান, প্রভাব পদ্ধতি দেখুন এবং স্থানীয় ঝুঁকি বুঝুন।',
      icon: User,
      path: '/method',
      gradient: 'from-orange-500/10 to-orange-600/10 hover:from-orange-500/20 hover:to-orange-600/20',
      border: 'border-orange-500/20 hover:border-orange-500/50',
      iconColor: 'text-orange-400',
      glow: 'shadow-orange-500/20'
    },
    {
      title: lang === 'en' ? 'Volunteer View' : 'ভলান্টিয়ার ভিউ',
      description: lang === 'en'
        ? 'Send emergency SOS signals to the control station. Report disasters, request rescue, and track response status in real-time.'
        : 'কন্ট্রোল স্টেশনে জরুরি এসওএস সংকেত পাঠান। দুর্যোগ রিপোর্ট করুন, উদ্ধার অনুরোধ করুন এবং রিয়েল-টাইমে প্রতিক্রিয়া ট্র্যাক করুন।',
      icon: AlertTriangle,
      path: '/volunteer-view',
      gradient: 'from-red-500/10 to-red-600/10 hover:from-red-500/20 hover:to-red-600/20',
      border: 'border-red-500/20 hover:border-red-500/50',
      iconColor: 'text-red-400',
      glow: 'shadow-red-500/20'
    },
    {
      title: lang === 'en' ? 'Broadcast Monitor' : 'ব্রডকাস্ট মনিটর',
      description: lang === 'en'
        ? 'Monitor real-time SOS broadcasts, track notified control stations, and manage coordinated emergency responses.'
        : 'রিয়েল-টাইম এসওএস সম্প্রচার মনিটর করুন, বিজ্ঞাপিত কন্ট্রোল স্টেশন ট্র্যাক করুন এবং সমন্বিত জরুরি প্রতিক্রিয়া পরিচালনা করুন।',
      icon: Radio,
      path: '/broadcast-monitor',
      gradient: 'from-indigo-500/10 to-indigo-600/10 hover:from-indigo-500/20 hover:to-indigo-600/20',
      border: 'border-indigo-500/20 hover:border-indigo-500/50',
      iconColor: 'text-indigo-400',
      glow: 'shadow-indigo-500/20'
    }
  ];

    // Temporarily hide unfinished/non-home role portals without deleting implementation.
    const hiddenHomeRolePaths = ['/community', '/method', '/broadcast-monitor'];
    const visibleRoles = roles.filter((role) => !hiddenHomeRolePaths.includes(role.path));
    const showCommunityLoraMonitor = false;
    const largeGridColsClass =
      visibleRoles.length <= 2 ? 'lg:grid-cols-2' : visibleRoles.length === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-4';

  return (
    <div className="relative min-h-screen bg-zinc-950 flex flex-col items-center overflow-x-hidden font-sans px-6 py-12 text-zinc-50 selection:bg-accent-primary/30">
      <style>{`
        .accent-lines{position:absolute;inset:0;pointer-events:none;opacity:.7}
        .hline,.vline{position:absolute;background:#27272a;will-change:transform,opacity}
        .hline{left:0;right:0;height:1px;transform:scaleX(0);transform-origin:50% 50%;animation:drawX .8s cubic-bezier(.22,.61,.36,1) forwards}
        .vline{top:0;bottom:0;width:1px;transform:scaleY(0);transform-origin:50% 0%;animation:drawY .9s cubic-bezier(.22,.61,.36,1) forwards}
        .hline:nth-child(1){top:18%;animation-delay:.12s}
        .hline:nth-child(2){top:50%;animation-delay:.22s}
        .hline:nth-child(3){top:82%;animation-delay:.32s}
        .vline:nth-child(4){left:22%;animation-delay:.42s}
        .vline:nth-child(5){left:50%;animation-delay:.54s}
        .vline:nth-child(6){left:78%;animation-delay:.66s}
        .hline::after,.vline::after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,transparent,rgba(250,250,250,.24),transparent);opacity:0;animation:shimmer .9s ease-out forwards}
        .hline:nth-child(1)::after{animation-delay:.12s}
        .hline:nth-child(2)::after{animation-delay:.22s}
        .hline:nth-child(3)::after{animation-delay:.32s}
        .vline:nth-child(4)::after{animation-delay:.42s}
        .vline:nth-child(5)::after{animation-delay:.54s}
        .vline:nth-child(6)::after{animation-delay:.66s}
        @keyframes drawX{0%{transform:scaleX(0);opacity:0}60%{opacity:.95}100%{transform:scaleX(1);opacity:.7}}
        @keyframes drawY{0%{transform:scaleY(0);opacity:0}60%{opacity:.95}100%{transform:scaleY(1);opacity:.7}}
        @keyframes shimmer{0%{opacity:0}35%{opacity:.25}100%{opacity:0}}
      `}</style>

      {/* Subtle vignette */}
      <div className="fixed inset-0 pointer-events-none [background:radial-gradient(80%_60%_at_50%_30%,rgba(255,255,255,0.06),transparent_60%)] z-0" />

      {/* Background gradient orbs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-40 -right-40 w-[600px] h-[600px] rounded-full bg-accent-primary/5 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-[500px] h-[500px] rounded-full bg-severity-critical/5 blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full bg-accent-teal/3 blur-3xl" />
      </div>

      {/* Animated accent lines */}
      <div className="fixed inset-0 accent-lines z-0">
        <div className="hline" />
        <div className="hline" />
        <div className="hline" />
        <div className="vline" />
        <div className="vline" />
        <div className="vline" />
      </div>

      {/* Particles */}
      <canvas
        ref={canvasRef}
        className="fixed inset-0 w-full h-full opacity-50 mix-blend-screen pointer-events-none z-0"
      />

      {/* Top Left Logo & Title */}
      <div className="absolute top-6 left-6 md:top-8 md:left-10 z-20 flex items-center gap-3 md:gap-4 animate-in fade-in slide-in-from-top-4 duration-1000">
        <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20 overflow-hidden bg-zinc-900 border border-emerald-500/20">
          <img src="/logo.png" alt="Nirapotta Logo" className="w-full h-full object-cover p-1" />
        </div>
        <h1 className="text-3xl md:text-5xl text-white pt-2" style={{ fontFamily: 'Galada, cursive' }}>
          নিরাপত্তা
        </h1>
      </div>

      {/* Top Right Language Toggle */}
      <div className="absolute top-6 right-6 md:top-8 md:right-10 z-20 animate-in fade-in slide-in-from-top-4 duration-1000">
        <button
          onClick={() => setLang(lang === 'en' ? 'bn' : 'en')}
          className="flex items-center justify-center px-5 py-2.5 md:px-6 md:py-3 rounded-xl bg-zinc-800/80 backdrop-blur-md border border-zinc-700/80 hover:border-emerald-500/60 hover:bg-zinc-800 text-sm md:text-base font-semibold tracking-wide text-zinc-200 hover:text-white transition-all duration-300 shadow-xl"
        >
          {lang === 'en' ? 'বাংলা' : 'English'}
        </button>
      </div>

      <div className="relative z-10 flex flex-col items-center text-center w-full max-w-5xl mt-24 md:mt-20">



        {/* Role Cards Grid */}
        <div className="w-full text-left mb-16 px-4">
          <h2 className={`font-semibold text-zinc-100 mb-8 border-b border-zinc-800/60 pb-4 ${lang === 'bn' ? 'text-2xl' : 'text-xl'}`}>
            {lang === 'en' ? 'Select Your Role' : 'আপনার ভূমিকা নির্বাচন করুন'}
          </h2>
            <div className={`grid grid-cols-1 md:grid-cols-2 ${largeGridColsClass} gap-6 md:gap-8 w-full`}>
              {visibleRoles.map((role, idx) => {
              const Icon = role.icon;
              return (
                <button
                  key={role.title}
                  onClick={() => navigate(role.path)}
                  className={`group relative text-left flex flex-col p-8 md:p-10 rounded-3xl border transition-all duration-500 ease-out bg-zinc-900/50 backdrop-blur-sm ${role.gradient} ${role.border} hover:-translate-y-2 hover:shadow-2xl ${role.glow} overflow-hidden animate-in fade-in slide-in-from-bottom-8`}
                  style={{ animationDelay: `${(idx + 1) * 150}ms`, animationFillMode: 'both' }}
                >
                  {/* Internal Glow Effect on hover */}
                  <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                  
                  {/* Icon Container */}
                  <div className="w-16 h-16 rounded-2xl bg-zinc-950 border border-white/5 flex items-center justify-center mb-8 group-hover:scale-110 transition-transform duration-500 ease-out shadow-inner">
                    <Icon className={`w-8 h-8 ${role.iconColor}`} strokeWidth={1.5} />
                  </div>

                  <div className="flex-1">
                    <h3 className={`font-semibold mb-4 tracking-tight text-zinc-100 group-hover:text-white transition-colors duration-300 ${lang === 'bn' ? 'text-3xl' : 'text-2xl'}`}>
                      {role.title}
                    </h3>
                    <p className={`text-zinc-400 leading-relaxed ${lang === 'bn' ? 'text-lg font-normal' : 'font-light'}`}>
                      {role.description}
                    </p>
                  </div>

                  <div className="mt-10 flex items-center tracking-wide text-zinc-400 group-hover:text-white transition-colors duration-300">
                    <span className={`font-medium ${lang === 'bn' ? 'text-base font-bold' : 'text-sm'}`}>
                      {lang === 'en' ? 'ENTER PORTAL' : 'পোর্টালে প্রবেশ করুন'}
                    </span>
                    <ArrowRight className="w-5 h-5 ml-3 group-hover:translate-x-3 transition-transform duration-500 ease-out" />
                  </div>
                </button>
              )
            })}
          </div>
        </div>

          {/* ── LoRa Community Monitor Section (temporarily hidden) ── */}
          {showCommunityLoraMonitor && (
          <div className="w-full max-w-2xl px-4 animate-in fade-in zoom-in duration-1000 delay-500 fill-mode-both">
          <div className="flex items-center gap-3 mb-6 opacity-70">
            <div className="flex-1 h-px bg-zinc-800" />
            <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-400 font-semibold">
              Field Device Network
            </span>
            <div className="flex-1 h-px bg-zinc-800" />
          </div>

          <div
            className="relative text-left rounded-3xl border border-zinc-800 bg-zinc-900/40 backdrop-blur-md p-6 overflow-hidden cursor-pointer group hover:border-accent-teal/40 hover:bg-zinc-900/60 transition-all duration-300 shadow-xl"
            onClick={() => navigate('/lora')}
          >
            {/* background pulse rings */}
            <div className="absolute top-6 right-6 pointer-events-none">
              <div className="relative w-12 h-12">
                <div className="absolute inset-0 rounded-full border border-accent-teal/20 animate-ping" />
                <div className="absolute inset-1 rounded-full border border-accent-teal/15 animate-ping delay-300" />
                <div className="absolute inset-2 rounded-full border border-accent-teal/10 animate-ping delay-700" />
                <div className="absolute inset-3 rounded-full bg-accent-teal/20 flex items-center justify-center">
                  <div className="w-3 h-3 rounded-full bg-accent-teal shadow-[0_0_12px_rgba(20,184,166,0.8)]" />
                </div>
              </div>
            </div>

            <div className="flex items-start gap-5 pr-16">
              {/* icon */}
              <div className="w-12 h-12 rounded-xl bg-accent-teal/15 border border-accent-teal/30 flex items-center justify-center shrink-0 shadow-inner group-hover:scale-105 transition-transform duration-300">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
                  className="w-5 h-5 text-accent-teal" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12.55a11 11 0 0 1 14.08 0"/>
                  <path d="M1.42 9a16 16 0 0 1 21.16 0"/>
                  <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
                  <circle cx="12" cy="20" r="1" fill="currentColor"/>
                </svg>
              </div>

              <div className="text-left flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-base font-bold text-zinc-100 group-hover:text-accent-teal transition-colors">Community LoRa Warning Monitor</h3>
                  <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-teal-500/15 text-teal-400 border border-teal-500/20 shadow-[0_0_8px_rgba(20,184,166,0.2)]">
                    <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse" />
                    Live
                  </span>
                </div>
                <p className="text-sm text-zinc-400 leading-relaxed mb-5 font-light">
                  Track your local LoRa warning station in real-time. View GPS location,
                  signal strength, and receive emergency broadcasts — cyclone warnings,
                  storm surge alerts, and danger signals — directly from field devices.
                  No login required.
                </p>

                {/* feature pills */}
                <div className="flex flex-wrap gap-2">
                  {[
                    { icon: '📡', label: 'GPS Tracking' },
                    { icon: '🌀', label: 'Cyclone Alerts' },
                    { icon: '📶', label: 'Signal Monitor' },
                    { icon: '🇧🇩', label: 'Bangla Broadcast' },
                    { icon: '⚡', label: 'Live Transmission Log' },
                  ].map(({ icon, label }) => (
                    <span key={label}
                      className="flex items-center gap-1 text-[10px] font-medium px-2.5 py-1 rounded-full bg-zinc-950/50 border border-zinc-800 text-zinc-300 group-hover:border-accent-teal/30 transition-colors">
                      <span>{icon}</span>
                      <span>{label}</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* enter button */}
            <div className="mt-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-t border-zinc-800/50 pt-5">
              <div className="flex flex-wrap items-center gap-2 md:gap-3 text-xs text-zinc-500 font-medium">
                <span className="text-zinc-400">RAK4631-BD-001</span>
                <span className="hidden md:inline">·</span>
                <span>868.1 MHz · SF9</span>
                <span className="hidden md:inline">·</span>
                <span>Teknaf, Cox's Bazar</span>
              </div>
              <button
                onClick={e => { e.stopPropagation(); navigate('/lora'); }}
                className="group/btn flex items-center gap-2 px-5 py-2.5 rounded-xl bg-accent-teal/10 text-accent-teal font-semibold text-sm hover:bg-accent-teal hover:text-white border border-accent-teal/20 hover:border-accent-teal hidden md:flex transition-all duration-300 shadow-lg"
              >
                Open Monitor
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                  className="w-3.5 h-3.5 group-hover/btn:translate-x-1 transition-transform" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m9 18 6-6-6-6"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
          )}

        {/* Tech badge */}
        <div className="mt-12 mb-8 flex flex-wrap justify-center items-center gap-3 md:gap-4 text-xs text-zinc-600 font-medium animate-in fade-in duration-1000 delay-700 fill-mode-both">
          <span>Impact-Based Forecasting</span>
          <span className="hidden md:inline">·</span>
          <span>Geospatial Analysis</span>
          <span className="hidden md:inline">·</span>
          <span>LoRa Mesh Network</span>
          <span className="hidden md:inline">·</span>
          <span>Multichannel Alerts</span>
        </div>
      </div>
    </div>
  );
}
