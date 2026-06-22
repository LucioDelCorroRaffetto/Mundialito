import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { motion, type HTMLMotionProps } from 'framer-motion';
import { cn } from '@/shared/lib/cn';
import { tapScale, useMotionPrefs } from '@/shared/lib/motion';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

// Omitimos las props de animación de framer que chocan con los handlers
// nativos de React (onDrag, onAnimationStart, etc.) — el botón es un control
// estándar, no necesita exponerlas.
type Props = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  keyof Pick<HTMLMotionProps<'button'>, 'onDrag' | 'onDragEnd' | 'onDragStart' | 'onAnimationStart' | 'onAnimationEnd'>
> & {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  loading?: boolean;
};

const variantStyles: Record<Variant, string> = {
  primary: 'bg-accent text-accent-on hover:opacity-90 active:opacity-80',
  secondary: 'bg-elevated text-text border border-border hover:bg-card',
  ghost: 'bg-transparent text-text hover:bg-elevated',
  danger: 'bg-red-500 text-white hover:bg-red-600',
};

const sizeStyles: Record<Size, string> = {
  sm: 'h-10 px-4 text-sm-s',
  md: 'h-12 px-6 text-base-s',
  lg: 'h-14 px-8 text-lg-s',
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = 'primary', size = 'md', fullWidth, loading, className, children, disabled, ...rest },
  ref
) {
  const { reduced } = useMotionPrefs();
  const isDisabled = disabled || loading;

  return (
    <motion.button
      ref={ref}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      aria-disabled={isDisabled || undefined}
      // Feedback de tap sutil. Se desactiva con reduce-motion o si está
      // deshabilitado (no debe "responder" cuando no es accionable).
      whileTap={reduced || isDisabled ? undefined : tapScale}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-md font-semibold transition-all whitespace-nowrap',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
        variantStyles[variant],
        sizeStyles[size],
        fullWidth && 'w-full',
        className
      )}
      {...(rest as HTMLMotionProps<'button'>)}
    >
      {loading ? (
        <>
          <span
            aria-hidden="true"
            className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
          />
          <span className="sr-only">Cargando…</span>
        </>
      ) : (
        children
      )}
    </motion.button>
  );
});
