/**
 * Phase 1 string dictionary — inline EN/ZH pairs.
 *
 * Phase 2 will migrate this to react-i18next with separate JSON files,
 * a key-parity CI check, and the no-literal-string ESLint rule.
 * Until then, this single file is the source of truth for UI copy.
 */

export type Lang = 'en' | 'zh';

export interface StringEntry {
  en: string;
  zh: string;
}

export const STRINGS = {
  // ── Brand ──────────────────────────────────────────────────────────────────
  appName: { en: 'Nanchang Mahjong', zh: '南昌麻将' },
  appNameShort: { en: 'NANCHANG MAHJONG', zh: '南昌麻将' },

  // ── Lang toggle ────────────────────────────────────────────────────────────
  langEn: { en: 'EN', zh: 'EN' },
  langZh: { en: '中文', zh: '中文' },

  // ── Auth — shared ──────────────────────────────────────────────────────────
  signIn: { en: 'Sign In', zh: '登录' },
  signUp: { en: 'Create Account', zh: '注册账号' },
  email: { en: 'Email', zh: '邮箱' },
  emailPlaceholder: { en: 'you@example.com', zh: 'you@example.com' },
  password: { en: 'Password', zh: '密码' },
  passwordHint: { en: 'At least 8 characters', zh: '至少 8 位' },
  displayName: { en: 'Display name', zh: '昵称' },
  handle: { en: 'Handle', zh: '用户名' },
  handleHint: { en: 'Letters, numbers, _ and - only', zh: '字母、数字、_ 和 - 组成' },
  handlePlaceholder: { en: 'your_handle', zh: 'your_handle' },
  inviteCode: { en: 'Invite code', zh: '邀请码' },
  inviteCodeHint: { en: 'Ask your family member for a code', zh: '向家人获取邀请码' },
  forgotPassword: { en: 'Forgot password?', zh: '忘记密码?' },
  submitting: { en: 'Signing in…', zh: '登录中…' },
  submittingSignup: { en: 'Creating account…', zh: '注册中…' },

  // ── Forgot password ────────────────────────────────────────────────────────
  resetPassword: { en: 'Reset Password', zh: '找回密码' },
  resetPasswordDesc: {
    en: "Enter your account email — we'll send you a reset code.",
    zh: '输入你的邮箱地址，我们会发送验证码。',
  },
  sendResetCode: { en: 'Send reset code', zh: '发送验证码' },
  checkInbox: { en: 'Check your inbox', zh: '查看收件箱' },
  checkInboxDesc: {
    en: 'We sent a 6-digit reset code to %s. The code expires in 30 minutes.',
    zh: '我们已向 %s 发送了 6 位验证码，30 分钟内有效。',
  },
  backToSignIn: { en: 'Back to sign in', zh: '返回登录' },
  resendCode: { en: 'Resend', zh: '重新发送' },
  didntReceive: { en: "Didn't receive it?", zh: '未收到邮件?' },
  rememberedPassword: { en: 'Remembered your password?', zh: '想起密码了?' },

  // ── Confirm reset password ─────────────────────────────────────────────────
  confirmReset: { en: 'Set New Password', zh: '设置新密码' },
  confirmResetDesc: {
    en: 'Enter the 6-digit code from the email and your new password.',
    zh: '请输入邮件中的 6 位验证码及你的新密码。',
  },
  resetCode: { en: 'Reset code', zh: '验证码' },
  resetCodePlaceholder: { en: '123456', zh: '123456' },
  newPassword: { en: 'New password', zh: '新密码' },
  confirmPassword: { en: 'Confirm new password', zh: '再次输入新密码' },
  confirmPasswordMismatch: { en: "Passwords don't match.", zh: '两次密码不一致。' },
  setPassword: { en: 'Set new password', zh: '设置新密码' },
  passwordReset: { en: 'Password reset', zh: '密码已重置' },
  passwordResetDesc: {
    en: 'Your password has been updated. You can now sign in.',
    zh: '你的密码已更新，可以使用新密码登录了。',
  },

  // ── Change password ────────────────────────────────────────────────────────
  changePassword: { en: 'Change Password', zh: '修改密码' },
  currentPassword: { en: 'Current password', zh: '当前密码' },
  saveChanges: { en: 'Save changes', zh: '保存修改' },
  passwordChanged: { en: 'Password changed successfully.', zh: '密码修改成功。' },

  // ── Delete account ─────────────────────────────────────────────────────────
  deleteAccount: { en: 'Delete Account', zh: '删除账号' },
  deleteWarningTitle: { en: 'This is permanent', zh: '此操作不可撤销' },
  deleteWarningDesc: { en: 'Deleting your account will:', zh: '删除你的账号将会:' },
  deleteConsequence1: {
    en: 'Permanently delete your account, handle and display name',
    zh: '永久删除你的账号、用户名和昵称',
  },
  deleteConsequence2: {
    en: 'Remove all your game records and stats',
    zh: '删除全部对战记录与统计',
  },
  deleteConsequence3: {
    en: 'Remove you from your friend list and any active rooms',
    zh: '取消好友关系并退出所有房间',
  },
  deleteConsequence4: { en: 'This action cannot be undone', zh: '此操作不可撤销' },
  deleteAlternative: {
    en: 'If you just want a break, you can sign out instead — your account stays intact.',
    zh: '如果你只是想暂时离开，可以注销登录代替，账号不会被删除。',
  },
  deleteUnderstand: { en: 'I understand, continue', zh: '我已了解，继续删除' },
  cancel: { en: 'Cancel', zh: '取消' },
  back: { en: 'Back', zh: '返回' },
  deleteConfirmDesc: {
    en: 'To confirm, type %s below.',
    zh: '请在下方输入 %s 来确认。',
  },
  deleteConfirmLabel: { en: 'Confirmation', zh: '确认文本' },
  deleteForever: { en: 'Permanently delete account', zh: '永久删除账号' },
  deleteTypeMismatch: {
    en: 'Type "%s" exactly to confirm.',
    zh: '请准确输入 "%s"。',
  },

  // ── Home (stub) ────────────────────────────────────────────────────────────
  welcomeBack: { en: 'Welcome back,', zh: '欢迎回来,' },
  homeTitle: { en: 'Nanchang Mahjong', zh: '南昌麻将' },
  signOut: { en: 'Sign Out', zh: '退出登录' },
  changePasswordLink: { en: 'Change Password', zh: '修改密码' },
  deleteAccountLink: { en: 'Delete Account', zh: '删除账号' },
  comingSoon: { en: 'Game lobby coming in a later phase.', zh: '游戏大厅将在后续阶段推出。' },
  role: { en: 'Role', zh: '角色' },
  adminBadge: { en: 'Admin', zh: '管理员' },
  userBadge: { en: 'User', zh: '用户' },

  // ── Generic ────────────────────────────────────────────────────────────────
  error: { en: 'Something went wrong. Please try again.', zh: '操作失败，请重试。' },
  loading: { en: 'Loading…', zh: '加载中…' },
  required: { en: 'This field is required.', zh: '此项为必填。' },
} as const satisfies Record<string, StringEntry>;

export type StringKey = keyof typeof STRINGS;
