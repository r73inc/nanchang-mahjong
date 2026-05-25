import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate, useLocation } from 'react-router-dom';
import { ConfirmForgotPasswordSchema, type ConfirmForgotPasswordInput } from '@nanchang/shared';
import { useConfirmReset, getApiErrorMessage } from '../../hooks/use-auth';
import { FormField } from '../../components/ui/form-field';
import { ScreenShell } from '../../components/ui/screen-shell';
import { Spinner } from '../../components/ui/spinner';
import { useI18n } from '../../i18n';

export function ConfirmResetPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const { mutateAsync, isPending } = useConfirmReset();
  const [done, setDone] = useState(false);
  const [apiError, setApiError] = useState('');

  // Pre-fill email if passed via router state (from ForgotPasswordPage)
  const prefillEmail = (location.state as { email?: string } | null)?.email ?? '';

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ConfirmForgotPasswordInput>({
    resolver: zodResolver(ConfirmForgotPasswordSchema),
    defaultValues: { email: prefillEmail },
  });

  const onSubmit = handleSubmit(async (data) => {
    setApiError('');
    try {
      await mutateAsync(data);
      setDone(true);
    } catch (err) {
      setApiError(getApiErrorMessage(err, t('error')));
    }
  });

  const handleBack = () => navigate('/auth');

  if (done) {
    return (
      <ScreenShell title={t('confirmReset')} onBack={handleBack}>
        <div className="px-5 py-8 text-center">
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
          <h2 className="text-lg font-bold text-mj-bone mb-2">{t('passwordReset')}</h2>
          <p className="text-[13px] text-mj-bone/70 leading-relaxed max-w-[280px] mx-auto mb-7">
            {t('passwordResetDesc')}
          </p>
          <button
            onClick={handleBack}
            className="w-full py-[14px] rounded-[14px] font-bold text-[14px] text-mj-slate
                       bg-gradient-to-b from-mj-gold to-mj-gold-2 shadow-cta"
          >
            {t('signIn')}
          </button>
        </div>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell title={t('confirmReset')} onBack={() => navigate('/forgot-password')}>
      <div className="px-5 py-6">
        <p className="text-sm text-mj-bone/75 leading-relaxed mb-5">{t('confirmResetDesc')}</p>

        <form onSubmit={onSubmit} noValidate>
          <FormField
            label={t('email')}
            type="email"
            autoComplete="email"
            placeholder={t('emailPlaceholder')}
            error={errors.email}
            {...register('email')}
          />
          <FormField
            label={t('resetCode')}
            type="text"
            inputMode="numeric"
            maxLength={6}
            autoComplete="one-time-code"
            placeholder={t('resetCodePlaceholder')}
            error={errors.code}
            {...register('code')}
          />
          <FormField
            label={t('newPassword')}
            type="password"
            autoComplete="new-password"
            placeholder="••••••••"
            hint={t('passwordHint')}
            error={errors.newPassword}
            {...register('newPassword')}
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
            {t('setPassword')}
          </button>
        </form>
      </div>
    </ScreenShell>
  );
}
