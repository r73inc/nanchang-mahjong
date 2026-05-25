// Learn screen — Nanchang Mahjong rules & strategy guide
// Lesson list → individual lesson reader with prev/next.

const { useState: useStateL } = React;

// ─────────────────────────────────────────────────────────────
// Lesson data
// ─────────────────────────────────────────────────────────────
const LESSONS = [
  {
    id: 'overview',
    icon: '🎯',
    level: 'beginner',
    minutes: 2,
    titleKey: 'lessonOverview',
    subKey: 'lessonOverviewSub',
    sections: [
      { headKey: 'ovGoal', bodyKey: 'ovGoalBody' },
      { headKey: 'ovPlayers', bodyKey: 'ovPlayersBody', visual: 'compass' },
      { headKey: 'ovTurn', bodyKey: 'ovTurnBody' },
    ],
  },
  {
    id: 'tiles',
    icon: '🀄',
    level: 'beginner',
    minutes: 4,
    titleKey: 'lessonTiles',
    subKey: 'lessonTilesSub',
    sections: [
      { headKey: 'tilesSuits', bodyKey: 'tilesSuitsBody', visual: 'suits' },
      { headKey: 'tilesHonors', bodyKey: 'tilesHonorsBody', visual: 'honors' },
      { headKey: 'tilesReading', bodyKey: 'tilesReadingBody', visual: 'reading' },
    ],
  },
  {
    id: 'hand',
    icon: '🧱',
    level: 'beginner',
    minutes: 3,
    titleKey: 'lessonHand',
    subKey: 'lessonHandSub',
    sections: [
      { headKey: 'handBasic', bodyKey: 'handBasicBody', visual: 'structure' },
      { headKey: 'handSet1', bodyKey: 'handSet1Body', visual: 'pung' },
      { headKey: 'handSet2', bodyKey: 'handSet2Body', visual: 'kong' },
      { headKey: 'handSet3', bodyKey: 'handSet3Body', visual: 'chow' },
      { headKey: 'handPair', bodyKey: 'handPairBody', visual: 'pair' },
    ],
  },
  {
    id: 'calls',
    icon: '📣',
    level: 'intermediate',
    minutes: 4,
    titleKey: 'lessonCalls',
    subKey: 'lessonCallsSub',
    sections: [
      { headKey: 'callsWhen', bodyKey: 'callsWhenBody' },
      { headKey: 'callsPriority', bodyKey: 'callsPriorityBody', visual: 'priority' },
      { headKey: 'callsExposed', bodyKey: 'callsExposedBody' },
      { headKey: 'callsRobbing', bodyKey: 'callsRobbingBody' },
    ],
  },
  {
    id: 'jing',
    icon: '✨',
    level: 'intermediate',
    minutes: 3,
    titleKey: 'lessonJing',
    subKey: 'lessonJingSub',
    sections: [
      { headKey: 'jingWhat', bodyKey: 'jingWhatBody', visual: 'jing' },
      { headKey: 'jingBonus', bodyKey: 'jingBonusBody' },
      { headKey: 'jingStrategy', bodyKey: 'jingStrategyBody' },
    ],
  },
  {
    id: 'scoring',
    icon: '💰',
    level: 'intermediate',
    minutes: 3,
    titleKey: 'lessonScoring',
    subKey: 'lessonScoringSub',
    sections: [
      { headKey: 'scoreFan', bodyKey: 'scoreFanBody' },
      { headKey: 'scoreCommon', bodyKey: 'scoreCommonBody', visual: 'fanList' },
      { headKey: 'scorePay', bodyKey: 'scorePayBody' },
    ],
  },
  {
    id: 'special',
    icon: '🌟',
    level: 'advanced',
    minutes: 3,
    titleKey: 'lessonSpecial',
    subKey: 'lessonSpecialSub',
    sections: [
      { headKey: 'spThirteen', bodyKey: 'spThirteenBody', visual: 'thirteen' },
      { headKey: 'spSevenPairs', bodyKey: 'spSevenPairsBody' },
      { headKey: 'spAllHonors', bodyKey: 'spAllHonorsBody' },
    ],
  },
  {
    id: 'etiquette',
    icon: '🎎',
    level: 'beginner',
    minutes: 2,
    titleKey: 'lessonEtiquette',
    subKey: 'lessonEtiquetteSub',
    sections: [
      { headKey: 'etPace', bodyKey: 'etPaceBody' },
      { headKey: 'etCalling', bodyKey: 'etCallingBody' },
      { headKey: 'etDispute', bodyKey: 'etDisputeBody' },
    ],
  },
];

const LEVEL_COLORS = {
  beginner: { bg: 'rgba(94,179,134,0.15)', fg: '#7fcfa8', border: 'rgba(94,179,134,0.4)' },
  intermediate: { bg: 'rgba(201,169,97,0.18)', fg: '#d8b878', border: 'rgba(201,169,97,0.5)' },
  advanced: { bg: 'rgba(212,103,105,0.15)', fg: '#e98890', border: 'rgba(212,103,105,0.4)' },
};

// ─────────────────────────────────────────────────────────────
// Lesson list (Learn home)
// ─────────────────────────────────────────────────────────────
function LearnScreen({ onBack }) {
  const { t } = useI18n();
  const [selected, setSelected] = useStateL(null);

  if (selected !== null) {
    return (
      <LessonReader
        lessonIndex={selected}
        onBack={() => setSelected(null)}
        onLessonChange={setSelected}
      />
    );
  }

  return (
    <ScreenShell title={t('learnTitle')} onBack={onBack}>
      <div style={{ padding: 16 }}>
        {/* Hero card */}
        <div style={{
          padding: 18, borderRadius: 18, marginBottom: 18,
          background: 'linear-gradient(135deg, rgba(201,169,97,0.18) 0%, rgba(13,59,46,0.4) 100%)',
          border: '1px solid rgba(201,169,97,0.3)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
            <div style={{
              width: 42, height: 42, borderRadius: 12,
              background: 'rgba(201,169,97,0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 22,
            }}>📖</div>
            <div>
              <div style={{ fontSize: 11, letterSpacing: 1.2, color: '#c9a961', fontWeight: 700 }}>
                {t('learnTitle').toUpperCase()}
              </div>
              <div style={{ fontSize: 14, color: '#f5efdf', opacity: 0.8 }}>
                {LESSONS.length} {t('lessonOverview').toLowerCase().includes('概') ? '节' : 'lessons'}
              </div>
            </div>
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.55, color: '#f5efdf', opacity: 0.85 }}>
            {t('learnIntro')}
          </div>
        </div>

        {/* Lesson cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {LESSONS.map((lesson, i) => (
            <LessonCard key={lesson.id} lesson={lesson} index={i + 1} onClick={() => setSelected(i)} />
          ))}
        </div>
      </div>
    </ScreenShell>
  );
}

function LessonCard({ lesson, index, onClick }) {
  const { t } = useI18n();
  const lc = LEVEL_COLORS[lesson.level];
  return (
    <button onClick={onClick} style={{
      padding: 14, borderRadius: 16,
      background: 'rgba(245,239,223,0.04)',
      border: '1px solid rgba(201,169,97,0.18)',
      display: 'flex', alignItems: 'center', gap: 12,
      cursor: 'pointer', textAlign: 'left',
      color: 'inherit', fontFamily: 'inherit',
      width: '100%',
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: 12,
        background: 'linear-gradient(180deg, rgba(201,169,97,0.2), rgba(201,169,97,0.08))',
        border: '1px solid rgba(201,169,97,0.3)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 22, flexShrink: 0,
      }}>{lesson.icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
          <span style={{ fontSize: 10, color: '#c9a961', fontWeight: 700, letterSpacing: 0.5 }}>
            {String(index).padStart(2, '0')}
          </span>
          <span style={{
            fontSize: 9, padding: '2px 6px', borderRadius: 999,
            background: lc.bg, color: lc.fg, border: `1px solid ${lc.border}`,
            fontWeight: 700, letterSpacing: 0.5,
          }}>{t(lesson.level).toUpperCase()}</span>
          <span style={{ fontSize: 10, color: 'rgba(245,239,223,0.5)' }}>· {lesson.minutes} {t('estMin')}</span>
        </div>
        <div style={{ fontSize: 15, fontWeight: 600, color: '#f5efdf', marginBottom: 2 }}>
          {t(lesson.titleKey)}
        </div>
        <div style={{ fontSize: 12, color: 'rgba(245,239,223,0.6)', lineHeight: 1.4 }}>
          {t(lesson.subKey)}
        </div>
      </div>
      <div style={{ color: '#c9a961', fontSize: 18, flexShrink: 0 }}>›</div>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
// Lesson reader
// ─────────────────────────────────────────────────────────────
function LessonReader({ lessonIndex, onBack, onLessonChange }) {
  const { t } = useI18n();
  const lesson = LESSONS[lessonIndex];
  const isFirst = lessonIndex === 0;
  const isLast = lessonIndex === LESSONS.length - 1;

  return (
    <ScreenShell title={t(lesson.titleKey)} onBack={onBack}>
      <div style={{ padding: '4px 16px 16px' }}>
        {/* Lesson header card */}
        <div style={{
          padding: 16, borderRadius: 16, marginBottom: 16,
          background: 'linear-gradient(135deg, rgba(201,169,97,0.2) 0%, rgba(13,59,46,0.3) 100%)',
          border: '1px solid rgba(201,169,97,0.3)',
          display: 'flex', alignItems: 'center', gap: 14,
        }}>
          <div style={{
            width: 56, height: 56, borderRadius: 16,
            background: 'rgba(201,169,97,0.25)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 30, flexShrink: 0,
          }}>{lesson.icon}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, color: '#c9a961', fontWeight: 700, letterSpacing: 1, marginBottom: 2 }}>
              {t('learn').toUpperCase()} · {String(lessonIndex + 1).padStart(2, '0')} {t('ofN')} {String(LESSONS.length).padStart(2, '0')}
            </div>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#f5efdf', marginBottom: 2 }}>
              {t(lesson.titleKey)}
            </div>
            <div style={{ fontSize: 12, color: 'rgba(245,239,223,0.7)' }}>
              {t(lesson.subKey)}
            </div>
          </div>
        </div>

        {/* Sections */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {lesson.sections.map((s, i) => (
            <LessonSection key={i} index={i + 1} section={s} />
          ))}
        </div>

        {/* Nav */}
        <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
          <button
            onClick={() => !isFirst && onLessonChange(lessonIndex - 1)}
            disabled={isFirst}
            style={{
              flex: 1, padding: '14px 18px', borderRadius: 14,
              background: 'rgba(245,239,223,0.06)',
              border: '1px solid rgba(201,169,97,0.25)',
              color: isFirst ? 'rgba(245,239,223,0.3)' : '#f5efdf',
              fontWeight: 600, fontSize: 14,
              cursor: isFirst ? 'default' : 'pointer',
              opacity: isFirst ? 0.5 : 1,
              fontFamily: 'inherit',
            }}>← {t('prev')}</button>
          <button
            onClick={() => isLast ? onBack() : onLessonChange(lessonIndex + 1)}
            style={{
              flex: 1.4, padding: '14px 18px', borderRadius: 14,
              background: 'linear-gradient(180deg, #c9a961 0%, #a88a45 100%)',
              border: '1px solid rgba(255,255,255,0.25)',
              color: '#1f2937', fontWeight: 700, fontSize: 14,
              cursor: 'pointer',
              boxShadow: '0 6px 18px rgba(201,169,97,0.3)',
              fontFamily: 'inherit',
            }}>{isLast ? t('done') : t('next')} →</button>
        </div>
      </div>
    </ScreenShell>
  );
}

function LessonSection({ index, section }) {
  const { t } = useI18n();
  return (
    <div style={{
      padding: 16, borderRadius: 14,
      background: 'rgba(245,239,223,0.04)',
      border: '1px solid rgba(201,169,97,0.15)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <div style={{
          width: 22, height: 22, borderRadius: 7,
          background: 'rgba(201,169,97,0.2)',
          color: '#c9a961',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 700,
        }}>{index}</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#f5efdf' }}>
          {t(section.headKey)}
        </div>
      </div>
      <div style={{
        fontSize: 13, lineHeight: 1.6, color: 'rgba(245,239,223,0.85)',
        textWrap: 'pretty', marginBottom: section.visual ? 12 : 0,
      }}>
        {t(section.bodyKey)}
      </div>
      {section.visual && <Visual kind={section.visual} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Visuals — small inline diagrams
// ─────────────────────────────────────────────────────────────
function Visual({ kind }) {
  if (kind === 'compass') return <CompassVisual />;
  if (kind === 'suits') return <SuitsVisual />;
  if (kind === 'honors') return <HonorsVisual />;
  if (kind === 'reading') return <ReadingVisual />;
  if (kind === 'structure') return <StructureVisual />;
  if (kind === 'pung') return <SetVisual tiles={[['dot',5],['dot',5],['dot',5]]} />;
  if (kind === 'kong') return <SetVisual tiles={[['bam',7],['bam',7],['bam',7],['bam',7]]} />;
  if (kind === 'chow') return <SetVisual tiles={[['char',3],['char',4],['char',5]]} />;
  if (kind === 'pair') return <SetVisual tiles={[['dot',9],['dot',9]]} />;
  if (kind === 'priority') return <PriorityVisual />;
  if (kind === 'jing') return <JingVisual />;
  if (kind === 'fanList') return <FanListVisual />;
  if (kind === 'thirteen') return <ThirteenVisual />;
  return null;
}

// Mini tile renderer (smaller than the main Tile component, for diagrams)
function MiniTile({ suit, value, dim = false, accent = false, jing = false }) {
  const SUIT_LABELS = {
    bam: { en: 'BAM', zh: '条' },
    char: { en: 'CHA', zh: '万' },
    dot: { en: 'DOT', zh: '筒' },
  };
  const HONORS = {
    east: { ch: '东', en: 'E' }, south: { ch: '南', en: 'S' },
    west: { ch: '西', en: 'W' }, north: { ch: '北', en: 'N' },
    red: { ch: '中', en: 'R' }, green: { ch: '发', en: 'G' }, white: { ch: '白', en: 'W' },
  };

  const isHonor = !['bam', 'char', 'dot'].includes(suit);
  const honor = isHonor ? HONORS[suit] : null;
  const display = isHonor
    ? honor?.ch
    : (suit === 'char' ? ['一','二','三','四','五','六','七','八','九'][value - 1] : value);

  const honorColor = suit === 'red' ? '#d44b4d' : suit === 'green' ? '#3a8a5a' : '#1f2937';

  return (
    <div style={{
      width: 36, height: 48, borderRadius: 6,
      background: jing
        ? 'linear-gradient(180deg, #f5e8b8 0%, #e0c878 100%)'
        : 'linear-gradient(180deg, #f5efdf 0%, #e8dfc4 100%)',
      border: jing ? '2px solid #c9a961' : '1px solid #b8a878',
      boxShadow: accent
        ? '0 0 0 2px #c9a961, 0 4px 12px rgba(201,169,97,0.4)'
        : '0 1px 3px rgba(0,0,0,0.3)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
      opacity: dim ? 0.4 : 1,
      position: 'relative',
    }}>
      <div style={{
        fontSize: isHonor ? 16 : 18, fontWeight: 700,
        fontFamily: 'Noto Serif SC, serif',
        color: isHonor ? honorColor : (suit === 'bam' ? '#3a8a5a' : suit === 'dot' ? '#1f5fa8' : '#1f2937'),
        lineHeight: 1,
      }}>{display}</div>
      <div style={{
        fontSize: 7, fontWeight: 700, color: '#6b6450',
        letterSpacing: 0.3, marginTop: 2,
      }}>
        {isHonor ? honor?.en : `${value}${SUIT_LABELS[suit]?.en?.[0] || ''}`}
      </div>
      {jing && (
        <div style={{
          position: 'absolute', top: -4, right: -4,
          width: 14, height: 14, borderRadius: 999,
          background: '#c9a961', color: '#1f2937',
          fontSize: 8, fontWeight: 800,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'Noto Serif SC, serif',
          border: '1px solid #f5efdf',
        }}>精</div>
      )}
    </div>
  );
}

function CompassVisual() {
  const seats = [
    { dir: 'N', ch: '北', x: '50%', y: '8%' },
    { dir: 'E', ch: '东', x: '92%', y: '50%', dealer: true },
    { dir: 'S', ch: '南', x: '50%', y: '92%' },
    { dir: 'W', ch: '西', x: '8%', y: '50%' },
  ];
  return (
    <div style={{
      position: 'relative', height: 160, borderRadius: 12,
      background: 'radial-gradient(ellipse at center, rgba(13,59,46,0.6) 0%, rgba(8,30,23,0.4) 100%)',
      border: '1px solid rgba(201,169,97,0.2)',
      overflow: 'hidden',
    }}>
      {seats.map(s => (
        <div key={s.dir} style={{
          position: 'absolute', left: s.x, top: s.y,
          transform: 'translate(-50%, -50%)',
          width: 50, height: 50, borderRadius: 12,
          background: s.dealer ? 'rgba(201,169,97,0.25)' : 'rgba(245,239,223,0.06)',
          border: s.dealer ? '1.5px solid #c9a961' : '1px solid rgba(201,169,97,0.2)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            fontSize: 18, fontFamily: 'Noto Serif SC, serif',
            color: s.dealer ? '#c9a961' : '#f5efdf', fontWeight: 700,
          }}>{s.ch}</div>
          <div style={{ fontSize: 9, color: 'rgba(245,239,223,0.6)', fontWeight: 700 }}>{s.dir}</div>
        </div>
      ))}
      <div style={{
        position: 'absolute', left: '50%', top: '50%',
        transform: 'translate(-50%, -50%)',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 16, color: '#c9a961', marginBottom: 2 }}>↺</div>
        <div style={{ fontSize: 9, color: 'rgba(245,239,223,0.6)', fontWeight: 700, letterSpacing: 0.5 }}>
          COUNTER-<br/>CLOCKWISE
        </div>
      </div>
      {/* Dealer badge */}
      <div style={{
        position: 'absolute', right: 8, top: 8,
        fontSize: 9, padding: '3px 7px', borderRadius: 999,
        background: 'rgba(201,169,97,0.2)', color: '#c9a961',
        border: '1px solid rgba(201,169,97,0.4)',
        fontWeight: 700, letterSpacing: 0.5,
      }}>EAST = DEALER</div>
    </div>
  );
}

function SuitsVisual() {
  const rows = [
    { name: 'Bamboos · 条', tiles: [['bam',1],['bam',5],['bam',9]] },
    { name: 'Characters · 万', tiles: [['char',1],['char',5],['char',9]] },
    { name: 'Dots · 筒', tiles: [['dot',1],['dot',5],['dot',9]] },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {rows.map(r => (
        <div key={r.name} style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: 10, borderRadius: 10,
          background: 'rgba(8,30,23,0.5)',
          border: '1px solid rgba(201,169,97,0.15)',
        }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {r.tiles.map((t, i) => <MiniTile key={i} suit={t[0]} value={t[1]} />)}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#f5efdf' }}>{r.name}</div>
            <div style={{ fontSize: 10, color: 'rgba(245,239,223,0.55)' }}>1 → 9 · ×4 each</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function HonorsVisual() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{
        padding: 10, borderRadius: 10,
        background: 'rgba(8,30,23,0.5)',
        border: '1px solid rgba(201,169,97,0.15)',
      }}>
        <div style={{ fontSize: 11, color: 'rgba(245,239,223,0.6)', fontWeight: 700, marginBottom: 6, letterSpacing: 0.5 }}>WINDS · 风</div>
        <div style={{ display: 'flex', gap: 4 }}>
          <MiniTile suit="east" /><MiniTile suit="south" /><MiniTile suit="west" /><MiniTile suit="north" />
        </div>
      </div>
      <div style={{
        padding: 10, borderRadius: 10,
        background: 'rgba(8,30,23,0.5)',
        border: '1px solid rgba(201,169,97,0.15)',
      }}>
        <div style={{ fontSize: 11, color: 'rgba(245,239,223,0.6)', fontWeight: 700, marginBottom: 6, letterSpacing: 0.5 }}>DRAGONS · 元</div>
        <div style={{ display: 'flex', gap: 4 }}>
          <MiniTile suit="red" /><MiniTile suit="green" /><MiniTile suit="white" />
        </div>
      </div>
    </div>
  );
}

function ReadingVisual() {
  return (
    <div style={{
      padding: 14, borderRadius: 12,
      background: 'rgba(8,30,23,0.5)',
      border: '1px solid rgba(201,169,97,0.15)',
      display: 'flex', alignItems: 'center', gap: 18,
    }}>
      <div style={{ transform: 'scale(1.6)', transformOrigin: 'left center' }}>
        <MiniTile suit="bam" value={5} />
      </div>
      <div style={{ flex: 1, fontSize: 11, lineHeight: 1.6, color: 'rgba(245,239,223,0.85)' }}>
        <div><span style={{ color: '#c9a961', fontWeight: 700 }}>五</span> — Chinese numeral</div>
        <div><span style={{ color: '#c9a961', fontWeight: 700 }}>5BAM</span> — English label</div>
        <div style={{ marginTop: 4, opacity: 0.7 }}>"5 of Bamboos"</div>
      </div>
    </div>
  );
}

function StructureVisual() {
  return (
    <div style={{
      padding: 12, borderRadius: 12,
      background: 'rgba(8,30,23,0.5)',
      border: '1px solid rgba(201,169,97,0.15)',
    }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        {/* Set 1 — pung */}
        <div style={{ display: 'flex', gap: 2, padding: 4, borderRadius: 6, background: 'rgba(201,169,97,0.1)' }}>
          <MiniTile suit="dot" value={3} /><MiniTile suit="dot" value={3} /><MiniTile suit="dot" value={3} />
        </div>
        {/* Set 2 — chow */}
        <div style={{ display: 'flex', gap: 2, padding: 4, borderRadius: 6, background: 'rgba(201,169,97,0.1)' }}>
          <MiniTile suit="bam" value={4} /><MiniTile suit="bam" value={5} /><MiniTile suit="bam" value={6} />
        </div>
        {/* Set 3 — chow */}
        <div style={{ display: 'flex', gap: 2, padding: 4, borderRadius: 6, background: 'rgba(201,169,97,0.1)' }}>
          <MiniTile suit="char" value={2} /><MiniTile suit="char" value={3} /><MiniTile suit="char" value={4} />
        </div>
        {/* Set 4 — pung */}
        <div style={{ display: 'flex', gap: 2, padding: 4, borderRadius: 6, background: 'rgba(201,169,97,0.1)' }}>
          <MiniTile suit="east" /><MiniTile suit="east" /><MiniTile suit="east" />
        </div>
        {/* Pair */}
        <div style={{ display: 'flex', gap: 2, padding: 4, borderRadius: 6, background: 'rgba(212,103,105,0.15)', border: '1px dashed rgba(212,103,105,0.4)' }}>
          <MiniTile suit="red" /><MiniTile suit="red" />
        </div>
      </div>
      <div style={{ fontSize: 10, color: 'rgba(245,239,223,0.6)', textAlign: 'center' }}>
        4 sets <span style={{ color: '#c9a961' }}>+</span> 1 pair = 14 tiles
      </div>
    </div>
  );
}

function SetVisual({ tiles }) {
  return (
    <div style={{
      display: 'flex', gap: 4, padding: 12, borderRadius: 12,
      background: 'rgba(8,30,23,0.5)',
      border: '1px solid rgba(201,169,97,0.15)',
      justifyContent: 'center',
    }}>
      {tiles.map((tt, i) => <MiniTile key={i} suit={tt[0]} value={tt[1]} />)}
    </div>
  );
}

function PriorityVisual() {
  const { t } = useI18n();
  const items = [
    { label: t('hu'), color: '#e98890', bg: 'rgba(212,103,105,0.18)' },
    { label: t('kong'), color: '#d8b878', bg: 'rgba(201,169,97,0.18)' },
    { label: t('pung'), color: '#7fcfa8', bg: 'rgba(94,179,134,0.18)' },
    { label: t('chow'), color: '#9ab8d8', bg: 'rgba(80,130,180,0.18)' },
  ];
  return (
    <div style={{
      padding: 12, borderRadius: 12,
      background: 'rgba(8,30,23,0.5)',
      border: '1px solid rgba(201,169,97,0.15)',
      display: 'flex', alignItems: 'center', gap: 6,
      justifyContent: 'space-between',
    }}>
      {items.map((it, i) => (
        <React.Fragment key={i}>
          <div style={{
            flex: 1, padding: '8px 4px', borderRadius: 8,
            background: it.bg,
            border: `1px solid ${it.color}40`,
            color: it.color, fontWeight: 700, fontSize: 13,
            textAlign: 'center', position: 'relative',
          }}>
            {it.label}
            <div style={{ fontSize: 8, opacity: 0.7, marginTop: 1 }}>#{i + 1}</div>
          </div>
          {i < items.length - 1 && <div style={{ color: 'rgba(245,239,223,0.4)', fontSize: 14 }}>›</div>}
        </React.Fragment>
      ))}
    </div>
  );
}

function JingVisual() {
  const { t } = useI18n();
  return (
    <div style={{
      padding: 14, borderRadius: 12,
      background: 'radial-gradient(ellipse at top, rgba(201,169,97,0.2) 0%, rgba(8,30,23,0.6) 70%)',
      border: '1px solid rgba(201,169,97,0.3)',
    }}>
      <div style={{ fontSize: 10, color: '#c9a961', fontWeight: 700, letterSpacing: 1, marginBottom: 8, textAlign: 'center' }}>
        {t('tonightJing').toUpperCase()}
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 18, alignItems: 'center', marginBottom: 12 }}>
        <div style={{ transform: 'scale(1.4)' }}>
          <MiniTile suit="bam" value={7} jing />
        </div>
        <div style={{ fontSize: 22, color: '#c9a961' }}>→</div>
        <div style={{ fontSize: 10, color: 'rgba(245,239,223,0.7)', maxWidth: 90, lineHeight: 1.4 }}>
          Acts as ANY tile in your hand
        </div>
      </div>
      <div style={{
        padding: 10, borderRadius: 8, background: 'rgba(8,30,23,0.6)',
        border: '1px solid rgba(201,169,97,0.15)',
      }}>
        <div style={{ fontSize: 9, color: 'rgba(245,239,223,0.5)', fontWeight: 700, marginBottom: 6, letterSpacing: 0.5 }}>
          EXAMPLE — JING SUBSTITUTES FOR 6 OF BAM
        </div>
        <div style={{ display: 'flex', gap: 3, justifyContent: 'center' }}>
          <MiniTile suit="bam" value={4} />
          <MiniTile suit="bam" value={5} />
          <MiniTile suit="bam" value={7} jing />
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 9, color: '#c9a961', padding: '0 4px',
          }}>=</div>
          <MiniTile suit="bam" value={4} />
          <MiniTile suit="bam" value={5} />
          <MiniTile suit="bam" value={6} accent />
        </div>
      </div>
    </div>
  );
}

function FanListVisual() {
  const items = [
    { name: 'All Pungs · 碰碰胡', fan: '+2' },
    { name: 'One Suit · 清一色', fan: '+6' },
    { name: 'Mixed Suit · 混一色', fan: '+3' },
    { name: 'Self-Drawn · 自摸', fan: '+1' },
    { name: 'Last Tile · 海底捞月', fan: '+1' },
  ];
  return (
    <div style={{
      padding: 6, borderRadius: 12,
      background: 'rgba(8,30,23,0.5)',
      border: '1px solid rgba(201,169,97,0.15)',
    }}>
      {items.map((it, i) => (
        <div key={i} style={{
          padding: '8px 10px', display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', borderBottom: i < items.length - 1 ? '1px solid rgba(201,169,97,0.1)' : 'none',
        }}>
          <span style={{ fontSize: 12, color: '#f5efdf' }}>{it.name}</span>
          <span style={{
            fontSize: 11, padding: '2px 8px', borderRadius: 999,
            background: 'rgba(201,169,97,0.2)', color: '#c9a961',
            fontWeight: 700,
          }}>{it.fan}</span>
        </div>
      ))}
    </div>
  );
}

function ThirteenVisual() {
  // 1 and 9 of each suit (6 tiles), 4 winds, 3 dragons (7 tiles), + one duplicate
  const tiles = [
    ['bam', 1], ['bam', 9],
    ['char', 1], ['char', 9],
    ['dot', 1], ['dot', 9],
    ['east', null], ['south', null], ['west', null], ['north', null],
    ['red', null], ['green', null], ['white', null],
    ['bam', 1], // duplicate
  ];
  return (
    <div style={{
      padding: 10, borderRadius: 12,
      background: 'rgba(8,30,23,0.5)',
      border: '1px solid rgba(201,169,97,0.15)',
    }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, justifyContent: 'center' }}>
        {tiles.map((tt, i) => (
          <MiniTile key={i} suit={tt[0]} value={tt[1]} accent={i === tiles.length - 1} />
        ))}
      </div>
      <div style={{ fontSize: 10, color: 'rgba(245,239,223,0.6)', textAlign: 'center', marginTop: 8 }}>
        13 unique terminals/honors + any one duplicate
      </div>
    </div>
  );
}

Object.assign(window, { LearnScreen });
