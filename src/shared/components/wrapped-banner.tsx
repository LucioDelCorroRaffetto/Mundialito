import { motion } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import { slideUpVariants, useMotionPrefs } from '@/shared/lib/motion';

const ACCENT = '#eab308';

export function WrappedBanner({ onOpen }: { onOpen: () => void }) {
  const { reduced } = useMotionPrefs();

  return (
    <motion.button
      onClick={onOpen}
      variants={slideUpVariants(reduced, 10)}
      initial="initial"
      animate="animate"
      className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg border text-left"
      style={{ borderColor: `${ACCENT}40`, backgroundColor: `${ACCENT}0d` }}
    >
      <div className="w-0.5 self-stretch rounded-full flex-shrink-0" style={{ backgroundColor: ACCENT }} />
      <span className="text-base flex-shrink-0" aria-hidden>🏆</span>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-widest leading-tight" style={{ color: ACCENT }}>
          Ver mi Wrapped
        </p>
        <p className="text-xs text-muted mt-0.5 leading-tight">Tu resumen del Mundial 2026</p>
      </div>
      <ChevronRight size={16} style={{ color: ACCENT }} className="flex-shrink-0" />
    </motion.button>
  );
}
