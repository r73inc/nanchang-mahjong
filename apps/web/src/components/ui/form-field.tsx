import { forwardRef, useState, type InputHTMLAttributes } from 'react';
import type { FieldError } from 'react-hook-form';
import { useI18n } from '../../i18n';

interface FormFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  /** react-hook-form FieldError, or a plain string for manual errors. */
  error?: FieldError | string;
  hint?: string;
  /** Pass the register() result via spread: {...register('field')} */
}

export const FormField = forwardRef<HTMLInputElement, FormFieldProps>(function FormField(
  { label, error, hint, id, type = 'text', ...inputProps },
  ref,
) {
  const { t } = useI18n();
  const fieldId = id ?? `field-${label.toLowerCase().replace(/\s+/g, '-')}`;
  const errorMsg = typeof error === 'string' ? error : error?.message;
  const [showPassword, setShowPassword] = useState(false);
  const isPasswordField = type === 'password';
  const inputType = isPasswordField && showPassword ? 'text' : type;

  return (
    <div className="mb-3">
      <label htmlFor={fieldId} className="flex flex-col gap-1">
        <span className="text-[11px] font-semibold tracking-[0.5px] opacity-70 uppercase text-mj-bone">
          {label}
        </span>
        <div className="relative flex">
          <input
            id={fieldId}
            ref={ref}
            type={inputType}
            className={[
              'flex-1 px-[14px] py-3 rounded-md text-sm text-mj-bone',
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
          {isPasswordField && (
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? 'Hide' : 'Show'}
              title={showPassword ? `${t('passwordHideTooltip')}` : `${t('passwordShowTooltip')}`}
              className="px-[12px] flex items-center text-mj-bone/60 hover:text-mj-bone transition-colors"
            >
              {showPassword ? (
                <svg
                  viewBox="0 0 24 24"
                  width="18"
                  height="18"
                  fill="currentColor"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" />
                </svg>
              ) : (
                <svg
                  viewBox="0 0 24 24"
                  width="18"
                  height="18"
                  fill="currentColor"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path d="M11.83 9L15.64 12.81c.04-.25.08-.5.08-.81 0-1.66-1.34-3-3-3-.3 0-.54.04-.81.08m7.08 0l5.59-5.59c.36-.36.58-.86.58-1.41 0-1.1-.9-2-2-2-.55 0-1.05.22-1.41.59L19.9 9m-12-7C6.47 2 2 6.48 2 12s4.47 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z" />
                </svg>
              )}
            </button>
          )}
        </div>
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
