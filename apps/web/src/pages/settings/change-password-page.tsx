import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { ChangePasswordSchema } from '@nanchang/shared';
import { useChangePassword, getApiErrorMessage } from '../../hooks/use-auth';
import { FormField } from '../../components/ui/form-field';
import { ScreenShell } from '../../components/ui/screen-shell';
import { Spinner } from '../../components/ui/spinner';
import { useI18n } from '../../i18n';

// Extend the shared schema with a client-side confirm field.
// The API only receives currentPassword + newPassword.
const ChangePasswordFormSchema = ChangePasswordSchema.extend({
  confirmNewPassword: z.string().min(1, 'Required'),
}).refine((data) => data.newPassword === data.confirmNewPassword, {
  message: "Passwords don't match.",
  path: ['confirmNewPassword'],
});

type ChangePasswordForm = z.infer<typeof ChangePasswordFormSchema>;

export function ChangePasswordPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { mutateAsync, isPending } = useChangePassword();
  const [done, setDone] = useState(false);
  const [apiError, setApiError] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ChangePasswordForm>({
    resolver: zodResolver(ChangePasswordFormSchema),
  });

  // Strip the client-only confirm field before sending to the API.
  const onSubmit = handleSubmit(async ({ confirmNewPassword: _confirm, ...data }) => {
    setApiError('');
    try {
      await mutateAsync(data);
      setDone(true);
    } catch (err) {
      setApiError(getApiErrorMessage(err, t('error')));
    }
  });

  if (done) {
    return (
      <ScreenShell title={t('changePassword')} onBack={() => navigate('/account')}>
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
          <h2 className="text-lg font-bold text-mj-bone mb-2">{t('passwordChanged')}</h2>
          <button
            onClick={() => navigate('/account')}
            className="w-full mt-4 py-[14px] rounded-[14px] font-bold text-[14px] text-mj-slate
                       bg-gradient-to-b from-mj-gold to-mj-gold-2 shadow-cta"
          >
            {t('back')}
          </button>
        </div>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell title={t('changePassword')} onBack={() => navigate('/account')}>
      <div className="px-5 py-6">
        <form onSubmit={onSubmit} noValidate>
          <FormField
            label={t('currentPassword')}
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            error={errors.currentPassword}
            {...register('currentPassword')}
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
          <FormField
            label={t('confirmPassword')}
            type="password"
            autoComplete="new-password"
            placeholder="••••••••"
            error={errors.confirmNewPassword}
            {...register('confirmNewPassword')}
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
            {t('saveChanges')}
          </button>
        </form>
      </div>
    </ScreenShell>
  );
}
