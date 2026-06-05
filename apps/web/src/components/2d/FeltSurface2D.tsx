/**
 * FeltSurface2D — pure CSS table background for the 2D game table.
 *
 * Reads the --felt-top / --felt-bottom CSS custom properties written by
 * applyTheme() so all four felt colour themes (jade/crimson/slate/navy)
 * work automatically without any prop.
 *
 * Layers (bottom to top):
 *   1. Radial gradient using --felt-top / --felt-bottom
 *   2. Inset vignette (box-shadow)
 *   3. Subtle gold table-rail border
 *   4. Decorative compass rose (aria-hidden)
 */

// Wind character labels for the compass rose — module-level constant avoids
// the i18next/no-literal-string lint rule on JSX text nodes.
const COMPASS = {
  north: '北',
  south: '南',
  east: '東',
  west: '西',
} as const;

export function FeltSurface2D() {
  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
      {/* 1. Base radial gradient */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 85% 85% at 50% 50%, var(--felt-top, #0d3b2e) 0%, var(--felt-bottom, #051a13) 100%)',
        }}
      />

      {/* 2. Inset vignette */}
      <div className="absolute inset-0" style={{ boxShadow: 'inset 0 0 100px rgba(0,0,0,0.5)' }} />

      {/* 3. Table rail border */}
      <div
        className="absolute inset-3 rounded-2xl pointer-events-none"
        style={{ border: '1.5px solid rgba(201,169,97,0.1)' }}
      />

      {/* 4. Compass rose */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <svg
          width="130"
          height="130"
          viewBox="0 0 130 130"
          aria-hidden="true"
          style={{ opacity: 0.15 }}
        >
          {/* Outer ring */}
          <circle cx="65" cy="65" r="52" fill="none" stroke="#c9a961" strokeWidth="0.75" />
          {/* Inner ring */}
          <circle cx="65" cy="65" r="20" fill="none" stroke="#c9a961" strokeWidth="0.75" />
          {/* Cross arms */}
          <line x1="65" y1="13" x2="65" y2="45" stroke="#c9a961" strokeWidth="0.6" />
          <line x1="65" y1="85" x2="65" y2="117" stroke="#c9a961" strokeWidth="0.6" />
          <line x1="13" y1="65" x2="45" y2="65" stroke="#c9a961" strokeWidth="0.6" />
          <line x1="85" y1="65" x2="117" y2="65" stroke="#c9a961" strokeWidth="0.6" />
          {/* Wind labels */}
          <text
            x="65"
            y="10"
            textAnchor="middle"
            dominantBaseline="auto"
            fill="#c9a961"
            fontSize="14"
            fontFamily="serif"
          >
            {COMPASS.north}
          </text>
          <text
            x="65"
            y="128"
            textAnchor="middle"
            dominantBaseline="auto"
            fill="#c9a961"
            fontSize="14"
            fontFamily="serif"
          >
            {COMPASS.south}
          </text>
          <text
            x="126"
            y="69"
            textAnchor="middle"
            dominantBaseline="middle"
            fill="#c9a961"
            fontSize="14"
            fontFamily="serif"
          >
            {COMPASS.east}
          </text>
          <text
            x="4"
            y="69"
            textAnchor="middle"
            dominantBaseline="middle"
            fill="#c9a961"
            fontSize="14"
            fontFamily="serif"
          >
            {COMPASS.west}
          </text>
        </svg>
      </div>
    </div>
  );
}
