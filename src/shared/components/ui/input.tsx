import { forwardRef, useId, type InputHTMLAttributes } from 'react';
import { cn } from '@/shared/lib/cn';

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  error?: string;
};

export const Input = forwardRef<HTMLInputElement, Props>(function Input(
  { label, error, className, id, 'aria-describedby': describedBy, ...rest },
  ref
) {
  // id estable garantizado: el provisto, el name, o uno generado. Así label
  // ↔ input quedan asociados aunque no pasen id/name.
  const reactId = useId();
  const inputId = id ?? rest.name ?? reactId;
  const errorId = `${inputId}-error`;
  // Preservar cualquier aria-describedby externo y sumarle el del error.
  const describedByIds = [describedBy, error ? errorId : undefined]
    .filter(Boolean)
    .join(' ') || undefined;

  return (
    <div className="flex flex-col gap-1.5 w-full">
      {label && (
        <label htmlFor={inputId} className="text-sm-s font-semibold text-text">
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedByIds}
        className={cn(
          'h-12 px-4 rounded-md bg-elevated border border-border text-text text-base-s',
          'placeholder:text-muted',
          'focus:outline-none focus:border-accent focus:bg-card transition-colors',
          'focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
          error && 'border-red-500 focus:border-red-500',
          className
        )}
        {...rest}
      />
      {error && (
        <span id={errorId} role="alert" className="text-xs-s text-red-400">
          {error}
        </span>
      )}
    </div>
  );
});
