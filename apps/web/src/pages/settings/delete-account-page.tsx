import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth.store';
import { useDeleteAccount, getApiErrorMessage } from '../../hooks/use-auth';
import { FormField } from '../../components/ui/form-field';
import { ScreenShell } from '../../components/ui/screen-shell';
import { Spinner } from '../../components/ui/spinner';
import { useI18n } from '../../i18n';

interface ConfirmForm {
  confirmText: string;
}

type Step = 'warning' | 'confirm';

export function DeleteAccountPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const { mutateAsync, isPending } = useDeleteAccount();
  const [step, setStep] = useState<Step>('warning');
  const [apiError, setApiError] = useState('');

  // The user must type their own handle to confirm.
  const confirmPhrase = user?.handle ?? 'DELETE';

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ConfirmForm>();

  const onSubmit = handleSubmit(async () => {
    setApiError('');
    try {
      await mutateAsync();
      // onSuccess in useDeleteAccount already calls clearAuth() + navigate('/auth')
    } catch (err) {
      setApiError(getApiErrorMessage(err, t('error')));
    }
  });

  // ── Step 1: warning ──────────────────────────────────────────────────────────

  if (step === 'warning') {
    return (
      <ScreenShell title={t('deleteAccount')} onBack={() => navigate('/home')}>
        <div className="px-5 py-6">
          {/* Danger card */}
          <div
            className="rounded-2xl px-5 py-5 mb-5"
            style={{
              background: 'rgba(240,96,96,0.08)',
              border: '1px solid rgba(240,96,96,0.30)',
            }}
          >
            <h2 className="text-base font-bold text-mj-loss-light mb-2">
              {t('deleteWarningTitle')}
            </h2>
            <p className="text-sm text-mj-bone/75 mb-3">{t('deleteWarningDesc')}</p>
            <ul className="space-y-2">
              {(
                [
                  'deleteConsequence1',
                  'deleteConsequence2',
                  'deleteConsequence3',
                  'deleteConsequence4',
                ] as const
              ).map((key) => (
                <li key={key} className="flex gap-2 text-sm text-mj-bone/70">
                  <span className="text-mj-loss-light mt-px flex-shrink-0" aria-hidden="true">
                    •
                  </span>
                  <span>{t(key)}</span>
                </li>
              ))}
            </ul>
          </div>

          <p className="text-sm text-mj-bone/60 leading-relaxed mb-6">{t('deleteAlternative')}</p>

          {/* Actions */}
          <button
            onClick={() => setStep('confirm')}
            className="w-full py-[14px] rounded-[14px] font-bold text-[14px] text-white mb-3"
            style={{ background: '#e05252' }}
          >
            {t('deleteUnderstand')}
          </button>

          <button
            onClick={() => navigate('/home')}
            className="w-full py-3 rounded-[14px] text-sm font-medium text-mj-bone/70
                       bg-transparent border border-mj-bone/15"
          >
            {t('cancel')}
          </button>
        </div>
      </ScreenShell>
    );
  }

  // ── Step 2: confirmation phrase ──────────────────────────────────────────────

  return (
    <ScreenShell title={t('deleteAccount')} onBack={() => setStep('warning')}>
      <div className="px-5 py-6">
        <p className="text-sm text-mj-bone/75 leading-relaxed mb-5">
          {t('deleteConfirmDesc', confirmPhrase)}
        </p>

        {/* Show the exact phrase so the user can see / copy it */}
        <div
          className="rounded-md px-3 py-2 mb-4 text-center text-sm font-mono font-bold text-mj-bone"
          style={{
            background: 'rgba(245,239,223,0.08)',
            border: '1px solid rgba(245,239,223,0.15)',
          }}
        >
          {confirmPhrase}
        </div>

        <form onSubmit={onSubmit} noValidate>
          <FormField
            label={t('deleteConfirmLabel')}
            type="text"
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder={confirmPhrase}
            error={errors.confirmText}
            {...register('confirmText', {
              validate: (val) => val === confirmPhrase || t('deleteTypeMismatch', confirmPhrase),
            })}
          />

          {apiError && (
            <p role="alert" className="mb-3 text-xs text-mj-loss-light font-medium">
              {apiError}
            </p>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="w-full mt-5 py-[14px] rounded-[14px] font-bold text-[14px] text-white
                       flex items-center justify-center gap-2
                       disabled:opacity-70 disabled:cursor-wait"
            style={{ background: '#e05252' }}
          >
            {isPending && <Spinner />}
            {t('deleteForever')}
          </button>
        </form>
      </div>
    </ScreenShell>
  );
}
