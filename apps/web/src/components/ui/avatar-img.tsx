import { useState } from 'react';
import { API_BASE } from '../../lib/api';

// Playable tiles, excluding Haku (blank white dragon), Dora variants, and utility tiles.
const AVATAR_TILES = [
  'Man1',
  'Man2',
  'Man3',
  'Man4',
  'Man5',
  'Man6',
  'Man7',
  'Man8',
  'Man9',
  'Pin1',
  'Pin2',
  'Pin3',
  'Pin4',
  'Pin5',
  'Pin6',
  'Pin7',
  'Pin8',
  'Pin9',
  'Sou1',
  'Sou2',
  'Sou3',
  'Sou4',
  'Sou5',
  'Sou6',
  'Sou7',
  'Sou8',
  'Sou9',
  'Ton',
  'Nan',
  'Shaa',
  'Pei',
  'Hatsu',
  'Chun',
] as const;

function djb2(str: string): number {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) ^ str.charCodeAt(i);
    h = h >>> 0;
  }
  return h;
}

export function seededTile(seed: string): string {
  return AVATAR_TILES[djb2(seed || 'default') % AVATAR_TILES.length];
}

interface AvatarImgProps {
  avatarUrl?: string | null;
  /** User's sub (UUID) — deterministically selects the default tile. */
  seed: string;
  size?: number;
  className?: string;
}

/**
 * Round avatar — shows the uploaded photo or a seeded mahjong tile on a gold background.
 * Handles load errors gracefully: falls back to the tile if the photo URL fails.
 */
export function AvatarImg({ avatarUrl, seed, size = 40, className = '' }: AvatarImgProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const tile = seededTile(seed);

  // API paths (/users/…/avatar) are proxied through the API host.
  // Static bot avatars (/avatars/bots/…) are served from the web origin directly.
  const resolvedUrl = avatarUrl?.startsWith('/users/') ? `${API_BASE}${avatarUrl}` : avatarUrl;

  return (
    <div
      className={className}
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        overflow: 'hidden',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #c9a961 0%, #a07830 100%)',
      }}
    >
      {resolvedUrl && !imgFailed ? (
        <img
          src={resolvedUrl}
          alt=""
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          onError={() => setImgFailed(true)}
          draggable={false}
        />
      ) : (
        <img
          src={`/textures/Tiles/Regular/${tile}.svg`}
          alt=""
          style={{ width: '88%', height: '88%', objectFit: 'contain' }}
          draggable={false}
        />
      )}
    </div>
  );
}
