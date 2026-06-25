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
  useSetPermission,
  useAiPendingRequests,
  useApproveAiRequest,
  useRejectAiRequest,
  useAiFailedJobs,
  useRetryAiJob,
  useBackfillSummaries,
  type BackfillResult,
  type InviteRecord,
  type AdminUser,
  type AiPendingRequest,
  type AiFailedJob,
} from '../../hooks/use-admin';
import { getApiErrorMessage } from '../../lib/api';

// ── Shared style tokens ───────────────────────────────────────────────────────

const cardStyle = {
  background: 'rgba(var(--felt-ink-rgb),0.05)',
  border: '1px solid rgba(201,169,97,0.12)',
} as const;

const rowStyle = {
  background: 'rgba(var(--felt-ink-rgb),0.04)',
  border: '1px solid rgba(var(--felt-ink-rgb),0.07)',
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
  const setPermissionMutation = useSetPermission();

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
              isPermissionPending={
                setPermissionMutation.isPending && setPermissionMutation.variables?.sub === u.sub
              }
              onSetRole={(role) => void setRoleMutation.mutate({ sub: u.sub, role })}
              onSetDisabled={(disabled) =>
                void setDisabledMutation.mutate({ sub: u.sub, disabled })
              }
              onToggleDevTest={(grant) =>
                void setPermissionMutation.mutate({
                  sub: u.sub,
                  permission: 'devTestRoom',
                  grant,
                })
              }
              onToggleAiFeatures={(grant) =>
                void setPermissionMutation.mutate({
                  sub: u.sub,
                  permission: 'admin-ai-features',
                  grant,
                })
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
  isPermissionPending,
  onSetRole,
  onSetDisabled,
  onToggleDevTest,
  onToggleAiFeatures,
}: {
  user: AdminUser;
  isSelf: boolean;
  isRolePending: boolean;
  isDisablePending: boolean;
  isPermissionPending: boolean;
  onSetRole: (role: 'user' | 'admin') => void;
  onSetDisabled: (disabled: boolean) => void;
  onToggleDevTest: (grant: boolean) => void;
  onToggleAiFeatures: (grant: boolean) => void;
}) {
  const { t } = useI18n();
  const hasDevTest = (user.permissions ?? []).includes('devTestRoom');
  const hasAiFeatures = (user.permissions ?? []).includes('admin-ai-features');

  return (
    <li className="rounded-[12px] px-3 py-3 space-y-1.5" style={rowStyle}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-semibold text-mj-bone">@{user.handle}</span>

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

        {/* Dev test permission badge */}
        {hasDevTest && (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold border bg-mj-gold/10 text-mj-gold border-mj-gold/20">
            {t('devTestPermBadge')}
          </span>
        )}

        {/* AI admin permission badge */}
        {hasAiFeatures && (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold border bg-mj-gold/10 text-mj-gold border-mj-gold/20">
            {t('adminAiFeaturesBadge')}
          </span>
        )}

        {/* Disabled badge */}
        {user.disabled && (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold border bg-mj-loss/15 text-mj-loss-light border-mj-loss/25">
            {t('adminDisabledBadge')}
          </span>
        )}
      </div>

      <div className="flex gap-1.5 flex-wrap pt-0.5">
        {/* Role + disable buttons hidden for the acting admin's own row */}
        {!isSelf && (
          <>
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
          </>
        )}

        {/* Dev test room permission — admins can toggle for anyone, including themselves */}
        <button
          onClick={() => onToggleDevTest(!hasDevTest)}
          disabled={isPermissionPending}
          className={hasDevTest ? btnDanger : btnMuted}
        >
          {isPermissionPending
            ? t('adminSaving')
            : hasDevTest
              ? t('adminRevokeDevTest')
              : t('adminGrantDevTest')}
        </button>

        {/* AI admin permission — admins can toggle for anyone, including themselves */}
        <button
          onClick={() => onToggleAiFeatures(!hasAiFeatures)}
          disabled={isPermissionPending}
          className={hasAiFeatures ? btnDanger : btnMuted}
        >
          {isPermissionPending
            ? t('adminSaving')
            : hasAiFeatures
              ? t('adminRevokeAiFeatures')
              : t('adminGrantAiFeatures')}
        </button>
      </div>
    </li>
  );
}

// ── AI request queue section ──────────────────────────────────────────────────

function AiRequestRow({
  request,
  isBusy,
  pendingAction,
  onApprove,
  onReject,
}: {
  request: AiPendingRequest;
  isBusy: boolean;
  pendingAction: 'approve' | 'reject' | null;
  onApprove: () => void;
  onReject: () => void;
}) {
  const { t } = useI18n();
  return (
    <li className="rounded-[12px] px-3 py-2.5 space-y-1.5" style={rowStyle}>
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className="px-1.5 py-0.5 rounded text-[10px] font-bold border"
          style={{
            background: 'rgba(var(--felt-ink-rgb),0.06)',
            borderColor: 'rgba(var(--felt-ink-rgb),0.12)',
            color: 'rgba(var(--felt-ink-rgb),0.55)',
          }}
        >
          {request.targetType === 'game' ? t('adminAiTargetGame') : t('adminAiTargetChallenge')}
        </span>
        <span className="font-mono text-xs text-mj-bone/70 flex-1 truncate">
          {request.targetId}
        </span>
        <span className="text-[10px] text-mj-bone/35">
          {new Date(request.requestedAt).toLocaleDateString()}
        </span>
      </div>
      <div className="flex gap-1.5">
        <button onClick={onApprove} disabled={isBusy} className={btnGold}>
          {pendingAction === 'approve' ? t('adminSaving') : t('adminAiApprove')}
        </button>
        <button onClick={onReject} disabled={isBusy} className={btnDanger}>
          {pendingAction === 'reject' ? t('adminSaving') : t('adminAiReject')}
        </button>
      </div>
    </li>
  );
}

function AiQueueSection() {
  const { t } = useI18n();
  const { data: requests, isLoading } = useAiPendingRequests();
  const approveMutation = useApproveAiRequest();
  const rejectMutation = useRejectAiRequest();
  const backfillMutation = useBackfillSummaries();

  const pendingReqId = approveMutation.isPending
    ? approveMutation.variables
    : rejectMutation.isPending
      ? rejectMutation.variables
      : null;
  const pendingAction: 'approve' | 'reject' | null = approveMutation.isPending
    ? 'approve'
    : rejectMutation.isPending
      ? 'reject'
      : null;

  const backfillData = backfillMutation.data as BackfillResult | undefined;

  return (
    <section className="mb-6">
      <h2 className="text-[13px] font-bold text-mj-gold/80 uppercase tracking-wider mb-3">
        {t('adminAiQueueTitle')}
      </h2>
      {isLoading ? (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      ) : !requests?.length ? (
        <p className="text-center text-sm text-mj-bone/40 py-4">{t('adminAiQueueEmpty')}</p>
      ) : (
        <ul className="space-y-2">
          {requests.map((req) => (
            <AiRequestRow
              key={req.reqId}
              request={req}
              isBusy={pendingReqId === req.reqId}
              pendingAction={pendingReqId === req.reqId ? pendingAction : null}
              onApprove={() => void approveMutation.mutate(req.reqId)}
              onReject={() => void rejectMutation.mutate(req.reqId)}
            />
          ))}
        </ul>
      )}

      {/* Backfill */}
      <div className="mt-4 pt-4 border-t border-white/10">
        <p className="text-xs text-mj-bone/50 mb-2">{t('adminAiBackfillDesc')}</p>
        <button
          onClick={() => void backfillMutation.mutate()}
          disabled={backfillMutation.isPending}
          className="text-xs px-3 py-1.5 rounded bg-mj-gold/20 hover:bg-mj-gold/30 text-mj-gold disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {backfillMutation.isPending ? t('adminAiBackfillRunning') : t('adminAiBackfill')}
        </button>
        {backfillData && (
          <p className="mt-2 text-xs text-mj-bone/60">
            {t(
              'adminAiBackfillResult',
              String(backfillData.game.queued),
              String(backfillData.challenge.queued),
              String(backfillData.game.skipped + backfillData.challenge.skipped),
            )}
          </p>
        )}
      </div>
    </section>
  );
}

// ── AI failed jobs section ────────────────────────────────────────────────────

function AiFailedJobRow({
  job,
  isBusy,
  onRetry,
}: {
  job: AiFailedJob;
  isBusy: boolean;
  onRetry: () => void;
}) {
  const { t } = useI18n();
  return (
    <li className="rounded-[12px] px-3 py-2.5 space-y-1.5" style={rowStyle}>
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className="px-1.5 py-0.5 rounded text-[10px] font-bold border"
          style={{
            background: 'rgba(var(--felt-ink-rgb),0.06)',
            borderColor: 'rgba(var(--felt-ink-rgb),0.12)',
            color: 'rgba(var(--felt-ink-rgb),0.55)',
          }}
        >
          {job.targetType === 'game' ? t('adminAiTargetGame') : t('adminAiTargetChallenge')}
        </span>
        <span className="font-mono text-xs text-mj-bone/70 flex-1 truncate">{job.targetId}</span>
        <span className="text-[10px] text-mj-bone/35">
          {t('adminAiAttempts', String(job.attempts))}
        </span>
      </div>
      {job.errorCode && <p className="text-[11px] font-mono text-mj-loss-light">{job.errorCode}</p>}
      <div className="flex gap-1.5">
        <button onClick={onRetry} disabled={isBusy} className={btnGold}>
          {isBusy ? t('adminSaving') : t('adminAiRetry')}
        </button>
      </div>
    </li>
  );
}

function AiFailedJobsSection() {
  const { t } = useI18n();
  const { data: jobs, isLoading } = useAiFailedJobs();
  const retryMutation = useRetryAiJob();

  const pendingKey =
    retryMutation.isPending && retryMutation.variables
      ? `${retryMutation.variables.targetType}-${retryMutation.variables.targetId}`
      : null;

  return (
    <section className="mb-6">
      <h2 className="text-[13px] font-bold text-mj-gold/80 uppercase tracking-wider mb-3">
        {t('adminAiFailedTitle')}
      </h2>
      {isLoading ? (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      ) : !jobs?.length ? (
        <p className="text-center text-sm text-mj-bone/40 py-4">{t('adminAiFailedEmpty')}</p>
      ) : (
        <ul className="space-y-2">
          {jobs.map((job) => (
            <AiFailedJobRow
              key={`${job.targetType}-${job.targetId}`}
              job={job}
              isBusy={pendingKey === `${job.targetType}-${job.targetId}`}
              onRetry={() =>
                void retryMutation.mutate({ targetType: job.targetType, targetId: job.targetId })
              }
            />
          ))}
        </ul>
      )}
    </section>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function AdminPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const currentUser = useAuthStore((s) => s.user);
  const hasAiFeatures = (currentUser?.permissions ?? []).includes('admin-ai-features');

  return (
    <ScreenShell title={t('adminPanel')} onBack={() => navigate('/home')}>
      <div className="px-5 py-6">
        <InvitesSection />
        <UsersSection />
        {hasAiFeatures && <AiQueueSection />}
        {hasAiFeatures && <AiFailedJobsSection />}
      </div>
    </ScreenShell>
  );
}
