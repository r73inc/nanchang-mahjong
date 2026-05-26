import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ScreenShell } from '../../components/ui/screen-shell';
import { Spinner } from '../../components/ui/spinner';
import { useI18n } from '../../i18n';
import { useAuthStore } from '../../stores/auth.store';
import {
  useAdminInvites,
  useCreateInvites,
  useRevokeInvite,
  useAdminUsers,
  useSetRole,
  useSetDisabled,
  type InviteRecord,
  type AdminUser,
} from '../../hooks/use-admin';
import { getApiErrorMessage } from '../../lib/api';

// ── Shared style tokens ───────────────────────────────────────────────────────

const cardStyle = {
  background: 'rgba(245,239,223,0.05)',
  border: '1px solid rgba(201,169,97,0.12)',
} as const;

const rowStyle = {
  background: 'rgba(245,239,223,0.04)',
  border: '1px solid rgba(245,239,223,0.07)',
} as const;

const btnGhost =
  'px-2.5 py-1 rounded-md text-[11px] font-semibold transition-opacity disabled:opacity-40';
const btnGold = `${btnGhost} bg-mj-gold/15 text-mj-gold border border-mj-gold/25`;
const btnDanger = `${btnGhost} bg-mj-loss/15 text-mj-loss-light border border-mj-loss/25`;
const btnMuted = `${btnGhost} bg-mj-bone/8 text-mj-bone/55 border border-mj-bone/12`;

// ── Status pill ───────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<InviteRecord['status'], string> = {
  active: 'bg-mj-win/15 text-mj-win border-mj-win/25',
  used: 'bg-mj-bone/10 text-mj-bone/40 border-mj-bone/15',
  revoked: 'bg-mj-loss/15 text-mj-loss-light border-mj-loss/25',
  expired: 'bg-amber-500/15 text-amber-400 border-amber-500/25',
};

function StatusPill({ status }: { status: InviteRecord['status'] }) {
  return (
    <span
      className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold border ${STATUS_COLORS[status]}`}
    >
      {status}
    </span>
  );
}

// ── Invites section ───────────────────────────────────────────────────────────

function InvitesSection() {
  const { t } = useI18n();
  const { data: invites, isLoading } = useAdminInvites();
  const createMutation = useCreateInvites();
  const revokeMutation = useRevokeInvite();

  const [count, setCount] = useState(1);
  const [note, setNote] = useState('');
  const [expiry, setExpiry] = useState('');
  const [createError, setCreateError] = useState('');

  const handleGenerate = async () => {
    setCreateError('');
    try {
      await createMutation.mutateAsync({
        count,
        note: note.trim() || undefined,
        expiresAt: expiry || undefined,
      });
      setNote('');
      setExpiry('');
      setCount(1);
    } catch (err) {
      setCreateError(getApiErrorMessage(err, t('error')));
    }
  };

  return (
    <section className="mb-6">
      <h2 className="text-[13px] font-bold text-mj-gold/80 uppercase tracking-wider mb-3">
        {t('adminInvites')}
      </h2>

      {/* Generate form */}
      <div className="rounded-[14px] px-4 py-4 mb-4 space-y-3" style={cardStyle}>
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-mj-bone/50 mb-1">
              {t('adminCount')}
            </label>
            <input
              type="number"
              min={1}
              max={20}
              value={count}
              onChange={(e) => setCount(Math.max(1, Math.min(20, Number(e.target.value))))}
              className="w-full px-3 py-2 rounded-md text-sm text-mj-bone bg-mj-bone/[0.07]
                         border border-mj-bone/15 focus:border-mj-gold/50 outline-none"
            />
          </div>
          <div className="flex-[2]">
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-mj-bone/50 mb-1">
              {t('adminNote')}
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t('adminNotePlaceholder')}
              maxLength={200}
              className="w-full px-3 py-2 rounded-md text-sm text-mj-bone bg-mj-bone/[0.07]
                         border border-mj-bone/15 focus:border-mj-gold/50 outline-none"
            />
          </div>
        </div>

        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-wider text-mj-bone/50 mb-1">
            {t('adminExpiry')}
          </label>
          <input
            type="datetime-local"
            value={expiry}
            onChange={(e) => setExpiry(e.target.value)}
            className="w-full px-3 py-2 rounded-md text-sm text-mj-bone bg-mj-bone/[0.07]
                       border border-mj-bone/15 focus:border-mj-gold/50 outline-none"
          />
        </div>

        {createError && (
          <p role="alert" className="text-[11px] text-mj-loss-light font-medium">
            {createError}
          </p>
        )}

        <button
          onClick={() => void handleGenerate()}
          disabled={createMutation.isPending}
          className="w-full py-2.5 rounded-[10px] text-sm font-bold text-mj-slate
                     bg-gradient-to-b from-mj-gold to-mj-gold-2 shadow-cta
                     flex items-center justify-center gap-2
                     disabled:opacity-70 disabled:cursor-wait"
        >
          {createMutation.isPending && <Spinner />}
          {createMutation.isPending ? t('adminGenerating') : t('adminGenerate')}
        </button>
      </div>

      {/* Invite list */}
      {isLoading ? (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      ) : !invites?.length ? (
        <p className="text-center text-sm text-mj-bone/40 py-4">{t('adminNoInvites')}</p>
      ) : (
        <ul className="space-y-2">
          {invites.map((inv) => (
            <InviteRow
              key={inv.code}
              invite={inv}
              isRevoking={revokeMutation.isPending && revokeMutation.variables === inv.code}
              onRevoke={() => void revokeMutation.mutate(inv.code)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function InviteRow({
  invite,
  isRevoking,
  onRevoke,
}: {
  invite: InviteRecord;
  isRevoking: boolean;
  onRevoke: () => void;
}) {
  const { t } = useI18n();
  return (
    <li className="rounded-[12px] px-3 py-2.5 flex items-center gap-2" style={rowStyle}>
      <span className="font-mono text-sm text-mj-gold tracking-widest flex-1">{invite.code}</span>
      <StatusPill status={invite.status} />
      <span className="text-[10px] text-mj-bone/35">
        {new Date(invite.createdAt).toLocaleDateString()}
      </span>
      {invite.status === 'active' && (
        <button
          onClick={onRevoke}
          disabled={isRevoking}
          className={btnDanger}
          aria-label={`${t('adminRevoke')} ${invite.code}`}
        >
          {isRevoking ? t('adminRevoking') : t('adminRevoke')}
        </button>
      )}
    </li>
  );
}

// ── Users section ─────────────────────────────────────────────────────────────

function UsersSection() {
  const { t } = useI18n();
  const currentUser = useAuthStore((s) => s.user);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearch = (value: string) => {
    setSearch(value);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => setDebouncedSearch(value.trim()), 300);
  };

  const { data: users, isLoading } = useAdminUsers(debouncedSearch || undefined);
  const setRoleMutation = useSetRole();
  const setDisabledMutation = useSetDisabled();

  return (
    <section>
      <h2 className="text-[13px] font-bold text-mj-gold/80 uppercase tracking-wider mb-3">
        {t('adminUsers')}
      </h2>

      {/* Search */}
      <input
        type="search"
        value={search}
        onChange={(e) => handleSearch(e.target.value)}
        placeholder={t('adminSearchPlaceholder')}
        className="w-full px-3 py-2.5 rounded-[10px] text-sm text-mj-bone bg-mj-bone/[0.07]
                   border border-mj-bone/15 focus:border-mj-gold/50 outline-none mb-3"
      />

      {isLoading ? (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      ) : !users?.length ? (
        <p className="text-center text-sm text-mj-bone/40 py-4">{t('adminNoUsers')}</p>
      ) : (
        <ul className="space-y-2">
          {users.map((u) => (
            <UserRow
              key={u.sub}
              user={u}
              isSelf={u.sub === currentUser?.sub}
              isRolePending={setRoleMutation.isPending && setRoleMutation.variables?.sub === u.sub}
              isDisablePending={
                setDisabledMutation.isPending && setDisabledMutation.variables?.sub === u.sub
              }
              onSetRole={(role) => void setRoleMutation.mutate({ sub: u.sub, role })}
              onSetDisabled={(disabled) =>
                void setDisabledMutation.mutate({ sub: u.sub, disabled })
              }
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function UserRow({
  user,
  isSelf,
  isRolePending,
  isDisablePending,
  onSetRole,
  onSetDisabled,
}: {
  user: AdminUser;
  isSelf: boolean;
  isRolePending: boolean;
  isDisablePending: boolean;
  onSetRole: (role: 'user' | 'admin') => void;
  onSetDisabled: (disabled: boolean) => void;
}) {
  const { t } = useI18n();

  return (
    <li className="rounded-[12px] px-3 py-3 space-y-1.5" style={rowStyle}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-semibold text-mj-bone">{user.displayName}</span>
        <span className="text-[11px] text-mj-bone/45">@{user.handle}</span>

        {/* Role badge */}
        <span
          className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
            user.role === 'admin'
              ? 'bg-mj-gold/15 text-mj-gold border-mj-gold/25'
              : 'bg-mj-bone/8 text-mj-bone/50 border-mj-bone/15'
          }`}
        >
          {user.role === 'admin' ? t('adminBadge') : t('userBadge')}
        </span>

        {/* Disabled badge */}
        {user.disabled && (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold border bg-mj-loss/15 text-mj-loss-light border-mj-loss/25">
            {t('adminDisabledBadge')}
          </span>
        )}
      </div>

      <p className="text-[11px] text-mj-bone/40">{user.email}</p>

      {/* Action buttons — hidden for the acting admin's own row */}
      {!isSelf && (
        <div className="flex gap-1.5 flex-wrap pt-0.5">
          <button
            onClick={() => onSetRole(user.role === 'admin' ? 'user' : 'admin')}
            disabled={isRolePending}
            className={btnGold}
          >
            {isRolePending
              ? t('adminSaving')
              : user.role === 'admin'
                ? t('adminMakeUser')
                : t('adminMakeAdmin')}
          </button>

          <button
            onClick={() => onSetDisabled(!user.disabled)}
            disabled={isDisablePending}
            className={user.disabled ? btnMuted : btnDanger}
          >
            {isDisablePending
              ? t('adminSaving')
              : user.disabled
                ? t('adminEnable')
                : t('adminDisable')}
          </button>
        </div>
      )}
    </li>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function AdminPage() {
  const { t } = useI18n();
  const navigate = useNavigate();

  return (
    <ScreenShell title={t('adminPanel')} onBack={() => navigate('/home')}>
      <div className="px-5 py-6">
        <InvitesSection />
        <UsersSection />
      </div>
    </ScreenShell>
  );
}
