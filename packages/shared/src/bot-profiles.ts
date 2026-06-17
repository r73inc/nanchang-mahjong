/** One of the three named bot personas available in the game. */
export interface BotProfile {
  readonly id: string;
  readonly name: string;
  /** Static web-asset path served from the web origin (not the API). */
  readonly avatarPath: string;
}

/**
 * The three predefined bot personas. When a host adds bots to a room each
 * seat draws from this list without repetition, so no two bots share a face.
 */
export const BOT_PROFILES: readonly BotProfile[] = [
  { id: 'milkybot', name: 'MilkyBot', avatarPath: '/avatars/bots/MilkyBot.jpg' },
  { id: 'melonbot', name: 'MelonBot', avatarPath: '/avatars/bots/MelonBot.jpg' },
  { id: 'fifthbot', name: 'FifthBot', avatarPath: '/avatars/bots/FifthBot.jpg' },
  { id: 'oraclebot', name: 'OracleBot', avatarPath: '/avatars/bots/OracleBot.jpg' },
];
