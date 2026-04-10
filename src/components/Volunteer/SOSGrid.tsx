import { Heart, Anchor, AlertTriangle, Package, ShieldAlert } from 'lucide-react';

export interface SOSCategory {
  id: string;
  code: string;
  label_en: string;
  label_bn: string;
  color: string;
  bg: string;
  border: string;
  icon: React.ReactNode;
  severity: string;
}

export const SOS_CATEGORIES: SOSCategory[] = [
  {
    id: 'medical_evac',
    code: 'Code Red',
    label_en: 'Medical Evac',
    label_bn: 'জরুরি চিকিৎসা',
    color: 'text-white',
    bg: 'bg-red-700 hover:bg-red-600 active:bg-red-500',
    border: 'border-red-500',
    icon: <Heart size={40} strokeWidth={2.5} />,
    severity: 'Critical',
  },
  {
    id: 'stranded',
    code: 'Code Orange',
    label_en: 'Stranded',
    label_bn: 'আটকে আছি',
    color: 'text-white',
    bg: 'bg-orange-700 hover:bg-orange-600 active:bg-orange-500',
    border: 'border-orange-500',
    icon: <Anchor size={40} strokeWidth={2.5} />,
    severity: 'High',
  },
  {
    id: 'route_blocked',
    code: 'Code Yellow',
    label_en: 'Route Blocked',
    label_bn: 'রাস্তা বন্ধ',
    color: 'text-black',
    bg: 'bg-yellow-500 hover:bg-yellow-400 active:bg-yellow-300',
    border: 'border-yellow-400',
    icon: <AlertTriangle size={40} strokeWidth={2.5} />,
    severity: 'High',
  },
  {
    id: 'supply_critical',
    code: 'Code Blue',
    label_en: 'Supply Critical',
    label_bn: 'সরবরাহ শেষ',
    color: 'text-white',
    bg: 'bg-blue-700 hover:bg-blue-600 active:bg-blue-500',
    border: 'border-blue-500',
    icon: <Package size={40} strokeWidth={2.5} />,
    severity: 'Medium',
  },
  {
    id: 'security_risk',
    code: 'Code Black',
    label_en: 'Security Risk',
    label_bn: 'নিরাপত্তা ঝুঁকি',
    color: 'text-white',
    bg: 'bg-zinc-900 hover:bg-zinc-800 active:bg-zinc-700',
    border: 'border-zinc-500',
    icon: <ShieldAlert size={40} strokeWidth={2.5} />,
    severity: 'Critical',
  },
];

interface SOSGridProps {
  onSelect: (category: SOSCategory) => void;
  disabled: boolean;
}

export function SOSGrid({ onSelect, disabled }: SOSGridProps) {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-3 p-3 sm:p-4 flex-1">
      {SOS_CATEGORIES.map((cat) => (
        <button
          key={cat.id}
          disabled={disabled}
          onClick={() => onSelect(cat)}
          className={`
            ${cat.bg} ${cat.color} ${cat.border}
            border-2 rounded-2xl flex flex-col items-center justify-center gap-3
            [&>svg]:w-8 [&>svg]:h-8 sm:[&>svg]:w-10 sm:[&>svg]:h-10
            transition-all duration-150 select-none
            disabled:opacity-40 disabled:cursor-not-allowed
            active:scale-95
            min-h-[112px] sm:min-h-[128px]
          `}
        >
          {cat.icon}
          <span className="text-base sm:text-lg font-extrabold tracking-tight leading-tight text-center px-1">
            {cat.label_en}
          </span>
          <span className="text-sm sm:text-base font-semibold opacity-80 text-center px-1 leading-tight">
            {cat.label_bn}
          </span>
          <span className="text-[10px] sm:text-[11px] font-mono uppercase tracking-wide sm:tracking-widest opacity-70">
            {cat.code}
          </span>
        </button>
      ))}
    </div>
  );
}
