// Account flow screens — Forgot password, Change password/email, Delete account.

const { useState } = React;

// ─────────────────────────────────────────────────────────────
// Forgot password — 2 step (email → check inbox)
// ─────────────────────────────────────────────────────────────
function ForgotPasswordScreen({ onBack, onDone }) {
  const { t, lang } = useI18n();
  const [email, setEmail] = useState('');
  const [step, setStep] = useState('enter'); // enter | sent
  const [err, setErr] = useState(null);

  const submit = () => {
    setErr(null);
    if (!email) {
      setErr(lang === 'zh' ? '请输入邮箱地址' : 'Please enter your email.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setErr(lang === 'zh' ? '邮箱格式不正确' : 'That doesn\'t look like a valid email.');
      return;
    }
    setStep('sent');
  };

  return (
    <ScreenShell title={lang === 'zh' ? '找回密码' : 'Reset Password'} onBack={onBack}>
      <div style={{ padding: '24px 20px' }}>
        {step === 'enter' ? (
          <>
            <div style={{ fontSize: 14, opacity: 0.75, lineHeight: 1.5, marginBottom: 20 }}>
              {lang === 'zh'
                ? '输入你的邮箱地址,我们会发送密码重置链接。'
                : 'Enter your account email — we\'ll send you a link to reset your password.'}
            </div>
            <FormField
              label={t('email')}
              value={email}
              onChange={setEmail}
              type="email"
              placeholder="you@example.com"
              error={err}
            />
            <button onClick={submit} style={primaryBtn(20)}>
              {lang === 'zh' ? '发送重置链接' : 'Send reset link'}
            </button>
            <div style={{ marginTop: 14, textAlign: 'center', fontSize: 12, opacity: 0.6 }}>
              {lang === 'zh' ? '想起密码了?' : 'Remembered your password?'}{' '}
              <button onClick={onBack} style={linkBtn}>
                {lang === 'zh' ? '返回登录' : 'Back to sign in'}
              </button>
            </div>
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{
              width: 64, height: 64, margin: '8px auto 18px',
              borderRadius: 20,
              background: 'rgba(127,194,153,0.15)',
              border: '1px solid rgba(127,194,153,0.45)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#7fc299', fontSize: 32,
            }}>✓</div>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
              {lang === 'zh' ? '邮件已发送' : 'Check your inbox'}
            </div>
            <div style={{ fontSize: 13, opacity: 0.7, lineHeight: 1.5, maxWidth: 280, margin: '0 auto 28px' }}>
              {lang === 'zh'
                ? `我们已向 ${email} 发送了重置链接。请在 30 分钟内点击邮件中的按钮。`
                : `We sent a reset link to ${email}. The link expires in 30 minutes.`}
            </div>
            <button onClick={onDone} style={primaryBtn(0)}>
              {lang === 'zh' ? '返回登录' : 'Back to sign in'}
            </button>
            <div style={{ marginTop: 14, fontSize: 12, opacity: 0.55 }}>
              {lang === 'zh' ? '未收到邮件?' : 'Didn\'t receive it?'}{' '}
              <button onClick={() => setStep('enter')} style={linkBtn}>
                {lang === 'zh' ? '重新发送' : 'Resend'}
              </button>
            </div>
          </div>
        )}
      </div>
    </ScreenShell>
  );
}

// ─────────────────────────────────────────────────────────────
// Change password — current + new + confirm
// ─────────────────────────────────────────────────────────────
function ChangePasswordScreen({ onBack, onSaved }) {
  const { lang } = useI18n();
  const [cur, setCur] = useState('');
  const [nw, setNw] = useState('');
  const [cf, setCf] = useState('');
  const [errs, setErrs] = useState({});

  const submit = () => {
    const e = {};
    if (!cur) e.cur = lang === 'zh' ? '请输入当前密码' : 'Enter your current password.';
    if (!nw) e.nw = lang === 'zh' ? '请输入新密码' : 'Enter a new password.';
    else if (nw.length < 8) e.nw = lang === 'zh' ? '密码至少 8 位' : 'At least 8 characters.';
    if (nw !== cf) e.cf = lang === 'zh' ? '两次密码不一致' : 'Passwords don\'t match.';
    setErrs(e);
    if (!Object.keys(e).length) onSaved();
  };

  return (
    <ScreenShell title={lang === 'zh' ? '修改密码' : 'Change Password'} onBack={onBack}>
      <div style={{ padding: '20px' }}>
        <FormField
          label={lang === 'zh' ? '当前密码' : 'Current password'}
          value={cur} onChange={setCur} type="password" error={errs.cur}
        />
        <FormField
          label={lang === 'zh' ? '新密码' : 'New password'}
          value={nw} onChange={setNw} type="password"
          hint={lang === 'zh' ? '至少 8 位' : 'At least 8 characters'}
          error={errs.nw}
        />
        <FormField
          label={lang === 'zh' ? '再次输入新密码' : 'Confirm new password'}
          value={cf} onChange={setCf} type="password" error={errs.cf}
        />
        <button onClick={submit} style={primaryBtn(8)}>
          {lang === 'zh' ? '保存修改' : 'Save changes'}
        </button>
      </div>
    </ScreenShell>
  );
}

// ─────────────────────────────────────────────────────────────
// Delete account — 2-step (warning → typed confirmation)
// ─────────────────────────────────────────────────────────────
function DeleteAccountScreen({ onBack, onDeleted, userHandle = 'weichen' }) {
  const { lang } = useI18n();
  const [step, setStep] = useState('warn'); // warn | confirm
  const [typed, setTyped] = useState('');
  const [err, setErr] = useState(null);
  const target = `delete ${userHandle}`;

  const consequences = lang === 'zh' ? [
    '永久删除你的账号、昵称和头像',
    '删除全部 42 局对战记录与统计',
    '取消好友关系并退出所有房间',
    '此操作不可撤销',
  ] : [
    'Permanently delete your account, handle and avatar',
    'Remove all 42 game records and stats',
    'Remove you from your friend list and any active rooms',
    'This action cannot be undone',
  ];

  const proceed = () => {
    setErr(null);
    if (typed.trim().toLowerCase() !== target) {
      setErr(lang === 'zh' ? `请准确输入 "${target}"` : `Type "${target}" exactly to confirm.`);
      return;
    }
    onDeleted();
  };

  return (
    <ScreenShell title={lang === 'zh' ? '删除账号' : 'Delete Account'} onBack={onBack}>
      <div style={{ padding: 20 }}>
        {step === 'warn' ? (
          <>
            <div style={{
              padding: 14, borderRadius: 14,
              background: 'rgba(192,57,43,0.08)',
              border: '1px solid rgba(192,57,43,0.4)',
              marginBottom: 18,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 10,
                  background: 'rgba(192,57,43,0.2)',
                  border: '1px solid rgba(192,57,43,0.5)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#e88080', fontFamily: 'serif', fontSize: 18, fontWeight: 700,
                }}>!</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#e88080' }}>
                  {lang === 'zh' ? '此操作不可撤销' : 'This is permanent'}
                </div>
              </div>
              <div style={{ fontSize: 12, opacity: 0.85, lineHeight: 1.5 }}>
                {lang === 'zh' ? '删除你的账号将会:' : 'Deleting your account will:'}
              </div>
              <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 12, lineHeight: 1.7, opacity: 0.8 }}>
                {consequences.map((c, i) => <li key={i}>{c}</li>)}
              </ul>
            </div>

            <div style={{ fontSize: 13, lineHeight: 1.5, opacity: 0.7, marginBottom: 16 }}>
              {lang === 'zh'
                ? '如果你只是想暂时离开,可考虑改用游客模式或注销登录。'
                : 'If you just want a break, you can sign out instead — your account stays intact.'}
            </div>

            <button onClick={() => setStep('confirm')} style={dangerBtn}>
              {lang === 'zh' ? '我已了解,继续删除' : 'I understand, continue'}
            </button>
            <button onClick={onBack} style={secondaryBtn}>
              {lang === 'zh' ? '取消' : 'Cancel'}
            </button>
          </>
        ) : (
          <>
            <div style={{ fontSize: 14, opacity: 0.8, lineHeight: 1.55, marginBottom: 18 }}>
              {lang === 'zh' ? (
                <>请在下方输入 <code style={codeStyle}>{target}</code> 来确认。</>
              ) : (
                <>To confirm, type <code style={codeStyle}>{target}</code> below.</>
              )}
            </div>
            <FormField
              label={lang === 'zh' ? '确认文本' : 'Confirmation'}
              value={typed} onChange={setTyped} placeholder={target}
              error={err}
            />
            <button onClick={proceed} style={dangerBtn}>
              {lang === 'zh' ? '永久删除账号' : 'Permanently delete account'}
            </button>
            <button onClick={() => setStep('warn')} style={secondaryBtn}>
              {lang === 'zh' ? '返回' : 'Back'}
            </button>
          </>
        )}
      </div>
    </ScreenShell>
  );
}

// ─────────────────────────────────────────────────────────────
// Friends list — basic stub so the "friends only" privacy makes sense
// ─────────────────────────────────────────────────────────────
function FriendsScreen({ onBack, state = 'normal' }) {
  const { lang } = useI18n();
  const [tab, setTab] = useState('friends');
  const friends = [
    { name: 'Mei Zhang', handle: 'meizhang', rank: 'Jade II', online: true },
    { name: 'Wei Liu', handle: 'weiliu', rank: 'Jade IV', online: true },
    { name: 'Lin Chen', handle: 'linchen', rank: 'Jade I', online: false },
    { name: 'Xu Hao', handle: 'xuhao', rank: 'Pearl V', online: false },
  ];
  const requests = [
    { name: 'Jin Wang', handle: 'jinwang', rank: 'Jade III' },
  ];

  if (state === 'loading') {
    return (
      <ScreenShell title={lang === 'zh' ? '好友' : 'Friends'} onBack={onBack}>
        <div style={{ padding: 16 }}>
          <Skel h={40} r={12} style={{ marginBottom: 16 }} />
          {[0,1,2,3,4].map(i => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '10px 12px', marginBottom: 6,
            }}>
              <Skel w={36} h={36} r={12} />
              <div style={{ flex: 1 }}>
                <Skel w={'60%'} h={12} r={4} style={{ marginBottom: 6 }} />
                <Skel w={'40%'} h={9} r={3} />
              </div>
              <Skel w={56} h={24} r={999} />
            </div>
          ))}
        </div>
      </ScreenShell>
    );
  }

  if (state === 'error') {
    return (
      <ErrorState
        title={lang === 'zh' ? '加载失败' : "Couldn't load friends"}
        body={lang === 'zh'
          ? '与服务器的连接出错。请检查网络后重试。'
          : "Something went wrong reaching the server. Check your connection and try again."}
        primaryLabel={lang === 'zh' ? '重试' : 'Try again'}
        onPrimary={() => {}}
        secondaryLabel={lang === 'zh' ? '返回' : 'Back'}
        onSecondary={onBack}
      />
    );
  }

  const empty = state === 'empty';
  const fl = empty ? [] : friends;
  const rq = empty ? [] : requests;

  return (
    <ScreenShell title={lang === 'zh' ? '好友' : 'Friends'} onBack={onBack}>
      <div style={{ padding: 16 }}>
        <div style={{
          display: 'flex', padding: 4, borderRadius: 12,
          background: 'rgba(245,239,223,0.06)', marginBottom: 16,
        }}>
          {[
            { k: 'friends', label: lang === 'zh' ? `好友 · ${fl.length}` : `Friends · ${fl.length}` },
            { k: 'requests', label: lang === 'zh' ? `请求 · ${rq.length}` : `Requests · ${rq.length}` },
            { k: 'add', label: lang === 'zh' ? '添加' : 'Add' },
          ].map(x => (
            <button key={x.k} onClick={() => setTab(x.k)} style={{
              flex: 1, padding: 8, borderRadius: 9,
              background: tab === x.k ? '#c9a961' : 'transparent',
              color: tab === x.k ? '#1f2937' : '#f5efdf',
              border: 'none', fontWeight: 600, fontSize: 12,
              cursor: 'pointer', fontFamily: 'inherit',
            }}>{x.label}</button>
          ))}
        </div>

        {tab === 'friends' && (
          fl.length === 0 ? (
            <EmptyFriends onAdd={() => setTab('add')} />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {fl.map(f => (
                <div key={f.handle} style={rowStyle}>
                  <Avatar name={f.name} online={f.online} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{f.name}</div>
                    <div style={{ fontSize: 11, opacity: 0.6 }}>@{f.handle} · {f.rank}</div>
                  </div>
                  <button style={pillBtnGold}>{lang === 'zh' ? '邀请' : 'Invite'}</button>
                </div>
              ))}
            </div>
          )
        )}

        {tab === 'requests' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {rq.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, opacity: 0.55, fontSize: 13 }}>
                {lang === 'zh' ? '暂无好友请求' : 'No pending requests'}
              </div>
            ) : rq.map(f => (
              <div key={f.handle} style={rowStyle}>
                <Avatar name={f.name} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{f.name}</div>
                  <div style={{ fontSize: 11, opacity: 0.6 }}>@{f.handle} · {f.rank}</div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button style={pillBtnGold}>{lang === 'zh' ? '接受' : 'Accept'}</button>
                  <button style={pillBtnGhost}>{lang === 'zh' ? '拒绝' : 'Decline'}</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'add' && (
          <div>
            <div style={{ fontSize: 13, opacity: 0.7, lineHeight: 1.5, marginBottom: 14 }}>
              {lang === 'zh'
                ? '通过用户名或 @handle 找到朋友。'
                : 'Find friends by their display name or @handle.'}
            </div>
            <FormField
              label={lang === 'zh' ? '搜索' : 'Search'}
              value="" onChange={() => {}}
              placeholder={lang === 'zh' ? '@用户名 或 昵称' : '@handle or name'}
            />
          </div>
        )}
      </div>
    </ScreenShell>
  );
}

function EmptyFriends({ onAdd }) {
  const { lang } = useI18n();
  return (
    <div style={{ padding: '32px 16px', textAlign: 'center' }}>
      <div style={{
        margin: '12px auto 22px', width: 88, height: 88, borderRadius: 24,
        background: 'rgba(201,169,97,0.08)',
        border: '1px dashed rgba(201,169,97,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'serif', fontSize: 36, color: 'rgba(201,169,97,0.7)',
      }}>友</div>
      <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 6 }}>
        {lang === 'zh' ? '还没有好友' : 'No friends yet'}
      </div>
      <div style={{ fontSize: 13, opacity: 0.65, lineHeight: 1.5, maxWidth: 260, margin: '0 auto 22px' }}>
        {lang === 'zh'
          ? '添加好友后,你可以邀请他们一起开私人房间。'
          : 'Add friends to invite them to private rooms and see when they\'re online.'}
      </div>
      <button onClick={onAdd} style={{
        padding: '11px 22px', borderRadius: 12,
        background: 'linear-gradient(180deg, #c9a961 0%, #a88a45 100%)',
        color: '#1f2937', border: 'none', fontWeight: 700, fontSize: 13,
        cursor: 'pointer',
        boxShadow: '0 6px 18px rgba(201,169,97,0.3)',
        fontFamily: 'inherit',
      }}>{lang === 'zh' ? '添加好友' : 'Find friends'}</button>
    </div>
  );
}

function Avatar({ name, online }) {
  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <div style={{
        width: 36, height: 36, borderRadius: 12,
        background: 'rgba(201,169,97,0.2)',
        border: '1px solid rgba(201,169,97,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 700, color: '#c9a961', fontSize: 14,
      }}>{name[0]}</div>
      {online && (
        <div style={{
          position: 'absolute', bottom: -2, right: -2,
          width: 10, height: 10, borderRadius: '50%',
          background: '#7fc299', border: '2px solid #0a2218',
        }} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Shared form bits
// ─────────────────────────────────────────────────────────────
function FormField({ label, value, onChange, type = 'text', placeholder, error, hint }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 11, opacity: 0.7, fontWeight: 600, letterSpacing: 0.5 }}>
          {label.toUpperCase()}
        </span>
        <input
          type={type} value={value} placeholder={placeholder}
          onChange={e => onChange(e.target.value)}
          style={{
            padding: '12px 14px', borderRadius: 12,
            background: 'rgba(245,239,223,0.07)',
            border: error
              ? '1px solid rgba(192,57,43,0.55)'
              : '1px solid rgba(245,239,223,0.15)',
            color: '#f5efdf', fontSize: 14,
            outline: 'none', fontFamily: 'inherit',
          }}
        />
      </label>
      <FieldError>{error}</FieldError>
      {hint && !error && (
        <div style={{ fontSize: 11, opacity: 0.55, marginTop: 3 }}>{hint}</div>
      )}
    </div>
  );
}

const codeStyle = {
  fontFamily: 'ui-monospace, monospace',
  background: 'rgba(245,239,223,0.1)',
  padding: '2px 6px', borderRadius: 4,
  color: '#c9a961', fontWeight: 600, fontSize: 13,
};

const primaryBtn = (mt) => ({
  width: '100%', marginTop: mt, padding: '14px 20px', borderRadius: 14,
  background: 'linear-gradient(180deg, #c9a961 0%, #a88a45 100%)',
  color: '#1f2937', border: 'none', fontWeight: 700, fontSize: 14,
  cursor: 'pointer',
  boxShadow: '0 6px 18px rgba(201,169,97,0.3)',
});

const secondaryBtn = {
  width: '100%', marginTop: 8, padding: 13, borderRadius: 12,
  background: 'transparent', border: '1px solid rgba(245,239,223,0.15)',
  color: '#f5efdf', fontWeight: 600, fontSize: 13, cursor: 'pointer',
};

const dangerBtn = {
  width: '100%', marginTop: 8, padding: 14, borderRadius: 12,
  background: 'rgba(192,57,43,0.18)',
  border: '1px solid rgba(192,57,43,0.5)',
  color: '#e88080', fontWeight: 700, fontSize: 14, cursor: 'pointer',
};

const linkBtn = {
  background: 'transparent', border: 'none',
  color: '#c9a961', fontWeight: 600, fontSize: 12,
  cursor: 'pointer', padding: 0,
};

const rowStyle = {
  display: 'flex', alignItems: 'center', gap: 12,
  padding: '10px 12px', borderRadius: 12,
  background: 'rgba(245,239,223,0.04)',
  border: '1px solid rgba(245,239,223,0.08)',
};

const pillBtnGold = {
  padding: '6px 12px', borderRadius: 999,
  background: '#c9a961', color: '#1f2937',
  border: 'none', fontSize: 11, fontWeight: 700,
  cursor: 'pointer',
};

const pillBtnGhost = {
  padding: '6px 12px', borderRadius: 999,
  background: 'transparent',
  border: '1px solid rgba(245,239,223,0.18)',
  color: '#f5efdf', fontSize: 11, fontWeight: 600,
  cursor: 'pointer',
};

Object.assign(window, {
  ForgotPasswordScreen, ChangePasswordScreen, DeleteAccountScreen,
  FriendsScreen, FormField,
});
