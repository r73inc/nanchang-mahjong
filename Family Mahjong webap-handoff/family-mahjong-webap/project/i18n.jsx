// Lightweight i18n for English / Chinese.
// Strings are keyed; lookup falls back to English if a Chinese value is missing.

const STR = {
  // Brand / global
  app: { en: 'Nanchang Mahjong', zh: '南昌麻将' },
  language: { en: 'Language', zh: '语言' },
  english: { en: 'English', zh: '英文' },
  chinese: { en: '中文', zh: '中文' },

  // Home
  welcomeBack: { en: 'Welcome back,', zh: '欢迎回来,' },
  quickMatch: { en: 'Quick Match', zh: '快速对局' },
  quickMatchSub: { en: 'Play with random opponents', zh: '随机匹配对手' },
  playFriends: { en: 'Play with Friends', zh: '与好友对局' },
  playFriendsSub: { en: 'Join or create a private room', zh: '加入或创建私人房间' },
  history: { en: 'History', zh: '战绩' },
  customize: { en: 'Customize', zh: '自定义' },
  themes: { en: 'Themes', zh: '主题' },
  profile: { en: 'Profile', zh: '个人' },
  play: { en: 'Play', zh: '开始' },
  games: { en: 'games', zh: '局' },

  // Auth
  signIn: { en: 'Sign In', zh: '登录' },
  signUp: { en: 'Create Account', zh: '注册账号' },
  email: { en: 'Email', zh: '邮箱' },
  password: { en: 'Password', zh: '密码' },
  displayName: { en: 'Display name', zh: '昵称' },
  continueGuest: { en: 'Continue as Guest →', zh: '游客登录 →' },
  continueApple: { en: 'Continue with Apple', zh: '使用 Apple 登录' },
  continueGoogle: { en: 'Continue with Google', zh: '使用 Google 登录' },

  // Room
  privateRoom: { en: 'Private Room', zh: '私人房间' },
  roomCode: { en: 'ROOM CODE — SHARE WITH FRIENDS', zh: '房间号 — 分享给好友' },
  copy: { en: 'Copy', zh: '复制' },
  shareLink: { en: 'Share Link', zh: '分享链接' },
  players: { en: 'PLAYERS', zh: '玩家' },
  ready: { en: 'Ready', zh: '已准备' },
  notReady: { en: 'Not ready', zh: '未准备' },
  openSeat: { en: 'Open seat', zh: '空位' },
  waiting: { en: 'Waiting for player…', zh: '等待玩家…' },
  roundSettings: { en: 'ROUND SETTINGS', zh: '对局设置' },
  startMatch: { en: 'Start Match →', zh: '开始对局 →' },

  // Game / actions
  pung: { en: 'Pung', zh: '碰' },
  kong: { en: 'Kong', zh: '杠' },
  chow: { en: 'Chow', zh: '吃' },
  win: { en: 'Win!', zh: '胡!' },
  pass: { en: 'Pass', zh: '过' },
  threeKind: { en: '3 of a kind', zh: '三张相同' },
  fourKind: { en: '4 of a kind', zh: '四张相同' },
  sequence: { en: 'Sequence', zh: '顺子' },
  hu: { en: 'Hu / Mahjong', zh: '胡牌' },
  skip: { en: 'Skip', zh: '跳过' },
  round: { en: 'ROUND', zh: '圈' },
  wallLeft: { en: 'WALL', zh: '剩余' },
  jing: { en: 'JING', zh: '精' },
  jingDoubles: { en: '+1 doubles', zh: '加倍' },
  drawn: { en: 'DRAWN', zh: '摸牌' },
  drag: { en: 'Drag tile up to discard ↑', zh: '向上拖动出牌 ↑' },
  release: { en: 'Release to discard ↓', zh: '松开出牌 ↓' },
  tapAgain: { en: 'Tap selected tile again to discard', zh: '再次点击出牌' },
  tapBelow: { en: 'Tap Discard below to confirm', zh: '点击下方确认出牌' },
  discard: { en: 'Discard ↑', zh: '出牌 ↑' },
  yourCall: { en: 'your call', zh: '你的回合' },
  robKong: { en: 'Robbing the Kong', zh: '抢杠胡' },
  discardedBy: { en: 'discarded', zh: '打出' },

  // Wildcard
  spirit: { en: 'SPIRIT TILE · WILDCARD', zh: '精牌 · 万能牌' },
  jingDesc: { en: 'Any %s tile in your hand acts as a wildcard. Holding the bonus tile doubles your win.', zh: '手牌中的%s作为万能牌。持有奖励牌可使分数加倍。' },
  beginRound: { en: 'BEGIN ROUND →', zh: '开始本局 →' },
  bonus: { en: 'BONUS →', zh: '奖励 →' },
  tonightJing: { en: "Tonight's Jing is", zh: '本局精牌为' },

  // History
  historyTitle: { en: 'History & Stats', zh: '战绩统计' },
  winRate: { en: 'WIN RATE', zh: '胜率' },
  gamesC: { en: 'GAMES', zh: '场次' },
  avgFan: { en: 'AVG FAN', zh: '平均番数' },
  thisWeek: { en: 'this week', zh: '本周' },
  thisSeason: { en: 'this season', zh: '本赛季' },
  perWin: { en: 'per win', zh: '每胜局' },
  rating30: { en: 'RATING · 30 DAYS', zh: '段位 · 30 天' },
  favHand: { en: 'FAVORITE HAND', zh: '常胡牌型' },
  recentGames: { en: 'RECENT GAMES', zh: '最近对局' },
  noWin: { en: 'No win', zh: '未胡' },

  // Customize
  feltColor: { en: 'Felt Color', zh: '牌桌颜色' },
  tileBack: { en: 'Tile Back', zh: '牌背' },
  tilePalette: { en: 'Tile Face Palette', zh: '牌面配色' },
  soundPack: { en: 'Sound Pack', zh: '音效' },
  soundTrad: { en: 'Traditional clack', zh: '传统牌声' },
  soundSoft: { en: 'Soft felt', zh: '柔和' },
  soundModern: { en: 'Modern UI', zh: '现代' },
  soundSilent: { en: 'Silent', zh: '静音' },

  // Profile
  account: { en: 'Account', zh: '账户' },
  game: { en: 'Game', zh: '游戏' },
  about: { en: 'About', zh: '关于' },
  privacy: { en: 'Privacy', zh: '隐私' },
  friendsOnly: { en: 'Friends only', zh: '仅好友' },
  sound: { en: 'Sound', zh: '音效' },
  vibration: { en: 'Vibration', zh: '振动' },
  autoTimer: { en: 'Auto-discard timer', zh: '自动出牌计时' },
  showLabels: { en: 'Show English labels', zh: '显示英文标注' },
  rules: { en: 'Rules', zh: '规则' },
  rulesNanchang: { en: 'Nanchang style', zh: '南昌玩法' },
  helpFeedback: { en: 'Help & Feedback', zh: '帮助与反馈' },
  version: { en: 'Version', zh: '版本' },
  signOut: { en: 'Sign Out', zh: '退出登录' },

  // End-game
  mahjong: { en: 'MAHJONG', zh: '胡牌' },
  washout: { en: 'WASHOUT', zh: '流局' },
  noWinHead: { en: 'NO WIN', zh: '未胡' },
  youWon: { en: 'You won this hand', zh: '你赢得本局' },
  wallExhaust: { en: 'Wall exhausted — no winner', zh: '牌墙用尽 — 无人胡牌' },
  linWon: { en: 'Lin won with Thirteen Irregular', zh: 'Lin 以十三幺胡牌' },
  winningHand: { en: 'WINNING HAND', zh: '胡牌牌型' },
  base: { en: 'Base', zh: '底分' },
  total: { en: 'Total', zh: '总分' },
  yourHand: { en: 'Your hand', zh: '你的手牌' },
  tilesInWall: { en: 'Tiles in wall', zh: '牌墙剩余' },
  home: { en: 'Home', zh: '首页' },
  nextRound: { en: 'Next Round →', zh: '下一局 →' },

  // Learn
  learn: { en: 'Learn', zh: '学习' },
  learnSub: { en: 'Rules & strategy guide', zh: '规则与策略指南' },
  learnTitle: { en: 'Learn to Play', zh: '学习玩法' },
  learnIntro: { en: 'Nanchang Mahjong is a regional variant played in Jiangxi, China. Four players, 136 tiles, plus a wildcard system that makes every round different.', zh: '南昌麻将是江西地区的一种麻将玩法。四人参与,136 张牌,加上独特的精牌系统,让每一局都各不相同。' },
  beginner: { en: 'Beginner', zh: '入门' },
  intermediate: { en: 'Intermediate', zh: '进阶' },
  advanced: { en: 'Advanced', zh: '高级' },
  estMin: { en: 'min read', zh: '分钟' },

  // Lesson titles
  lessonOverview: { en: 'Game Overview', zh: '游戏概览' },
  lessonOverviewSub: { en: 'Goal, players, turn order', zh: '目标、玩家与顺序' },
  lessonTiles: { en: 'The Tiles', zh: '牌的种类' },
  lessonTilesSub: { en: 'Suits, honors & how to read them', zh: '花色、字牌与识别方法' },
  lessonHand: { en: 'Building a Winning Hand', zh: '组成胡牌' },
  lessonHandSub: { en: 'Sets, pairs and the 4+1 structure', zh: '面子、对子与四组一对' },
  lessonCalls: { en: 'Calls: Pung, Kong, Chow', zh: '碰、杠、吃' },
  lessonCallsSub: { en: 'Claiming a discard from another player', zh: '吃下他人打出的牌' },
  lessonJing: { en: 'The Spirit Tile (Jing)', zh: '精牌' },
  lessonJingSub: { en: 'Nanchang\'s signature wildcard', zh: '南昌特色的万能牌' },
  lessonScoring: { en: 'Scoring & Fan', zh: '番数与计分' },
  lessonScoringSub: { en: 'How wins are valued', zh: '胡牌如何计分' },
  lessonSpecial: { en: 'Special Hands', zh: '特殊牌型' },
  lessonSpecialSub: { en: 'Thirteen Irregular & more', zh: '十三幺及其他' },
  lessonEtiquette: { en: 'Etiquette & Flow', zh: '礼仪与流程' },
  lessonEtiquetteSub: { en: 'Pace, calls and table manners', zh: '节奏、叫牌与礼仪' },

  // Lesson body — overview
  ovGoal: { en: 'Goal', zh: '目标' },
  ovGoalBody: { en: 'Be the first to form a complete hand of 14 tiles — four sets plus one pair — and call Hu (胡) to win the round.', zh: '率先组成 14 张牌的胡牌牌型 — 四组面子加一对将 — 并叫"胡"即可胜出本局。' },
  ovPlayers: { en: 'Players', zh: '玩家' },
  ovPlayersBody: { en: 'Four players sit at the four compass seats: East (东), South (南), West (西), North (北). East is the dealer and goes first.', zh: '四名玩家分别坐在东、南、西、北四个方位。东家为庄家,先行出牌。' },
  ovTurn: { en: 'Turn order', zh: '出牌顺序' },
  ovTurnBody: { en: 'Play moves counter-clockwise. Each turn you draw one tile from the wall and discard one tile, keeping a hand of 13. The round ends when someone wins or the wall runs out.', zh: '按逆时针方向出牌。每回合从牌墙摸一张牌,再打出一张,手中保持 13 张。直到有人胡牌或牌墙用尽即结束本局。' },

  // Tiles
  tilesSuits: { en: 'Three suits', zh: '三种花色' },
  tilesSuitsBody: { en: 'Bamboos (条), Characters (万) and Dots (筒). Each suit has tiles numbered 1–9, with four copies of each — 108 tiles in total.', zh: '条 (Bamboos)、万 (Characters)、筒 (Dots) 三种花色,每色 1–9 各四张,共 108 张。' },
  tilesHonors: { en: 'Honors', zh: '字牌' },
  tilesHonorsBody: { en: 'Four winds (East, South, West, North) and three dragons (Red 中, Green 发, White 白). Four of each — 28 honor tiles. In Nanchang, the four winds and the three dragons may each be treated as a sequence ("honor chow"), unique to this variant.', zh: '四张风牌(东、南、西、北)和三张箭牌(红中、青发、白板),每种四张,共 28 张字牌。南昌玩法中四风与三元各自可吃成顺子(字牌顺子),这是本玩法独有。' },
  tilesReading: { en: 'Reading the tiles', zh: '辨识牌面' },
  tilesReadingBody: { en: 'Each tile shows a Chinese character with an English label below — 5 of Bamboos appears as 五条 with "5 BAM". Toggle "Show English labels" in Profile to hide them once you\'re comfortable.', zh: '每张牌上方为汉字,下方为英文缩写 — 例如"五条"下方标注 "5 BAM"。熟悉之后可在个人设置中隐藏英文标注。' },

  // Hand structure
  handBasic: { en: 'The 4 + 1 structure', zh: '四组加一对' },
  handBasicBody: { en: 'A standard winning hand is four "sets" plus one "pair" — 4 × 3 + 2 = 14 tiles.', zh: '标准胡牌为四组面子加一对将 — 4 × 3 + 2 = 14 张。' },
  handSet1: { en: 'Pung (碰)', zh: '碰 (Pung)' },
  handSet1Body: { en: 'Three identical tiles, e.g. three 5 of Dots.', zh: '三张相同的牌,如三张五筒。' },
  handSet2: { en: 'Kong (杠)', zh: '杠 (Kong)' },
  handSet2Body: { en: 'Four identical tiles. After kong-ing, you draw a replacement tile from the back of the wall.', zh: '四张相同的牌。开杠后从牌墙末端补一张。' },
  handSet3: { en: 'Chow (吃)', zh: '吃 (Chow)' },
  handSet3Body: { en: 'Three consecutive tiles in the same suit, e.g. 3-4-5 of Bamboos. In Nanchang you may also chow the four winds in compass order, or the three dragons.', zh: '同花色的三张连续牌,如条三、条四、条五。南昌玩法中四风按顺序、三元也可吃成顺子。' },
  handPair: { en: 'The pair (将)', zh: '将牌' },
  handPairBody: { en: 'Two identical tiles. Often the last piece you wait on — your "ready" tile.', zh: '两张相同的牌。常为最后等待的"听牌"。' },

  // Calls
  callsWhen: { en: 'When can you call?', zh: '何时可以叫牌?' },
  callsWhenBody: { en: 'When another player discards a tile that completes a set in your hand, you may interrupt the turn order and claim it. Pung & Kong from any player; Chow only from the player to your left (your upstream).', zh: '当他人打出一张可完成你手中面子的牌时,可以叫牌打断顺序。碰、杠可吃任何玩家;吃只能吃上家(你的左手)。' },
  callsPriority: { en: 'Priority', zh: '优先级' },
  callsPriorityBody: { en: 'Win > Kong > Pung > Chow. If two players both call, the higher-priority call wins.', zh: '胡 > 杠 > 碰 > 吃。两人同时叫牌时,优先级高者优先。' },
  callsExposed: { en: 'Exposed sets', zh: '亮出面子' },
  callsExposedBody: { en: 'A claimed set is laid face-up in front of you and locked for the rest of the round. Concealed sets (formed only from tiles you drew) score more.', zh: '叫出的面子放在面前亮出,本局不可拆。完全自摸而成的暗面子得分更高。' },
  callsRobbing: { en: 'Robbing the Kong', zh: '抢杠胡' },
  callsRobbingBody: { en: 'If a player upgrades an exposed Pung to a Kong by adding the fourth tile, and that tile completes your winning hand, you may "rob" the kong and win.', zh: '当其他玩家在已碰的牌上加杠时,如果该牌正好是你的胡牌,可以"抢杠胡"。' },

  // Jing
  jingWhat: { en: 'What is the Jing tile?', zh: '什么是精牌?' },
  jingWhatBody: { en: 'Before the round begins, a single tile is revealed at random — this is the Jing (精). Any matching tile in your hand acts as a wildcard, substituting for any other tile to complete a set.', zh: '开局前随机翻出一张牌作为"精牌"。手中所有与精牌相同的牌都是万能牌,可代替任意一张牌完成面子。' },
  jingBonus: { en: 'The bonus tile', zh: '奖励牌' },
  jingBonusBody: { en: 'The tile one step "after" the Jing is the bonus tile. Holding it doubles your final score. Holding multiples doubles again per copy.', zh: '精牌之后的下一张牌为奖励牌。持有奖励牌可使最终得分加倍,每多持一张再加倍一次。' },
  jingStrategy: { en: 'Strategy', zh: '策略' },
  jingStrategyBody: { en: 'Wildcards make ready hands much faster, but other players are racing too — discard cautiously. A discarded Jing is a powerful gift to opponents.', zh: '精牌让听牌速度大幅加快,但对手同样在追赶 — 出牌需谨慎。打出精牌等于赠送对手强力武器。' },

  // Scoring
  scoreFan: { en: 'Fan (番)', zh: '番' },
  scoreFanBody: { en: 'Each special pattern in your winning hand earns "fan" — multipliers on top of a base score. More fan = bigger payout.', zh: '胡牌时每个特殊牌型得若干"番"——在底分上乘倍。番数越高,得分越高。' },
  scoreCommon: { en: 'Common patterns', zh: '常见牌型' },
  scoreCommonBody: { en: 'All Pungs (碰碰胡), One Suit (清一色), Mixed One Suit (混一色), Self-Drawn (自摸), Last Tile (海底捞月). Each adds fan.', zh: '碰碰胡、清一色、混一色、自摸、海底捞月等,每项各加番。' },
  scorePay: { en: 'Who pays?', zh: '由谁付分?' },
  scorePayBody: { en: 'On a discard win (放炮), the discarder pays the full amount. On a self-drawn win (自摸), all three opponents pay.', zh: '放炮胡:出牌者支付全部。自摸胡:其他三家共同支付。' },

  // Special hands
  spThirteen: { en: 'Thirteen Irregular (十三幺)', zh: '十三幺' },
  spThirteenBody: { en: 'One of each terminal (1 and 9 of every suit) and one of each honor, plus a duplicate of any one of them. Extremely rare; counts as a top-tier win.', zh: '每花色的 1 和 9 各一张,每种字牌各一张,任意一张作对子 — 极罕见,顶级牌型。' },
  spSevenPairs: { en: 'Seven Pairs (七对)', zh: '七对' },
  spSevenPairsBody: { en: 'Seven distinct pairs — 14 tiles forming no sets at all. A clean alternative to the standard 4+1 structure.', zh: '七对完全不同的对子,共 14 张,无任何面子。标准 4+1 结构的另一种胡法。' },
  spAllHonors: { en: 'All Honors (字一色)', zh: '字一色' },
  spAllHonorsBody: { en: 'A complete hand made of only winds and dragons. Top-tier and dramatic.', zh: '全部由风牌与箭牌组成的胡牌。顶级且极具戏剧性。' },

  // Etiquette
  etPace: { en: 'Pace', zh: '节奏' },
  etPaceBody: { en: 'Discard quickly when you have nothing to call. Long delays without reason are considered rude.', zh: '无叫牌意图时应迅速出牌,无故拖延视为失礼。' },
  etCalling: { en: 'Calling clearly', zh: '清晰叫牌' },
  etCallingBody: { en: 'Always say the call out loud — Pung, Kong, Chow, Hu — before reaching for the discard. The app does this for you, but at a real table it matters.', zh: '叫牌时应先口头说出"碰、杠、吃、胡",再伸手取牌。本应用会自动播报,但实地对弈时尤为重要。' },
  etDispute: { en: 'Disputes', zh: '争议' },
  etDisputeBody: { en: 'If two players claim the same discard, priority decides. Be gracious — Mahjong is a long game over many rounds.', zh: '若两人同时叫牌,以优先级判定。礼让为先 — 麻将是长局。' },

  startLesson: { en: 'Start lesson →', zh: '开始学习 →' },
  next: { en: 'Next', zh: '下一节' },
  prev: { en: 'Previous', zh: '上一节' },
  done: { en: 'Done', zh: '完成' },
  ofN: { en: 'of', zh: '/' },
};

const I18nCtx = React.createContext({ lang: 'en', t: (k) => k, setLang: () => {} });

function I18nProvider({ children }) {
  const [lang, setLangState] = React.useState(() => {
    try { return localStorage.getItem('lang') || 'en'; } catch { return 'en'; }
  });
  const setLang = (l) => {
    setLangState(l);
    try { localStorage.setItem('lang', l); } catch {}
  };
  const t = React.useCallback((key, ...args) => {
    const entry = STR[key];
    if (!entry) return key;
    let s = entry[lang] || entry.en || key;
    args.forEach(a => { s = s.replace('%s', a); });
    return s;
  }, [lang]);
  return <I18nCtx.Provider value={{ lang, t, setLang }}>{children}</I18nCtx.Provider>;
}

function useI18n() { return React.useContext(I18nCtx); }

// Quick language toggle pill
function LangToggle({ style = {} }) {
  const { lang, setLang } = useI18n();
  return (
    <div style={{
      display: 'flex', padding: 3, borderRadius: 999,
      background: 'rgba(245,239,223,0.06)',
      border: '1px solid rgba(201,169,97,0.3)',
      ...style,
    }}>
      {[
        { k: 'en', label: 'EN' },
        { k: 'zh', label: '中文' },
      ].map(l => (
        <button key={l.k} onClick={() => setLang(l.k)} style={{
          padding: '4px 10px', borderRadius: 999,
          background: lang === l.k ? '#c9a961' : 'transparent',
          color: lang === l.k ? '#1f2937' : '#f5efdf',
          border: 'none', fontSize: 11, fontWeight: 700,
          cursor: 'pointer', fontFamily: 'inherit',
        }}>{l.label}</button>
      ))}
    </div>
  );
}

Object.assign(window, { I18nProvider, useI18n, LangToggle });
