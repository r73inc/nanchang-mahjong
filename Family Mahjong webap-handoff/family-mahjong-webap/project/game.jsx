// Gameplay screen — the heart of the app.
// 4-player table on a phone screen using the "compass" layout (top/left/right/bottom).
// Player's hand is at the bottom with drag-up-to-discard interaction.

const { useState, useRef, useEffect, useCallback } = React;

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
const SAMPLE_HAND = ['c2','c3','c4','b5','b5','b5','d3','d4','d5','we','we','dr','dr'];
const SAMPLE_DISCARDS = {
  bottom: ['c1','d8','wn'],
  right:  ['b1','c9','ws','d2'],
  top:    ['d6','b3','c5','we','dg'],
  left:   ['c7','d1','b8'],
};
const PLAYERS = {
  bottom: { name: 'You',     wind: '東', score: 24500, avatar: '#c9a961' },
  right:  { name: 'Mei',     wind: '南', score: 25500, avatar: '#a36d3e' },
  top:    { name: 'Wei',     wind: '西', score: 23000, avatar: '#5a7d8c' },
  left:   { name: 'Lin',     wind: '北', score: 27000, avatar: '#7d4f4f' },
};

// Themed tile shortcut — applies the current Customize theme to every tile
// rendered inside the gameplay surface, so swatch choices actually show up.
function TT(props) {
  const { theme } = useTheme();
  return (
    <TT
      faceColor={theme.face}
      edgeColor={theme.edge}
      inkColor={theme.ink}
      redInk={theme.redInk}
      greenInk={theme.greenInk}
      backColor={theme.back}
      backAccent={theme.backAccent}
      {...props}
    />
  );
}

// ─────────────────────────────────────────────────────────────
// Player nameplate (used at top, left, right)
// ─────────────────────────────────────────────────────────────
function Nameplate({ player, position, active, afk, jingTile }) {
  const isVertical = position === 'left' || position === 'right';
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      flexDirection: isVertical ? 'column' : 'row',
      padding: '4px 8px', borderRadius: 12,
      background: active ? 'rgba(201,169,97,0.18)' : 'rgba(0,0,0,0.25)',
      border: active ? '1px solid #c9a961' : '1px solid rgba(255,255,255,0.06)',
      backdropFilter: 'blur(8px)',
      transition: 'all 0.3s',
    }}>
      <div style={{
        width: 28, height: 28, borderRadius: 8,
        background: player.avatar,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'serif', fontSize: 16, color: '#fff', fontWeight: 700,
        boxShadow: 'inset 0 -2px 0 rgba(0,0,0,0.2)',
      }}>{player.wind}</div>
      <div style={{
        display: 'flex', flexDirection: 'column',
        alignItems: isVertical ? 'center' : 'flex-start',
        color: '#f5efdf', fontSize: 11, lineHeight: 1.2,
      }}>
        <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
          {player.name}
          {afk && <AfkBadge small />}
        </div>
        <div style={{ opacity: 0.65, fontFamily: 'ui-monospace, monospace' }}>
          {player.score.toLocaleString()}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Discard pool — tiles laid down by a player
// ─────────────────────────────────────────────────────────────
function DiscardPool({ tiles, position }) {
  const isVertical = position === 'left' || position === 'right';
  const rotation = { bottom: 0, right: 270, top: 180, left: 90 }[position];
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: isVertical ? 'repeat(2, auto)' : 'repeat(8, auto)',
      gap: 2, justifyContent: 'center',
    }}>
      {tiles.slice(0, 16).map((id, i) => (
        <TT key={i} id={id} size="tn" rotation={rotation} />
      ))}
    </div>
  );
}

// Action UI is LOCKED to "Side rail" — see SideRail component below.
// (Action sheet + FAB variants removed at handoff. See "Handoff Sheet.html".)

const ACTION_META = {
  pung: { labelKey: 'pung', sub: '碰', color: '#c9a961', descKey: 'threeKind' },
  kong: { labelKey: 'kong', sub: '槓', color: '#a36d3e', descKey: 'fourKind' },
  chow: { labelKey: 'chow', sub: '吃', color: '#5a7d8c', descKey: 'sequence' },
  win:  { labelKey: 'win',  sub: '胡', color: '#c0392b', descKey: 'hu' },
  pass: { labelKey: 'pass', sub: '過', color: 'rgba(255,255,255,0.15)', descKey: 'skip' },
};

// ─────────────────────────────────────────────────────────────
// Side rail with auto-pass timer (LOCKED action UI)
// ─────────────────────────────────────────────────────────────
function SideRail({ actions, onAction, timer = 8, ctx = { tile: 'b5', from: 'Mei', kind: 'discard' } }) {
  const { t: tr } = useI18n();
  const [t, setT] = useState(timer);
  useEffect(() => {
    if (!actions.length) return;
    setT(timer);
    const start = Date.now();
    const id = setInterval(() => {
      const elapsed = (Date.now() - start) / 1000;
      const left = Math.max(0, timer - elapsed);
      setT(left);
      if (left <= 0) { clearInterval(id); onAction('pass'); }
    }, 50);
    return () => clearInterval(id);
  }, [actions.join(','), timer]);

  if (!actions.length) return null;
  const pct = t / timer;
  return (
    <div style={{
      position: 'absolute', right: 8, bottom: 180,
      display: 'flex', flexDirection: 'column', gap: 6, zIndex: 30,
      alignItems: 'center',
    }}>
      {/* Timer ring + context label */}
      <div style={{
        width: 60, padding: '6px 4px', borderRadius: 12,
        background: 'rgba(20,46,38,0.9)', border: '1px solid rgba(201,169,97,0.3)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
      }}>
        <div style={{ position: 'relative', width: 30, height: 30 }}>
          <svg viewBox="0 0 36 36" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
            <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(201,169,97,0.2)" strokeWidth="3" />
            <circle cx="18" cy="18" r="15" fill="none" stroke="#c9a961" strokeWidth="3"
              strokeDasharray={`${94.2 * pct} 94.2`} strokeLinecap="round" />
          </svg>
          <div style={{
            position: 'absolute', inset: 0, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            color: '#c9a961', fontWeight: 700, fontSize: 11,
            fontFamily: 'ui-monospace, monospace',
          }}>{Math.ceil(t)}</div>
        </div>
        <div style={{ fontSize: 8, color: '#c9a961', fontWeight: 700, letterSpacing: 0.5, textAlign: 'center', lineHeight: 1.1 }}>
          {ctx.from?.toUpperCase()}
        </div>
      </div>
      {actions.map(a => (
        <button key={a} onClick={() => onAction(a)} style={{
          width: 60, padding: '10px 6px', borderRadius: 12,
          background: a === 'pass' ? 'rgba(20,46,38,0.9)' : ACTION_META[a].color,
          color: a === 'pung' ? '#1f2937' : '#fff',
          border: '1px solid rgba(255,255,255,0.2)',
          fontWeight: 700, fontSize: 12,
          boxShadow: '0 4px 14px rgba(0,0,0,0.35)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
        onPointerDown={e => e.currentTarget.style.transform = 'scale(0.96)'}
        onPointerUp={e => e.currentTarget.style.transform = ''}
        onPointerLeave={e => e.currentTarget.style.transform = ''}
        >
          <span style={{ fontFamily: 'serif', fontSize: 18 }}>{ACTION_META[a].sub}</span>
          <span>{tr(ACTION_META[a].labelKey)}</span>
        </button>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Player's hand at the bottom — TAP + DISCARD button (locked interaction)
// ─────────────────────────────────────────────────────────────
function PlayerHand({ tiles, drawnTile, onDiscard, selectedIdx, setSelectedIdx }) {
  const { t: tr } = useI18n();
  const tap = (i) => setSelectedIdx(i);
  const showHint = selectedIdx !== null;

  return (
    <>
      {/* Hint zone above the hand */}
      {showHint && (
        <div style={{
          position: 'absolute', left: 16, right: 16, bottom: 130,
          height: 56, borderRadius: 14,
          border: '2px dashed #c9a961',
          background: 'rgba(201,169,97,0.1)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#c9a961',
          fontSize: 12, fontWeight: 600, letterSpacing: 0.5,
          backdropFilter: 'blur(4px)',
          zIndex: 25, pointerEvents: 'none',
        }}>
          {tr('tapBelow')}
        </div>
      )}

      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 56,
        padding: '8px 10px 10px',
        background: 'linear-gradient(180deg, rgba(8,30,23,0) 0%, rgba(8,30,23,0.7) 50%)',
        zIndex: 20,
      }}>
        {/* Discard confirm button */}
        {selectedIdx !== null && (
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
            <button onClick={() => onDiscard(selectedIdx)} style={{
              padding: '10px 28px', borderRadius: 999,
              background: '#c9a961', color: '#1f2937',
              border: 'none', fontWeight: 700, fontSize: 13,
              boxShadow: '0 4px 12px rgba(201,169,97,0.4)',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}>{tr('discard')}</button>
          </div>
        )}

        <div style={{
          display: 'flex', justifyContent: 'center', alignItems: 'flex-end',
          gap: 2, flexWrap: 'nowrap', overflowX: 'auto',
          padding: '20px 4px 4px',
        }}>
          {tiles.map((id, i) => (
            <div key={i} style={{ position: 'relative' }}>
              <TT
                id={id} size="md"
                selected={selectedIdx === i}
                onPointerDown={() => tap(i)}
              />
            </div>
          ))}
          {drawnTile && (
            <div style={{ marginLeft: 8, position: 'relative' }}>
              <div style={{
                position: 'absolute', top: -16, left: '50%', transform: 'translateX(-50%)',
                fontSize: 8, fontWeight: 700, color: '#c9a961',
                fontFamily: 'ui-monospace, monospace', letterSpacing: 1,
              }}>{tr('drawn')}</div>
              <TT
                id={drawnTile} size="md"
                selected={selectedIdx === tiles.length}
                onPointerDown={() => tap(tiles.length)}
                style={{ boxShadow: '0 0 0 2px #c9a961, 0 4px 10px rgba(201,169,97,0.35)' }}
              />
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// Top status — wall count, round, jing tile
// ─────────────────────────────────────────────────────────────
function GameStatusBar({ wallLeft, round, jingTile, onMenu }) {
  const { t: tr } = useI18n();
  return (
    <div style={{
      position: 'absolute', top: 50, left: 12, right: 12,
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      zIndex: 15, pointerEvents: 'none',
    }}>
      <button onClick={onMenu} style={{
        pointerEvents: 'auto',
        width: 36, height: 36, borderRadius: 12,
        background: 'rgba(20,46,38,0.85)', backdropFilter: 'blur(8px)',
        border: '1px solid rgba(201,169,97,0.3)',
        color: '#f5efdf', fontSize: 18, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>☰</button>
      <div style={{
        background: 'rgba(20,46,38,0.85)', backdropFilter: 'blur(8px)',
        border: '1px solid rgba(201,169,97,0.3)',
        borderRadius: 14, padding: '6px 14px',
        display: 'flex', alignItems: 'center', gap: 12,
        color: '#f5efdf', fontSize: 11, fontWeight: 600,
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.1 }}>
          <span style={{ opacity: 0.6, fontSize: 9, letterSpacing: 0.5 }}>{tr('round')}</span>
          <span>{round}</span>
        </div>
        <div style={{ width: 1, height: 22, background: 'rgba(201,169,97,0.3)' }} />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.1 }}>
          <span style={{ opacity: 0.6, fontSize: 9, letterSpacing: 0.5 }}>{tr('wallLeft')}</span>
          <span style={{ fontFamily: 'ui-monospace, monospace' }}>{wallLeft}</span>
        </div>
      </div>
      <div style={{
        pointerEvents: 'auto',
        background: 'rgba(20,46,38,0.85)', backdropFilter: 'blur(8px)',
        border: '1px solid rgba(201,169,97,0.3)',
        borderRadius: 14, padding: '4px 8px 4px 6px',
        display: 'flex', alignItems: 'center', gap: 6,
        color: '#f5efdf', fontSize: 10, fontWeight: 600,
      }}>
        <div style={{ position: 'relative' }}>
          <TT id={jingTile} size="sm" />
          <div style={{
            position: 'absolute', top: -4, right: -4,
            width: 14, height: 14, borderRadius: '50%',
            background: '#c0392b', color: '#fff',
            fontSize: 8, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '1.5px solid #f5efdf',
          }}>精</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
          <span style={{ opacity: 0.6, fontSize: 8, letterSpacing: 0.5 }}>{tr('jing')}</span>
          <span>{tr('jingDoubles')}</span>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Center wall + last discarded tile
// ─────────────────────────────────────────────────────────────
function CenterArea({ lastDiscard, lastDiscardFrom }) {
  return (
    <div style={{
      position: 'absolute', top: '50%', left: '50%',
      transform: 'translate(-50%, -50%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
      zIndex: 5,
    }}>
      {lastDiscard && (
        <div style={{
          padding: 6, borderRadius: 12,
          background: 'rgba(201,169,97,0.12)',
          border: '1.5px solid rgba(201,169,97,0.5)',
          boxShadow: '0 0 24px rgba(201,169,97,0.2)',
          animation: 'pulse 1.6s ease-in-out infinite',
        }}>
          <TT id={lastDiscard} size="md" />
        </div>
      )}
      <div style={{
        fontSize: 9, color: 'rgba(245,239,223,0.55)', fontWeight: 600,
        letterSpacing: 1, fontFamily: 'ui-monospace, monospace',
      }}>LAST · {lastDiscardFrom?.toUpperCase()}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// In-game pause menu (☰) — concede, settings, leave
// ─────────────────────────────────────────────────────────────
function PauseMenu({ open, onClose, onConcede, onSettings, onLeave }) {
  const { lang } = useI18n();
  if (!open) return null;
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 210,
      background: 'rgba(5,18,12,0.6)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-start',
      paddingTop: 92, paddingLeft: 12,
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'rgba(20,46,38,0.97)',
        border: '1px solid rgba(201,169,97,0.4)',
        borderRadius: 16, padding: 6, minWidth: 200,
        boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
      }}>
        {[
          { label: lang === 'zh' ? '继续对局' : 'Resume', onClick: onClose },
          { label: lang === 'zh' ? '设置' : 'Settings', onClick: onSettings },
          { label: lang === 'zh' ? '认输' : 'Concede round', onClick: onConcede, danger: true },
          { label: lang === 'zh' ? '离开对局' : 'Leave match', onClick: onLeave, danger: true },
        ].map((it, i) => (
          <button key={i} onClick={it.onClick} style={{
            display: 'block', width: '100%', textAlign: 'left',
            padding: '10px 12px', borderRadius: 10,
            background: 'transparent', border: 'none',
            color: it.danger ? '#e88080' : '#f5efdf',
            fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>{it.label}</button>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Main game screen
// ─────────────────────────────────────────────────────────────
function GameScreen({ tweaks, onMenu, onWin }) {
  const { theme } = useTheme();
  const [hand, setHand] = useState(['c2','c3','c4','b5','b5','d3','d4','d5','we','we']);
  const [melds, setMelds] = useState([
    { kind: 'pung', tiles: ['dr','dr','dr'], from: 'left' },
  ]);
  const [drawnTile, setDrawnTile] = useState('b6');
  const [drawAnim, setDrawAnim] = useState(true);
  const [selectedIdx, setSelectedIdx] = useState(null);
  const [actions, setActions] = useState([]);
  const [callContext, setCallContext] = useState({ tile: 'b5', from: 'Mei', kind: 'discard' });
  const [discards, setDiscards] = useState(SAMPLE_DISCARDS);
  const [wall, setWall] = useState(64);
  const [lastDiscard, setLastDiscard] = useState({ tile: 'b5', from: 'right' });
  const [activePlayer, setActivePlayer] = useState('bottom');
  const [showCalls, setShowCalls] = useState(true);
  const [callIdx, setCallIdx] = useState(0);
  const [pauseOpen, setPauseOpen] = useState(false);
  const [concedeOpen, setConcedeOpen] = useState(false);
  const [afkPlayer, setAfkPlayer] = useState(null); // 'top' | 'left' | 'right' | null

  // Overlay surfaced from Tweaks (or by future real network events)
  const overlay = tweaks.overlay || 'none'; // none | reconnecting | disconnected | playerLeft

  const CALL_DEMOS = [
    { actions: ['pung', 'win', 'pass'], ctx: { tile: 'b5', from: 'Mei', kind: 'discard' } },
    { actions: ['chow', 'pass'], ctx: { tile: 'd6', from: 'Lin', kind: 'discard' } },
    { actions: ['kong', 'pass'], ctx: { tile: 'we', from: 'Wei', kind: 'discard' } },
    { actions: ['win', 'pass'], ctx: { tile: 'b3', from: 'Wei', kind: 'rob-kong' } },
  ];
  useEffect(() => {
    if (showCalls) {
      const d = CALL_DEMOS[callIdx];
      setActions(d.actions);
      setCallContext(d.ctx);
    }
  }, [showCalls, callIdx]);

  const handleDiscard = (i) => {
    const all = [...hand, drawnTile];
    const discarded = all[i];
    const remaining = all.filter((_, idx) => idx !== i);
    setHand(remaining);
    setDrawnTile(null);
    setSelectedIdx(null);
    setDiscards(d => ({ ...d, bottom: [...d.bottom, discarded] }));
    setLastDiscard({ tile: discarded, from: 'bottom' });
    setActivePlayer('right');
    setActions([]);
    setShowCalls(false);

    // mock: simulate next player drawing & discarding, then come back
    setTimeout(() => {
      setActivePlayer('bottom');
      setDrawnTile('c6');
      setHand(remaining);
    }, 1500);
  };

  const handleAction = (a) => {
    if (a === 'win') { onWin?.(); return; }
    setActions([]);
    setShowCalls(false);
  };

  return (
    <div style={{
      position: 'absolute', inset: 0,
      background: feltGradient(theme.felt),
      overflow: 'hidden',
    }}>
      <style>{`
        @keyframes pulse {
          0%, 100% { box-shadow: 0 0 24px rgba(201,169,97,0.2); }
          50% { box-shadow: 0 0 36px rgba(201,169,97,0.55); }
        }
      `}</style>

      <GameStatusBar wallLeft={wall} round="East 1" jingTile="b3" onMenu={() => setPauseOpen(true)} />

      {/* Top player */}
      <div style={{
        position: 'absolute', top: 96, left: 0, right: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
      }}>
        <Nameplate player={PLAYERS.top} position="top" active={activePlayer === 'top'} afk={afkPlayer === 'top'} />
        <div style={{ display: 'flex', gap: 1 }}>
          {Array.from({ length: 13 }).map((_, i) => (
            <TT key={i} id="back" size="xs" rotation={180} />
          ))}
        </div>
      </div>

      {/* Left player */}
      <div style={{
        position: 'absolute', left: 6, top: 196, bottom: 230,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
      }}>
        <Nameplate player={PLAYERS.left} position="left" active={activePlayer === 'left'} afk={afkPlayer === 'left'} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {Array.from({ length: 13 }).map((_, i) => (
            <TT key={i} id="back" size="xs" rotation={90} />
          ))}
        </div>
      </div>

      {/* Right player */}
      <div style={{
        position: 'absolute', right: 6, top: 196, bottom: 230,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
      }}>
        <Nameplate player={PLAYERS.right} position="right" active={activePlayer === 'right'} afk={afkPlayer === 'right'} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {Array.from({ length: 13 }).map((_, i) => (
            <TT key={i} id="back" size="xs" rotation={270} />
          ))}
        </div>
      </div>

      {/* Center: discard pools arranged around the last-discard indicator */}
      <div style={{
        position: 'absolute', left: 60, right: 60, top: 196, bottom: 230,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between',
        padding: '4px 0',
      }}>
        <DiscardPool tiles={discards.top} position="top" />
        <CenterArea lastDiscard={lastDiscard?.tile} lastDiscardFrom={lastDiscard?.from} />
        <DiscardPool tiles={discards.bottom} position="bottom" />
      </div>

      {/* Bottom: nameplate + melds */}
      <div style={{
        position: 'absolute', left: 12, right: 12, bottom: 200, zIndex: 22,
        display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8,
      }}>
        <Nameplate player={PLAYERS.bottom} position="bottom" active={activePlayer === 'bottom'} />
        {/* concealed melds rail */}
        {melds.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {melds.map((m, i) => (
              <div key={i} style={{
                padding: '3px 4px', borderRadius: 6,
                background: 'rgba(201,169,97,0.12)',
                border: '1px solid rgba(201,169,97,0.35)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
              }}>
                <div style={{ display: 'flex', gap: 1 }}>
                  {m.tiles.map((t, j) => <TT key={j} id={t} size="tn" />)}
                </div>
                <div style={{ fontSize: 7, color: '#c9a961', fontWeight: 700, letterSpacing: 0.5 }}>
                  {m.kind.toUpperCase()} · {m.from}
                </div>
              </div>
            ))}
          </div>
        )}
        {/* demo: cycle call */}
        <button onClick={() => { setCallIdx((callIdx + 1) % CALL_DEMOS.length); setShowCalls(true); }} style={{
          padding: '6px 10px', borderRadius: 8,
          background: 'rgba(201,169,97,0.18)',
          border: '1px solid rgba(201,169,97,0.4)',
          color: '#c9a961', fontSize: 10, fontWeight: 700, cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}>↻ Demo</button>
      </div>

      <PlayerHand
        tiles={hand}
        drawnTile={drawnTile}
        onDiscard={handleDiscard}
        selectedIdx={selectedIdx}
        setSelectedIdx={setSelectedIdx}
      />

      {/* Action UI is locked to "Side rail" */}
      <SideRail actions={actions} onAction={handleAction} ctx={callContext} />

      <PauseMenu
        open={pauseOpen}
        onClose={() => setPauseOpen(false)}
        onSettings={() => { setPauseOpen(false); onMenu?.(); }}
        onLeave={() => { setPauseOpen(false); onMenu?.(); }}
        onConcede={() => { setPauseOpen(false); setConcedeOpen(true); }}
      />
      <ConcedeSheet
        open={concedeOpen}
        onCancel={() => setConcedeOpen(false)}
        onConfirm={() => { setConcedeOpen(false); onMenu?.(); }}
      />

      {/* Connection / room-state overlays (driven by tweaks for demo) */}
      {overlay === 'reconnecting' && <ReconnectingOverlay status="reconnecting" />}
      {overlay === 'disconnected' && <ReconnectingOverlay status="lost" onLeave={onMenu} />}
      {overlay === 'playerLeft' && (
        <PlayerLeftOverlay
          playerName="Wei"
          onWait={() => {}}
          onEndMatch={onMenu}
        />
      )}
      {/* AFK demo — when overlay tweak is 'afk', mark right player AFK */}
      {tweaks.overlay === 'afk' && <AfkInjector setter={setAfkPlayer} />}
    </div>
  );
}

// helper — sets afkPlayer once and clears on unmount
function AfkInjector({ setter }) {
  useEffect(() => {
    setter('right');
    return () => setter(null);
  }, [setter]);
  return null;
}

Object.assign(window, { GameScreen });
