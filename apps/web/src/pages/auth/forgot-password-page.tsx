import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from 'react-router-dom';
import { ForgotPasswordSchema, type ForgotPasswordInput } from '@nanchang/shared';
import { useForgotPassword, getApiErrorMessage } from '../../hooks/use-auth';
import { FormField } from '../../components/ui/form-field';
import { ScreenShell } from '../../components/ui/screen-shell';
import { Spinner } from '../../components/ui/spinner';
import { useI18n } from '../../i18n';

export function ForgotPasswordPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { mutateAsync, isPending } = useForgotPassword();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [apiError, setApiError] = useState('');

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<ForgotPasswordInput>({ resolver: zodResolver(ForgotPasswordSchema) });

  const onSubmit = handleSubmit(async (data) => {
    setApiError('');
    try {
      // The API always returns 204 regardless of whether the email exists (no enumeration).
      await mutateAsync(data);
      setSentTo(data.email);
    } catch (err) {
      setApiError(getApiErrorMessage(err, t('error')));
    }
  });

  const handleBack = () => navigate('/auth');

  if (sentTo) {
    return (
      <ScreenShell title={t('resetPassword')} onBack={handleBack}>
        <div className="px-5 py-6 text-center">
          {/* Success icon */}
          <div
            className="w-16 h-16 mx-auto mb-5 rounded-[20px] flex items-center justify-center text-mj-win text-3xl"
            style={{
              background: 'rgba(127,194,153,0.15)',
              border: '1px solid rgba(127,194,153,0.45)',
            }}
            aria-hidden="true"
          >
            ✓
          </div>

          <h2 className="text-lg font-bold text-mj-bone mb-2">{t('checkInbox')}</h2>
          <p className="text-[13px] text-mj-bone/70 leading-relaxed max-w-[280px] mx-auto mb-7">
            {t('checkInboxDesc', sentTo)}
          </p>

          <button
            onClick={handleBack}
            className="w-full py-[14px] rounded-[14px] font-bold text-[14px] text-mj-slate
                       bg-gradient-to-b from-mj-gold to-mj-gold-2 shadow-cta"
          >
            {t('backToSignIn')}
          </button>

          <p className="mt-4 text-xs text-mj-bone/55">
            {t('didntReceive')}{' '}
            <button
              onClick={() => {
                setSentTo(null);
              }}
              className="text-mj-gold font-semibold bg-transparent border-none cursor-pointer"
            >
              {t('resendCode')}
            </button>
          </p>

          <p className="mt-3 text-xs text-mj-bone/55">
            {t('rememberedPassword')}{' '}
            <button
              onClick={handleBack}
              className="text-mj-gold font-semibold bg-transparent border-none cursor-pointer"
            >
              {t('backToSignIn')}
            </button>
          </p>

          {/* Link to confirm-reset for users who have their code */}
          <button
            onClick={() => navigate('/confirm-reset', { state: { email: getValues('email') } })}
            className="mt-5 w-full py-3 rounded-md text-sm font-medium text-mj-bone/70
                       bg-transparent border border-mj-bone/15"
          >
            {t('haveMyCode')}
          </button>
        </div>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell title={t('resetPassword')} onBack={handleBack}>
      <div className="px-5 py-6">
        <p className="text-sm text-mj-bone/75 leading-relaxed mb-5">{t('resetPasswordDesc')}</p>

        <form onSubmit={onSubmit} noValidate>
          <FormField
            label={t('email')}
            type="email"
            autoComplete="email"
            placeholder={t('emailPlaceholder')}
            error={errors.email}
            {...register('email')}
          />

          {apiError && (
            <p role="alert" className="mb-3 text-xs text-mj-loss-light font-medium">
              {apiError}
            </p>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="w-full mt-5 py-[14px] rounded-[14px] font-bold text-[14px] text-mj-slate
                       bg-gradient-to-b from-mj-gold to-mj-gold-2 shadow-cta
                       flex items-center justify-center gap-2
                       disabled:opacity-70 disabled:cursor-wait"
          >
            {isPending && <Spinner />}
            {t('sendResetCode')}
          </button>

          <p className="mt-4 text-center text-xs text-mj-bone/60">
            {t('rememberedPassword')}{' '}
            <button
              type="button"
              onClick={handleBack}
              className="text-mj-gold font-semibold bg-transparent border-none cursor-pointer"
            >
              {t('backToSignIn')}
            </button>
          </p>
        </form>
      </div>
    </ScreenShell>
  );
}
