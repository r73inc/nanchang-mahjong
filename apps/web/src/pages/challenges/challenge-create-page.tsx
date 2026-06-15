/**
 * ChallengeCreatePage — multi-step wizard to configure and launch a Point Challenge.
 *
 * Step 1: Select friends to challenge.
 * Step 2: Choose bot difficulty and number of rounds.
 * Step 3: Fine-tune game settings (starting score, min fan, claim window, etc.).
 * On submit: POST /challenges → navigate to /game/:gameId immediately.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ScreenShell } from '../../components/ui/screen-shell';
import { useI18n } from '../../i18n';
import { useFriends } from '../../hooks/use-friends';
import { useCreateChallenge } from '../../hooks/use-challenges';
import type { BotDifficulty, ChallengeConfig } from '@nanchang/shared';

type Step = 'friends' | 'difficulty' | 'settings';

const NUM_HANDS_OPTIONS: Array<{ value: 1 | 2 | 3 | 4; labelKey: string }> = [
  { value: 1, labelKey: 'challengeHand1' },
  { value: 2, labelKey: 'challengeHand2' },
  { value: 3, labelKey: 'challengeHand3' },
  { value: 4, labelKey: 'challengeHand4' },
];

const BOT_DIFFICULTIES: Array<{ value: BotDifficulty; labelKey: string }> = [
  { value: 'easy', labelKey: 'challengeBotEasy' },
  { value: 'normal', labelKey: 'challengeBotNormal' },
];

const VIEW_MODES: Array<{ value: '2D' | '3D'; labelKey: string }> = [
  { value: '2D', labelKey: 'viewMode2D' },
  { value: '3D', labelKey: 'viewMode3D' },
];

export function ChallengeCreatePage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { data: friends, isLoading: friendsLoading } = useFriends();
  const createChallenge = useCreateChallenge();

  const [step, setStep] = useState<Step>('friends');
  const [selectedSubs, setSelectedSubs] = useState<Set<string>>(new Set());
  const [botDifficulty, setBotDifficulty] = useState<BotDifficulty>('easy');
  const [config, setConfig] = useState<ChallengeConfig>({
    numRounds: 2,
    botDifficulty: 'easy',
    startingScore: 0,
    timerSecs: 30,
    viewMode: '2D',
    ruleTopBottomJing: true,
    claimWindowSecs: 0,
  });

  const acceptedFriends = (friends ?? []).filter((f) => f.status === 'accepted');

  function toggleFriend(sub: string) {
    setSelectedSubs((prev) => {
      const next = new Set(prev);
      if (next.has(sub)) {
        next.delete(sub);
      } else if (next.size < 10) {
        next.add(sub);
      }
      return next;
    });
  }

  async function handleSubmit() {
    const finalConfig: ChallengeConfig = { ...config, botDifficulty, numRounds: config.numRounds };
    const result = await createChallenge.mutateAsync({
      challengedSubs: Array.from(selectedSubs),
      config: finalConfig,
    });
    if (result.gameId) {
      navigate(`/game/${result.gameId}`);
    }
  }

  const canProceedFromFriends = selectedSubs.size >= 1;
  const isLoading = createChallenge.isPending;

  return (
    <ScreenShell title={t('challengeCreateTitle')} onBack={() => navigate('/lobby')}>
      <div className="px-4 py-6 flex flex-col gap-6">
        {/* ── Step 1: Select friends ──────────────────────────────────────── */}
        {step === 'friends' && (
          <>
            <div>
              <h2 className="text-base font-bold text-mj-bone mb-1">
                {t('challengeSelectFriends')}
              </h2>
              <p className="text-xs text-mj-bone/60">{t('challengeSelectFriendsHint')}</p>
            </div>

            {friendsLoading ? (
              <div className="text-sm text-mj-bone/50 text-center py-8">…</div>
            ) : acceptedFriends.length === 0 ? (
              <div
                className="rounded-2xl p-5 text-center"
                style={{
                  background: 'rgba(var(--felt-ink-rgb),0.06)',
                  border: '1px solid rgba(var(--felt-ink-rgb),0.12)',
                }}
              >
                <p className="text-sm text-mj-bone/60 mb-4">{t('challengeNoFriends')}</p>
                <button
                  onClick={() => navigate('/friends')}
                  className="px-6 py-2.5 rounded-xl text-sm font-bold"
                  style={{
                    background: 'rgba(201,169,97,0.2)',
                    border: '1px solid rgba(201,169,97,0.5)',
                    color: '#c9a961',
                  }}
                >
                  {t('challengeAddFriends')}
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {acceptedFriends.map((f) => {
                  const selected = selectedSubs.has(f.friendSub);
                  return (
                    <button
                      key={f.friendSub}
                      onClick={() => toggleFriend(f.friendSub)}
                      className="flex items-center gap-3 px-4 py-3.5 rounded-xl text-left transition-all"
                      style={{
                        background: selected
                          ? 'rgba(201,169,97,0.15)'
                          : 'rgba(var(--felt-ink-rgb),0.04)',
                        border: selected
                          ? '1px solid rgba(201,169,97,0.6)'
                          : '1px solid rgba(var(--felt-ink-rgb),0.1)',
                      }}
                    >
                      <div
                        className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0"
                        style={{
                          background: selected ? '#c9a961' : 'transparent',
                          border: selected ? 'none' : '1.5px solid rgba(var(--felt-ink-rgb),0.3)',
                        }}
                      >
                        {selected && (
                          <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                            <path
                              d="M1 4L4 7L9 1"
                              stroke="var(--felt-bg)"
                              strokeWidth="1.8"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        )}
                      </div>
                      <span className="text-sm font-semibold text-mj-bone">{f.handle}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {acceptedFriends.length > 0 && (
              <button
                onClick={() => setStep('difficulty')}
                disabled={!canProceedFromFriends}
                className="w-full py-3.5 rounded-[14px] font-bold text-sm text-mj-ink"
                style={{
                  background: canProceedFromFriends
                    ? 'linear-gradient(180deg,#c9a961 0%,#a88a45 100%)'
                    : 'rgba(201,169,97,0.3)',
                  boxShadow: canProceedFromFriends ? '0 6px 18px rgba(201,169,97,0.3)' : 'none',
                }}
              >
                {t('next')} →
              </button>
            )}
          </>
        )}

        {/* ── Step 2: Difficulty & Rounds ─────────────────────────────────── */}
        {step === 'difficulty' && (
          <>
            <div>
              <h2 className="text-base font-bold text-mj-bone mb-1">
                {t('challengeBotDifficulty')}
              </h2>
            </div>
            <div className="flex gap-3">
              {BOT_DIFFICULTIES.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setBotDifficulty(opt.value)}
                  className="flex-1 py-3.5 rounded-xl font-semibold text-sm transition-all"
                  style={{
                    background:
                      botDifficulty === opt.value
                        ? 'rgba(201,169,97,0.2)'
                        : 'rgba(var(--felt-ink-rgb),0.05)',
                    border:
                      botDifficulty === opt.value
                        ? '1px solid rgba(201,169,97,0.6)'
                        : '1px solid rgba(var(--felt-ink-rgb),0.1)',
                    color:
                      botDifficulty === opt.value ? '#c9a961' : 'rgba(var(--felt-ink-rgb),0.6)',
                  }}
                >
                  {t(opt.labelKey as never)}
                </button>
              ))}
            </div>

            <div>
              <h2 className="text-base font-bold text-mj-bone mb-3">{t('challengeNumHands')}</h2>
              <div className="flex flex-col gap-2">
                {NUM_HANDS_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setConfig((c) => ({ ...c, numRounds: opt.value }))}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all"
                    style={{
                      background:
                        config.numRounds === opt.value
                          ? 'rgba(201,169,97,0.15)'
                          : 'rgba(var(--felt-ink-rgb),0.04)',
                      border:
                        config.numRounds === opt.value
                          ? '1px solid rgba(201,169,97,0.6)'
                          : '1px solid rgba(var(--felt-ink-rgb),0.1)',
                    }}
                  >
                    <div
                      className="w-4 h-4 rounded-full flex-shrink-0"
                      style={{
                        background: config.numRounds === opt.value ? '#c9a961' : 'transparent',
                        border:
                          config.numRounds === opt.value
                            ? 'none'
                            : '1.5px solid rgba(var(--felt-ink-rgb),0.3)',
                      }}
                    />
                    <span className="text-sm font-semibold text-mj-bone">
                      {t(opt.labelKey as never)}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep('friends')}
                className="flex-1 py-3.5 rounded-[14px] font-semibold text-sm text-mj-bone/70"
                style={{
                  background: 'rgba(var(--felt-ink-rgb),0.06)',
                  border: '1px solid rgba(var(--felt-ink-rgb),0.12)',
                }}
              >
                ← {t('back')}
              </button>
              <button
                onClick={() => setStep('settings')}
                className="flex-1 py-3.5 rounded-[14px] font-bold text-sm text-mj-ink"
                style={{
                  background: 'linear-gradient(180deg,#c9a961 0%,#a88a45 100%)',
                  boxShadow: '0 6px 18px rgba(201,169,97,0.3)',
                }}
              >
                {t('next')} →
              </button>
            </div>
          </>
        )}

        {/* ── Step 3: Game Settings + Submit ──────────────────────────────── */}
        {step === 'settings' && (
          <>
            <div>
              <h2 className="text-base font-bold text-mj-bone mb-1">
                {t('challengeGameSettings')}
              </h2>
            </div>

            {/* Starting Score */}
            <div
              className="rounded-2xl p-5 flex flex-col gap-4"
              style={{
                background: 'rgba(var(--felt-ink-rgb),0.04)',
                border: '1px solid rgba(var(--felt-ink-rgb),0.1)',
              }}
            >
              <SettingRow label={t('challengeStartingScore')}>
                <select
                  value={config.startingScore}
                  onChange={(e) =>
                    setConfig((c) => ({ ...c, startingScore: Number(e.target.value) }))
                  }
                  className="bg-transparent text-sm font-semibold text-mj-bone/90 border-0 outline-none"
                >
                  {[0, 10, 20, 50, 100].map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </SettingRow>

              <SettingRow label={t('challengeClaimWindow')}>
                <select
                  value={config.claimWindowSecs}
                  onChange={(e) =>
                    setConfig((c) => ({ ...c, claimWindowSecs: Number(e.target.value) }))
                  }
                  className="bg-transparent text-sm font-semibold text-mj-bone/90 border-0 outline-none"
                >
                  <option value={0}>{t('claimWindowUnlimited')}</option>
                  {[5, 8, 10, 15, 20, 30].map((v) => (
                    <option key={v} value={v}>
                      {t('secondsShort').replace('{{0}}', String(v))}
                    </option>
                  ))}
                </select>
              </SettingRow>

              <SettingRow label={t('challengeViewMode')}>
                <div className="flex gap-2">
                  {VIEW_MODES.map((vm) => (
                    <button
                      key={vm.value}
                      onClick={() => setConfig((c) => ({ ...c, viewMode: vm.value }))}
                      className="px-3 py-1 rounded-lg text-xs font-bold transition-all"
                      style={{
                        background:
                          config.viewMode === vm.value ? 'rgba(201,169,97,0.2)' : 'transparent',
                        border:
                          config.viewMode === vm.value
                            ? '1px solid rgba(201,169,97,0.6)'
                            : '1px solid transparent',
                        color:
                          config.viewMode === vm.value
                            ? '#c9a961'
                            : 'rgba(var(--felt-ink-rgb),0.5)',
                      }}
                    >
                      {t(vm.labelKey as never)}
                    </button>
                  ))}
                </div>
              </SettingRow>

              <SettingRow label={t('challengeRuleTopBottomJing')}>
                <button
                  onClick={() =>
                    setConfig((c) => ({ ...c, ruleTopBottomJing: !c.ruleTopBottomJing }))
                  }
                  className="w-10 h-6 rounded-full relative transition-all"
                  style={{
                    background: config.ruleTopBottomJing
                      ? '#c9a961'
                      : 'rgba(var(--felt-ink-rgb),0.2)',
                  }}
                  aria-pressed={config.ruleTopBottomJing}
                >
                  <span
                    className="absolute top-1 w-4 h-4 rounded-full bg-white transition-all"
                    style={{ left: config.ruleTopBottomJing ? '22px' : '4px' }}
                  />
                </button>
              </SettingRow>
            </div>

            {createChallenge.isError && (
              <div
                className="px-4 py-3 rounded-xl text-sm font-semibold"
                style={{
                  background: 'rgba(192,57,43,0.12)',
                  border: '1px solid rgba(192,57,43,0.4)',
                  color: '#e74c3c',
                }}
              >
                {String(createChallenge.error)}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setStep('difficulty')}
                className="flex-1 py-3.5 rounded-[14px] font-semibold text-sm text-mj-bone/70"
                style={{
                  background: 'rgba(var(--felt-ink-rgb),0.06)',
                  border: '1px solid rgba(var(--felt-ink-rgb),0.12)',
                }}
              >
                ← {t('back')}
              </button>
              <button
                onClick={handleSubmit}
                disabled={isLoading}
                className="flex-1 py-3.5 rounded-[14px] font-bold text-sm text-mj-ink"
                style={{
                  background: isLoading
                    ? 'rgba(201,169,97,0.5)'
                    : 'linear-gradient(180deg,#c9a961 0%,#a88a45 100%)',
                  boxShadow: isLoading ? 'none' : '0 6px 18px rgba(201,169,97,0.3)',
                }}
              >
                {isLoading ? t('challengeCreating') : t('challengeCreatePlay')}
              </button>
            </div>
          </>
        )}
      </div>
    </ScreenShell>
  );
}

// ── Internal helper component ─────────────────────────────────────────────────

function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-mj-bone/70">{label}</span>
      {children}
    </div>
  );
}
