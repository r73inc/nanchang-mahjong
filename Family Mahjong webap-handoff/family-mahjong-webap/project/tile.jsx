// Mahjong tile component — traditional ivory face with Chinese + English assist label.
// All faces are drawn with simple typography + tiny SVG marks (dots/bamboo), no copyrighted art.

const TILE_DATA = {
  // Bamboo (索/條) — 1-9
  b1: { ch: '一索', en: '1 BAM', kind: 'bam', n: 1 },
  b2: { ch: '二索', en: '2 BAM', kind: 'bam', n: 2 },
  b3: { ch: '三索', en: '3 BAM', kind: 'bam', n: 3 },
  b4: { ch: '四索', en: '4 BAM', kind: 'bam', n: 4 },
  b5: { ch: '五索', en: '5 BAM', kind: 'bam', n: 5 },
  b6: { ch: '六索', en: '6 BAM', kind: 'bam', n: 6 },
  b7: { ch: '七索', en: '7 BAM', kind: 'bam', n: 7 },
  b8: { ch: '八索', en: '8 BAM', kind: 'bam', n: 8 },
  b9: { ch: '九索', en: '9 BAM', kind: 'bam', n: 9 },
  // Dots (筒) — 1-9
  d1: { ch: '一筒', en: '1 DOT', kind: 'dot', n: 1 },
  d2: { ch: '二筒', en: '2 DOT', kind: 'dot', n: 2 },
  d3: { ch: '三筒', en: '3 DOT', kind: 'dot', n: 3 },
  d4: { ch: '四筒', en: '4 DOT', kind: 'dot', n: 4 },
  d5: { ch: '五筒', en: '5 DOT', kind: 'dot', n: 5 },
  d6: { ch: '六筒', en: '6 DOT', kind: 'dot', n: 6 },
  d7: { ch: '七筒', en: '7 DOT', kind: 'dot', n: 7 },
  d8: { ch: '八筒', en: '8 DOT', kind: 'dot', n: 8 },
  d9: { ch: '九筒', en: '9 DOT', kind: 'dot', n: 9 },
  // Characters (萬) — 1-9
  c1: { ch: '一萬', en: '1 CHAR', kind: 'char', n: 1 },
  c2: { ch: '二萬', en: '2 CHAR', kind: 'char', n: 2 },
  c3: { ch: '三萬', en: '3 CHAR', kind: 'char', n: 3 },
  c4: { ch: '四萬', en: '4 CHAR', kind: 'char', n: 4 },
  c5: { ch: '五萬', en: '5 CHAR', kind: 'char', n: 5 },
  c6: { ch: '六萬', en: '6 CHAR', kind: 'char', n: 6 },
  c7: { ch: '七萬', en: '7 CHAR', kind: 'char', n: 7 },
  c8: { ch: '八萬', en: '8 CHAR', kind: 'char', n: 8 },
  c9: { ch: '九萬', en: '9 CHAR', kind: 'char', n: 9 },
  // Winds
  we: { ch: '東', en: 'EAST', kind: 'wind' },
  ws: { ch: '南', en: 'SOUTH', kind: 'wind' },
  ww: { ch: '西', en: 'WEST', kind: 'wind' },
  wn: { ch: '北', en: 'NORTH', kind: 'wind' },
  // Dragons
  dr: { ch: '中', en: 'RED', kind: 'dragon', color: '#c0392b' },
  dg: { ch: '發', en: 'GREEN', kind: 'dragon', color: '#1f7a4d' },
  dw: { ch: '白', en: 'WHITE', kind: 'dragon', color: '#1f2937' },
};

// Renders the dot pattern (筒) — uses concentric circles
function DotPattern({ n, color = '#1f7a4d', accent = '#c0392b' }) {
  // arrangement positions (col, row) on a 3x3 grid (0-indexed)
  const layouts = {
    1: [[1,1]],
    2: [[1,0],[1,2]],
    3: [[0,0],[1,1],[2,2]],
    4: [[0,0],[2,0],[0,2],[2,2]],
    5: [[0,0],[2,0],[1,1],[0,2],[2,2]],
    6: [[0,0],[2,0],[0,1],[2,1],[0,2],[2,2]],
    7: [[0,0],[1,0],[2,0],[1,1],[0,2],[1,2],[2,2]],
    8: [[0,0],[2,0],[0,1],[1,1],[2,1],[0,2],[1,2],[2,2]],
    9: [[0,0],[1,0],[2,0],[0,1],[1,1],[2,1],[0,2],[1,2],[2,2]],
  };
  const dots = layouts[n] || [];
  return (
    <svg viewBox="0 0 60 80" style={{ width: '100%', height: '100%' }}>
      {dots.map(([cx, cy], i) => {
        const x = 12 + cx * 18;
        const y = 16 + cy * 24;
        // alternate ring colors for visual rhythm (1-dot is red, 5-dot center red)
        const isRed = (n === 1) || (n === 5 && cx === 1 && cy === 1);
        const c = isRed ? accent : color;
        return (
          <g key={i}>
            <circle cx={x} cy={y} r="7" fill="none" stroke={c} strokeWidth="1.6" />
            <circle cx={x} cy={y} r="3.2" fill={c} />
          </g>
        );
      })}
    </svg>
  );
}

// Bamboo pattern — vertical sticks with banding. 1-bam is a bird (drawn as stylized leaf)
function BamPattern({ n, color = '#1f7a4d', accent = '#c0392b' }) {
  if (n === 1) {
    // stylized bird/peacock — abstract leaf shape
    return (
      <svg viewBox="0 0 60 80" style={{ width: '100%', height: '100%' }}>
        <ellipse cx="30" cy="44" rx="16" ry="22" fill="none" stroke={accent} strokeWidth="2.5" />
        <path d="M30 22 Q34 30 30 38 Q26 30 30 22 Z" fill={accent} />
        <circle cx="30" cy="44" r="4" fill={accent} />
        <path d="M22 56 L30 64 L38 56" stroke={accent} strokeWidth="2" fill="none" strokeLinecap="round" />
      </svg>
    );
  }
  // bamboo stick component
  const Stick = ({ x, y, c }) => (
    <g>
      <rect x={x-2.5} y={y} width="5" height="20" rx="2" fill={c} />
      <rect x={x-3.5} y={y+8.5} width="7" height="3" fill="#fff" />
    </g>
  );
  // arrangement: rows of sticks
  const layouts = {
    2: [[30,18],[30,42]],
    3: [[20,30],[30,30],[40,30]],
    4: [[20,18],[40,18],[20,42],[40,42]],
    5: [[20,12],[40,12],[30,30],[20,48],[40,48]],
    6: [[18,18],[30,18],[42,18],[18,42],[30,42],[42,42]],
    7: [[30,12],[18,30],[30,30],[42,30],[18,48],[30,48],[42,48]],
    8: [[18,12],[30,12],[42,12],[24,32],[36,32],[18,52],[30,52],[42,52]],
    9: [[18,12],[30,12],[42,12],[18,32],[30,32],[42,32],[18,52],[30,52],[42,52]],
  };
  const sticks = layouts[n] || [];
  return (
    <svg viewBox="0 0 60 80" style={{ width: '100%', height: '100%' }}>
      {sticks.map(([x,y], i) => {
        // top row sometimes red for visual interest (esp. n=8 middle row)
        const isAccent = (n === 8 && y === 32) || (n === 5 && i === 2);
        return <Stick key={i} x={x} y={y} c={isAccent ? accent : color} />;
      })}
    </svg>
  );
}

function MahjongTile({
  id,            // tile id like 'b3', 'we', 'dr'; or 'back' for face-down
  size = 'md',   // sm | md | lg | xl
  faceColor = '#f5efdf',
  edgeColor = '#d8cfb3',
  inkColor = '#1f2937',
  redInk = '#c0392b',
  greenInk = '#1f7a4d',
  backColor = '#0d3b2e',
  backAccent = '#c9a961',
  selected = false,
  dimmed = false,
  rotation = 0,   // 0 | 90 | 180 | 270
  showEnglish = true,
  style = {},
  onPointerDown,
  onClick,
}) {
  const sizes = {
    xs: { w: 18, h: 26, ch: 9, en: 5 },
    tn: { w: 22, h: 30, ch: 11, en: 6 },
    sm: { w: 30, h: 40, ch: 13, en: 7 },
    md: { w: 40, h: 54, ch: 18, en: 8 },
    lg: { w: 54, h: 72, ch: 24, en: 10 },
    xl: { w: 68, h: 92, ch: 30, en: 12 },
  };
  const S = sizes[size] || sizes.md;
  const data = TILE_DATA[id];

  if (id === 'back') {
    return (
      <div
        onPointerDown={onPointerDown}
        onClick={onClick}
        style={{
          width: S.w, height: S.h, borderRadius: 6,
          background: `linear-gradient(160deg, ${backColor} 0%, ${backColor} 60%, oklch(from ${backColor} calc(l * 0.85) c h) 100%)`,
          boxShadow: 'inset 0 -3px 0 rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.08), 0 2px 4px rgba(0,0,0,0.25)',
          position: 'relative', flexShrink: 0,
          transform: `rotate(${rotation}deg)`,
          ...style,
        }}>
        <div style={{
          position: 'absolute', inset: 4, borderRadius: 4,
          border: `1.5px solid ${backAccent}`, opacity: 0.6,
        }} />
        <div style={{
          position: 'absolute', inset: 0, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          color: backAccent, fontFamily: 'serif', fontSize: S.w * 0.5,
          opacity: 0.7,
        }}>麻</div>
      </div>
    );
  }

  if (!data) return null;

  // determine ink color for the character
  let charColor = inkColor;
  if (data.kind === 'char') charColor = redInk;
  else if (data.kind === 'bam' && data.n === 1) charColor = redInk;
  else if (data.kind === 'dragon') charColor = data.color;
  else if (data.kind === 'dot') charColor = inkColor;

  return (
    <div
      onPointerDown={onPointerDown}
      onClick={onClick}
      style={{
        width: S.w, height: S.h, borderRadius: 6,
        background: `linear-gradient(165deg, #fffbeb 0%, ${faceColor} 55%, ${edgeColor} 100%)`,
        boxShadow: selected
          ? `inset 0 -2px 0 rgba(0,0,0,0.08), 0 0 0 2px #c9a961, 0 6px 14px rgba(201,169,97,0.35)`
          : `inset 0 -3px 0 rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.6), 0 2px 4px rgba(0,0,0,0.18)`,
        position: 'relative', flexShrink: 0,
        transform: `rotate(${rotation}deg) ${selected ? 'translateY(-4px)' : ''}`,
        opacity: dimmed ? 0.45 : 1,
        transition: 'transform 0.12s ease, box-shadow 0.12s ease, opacity 0.15s ease',
        cursor: onPointerDown || onClick ? 'grab' : 'default',
        userSelect: 'none', touchAction: 'none',
        ...style,
      }}>
      {/* face inner border */}
      <div style={{
        position: 'absolute', inset: 3, borderRadius: 4,
        border: '1px solid rgba(0,0,0,0.06)',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: '4px 2px',
      }}>
        {/* main symbol area */}
        <div style={{
          flex: 1, width: '100%', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          minHeight: 0,
        }}>
          {data.kind === 'dot' && (
            <DotPattern n={data.n} color={greenInk} accent={redInk} />
          )}
          {data.kind === 'bam' && (
            <BamPattern n={data.n} color={greenInk} accent={redInk} />
          )}
          {data.kind === 'char' && (
            <div style={{
              fontFamily: 'serif', fontWeight: 700, color: charColor,
              fontSize: S.ch, lineHeight: 1, textAlign: 'center',
            }}>
              <div style={{ fontSize: S.ch * 0.78, color: inkColor, marginBottom: S.h * 0.04 }}>
                {data.n}
              </div>
              <div>萬</div>
            </div>
          )}
          {data.kind === 'wind' && (
            <div style={{
              fontFamily: 'serif', fontWeight: 700, color: inkColor,
              fontSize: S.ch * 1.4, lineHeight: 1,
            }}>{data.ch}</div>
          )}
          {data.kind === 'dragon' && (
            <div style={{
              fontFamily: 'serif', fontWeight: 800, color: data.color,
              fontSize: S.ch * 1.4, lineHeight: 1,
              textShadow: data.en === 'WHITE' ? '0 0 0 transparent' : 'none',
              border: data.en === 'WHITE' ? `2px solid ${data.color}` : 'none',
              padding: data.en === 'WHITE' ? '2px 6px' : 0,
              borderRadius: 3,
            }}>{data.ch}</div>
          )}
        </div>
        {/* English assist label */}
        {showEnglish && (
          <div style={{
            fontSize: S.en, fontWeight: 600, color: 'rgba(31,41,55,0.55)',
            fontFamily: 'ui-monospace, Menlo, monospace', letterSpacing: 0.5,
            marginTop: 1, lineHeight: 1,
          }}>{data.en}</div>
        )}
      </div>
    </div>
  );
}

// --- a hand row, useful in many places ---
function TileRow({ tiles, size = 'md', gap = 4, ...props }) {
  return (
    <div style={{ display: 'flex', gap, ...(props.style || {}) }}>
      {tiles.map((id, i) => (
        <MahjongTile key={i} id={id} size={size} />
      ))}
    </div>
  );
}

Object.assign(window, { MahjongTile, TileRow, TILE_DATA });
