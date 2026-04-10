import { useRef, useState, useCallback, useEffect } from 'react';
import { ChevronRight } from 'lucide-react';

interface SlideToConfirmProps {
  label: string;
  color: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function SlideToConfirm({ label, color, onConfirm, onCancel }: SlideToConfirmProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);

  const THUMB_SIZE = viewportWidth < 380 ? 52 : 64;
  const CONFIRM_THRESHOLD = viewportWidth < 380 ? 0.72 : 0.8;

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const getTrackWidth = useCallback(() => {
    return trackRef.current ? trackRef.current.offsetWidth - THUMB_SIZE : 0;
  }, [THUMB_SIZE]);

  const handleStart = useCallback(() => {
    draggingRef.current = true;
    setIsDragging(true);
  }, []);

  const handleMove = useCallback((clientX: number) => {
    if (!draggingRef.current || confirmed) return;
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return;
    const relativeX = clientX - rect.left - THUMB_SIZE / 2;
    const maxX = getTrackWidth();
    setDragX(Math.max(0, Math.min(relativeX, maxX)));
  }, [confirmed, getTrackWidth, THUMB_SIZE]);

  const handleEnd = useCallback(() => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setIsDragging(false);
    const maxX = getTrackWidth();
    if (maxX <= 0) {
      setDragX(0);
      return;
    }
    if (dragX / maxX >= CONFIRM_THRESHOLD) {
      setConfirmed(true);
      setDragX(maxX);
      // Haptic feedback
      if (navigator.vibrate) {
        navigator.vibrate(2000);
      }
      setTimeout(() => onConfirm(), 300);
    } else {
      setDragX(0);
    }
  }, [dragX, getTrackWidth, onConfirm, CONFIRM_THRESHOLD]);

  // Keep desktop mouse drag behavior across viewport.
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => handleMove(e.clientX);
    const onMouseUp = () => handleEnd();
    if (isDragging) {
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [isDragging, handleMove, handleEnd]);

  // Fallback touch tracking for mobile browsers where pointer capture is inconsistent.
  useEffect(() => {
    const onTouchMove = (e: TouchEvent) => {
      if (!draggingRef.current) return;
      const touch = e.touches[0];
      if (!touch) return;
      e.preventDefault();
      handleMove(touch.clientX);
    };
    const onTouchEnd = () => handleEnd();

    if (isDragging) {
      window.addEventListener('touchmove', onTouchMove, { passive: false });
      window.addEventListener('touchend', onTouchEnd);
      window.addEventListener('touchcancel', onTouchEnd);
    }

    return () => {
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [isDragging, handleMove, handleEnd]);

  const progress = getTrackWidth() > 0 ? dragX / getTrackWidth() : 0;

  const bgColorMap: Record<string, string> = {
    red: 'bg-red-700',
    orange: 'bg-orange-700',
    yellow: 'bg-yellow-500',
    blue: 'bg-blue-700',
    black: 'bg-zinc-900',
  };

  const thumbColorMap: Record<string, string> = {
    red: 'bg-red-500',
    orange: 'bg-orange-500',
    yellow: 'bg-yellow-300',
    blue: 'bg-blue-500',
    black: 'bg-zinc-600',
  };

  return (
    <div className="px-3 pb-3 pt-2 sm:p-4 space-y-3" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
      {/* Cancel Button */}
      <button
        onClick={onCancel}
        className="w-full py-2.5 rounded-lg bg-zinc-800 text-zinc-300 font-bold text-sm hover:bg-zinc-700 transition-colors"
      >
        ← Cancel / বাতিল
      </button>

      {/* Slide Track */}
      <div
        ref={trackRef}
        className={`relative rounded-full ${bgColorMap[color] || 'bg-zinc-700'} overflow-hidden select-none touch-none`}
        style={{ height: THUMB_SIZE }}
      >
        {/* Progress fill */}
        <div
          className="absolute inset-y-0 left-0 rounded-full opacity-30 bg-white transition-none"
          style={{ width: `${(dragX + THUMB_SIZE)}px` }}
        />

        {/* Label */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span
            className={`font-bold text-sm tracking-wide uppercase ${color === 'yellow' ? 'text-black' : 'text-white'}`}
            style={{ opacity: Math.max(0, 1 - progress * 2) }}
          >
            {confirmed ? '✓ SOS SENT / প্রেরিত' : `Slide to Confirm ${label}`}
          </span>
        </div>

        {/* Draggable Thumb */}
        <div
          ref={thumbRef}
          className={`absolute top-1 bottom-1 rounded-full ${thumbColorMap[color] || 'bg-white'} flex items-center justify-center shadow-lg cursor-grab active:cursor-grabbing transition-none touch-none ${confirmed ? 'opacity-0' : ''}`}
          style={{ width: THUMB_SIZE - 8, left: `${dragX + 4}px` }}
          onMouseDown={(e) => {
            handleStart();
            handleMove(e.clientX);
          }}
          onPointerDown={(e) => {
            handleStart();
            e.currentTarget.setPointerCapture(e.pointerId);
            handleMove(e.clientX);
          }}
          onPointerMove={(e) => {
            if (!draggingRef.current) return;
            handleMove(e.clientX);
          }}
          onPointerUp={(e) => {
            if (e.currentTarget.hasPointerCapture(e.pointerId)) {
              e.currentTarget.releasePointerCapture(e.pointerId);
            }
            handleEnd();
          }}
          onPointerCancel={(e) => {
            if (e.currentTarget.hasPointerCapture(e.pointerId)) {
              e.currentTarget.releasePointerCapture(e.pointerId);
            }
            handleEnd();
          }}
          onTouchStart={(e) => {
            const touch = e.touches[0];
            if (!touch) return;
            handleStart();
            handleMove(touch.clientX);
          }}
          onTouchMove={(e) => {
            e.preventDefault();
            const touch = e.touches[0];
            if (!touch) return;
            handleMove(touch.clientX);
          }}
          onTouchEnd={() => handleEnd()}
        >
          <ChevronRight size={viewportWidth < 380 ? 22 : 28} className={color === 'yellow' ? 'text-black' : 'text-white'} />
        </div>
      </div>
    </div>
  );
}
