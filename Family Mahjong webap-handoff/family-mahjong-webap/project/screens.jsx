// All non-game screens: Home/Lobby, Auth, Room, History, Customization, End-game.

const { useState: useStateS, useEffect: useEffectS } = React;

// ─────────────────────────────────────────────────────────────
// Shared chrome
// ─────────────────────────────────────────────────────────────
function ScreenShell({ children, title, onBack, scrollable = true, dark = true, accent }) {
  return (
    <div style={{
      position: 'absolute', inset: 0,
      background: dark
        ? 'linear-gradient(180deg, #0d3b2e 0%, #051a13 100%)'
        : '#f5f1e8',
      color: dark ? '#f5efdf' : '#1f2937',
      display: 'flex', flexDirection: 'column',
      fontFamily: '-apple-system, system-ui, sans-serif',
    }}>
      {title !== undefined && (
        <div style={{
          padding: '50px 16px 12px', display: 'flex', alignItems: 'center', gap: 8,
          background: dark ? 'rgba(8,30,23,0.6)' : 'rgba(255,255,255,0.6)',
          backdropFilter: 'blur(12px)',
          borderBottom: dark ? '1px solid rgba(201,169,97,0.15)' : '1px solid rgba(0,0,0,0.06)',
          position: 'sticky', top: 0, zIndex: 10,
        }}>
          {onBack && (
            <button onClick={onBack} style={{
              width: 32, height: 32, borderRadius: 10,
              background: dark ? 'rgba(201,169,97,0.12)' : 'rgba(0,0,0,0.05)',
              border: 'none', color: dark ? '#c9a961' : '#1f2937',
              fontSize: 22, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>←</button>
          )}
          <div style={{
            fontSize: 17, fontWeight: 700, letterSpacing: 0.2,
            color: accent || (dark ? '#f5efdf' : '#1f2937'),
            flex: 1,
          }}>{title}</div>
          <LangToggle />
        </div>
      )}
      <div style={{
        flex: 1, overflowY: scrollable ? 'auto' : 'hidden',
        paddingBottom: 40,
      }}>{children}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Home / lobby
// ─────────────────────────────────────────────────────────────
function HomeScreen({ user, onPlay, onJoinCode, onHistory, onCustomize, onAccount, onLearn, showLearnNudge, onDismissNudge, state = 'normal' }) {
  const { t, lang } = useI18n();
  if (state === 'loading') return <HomeSkeleton />;
  if (state === 'error') {
    return (
      <ErrorState
        title={lang === 'zh' ? '无法加载首页' : "Couldn't load Home"}
        body={lang === 'zh'
          ? '看起来你已离线。检查网络后再试。'
          : "You seem to be offline. Reconnect and try again."}
        primaryLabel={lang === 'zh' ? '重试' : 'Try again'}
        onPrimary={() => {}}
      />
    );
  }
  return (
    <div style={{
      position: 'absolute', inset: 0,
      background: 'linear-gradient(180deg, #0d3b2e 0%, #052017 60%, #061a14 100%)',
      color: '#f5efdf', overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '50px 20px 0', display: 'flex',
        justifyContent: 'space-between', alignItems: 'center', gap: 8,
      }}>
        <div>
          <div style={{
            fontFamily: 'serif', fontSize: 32, fontWeight: 700,
            color: '#c9a961', lineHeight: 1, letterSpacing: 1,
          }}>南昌</div>
          <div style={{
            fontSize: 11, fontWeight: 600, letterSpacing: 3,
            color: 'rgba(245,239,223,0.65)', marginTop: 2,
            fontFamily: 'ui-monospace, monospace',
          }}>{t('app').toUpperCase()}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <LangToggle />
          <button onClick={onAccount} style={{
            width: 40, height: 40, borderRadius: 12,
            background: 'rgba(201,169,97,0.15)',
            border: '1px solid rgba(201,169,97,0.4)',
            color: '#c9a961', fontSize: 16, fontWeight: 700,
            cursor: 'pointer',
          }}>{user.initial}</button>
        </div>
      </div>

      {/* Hero tiles */}
      <div style={{
        margin: '24px 0', display: 'flex', justifyContent: 'center',
        gap: 6, perspective: 600,
      }}>
        {['c5', 'b3', 'd5', 'we', 'dr'].map((tt, i) => (
          <div key={i} style={{
            transform: `rotate(${(i - 2) * 6}deg) translateY(${Math.abs(i - 2) * 4}px)`,
          }}>
            <MahjongTile id={tt} size="lg" />
          </div>
        ))}
      </div>

      {/* Greet */}
      <div style={{ padding: '0 20px', marginBottom: 16 }}>
        <div style={{ fontSize: 13, opacity: 0.7 }}>{t('welcomeBack')}</div>
        <div style={{ fontSize: 22, fontWeight: 700 }}>{user.name}</div>
        <div style={{ fontSize: 12, opacity: 0.55, marginTop: 2 }}>
          {user.streak}-day streak · {user.rank} · {user.rating} pts
        </div>
      </div>

      {/* Learn-the-rules nudge for first-time users */}
      {showLearnNudge && (
        <LearnNudge onOpen={onLearn} onDismiss={onDismissNudge} />
      )}

      {/* Primary actions */}
      <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <button onClick={onJoinCode} style={{
          padding: '18px 20px', borderRadius: 18,
          background: 'linear-gradient(180deg, #c9a961 0%, #a88a45 100%)',
          color: '#1f2937', border: '1px solid rgba(255,255,255,0.3)',
          fontWeight: 700, fontSize: 17, cursor: 'pointer',
          boxShadow: '0 8px 24px rgba(201,169,97,0.35), inset 0 1px 0 rgba(255,255,255,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
            <span style={{ fontSize: 17 }}>{t('playFriends')}</span>
            <span style={{ fontSize: 11, opacity: 0.7, fontWeight: 500 }}>{t('playFriendsSub')}</span>
          </div>
          <span style={{ fontSize: 22 }}>→</span>
        </button>

        {/* Tiles */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 6 }}>
          <MenuCard icon="📖" label={t('learn')} sub={t('learnSub')} onClick={onLearn} highlight />
          <MenuCard icon="📊" label={t('history')} sub={`42 ${t('games')}`} onClick={onHistory} />
          <MenuCard icon="🎨" label={t('customize')} sub={`3 ${t('themes').toLowerCase()}`} onClick={onCustomize} />
          <MenuCard icon="👤" label={t('profile')} sub="@dragonhand" onClick={onAccount} />
        </div>
      </div>

      {/* Bottom nav */}
      <div style={{
        position: 'absolute', bottom: 12, left: 16, right: 16,
        padding: 6, borderRadius: 18,
        background: 'rgba(8,30,23,0.85)', backdropFilter: 'blur(12px)',
        border: '1px solid rgba(201,169,97,0.18)',
        display: 'flex', gap: 4,
      }}>
        {[
          { k: 'home', label: t('play'), active: true },
          { k: 'learn', label: t('learn'), onClick: onLearn },
          { k: 'history', label: t('history'), onClick: onHistory },
          { k: 'me', label: t('profile'), onClick: onAccount },
        ].map(tt => (
          <button key={tt.k} onClick={tt.onClick} style={{
            flex: 1, padding: '10px 4px', borderRadius: 14,
            background: tt.active ? 'rgba(201,169,97,0.2)' : 'transparent',
            border: 'none', color: tt.active ? '#c9a961' : 'rgba(245,239,223,0.6)',
            fontSize: 11, fontWeight: 600, cursor: 'pointer',
          }}>{tt.label}</button>
        ))}
      </div>
    </div>
  );
}

function MenuCard({ icon, label, sub, onClick, highlight }) {
  return (
    <button onClick={onClick} style={{
      padding: 14, borderRadius: 14,
      background: highlight
        ? 'linear-gradient(135deg, rgba(201,169,97,0.22) 0%, rgba(201,169,97,0.08) 100%)'
        : 'rgba(245,239,223,0.06)',
      border: highlight
        ? '1px solid rgba(201,169,97,0.45)'
        : '1px solid rgba(245,239,223,0.12)',
      color: '#f5efdf', textAlign: 'left',
      cursor: 'pointer',
      display: 'flex', flexDirection: 'column', gap: 4,
      fontFamily: 'inherit',
    }}>
      <div style={{ fontSize: 22 }}>{icon}</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: highlight ? '#e9d8a6' : '#f5efdf' }}>{label}</div>
      <div style={{ fontSize: 11, opacity: 0.65, lineHeight: 1.3 }}>{sub}</div>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
// Auth (sign in / sign up)
// ─────────────────────────────────────────────────────────────
function AuthScreen({ onSignedIn, onForgot }) {
  const { t, lang } = useI18n();
  const [mode, setMode] = useState('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [errs, setErrs] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const submit = () => {
    const e = {};
    if (mode === 'signup' && !name.trim()) {
      e.name = lang === 'zh' ? '请输入昵称' : 'Choose a display name.';
    }
    if (!email) e.email = lang === 'zh' ? '请输入邮箱' : 'Email is required.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      e.email = lang === 'zh' ? '邮箱格式不正确' : 'Enter a valid email address.';
    }
    if (!pw) e.pw = lang === 'zh' ? '请输入密码' : 'Password is required.';
    else if (mode === 'signup' && pw.length < 8) {
      e.pw = lang === 'zh' ? '密码至少 8 位' : 'Password must be at least 8 characters.';
    }
    setErrs(e);
    if (Object.keys(e).length) return;
    setSubmitting(true);
    setTimeout(() => { setSubmitting(false); onSignedIn(); }, 700);
  };

  return (
    <div style={{
      position: 'absolute', inset: 0,
      background: 'linear-gradient(180deg, #0d3b2e 0%, #061a14 100%)',
      color: '#f5efdf',
      display: 'flex', flexDirection: 'column',
      padding: '52px 24px 40px',
      overflowY: 'auto',
    }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <LangToggle />
      </div>
      <div style={{ textAlign: 'center', marginBottom: 28 }}>
        <div style={{ fontFamily: 'serif', fontSize: 56, color: '#c9a961', lineHeight: 1 }}>南昌</div>
        <div style={{
          fontSize: 11, letterSpacing: 4, marginTop: 6, opacity: 0.7,
          fontFamily: 'ui-monospace, monospace', fontWeight: 600,
        }}>{t('app').toUpperCase()}</div>
      </div>

      {/* Toggle */}
      <div style={{
        display: 'flex', padding: 4, borderRadius: 12,
        background: 'rgba(245,239,223,0.06)', marginBottom: 20,
      }}>
        {['signin', 'signup'].map(m => (
          <button key={m} onClick={() => { setMode(m); setErrs({}); }} style={{
            flex: 1, padding: 10, borderRadius: 9,
            background: mode === m ? '#c9a961' : 'transparent',
            color: mode === m ? '#1f2937' : '#f5efdf',
            border: 'none', fontWeight: 600, fontSize: 13,
            cursor: 'pointer',
          }}>{m === 'signin' ? t('signIn') : t('signUp')}</button>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {mode === 'signup' && (
          <FormField label={t('displayName')} value={name} onChange={setName} error={errs.name} />
        )}
        <FormField label={t('email')} value={email} onChange={setEmail} type="email"
          placeholder="you@example.com" error={errs.email} />
        <FormField label={t('password')} value={pw} onChange={setPw} type="password"
          placeholder="••••••••" error={errs.pw}
          hint={mode === 'signup' ? (lang === 'zh' ? '至少 8 位' : 'At least 8 characters') : null} />
      </div>

      {mode === 'signin' && (
        <button onClick={onForgot} style={{
          alignSelf: 'flex-end', background: 'transparent', border: 'none',
          color: '#c9a961', fontSize: 12, fontWeight: 600, cursor: 'pointer',
          padding: '0 2px', marginTop: -4, marginBottom: 4,
        }}>{lang === 'zh' ? '忘记密码?' : 'Forgot password?'}</button>
      )}

      <button onClick={submit} disabled={submitting} style={{
        marginTop: 12, padding: '14px 20px', borderRadius: 14,
        background: 'linear-gradient(180deg, #c9a961 0%, #a88a45 100%)',
        color: '#1f2937', border: 'none', fontWeight: 700, fontSize: 15,
        cursor: submitting ? 'wait' : 'pointer',
        opacity: submitting ? 0.7 : 1,
        boxShadow: '0 6px 18px rgba(201,169,97,0.3)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      }}>
        {submitting && (
          <span style={{
            width: 14, height: 14, borderRadius: '50%',
            border: '2px solid rgba(31,41,55,0.25)', borderTopColor: '#1f2937',
            animation: 'spin 0.9s linear infinite', display: 'inline-block',
          }} />
        )}
        {mode === 'signin' ? t('signIn') : t('signUp')}
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '20px 0' }}>
        <div style={{ flex: 1, height: 1, background: 'rgba(245,239,223,0.15)' }} />
        <span style={{ fontSize: 11, opacity: 0.55 }}>OR</span>
        <div style={{ flex: 1, height: 1, background: 'rgba(245,239,223,0.15)' }} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <SocialBtn label={t('continueApple')} symbol="" />
        <SocialBtn label={t('continueGoogle')} symbol="G" />
      </div>

      <button onClick={onSignedIn} style={{
        marginTop: 'auto', padding: 12, borderRadius: 12,
        background: 'transparent', border: 'none',
        color: 'rgba(245,239,223,0.6)', fontSize: 13, cursor: 'pointer',
      }}>{t('continueGuest')}</button>
    </div>
  );
}

// Legacy Field (used elsewhere) — kept for compat, real fields use FormField
function Field({ label, placeholder, type = 'text' }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 11, opacity: 0.7, fontWeight: 600, letterSpacing: 0.5 }}>{label.toUpperCase()}</span>
      <input
        type={type} placeholder={placeholder}
        style={{
          padding: '12px 14px', borderRadius: 12,
          background: 'rgba(245,239,223,0.07)',
          border: '1px solid rgba(245,239,223,0.15)',
          color: '#f5efdf', fontSize: 14,
          outline: 'none',
        }}
      />
    </label>
  );
}

function SocialBtn({ label, symbol }) {
  return (
    <button style={{
      padding: '12px 16px', borderRadius: 12,
      background: 'rgba(245,239,223,0.06)',
      border: '1px solid rgba(245,239,223,0.15)',
      color: '#f5efdf', fontWeight: 600, fontSize: 13,
      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    }}>
      <span style={{ fontWeight: 800 }}>{symbol || '⌘'}</span>
      {label}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
// Join / create room
// ─────────────────────────────────────────────────────────────
function RoomScreen({ onBack, onStart, state = 'normal' }) {
  const { t, lang } = useI18n();
  const [code] = useState('NX-3K8M');

  if (state === 'loading') {
    return (
      <ScreenShell title={t('privateRoom')} onBack={onBack}>
        <div style={{ padding: 16 }}>
          <Skel h={120} r={18} style={{ marginBottom: 16 }} />
          <Skel w={120} h={10} r={4} style={{ marginBottom: 10 }} />
          {[0,1,2,3].map(i => <Skel key={i} h={62} r={14} style={{ marginBottom: 8 }} />)}
          <div style={{ height: 12 }} />
          <Skel w={140} h={10} r={4} style={{ marginBottom: 10 }} />
          {[0,1,2,3,4].map(i => <Skel key={i} h={42} r={12} style={{ marginBottom: 6 }} />)}
        </div>
      </ScreenShell>
    );
  }

  if (state === 'error') {
    return (
      <ErrorState
        title={lang === 'zh' ? '无法加入房间' : "Can't reach room"}
        body={lang === 'zh'
          ? '房间不存在,或已结束。请向房主再次索取邀请。'
          : "This room is no longer available. Ask the host for a fresh invite."}
        primaryLabel={lang === 'zh' ? '返回' : 'Back to home'}
        onPrimary={onBack}
      />
    );
  }

  // host-left modal renders inside an otherwise-empty room shell
  if (state === 'host-left') {
    return (
      <ScreenShell title={t('privateRoom')} onBack={onBack}>
        <div style={{ padding: 16, opacity: 0.4, pointerEvents: 'none' }}>
          <div style={{
            padding: 20, borderRadius: 18,
            background: 'rgba(201,169,97,0.1)',
            border: '1px solid rgba(201,169,97,0.4)',
            textAlign: 'center', marginBottom: 16,
          }}>
            <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 30, fontWeight: 700, color: '#c9a961', letterSpacing: 4 }}>{code}</div>
          </div>
        </div>
        <PlayerLeftOverlay
          playerName={lang === 'zh' ? '房主' : 'Host'}
          onWait={() => {}}
          onEndMatch={onBack}
        />
      </ScreenShell>
    );
  }

  // 'waiting' = 1/4 seats taken (just you). 'normal' = 3/4 with 1 open.
  const isWaiting = state === 'waiting';
  const seats = isWaiting ? [
    { name: lang === 'zh' ? '你' : 'You', wind: '東', ready: true, you: true },
    { name: null, wind: '南', ready: false },
    { name: null, wind: '西', ready: false },
    { name: null, wind: '北', ready: false },
  ] : [
    { name: lang === 'zh' ? '你' : 'You', wind: '東', ready: true, you: true },
    { name: 'Mei', wind: '南', ready: true },
    { name: 'Wei', wind: '西', ready: false },
    { name: null, wind: '北', ready: false },
  ];
  const allReady = seats.every(s => s.name && s.ready);
  return (
    <ScreenShell title={t('privateRoom')} onBack={onBack}>
      <div style={{ padding: 16 }}>
        {/* Code card */}
        <div style={{
          padding: 20, borderRadius: 18,
          background: 'rgba(201,169,97,0.1)',
          border: '1px solid rgba(201,169,97,0.4)',
          textAlign: 'center', marginBottom: 16,
        }}>
          <div style={{ fontSize: 11, letterSpacing: 2, opacity: 0.7, marginBottom: 6, fontWeight: 600 }}>
            {t('roomCode')}
          </div>
          <div style={{
            fontFamily: 'ui-monospace, monospace', fontSize: 30, fontWeight: 700,
            color: '#c9a961', letterSpacing: 4,
          }}>{code}</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'center' }}>
            <button style={pillBtn}>{t('copy')}</button>
            <button style={pillBtn}>{t('shareLink')}</button>
          </div>
        </div>

        {/* Waiting banner */}
        {isWaiting && (
          <div style={{
            padding: 12, borderRadius: 14, marginBottom: 14,
            background: 'rgba(245,239,223,0.06)',
            border: '1px dashed rgba(201,169,97,0.35)',
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <div style={{
              width: 26, height: 26, borderRadius: '50%',
              border: '3px solid rgba(201,169,97,0.25)',
              borderTopColor: '#c9a961',
              animation: 'spin 0.9s linear infinite',
            }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>
                {lang === 'zh' ? '等待玩家加入…' : 'Waiting for players to join…'}
              </div>
              <div style={{ fontSize: 11, opacity: 0.65 }}>
                {lang === 'zh' ? '分享上方房间号给好友。' : 'Share the code above with friends.'}
              </div>
            </div>
          </div>
        )}

        {/* Seats */}
        <div style={{ fontSize: 11, letterSpacing: 1, opacity: 0.65, marginBottom: 8, fontWeight: 600 }}>
          {t('players')} · {seats.filter(s => s.name).length} / 4
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {seats.map((s, i) => (
            <div key={i} style={{
              padding: '12px 14px', borderRadius: 14,
              background: s.name ? 'rgba(245,239,223,0.06)' : 'rgba(245,239,223,0.02)',
              border: '1px solid rgba(245,239,223,0.1)',
              display: 'flex', alignItems: 'center', gap: 12,
              ...(s.you && { borderColor: 'rgba(201,169,97,0.5)' }),
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: s.name ? 'rgba(201,169,97,0.2)' : 'rgba(245,239,223,0.04)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'serif', fontSize: 17, color: s.name ? '#c9a961' : 'rgba(245,239,223,0.3)',
                fontWeight: 700,
                border: s.name ? '1px solid rgba(201,169,97,0.4)' : '1px dashed rgba(245,239,223,0.15)',
              }}>{s.wind}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>
                  {s.name || t('waiting')}
                </div>
                <div style={{ fontSize: 11, opacity: 0.6 }}>
                  {s.name ? (s.ready ? t('ready') : t('notReady')) : t('openSeat')}
                </div>
              </div>
              {s.name && s.ready && (
                <div style={{
                  padding: '3px 8px', borderRadius: 999,
                  background: 'rgba(31,122,77,0.2)', border: '1px solid rgba(31,122,77,0.5)',
                  color: '#7fc299', fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
                }}>{t('ready').toUpperCase()}</div>
              )}
            </div>
          ))}
        </div>

        {/* Settings */}
        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: 11, letterSpacing: 1, opacity: 0.65, marginBottom: 8, fontWeight: 600 }}>
            {t('roundSettings')}
          </div>
          <SettingRow label={lang === 'zh' ? '玩法' : 'Style'} value={lang === 'zh' ? '南昌麻将' : 'Nanchang (南昌)'} />
          <SettingRow label={lang === 'zh' ? '局数' : 'Rounds'} value={lang === 'zh' ? '东+南' : 'East + South'} />
          <SettingRow label={lang === 'zh' ? '精牌' : 'Jing Tile'} value={lang === 'zh' ? '每局随机' : 'Random per round'} />
          <SettingRow label={lang === 'zh' ? '出牌时间' : 'Discard timer'} value={lang === 'zh' ? '8 秒' : '8 seconds'} />
          <SettingRow label={lang === 'zh' ? '起胡番数' : 'Min. winning fan'} value={lang === 'zh' ? '3 番' : '3 fan'} />
        </div>

        <button onClick={onStart} disabled={!allReady} style={{
          width: '100%', marginTop: 20, padding: 16, borderRadius: 14,
          background: allReady
            ? 'linear-gradient(180deg, #c9a961 0%, #a88a45 100%)'
            : 'rgba(245,239,223,0.07)',
          color: allReady ? '#1f2937' : 'rgba(245,239,223,0.4)',
          border: allReady ? 'none' : '1px solid rgba(245,239,223,0.1)',
          fontWeight: 700, fontSize: 15,
          cursor: allReady ? 'pointer' : 'not-allowed',
          boxShadow: allReady ? '0 6px 18px rgba(201,169,97,0.3)' : 'none',
          fontFamily: 'inherit',
        }}>{allReady
          ? t('startMatch')
          : (lang === 'zh' ? `等待 ${4 - seats.filter(s => s.name && s.ready).length} 位玩家…` : `Waiting for ${4 - seats.filter(s => s.name && s.ready).length} player${(4 - seats.filter(s => s.name && s.ready).length) === 1 ? '' : 's'}…`)
        }</button>
      </div>
    </ScreenShell>
  );
}

const pillBtn = {
  padding: '6px 14px', borderRadius: 999,
  background: 'rgba(201,169,97,0.18)',
  border: '1px solid rgba(201,169,97,0.4)',
  color: '#c9a961', fontSize: 12, fontWeight: 600,
  cursor: 'pointer',
};

function SettingRow({ label, value }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', padding: '12px 14px',
      borderRadius: 12, background: 'rgba(245,239,223,0.04)',
      marginBottom: 6, fontSize: 13,
    }}>
      <span style={{ opacity: 0.7 }}>{label}</span>
      <span style={{ color: '#c9a961', fontWeight: 600 }}>{value}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// History
// ─────────────────────────────────────────────────────────────
function HistoryScreen({ onBack, onOpenGame, state = 'normal', onPlay, onLearn }) {
  const { t, lang } = useI18n();
  if (state === 'loading') {
    return <HistorySkeleton />;
  }
  if (state === 'empty') {
    return (
      <ScreenShell title={t('historyTitle')} onBack={onBack}>
        <EmptyHistory onPlayNow={onPlay} onLearn={onLearn} />
      </ScreenShell>
    );
  }
  if (state === 'error') {
    return (
      <ErrorState
        title={lang === 'zh' ? '加载失败' : "Couldn't load history"}
        body={lang === 'zh'
          ? '看起来你已离线。请检查网络后重试。'
          : "You seem to be offline. Check your connection and try again."}
        primaryLabel={lang === 'zh' ? '重试' : 'Try again'}
        onPrimary={() => {}}
        secondaryLabel={lang === 'zh' ? '返回' : 'Back'}
        onSecondary={onBack}
      />
    );
  }
  const games = [
    { id: 1, date: lang === 'zh' ? '今天 · 20:42' : 'Today · 8:42 PM', result: 'win', score: '+3,200', opp: 'Mei, Wei, Lin', hand: lang === 'zh' ? '混三色' : 'Mixed Triple Chow', fan: 4 },
    { id: 2, date: lang === 'zh' ? '今天 · 18:15' : 'Today · 6:15 PM', result: 'loss', score: '-1,400', opp: 'Mei, Wei, Lin', hand: '—', fan: 0 },
    { id: 3, date: lang === 'zh' ? '昨天 · 21:02' : 'Yesterday · 9:02 PM', result: 'win', score: '+2,000', opp: lang === 'zh' ? '人机对局' : 'Bot match', hand: lang === 'zh' ? '对对胡' : 'All Pungs', fan: 3 },
    { id: 4, date: lang === 'zh' ? '昨天 · 19:45' : 'Yesterday · 7:45 PM', result: 'loss', score: '-800', opp: 'Mei, Wei, Lin', hand: '—', fan: 0 },
    { id: 5, date: lang === 'zh' ? '4月30日 · 22:20' : 'Apr 30 · 10:20 PM', result: 'win', score: '+5,400', opp: 'Mei, Wei, Lin', hand: lang === 'zh' ? '十三幺' : 'Thirteen Irregular', fan: 8 },
  ];

  return (
    <ScreenShell title={t('historyTitle')} onBack={onBack}>
      <div style={{ padding: 16 }}>
        {/* Stats grid */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16,
        }}>
          <StatCard label={t('winRate')} value="58%" sub={`↑ 4% ${t('thisWeek')}`} />
          <StatCard label={t('gamesC')} value="42" sub={t('thisSeason')} />
          <StatCard label={t('avgFan')} value="3.4" sub={t('perWin')} />
        </div>

        {/* Mini chart */}
        <div style={{
          padding: 14, borderRadius: 16,
          background: 'rgba(245,239,223,0.05)',
          border: '1px solid rgba(245,239,223,0.1)',
          marginBottom: 16,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: 1, opacity: 0.7 }}>{t('rating30')}</span>
            <span style={{ fontSize: 13, color: '#7fc299', fontWeight: 700 }}>+186</span>
          </div>
          <Sparkline />
        </div>

        {/* Favorite hand */}
        <div style={{
          padding: 14, borderRadius: 16,
          background: 'rgba(201,169,97,0.08)',
          border: '1px solid rgba(201,169,97,0.25)',
          marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <div style={{ display: 'flex', gap: 2 }}>
            <MahjongTile id="b3" size="sm" />
            <MahjongTile id="b3" size="sm" />
            <MahjongTile id="b3" size="sm" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, opacity: 0.7, fontWeight: 600, letterSpacing: 0.5 }}>{t('favHand')}</div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{lang === 'zh' ? '碰碰胡 — 8 胜' : 'Pure Pung — 8 wins'}</div>
          </div>
        </div>

        {/* Game list */}
        <div style={{ fontSize: 11, letterSpacing: 1, opacity: 0.65, marginBottom: 8, fontWeight: 600 }}>
          {t('recentGames')}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {games.map(g => (
            <button key={g.id} onClick={() => onOpenGame(g)} style={{
              padding: '12px 14px', borderRadius: 14,
              background: 'rgba(245,239,223,0.05)',
              border: '1px solid rgba(245,239,223,0.1)',
              display: 'flex', alignItems: 'center', gap: 12,
              cursor: 'pointer', textAlign: 'left',
              color: '#f5efdf',
            }}>
              <div style={{
                width: 8, height: 36, borderRadius: 4,
                background: g.result === 'win' ? '#7fc299' : '#c0392b',
              }} />
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{g.hand !== '—' ? g.hand : t('noWin')}</span>
                  <span style={{
                    fontSize: 13, fontWeight: 700,
                    color: g.result === 'win' ? '#7fc299' : '#e88080',
                    fontFamily: 'ui-monospace, monospace',
                  }}>{g.score}</span>
                </div>
                <div style={{ fontSize: 11, opacity: 0.6 }}>
                  {g.date} · vs {g.opp}{g.fan > 0 ? ` · ${g.fan} ${lang === 'zh' ? '番' : 'fan'}` : ''}
                </div>
              </div>
              <span style={{ opacity: 0.4, fontSize: 18 }}>›</span>
            </button>
          ))}
        </div>
      </div>
    </ScreenShell>
  );
}

function StatCard({ label, value, sub }) {
  return (
    <div style={{
      padding: 12, borderRadius: 14,
      background: 'rgba(245,239,223,0.05)',
      border: '1px solid rgba(245,239,223,0.1)',
    }}>
      <div style={{ fontSize: 9, opacity: 0.6, fontWeight: 600, letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: '#c9a961', marginTop: 2 }}>{value}</div>
      <div style={{ fontSize: 10, opacity: 0.55, marginTop: 2 }}>{sub}</div>
    </div>
  );
}

function Sparkline() {
  const data = [40, 38, 42, 44, 41, 47, 50, 48, 52, 55, 53, 58, 60, 59, 62, 64, 63, 67, 70, 68, 72, 70, 75, 73, 76, 78, 77, 80, 78, 82];
  const max = Math.max(...data);
  const min = Math.min(...data);
  const w = 320, h = 60, pad = 2;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * (w - pad * 2) + pad;
    const y = h - ((v - min) / (max - min)) * (h - pad * 2) - pad;
    return [x, y];
  });
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const area = `${path} L${w - pad} ${h} L${pad} ${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 60, display: 'block' }}>
      <path d={area} fill="rgba(201,169,97,0.15)" />
      <path d={path} fill="none" stroke="#c9a961" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pts.at(-1)[0]} cy={pts.at(-1)[1]} r="3" fill="#c9a961" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────
// Customize
// ─────────────────────────────────────────────────────────────
function CustomizeScreen({ onBack }) {
  const { t, lang } = useI18n();
  const { theme, setTheme } = useTheme();
  const feltLabels = lang === 'zh'
    ? ['翡翠', '午夜', '红木', '森林', '石板']
    : ['Jade', 'Midnight', 'Mahogany', 'Forest', 'Slate'];
  const backLabels = lang === 'zh'
    ? ['翡翠', '炭灰', '深红', '胡桃', '靛蓝']
    : ['Jade', 'Charcoal', 'Crimson', 'Walnut', 'Indigo'];
  const faceLabels = lang === 'zh'
    ? ['象牙', '奶白', '骨白', '蜜色', '玛瑙']
    : ['Ivory', 'Cream', 'Bone', 'Honey', 'Onyx'];
  const soundLabels = [t('soundTrad'), t('soundSoft'), t('soundModern'), t('soundSilent')];
  return (
    <ScreenShell title={t('customize')} onBack={onBack}>
      <div style={{ padding: 16 }}>
        {/* Preview */}
        <div style={{
          padding: 24, borderRadius: 20,
          background: `radial-gradient(ellipse, ${theme.felt}, oklch(from ${theme.felt} calc(l * 0.6) c h))`,
          border: '1px solid rgba(245,239,223,0.1)',
          marginBottom: 16, display: 'flex', justifyContent: 'center', gap: 6,
        }}>
          {['c5', 'b3', 'd5', 'we', 'back'].map((tt, i) => (
            <MahjongTile
              key={i} id={tt} size="md"
              faceColor={theme.face}
              backColor={theme.back}
              backAccent={theme.backAccent}
            />
          ))}
        </div>

        <Section title={t('feltColor')}>
          <SwatchRow
            options={[
              { v: '#0d3b2e', label: feltLabels[0] },
              { v: '#1a1a2e', label: feltLabels[1] },
              { v: '#5c2a1e', label: feltLabels[2] },
              { v: '#2d4a3e', label: feltLabels[3] },
              { v: '#3a3a3a', label: feltLabels[4] },
            ]}
            value={theme.felt}
            onChange={v => setTheme({ ...theme, felt: v })}
          />
        </Section>

        <Section title={t('tileBack')}>
          <SwatchRow
            options={[
              { v: '#0d3b2e', label: backLabels[0] },
              { v: '#1f2937', label: backLabels[1] },
              { v: '#7d2929', label: backLabels[2] },
              { v: '#2c1810', label: backLabels[3] },
              { v: '#1d3557', label: backLabels[4] },
            ]}
            value={theme.back}
            onChange={v => setTheme({ ...theme, back: v })}
          />
        </Section>

        <Section title={t('tilePalette')}>
          <SwatchRow
            options={[
              { v: '#f5efdf', label: faceLabels[0] },
              { v: '#fff8e1', label: faceLabels[1] },
              { v: '#e8e0d0', label: faceLabels[2] },
              { v: '#f0d9b5', label: faceLabels[3] },
              { v: '#1f2937', label: faceLabels[4], dark: true },
            ]}
            value={theme.face}
            onChange={v => setTheme({ ...theme, face: v })}
          />
        </Section>

        <Section title={t('soundPack')}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {soundLabels.map((s, i) => (
              <button key={i} onClick={() => setTheme({ ...theme, sound: i })}
                style={{
                  padding: '10px 14px', borderRadius: 12,
                  background: theme.sound === i ? 'rgba(201,169,97,0.18)' : 'rgba(245,239,223,0.05)',
                  border: theme.sound === i ? '1px solid #c9a961' : '1px solid rgba(245,239,223,0.1)',
                  color: '#f5efdf', fontSize: 13, fontWeight: 600,
                  cursor: 'pointer', textAlign: 'left',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                {s}
                <span style={{ fontSize: 14, color: '#c9a961' }}>{theme.sound === i ? '◉' : '○'}</span>
              </button>
            ))}
          </div>
        </Section>
      </div>
    </ScreenShell>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{
        fontSize: 11, letterSpacing: 1, opacity: 0.65,
        marginBottom: 10, fontWeight: 600,
      }}>{title.toUpperCase()}</div>
      {children}
    </div>
  );
}

function SwatchRow({ options, value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4 }}>
      {options.map(o => {
        const sel = value === o.v;
        return (
          <button key={o.v} onClick={() => onChange(o.v)} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
            background: 'transparent', border: 'none', cursor: 'pointer', flexShrink: 0,
          }}>
            <div style={{
              width: 52, height: 52, borderRadius: 14,
              background: o.v,
              border: sel ? '2px solid #c9a961' : '2px solid rgba(245,239,223,0.15)',
              boxShadow: sel ? '0 0 0 3px rgba(201,169,97,0.3)' : 'none',
              transition: 'all 0.15s',
            }} />
            <span style={{ fontSize: 10, color: sel ? '#c9a961' : 'rgba(245,239,223,0.7)', fontWeight: 600 }}>{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Account
// ─────────────────────────────────────────────────────────────
function AccountScreen({ user, onBack, onSignOut, onFriends, onChangePassword, onDelete, onReplayOnboarding }) {
  const { t, lang } = useI18n();
  return (
    <ScreenShell title={t('profile')} onBack={onBack}>
      <div style={{ padding: 16, textAlign: 'center', marginBottom: 8 }}>
        <div style={{
          width: 80, height: 80, margin: '8px auto 12px', borderRadius: 24,
          background: 'linear-gradient(135deg, #c9a961, #a88a45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 32, fontWeight: 700, color: '#1f2937',
          boxShadow: '0 8px 24px rgba(201,169,97,0.3)',
        }}>{user.initial}</div>
        <div style={{ fontSize: 20, fontWeight: 700 }}>{user.name}</div>
        <div style={{ fontSize: 12, opacity: 0.6 }}>@{user.handle}</div>
        <div style={{
          display: 'inline-flex', gap: 6, marginTop: 8,
          padding: '4px 10px', borderRadius: 999,
          background: 'rgba(201,169,97,0.15)', border: '1px solid rgba(201,169,97,0.4)',
          fontSize: 11, fontWeight: 600, color: '#c9a961',
        }}>
          {user.rank} · {user.rating} pts
        </div>
      </div>

      <div style={{ padding: '0 16px' }}>
        <Section title={t('language')}>
          <div style={{
            padding: '10px 14px', borderRadius: 12,
            background: 'rgba(245,239,223,0.04)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ fontSize: 13 }}>{t('language')}</span>
            <LangToggle />
          </div>
        </Section>
        <Section title={t('account')}>
          <RowAction label={t('email')} value={user.email} />
          <RowAction label={t('displayName')} value={user.name} chevron />
          <RowAction label={t('privacy')} value={t('friendsOnly')} chevron />
          <RowAction label={lang === 'zh' ? '好友' : 'Friends'} value="12" chevron onClick={onFriends} />
          <RowAction label={lang === 'zh' ? '密码' : 'Password'} value={lang === 'zh' ? '修改' : 'Change'} chevron onClick={onChangePassword} />
        </Section>
        <Section title={t('game')}>
          <RowAction label={t('sound')} value={t('soundTrad')} chevron />
          <RowAction label={t('vibration')} toggle on />
          <RowAction label={t('autoTimer')} value="8s" chevron />
          <RowAction label={t('showLabels')} toggle on />
          <RowAction label={lang === 'zh' ? '新手教程' : 'Replay intro'} value={lang === 'zh' ? '重新查看' : 'Show again'} chevron onClick={onReplayOnboarding} />
        </Section>
        <Section title={t('about')}>
          <RowAction label={t('rules')} value={t('rulesNanchang')} chevron />
          <RowAction label={t('helpFeedback')} chevron />
          <RowAction label={lang === 'zh' ? '服务条款' : 'Terms of service'} chevron />
          <RowAction label={lang === 'zh' ? '隐私政策' : 'Privacy policy'} chevron />
          <RowAction label={t('version')} value="1.0.0" />
        </Section>

        <button onClick={onSignOut} style={{
          width: '100%', marginTop: 12, padding: 14, borderRadius: 12,
          background: 'rgba(192,57,43,0.12)',
          border: '1px solid rgba(192,57,43,0.4)',
          color: '#e88080', fontSize: 13, fontWeight: 600,
          cursor: 'pointer',
        }}>{t('signOut')}</button>
        <button onClick={onDelete} style={{
          width: '100%', marginTop: 8, marginBottom: 8, padding: 12, borderRadius: 12,
          background: 'transparent',
          border: '1px solid rgba(192,57,43,0.25)',
          color: 'rgba(232,128,128,0.75)', fontSize: 12, fontWeight: 600,
          cursor: 'pointer',
        }}>{lang === 'zh' ? '删除账号' : 'Delete account'}</button>
      </div>
    </ScreenShell>
  );
}

function RowAction({ label, value, chevron, toggle, on, onClick }) {
  return (
    <div onClick={onClick} style={{
      cursor: onClick ? 'pointer' : 'default',
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '12px 14px', borderRadius: 12,
      background: 'rgba(245,239,223,0.04)',
      marginBottom: 6, fontSize: 13,
    }}>
      <span>{label}</span>
      <span style={{
        display: 'flex', alignItems: 'center', gap: 6,
        opacity: 0.7, fontWeight: 500,
      }}>
        {value}
        {toggle && (
          <span style={{
            width: 36, height: 22, borderRadius: 999,
            background: on ? '#c9a961' : 'rgba(245,239,223,0.15)',
            position: 'relative', transition: 'all 0.2s',
          }}>
            <span style={{
              position: 'absolute', top: 2, left: on ? 16 : 2,
              width: 18, height: 18, borderRadius: '50%', background: '#fff',
              transition: 'all 0.2s',
            }} />
          </span>
        )}
        {chevron && <span style={{ opacity: 0.5, fontSize: 16 }}>›</span>}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// End-of-game scoreboard (shows after Win)
// ─────────────────────────────────────────────────────────────
function EndGameScreen({ onContinue, onHome, result = 'win' }) {
  const { t, lang } = useI18n();
  const isWin = result === 'win';
  const isDraw = result === 'draw';
  const headline = isWin ? '胡!' : isDraw ? '流局' : '輸';
  const sub = isWin ? t('mahjong') : isDraw ? t('washout') : t('noWinHead');
  const tagline = isWin ? t('youWon')
    : isDraw ? t('wallExhaust')
    : t('linWon');
  const headColor = isWin ? '#c9a961' : isDraw ? '#9aa6a0' : '#c0392b';
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 100,
      background: 'linear-gradient(180deg, rgba(13,59,46,0.97) 0%, rgba(5,18,12,0.98) 100%)',
      backdropFilter: 'blur(20px)',
      display: 'flex', flexDirection: 'column',
      padding: '60px 20px 24px', color: '#f5efdf',
    }}>
      <div style={{ textAlign: 'center', marginBottom: 16 }}>
        <div style={{ fontFamily: '"Noto Serif SC", serif', fontSize: 64, color: headColor, lineHeight: 1, fontWeight: 700 }}>{headline}</div>
        <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: 4, color: headColor, marginTop: 6 }}>{sub.toUpperCase()}</div>
        <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>{tagline}</div>
      </div>

      {isWin && (
        <>
          <div style={{ padding: 14, borderRadius: 16, background: 'rgba(201,169,97,0.08)', border: '1px solid rgba(201,169,97,0.3)', marginBottom: 12 }}>
            <div style={{ fontSize: 11, opacity: 0.65, fontWeight: 600, letterSpacing: 1, marginBottom: 8 }}>
              {t('winningHand')} · {lang === 'zh' ? '混三色' : 'MIXED TRIPLE CHOW'}
            </div>
            <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              {['c2','c3','c4','b5','b5','b5','d3','d4','d5','we','we','b3','b3','b3'].map((tt, i) => (
                <MahjongTile key={i} id={tt} size="sm" />
              ))}
            </div>
          </div>
          <div style={{ padding: 12, borderRadius: 12, background: 'rgba(245,239,223,0.04)', marginBottom: 10, fontSize: 12 }}>
            <ScoreLine label={t('base')} v="+1,000" />
            <ScoreLine label={lang === 'zh' ? '混三色' : 'Mixed Triple Chow · 混三色'} v="×2" />
            <ScoreLine label={lang === 'zh' ? '对对胡' : 'All Pungs · 對對胡'} v="×2" />
            <ScoreLine label={lang === 'zh' ? '精牌 (3 条在手)' : 'Jing 精 (3 BAM in hand)'} v="×2" gold />
            <div style={{ borderTop: '1px solid rgba(245,239,223,0.15)', margin: '6px 0', paddingTop: 6 }}>
              <ScoreLine label={t('total')} v="+8,000" big />
            </div>
          </div>
        </>
      )}

      {!isWin && (
        <div style={{ padding: 14, borderRadius: 14, background: 'rgba(245,239,223,0.05)', marginBottom: 14, fontSize: 12 }}>
          <ScoreLine label={t('yourHand')} v={isDraw ? '0' : '-2,400'} />
          <ScoreLine label={t('tilesInWall')} v={isDraw ? (lang === 'zh' ? '剩 0' : '0 left') : (lang === 'zh' ? '剩 12' : '12 left')} />
          <ScoreLine label={t('round')} v={lang === 'zh' ? '东 1' : 'East 1'} />
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
        <RematchStrip
          accepted={isWin ? ['You', 'Mei'] : ['Mei', 'Lin']}
          waitingOn={isWin ? ['Wei', 'Lin'] : ['You', 'Wei']}
          onAccept={onContinue}
          onDecline={onHome}
        />
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <button onClick={onHome} style={{
          flex: 1, padding: 14, borderRadius: 14,
          background: 'rgba(245,239,223,0.08)',
          border: '1px solid rgba(245,239,223,0.15)',
          color: '#f5efdf', fontWeight: 600, fontSize: 14, cursor: 'pointer',
        }}>{t('home')}</button>
        <button onClick={onContinue} style={{
          flex: 2, padding: 14, borderRadius: 14,
          background: 'linear-gradient(180deg, #c9a961 0%, #a88a45 100%)',
          color: '#1f2937', border: 'none', fontWeight: 700, fontSize: 14,
          cursor: 'pointer',
          boxShadow: '0 6px 18px rgba(201,169,97,0.3)',
        }}>{t('nextRound')}</button>
      </div>
    </div>
  );
}

function ScoreLine({ label, v, big, gold }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between',
      padding: '4px 0', fontSize: big ? 15 : 12,
      fontWeight: big ? 700 : 500,
    }}>
      <span style={{ opacity: big ? 1 : 0.7 }}>{label}</span>
      <span style={{
        fontFamily: 'ui-monospace, monospace',
        color: gold ? '#c9a961' : (big ? '#7fc299' : '#f5efdf'),
        fontWeight: gold ? 700 : (big ? 700 : 500),
      }}>{v}</span>
    </div>
  );
}

Object.assign(window, {
  ScreenShell, HomeScreen, AuthScreen, RoomScreen,
  HistoryScreen, CustomizeScreen, AccountScreen, EndGameScreen,
});
