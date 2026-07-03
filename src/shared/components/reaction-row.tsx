import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Plus } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { useMotionPrefs, scaleVariants, tapScale } from '@/shared/lib/motion';
import { useHaptic } from '@/shared/hooks/use-haptic';
import {
  ALLOWED_REACTIONS,
  type AllowedReaction,
  type PredictionReactionSummary,
} from '@/shared/hooks/use-reactions';

export function ReactionRow({
  predictionId,
  reactions,
  readOnly,
  onToggle,
}: {
  predictionId: number;
  reactions: PredictionReactionSummary[];
  readOnly: boolean;
  onToggle: (emoji: AllowedReaction) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { reduced } = useMotionPrefs();
  const { vibrate } = useHaptic();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const rows = reactions.filter((r) => r.predictionId === predictionId && r.count > 0);

  const handleToggle = (emoji: AllowedReaction) => {
    vibrate(10);
    onToggle(emoji);
    setOpen(false);
  };

  return (
    <div className="flex items-center gap-1.5 flex-wrap mt-1.5 relative" ref={ref}>
      {rows.map((r) => (
        <motion.button
          key={r.emoji}
          disabled={readOnly}
          onClick={() => handleToggle(r.emoji as AllowedReaction)}
          whileTap={readOnly ? undefined : tapScale}
          className={cn(
            'flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-xs-s',
            r.reactedByMe
              ? 'bg-accent/15 border-accent-border'
              : 'bg-elevated border-border',
            readOnly && 'opacity-80 cursor-default',
          )}
        >
          <span>{r.emoji}</span>
          <span className="tabular-nums text-muted">{r.count}</span>
        </motion.button>
      ))}

      {!readOnly && (
        <button
          onClick={() => setOpen((v) => !v)}
          className="w-6 h-6 rounded-full bg-elevated border border-border flex items-center justify-center text-muted active:scale-95 transition-transform"
          aria-label="Reaccionar"
        >
          <Plus size={12} />
        </button>
      )}

      <AnimatePresence>
        {open && (
          <motion.div
            variants={scaleVariants(reduced)}
            initial="initial"
            animate="animate"
            exit="exit"
            className="absolute bottom-full left-0 mb-1.5 flex items-center gap-1 p-1.5 rounded-full bg-card border border-border shadow-card z-10"
          >
            {ALLOWED_REACTIONS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => handleToggle(emoji)}
                className="w-7 h-7 rounded-full flex items-center justify-center text-base active:scale-90 transition-transform hover:bg-elevated"
              >
                {emoji}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
