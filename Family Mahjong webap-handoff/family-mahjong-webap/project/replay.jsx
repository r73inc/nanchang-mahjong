// Replay & spectate screen. Plays back a finished game move-by-move so players
// can scrub through what happened, see the final hand, and share a hand card.
//
// The move log is a flat ordered array; each entry is one observable action.
// In production this should come from the server as the canonical game log.

const { useState: useStateR, useEffect: useEffectR, useRef: useRefR, useMemo: useMemoR } = React;

// ─────────────────────────────────────────────────────────────
// Sample move log for the most recent winning game (id=1)
// Player keys are the four winds; "tile" is the tile ID our renderer knows.
// ─────────────────────────────────────────────────────────────
const REPLAY_GAME = {
  id: 1,
  date: { en: 'Today · 8:42 PM', zh: '今天 · 20:42' },
  duration: '14:32',
  jingTile: 'b3',
  round: { en: 'East 1', zh: '东 1' },
  winner: 'east',
  winnerName: 'You',
  hand: { en: 'Mixed Triple Chow', zh: '混三色' },
  fan: 4,
  score: '+3,200',
  finalHand: ['c2','c3','c4','b5','b5','b5','d3','d4','d5','we','we','b3','b3','b3'],
  winningTile: 'b5',
  opponents: ['Mei', 'Wei', 'Lin'],
};

const WIND_GLYPH = { east: '東', south: '南', west: '西', north: '北' };
const WIND_NAME  = { east: 'You', south: 'Mei', west: 'Wei', north: 'Lin' };
const WIND_NAME_ZH = { east: '你', south: 'Mei', west: 'Wei', north: 'Lin' };
const WIND_COLOR = { east: '#c9a961', south: '#a36d3e', west: '#5a7d8c', north: '#7d4f4f' };

// 38 moves of a fictional East-wind round, ending in a self-drawn win.
const REPLAY_MOVES = [
  { i: 1,  player: 'east',  kind: 'draw',    tile: 'c5' },
  { i: 2,  player: 'east',  kind: 'discard', tile: 'wn' },
  { i: 3,  player: 'south', kind: 'draw',    tile: 'd2' },
  { i: 4,  player: 'south', kind: 'discard', tile: 'b1' },
  { i: 5,  player: 'west',  kind: 'draw',    tile: 'b9' },
  { i: 6,  player: 'west',  kind: 'discard', tile: 'we' },
  { i: 7,  player: 'north', kind: 'draw',    tile: 'd6' },
  { i: 8,  player: 'north', kind: 'discard', tile: 'ws' },
  { i: 9,  player: 'east',  kind: 'draw',    tile: 'b5' },
  { i: 10, player: 'east',  kind: 'discard', tile: 'c8' },
  { i: 11, player: 'south', kind: 'draw',    tile: 'c2' },
  { i: 12, player: 'south', kind: 'discard', tile: 'd1' },
  { i: 13, player: 'west',  kind: 'draw',    tile: 'd8' },
  { i: 14, player: 'west',  kind: 'discard', tile: 'b1' },
  { i: 15, player: 'north', kind: 'pung',    tile: 'b1', from: 'west' },
  { i: 16, player: 'north', kind: 'discard', tile: 'dg' },
  { i: 17, player: 'east',  kind: 'draw',    tile: 'd3' },
  { i: 18, player: 'east',  kind: 'discard', tile: 'dr' },
  { i: 19, player: 'south', kind: 'draw',    tile: 'b4' },
  { i: 20, player: 'south', kind: 'discard', tile: 'c9' },
  { i: 21, player: 'west',  kind: 'draw',    tile: 'we' },
  { i: 22, player: 'west',  kind: 'discard', tile: 'b8' },
  { i: 23, player: 'north', kind: 'draw',    tile: 'b2' },
  { i: 24, player: 'north', kind: 'discard', tile: 'd9' },
  { i: 25, player: 'east',  kind: 'draw',    tile: 'we' },
  { i: 26, player: 'east',  kind: 'discard', tile: 'c1' },
  { i: 27, player: 'south', kind: 'draw',    tile: 'd5' },
  { i: 28, player: 'south', kind: 'discard', tile: 'd7' },
  { i: 29, player: 'west',  kind: 'draw',    tile: 'c6' },
  { i: 30, player: 'west',  kind: 'discard', tile: 'd5' },
  { i: 31, player: 'east',  kind: 'chow',    tile: 'd5', from: 'west' },
  { i: 32, player: 'east',  kind: 'discard', tile: 'c5' },
  { i: 33, player: 'south', kind: 'draw',    tile: 'c7' },
  { i: 34, player: 'south', kind: 'discard', tile: 'wn' },
  { i: 35, player: 'west',  kind: 'draw',    tile: 'b6' },
  { i: 36, player: 'west',  kind: 'discard', tile: 'b7' },
  { i: 37, player: 'north', kind: 'draw',    tile: 'b3' },
  { i: 38, player: 'east',  kind: 'win',     tile: 'b5', method: 'self-drawn' },
];

const ACTION_TONE = {
  draw:    { color: 'rgba(245,239,223,0.75)', bg: 'rgba(245,239,223,0.05)' },
  discard: { color: '#c9a961', bg: 'rgba(201,169,97,0.08)' },
  pung:    { color: '#c9a961', bg: 'rgba(201,169,97,0.18)' },
  kong:    { color: '#a36d3e', bg: 'rgba(163,109,62,0.2)' },
  chow:    { color: '#5a7d8c', bg: 'rgba(90,125,140,0.2)' },
  win:     { color: '#c0392b', bg: 'rgba(192,57,43,0.22)' },
};

function actionLabel(kind, lang) {
  if (lang === 'zh') {
    return ({ draw: '摸', discard: '出', pung: '碰', kong: '杠', chow: '吃', win: '胡!' })[kind];
  }
  return ({ draw: 'drew', discard: 'discarded', pung: 'called Pung', kong: 'called Kong', chow: 'called Chow', win: 'WIN!' })[kind];
}

// ─────────────────────────────────────────────────────────────
// Main Replay screen
// ─────────────────────────────────────────────────────────────
function ReplayScreen({ game, onBack, onShareCardOpen }) {
  const { t, lang } = useI18n();
  const data = game || REPLAY_GAME;
  const moves = REPLAY_MOVES;
  const [idx, setIdx] = useStateR(moves.length - 1);
  const [playing, setPlaying] = useStateR(false);
  const [showShare, setShowShare] = useStateR(false);
  const [speed, setSpeed] = useStateR(1); // 1x | 2x | 4x
  const listRef = useRefR(null);

  // Playback timer
  useEffectR(() => {
    if (!playing) return;
    if (idx >= moves.length - 1) { setPlaying(false); return; }
    const delay = 700 / speed;
    const tid = setTimeout(() => setIdx(i => Math.min(i + 1, moves.length - 1)), delay);
    return () => clearTimeout(tid);
  }, [playing, idx, speed, moves.length]);

  // Keep the current move row in view in the list
  useEffectR(() => {
    if (!listRef.current) return;
    const row = listRef.current.querySelector(`[data-mv="${idx}"]`);
    if (row) row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [idx]);

  const move = moves[idx];

  // Discard pools per player at the current scrub position
  const pools = useMemoR(() => {
    const p = { east: [], south: [], west: [], north: [] };
    for (let n = 0; n <= idx; n++) {
      const m = moves[n];
      if (m.kind === 'discard') p[m.player].push(m.tile);
    }
    return p;
  }, [idx]);

  // Melds claimed up to current move
  const melds = useMemoR(() => {
    const m = { east: [], south: [], west: [], north: [] };
    for (let n = 0; n <= idx; n++) {
      const mv = moves[n];
      if (mv.kind === 'pung' || mv.kind === 'kong' || mv.kind === 'chow') {
        m[mv.player].push({ kind: mv.kind, tile: mv.tile, from: mv.from });
      }
    }
    return m;
  }, [idx]);

  return (
    <ScreenShell title={lang === 'zh' ? '回放' : 'Replay'} onBack={onBack}>
      <div style={{ padding: '12px 14px 20px' }}>
        {/* Header summary card */}
        <div style={{
          padding: 14, borderRadius: 16,
          background: 'rgba(201,169,97,0.1)',
          border: '1px solid rgba(201,169,97,0.35)',
          marginBottom: 14,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
            <div style={{
              fontSize: 11, letterSpacing: 1, fontWeight: 700,
              color: 'rgba(245,239,223,0.7)',
            }}>{(lang === 'zh' ? data.date.zh : data.date.en).toUpperCase()}</div>
            <div style={{ fontSize: 11, opacity: 0.6, fontFamily: 'ui-monospace, monospace' }}>
              {lang === 'zh' ? `时长 ${data.duration}` : `${data.duration} long`}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: WIND_COLOR[data.winner],
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'serif', fontSize: 18, color: '#fff', fontWeight: 700,
            }}>{WIND_GLYPH[data.winner]}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>
                {data.winnerName} · {lang === 'zh' ? data.hand.zh : data.hand.en}
              </div>
              <div style={{ fontSize: 11, opacity: 0.7 }}>
                {data.fan} {lang === 'zh' ? '番' : 'fan'} · vs {data.opponents.join(', ')}
              </div>
            </div>
            <div style={{
              fontFamily: 'ui-monospace, monospace', fontSize: 16, fontWeight: 700,
              color: '#7fc299',
            }}>{data.score}</div>
          </div>
        </div>

        {/* Final hand strip */}
        <SectionLabel>{lang === 'zh' ? '最终牌型' : 'Final hand'}</SectionLabel>
        <div style={{
          padding: 10, borderRadius: 14,
          background: 'rgba(245,239,223,0.04)',
          border: '1px solid rgba(245,239,223,0.1)',
          marginBottom: 14, overflowX: 'auto',
        }}>
          <div style={{ display: 'flex', gap: 2, alignItems: 'center', minWidth: 'fit-content' }}>
            {data.finalHand.map((tile, n) => {
              const isWinning = tile === data.winningTile;
              return (
                <div key={n} style={{
                  position: 'relative',
                  ...(isWinning && {
                    boxShadow: '0 0 0 2px #c9a961, 0 4px 10px rgba(201,169,97,0.4)',
                    borderRadius: 6,
                  }),
                  ...(n === data.finalHand.length - 1 && { marginLeft: 6 }),
                }}>
                  <MahjongTile id={tile} size="sm" />
                </div>
              );
            })}
          </div>
          <div style={{
            fontSize: 10, opacity: 0.6, marginTop: 8, fontWeight: 600,
            letterSpacing: 0.5, textAlign: 'right',
            fontFamily: 'ui-monospace, monospace',
          }}>
            {lang === 'zh' ? '高亮 = 胡牌' : 'HIGHLIGHTED = WINNING TILE'}
          </div>
        </div>

        {/* Scrubber + transport */}
        <SectionLabel>{lang === 'zh' ? '回放' : 'Playback'}</SectionLabel>
        <div style={{
          padding: 12, borderRadius: 14,
          background: 'rgba(245,239,223,0.04)',
          border: '1px solid rgba(245,239,223,0.1)',
          marginBottom: 14,
        }}>
          {/* Current move callout */}
          <div style={{
            padding: 8, borderRadius: 10,
            background: ACTION_TONE[move.kind].bg,
            border: `1px solid ${ACTION_TONE[move.kind].color}55`,
            marginBottom: 10,
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <div style={{
              minWidth: 40,
              fontFamily: 'ui-monospace, monospace', fontSize: 10,
              opacity: 0.55, fontWeight: 700, letterSpacing: 1,
            }}>{String(idx + 1).padStart(2, '0')}/{moves.length}</div>
            <div style={{
              width: 24, height: 24, borderRadius: 6,
              background: WIND_COLOR[move.player],
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontFamily: 'serif', fontSize: 13, fontWeight: 700,
            }}>{WIND_GLYPH[move.player]}</div>
            <div style={{
              fontSize: 12, fontWeight: 700, flex: 1,
              color: ACTION_TONE[move.kind].color,
            }}>
              {lang === 'zh'
                ? `${lang === 'zh' ? WIND_NAME_ZH[move.player] : WIND_NAME[move.player]} ${actionLabel(move.kind, 'zh')}`
                : `${WIND_NAME[move.player]} ${actionLabel(move.kind, 'en')}`}
            </div>
            <MahjongTile id={move.tile} size="xs" />
          </div>

          {/* Tick scrubber */}
          <input
            type="range"
            min={0} max={moves.length - 1} value={idx}
            onChange={e => { setIdx(parseInt(e.target.value, 10)); setPlaying(false); }}
            style={{
              width: '100%', accentColor: '#c9a961', height: 28,
            }}
          />
          <TickBar moves={moves} idx={idx} onPick={(n) => { setIdx(n); setPlaying(false); }} />

          {/* Transport row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
            <button onClick={() => setIdx(0)} style={transportBtn} title={lang === 'zh' ? '从头' : 'Restart'}>⏮</button>
            <button onClick={() => setIdx(i => Math.max(0, i - 1))} style={transportBtn}>‹</button>
            <button onClick={() => setPlaying(p => !p)} style={{ ...transportBtn, ...transportPrimary }}>
              {playing ? '❚❚' : '▶'}
            </button>
            <button onClick={() => setIdx(i => Math.min(moves.length - 1, i + 1))} style={transportBtn}>›</button>
            <button onClick={() => setIdx(moves.length - 1)} style={transportBtn}>⏭</button>
            <div style={{ flex: 1 }} />
            <button onClick={() => setSpeed(s => s >= 4 ? 1 : s * 2)} style={{
              ...transportBtn, width: 'auto', padding: '0 12px', fontSize: 11,
              fontFamily: 'ui-monospace, monospace', letterSpacing: 0.5,
            }}>{speed}×</button>
          </div>
        </div>

        {/* Pools-at-this-point summary */}
        <SectionLabel>{lang === 'zh' ? '弃牌池 (本回合)' : 'Discards (at this point)'}</SectionLabel>
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14,
        }}>
          {(['east','south','west','north']).map(p => (
            <div key={p} style={{
              padding: 8, borderRadius: 12,
              background: 'rgba(245,239,223,0.04)',
              border: '1px solid rgba(245,239,223,0.08)',
              minHeight: 78,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <div style={{
                  width: 18, height: 18, borderRadius: 5,
                  background: WIND_COLOR[p],
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'serif', fontSize: 10, color: '#fff', fontWeight: 700,
                }}>{WIND_GLYPH[p]}</div>
                <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.85 }}>
                  {lang === 'zh' ? WIND_NAME_ZH[p] : WIND_NAME[p]}
                </div>
                <div style={{ flex: 1 }} />
                <div style={{ fontSize: 9, opacity: 0.55, fontFamily: 'ui-monospace, monospace' }}>
                  {pools[p].length}
                </div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {pools[p].slice(-8).map((tile, n) => (
                  <MahjongTile key={n} id={tile} size="tn" />
                ))}
                {pools[p].length === 0 && (
                  <div style={{ fontSize: 10, opacity: 0.4, padding: '2px 4px' }}>—</div>
                )}
              </div>
              {melds[p].length > 0 && (
                <div style={{
                  marginTop: 6, paddingTop: 6,
                  borderTop: '1px dashed rgba(245,239,223,0.08)',
                  display: 'flex', flexWrap: 'wrap', gap: 4,
                }}>
                  {melds[p].map((m, n) => (
                    <div key={n} style={{
                      padding: '2px 5px', borderRadius: 4,
                      background: ACTION_TONE[m.kind].bg,
                      color: ACTION_TONE[m.kind].color,
                      fontSize: 8, fontWeight: 700, letterSpacing: 0.5,
                    }}>{m.kind.toUpperCase()}</div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Move log */}
        <SectionLabel>{lang === 'zh' ? '出牌记录' : 'Move log'}</SectionLabel>
        <div ref={listRef} style={{
          maxHeight: 260, overflowY: 'auto', borderRadius: 12,
          border: '1px solid rgba(245,239,223,0.1)',
          background: 'rgba(245,239,223,0.025)',
          marginBottom: 16,
        }}>
          {moves.map((m, n) => {
            const past = n <= idx;
            const isCurrent = n === idx;
            const tone = ACTION_TONE[m.kind];
            return (
              <button
                key={m.i} data-mv={n}
                onClick={() => { setIdx(n); setPlaying(false); }}
                style={{
                  display: 'flex', width: '100%', alignItems: 'center', gap: 8,
                  padding: '7px 10px',
                  background: isCurrent ? 'rgba(201,169,97,0.14)' : 'transparent',
                  border: 'none',
                  borderBottom: '1px solid rgba(245,239,223,0.05)',
                  color: past ? '#f5efdf' : 'rgba(245,239,223,0.4)',
                  fontFamily: 'inherit', textAlign: 'left',
                  cursor: 'pointer',
                  borderLeft: isCurrent ? '3px solid #c9a961' : '3px solid transparent',
                }}>
                <div style={{
                  fontFamily: 'ui-monospace, monospace', fontSize: 9,
                  opacity: 0.55, fontWeight: 700,
                  minWidth: 24,
                }}>{String(m.i).padStart(2, '0')}</div>
                <div style={{
                  width: 16, height: 16, borderRadius: 4,
                  background: WIND_COLOR[m.player],
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'serif', fontSize: 10, color: '#fff', fontWeight: 700,
                  opacity: past ? 1 : 0.4,
                }}>{WIND_GLYPH[m.player]}</div>
                <div style={{ flex: 1, fontSize: 12, fontWeight: 500 }}>
                  <span style={{ opacity: 0.75 }}>{lang === 'zh' ? WIND_NAME_ZH[m.player] : WIND_NAME[m.player]}</span>
                  <span style={{ color: tone.color, fontWeight: 700, marginLeft: 6 }}>
                    {actionLabel(m.kind, lang)}
                  </span>
                  {m.from && (
                    <span style={{ opacity: 0.55, marginLeft: 4, fontSize: 11 }}>
                      ← {lang === 'zh' ? WIND_NAME_ZH[m.from] : WIND_NAME[m.from]}
                    </span>
                  )}
                </div>
                <div style={{ opacity: past ? 1 : 0.4 }}>
                  <MahjongTile id={m.tile} size="tn" />
                </div>
              </button>
            );
          })}
        </div>

        {/* Share button */}
        <button onClick={() => setShowShare(true)} style={{
          width: '100%', padding: 13, borderRadius: 12,
          background: 'rgba(201,169,97,0.16)',
          border: '1px solid rgba(201,169,97,0.45)',
          color: '#c9a961', fontWeight: 700, fontSize: 13,
          cursor: 'pointer', display: 'flex', alignItems: 'center',
          justifyContent: 'center', gap: 8,
          fontFamily: 'inherit',
        }}>
          <span style={{ fontFamily: 'serif', fontSize: 16 }}>分享</span>
          {lang === 'zh' ? '分享这手牌' : 'Share this hand'}
        </button>
      </div>

      <ShareHandSheet
        open={showShare}
        onClose={() => setShowShare(false)}
        data={data}
      />
    </ScreenShell>
  );
}

// ─────────────────────────────────────────────────────────────
// Tick bar — visual marker for non-trivial moves
// ─────────────────────────────────────────────────────────────
function TickBar({ moves, idx, onPick }) {
  return (
    <div style={{
      position: 'relative', height: 14, marginTop: -8,
      display: 'flex', alignItems: 'center',
    }}>
      <div style={{ position: 'absolute', left: 0, right: 0, height: 1, background: 'rgba(245,239,223,0.08)' }} />
      {moves.map((m, n) => {
        const pct = (n / (moves.length - 1)) * 100;
        const big = m.kind !== 'draw' && m.kind !== 'discard';
        const isCurrent = n === idx;
        const isPast = n <= idx;
        return (
          <button
            key={m.i}
            onClick={() => onPick(n)}
            style={{
              position: 'absolute', left: `${pct}%`, transform: 'translateX(-50%)',
              width: big ? 8 : 4, height: big ? 10 : 5,
              borderRadius: big ? 2 : 1,
              background: isPast
                ? (m.kind === 'win' ? '#c0392b'
                  : m.kind === 'pung' || m.kind === 'kong' || m.kind === 'chow' ? '#c9a961'
                  : 'rgba(245,239,223,0.5)')
                : 'rgba(245,239,223,0.15)',
              border: 'none', cursor: 'pointer', padding: 0,
              outline: isCurrent ? '2px solid #c9a961' : 'none',
              outlineOffset: 1,
            }}
            title={`${m.i}. ${m.kind}`}
          />
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Share hand — modal showing a "card" that can be shared / copied
// ─────────────────────────────────────────────────────────────
function ShareHandSheet({ open, onClose, data }) {
  const { lang } = useI18n();
  const [copied, setCopied] = useStateR(false);
  if (!open) return null;
  const copy = () => {
    const url = `https://nanchang.mj/replay/${data.id}`;
    try { navigator.clipboard?.writeText(url); } catch {}
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };
  return (
    <div onClick={onClose} style={{
      position: 'absolute', inset: 0, zIndex: 220,
      background: 'rgba(5,18,12,0.7)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16, animation: 'fadeIn 0.2s ease forwards',
    }}>
      <style>{SKEL_KEYFRAMES}</style>
      <div onClick={e => e.stopPropagation()} style={{
        width: '100%', maxWidth: 320,
        background: 'rgba(20,46,38,0.98)',
        border: '1px solid rgba(201,169,97,0.4)',
        borderRadius: 22, padding: 18, color: '#f5efdf',
        animation: 'overlayIn 0.25s ease forwards',
        boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
      }}>
        {/* Sharable card preview */}
        <div style={{
          padding: '18px 14px',
          borderRadius: 16,
          background: 'linear-gradient(160deg, #0d3b2e 0%, #061a14 100%)',
          border: '1px solid rgba(201,169,97,0.3)',
          marginBottom: 14, textAlign: 'center',
        }}>
          <div style={{
            fontFamily: 'serif', fontSize: 28, color: '#c9a961', lineHeight: 1, fontWeight: 700,
          }}>胡</div>
          <div style={{
            fontSize: 10, letterSpacing: 3, color: 'rgba(245,239,223,0.6)', marginTop: 4,
            fontFamily: 'ui-monospace, monospace', fontWeight: 700,
          }}>NANCHANG MAHJONG</div>
          <div style={{ marginTop: 14, marginBottom: 8, fontWeight: 700, fontSize: 14 }}>
            {data.winnerName} · {lang === 'zh' ? data.hand.zh : data.hand.en}
          </div>
          <div style={{ fontSize: 11, opacity: 0.65, marginBottom: 14 }}>
            {data.fan} {lang === 'zh' ? '番' : 'fan'} · {data.score}
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 1, flexWrap: 'wrap' }}>
            {data.finalHand.map((tile, n) => (
              <MahjongTile key={n} id={tile} size="xs" />
            ))}
          </div>
        </div>

        {/* Share actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button onClick={copy} style={{
            padding: 12, borderRadius: 12,
            background: 'linear-gradient(180deg, #c9a961 0%, #a88a45 100%)',
            color: '#1f2937', border: 'none', fontWeight: 700, fontSize: 13,
            cursor: 'pointer', fontFamily: 'inherit',
            boxShadow: '0 4px 12px rgba(201,169,97,0.3)',
          }}>{copied
            ? (lang === 'zh' ? '✓ 链接已复制' : '✓ Link copied')
            : (lang === 'zh' ? '复制链接' : 'Copy share link')
          }</button>
          <button onClick={onClose} style={{
            padding: 11, borderRadius: 12,
            background: 'transparent', border: '1px solid rgba(245,239,223,0.18)',
            color: '#f5efdf', fontWeight: 600, fontSize: 12, cursor: 'pointer',
            fontFamily: 'inherit',
          }}>{lang === 'zh' ? '取消' : 'Close'}</button>
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: 10, letterSpacing: 1, opacity: 0.6, fontWeight: 700,
      marginBottom: 8, textTransform: 'uppercase',
    }}>{children}</div>
  );
}

const transportBtn = {
  width: 40, height: 36, borderRadius: 10,
  background: 'rgba(245,239,223,0.06)',
  border: '1px solid rgba(245,239,223,0.12)',
  color: '#f5efdf', fontSize: 14, fontWeight: 700,
  cursor: 'pointer', fontFamily: 'inherit',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};
const transportPrimary = {
  background: '#c9a961',
  border: '1px solid #c9a961',
  color: '#1f2937',
  width: 48,
};

Object.assign(window, { ReplayScreen, REPLAY_GAME });
