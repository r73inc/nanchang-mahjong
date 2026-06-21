/**
 * DevTestRoomSection — admin tool for creating a pre-configured test game.
 *
 * Lets an admin define a 13-tile waiting hand, optional open melds, a win
 * condition, and the winning tile, then launches a live game against 3 easy
 * bots. ELO and stats are unaffected (all bots → hasBots skips stats).
 */

import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '../../i18n';
import {
  useCreateDevTestGame,
  type TestWinCondition,
  type DevTestMeld,
} from '../../hooks/use-admin';
import { MahjongTile2D } from '../../components/2d/MahjongTile2D';
import type { TileType } from '@nanchang/shared';

// ── Tile layout ───────────────────────────────────────────────────────────────

const SUITS: TileType[][] = [
  ['1m', '2m', '3m', '4m', '5m', '6m', '7m', '8m', '9m'],
  ['1p', '2p', '3p', '4p', '5p', '6p', '7p', '8p', '9p'],
  ['1s', '2s', '3s', '4s', '5s', '6s', '7s', '8s', '9s'],
  ['east', 'south', 'west', 'north', 'zhong', 'fa', 'bai'],
];

// ── Types ─────────────────────────────────────────────────────────────────────

type HandMap = Partial<Record<TileType, number>>;

const CONDITIONS: TestWinCondition[] = ['immediate', 'self_draw', 'left_discard', 'right_discard'];

// ── Styles (matches the parent admin page tokens) ─────────────────────────────

const cardStyle = {
  background: 'rgba(var(--felt-ink-rgb),0.05)',
  border: '1px solid rgba(201,169,97,0.12)',
} as const;

const btnGhost =
  'px-2.5 py-1 rounded-md text-[11px] font-semibold transition-opacity disabled:opacity-40';
const btnGold = `${btnGhost} bg-mj-gold/15 text-mj-gold border border-mj-gold/25`;
const btnDanger = `${btnGhost} bg-mj-loss/15 text-mj-loss-light border border-mj-loss/25`;

// ── Hand total helper ─────────────────────────────────────────────────────────

function handTotal(hand: HandMap): number {
  return Object.values(hand).reduce((s, c) => s + (c ?? 0), 0);
}

function handToArray(hand: HandMap): TileType[] {
  const tiles: TileType[] = [];
  for (const [tile, count] of Object.entries(hand) as [TileType, number][]) {
    for (let i = 0; i < count; i++) tiles.push(tile);
  }
  return tiles;
}

// ── TilePickerGrid ────────────────────────────────────────────────────────────

function TilePickerGrid({
  hand,
  onAdd,
  onRemove,
  maxTotal = 13,
}: {
  hand: HandMap;
  onAdd: (tile: TileType) => void;
  onRemove: (tile: TileType) => void;
  maxTotal?: number;
}) {
  const { t } = useI18n();
  const total = handTotal(hand);

  return (
    <div className="space-y-1">
      {SUITS.map((row, ri) => (
        <div key={ri} className="flex gap-1 flex-wrap">
          {row.map((tile) => {
            const count = hand[tile] ?? 0;
            const canAdd = count < 4 && total < maxTotal;
            return (
              <div key={tile} className="relative">
                <button
                  type="button"
                  className={`flex flex-col items-center gap-0.5 rounded p-0.5 transition-all touch-manipulation
                    ${count > 0 ? 'ring-1 ring-mj-gold/40 bg-mj-gold/8' : 'bg-mj-bone/5 active:bg-mj-bone/10'}
                    ${canAdd ? 'cursor-pointer' : count === 0 ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
                  onClick={() => {
                    if (canAdd) onAdd(tile);
                  }}
                  aria-label={`${tile} ${count}/4`}
                >
                  <MahjongTile2D tile={tile} size="xs" role="bottom" interactive={false} />
                </button>
                {count > 0 && (
                  <button
                    type="button"
                    onClick={() => onRemove(tile)}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-mj-gold text-[9px] font-bold text-black flex items-center justify-center leading-none active:opacity-60 touch-manipulation z-10"
                    aria-label={`remove ${tile}`}
                  >
                    {count}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ))}
      <p className="text-[10px] text-mj-bone/40 mt-1">{t('adminDevTestPickerHint')}</p>
    </div>
  );
}

// ── WinTilePicker ─────────────────────────────────────────────────────────────

function WinTilePicker({
  selected,
  onSelect,
}: {
  selected: TileType | undefined;
  onSelect: (tile: TileType) => void;
}) {
  return (
    <div className="space-y-1">
      {SUITS.map((row, ri) => (
        <div key={ri} className="flex gap-1 flex-wrap">
          {row.map((tile) => (
            <button
              key={tile}
              type="button"
              className={`relative flex items-center justify-center rounded p-0.5 transition-all touch-manipulation
                ${selected === tile ? 'ring-2 ring-mj-gold bg-mj-gold/15' : 'bg-mj-bone/5 active:bg-mj-bone/10'}
                cursor-pointer`}
              onClick={() => onSelect(tile)}
              aria-label={tile}
              aria-pressed={selected === tile}
            >
              <MahjongTile2D tile={tile} size="xs" role="bottom" interactive={false} />
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

// ── MeldRow ───────────────────────────────────────────────────────────────────

const MELD_KINDS = ['chow', 'pung', 'kong'] as const;

function MeldBuilder({
  onAdd,
  onCancel,
}: {
  onAdd: (meld: DevTestMeld) => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [kind, setKind] = useState<DevTestMeld['kind']>('pung');
  const [baseTile, setBaseTile] = useState<TileType | undefined>();

  const buildMeldTiles = (k: DevTestMeld['kind'], base: TileType): string[] => {
    if (k === 'pung') return [base, base, base];
    if (k === 'kong') return [base, base, base, base];
    // chow: consecutive suit tiles
    const suitRow = SUITS.find((r) => r.includes(base));
    if (!suitRow) return [base, base, base]; // fallback
    const idx = suitRow.indexOf(base);
    if (idx > suitRow.length - 3) return [suitRow[idx - 2], suitRow[idx - 1], base];
    return [base, suitRow[idx + 1], suitRow[idx + 2]];
  };

  const handleAdd = () => {
    if (!baseTile) return;
    onAdd({
      kind,
      tiles: buildMeldTiles(kind, baseTile),
      concealed: false,
    });
  };

  return (
    <div
      className="rounded-[10px] p-3 space-y-2"
      style={{
        background: 'rgba(var(--felt-ink-rgb),0.06)',
        border: '1px solid rgba(201,169,97,0.1)',
      }}
    >
      {/* Kind selector */}
      <div className="flex gap-1.5">
        {MELD_KINDS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={`px-2 py-0.5 rounded text-[10px] font-semibold border transition-all ${
              kind === k
                ? 'bg-mj-gold/20 text-mj-gold border-mj-gold/40'
                : 'bg-mj-bone/8 text-mj-bone/50 border-mj-bone/12 hover:bg-mj-bone/15'
            }`}
          >
            {k === 'chow'
              ? t('adminDevTestMeldKindChow')
              : k === 'pung'
                ? t('adminDevTestMeldKindPung')
                : t('adminDevTestMeldKindKong')}
          </button>
        ))}
      </div>

      {/* Base tile */}
      <p className="text-[10px] text-mj-bone/50">{t('adminDevTestSelectMeldTiles')}</p>
      <div className="space-y-1">
        {SUITS.map((row, ri) => (
          <div key={ri} className="flex gap-1 flex-wrap">
            {row.map((tile) => (
              <button
                key={tile}
                type="button"
                onClick={() => setBaseTile(tile)}
                className={`rounded p-0.5 transition-all ${
                  baseTile === tile
                    ? 'ring-2 ring-mj-gold bg-mj-gold/15'
                    : 'bg-mj-bone/5 hover:bg-mj-bone/10'
                }`}
              >
                <MahjongTile2D tile={tile} size="xs" role="bottom" interactive={false} />
              </button>
            ))}
          </div>
        ))}
      </div>

      <div className="flex gap-2 pt-1">
        <button type="button" onClick={handleAdd} disabled={!baseTile} className={btnGold}>
          {t('adminDevTestAddMeld')}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className={btnGhost + ' text-mj-bone/50 border-mj-bone/15'}
        >
          {t('cancel')}
        </button>
      </div>
    </div>
  );
}

// ── DevTestRoomSection ────────────────────────────────────────────────────────

export function DevTestRoomSection() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { mutateAsync: createGame, isPending } = useCreateDevTestGame();

  const [hand, setHand] = useState<HandMap>({});
  const [openMelds, setOpenMelds] = useState<DevTestMeld[]>([]);
  const [condition, setCondition] = useState<TestWinCondition>('self_draw');
  const [winTile, setWinTile] = useState<TileType | undefined>();
  const [showMeldBuilder, setShowMeldBuilder] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = handTotal(hand);

  const addTile = useCallback(
    (tile: TileType) => {
      const count = hand[tile] ?? 0;
      if (count >= 4 || total >= 13) return;
      setHand((h) => ({ ...h, [tile]: count + 1 }));
    },
    [hand, total],
  );

  const removeTile = useCallback(
    (tile: TileType) => {
      const count = hand[tile] ?? 0;
      if (count === 0) return;
      setHand((h) => ({ ...h, [tile]: count - 1 }));
    },
    [hand],
  );

  const handleAddMeld = (meld: DevTestMeld) => {
    setOpenMelds((m) => [...m, meld]);
    setShowMeldBuilder(false);
  };

  const handleLaunch = async () => {
    setError(null);

    const handArr = handToArray(hand);

    if (handArr.length !== 13) {
      setError(t('adminDevTestValidationHand'));
      return;
    }
    if (!winTile) {
      setError(t('adminDevTestValidationWinTile'));
      return;
    }

    try {
      const { gameId } = await createGame({
        hand: handArr,
        openMelds: openMelds.length > 0 ? openMelds : undefined,
        condition,
        winTile,
      });
      navigate(`/game/${gameId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error'));
    }
  };

  function conditionLabel(cond: TestWinCondition) {
    if (cond === 'immediate') return t('adminDevTestConditionImmediate');
    if (cond === 'self_draw') return t('adminDevTestConditionSelfDraw');
    if (cond === 'left_discard') return t('adminDevTestConditionLeft');
    return t('adminDevTestConditionRight');
  }

  function conditionHint(cond: TestWinCondition) {
    if (cond === 'immediate') return t('adminDevTestConditionImmediateHint');
    if (cond === 'self_draw') return t('adminDevTestConditionSelfDrawHint');
    if (cond === 'left_discard') return t('adminDevTestConditionLeftHint');
    return t('adminDevTestConditionRightHint');
  }

  return (
    <div className="px-5 py-6">
      <div className="rounded-[14px] p-4 space-y-5" style={cardStyle}>
        <div>
          <h3 className="text-xs font-semibold text-mj-bone/70 mb-1">{t('adminDevTestHand')}</h3>
          <p className="text-[10px] text-mj-bone/40 mb-2">{t('adminDevTestHandHint')}</p>

          <TilePickerGrid hand={hand} onAdd={addTile} onRemove={removeTile} />

          {/* Selected hand summary */}
          {total > 0 && (
            <div className="mt-3 flex gap-0.5 flex-wrap">
              {handToArray(hand).map((tile, i) => (
                <MahjongTile2D
                  key={`${tile}-${i}`}
                  tile={tile}
                  size="xs"
                  role="bottom"
                  interactive={false}
                />
              ))}
              <span className="text-[10px] text-mj-bone/50 self-end ml-1">{total}/13</span>
            </div>
          )}

          {condition !== 'immediate' && (
            <p className="text-[10px] text-amber-400/60 mt-2">{t('adminDevTestHandTip')}</p>
          )}
        </div>

        {/* Open melds */}
        <div>
          <h3 className="text-xs font-semibold text-mj-bone/70 mb-1">
            {t('adminDevTestOpenMelds')}
          </h3>
          <div className="space-y-1.5">
            {openMelds.map((meld, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-[10px] text-mj-bone/50 uppercase">{meld.kind}</span>
                <div className="flex gap-0.5">
                  {meld.tiles.map((tile, j) => (
                    <MahjongTile2D
                      key={j}
                      tile={tile as TileType}
                      size="xs"
                      role="bottom"
                      interactive={false}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setOpenMelds((m) => m.filter((_, idx) => idx !== i))}
                  className={btnDanger}
                >
                  {t('adminDevTestRemoveMeld')}
                </button>
              </div>
            ))}
            {!showMeldBuilder && openMelds.length < 4 && (
              <button type="button" onClick={() => setShowMeldBuilder(true)} className={btnGold}>
                {t('adminDevTestAddMeld')}
              </button>
            )}
            {showMeldBuilder && (
              <MeldBuilder onAdd={handleAddMeld} onCancel={() => setShowMeldBuilder(false)} />
            )}
          </div>
        </div>

        {/* Win condition */}
        <div>
          <h3 className="text-xs font-semibold text-mj-bone/70 mb-2">
            {t('adminDevTestCondition')}
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {CONDITIONS.map((cond) => (
              <label
                key={cond}
                className={`flex flex-col gap-0.5 p-2 rounded-[10px] cursor-pointer border transition-all
                  ${
                    condition === cond
                      ? 'border-mj-gold/50 bg-mj-gold/8'
                      : 'border-mj-bone/10 bg-mj-bone/4 hover:border-mj-bone/20'
                  }`}
              >
                <div className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    name="condition"
                    value={cond}
                    checked={condition === cond}
                    onChange={() => setCondition(cond)}
                    className="accent-mj-gold"
                  />
                  <span className="text-[11px] font-semibold text-mj-bone/80">
                    {conditionLabel(cond)}
                  </span>
                </div>
                <span className="text-[9px] text-mj-bone/40 pl-4">{conditionHint(cond)}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Win tile (required for all conditions) */}
        <div>
          <h3 className="text-xs font-semibold text-mj-bone/70 mb-1">{t('adminDevTestWinTile')}</h3>
          <p className="text-[10px] text-mj-bone/40 mb-2">{t('adminDevTestWinTileHint')}</p>
          {winTile && (
            <div className="mb-2 flex items-center gap-2">
              <MahjongTile2D tile={winTile} size="sm" role="bottom" interactive={false} />
              <span className="text-[10px] text-mj-bone/60">{winTile}</span>
            </div>
          )}
          <WinTilePicker selected={winTile} onSelect={setWinTile} />
        </div>

        {/* Error */}
        {error && (
          <p className="text-[11px] text-mj-loss-light bg-mj-loss/10 rounded-md px-3 py-2 border border-mj-loss/20">
            {error}
          </p>
        )}

        {/* Launch */}
        <button
          type="button"
          onClick={() => void handleLaunch()}
          disabled={isPending}
          className="w-full py-2 rounded-[10px] text-sm font-bold bg-mj-gold/20 text-mj-gold border border-mj-gold/35 hover:bg-mj-gold/30 transition-all disabled:opacity-50"
        >
          {isPending ? t('adminDevTestLaunching') : t('adminDevTestLaunch')}
        </button>
      </div>
    </div>
  );
}
