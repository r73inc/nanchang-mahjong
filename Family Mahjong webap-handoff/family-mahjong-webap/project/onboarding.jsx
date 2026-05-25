// First-launch onboarding — 4 slides, can be skipped or replayed from Profile.
// Persists a "mj_onboarded" flag so it only auto-shows once.

const { useState, useEffect } = React;

function OnboardingScreen({ onFinish, onSkip }) {
  const { lang } = useI18n();
  const [i, setI] = useState(0);

  const slides = [
    {
      key: 'welcome',
      headline: lang === 'zh' ? '欢迎来到南昌麻将' : 'Welcome to Nanchang Mahjong',
      body: lang === 'zh'
        ? '一个具有江西地方特色的麻将玩法 — 包含独特的精牌(万能牌)系统。'
        : 'A regional mahjong variant from Jiangxi — featuring the unique Jing wildcard system.',
      visual: 'logo',
    },
    {
      key: 'tiles',
      headline: lang === 'zh' ? '认识牌面' : 'Read the tiles',
      body: lang === 'zh'
        ? '每张牌都有中文符号和英文标注。熟悉之后可在个人设置中关闭英文。'
        : 'Each tile shows a Chinese character with an English label below. You can hide labels in Profile once you\'re comfortable.',
      visual: 'tiles',
    },
    {
      key: 'jing',
      headline: lang === 'zh' ? '精牌让一切不同' : 'The Jing changes everything',
      body: lang === 'zh'
        ? '开局随机选出一张"精牌"。手中所有相同的牌都成为万能牌,加速你的胡牌速度。'
        : 'At the start of every round, a "Jing" tile is revealed. Every matching tile in your hand becomes a wildcard — a huge advantage if you draw one.',
      visual: 'jing',
    },
    {
      key: 'ready',
      headline: lang === 'zh' ? '边玩边学' : 'Learn as you play',
      body: lang === 'zh'
        ? '完整的规则、叫牌与策略指南都在"学习"中心。或直接开始第一局。'
        : 'Full rules, calling and strategy guides live in the Learn center. Or jump straight into your first match.',
      visual: 'ready',
    },
  ];

  const last = i === slides.length - 1;
  const next = () => last ? onFinish() : setI(i + 1);
  const prev = () => i > 0 && setI(i - 1);

  return (
    <div style={{
      position: 'absolute', inset: 0,
      background: 'radial-gradient(ellipse at top, #14543e 0%, #0d3b2e 40%, #061a14 100%)',
      color: '#f5efdf', display: 'flex', flexDirection: 'column',
      fontFamily: '-apple-system, system-ui, sans-serif',
    }}>
      <style>{`
        @keyframes obFloat {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-6px); }
        }
        @keyframes obFadeUp {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Top bar: skip + lang */}
      <div style={{
        padding: '50px 16px 0', display: 'flex',
        alignItems: 'center', justifyContent: 'space-between',
      }}>
        <LangToggle />
        <button onClick={onSkip} style={{
          background: 'transparent', border: 'none',
          color: 'rgba(245,239,223,0.6)', fontSize: 13, fontWeight: 600,
          cursor: 'pointer',
        }}>{lang === 'zh' ? '跳过' : 'Skip'}</button>
      </div>

      {/* Visual */}
      <div key={i} style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '12px 24px',
      }}>
        <SlideVisual kind={slides[i].visual} />
        <div style={{
          fontSize: 24, fontWeight: 700, textAlign: 'center',
          marginTop: 32, marginBottom: 12,
          textWrap: 'pretty',
        }}>{slides[i].headline}</div>
        <div style={{
          fontSize: 14, lineHeight: 1.55, opacity: 0.75,
          textAlign: 'center', maxWidth: 320,
          textWrap: 'pretty',
        }}>{slides[i].body}</div>
      </div>

      {/* Pagination dots */}
      <div style={{
        display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 16,
      }}>
        {slides.map((s, j) => (
          <button key={s.key} onClick={() => setI(j)} style={{
            width: j === i ? 24 : 8, height: 8, borderRadius: 4,
            background: j === i ? '#c9a961' : 'rgba(245,239,223,0.2)',
            border: 'none', cursor: 'pointer',
            transition: 'all 0.25s',
          }} aria-label={`slide ${j + 1}`} />
        ))}
      </div>

      {/* Nav buttons */}
      <div style={{
        padding: '0 16px 28px', display: 'flex', gap: 8,
      }}>
        {i > 0 && (
          <button onClick={prev} style={{
            flex: 1, padding: 14, borderRadius: 14,
            background: 'rgba(245,239,223,0.06)',
            border: '1px solid rgba(245,239,223,0.15)',
            color: '#f5efdf', fontWeight: 600, fontSize: 14,
            cursor: 'pointer',
          }}>{lang === 'zh' ? '上一步' : 'Back'}</button>
        )}
        <button onClick={next} style={{
          flex: i > 0 ? 2 : 1, padding: 14, borderRadius: 14,
          background: 'linear-gradient(180deg, #c9a961 0%, #a88a45 100%)',
          color: '#1f2937', border: 'none', fontWeight: 700, fontSize: 14,
          cursor: 'pointer',
          boxShadow: '0 6px 18px rgba(201,169,97,0.3)',
        }}>{last
          ? (lang === 'zh' ? '开始 →' : 'Get started →')
          : (lang === 'zh' ? '下一步 →' : 'Next →')}</button>
      </div>
    </div>
  );
}

function SlideVisual({ kind }) {
  if (kind === 'logo') {
    return (
      <div style={{ textAlign: 'center', animation: 'obFloat 4s ease-in-out infinite' }}>
        <div style={{
          fontFamily: '"Noto Serif SC", serif', fontSize: 96, fontWeight: 700,
          color: '#c9a961', lineHeight: 1, letterSpacing: 4,
          textShadow: '0 0 40px rgba(201,169,97,0.4)',
        }}>南昌</div>
        <div style={{
          fontSize: 11, letterSpacing: 6, marginTop: 14, opacity: 0.7,
          fontFamily: 'ui-monospace, monospace', fontWeight: 600,
        }}>NANCHANG MAHJONG</div>
      </div>
    );
  }
  if (kind === 'tiles') {
    return (
      <div style={{ display: 'flex', gap: 6, perspective: 600 }}>
        {['c5', 'b3', 'd5', 'we'].map((t, j) => (
          <div key={t} style={{
            transform: `rotate(${(j - 1.5) * 5}deg) translateY(${Math.abs(j - 1.5) * 3}px)`,
          }}>
            <MahjongTile id={t} size="lg" />
          </div>
        ))}
      </div>
    );
  }
  if (kind === 'jing') {
    return (
      <div style={{ position: 'relative' }}>
        {/* glow rays */}
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          width: 220, height: 220, transform: 'translate(-50%, -50%)',
          background: 'radial-gradient(circle, rgba(201,169,97,0.3) 0%, transparent 70%)',
        }} />
        <div style={{
          padding: 10, borderRadius: 14,
          background: 'rgba(201,169,97,0.15)',
          border: '2px solid rgba(201,169,97,0.6)',
          boxShadow: '0 0 50px rgba(201,169,97,0.45)',
          position: 'relative',
        }}>
          <MahjongTile id="b3" size="xl" />
          <div style={{
            position: 'absolute', top: -8, right: -8,
            width: 28, height: 28, borderRadius: '50%',
            background: '#c0392b', color: '#fff',
            fontSize: 12, fontWeight: 800, fontFamily: 'serif',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '2px solid #f5efdf',
            boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
          }}>精</div>
        </div>
      </div>
    );
  }
  // ready
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
      <div style={{ display: 'flex', gap: 12 }}>
        <div style={{
          width: 84, height: 84, borderRadius: 24,
          background: 'rgba(201,169,97,0.15)',
          border: '1px solid rgba(201,169,97,0.4)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          color: '#c9a961', gap: 4,
        }}>
          <div style={{ fontFamily: 'serif', fontSize: 28 }}>學</div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1 }}>LEARN</div>
        </div>
        <div style={{
          width: 84, height: 84, borderRadius: 24,
          background: 'rgba(201,169,97,0.15)',
          border: '1px solid rgba(201,169,97,0.4)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          color: '#c9a961', gap: 4,
        }}>
          <div style={{ fontFamily: 'serif', fontSize: 28 }}>玩</div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1 }}>PLAY</div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Home banner — nudges new players toward Learn
// ─────────────────────────────────────────────────────────────
function LearnNudge({ onOpen, onDismiss }) {
  const { lang } = useI18n();
  return (
    <div style={{
      margin: '0 16px 12px', padding: 14, borderRadius: 16,
      background: 'linear-gradient(135deg, rgba(201,169,97,0.22) 0%, rgba(201,169,97,0.06) 100%)',
      border: '1px solid rgba(201,169,97,0.45)',
      position: 'relative', display: 'flex', gap: 12, alignItems: 'center',
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: 12,
        background: 'rgba(201,169,97,0.25)',
        border: '1px solid rgba(201,169,97,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'serif', fontSize: 24, color: '#c9a961', fontWeight: 700,
        flexShrink: 0,
      }}>學</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#e9d8a6', marginBottom: 2 }}>
          {lang === 'zh' ? '麻将新手?' : 'New to Mahjong?'}
        </div>
        <div style={{ fontSize: 11, opacity: 0.75, lineHeight: 1.4 }}>
          {lang === 'zh'
            ? '从规则学起 — 8 节短课覆盖入门到精牌策略。'
            : 'Start with the rules — 8 short lessons from basics to Jing strategy.'}
        </div>
      </div>
      <button onClick={onOpen} style={{
        padding: '8px 12px', borderRadius: 10,
        background: '#c9a961', color: '#1f2937',
        border: 'none', fontWeight: 700, fontSize: 12,
        cursor: 'pointer', flexShrink: 0,
      }}>{lang === 'zh' ? '开始' : 'Start →'}</button>
      <button onClick={onDismiss} aria-label="dismiss" style={{
        position: 'absolute', top: 6, right: 8,
        width: 22, height: 22, borderRadius: '50%',
        background: 'transparent', border: 'none',
        color: 'rgba(245,239,223,0.5)', fontSize: 16, cursor: 'pointer',
        lineHeight: 1,
      }}>×</button>
    </div>
  );
}

Object.assign(window, { OnboardingScreen, LearnNudge });
