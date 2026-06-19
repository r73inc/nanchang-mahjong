import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ScreenShell } from '../../components/ui/screen-shell';
import { InfoIconButton } from '../../components/ui/info-icon-button';
import { useI18n } from '../../i18n';
import type { StringKey } from '../../i18n/strings';
import { useRoomActions } from '../../hooks/use-room';
import { useRoomStore } from '../../stores/room.store';
import { useAuthStore } from '../../stores/auth.store';
import { connectSocket } from '../../lib/socket';
import type { BotDifficulty } from '@nanchang/shared';

// ── Constants ─────────────────────────────────────────────────────────────────

const VIEW_MODES = ['3D', '2D'] as const;
type ViewMode = (typeof VIEW_MODES)[number];

const ROUNDS_OPTIONS = ['east', 'east+south'] as const;
type RoundsOption = (typeof ROUNDS_OPTIONS)[number];

const TERMINATION_OPTIONS = ['rounds', 'bust', 'fixed-hands'] as const;
type TerminationOption = (typeof TERMINATION_OPTIONS)[number];

const MAX_HANDS_OPTIONS = [1, 2, 3, 4] as const;

const CLAIM_WINDOW_OPTIONS = [5, 8, 15, 30, 0] as const;
type ClaimWindowOption = (typeof CLAIM_WINDOW_OPTIONS)[number];

const BOT_DIFFICULTIES = ['easy', 'normal', 'hard', 'psychic'] as const;

const botDifficultyTranslationMap: Record<BotDifficulty, StringKey> = {
  easy: 'botDifficultyEasyFull',
  normal: 'botDifficultyNormalFull',
  hard: 'botDifficultyHardFull',
  psychic: 'botDifficultyPsychicFull',
};

function claimWindowKey(opt: ClaimWindowOption): StringKey {
  if (opt === 0) return 'settingClaimWindowInfinite';
  if (opt === 5) return 'settingClaimWindow5';
  if (opt === 8) return 'settingClaimWindow8';
  if (opt === 15) return 'settingClaimWindow15';
  return 'settingClaimWindow30';
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SettingRow({
  label,
  infoKey,
  onInfo,
  children,
  borderTop = true,
}: {
  label: string;
  infoKey?: string;
  onInfo?: () => void;
  children: React.ReactNode;
  borderTop?: boolean;
}) {
  const { t } = useI18n();
  return (
    <div
      className="flex justify-between items-center gap-3 px-4 py-3 text-sm"
      style={borderTop ? { borderTop: '1px solid rgba(var(--felt-ink-rgb),0.07)' } : {}}
    >
      <span className="flex items-center gap-1 text-mj-bone/70">
        {label}
        {infoKey && onInfo && <InfoIconButton ariaLabel={t('settingInfoOpen')} onClick={onInfo} />}
      </span>
      {children}
    </div>
  );
}

function ToggleGroup<T extends string | number | boolean>({
  options,
  active,
  getLabel,
  onChange,
}: {
  options: readonly T[];
  active: T;
  getLabel: (opt: T) => string;
  onChange: (opt: T) => void;
}) {
  return (
    <div className="flex gap-1.5 flex-wrap justify-end">
      {options.map((opt) => {
        const isActive = opt === active;
        return (
          <button
            key={String(opt)}
            onClick={() => onChange(opt)}
            className="px-3 py-1 rounded-full text-xs font-bold transition-colors"
            style={{
              background: isActive ? 'rgba(201,169,97,0.25)' : 'rgba(var(--felt-ink-rgb),0.06)',
              border: isActive
                ? '1px solid rgba(201,169,97,0.6)'
                : '1px solid rgba(var(--felt-ink-rgb),0.12)',
              color: isActive ? '#c9a961' : 'rgba(var(--felt-ink-rgb),0.45)',
            }}
            aria-pressed={isActive}
          >
            {getLabel(opt)}
          </button>
        );
      })}
    </div>
  );
}

// ── Settings info key → i18n key map ─────────────────────────────────────────

const INFO_KEYS: Partial<Record<string, StringKey>> = {
  settingStyleInfo: 'settingStyleInfo',
  settingJingInfo: 'settingJingInfo',
  settingTimerInfo: 'settingTimerInfo',
  settingViewModeInfo: 'settingViewModeInfo',
  settingTerminationInfo: 'settingTerminationInfo',
  settingRoundsInfo: 'settingRoundsInfo',
  settingClaimWindowInfo: 'settingClaimWindowInfo',
  settingTopBottomJingInfo: 'settingTopBottomJingInfo',
};

// ── Main page ─────────────────────────────────────────────────────────────────

export function PlaySoloPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { createRoom } = useRoomActions();
  const loading = useRoomStore((s) => s.loading);
  const error = useRoomStore((s) => s.error);
  const accessToken = useAuthStore((s) => s.accessToken);

  // Local settings state — sent as one atomic payload on submit
  const [botDifficulty, setBotDifficulty] = useState<BotDifficulty>('normal');
  const [viewMode, setViewMode] = useState<ViewMode>('3D');
  const [terminationType, setTerminationType] = useState<TerminationOption>('rounds');
  const [rounds, setRounds] = useState<RoundsOption>('east+south');
  const [maxHands, setMaxHands] = useState<number>(2);
  const [claimWindowSecs, setClaimWindowSecs] = useState<ClaimWindowOption>(8);
  const [ruleTopBottomJing, setRuleTopBottomJing] = useState(false);

  const [infoKey, setInfoKey] = useState<string | null>(null);

  async function handleStart() {
    if (accessToken) connectSocket(accessToken);
    // Single atomic call: create room + all settings + 3 bots in one request.
    // isSolo=true is stored immutably on the room so the room page can rely on
    // it without counting seats (which would race during sequential bot joins).
    const room = await createRoom({
      settings: {
        viewMode,
        terminationType,
        rounds,
        maxHands,
        claimWindowSecs,
        ruleTopBottomJing,
        isSolo: true,
      },
      bots: { count: 3, difficulty: botDifficulty },
    });
    if (room) navigate(`/room/${room.code}`);
  }

  return (
    <ScreenShell title={t('playSoloTitle')} onBack={() => navigate('/play')}>
      <div className="px-4 py-6 flex flex-col gap-5">
        {error && (
          <div
            className="px-4 py-3 rounded-xl text-sm font-semibold text-mj-loss-light"
            style={{
              background: 'rgba(192,57,43,0.12)',
              border: '1px solid rgba(192,57,43,0.4)',
            }}
          >
            {error}
          </div>
        )}

        {/* Bot difficulty */}
        <div
          className="rounded-2xl p-5"
          style={{
            background: 'rgba(90,125,140,0.06)',
            border: '1px solid rgba(90,125,140,0.25)',
          }}
        >
          <h2 className="text-base font-bold text-mj-bone mb-1">{t('botDifficultyLabel')}</h2>
          <p className="text-xs text-mj-bone/55 mb-4">{t('playSoloBotNote')}</p>
          <div className="flex gap-2 flex-wrap">
            {BOT_DIFFICULTIES.map((diff) => {
              const isPsychic = diff === 'psychic';
              const isActive = botDifficulty === diff;
              return (
                <button
                  key={diff}
                  onClick={() => setBotDifficulty(diff)}
                  className="px-3 py-1.5 rounded-full text-xs font-bold transition-colors"
                  style={{
                    background: isActive
                      ? isPsychic
                        ? 'rgba(130,80,180,0.3)'
                        : 'rgba(90,125,140,0.3)'
                      : isPsychic
                        ? 'rgba(130,80,180,0.1)'
                        : 'rgba(90,125,140,0.1)',
                    border: isActive
                      ? isPsychic
                        ? '1px solid rgba(130,80,180,0.7)'
                        : '1px solid rgba(90,125,140,0.7)'
                      : isPsychic
                        ? '1px solid rgba(130,80,180,0.3)'
                        : '1px solid rgba(90,125,140,0.3)',
                    color: isPsychic ? '#c090e8' : '#7ab5cc',
                  }}
                  aria-pressed={isActive}
                >
                  {t(botDifficultyTranslationMap[diff])}
                </button>
              );
            })}
          </div>
        </div>

        {/* Game settings */}
        <div>
          <p className="text-[11px] font-semibold tracking-wider text-mj-bone/65 mb-2">
            {t('roundSettings')}
          </p>
          <div
            className="rounded-[14px] overflow-hidden"
            style={{
              background: 'rgba(var(--felt-ink-rgb),0.04)',
              border: '1px solid rgba(var(--felt-ink-rgb),0.1)',
            }}
          >
            {/* Static read-only rows */}
            {[
              { label: t('settingStyleLabel'), value: t('settingStyle'), info: 'settingStyleInfo' },
              {
                label: t('settingJingLabel'),
                value: t('settingJingValue'),
                info: 'settingJingInfo',
              },
              {
                label: t('settingTimerLabel'),
                value: t('settingTimerValueInfinite'),
                info: 'settingTimerInfo',
              },
            ].map(({ label, value, info }, i) => (
              <div
                key={label}
                className="flex justify-between items-center px-4 py-3 text-sm"
                style={
                  i > 0 ? { borderTop: '1px solid rgba(var(--felt-ink-rgb),0.07)' } : undefined
                }
              >
                <span className="flex items-center gap-1 text-mj-bone/70">
                  {label}
                  <InfoIconButton
                    ariaLabel={t('settingInfoOpen')}
                    onClick={() => setInfoKey(info)}
                  />
                </span>
                <span className="text-mj-gold font-semibold">{value}</span>
              </div>
            ))}

            <SettingRow
              label={t('settingViewModeLabel')}
              infoKey="settingViewModeInfo"
              onInfo={() => setInfoKey('settingViewModeInfo')}
            >
              <ToggleGroup
                options={VIEW_MODES}
                active={viewMode}
                getLabel={(m) => t(m === '3D' ? 'settingViewMode3d' : 'settingViewMode2d')}
                onChange={setViewMode}
              />
            </SettingRow>

            <SettingRow
              label={t('settingTerminationLabel')}
              infoKey="settingTerminationInfo"
              onInfo={() => setInfoKey('settingTerminationInfo')}
            >
              <ToggleGroup
                options={TERMINATION_OPTIONS}
                active={terminationType}
                getLabel={(opt) =>
                  t(
                    opt === 'bust'
                      ? 'settingTerminationBust'
                      : opt === 'fixed-hands'
                        ? 'settingTerminationFixedHands'
                        : 'settingTerminationRounds',
                  )
                }
                onChange={setTerminationType}
              />
            </SettingRow>

            {terminationType === 'rounds' && (
              <SettingRow
                label={t('settingRoundsLabel')}
                infoKey="settingRoundsInfo"
                onInfo={() => setInfoKey('settingRoundsInfo')}
              >
                <ToggleGroup
                  options={ROUNDS_OPTIONS}
                  active={rounds}
                  getLabel={(opt) =>
                    t(opt === 'east+south' ? 'settingRoundsEastSouth' : 'settingRoundsEast')
                  }
                  onChange={setRounds}
                />
              </SettingRow>
            )}

            {terminationType === 'fixed-hands' && (
              <SettingRow label={t('settingMaxHandsLabel')}>
                <ToggleGroup
                  options={MAX_HANDS_OPTIONS}
                  active={maxHands}
                  getLabel={(n) => String(n)}
                  onChange={setMaxHands}
                />
              </SettingRow>
            )}

            <SettingRow
              label={t('settingClaimWindowLabel')}
              infoKey="settingClaimWindowInfo"
              onInfo={() => setInfoKey('settingClaimWindowInfo')}
            >
              <ToggleGroup
                options={CLAIM_WINDOW_OPTIONS}
                active={claimWindowSecs}
                getLabel={(opt) => t(claimWindowKey(opt as ClaimWindowOption))}
                onChange={(opt) => setClaimWindowSecs(opt as ClaimWindowOption)}
              />
            </SettingRow>

            <SettingRow
              label={t('settingTopBottomJingLabel')}
              infoKey="settingTopBottomJingInfo"
              onInfo={() => setInfoKey('settingTopBottomJingInfo')}
            >
              <ToggleGroup
                options={[false, true] as const}
                active={ruleTopBottomJing}
                getLabel={(on) => t(on ? 'settingTopBottomJingOn' : 'settingTopBottomJingOff')}
                onChange={setRuleTopBottomJing}
              />
            </SettingRow>
          </div>
        </div>

        {/* Start button — uses CSS utility class; only loading-state bg stays inline */}
        <button
          onClick={() => void handleStart()}
          disabled={loading}
          className={`w-full py-4 rounded-2xl font-bold text-base text-mj-ink ${loading ? '' : 'btn-heirloom-sm'}`}
          style={loading ? { background: 'rgba(201,169,97,0.5)' } : undefined}
        >
          {loading ? t('playSoloStarting') : t('playSoloStartBtn')}
        </button>
      </div>

      {/* Info modal */}
      {infoKey && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(10,10,10,0.6)', backdropFilter: 'blur(12px)' }}
          onClick={() => setInfoKey(null)}
        >
          <div
            className="w-full max-w-sm mx-4 rounded-xl p-6 flex flex-col gap-3"
            style={{ background: '#1c1c1c', border: '1px solid rgba(var(--felt-ink-rgb),0.15)' }}
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm text-mj-bone/80 leading-relaxed">
              {t(INFO_KEYS[infoKey] ?? 'settingStyleInfo')}
            </p>
            <button
              onClick={() => setInfoKey(null)}
              className="self-end px-4 py-2 rounded-xl text-xs font-bold text-mj-bone/70"
              style={{
                background: 'rgba(var(--felt-ink-rgb),0.08)',
                border: '1px solid rgba(var(--felt-ink-rgb),0.15)',
              }}
            >
              {t('settingInfoClose')}
            </button>
          </div>
        </div>
      )}
    </ScreenShell>
  );
}
