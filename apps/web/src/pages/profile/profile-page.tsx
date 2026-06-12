import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ScreenShell } from '../../components/ui/screen-shell';
import { Spinner } from '../../components/ui/spinner';
import { useI18n } from '../../i18n';
import { useMyProfile, useUpdateProfile, useUploadAvatar } from '../../hooks/use-profile';
import { getApiErrorMessage } from '../../lib/api';

// ── Style tokens ──────────────────────────────────────────────────────────────

const cardStyle = {
  background: 'rgba(var(--felt-ink-rgb),0.05)',
  border: '1px solid rgba(201,169,97,0.12)',
} as const;

// ── Stat tile ─────────────────────────────────────────────────────────────────

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex-1 rounded-[12px] px-3 py-3 text-center" style={cardStyle}>
      <p className="text-[22px] font-bold text-mj-bone">{value}</p>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-mj-bone/40 mt-0.5">
        {label}
      </p>
    </div>
  );
}

// ── Avatar circle ─────────────────────────────────────────────────────────────

function AvatarCircle({
  avatarUrl,
  handle,
  onUpload,
  uploading,
}: {
  avatarUrl?: string | null;
  handle: string;
  onUpload: (file: File) => void;
  uploading: boolean;
}) {
  const { t } = useI18n();
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        className="w-20 h-20 rounded-full overflow-hidden flex items-center justify-center
                   text-2xl font-bold text-mj-slate select-none relative"
        style={{ background: 'linear-gradient(135deg, #c9a961 0%, #a07830 100%)' }}
        aria-label={t('profileUploadPhoto')}
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt={handle} className="w-full h-full object-cover" />
        ) : (
          <span>{handle.charAt(0).toUpperCase()}</span>
        )}
        {uploading && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <Spinner />
          </div>
        )}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onUpload(f);
          e.target.value = '';
        }}
      />
    </div>
  );
}

// ── Edit form ─────────────────────────────────────────────────────────────────

function EditForm({
  initialHandle,
  onSave,
  onCancel,
}: {
  initialHandle: string;
  onSave: (handle: string) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [handle, setHandle] = useState(initialHandle);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await onSave(handle.trim().toLowerCase());
    } catch (err) {
      setError(getApiErrorMessage(err, t('error')));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
      <div>
        <label className="block text-[11px] font-semibold uppercase tracking-wider text-mj-bone/60 mb-1.5">
          {t('handle')}
        </label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-mj-bone/40">
            @
          </span>
          <input
            type="text"
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            maxLength={30}
            pattern="[a-zA-Z0-9_-]+"
            required
            className="w-full pl-7 pr-3 py-2.5 rounded-[10px] text-sm text-mj-bone bg-mj-bone/[0.07]
                       border border-mj-bone/15 focus:border-mj-gold/50 outline-none"
          />
        </div>
        <p className="mt-1 text-[11px] text-mj-bone/45">{t('handleHint')}</p>
      </div>

      {error && (
        <p role="alert" className="text-[12px] text-mj-loss-light font-medium">
          {error}
        </p>
      )}

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="flex-1 py-2.5 rounded-[10px] text-sm font-semibold text-mj-bone/60
                     border border-mj-bone/15 bg-transparent disabled:opacity-50"
        >
          {t('cancel')}
        </button>
        <button
          type="submit"
          disabled={saving}
          className="flex-[2] py-2.5 rounded-[10px] text-sm font-bold text-mj-slate
                     bg-gradient-to-b from-mj-gold to-mj-gold-2 shadow-cta
                     flex items-center justify-center gap-2
                     disabled:opacity-70 disabled:cursor-wait"
        >
          {saving && <Spinner />}
          {saving ? t('profileSaving') : t('profileSave')}
        </button>
      </div>
    </form>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function ProfilePage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { data: profile, isLoading } = useMyProfile();
  const updateProfile = useUpdateProfile();
  const uploadAvatar = useUploadAvatar();

  const [editing, setEditing] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  const handleSave = async (handle: string) => {
    await updateProfile.mutateAsync({ handle });
    setEditing(false);
    setSuccessMsg(t('profileUpdated'));
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  const handleAvatarUpload = async (file: File) => {
    try {
      await uploadAvatar.mutateAsync(file);
      setSuccessMsg(t('profilePhotoUpdated'));
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err) {
      setSuccessMsg(getApiErrorMessage(err, t('error')));
      setTimeout(() => setSuccessMsg(''), 3000);
    }
  };

  return (
    <ScreenShell title={t('profile')} onBack={() => navigate('/home')}>
      <div className="px-5 py-6 space-y-6">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : profile ? (
          <>
            {/* Avatar + name block */}
            <div className="flex flex-col items-center gap-3 pt-2">
              <AvatarCircle
                avatarUrl={profile.avatarUrl}
                handle={profile.handle}
                onUpload={(f) => void handleAvatarUpload(f)}
                uploading={uploadAvatar.isPending}
              />
              <div className="text-center">
                <p className="text-xl font-bold text-mj-bone">@{profile.handle}</p>
              </div>
            </div>

            {/* Stats row */}
            <div className="flex gap-2">
              <StatTile label={t('profileRating')} value={profile.rating ?? 1500} />
              <StatTile label={t('profileGamesPlayed')} value={profile.gamesPlayed ?? 0} />
              <StatTile label={t('profileGamesWon')} value={profile.gamesWon ?? 0} />
              <StatTile label={t('profileStreak')} value={profile.streak ?? 0} />
            </div>

            {/* Success message */}
            {successMsg && (
              <p role="status" className="text-center text-sm text-mj-win font-medium">
                {successMsg}
              </p>
            )}

            {/* Edit section */}
            <div className="rounded-[14px] px-4 py-4" style={cardStyle}>
              {editing ? (
                <EditForm
                  initialHandle={profile.handle}
                  onSave={handleSave}
                  onCancel={() => setEditing(false)}
                />
              ) : (
                <button
                  onClick={() => {
                    setSuccessMsg('');
                    setEditing(true);
                  }}
                  className="w-full py-2.5 rounded-[10px] text-sm font-semibold text-mj-gold
                             border border-mj-gold/25 bg-mj-gold/[0.08]"
                >
                  {t('profileEdit')}
                </button>
              )}
            </div>
          </>
        ) : null}
      </div>
    </ScreenShell>
  );
}
