// Cinematic Jing tile (Spirit/Wildcard) reveal — pre-game animation.
// In Nanchang Mahjong, before play, a Jing tile is randomly chosen.
// Tiles matching the Jing become wildcards that double the score.

const { useState: useStateW, useEffect: useEffectW } = React;

// Themed tile shortcut for the wildcard reveal
function TT(props) {
  const { theme } = useTheme();
  return (
    <TT
      faceColor={theme.face} edgeColor={theme.edge}
      inkColor={theme.ink} redInk={theme.redInk} greenInk={theme.greenInk}
      backColor={theme.back} backAccent={theme.backAccent}
      {...props}
    />
  );
}

function WildcardReveal({ onComplete }) {
  const { t: tr, lang } = useI18n();
  const { theme } = useTheme();
  const [phase, setPhase] = useState(0);
  // 0: dice intro, 1: wall flips, 2: tile revealed, 3: settle, 4: continue button

  const jingTile = 'b3'; // mock pick
  const bonusTile = 'b4'; // the next number → bonus matches in Nanchang

  useEffect(() => {
    const t = [
      setTimeout(() => setPhase(1), 1200),
      setTimeout(() => setPhase(2), 2600),
      setTimeout(() => setPhase(3), 4400),
      setTimeout(() => setPhase(4), 5400),
    ];
    return () => t.forEach(clearTimeout);
  }, []);

  return (
    <div style={{
      position: 'absolute', inset: 0,
      background: `radial-gradient(ellipse at center, oklch(from ${theme.felt} calc(l * 1.25) c h) 0%, ${theme.felt} 50%, oklch(from ${theme.felt} calc(l * 0.35) c h) 100%)`,
      overflow: 'hidden', zIndex: 100,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: 24,
    }}>
      <style>{`
        @keyframes diceRoll {
          0% { transform: translateY(-200px) rotate(-720deg) scale(0.5); opacity: 0; }
          50% { transform: translateY(20px) rotate(180deg) scale(1.2); opacity: 1; }
          100% { transform: translateY(0) rotate(0deg) scale(1); opacity: 1; }
        }
        @keyframes tileFlip {
          0% { transform: rotateY(180deg) scale(0.6); opacity: 0; }
          60% { transform: rotateY(0deg) scale(1.4); opacity: 1; }
          100% { transform: rotateY(0deg) scale(1); opacity: 1; }
        }
        @keyframes glow {
          0%, 100% { box-shadow: 0 0 40px rgba(201,169,97,0.4), 0 0 80px rgba(201,169,97,0.2); }
          50% { box-shadow: 0 0 80px rgba(201,169,97,0.7), 0 0 140px rgba(201,169,97,0.4); }
        }
        @keyframes rays {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes wallShake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-3px); }
          75% { transform: translateX(3px); }
        }
      `}</style>

      {/* Background rays */}
      {phase >= 2 && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'none',
        }}>
          <div style={{
            width: 600, height: 600,
            background: `conic-gradient(from 0deg, rgba(201,169,97,0.08) 0deg, transparent 30deg, rgba(201,169,97,0.08) 60deg, transparent 90deg, rgba(201,169,97,0.08) 120deg, transparent 150deg, rgba(201,169,97,0.08) 180deg, transparent 210deg, rgba(201,169,97,0.08) 240deg, transparent 270deg, rgba(201,169,97,0.08) 300deg, transparent 330deg, rgba(201,169,97,0.08) 360deg)`,
            animation: 'rays 12s linear infinite',
            borderRadius: '50%',
          }} />
        </div>
      )}

      {/* Title */}
      <div style={{
        textAlign: 'center', marginBottom: 32,
        opacity: phase >= 1 ? 1 : 0,
        transform: phase >= 1 ? 'translateY(0)' : 'translateY(-20px)',
        transition: 'all 0.6s ease',
      }}>
        <div style={{
          fontFamily: 'serif', fontSize: 48, color: '#c9a961',
          fontWeight: 700, letterSpacing: 8, lineHeight: 1,
          textShadow: '0 0 30px rgba(201,169,97,0.5)',
          marginBottom: 4,
        }}>精牌</div>
        <div style={{
          fontSize: 11, color: '#f5efdf', opacity: 0.7,
          fontFamily: 'ui-monospace, monospace', letterSpacing: 4,
          fontWeight: 600,
        }}>{tr('spirit')}</div>
      </div>

      {/* Stage */}
      <div style={{
        position: 'relative',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: 200, perspective: 1000,
      }}>
        {/* dice phase */}
        {phase === 0 && (
          <div style={{
            display: 'flex', gap: 12, animation: 'diceRoll 1s ease-out',
          }}>
            <Die value={4} />
            <Die value={3} />
          </div>
        )}

        {/* wall shaking phase */}
        {phase === 1 && (
          <div style={{
            display: 'flex', gap: 4,
            animation: 'wallShake 0.2s ease-in-out infinite',
          }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <TT key={i} id="back" size="lg" />
            ))}
          </div>
        )}

        {/* revealed jing tile */}
        {phase >= 2 && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
          }}>
            <div style={{
              padding: 12, borderRadius: 16,
              background: 'linear-gradient(180deg, rgba(201,169,97,0.18), rgba(201,169,97,0.04))',
              border: '2px solid #c9a961',
              animation: 'glow 2s ease-in-out infinite, tileFlip 1.2s ease-out',
            }}>
              <TT id={jingTile} size="xl" />
            </div>
            {/* bonus tile reveal */}
            {phase >= 3 && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 12,
                animation: 'fadeUp 0.6s ease-out',
              }}>
                <div style={{
                  fontSize: 11, color: '#f5efdf', opacity: 0.7,
                  fontFamily: 'ui-monospace, monospace', letterSpacing: 1,
                }}>{tr('bonus')}</div>
                <div style={{
                  padding: 6, borderRadius: 10,
                  background: 'rgba(201,169,97,0.1)',
                  border: '1.5px solid rgba(201,169,97,0.5)',
                }}>
                  <TT id={bonusTile} size="md" />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Description */}
      {phase >= 3 && (
        <div style={{
          textAlign: 'center', maxWidth: 320, marginTop: 32,
          animation: 'fadeUp 0.8s ease-out 0.2s both',
        }}>
          <div style={{
            fontSize: 15, color: '#f5efdf', fontWeight: 600, lineHeight: 1.4,
            marginBottom: 8,
          }}>
            {tr('tonightJing')} <span style={{ color: '#c9a961' }}>{lang === 'zh' ? '三条' : '3 BAM'}</span>
          </div>
          <div style={{
            fontSize: 12, color: 'rgba(245,239,223,0.7)', lineHeight: 1.5,
          }}>
            {tr('jingDesc', lang === 'zh' ? '三条' : '3 BAM')}
          </div>
        </div>
      )}

      {/* Continue button */}
      {phase >= 4 && (
        <button
          onClick={onComplete}
          style={{
            position: 'absolute', bottom: 60, left: '50%', transform: 'translateX(-50%)',
            padding: '14px 36px', borderRadius: 999,
            background: 'linear-gradient(180deg, #c9a961 0%, #a88a45 100%)',
            color: '#1f2937', fontWeight: 700, fontSize: 14,
            border: '1px solid rgba(255,255,255,0.3)',
            boxShadow: '0 8px 24px rgba(201,169,97,0.4), inset 0 1px 0 rgba(255,255,255,0.4)',
            cursor: 'pointer',
            animation: 'fadeUp 0.5s ease-out',
            letterSpacing: 1,
          }}>
          {tr('beginRound')}
        </button>
      )}

      {/* Skip */}
      <button
        onClick={onComplete}
        style={{
          position: 'absolute', top: 60, right: 16,
          padding: '6px 12px', borderRadius: 8,
          background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(8px)',
          border: '1px solid rgba(255,255,255,0.12)',
          color: '#f5efdf', fontSize: 11, fontWeight: 600,
          cursor: 'pointer',
        }}>Skip</button>
    </div>
  );
}

function Die({ value }) {
  const positions = {
    1: [[1,1]],
    2: [[0,0],[2,2]],
    3: [[0,0],[1,1],[2,2]],
    4: [[0,0],[2,0],[0,2],[2,2]],
    5: [[0,0],[2,0],[1,1],[0,2],[2,2]],
    6: [[0,0],[2,0],[0,1],[2,1],[0,2],[2,2]],
  };
  return (
    <div style={{
      width: 64, height: 64, borderRadius: 12,
      background: 'linear-gradient(165deg, #fffbeb 0%, #f5efdf 60%, #d8cfb3 100%)',
      boxShadow: 'inset 0 -3px 0 rgba(0,0,0,0.1), 0 6px 16px rgba(0,0,0,0.4)',
      position: 'relative', padding: 10, boxSizing: 'border-box',
    }}>
      <div style={{
        width: '100%', height: '100%', position: 'relative',
      }}>
        {positions[value].map(([x, y], i) => (
          <div key={i} style={{
            position: 'absolute',
            left: `${x * 50}%`, top: `${y * 50}%`,
            width: 10, height: 10, marginLeft: -5, marginTop: -5,
            borderRadius: '50%', background: '#c0392b',
            boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.3)',
          }} />
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { WildcardReveal });
