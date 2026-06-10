import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ScreenShell } from '../../components/ui/screen-shell';
import { Spinner } from '../../components/ui/spinner';
import { useI18n } from '../../i18n';
import {
  useFriends,
  useSearchUsers,
  useSendRequest,
  useAcceptRequest,
  useDeclineRequest,
  useRemoveFriend,
  type FriendWithProfile,
  type SearchResult,
  type FriendStatus,
} from '../../hooks/use-friends';

// ── Style tokens ──────────────────────────────────────────────────────────────

const rowStyle = {
  background: 'rgba(var(--felt-ink-rgb),0.04)',
  border: '1px solid rgba(var(--felt-ink-rgb),0.07)',
} as const;

const btnGhost =
  'px-2.5 py-1 rounded-md text-[11px] font-semibold transition-opacity disabled:opacity-40';
const btnGold = `${btnGhost} bg-mj-gold/15 text-mj-gold border border-mj-gold/25`;
const btnDanger = `${btnGhost} bg-mj-loss/15 text-mj-loss-light border border-mj-loss/25`;
const btnMuted = `${btnGhost} bg-mj-bone/8 text-mj-bone/55 border border-mj-bone/12`;

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: FriendStatus }) {
  const { t } = useI18n();
  const map: Record<FriendStatus, { label: string; cls: string }> = {
    accepted: { label: '', cls: '' },
    pending_sent: {
      label: t('friendsPending'),
      cls: 'bg-mj-bone/10 text-mj-bone/45 border-mj-bone/20',
    },
    pending_received: {
      label: t('friendsIncoming'),
      cls: 'bg-mj-gold/15 text-mj-gold border-mj-gold/25',
    },
  };
  const { label, cls } = map[status];
  if (!label) return null;
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold border ${cls}`}>
      {label}
    </span>
  );
}

// ── Search result row ─────────────────────────────────────────────────────────

function SearchRow({ result }: { result: SearchResult }) {
  const { t } = useI18n();
  const sendRequest = useSendRequest();
  const acceptRequest = useAcceptRequest();
  const declineRequest = useDeclineRequest();

  const isSending = sendRequest.isPending && sendRequest.variables === result.sub;
  const isAccepting = acceptRequest.isPending && acceptRequest.variables === result.sub;
  const isDeclining = declineRequest.isPending && declineRequest.variables === result.sub;

  return (
    <li className="rounded-[12px] px-3 py-3 flex items-center gap-2" style={rowStyle}>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-mj-bone truncate">{result.displayName}</p>
        <p className="text-[11px] text-mj-bone/45">@{result.handle}</p>
      </div>

      {/* Action buttons based on friendship status */}
      {result.friendStatus === null && (
        <button
          onClick={() => void sendRequest.mutate(result.sub)}
          disabled={isSending}
          className={btnGold}
        >
          {isSending ? t('friendsSending') : t('friendsAdd')}
        </button>
      )}

      {result.friendStatus === 'pending_sent' && (
        <span className="text-[11px] text-mj-bone/40 font-medium">{t('friendsPending')}</span>
      )}

      {result.friendStatus === 'pending_received' && (
        <div className="flex gap-1.5">
          <button
            onClick={() => void acceptRequest.mutate(result.sub)}
            disabled={isAccepting}
            className={btnGold}
          >
            {isAccepting ? t('friendsSending') : t('friendsAccept')}
          </button>
          <button
            onClick={() => void declineRequest.mutate(result.sub)}
            disabled={isDeclining}
            className={btnDanger}
          >
            {t('friendsDecline')}
          </button>
        </div>
      )}

      {result.friendStatus === 'accepted' && (
        <span className="text-[11px] text-mj-win/70 font-medium">✓</span>
      )}
    </li>
  );
}

// ── Friend row ────────────────────────────────────────────────────────────────

function FriendRow({ friend }: { friend: FriendWithProfile }) {
  const { t } = useI18n();
  const acceptRequest = useAcceptRequest();
  const declineRequest = useDeclineRequest();
  const removeFriend = useRemoveFriend();

  const isAccepting = acceptRequest.isPending && acceptRequest.variables === friend.friendSub;
  const isDeclining = declineRequest.isPending && declineRequest.variables === friend.friendSub;
  const isRemoving = removeFriend.isPending && removeFriend.variables === friend.friendSub;

  return (
    <li className="rounded-[12px] px-3 py-3 flex items-center gap-2" style={rowStyle}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <p className="text-sm font-semibold text-mj-bone">{friend.displayName}</p>
          <p className="text-[11px] text-mj-bone/45">@{friend.handle}</p>
          <StatusBadge status={friend.status} />
        </div>
      </div>

      {/* Incoming request: accept + decline */}
      {friend.status === 'pending_received' && (
        <div className="flex gap-1.5">
          <button
            onClick={() => void acceptRequest.mutate(friend.friendSub)}
            disabled={isAccepting}
            className={btnGold}
          >
            {isAccepting ? t('friendsSending') : t('friendsAccept')}
          </button>
          <button
            onClick={() => void declineRequest.mutate(friend.friendSub)}
            disabled={isDeclining}
            className={btnDanger}
          >
            {t('friendsDecline')}
          </button>
        </div>
      )}

      {/* Accepted: remove */}
      {friend.status === 'accepted' && (
        <button
          onClick={() => void removeFriend.mutate(friend.friendSub)}
          disabled={isRemoving}
          className={btnMuted}
        >
          {isRemoving ? t('friendsRemoving') : t('friendsRemove')}
        </button>
      )}
    </li>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function FriendsPage() {
  const { t } = useI18n();
  const navigate = useNavigate();

  const [searchInput, setSearchInput] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearch = (value: string) => {
    setSearchInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(value.trim()), 300);
  };

  // Switch to search mode as soon as user types; API uses debounced value
  const isSearching = searchInput.trim().length > 0;

  const { data: friends, isLoading: friendsLoading } = useFriends();
  const { data: searchResults, isFetching: searchFetching } = useSearchUsers(debouncedQuery);

  // Sort friends: incoming first, then accepted, then outgoing
  const sortedFriends = friends?.slice().sort((a, b) => {
    const order: Record<string, number> = { pending_received: 0, accepted: 1, pending_sent: 2 };
    return (order[a.status] ?? 3) - (order[b.status] ?? 3);
  });

  return (
    <ScreenShell title={t('friends')} onBack={() => navigate('/home')}>
      <div className="px-5 py-6 space-y-4">
        {/* Search bar */}
        <div className="relative">
          <input
            type="search"
            value={searchInput}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder={t('friendsSearchPlaceholder')}
            className="w-full px-3 py-2.5 rounded-[10px] text-sm text-mj-bone bg-mj-bone/[0.07]
                       border border-mj-bone/15 focus:border-mj-gold/50 outline-none pr-8"
          />
          {searchFetching && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2">
              <Spinner />
            </span>
          )}
        </div>

        {/* Search results */}
        {isSearching && (
          <section>
            <h2 className="text-[13px] font-bold text-mj-gold/80 uppercase tracking-wider mb-3">
              {t('friendsSearch')}
            </h2>
            {!searchResults?.length ? (
              <p className="text-center text-sm text-mj-bone/40 py-4">{t('friendsNoResults')}</p>
            ) : (
              <ul className="space-y-2">
                {searchResults.map((r) => (
                  <SearchRow key={r.sub} result={r} />
                ))}
              </ul>
            )}
          </section>
        )}

        {/* Friends list (shown when not actively searching) */}
        {!isSearching && (
          <section>
            <h2 className="text-[13px] font-bold text-mj-gold/80 uppercase tracking-wider mb-3">
              {t('friends')}
            </h2>
            {friendsLoading ? (
              <div className="flex justify-center py-8">
                <Spinner />
              </div>
            ) : !sortedFriends?.length ? (
              <p className="text-center text-sm text-mj-bone/40 py-4">{t('friendsNoFriends')}</p>
            ) : (
              <ul className="space-y-2">
                {sortedFriends.map((f) => (
                  <FriendRow key={f.friendSub} friend={f} />
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </ScreenShell>
  );
}
