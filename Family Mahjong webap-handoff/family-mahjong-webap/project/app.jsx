// Main app — routes between screens, manages tweaks, mounts as a responsive web app.
//
// Layout: a centered phone-width column on desktop (≤480px), full-bleed on phones.
// Decisions are Android-first. iOS-specific polish is out of scope for this prototype.

const { useState, useEffect } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "showEnglishLabels": true,
  "overlay": "none",
  "homeState": "normal",
  "roomState": "normal",
  "friendsState": "normal",
  "historyState": "normal",
  "showLearnNudge": true,
  "firstLaunch": false
} /*EDITMODE-END*/;

// Locked design decisions — these used to be Tweaks; now baked in.
// Surfaced here so devs can find them quickly. See Handoff Sheet for rationale.
const LOCKED = {
  interaction: 'tap-action',   // tap a tile, then press Discard
  actionStyle: 'rail',         // Pung/Kong/Win prompts on the right rail
};

const SAMPLE_USER = {
  name: 'Wei Chen', handle: 'weichen',
  initial: 'W', email: 'wei@example.com',
  rank: 'Jade III', rating: 1842, streak: 4
};

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);

  // First-launch flag — clears once onboarding finishes.
  const [onboarded, setOnboarded] = useState(() => {
    try { return localStorage.getItem('mj_onboarded') === '1'; } catch { return false; }
  });

  useEffect(() => {
    if (t.firstLaunch) setOnboarded(false);
  }, [t.firstLaunch]);

  const [screen, setScreen] = useState(onboarded ? 'home' : 'onboarding');
  const [nudgeDismissed, setNudgeDismissed] = useState(false);

  const goto = (s) => setScreen(s);

  const finishOnboarding = () => {
    try { localStorage.setItem('mj_onboarded', '1'); } catch {}
    setOnboarded(true);
    setTweak('firstLaunch', false);
    setScreen('home');
  };

  const renderScreen = () => {
    switch (screen) {
      case 'onboarding':
        return <OnboardingScreen onFinish={finishOnboarding} onSkip={finishOnboarding} />;
      case 'auth':
        return (
          <AuthScreen
            onSignedIn={() => goto('home')}
            onForgot={() => goto('forgot')}
          />
        );
      case 'forgot':
        return <ForgotPasswordScreen onBack={() => goto('auth')} onDone={() => goto('auth')} />;
      case 'change-pw':
        return <ChangePasswordScreen onBack={() => goto('account')} onSaved={() => goto('account')} />;
      case 'delete-account':
        return (
          <DeleteAccountScreen
            onBack={() => goto('account')}
            onDeleted={() => goto('auth')}
            userHandle={SAMPLE_USER.handle}
          />
        );
      case 'friends':
        return <FriendsScreen onBack={() => goto('account')} state={t.friendsState} />;
      case 'home':
        return (
          <HomeScreen
            user={SAMPLE_USER}
            onPlay={() => goto('room')}
            onJoinCode={() => goto('room')}
            onHistory={() => goto('history')}
            onCustomize={() => goto('customize')}
            onAccount={() => goto('account')}
            onLearn={() => goto('learn')}
            showLearnNudge={t.showLearnNudge && !nudgeDismissed}
            onDismissNudge={() => setNudgeDismissed(true)}
            state={t.homeState}
          />
        );
      case 'room':
        return <RoomScreen onBack={() => goto('home')} onStart={() => goto('wildcard')} state={t.roomState} />;
      case 'wildcard':
        return <WildcardReveal onComplete={() => goto('game')} />;
      case 'game':
        return <GameScreen tweaks={t} onMenu={() => goto('home')} onWin={() => goto('endgame')} />;
      case 'endgame':
        return <EndGameScreen result="win" onContinue={() => goto('wildcard')} onHome={() => goto('home')} />;
      case 'endgame-lose':
        return <EndGameScreen result="lose" onContinue={() => goto('wildcard')} onHome={() => goto('home')} />;
      case 'endgame-draw':
        return <EndGameScreen result="draw" onContinue={() => goto('wildcard')} onHome={() => goto('home')} />;
      case 'history':
        return (
          <HistoryScreen
            onBack={() => goto('home')}
            onOpenGame={() => goto('replay')}
            state={t.historyState}
            onPlay={() => goto('room')}
            onLearn={() => goto('learn')}
          />
        );
      case 'replay':
        return <ReplayScreen onBack={() => goto('history')} />;
      case 'customize':
        return <CustomizeScreen onBack={() => goto('home')} />;
      case 'account':
        return (
          <AccountScreen
            user={SAMPLE_USER}
            onBack={() => goto('home')}
            onSignOut={() => goto('auth')}
            onFriends={() => goto('friends')}
            onChangePassword={() => goto('change-pw')}
            onDelete={() => goto('delete-account')}
            onReplayOnboarding={() => {
              try { localStorage.removeItem('mj_onboarded'); } catch {}
              setOnboarded(false);
              setScreen('onboarding');
            }}
          />
        );
      case 'learn':
        return <LearnScreen onBack={() => goto('home')} />;
      default:
        return null;
    }
  };

  return (
    <>
      <ContextNav screen={screen} setScreen={setScreen} />

      <div className="mj-app-stage">
        <div className="mj-app-viewport" data-comment-anchor="9dabe9de1c-app-viewport">
          {renderScreen()}
        </div>
      </div>

      <TweaksUI t={t} setTweak={setTweak} />
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// Top context nav — designer/QA helper to jump between screens.
// In production this is gated behind a debug flag; for the prototype
// it's always visible so the team can audit flows quickly.
// ─────────────────────────────────────────────────────────────
function ContextNav({ screen, setScreen }) {
  const flows = [
    { k: 'onboarding', label: 'Onboarding' },
    { k: 'auth', label: 'Auth' },
    { k: 'forgot', label: 'Forgot pwd' },
    { k: 'home', label: 'Home' },
    { k: 'room', label: 'Room' },
    { k: 'wildcard', label: 'Jing reveal' },
    { k: 'game', label: 'Gameplay' },
    { k: 'endgame', label: 'Win' },
    { k: 'endgame-lose', label: 'Lose' },
    { k: 'endgame-draw', label: 'Draw' },
    { k: 'history', label: 'History' },
    { k: 'replay', label: 'Replay' },
    { k: 'customize', label: 'Customize' },
    { k: 'account', label: 'Profile' },
    { k: 'friends', label: 'Friends' },
    { k: 'change-pw', label: 'Change PW' },
    { k: 'delete-account', label: 'Delete acct' },
    { k: 'learn', label: 'Learn' },
  ];

  return (
    <div className="mj-context-nav">
      <div className="mj-brand">
        <span className="mj-brand-cn">南昌</span>
        <span className="mj-brand-en">Nanchang Mahjong</span>
        <a className="mj-handoff-link" href="Handoff Sheet.html" target="_blank" rel="noopener" title="Open handoff sheet">↗ Handoff</a>
      </div>
      <div className="mj-flow-row">
        <LangToggle style={{ marginRight: 6 }} />
        {flows.map((f) => {
          const active = screen === f.k;
          return (
            <button key={f.k} onClick={() => setScreen(f.k)} className={`mj-flow-btn ${active ? 'is-active' : ''}`}>
              {f.label}
            </button>);
        })}
      </div>
    </div>);
}

// ─────────────────────────────────────────────────────────────
// Tweaks UI — state coverage + first-time UX + minor toggles.
// The two big locked decisions (tap-action discard, side-rail prompts)
// have been removed from this panel; see LOCKED above.
// ─────────────────────────────────────────────────────────────
function TweaksUI({ t, setTweak }) {
  return (
    <TweaksPanel title="Tweaks">
      <TweakSection title="Locked decisions">
        <div style={lockedNote}>
          <div><strong>Tile discard:</strong> Tap + Discard button</div>
          <div><strong>Call prompts:</strong> Side rail</div>
          <div style={{ marginTop: 4, opacity: 0.6 }}>
            See <a href="Handoff Sheet.html" target="_blank" rel="noopener" style={{ color: '#c9a961' }}>Handoff Sheet</a> for rationale.
          </div>
        </div>
      </TweakSection>

      <TweakSection title="Home state">
        <TweakRadio
          value={t.homeState || 'normal'}
          onChange={(v) => setTweak('homeState', v)}
          options={[
            { value: 'normal', label: 'Normal' },
            { value: 'loading', label: 'Loading' },
            { value: 'error', label: 'Error' },
          ]} />
      </TweakSection>

      <TweakSection title="Room state">
        <TweakSelect
          value={t.roomState || 'normal'}
          onChange={(v) => setTweak('roomState', v)}
          options={[
            { value: 'normal', label: 'Normal (3/4 seated)' },
            { value: 'waiting', label: 'Waiting (1/4 seated)' },
            { value: 'loading', label: 'Loading' },
            { value: 'host-left', label: 'Host left' },
            { value: 'error', label: 'Error / not found' },
          ]} />
      </TweakSection>

      <TweakSection title="Friends state">
        <TweakRadio
          value={t.friendsState || 'normal'}
          onChange={(v) => setTweak('friendsState', v)}
          options={[
            { value: 'normal', label: 'Normal' },
            { value: 'empty', label: 'Empty' },
            { value: 'loading', label: 'Loading' },
            { value: 'error', label: 'Error' },
          ]} />
      </TweakSection>

      <TweakSection title="History state">
        <TweakRadio
          value={t.historyState || 'normal'}
          onChange={(v) => setTweak('historyState', v)}
          options={[
            { value: 'normal', label: 'Normal' },
            { value: 'empty', label: 'Empty' },
            { value: 'loading', label: 'Loading' },
            { value: 'error', label: 'Error' },
          ]} />
      </TweakSection>

      <TweakSection title="In-game overlay (demo)">
        <TweakSelect
          value={t.overlay || 'none'}
          onChange={(v) => setTweak('overlay', v)}
          options={[
            { value: 'none', label: 'None' },
            { value: 'reconnecting', label: 'Reconnecting…' },
            { value: 'disconnected', label: 'Disconnected' },
            { value: 'playerLeft', label: 'Other player left' },
            { value: 'afk', label: 'AFK badge on Wei' },
          ]} />
        <div style={tweakHelp}>
          Open <strong>Gameplay</strong> to see these on top of the table.
        </div>
      </TweakSection>

      <TweakSection title="First-time UX">
        <TweakToggle
          checked={!!t.firstLaunch}
          onChange={(v) => setTweak('firstLaunch', v)}
          label="Force onboarding on next mount" />
        <TweakToggle
          checked={!!t.showLearnNudge}
          onChange={(v) => setTweak('showLearnNudge', v)}
          label="Show 'New to Mahjong?' banner on Home" />
      </TweakSection>

      <TweakSection title="Tile labels">
        <TweakToggle
          checked={t.showEnglishLabels}
          onChange={(v) => setTweak('showEnglishLabels', v)}
          label="Show English assist labels" />
      </TweakSection>
    </TweaksPanel>);
}

const tweakHelp = { fontSize: 11, opacity: 0.7, lineHeight: 1.4, marginTop: 6 };
const lockedNote = {
  fontSize: 11, opacity: 0.85, lineHeight: 1.6,
  padding: 10, borderRadius: 10,
  background: 'rgba(201,169,97,0.08)',
  border: '1px solid rgba(201,169,97,0.25)',
};

// Mount
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <I18nProvider>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </I18nProvider>
);
