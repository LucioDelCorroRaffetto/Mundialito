import { motion, AnimatePresence } from 'framer-motion';
import { X, Copy, MessageCircle, Share2 } from 'lucide-react';
import { useState } from 'react';

interface ShareSheetProps {
  open: boolean;
  onClose: () => void;
  leagueName: string;
  code: string;
  stakesMeme?: string;
}

export function ShareSheet({ open, onClose, leagueName, code, stakesMeme }: ShareSheetProps) {
  const [copied, setCopied] = useState(false);

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
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-40"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-card rounded-t-2xl p-6 flex flex-col gap-4"
          >
            <div className="flex items-center justify-between">
              <p className="text-base-s font-bold text-text">Invitar a la liga</p>
              <button onClick={onClose} className="p-2 rounded-md bg-elevated text-muted">
                <X size={16} />
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
                className="px-4 py-2 rounded-lg bg-accent text-accent-on text-sm-s font-semibold"
              >
                {copied ? '¡Copiado!' : <Copy size={16} />}
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
