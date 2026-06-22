import { motion, AnimatePresence } from 'framer-motion';
import { X, Copy, MessageCircle, Share2 } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { fadeVariants, sheetVariants, useMotionPrefs } from '@/shared/lib/motion';

interface ShareSheetProps {
  open: boolean;
  onClose: () => void;
  leagueName: string;
  code: string;
  stakesMeme?: string;
}

// Selector de enfocables para el focus-trap del sheet.
const FOCUSABLE =
  'a[href],area[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Focus-trap accesible: foco inicial al abrir, ciclo Tab/Shift+Tab dentro del
 * contenedor y restauración del foco al disparador al cerrar. Independiente de
 * animación (cumple con reduce-motion).
 */
function useFocusTrap(active: boolean) {
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const focusables = container.querySelectorAll<HTMLElement>(FOCUSABLE);
    (focusables[0] ?? container).focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Tab') return;
      const els = Array.from(container!.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === container,
      );
      if (els.length === 0) {
        e.preventDefault();
        container!.focus();
        return;
      }
      const first = els[0];
      const last = els[els.length - 1];
      const activeEl = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (activeEl === first || activeEl === container || !container!.contains(activeEl)) {
          e.preventDefault();
          last.focus();
        }
      } else if (activeEl === last) {
        e.preventDefault();
        first.focus();
      }
    }

    container.addEventListener('keydown', onKeyDown);
    return () => {
      container.removeEventListener('keydown', onKeyDown);
      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus();
      }
    };
  }, [active]);
  return containerRef;
}

export function ShareSheet({ open, onClose, leagueName, code, stakesMeme }: ShareSheetProps) {
  const [copied, setCopied] = useState(false);
  const { reduced } = useMotionPrefs();
  const titleId = useId();
  const sheetRef = useFocusTrap(open);

  // Cierre con Escape + lock de scroll del body mientras está abierto.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  const inviteUrl = `${window.location.origin}/j/${code}`;
  const whatsappText = encodeURIComponent(
    `¡Sumate a mi liga del Mundialito 2026! 🏆\n*${leagueName}*${stakesMeme ? `\n_${stakesMeme}_ 🍺` : ''}\nCódigo: *${code}* · ${inviteUrl}`
  );

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      await navigator.share({ title: leagueName, text: `Código: ${code}`, url: inviteUrl });
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            variants={fadeVariants(reduced)}
            initial="initial"
            animate="animate"
            exit="exit"
            className="fixed inset-0 bg-black/50 z-40"
            onClick={onClose}
          />
          <motion.div
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            variants={sheetVariants(reduced)}
            initial="initial"
            animate="animate"
            exit="exit"
            className="fixed bottom-0 left-0 right-0 z-50 bg-card rounded-t-2xl p-6 flex flex-col gap-4 outline-none"
          >
            <div className="flex items-center justify-between">
              <p id={titleId} className="text-base-s font-bold text-text">Invitar a la liga</p>
              <button
                onClick={onClose}
                aria-label="Cerrar"
                className="inline-flex items-center justify-center min-w-[44px] min-h-[44px] rounded-md bg-elevated text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <X size={18} />
              </button>
            </div>

            {/* Código */}
            <div className="flex items-center gap-3 p-4 rounded-xl bg-elevated border border-border">
              <div className="flex-1">
                <p className="text-xs-s text-muted mb-0.5">Código de liga</p>
                <p className="text-2xl-s font-display font-bold text-accent tracking-widest">{code}</p>
              </div>
              <button
                onClick={handleCopy}
                aria-label={copied ? 'Código copiado' : 'Copiar código'}
                className="inline-flex items-center justify-center min-h-[44px] px-4 py-2 rounded-lg bg-accent text-accent-on text-sm-s font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-card"
              >
                <span aria-live="polite">{copied ? '¡Copiado!' : <Copy size={16} aria-hidden="true" />}</span>
              </button>
            </div>

            {/* WhatsApp */}
            <a
              href={`https://wa.me/?text=${whatsappText}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 p-4 rounded-xl bg-[#25D366]/10 border border-[#25D366]/30 text-[#25D366]"
            >
              <MessageCircle size={20} />
              <span className="text-sm-s font-semibold">Compartir por WhatsApp</span>
            </a>

            {/* Native share (si disponible) */}
            {typeof navigator !== 'undefined' && 'share' in navigator && (
              <button
                onClick={handleNativeShare}
                className="flex items-center gap-3 p-4 rounded-xl bg-elevated border border-border text-text"
              >
                <Share2 size={20} />
                <span className="text-sm-s font-semibold">Más opciones de compartir</span>
              </button>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
