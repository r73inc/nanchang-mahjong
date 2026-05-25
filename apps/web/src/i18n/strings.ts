/**
 * Phase 2: string types derived from the source-of-truth locale files.
 *
 * The STRINGS constant and StringEntry interface from Phase 1 have been replaced
 * by en.json / zh.json. This file re-exports just the types that consumers depend
 * on so existing imports stay unbroken.
 */

import type en from './en.json';

export type Lang = 'en' | 'zh';
export type StringKey = keyof typeof en;
