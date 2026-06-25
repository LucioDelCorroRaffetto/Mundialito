import { useRef, useState } from 'react';
import { Camera, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { resizeImageToBase64 } from '@/shared/lib/image';
import { cn } from '@/shared/lib/cn';

interface AvatarPickerProps {
  /** Current image URL (base64 or https). Null = no image. */
  value: string | null;
  onChange: (value: string | null) => void;
  /** Diameter in px. Default 80. */
  size?: number;
  /** Fallback text when no image (e.g. username initial). */
  fallback?: string;
  shape?: 'circle' | 'rounded';
  disabled?: boolean;
}

/**
 * Tappable avatar / image picker.
 * Shows a camera-icon overlay. On tap → opens file picker → resizes → calls onChange.
 */
export function AvatarPicker({
  value,
  onChange,
  size = 80,
  fallback,
  shape = 'circle',
  disabled = false,
}: AvatarPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // reset so the same file can be picked again
    e.target.value = '';

    setLoading(true);
    try {
      const base64 = await resizeImageToBase64(file, 300, 0.85);
      onChange(base64);
    } catch (err) {
      // Surface the failure instead of swallowing it — on mobile (iPhone
      // HEIC photos, very large images that blow iOS's canvas limit) this
      // path fired silently, so the user just saw "nothing happens".
      console.error('[AvatarPicker] resize failed', {
        name: file.name,
        type: file.type,
        size: file.size,
        err,
      });
      const msg = err instanceof Error ? err.message : 'No se pudo procesar la imagen';
      toast.error(`No se pudo procesar la foto: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  const radius = shape === 'circle' ? 'rounded-full' : 'rounded-xl';

  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      {/* Image / fallback */}
      <div
        className={cn(
          'w-full h-full overflow-hidden bg-elevated border-2 border-border flex items-center justify-center',
          radius,
        )}
      >
        {value ? (
          <img src={value} alt="avatar" className="w-full h-full object-cover" />
        ) : (
          <span className="text-2xl font-display font-bold text-muted select-none">
            {fallback ?? '?'}
          </span>
        )}
      </div>

      {/* Camera overlay button */}
      {!disabled && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className={cn(
            'absolute inset-0 flex items-center justify-center',
            'bg-black/40 opacity-0 hover:opacity-100 active:opacity-100 transition-opacity',
            radius,
          )}
          aria-label="Cambiar imagen"
        >
          {loading ? (
            <Loader2 size={size / 3} className="text-white animate-spin" />
          ) : (
            <Camera size={size / 3} className="text-white" />
          )}
        </button>
      )}

      {/* Remove button (top-right) */}
      {value && !disabled && (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 flex items-center justify-center shadow-md"
          aria-label="Quitar imagen"
        >
          <X size={11} className="text-white" />
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFile}
      />
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
   LeagueBannerPicker — wider banner format for leagues
   ────────────────────────────────────────────────────────────── */
interface BannerPickerProps {
  value: string | null;
  onChange: (value: string | null) => void;
  disabled?: boolean;
}

export function LeagueBannerPicker({ value, onChange, disabled = false }: BannerPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    setLoading(true);
    try {
      // Wider max for banners (still reasonable file size)
      const base64 = await resizeImageToBase64(file, 600, 0.8);
      onChange(base64);
    } catch (err) {
      console.error('[LeagueBannerPicker] resize failed', {
        name: file.name,
        type: file.type,
        size: file.size,
        err,
      });
      const msg = err instanceof Error ? err.message : 'No se pudo procesar la imagen';
      toast.error(`No se pudo procesar la imagen: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative w-full">
      <div
        className="w-full h-28 rounded-xl overflow-hidden bg-elevated border-2 border-dashed border-border flex items-center justify-center cursor-pointer hover:border-accent-border transition-colors"
        onClick={() => !disabled && inputRef.current?.click()}
      >
        {value ? (
          <img src={value} alt="banner" className="w-full h-full object-cover" />
        ) : (
          <div className="flex flex-col items-center gap-1.5 text-muted pointer-events-none">
            {loading ? (
              <Loader2 size={24} className="animate-spin" />
            ) : (
              <>
                <Camera size={24} />
                <span className="text-xs font-semibold">Agregar imagen (opcional)</span>
              </>
            )}
          </div>
        )}

        {/* Overlay on hover when has image */}
        {value && !disabled && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity rounded-xl">
            {loading ? (
              <Loader2 size={24} className="text-white animate-spin" />
            ) : (
              <Camera size={24} className="text-white" />
            )}
          </div>
        )}
      </div>

      {value && !disabled && (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/60 flex items-center justify-center"
          aria-label="Quitar imagen"
        >
          <X size={12} className="text-white" />
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFile}
      />
    </div>
  );
}
