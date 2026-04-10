import { useState, useEffect } from 'react';

interface AlertModalProps {
  isOpen: boolean;
  onClose: () => void;
  localityName: string;
}

export function AlertModal({ isOpen, onClose, localityName }: AlertModalProps) {
  const [isGenerating, setIsGenerating] = useState(true);

  useEffect(() => {
    if (isOpen) {
      setIsGenerating(true);
      const timer = setTimeout(() => {
        setIsGenerating(false);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-ops-surface border border-ops-border rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-4 border-b border-ops-border flex items-center justify-between">
          <h3 className="font-semibold text-ops-text">Disseminate Alert Package</h3>
          <button 
            onClick={onClose}
            className="text-ops-text-muted hover:text-ops-text transition-colors p-1"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </div>
        
        <div className="p-6 flex flex-col items-center text-center">
          {isGenerating ? (
            <>
              <div className="w-12 h-12 border-4 border-accent-primary border-t-transparent rounded-full animate-spin mb-4"></div>
              <h4 className="text-lg font-medium text-ops-text mb-2">Compiling Alert Package</h4>
              <p className="text-sm text-ops-text-muted">
                Gathering impact scores, evacuation maps, and operational directives for <strong>{localityName}</strong>...
              </p>
            </>
          ) : (
            <>
              <div className="w-12 h-12 bg-severity-safe/20 text-severity-safe rounded-full flex items-center justify-center mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg>
              </div>
              <h4 className="text-lg font-medium text-ops-text mb-2">Package Ready</h4>
              <p className="text-sm text-ops-text-muted mb-6">
                The alert package for <strong>{localityName}</strong> has been generated and is ready for dissemination to field operators.
              </p>
              
              <div className="flex gap-3 w-full">
                <button 
                  onClick={onClose}
                  className="flex-1 px-4 py-2 border border-ops-border rounded-lg text-sm font-medium text-ops-text hover:bg-ops-bg transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => {
                    alert('Package disseminated successfully!');
                    onClose();
                  }}
                  className="flex-1 px-4 py-2 bg-accent-primary text-black rounded-lg text-sm font-medium hover:bg-accent-primary/90 transition-colors shadow-[0_0_15px_rgba(56,189,248,0.4)]"
                >
                  Send Alert
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
