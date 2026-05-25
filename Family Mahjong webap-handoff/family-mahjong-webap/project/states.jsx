// Empty / loading / error / overlay states.
// Each component is screen-shaped (absolute inset:0) so they slot inside the AndroidDevice frame.

const { useState, useEffect } = React;

// ─────────────────────────────────────────────────────────────
// Skeleton primitives
// ─────────────────────────────────────────────────────────────
function Skel({ w = '100%', h = 14, r = 8, style = {} }) {
  return (
    <div style={{
      width: w, height: h, borderRadius: r,
      background: 'linear-gradient(90deg, rgba(245,239,223,0.06) 0%, rgba(245,239,223,0.14) 50%, rgba(245,239,223,0.06) 100%)',
      backgroundSize: '200% 100%',
      animation: 'skelShimmer 1.4s ease-in-out infinite',
      ...style,
    }} />
  );
}

const SKEL_KEYFRAMES = `
@keyframes skelShimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes pulseDot {
  0%, 100% { opacity: 0.3; transform: scale(0.8); }
  50% { opacity: 1; transform: scale(1.1); }
}
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes overlayIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
`;

// ─────────────────────────────────────────────────────────────
// Loading skeletons for each screen
// ─────────────────────────────────────────────────────────────
function HomeSkeleton() {
  return (
    <div style={{
      position: 'absolute', inset: 0,
      background: 'linear-gradient(180deg, #0d3b2e 0%, #061a14 100%)',
      padding: '50px 20px 20px', color: '#f5efdf',
    }}>
      <style>{SKEL_KEYFRAMES}</style>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
        <div>
          <Skel w={60} h={28} r={6} />
          <div style={{ height: 8 }} />
          <Skel w={120} h={9} r={4} />
        </div>
        <Skel w={40} h={40} r={12} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 28 }}>
        {[0,1,2,3,4].map(i => <Skel key={i} w={46} h={62} r={6} />)}
      </div>
      <Skel w={100} h={10} r={4} />
      <div style={{ height: 8 }} />
      <Skel w={170} h={20} r={6} />
      <div style={{ height: 6 }} />
      <Skel w={210} h={9} r={4} />
      <div style={{ height: 24 }} />
      <Skel w="100%" h={64} r={18} />
      <div style={{ height: 12 }} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {[0,1,2,3].map(i => <Skel key={i} w="100%" h={90} r={14} />)}
      </div>
    </div>
  );
}

function HistorySkeleton() {
  return (
    <div style={{
      position: 'absolute', inset: 0,
      background: 'linear-gradient(180deg, #0d3b2e 0%, #061a14 100%)',
      padding: '50px 16px 16px', color: '#f5efdf',
    }}>
      <style>{SKEL_KEYFRAMES}</style>
      <Skel w={180} h={20} r={6} style={{ marginBottom: 20, marginTop: 4 }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
        {[0,1,2].map(i => <Skel key={i} h={72} r={14} />)}
      </div>
      <Skel h={92} r={16} style={{ marginBottom: 16 }} />
      <Skel h={64} r={16} style={{ marginBottom: 16 }} />
      <Skel w={140} h={10} r={4} style={{ marginBottom: 10 }} />
      {[0,1,2,3,4].map(i => (
        <Skel key={i} h={56} r={14} style={{ marginBottom: 8 }} />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Empty state — no history yet
// ─────────────────────────────────────────────────────────────
function EmptyHistory({ onPlayNow, onLearn }) {
  const { t, lang } = useI18n();
  return (
    <div style={{
      padding: '40px 24px', textAlign: 'center', color: '#f5efdf',
    }}>
      {/* placeholder graphic: 3 tile silhouettes stacked */}
      <div style={{
        margin: '20px auto 28px', width: 130, height: 100, position: 'relative',
      }}>
        {[0,1,2].map(i => (
          <div key={i} style={{
            position: 'absolute',
            left: 20 + i * 24, top: 4 + i * 4,
            width: 50, height: 70, borderRadius: 8,
            background: 'linear-gradient(165deg, rgba(245,239,223,0.06) 0%, rgba(245,239,223,0.03) 100%)',
            border: '1px dashed rgba(201,169,97,0.35)',
            opacity: 0.7 - i * 0.15,
          }} />
        ))}
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>
        {lang === 'zh' ? '还没有对局记录' : 'No games yet'}
      </div>
      <div style={{ fontSize: 13, opacity: 0.65, lineHeight: 1.5, maxWidth: 280, margin: '0 auto 22px' }}>
        {lang === 'zh'
          ? '完成第一局后,这里会显示你的胜率、番数和最近对局。'
          : 'Your win rate, fan and recent games will appear here once you finish your first match.'}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 240, margin: '0 auto' }}>
        <button onClick={onPlayNow} style={{
          padding: '12px 20px', borderRadius: 12,
          background: 'linear-gradient(180deg, #c9a961 0%, #a88a45 100%)',
          color: '#1f2937', border: 'none', fontWeight: 700, fontSize: 14,
          cursor: 'pointer',
          boxShadow: '0 6px 18px rgba(201,169,97,0.3)',
        }}>{lang === 'zh' ? '立即开始 →' : 'Play your first game →'}</button>
        <button onClick={onLearn} style={{
          padding: '12px 20px', borderRadius: 12,
          background: 'transparent', border: '1px solid rgba(245,239,223,0.18)',
          color: '#f5efdf', fontWeight: 600, fontSize: 13,
          cursor: 'pointer',
        }}>{lang === 'zh' ? '先学习规则' : 'Learn the rules first'}</button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Generic full-screen error — eg. server unreachable
// ─────────────────────────────────────────────────────────────
function ErrorState({ title, body, primaryLabel, onPrimary, secondaryLabel, onSecondary, icon = '!' }) {
  return (
    <div style={{
      position: 'absolute', inset: 0,
      background: 'linear-gradient(180deg, #0d3b2e 0%, #061a14 100%)',
      color: '#f5efdf',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '24px 28px', textAlign: 'center',
    }}>
      <div style={{
        width: 64, height: 64, borderRadius: 20,
        background: 'rgba(192,57,43,0.15)',
        border: '1px solid rgba(192,57,43,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#e88080', fontFamily: 'serif', fontSize: 36, fontWeight: 700,
        marginBottom: 20,
      }}>{icon}</div>
      <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 13, opacity: 0.7, lineHeight: 1.5, maxWidth: 300, marginBottom: 24 }}>{body}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', maxWidth: 260 }}>
        {primaryLabel && (
          <button onClick={onPrimary} style={{
            padding: 12, borderRadius: 12,
            background: 'linear-gradient(180deg, #c9a961 0%, #a88a45 100%)',
            color: '#1f2937', border: 'none', fontWeight: 700, fontSize: 14,
            cursor: 'pointer',
          }}>{primaryLabel}</button>
        )}
        {secondaryLabel && (
          <button onClick={onSecondary} style={{
            padding: 12, borderRadius: 12,
            background: 'transparent', border: '1px solid rgba(245,239,223,0.18)',
            color: '#f5efdf', fontWeight: 600, fontSize: 13, cursor: 'pointer',
          }}>{secondaryLabel}</button>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Reconnecting / connection-lost overlay — sits on top of the game
// ─────────────────────────────────────────────────────────────
function ReconnectingOverlay({ status = 'reconnecting', onLeave }) {
  const { lang } = useI18n();
  const isLost = status === 'lost';
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 200,
      background: 'rgba(5,18,12,0.78)',
      backdropFilter: 'blur(8px)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: 24, color: '#f5efdf',
      animation: 'fadeIn 0.25s ease forwards',
    }}>
      <style>{SKEL_KEYFRAMES}</style>
      <div style={{
        padding: '24px 22px', borderRadius: 22, maxWidth: 300, width: '100%',
        background: 'rgba(20,46,38,0.95)',
        border: `1px solid ${isLost ? 'rgba(192,57,43,0.55)' : 'rgba(201,169,97,0.45)'}`,
        boxShadow: '0 12px 40px rgba(0,0,0,0.55)',
        textAlign: 'center', animation: 'overlayIn 0.3s ease forwards',
      }}>
        {!isLost ? (
          <div style={{
            width: 44, height: 44, margin: '4px auto 16px',
            borderRadius: '50%',
            border: '3px solid rgba(201,169,97,0.2)',
            borderTopColor: '#c9a961',
            animation: 'spin 0.9s linear infinite',
          }} />
        ) : (
          <div style={{
            width: 48, height: 48, margin: '0 auto 16px',
            borderRadius: 16, background: 'rgba(192,57,43,0.18)',
            border: '1px solid rgba(192,57,43,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#e88080', fontSize: 24, fontFamily: 'serif', fontWeight: 700,
          }}>⚡</div>
        )}
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>
          {isLost
            ? (lang === 'zh' ? '已断开连接' : 'Disconnected')
            : (lang === 'zh' ? '重新连接中…' : 'Reconnecting…')}
        </div>
        <div style={{ fontSize: 12, opacity: 0.7, lineHeight: 1.4, marginBottom: isLost ? 18 : 0 }}>
          {isLost
            ? (lang === 'zh'
                ? '与房间的连接已中断。其他玩家正在等待你回来 — 你的位置已保留 30 秒。'
                : 'Lost connection to the room. Other players are waiting — your seat is held for 30 seconds.')
            : (lang === 'zh'
                ? '正在尝试恢复对局…'
                : 'Trying to restore the match…')}
        </div>
        {isLost && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button style={{
              padding: 11, borderRadius: 12,
              background: 'linear-gradient(180deg, #c9a961 0%, #a88a45 100%)',
              color: '#1f2937', border: 'none', fontWeight: 700, fontSize: 13,
              cursor: 'pointer',
            }}>{lang === 'zh' ? '重试' : 'Retry now'}</button>
            <button onClick={onLeave} style={{
              padding: 11, borderRadius: 12,
              background: 'transparent', border: '1px solid rgba(245,239,223,0.18)',
              color: 'rgba(245,239,223,0.75)', fontWeight: 600, fontSize: 12,
              cursor: 'pointer',
            }}>{lang === 'zh' ? '离开对局' : 'Leave match'}</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// "Other player left the room" — mid-game overlay
// ─────────────────────────────────────────────────────────────
function PlayerLeftOverlay({ playerName = 'Wei', onWait, onEndMatch }) {
  const { lang } = useI18n();
  const [t, setT] = useState(45);
  useEffect(() => {
    const id = setInterval(() => setT(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 200,
      background: 'rgba(5,18,12,0.78)', backdropFilter: 'blur(8px)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: 24, color: '#f5efdf', animation: 'fadeIn 0.25s ease forwards',
    }}>
      <style>{SKEL_KEYFRAMES}</style>
      <div style={{
        padding: '24px 22px', borderRadius: 22, maxWidth: 300, width: '100%',
        background: 'rgba(20,46,38,0.95)',
        border: '1px solid rgba(201,169,97,0.35)',
        boxShadow: '0 12px 40px rgba(0,0,0,0.55)',
        textAlign: 'center', animation: 'overlayIn 0.3s ease forwards',
      }}>
        <div style={{
          width: 56, height: 56, margin: '0 auto 14px', borderRadius: 18,
          background: 'rgba(201,169,97,0.15)', border: '1px solid rgba(201,169,97,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#c9a961', fontFamily: 'serif', fontSize: 22, fontWeight: 700,
        }}>西</div>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>
          {lang === 'zh' ? `${playerName} 已离开` : `${playerName} left the table`}
        </div>
        <div style={{ fontSize: 12, opacity: 0.7, lineHeight: 1.4, marginBottom: 14 }}>
          {lang === 'zh'
            ? '正在等待对方重新连接。若 45 秒内未回归,本局将以流局结束。'
            : 'Waiting for them to reconnect. If they don\'t return in 45 seconds, the round ends as a washout.'}
        </div>
        <div style={{
          padding: '8px 12px', borderRadius: 12,
          background: 'rgba(245,239,223,0.05)',
          border: '1px solid rgba(245,239,223,0.1)',
          fontFamily: 'ui-monospace, monospace', fontSize: 13, fontWeight: 700,
          color: '#c9a961', marginBottom: 14, letterSpacing: 1,
        }}>{String(Math.floor(t / 60)).padStart(2, '0')}:{String(t % 60).padStart(2, '0')}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button onClick={onWait} style={{
            padding: 11, borderRadius: 12,
            background: 'linear-gradient(180deg, #c9a961 0%, #a88a45 100%)',
            color: '#1f2937', border: 'none', fontWeight: 700, fontSize: 13,
            cursor: 'pointer',
          }}>{lang === 'zh' ? '继续等待' : 'Keep waiting'}</button>
          <button onClick={onEndMatch} style={{
            padding: 11, borderRadius: 12,
            background: 'rgba(192,57,43,0.12)',
            border: '1px solid rgba(192,57,43,0.4)',
            color: '#e88080', fontWeight: 600, fontSize: 12,
            cursor: 'pointer',
          }}>{lang === 'zh' ? '提前结束' : 'End match now'}</button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Concede / leave mid-game confirm
// ─────────────────────────────────────────────────────────────
function ConcedeSheet({ open, onCancel, onConfirm }) {
  const { lang } = useI18n();
  if (!open) return null;
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 220,
      background: 'rgba(5,18,12,0.6)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'flex-end',
      animation: 'fadeIn 0.2s ease forwards',
    }} onClick={onCancel}>
      <style>{SKEL_KEYFRAMES}</style>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'rgba(20,46,38,0.98)',
        borderTop: '1px solid rgba(201,169,97,0.35)',
        borderRadius: '24px 24px 0 0',
        padding: '18px 18px 24px',
        width: '100%', color: '#f5efdf',
        animation: 'overlayIn 0.3s ease forwards',
      }}>
        <div style={{
          width: 36, height: 4, borderRadius: 2,
          background: 'rgba(245,239,223,0.2)',
          margin: '0 auto 14px',
        }} />
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>
          {lang === 'zh' ? '认输并离开对局?' : 'Concede and leave?'}
        </div>
        <div style={{ fontSize: 12, opacity: 0.7, lineHeight: 1.5, marginBottom: 16 }}>
          {lang === 'zh'
            ? '本局算作失败,扣除底分 −1,000 并影响连胜。其他玩家可继续完成本局。'
            : 'This round counts as a loss (−1,000 base) and breaks your streak. The other players will continue.'}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onCancel} style={{
            flex: 1, padding: 13, borderRadius: 12,
            background: 'rgba(245,239,223,0.08)',
            border: '1px solid rgba(245,239,223,0.15)',
            color: '#f5efdf', fontWeight: 600, fontSize: 13, cursor: 'pointer',
          }}>{lang === 'zh' ? '继续对局' : 'Keep playing'}</button>
          <button onClick={onConfirm} style={{
            flex: 1, padding: 13, borderRadius: 12,
            background: 'rgba(192,57,43,0.18)',
            border: '1px solid rgba(192,57,43,0.45)',
            color: '#e88080', fontWeight: 700, fontSize: 13, cursor: 'pointer',
          }}>{lang === 'zh' ? '认输离开' : 'Concede & leave'}</button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Rematch prompt — shows on End screen
// ─────────────────────────────────────────────────────────────
function RematchStrip({ accepted = ['You'], waitingOn = ['Mei', 'Wei', 'Lin'], onAccept, onDecline }) {
  const { lang } = useI18n();
  const allCount = accepted.length + waitingOn.length;
  return (
    <div style={{
      padding: 12, borderRadius: 14,
      background: 'rgba(201,169,97,0.08)',
      border: '1px solid rgba(201,169,97,0.3)',
      marginBottom: 10,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: 1, opacity: 0.7, fontWeight: 600 }}>
            {lang === 'zh' ? '再来一局' : 'REMATCH'}
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>
            {accepted.length} {lang === 'zh' ? '/' : 'of'} {allCount} {lang === 'zh' ? '已接受' : 'ready'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {[...accepted, ...waitingOn].map((p, i) => (
            <div key={p} style={{
              width: 26, height: 26, borderRadius: 8,
              background: i < accepted.length ? 'rgba(127,194,153,0.25)' : 'rgba(245,239,223,0.06)',
              border: i < accepted.length ? '1px solid #7fc299' : '1px dashed rgba(245,239,223,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10, fontWeight: 700,
              color: i < accepted.length ? '#7fc299' : 'rgba(245,239,223,0.5)',
            }}>{p[0]}</div>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onDecline} style={{
          flex: 1, padding: 10, borderRadius: 10,
          background: 'rgba(245,239,223,0.06)',
          border: '1px solid rgba(245,239,223,0.12)',
          color: '#f5efdf', fontWeight: 600, fontSize: 12, cursor: 'pointer',
        }}>{lang === 'zh' ? '不再来' : 'Decline'}</button>
        <button onClick={onAccept} style={{
          flex: 2, padding: 10, borderRadius: 10,
          background: '#c9a961',
          color: '#1f2937', border: 'none', fontWeight: 700, fontSize: 12, cursor: 'pointer',
        }}>{lang === 'zh' ? '再来一局' : 'Accept rematch'}</button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// AFK indicator — applied as an overlay on top of a nameplate
// ─────────────────────────────────────────────────────────────
function AfkBadge({ small = false }) {
  const { lang } = useI18n();
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: small ? '1px 5px' : '2px 7px', borderRadius: 999,
      background: 'rgba(192,57,43,0.18)',
      border: '1px solid rgba(192,57,43,0.5)',
      color: '#e88080', fontSize: small ? 8 : 9, fontWeight: 700,
      letterSpacing: 0.5,
      animation: 'fadeIn 0.3s ease forwards',
    }}>
      <span style={{
        width: 5, height: 5, borderRadius: '50%',
        background: '#e88080',
        animation: 'pulseDot 1.2s ease-in-out infinite',
      }} />
      AFK
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Inline form-field error label
// ─────────────────────────────────────────────────────────────
function FieldError({ children }) {
  if (!children) return null;
  return (
    <div style={{
      fontSize: 11, color: '#e88080', fontWeight: 600,
      marginTop: 2, display: 'flex', alignItems: 'center', gap: 4,
      animation: 'fadeIn 0.2s ease forwards',
    }}>
      <span style={{
        width: 12, height: 12, borderRadius: '50%',
        background: 'rgba(192,57,43,0.25)',
        border: '1px solid rgba(192,57,43,0.6)',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 8, color: '#e88080', fontWeight: 800,
      }}>!</span>
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Toast — top notice (e.g. "Hand copied", "Friend request sent")
// ─────────────────────────────────────────────────────────────
function Toast({ message, kind = 'info', visible }) {
  if (!visible || !message) return null;
  const colors = {
    info:    { bg: 'rgba(20,46,38,0.96)', border: 'rgba(201,169,97,0.5)', fg: '#c9a961' },
    success: { bg: 'rgba(20,46,38,0.96)', border: 'rgba(127,194,153,0.55)', fg: '#7fc299' },
    error:   { bg: 'rgba(46,20,20,0.96)', border: 'rgba(192,57,43,0.55)', fg: '#e88080' },
  }[kind];
  return (
    <div style={{
      position: 'absolute', top: 100, left: '50%', transform: 'translateX(-50%)',
      zIndex: 250,
      padding: '10px 14px', borderRadius: 12,
      background: colors.bg, border: `1px solid ${colors.border}`,
      color: colors.fg, fontSize: 12, fontWeight: 600,
      backdropFilter: 'blur(8px)',
      boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
      animation: 'overlayIn 0.25s ease forwards',
      maxWidth: 280, textAlign: 'center',
    }}>
      {message}
    </div>
  );
}

Object.assign(window, {
  Skel, SKEL_KEYFRAMES,
  HomeSkeleton, HistorySkeleton,
  EmptyHistory,
  ErrorState,
  ReconnectingOverlay, PlayerLeftOverlay,
  ConcedeSheet, RematchStrip, AfkBadge,
  FieldError, Toast,
});
