import { useAppStore } from '../../store/useAppStore';
import { useNavigate } from 'react-router-dom';

export function RoleSwitch() {
  const { mode, setMode } = useAppStore();
  const navigate = useNavigate();

  const handleSwitch = (newMode: 'operations' | 'community') => {
    setMode(newMode);
    // Step 10: Auto-navigate to the appropriate route
    if (newMode === 'community') navigate('/community');
    else navigate('/dashboard');
  };

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => handleSwitch('operations')}
        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
          mode === 'operations'
            ? 'bg-accent-teal/20 text-accent-teal'
            : 'text-ops-text-muted hover:text-ops-text'
        }`}
      >
        Operations
      </button>
      <button
        onClick={() => handleSwitch('community')}
        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
          mode === 'community'
            ? 'bg-severity-moderate/20 text-severity-moderate'
            : 'text-ops-text-muted hover:text-ops-text'
        }`}
      >
        Community
      </button>
    </div>
  );
}
