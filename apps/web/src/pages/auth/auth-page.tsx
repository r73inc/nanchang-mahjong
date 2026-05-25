import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { SignupSchema, SigninSchema, type SignupInput, type SigninInput } from '@nanchang/shared';
import { useSignup, useSignin, getApiErrorMessage } from '../../hooks/use-auth';
import { FormField } from '../../components/ui/form-field';
import { Spinner } from '../../components/ui/spinner';
import { LangToggle, useI18n } from '../../i18n';

// ── Sign-In form ─────────────────────────────────────────────────────────────

function SignInForm({ onSuccess }: { onSuccess: () => void }) {
  const { t, lang } = useI18n();
  const { mutateAsync, isPending } = useSignin();
  const [apiError, setApiError] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SigninInput>({ resolver: zodResolver(SigninSchema) });

  const onSubmit = handleSubmit(async (data) => {
    setApiError('');
    try {
      await mutateAsync(data);
      onSuccess();
    } catch (err) {
      setApiError(getApiErrorMessage(err, t('error')));
    }
  });

  return (
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
        label={t('password')}
        type="password"
        autoComplete="current-password"
        placeholder="••••••••"
        error={errors.password}
        {...register('password')}
      />

      <div className="flex justify-end mb-1 -mt-1">
        <Link to="/forgot-password" className="text-[12px] font-semibold text-mj-gold">
          {lang === 'zh' ? '忘记密码?' : t('forgotPassword')}
        </Link>
      </div>

      {apiError && (
        <p role="alert" className="mb-3 text-xs text-mj-loss-light font-medium">
          {apiError}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full mt-3 py-[14px] rounded-[14px] font-bold text-[15px] text-mj-slate
                   bg-gradient-to-b from-mj-gold to-mj-gold-2 shadow-cta
                   flex items-center justify-center gap-2
                   disabled:opacity-70 disabled:cursor-wait"
      >
        {isPending && <Spinner />}
        {isPending ? t('submitting') : t('signIn')}
      </button>
    </form>
  );
}

// ── Sign-Up form ─────────────────────────────────────────────────────────────

function SignUpForm({ onSuccess }: { onSuccess: () => void }) {
  const { t } = useI18n();
  const { mutateAsync, isPending } = useSignup();
  const [apiError, setApiError] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignupInput>({ resolver: zodResolver(SignupSchema) });

  const onSubmit = handleSubmit(async (data) => {
    setApiError('');
    try {
      await mutateAsync(data);
      onSuccess();
    } catch (err) {
      setApiError(getApiErrorMessage(err, t('error')));
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate>
      <FormField
        label={t('inviteCode')}
        type="text"
        autoComplete="off"
        hint={t('inviteCodeHint')}
        error={errors.inviteCode}
        {...register('inviteCode')}
      />
      <FormField
        label={t('displayName')}
        type="text"
        autoComplete="name"
        error={errors.displayName}
        {...register('displayName')}
      />
      <FormField
        label={t('handle')}
        type="text"
        autoComplete="username"
        placeholder={t('handlePlaceholder')}
        hint={t('handleHint')}
        error={errors.handle}
        {...register('handle')}
      />
      <FormField
        label={t('email')}
        type="email"
        autoComplete="email"
        placeholder={t('emailPlaceholder')}
        error={errors.email}
        {...register('email')}
      />
      <FormField
        label={t('password')}
        type="password"
        autoComplete="new-password"
        placeholder="••••••••"
        hint={t('passwordHint')}
        error={errors.password}
        {...register('password')}
      />

      {apiError && (
        <p role="alert" className="mb-3 text-xs text-mj-loss-light font-medium">
          {apiError}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full mt-3 py-[14px] rounded-[14px] font-bold text-[15px] text-mj-slate
                   bg-gradient-to-b from-mj-gold to-mj-gold-2 shadow-cta
                   flex items-center justify-center gap-2
                   disabled:opacity-70 disabled:cursor-wait"
      >
        {isPending && <Spinner />}
        {isPending ? t('submittingSignup') : t('signUp')}
      </button>
    </form>
  );
}

// ── Auth Page ─────────────────────────────────────────────────────────────────

type AuthMode = 'signin' | 'signup';

export function AuthPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState<AuthMode>('signin');

  const from = (location.state as { from?: Location } | null)?.from?.pathname ?? '/home';

  const handleSuccess = () => navigate(from, { replace: true });

  return (
    <div
      className="fixed inset-0 flex justify-center"
      style={{ background: 'linear-gradient(180deg, #0d3b2e 0%, #061a14 100%)' }}
    >
      <div
        className="w-full max-w-viewport flex flex-col px-6 overflow-y-auto"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 52px)', paddingBottom: 40 }}
        role="main"
      >
        {/* Lang toggle */}
        <div className="flex justify-end mb-2">
          <LangToggle />
        </div>

        {/* Brand mark */}
        <div className="text-center mb-7">
          <div
            className="font-serif text-[56px] text-mj-gold leading-none"
            aria-label="南昌麻将 Nanchang Mahjong"
          >
            南昌
          </div>
          <div className="font-mono text-[11px] tracking-[4px] mt-1.5 text-mj-bone/70 font-semibold">
            {t('appNameShort')}
          </div>
        </div>

        {/* Mode toggle */}
        <div
          className="flex p-1 rounded-md mb-5"
          style={{ background: 'rgba(245,239,223,0.06)' }}
          role="tablist"
          aria-label="Auth mode"
        >
          {(['signin', 'signup'] as AuthMode[]).map((m) => (
            <button
              key={m}
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className={[
                'flex-1 py-2.5 rounded-[9px] text-[13px] font-semibold transition-colors',
                mode === m ? 'bg-mj-gold text-mj-slate' : 'bg-transparent text-mj-bone',
              ].join(' ')}
            >
              {m === 'signin' ? t('signIn') : t('signUp')}
            </button>
          ))}
        </div>

        {/* Forms */}
        {mode === 'signin' ? (
          <SignInForm onSuccess={handleSuccess} />
        ) : (
          <SignUpForm onSuccess={handleSuccess} />
        )}
      </div>
    </div>
  );
}
