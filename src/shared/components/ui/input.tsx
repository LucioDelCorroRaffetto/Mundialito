import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/shared/lib/cn';

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  error?: string;
};

export const Input = forwardRef<HTMLInputElement, Props>(function Input(
  { label, error, className, id, ...rest },
  ref
) {
  const inputId = id ?? rest.name;
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
        aria-invalid={!!error}
        aria-describedby={error ? `${inputId}-error` : undefined}
        className={cn(
          'h-12 px-4 rounded-md bg-elevated border border-border text-text text-base-s',
          'placeholder:text-muted',
          'focus:outline-none focus:border-accent focus:bg-card transition-colors',
          error && 'border-red-500 focus:border-red-500',
          className
        )}
        {...rest}
      />
      {error && (
        <span id={`${inputId}-error`} role="alert" className="text-xs-s text-red-400">
          {error}
        </span>
      )}
    </div>
  );
});
