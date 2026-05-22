import { forwardRef, useState, type InputHTMLAttributes } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '@/shared/lib/cn';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  label?: string;
  error?: string;
};

export const PasswordInput = forwardRef<HTMLInputElement, Props>(function PasswordInput(
  { label, error, className, id, ...rest },
  ref
) {
  const [show, setShow] = useState(false);
  const inputId = id ?? rest.name;

  return (
    <div className="flex flex-col gap-1.5 w-full">
      {label && (
        <label htmlFor={inputId} className="text-sm-s font-semibold text-text">
          {label}
        </label>
      )}
      <div className="relative">
        <input
          ref={ref}
          id={inputId}
          type={show ? 'text' : 'password'}
          aria-invalid={!!error}
          aria-describedby={error ? `${inputId}-error` : undefined}
          className={cn(
            'h-12 w-full pl-4 pr-11 rounded-md bg-elevated border border-border text-text text-base-s',
            'placeholder:text-muted',
            'focus:outline-none focus:border-accent focus:bg-card transition-colors',
            error && 'border-red-500 focus:border-red-500',
            className
          )}
          {...rest}
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          tabIndex={-1}
          aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-text transition-colors p-1"
        >
          {show ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
      {error && (
        <span id={`${inputId}-error`} role="alert" className="text-xs-s text-red-400">
          {error}
        </span>
      )}
    </div>
  );
});
