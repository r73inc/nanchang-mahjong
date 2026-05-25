import { forwardRef, type InputHTMLAttributes } from 'react';
import type { FieldError } from 'react-hook-form';

interface FormFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  /** react-hook-form FieldError, or a plain string for manual errors. */
  error?: FieldError | string;
  hint?: string;
  /** Pass the register() result via spread: {...register('field')} */
}

export const FormField = forwardRef<HTMLInputElement, FormFieldProps>(function FormField(
  { label, error, hint, id, ...inputProps },
  ref,
) {
  const fieldId = id ?? `field-${label.toLowerCase().replace(/\s+/g, '-')}`;
  const errorMsg = typeof error === 'string' ? error : error?.message;

  return (
    <div className="mb-3">
      <label htmlFor={fieldId} className="flex flex-col gap-1">
        <span className="text-[11px] font-semibold tracking-[0.5px] opacity-70 uppercase text-mj-bone">
          {label}
        </span>
        <input
          id={fieldId}
          ref={ref}
          className={[
            'px-[14px] py-3 rounded-md text-sm text-mj-bone',
            'outline-none font-sans',
            'transition-colors duration-fast',
            errorMsg
              ? 'border border-mj-loss/55 bg-mj-bone/[0.07]'
              : 'border border-mj-bone/15 bg-mj-bone/[0.07] focus:border-mj-gold/50',
          ].join(' ')}
          aria-invalid={!!errorMsg}
          aria-describedby={errorMsg ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined}
          {...inputProps}
        />
      </label>

      {errorMsg && (
        <p
          id={`${fieldId}-error`}
          role="alert"
          className="mt-1 text-[11px] text-mj-loss-light font-medium"
        >
          {errorMsg}
        </p>
      )}

      {hint && !errorMsg && (
        <p id={`${fieldId}-hint`} className="mt-1 text-[11px] opacity-55 text-mj-bone">
          {hint}
        </p>
      )}
    </div>
  );
});
