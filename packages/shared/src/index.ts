export * from './auth.schemas';
export * from './bot-profiles';
export * from './room.schemas';
export * from './game.events';
export * from './replay.types';
export * from './tile-map';

// Re-export engine helpers useful in frontend without adding engine as a direct web dep
export {
  decomposeHand,
  decomposeConcealed,
  concealedKongOptions,
  addToKongOptions,
  sortTypes,
  WIND_CHOWS,
  DRAGON_CHOW,
} from '@nanchang/engine';
export type { Decomposition } from '@nanchang/engine';

export const SHARED_VERSION = '0.0.1';
