import { Injectable } from '@nestjs/common';
import en from './locales/en.json';
import zh from './locales/zh.json';

export type SupportedLang = 'en' | 'zh';

type I18nKey = keyof typeof en;

const LOCALES: Record<SupportedLang, Record<string, string>> = { en, zh };

/**
 * Maps the raw English exception message strings thrown by service layer code
 * to their i18n key counterparts.  This lets us translate errors without
 * touching every `throw` statement in the codebase.
 */
const MESSAGE_TO_KEY: Record<string, I18nKey> = {
  // auth.service.ts
  'Handle is already taken': 'auth.handleAlreadyTaken',
  'Email is already registered': 'auth.emailAlreadyRegistered',
  'Email or handle already in use.': 'auth.emailOrHandleInUse',
  'Invalid email or password': 'auth.invalidCredentials',
  'Account not found': 'auth.invalidCredentials', // intentionally opaque
  'Account is disabled': 'auth.accountDisabled',
  'Current password is incorrect': 'auth.wrongCurrentPassword',
  'Invalid or expired refresh token': 'auth.invalidRefreshToken',
  'Invalid token type': 'auth.invalidRefreshToken',
  // invites.service.ts
  'Invite code not found': 'auth.inviteNotFound',
  'Invite code already used': 'auth.inviteAlreadyUsed',
  'Invite code has been revoked': 'auth.inviteInactive',
  'Invite code has expired': 'auth.inviteInactive',
  'Invite code is no longer valid': 'auth.inviteInactive',
  // admin.service.ts
  'Cannot change your own role': 'admin.cannotTargetSelf',
  'Cannot disable your own account': 'admin.cannotTargetSelf',
  'Cannot revoke: invite not found or already redeemed/revoked': 'admin.inviteNotRevokable',
  'expiresAt must be a future date': 'admin.expiresAtPast',
  // friends.service.ts
  'Cannot add yourself as a friend': 'friends.selfFriend',
  'Friend request already exists': 'friends.requestExists',
  'Friend request not found': 'friends.requestNotFound',
  'Not friends': 'friends.notFriends',
  // generic
  'An unexpected error occurred': 'common.error',
};

/**
 * Minimal server-side i18n service for Phase 2.
 *
 * Translates error messages thrown by the API based on the caller's
 * preferred language (resolved from the Accept-Language header).
 *
 * Future phases will extend this with email / push-notification copy.
 */
@Injectable()
export class I18nService {
  /** Resolve the preferred language from an Accept-Language header value. */
  parseLang(acceptLanguage: string | undefined): SupportedLang {
    if (!acceptLanguage) return 'en';
    const primary = acceptLanguage.split(',')[0]?.trim().slice(0, 2).toLowerCase();
    return primary === 'zh' ? 'zh' : 'en';
  }

  /**
   * Translate an English exception message to the target language.
   * Returns the original message if no translation is found (safe fallback).
   */
  translateMessage(message: string, lang: SupportedLang): string {
    const key = MESSAGE_TO_KEY[message];
    if (!key) return message;
    const k = key as string;
    return LOCALES[lang][k] ?? LOCALES.en[k] ?? message;
  }
}
