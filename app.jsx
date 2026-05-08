/* ============================================================
 *  SPROUT — Asahi R&D Ideation Hub
 *  Single-file React app (JSX via Babel Standalone)
 *  No build step. Data comes from window.SPROUT_DATA.
 * ============================================================ */

const { useState, useEffect, useMemo, useRef, useCallback, createContext, useContext, Fragment } = React;

// ---------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------
function todayISO() { return new Date().toISOString().slice(0, 10); }
function nowISOMin() { return new Date().toISOString().slice(0, 16).replace("T", " "); }

// Create an empty draft and jump straight into the editor.
// Eliminates "fill in /ideas/new then forget to save" data loss and unifies all
// blank-from-scratch entry points (sidebar, dashboard hero, ideas list, etc.).
function startBlankIdea(app, data) {
  const newId = "i_local_" + Math.random().toString(36).slice(2,8);
  const today = todayISO();
  const idea = {
    id: newId, codename: "UNTITLED", title: "(無題)",
    author: data.me.id, status: "ドラフト",
    archetype: null, phase: 1, gateChecks: {},
    createdAt: today, updatedAt: today,
    likes: 0, likedBy: [],
    linkedSeeds: [], linkedArticles: [],
    format: { problem:"", customer:"", solution:"", unfairAdvantage:"", marketSize:"", goToMarket:"", businessModel:"", competitors:"", roadmap: [], risks: [], ask: "" },
  };
  app.addIdea(idea);
  app.snapshotIdea(newId, { by: data.me.id, changeNote: "新規作成", format: idea.format, linkedSeeds: [], linkedArticles: [] });
  window.location.hash = `#/ideas/${newId}/edit`;
  return newId;
}

// ---------------------------------------------------------------
//  6類型 (新規事業のアーキタイプ) — 役員向けPhase0スキームに対応
// ---------------------------------------------------------------
const ARCHETYPES = [
  {
    id: "compensation",
    num: "①",
    label: "補填型",
    subtitle: "既存事業縮退分を埋める",
    desc: "本業の構造的縮退を新規事業で補う。株主への成長コミットを守るための『引き算と足し算』。",
    fit: "◎ 本命",
    fitTone: "asahi",
    where: "本業に関連する隣接領域",
    when: "10年スパン (縮退カーブから逆算)",
    howMuch: "1,000〜3,000億円規模 / 3-5本",
    howMany: "本柱3-5本 + 予備3-5本",
    kpiLogic: "(既存事業10年後予測売上減少額) ×(成長コミット率) = 必要な新規事業売上。アサヒ国内ビール酒類年率▲2.5%なら10年で約▲1,000億、+3%成長コミットには10年後 +1,500〜2,000億円/年が必要。",
    examples: [
      { name: "MIXI モンスト", note: "SNS縮退をスマホゲーム単品集中投資で補填、ピーク時 売上2,089億円" },
      { name: "キリンHD ヘルスサイエンス", note: "ビール縮退補填にファンケル 2,300億+Blackmores 1,700億" },
      { name: "JT Ploom", note: "紙巻縮退を加熱式で補填、2025-27年 6,500億円投資" },
    ],
    pitfall: "焦りで本業から離れすぎたM&Aに走り、減損リスク (コニカミノルタ事務機→ヘルスケアで1,166億のれん減損)",
  },
  {
    id: "synergy",
    num: "②",
    label: "シナジー型",
    subtitle: "本業の価値を上げる",
    desc: "新規事業単体の利益ではなく、本業の顧客単価・LTV・チャネル強化・ブランド価値で成果を測る。本業のマージンを守る・高める。",
    fit: "◎ 本命",
    fitTone: "asahi",
    where: "本業とのシナジーが明確な隣接領域 (顧客・SC・流通網の活用が必須)",
    when: "3-5年で本業指標に反映",
    howMuch: "200-500億円規模 / 事業 + 本業への波及効果",
    howMany: "本業ごとに1-3本",
    kpiLogic: "本業ARPU向上率 × 既存顧客数、チャネル損失防止、顧客継続率。新規事業の独立PLではなく『本業への波及効果』で測る。",
    examples: [
      { name: "TOYOTA KINTO", note: "単発販売→継続課金接点、第7期 売上587億円で初の黒字化" },
      { name: "ブリヂストン Tirematics", note: "タイヤ+モニタリング+摩耗予測で本業のプレミアム化" },
      { name: "ヤマト EAZY", note: "宅急便本業を守りつつECでの顧客離脱を防止" },
    ],
    pitfall: "本業との関係が曖昧だと『誰も守らない事業』になる。最初に本業強化型と宣言する必須。収益KPI偏重で本業効果を見落とす罠。",
  },
  {
    id: "option",
    num: "③",
    label: "オプション型",
    subtitle: "将来不確実性への権利",
    desc: "今は赤字でも、将来の規制変化・技術破壊・市場急成長に『参加する権利』を確保する投資。少額分散+トリガー条件設計。",
    fit: "○ 部分採用",
    fitTone: "blue",
    where: "技術・規制・顧客行動が急変する未踏領域 (精密発酵、ディープテック、気候テック)",
    when: "7-15年の超長期、3年ごと継続/拡大/撤退判定",
    howMuch: "1投資 10-50億円 × 10-20案件の分散",
    howMany: "年間10-20件のポートフォリオ (99%撤退前提、1-2%の大成功で全体正当化)",
    kpiLogic: "リアルオプション思考。『うまくいったら本格参入する権利』を最小コストで確保。各オプションに『このKPIで本格投資に昇格、それ以外はクローズ』のトリガーを事前設定。",
    examples: [
      { name: "ソニー CMOSイメージセンサー", note: "1996年投資→25年で世界シェア53%" },
      { name: "味の素 ABF", note: "アミノ酸副産物→半導体絶縁膜で世界シェアほぼ100%" },
      { name: "トヨタ Woven City", note: "2020年構想→2025年本格始動、未来モビリティへの長期オプション" },
    ],
    pitfall: "『実験のための実験』で実装に繋がらない罠。トリガー条件未設定で延々と続けるリスク。",
  },
  {
    id: "purpose",
    num: "④",
    label: "意義型",
    subtitle: "社会課題で稼ぐ",
    desc: "CO2削減・高齢化・食糧安保などを解決し、財務リターンと社会インパクトを両立。カーボンクレジット・ESG資金・政府連携・ブランド価値が収益源。",
    fit: "◎ 本命",
    fitTone: "asahi",
    where: "ネットゼロ、循環経済、ヘルスエイジング、食料安保、グローバルサウス",
    when: "5-15年で社会実装、カーボンクレジット市場と連動",
    howMuch: "100-500億円規模 / 事業 + 政府・国際機関資金活用",
    howMany: "本業シナジーがある1-3本に集中",
    kpiLogic: "ロジックモデル(インプット→アクティビティ→アウトプット→アウトカム→インパクト)。財務KPIとインパクトKPIを併用。",
    examples: [
      { name: "明治 ザ・チョコレート", note: "フェアトレード×プレミアム×デザインで1年3,000万個販売" },
      { name: "パナソニック GREEN IMPACT", note: "2024年度CO2削減貢献量 5,325万トン (目標を大幅超過)" },
      { name: "アサヒ バイオサイクル", note: "国際的にも注目、新興国展開とカーボンクレジット連動可" },
    ],
    pitfall: "『見せかけの社会貢献』(インパクトウォッシング)。逆に財務一辺倒で『削減貢献量を売る道具』に矮小化するのも失敗。",
  },
  {
    id: "redefinition",
    num: "⑤",
    label: "再定義型",
    subtitle: "本業の定義を変える",
    desc: "本業そのものを根本から定義し直し、非コア事業の売却+新コア領域への集中投資を同時実行。最も大胆でCEOが主導するトップダウン型。",
    fit: "△ 長期オプション",
    fitTone: "slate",
    where: "現在の主力事業群そのもの (売却益で新事業に集中投資)",
    when: "10-15年の構造変革、CEO交代3-4回を貫く",
    howMuch: "売却益 1,000-5,000億円の再投資 + 新規投資 数千億円",
    howMany: "本業→新本業への移行 (1:1の交代)",
    kpiLogic: "既存事業そのものを縮退・売却する意思決定を含む。『何を本業と呼ぶか』の定義を変える。",
    examples: [
      { name: "ソニー", note: "ハード→エンタメ/金融、エンタメ3事業で売上6割" },
      { name: "JSR", note: "合成ゴム売却→半導体材料集中、約9,000億円規模TOBで非公開化" },
      { name: "オリンパス", note: "カメラ売却→医療特化、科学事業を約4,276億円で売却" },
    ],
    pitfall: "CEO交代リスク。日本企業の株主・従業員・系列構造で10年貫くのが難しい。AQI単独では決定不可、HD取締役会・CEO案件。",
  },
  {
    id: "platform",
    num: "⑥",
    label: "プラットフォーム型",
    subtitle: "生態系を握る",
    desc: "業界OSを提供し、取引・データ・サービスの基盤を握る。ネットワーク効果が効く領域で有効。",
    fit: "△ 限定採用",
    fitTone: "slate",
    where: "断片化した参加者が多く、自社が中核アセット (顧客ID・物理インフラ・免許) を持つ場面",
    when: "立ち上げ3-5年、ネットワーク効果顕在化に5-8年",
    howMuch: "500-2,000億円規模 (販促+システム+JV出資)",
    howMany: "本柱1-2本 (単一PFに集中投資)",
    kpiLogic: "参加事業者数 × 取引量 (GMV) × Take Rate + データ収益。鶏卵問題を超えるティッピングポイントまでの距離を計測。",
    examples: [
      { name: "PayPay", note: "2025年7月 登録7,000万人、2024年度決済取扱高12.5兆円" },
      { name: "コマツ EARTHBRAIN", note: "コマツ+ドコモ+ソニー+野村総研JV、建設業界PF" },
      { name: "リクルート×Indeed PLUS", note: "国内求職者の7割リーチする求人配信PF" },
    ],
    pitfall: "鶏卵問題で立ち上がらないリスク。自社利益優先で他社が離れると破綻。消費者向けPFは飲料単独では困難。",
  },
];
const ARCHETYPES_BY_ID = Object.fromEntries(ARCHETYPES.map(a => [a.id, a]));

// ---------------------------------------------------------------
//  Phases & Gate Criteria — シーズ事業化6フェーズ
// ---------------------------------------------------------------
const PHASES = [
  {
    id: 1,
    label: "Phase 1",
    name: "アイデア開発",
    stage: "エンジェル",
    desc: "筋の良い + 実現可能な事業アイデアが複数ある",
    nextGate: {
      to: "Phase 2",
      criteria: [
        { id: "p1_seed_maturity",     label: "シーズの成熟度判定が完了している (TRL等)" },
        { id: "p1_market_hypotheses", label: "応用市場の仮説が3つ以上ある" },
        { id: "p1_tam",               label: "TAM 1,000億円以上の候補が1つ以上ある" },
      ],
    },
  },
  {
    id: 2,
    label: "Phase 2",
    name: "市場翻訳・仮説検証",
    stage: "エンジェル",
    desc: "事業アイデアに市場のリアクションがつき、ポテンシャルの優劣が見える",
    nextGate: {
      to: "Phase 3",
      criteria: [
        { id: "p2_target_market",  label: "ターゲット市場が1-2つに確定" },
        { id: "p2_loi",            label: "LoI相当の反応が5件以上" },
        { id: "p2_lab_proven",     label: "プロダクト: ラボ実証済み" },
        { id: "p2_customer_want",  label: "マーケット: 顧客が『欲しい』と表明" },
      ],
    },
  },
  {
    id: 3,
    label: "Phase 3",
    name: "PoC 価値検証",
    stage: "シード",
    desc: "事業化スキーム判断のためのデータが揃っている",
    nextGate: {
      to: "事業化スキーム判断",
      criteria: [
        { id: "p3_pilot_proven",     label: "プロダクト: パイロット環境で実証済み" },
        { id: "p3_paying_customer",  label: "マーケット: 有償顧客が存在" },
        { id: "p3_ltv_cac",          label: "LTV/CAC ≧ 2倍の見込み" },
        { id: "p3_gross_margin",     label: "粗利率 30% 以上の見通し" },
      ],
    },
  },
  {
    id: 4,
    label: "Phase 4",
    name: "PoB 事業検証",
    stage: "シリーズA〜",
    desc: "事業として継続的に成長する仕組みが整っている",
    nextGate: {
      to: "Phase 5",
      criteria: [
        { id: "p4_revenue",            label: "年間売上 5 億円以上" },
        { id: "p4_ltv_cac",            label: "LTV/CAC ≧ 3倍を実データで確認" },
        { id: "p4_gross_margin",       label: "粗利率 30% 以上を達成" },
        { id: "p4_mass_production",    label: "プロダクト: 量産可能" },
        { id: "p4_business_expansion", label: "マーケット: 事業拡大" },
      ],
    },
  },
  {
    id: 5,
    label: "Phase 5",
    name: "スケール × EXIT",
    stage: "EXIT",
    desc: "フルスケール量産+EXIT判断段階",
    nextGate: null,
  },
];
const PHASES_BY_ID = Object.fromEntries(PHASES.map(p => [p.id, p]));
const ALL_GATE_CRITERIA = Object.fromEntries(
  PHASES.flatMap(p => (p.nextGate?.criteria || []).map(c => [c.id, c]))
);

// ---------------------------------------------------------------
//  State persistence (localStorage) — lightweight store
// ---------------------------------------------------------------
const LS_KEY = "sprout:v1";
function loadState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) { return null; }
}
function saveState(s) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch (e) {}
}
function defaultState(data) {
  // --- 2つのサンプルアイデアに紐づく初期判断(例示のため) ---
  const initialDecisions = {
    // 採択済み例 (3役員全員が承認)
    i_airbeer: {
      u_nakamura:  { decision:"approve", note:"技術面の裏付けは十分。量産化の詰めは残るが GO。",                             at:"2026-04-06" },
      u_hayashida: { decision:"approve", note:"別スキーム(子会社化)で独立採算にすればさらに収益性が見込める。",               at:"2026-04-07" },
      u_ueda:      { decision:"approve", note:"採択します。CO2-LOOP外販の発想まで踏み込んでいる点を高く評価。",               at:"2026-04-18" },
    },
    // レビュー中例 (林田:承認 / 中村:保留 / 上田:未判断)
    i_soberwellness: {
      u_hayashida: { decision:"approve", note:"GMV想定は保守的。投資インテンシティを上げて米Athletic級を狙うべき。",          at:"2026-04-22" },
      u_nakamura:  { decision:"hold",    note:"ブランド設計次第。カニバリを抑えるスキームが欲しい。",                         at:"2026-04-23" },
    },
  };

  // サンプルアイデア以外のステータス上書きはなし
  const initialStatusOverride = {};

  // --- Idea version history (サンプル用) ---
  //  i_soberwellness に、過去2版の差分を仕込んでおく(改訂ストーリーを見せる)
  const initialHistory = {
    i_soberwellness: [
      {
        v: 1, at: "2026-04-15 09:00", by: "u_shibata",
        changeNote: "初稿 (プレミアム・ノンアル単品として提出)",
        format: {
          problem: "若年層のアルコール離れが起きており、新規事業が必要。",
          customer: "20-30代の都市部男女。",
          solution: "REAL-ZERO を使った本格ノンアルビール。",
          unfairAdvantage: "自社ノンアル発酵の官能データ。",
          marketSize: "国内ノンアル市場 $1.2B (2028)。",
          goToMarket: "Phase1: 全国CVS展開。",
          businessModel: "小売中心、単価200円。",
          competitors: "既存ノンアルブランド各社。",
          roadmap: [{ period:"〜2026 Q4", milestone:"商品設計" }],
          risks:  ["既存ブランドとのカニバリ"],
          ask: "開発費 8,000万円。"
        }
      },
      {
        v: 2, at: "2026-04-19 14:30", by: "u_shibata",
        changeNote: "山田さんのFBを受けて、単品→ライフスタイルブランド化。GLP-1 トレンドを追加。",
        format: {
          problem: "GLP-1 の普及で『飲む量 × 飲む動機』の両方が構造変化。既存のビール事業の将来需要が収縮する可能性。",
          customer: "都市部 25-45歳、健康・パフォーマンスに投資する層。プライマリは『飲酒習慣を減らしつつも体験の豊かさを捨てたくない人』。",
          solution: "REAL-ZERO の本格風味 × Hop-β のリラックス機能性を掛け合わせた、気分デザインのノンアルプレミアムブランド。",
          unfairAdvantage: "20年超の官能評価データと、独自酵母・独自機能性素材。",
          marketSize: "国内 $2.5B + 海外 $28B(2030予測)。初期3年で国内 50億円 GMV 目標。",
          goToMarket: "Phase1: プレミアム外食 / Phase2: 高感度スーパー+EC / Phase3: GMS・海外。",
          businessModel: "D2Cサブスク + 外食BtoB + プレミアム小売。",
          competitors: "Athletic Brewing, Recess, 国内大手各社のノンアル派生。",
          roadmap: [
            { period:"〜2026 Q3", milestone:"プロトタイプ5SKU試作" },
            { period:"2026 Q4",  milestone:"都内ゼロプルーフバー 3店舗で先行" },
            { period:"2027 Q1",  milestone:"D2C ローンチ" },
          ],
          risks: ["機能性表示の取得遅延","プレミアム単価の受容性"],
          ask: "R&D+マーケ 1.2億円。",
        }
      },
      // v3 = current (同じデータを data.js から使う想定、ここには出さない)
    ],
  };

  // Structured budget (億円) — サンプル2件のみ
  const budgets = {
    i_soberwellness: 1.8,
    i_airbeer: 3.2,
  };

  // Post-approval portfolio tracking (milestones for 採択 ideas)
  const portfolio = {
    i_airbeer: {
      progress: 42,
      nextGate: "2026-06-15 Phase 1 プロトタイプ試作レビュー",
      milestones: [
        { at:"2026-04-18", label:"採択決定", done:true },
        { at:"2026-05-01", label:"チーム編成完了 (4名)", done:true },
        { at:"2026-06-15", label:"Phase 1 プロト試作", done:false, current:true },
        { at:"2026-08-30", label:"欧州小売2社との商談",  done:false },
        { at:"2026-Q4",    label:"欧州ローンチ判定ゲート", done:false },
      ],
      kpi: { budget: 3.2, spent: 0.6, team: 4 },
    },
  };

  return {
    likedArticles: {},                  // id -> true
    savedArticles: {},                  // id -> true
    ideaLikes: Object.fromEntries(data.ideas.map(i => [i.id, i.likes])),
    ideaLikedBy: Object.fromEntries(data.ideas.map(i => [i.id, [...(i.likedBy||[])]])),
    extraIdeas: [],
    extraFeedback: [],
    dismissedSuggestions: {},
    checklistDismissed: false,
    streak: { count: 0, lastPost: null },

    // --- personalization / onboarding ---
    prefs: {
      onboarded: false,
      focusSeeds:    ["s_yas17","s_hopbeta","s_lb4012"],  // 担当シーズ
      focusDomains:  ["発酵/酵母","健康/機能性","飲料全般"], // 関心カテゴリ
      depth: "regular",                                    // light|regular|deep
    },

    // --- read state (unread tracking) ---
    readIdeas: {},       // ideaId -> ISO timestamp last read
    readFeedback: {},    // feedbackId -> true

    // --- decisions (exec workflow) ---
    decisions: initialDecisions,  // { ideaId: { userId: { decision, note, at } } }
    ideaStatusOverride: initialStatusOverride,
    budgets,
    portfolio,

    // --- version history ---
    ideaHistory: initialHistory,  // { ideaId: [ {v, at, by, changeNote, format} ] }
  };
}

// Global app store (custom hook)
function useStore() {
  const data = window.SPROUT_DATA;
  const [state, setState] = useState(() => {
    const saved = loadState();
    if (!saved) return defaultState(data);
    // Merge defaults with saved — so adding new fields in later versions won't break old state
    const fresh = defaultState(data);
    return { ...fresh, ...saved,
      prefs:        { ...fresh.prefs,        ...(saved.prefs||{}) },
      decisions:    { ...fresh.decisions,    ...(saved.decisions||{}) },
      budgets:      { ...fresh.budgets,      ...(saved.budgets||{}) },
      portfolio:    { ...fresh.portfolio,    ...(saved.portfolio||{}) },
      ideaHistory:  { ...fresh.ideaHistory,  ...(saved.ideaHistory||{}) },
      readIdeas:    { ...(saved.readIdeas||{}) },
      readFeedback: { ...(saved.readFeedback||{}) },
    };
  });
  useEffect(() => { saveState(state); }, [state]);

  const api = useMemo(() => ({
    toggleArticleLike: (id) => setState(s => ({ ...s, likedArticles: toggle(s.likedArticles, id) })),
    toggleArticleSave: (id) => setState(s => ({ ...s, savedArticles: toggle(s.savedArticles, id) })),
    toggleIdeaLike: (ideaId, userId="u_shibata") => setState(s => {
      const liked = (s.ideaLikedBy[ideaId]||[]).includes(userId);
      const nextLikedBy = liked
        ? (s.ideaLikedBy[ideaId]||[]).filter(u => u !== userId)
        : [...(s.ideaLikedBy[ideaId]||[]), userId];
      const nextLikes = (s.ideaLikes[ideaId]||0) + (liked ? -1 : 1);
      return { ...s, ideaLikes: {...s.ideaLikes, [ideaId]: nextLikes}, ideaLikedBy: {...s.ideaLikedBy, [ideaId]: nextLikedBy} };
    }),
    addIdea: (idea) => setState(s => ({ ...s, extraIdeas: [idea, ...s.extraIdeas], ideaLikes: {...s.ideaLikes, [idea.id]: 0}, ideaLikedBy: {...s.ideaLikedBy, [idea.id]: []} })),
    updateIdea: (id, patch) => setState(s => ({
      ...s,
      extraIdeas: s.extraIdeas.map(i => i.id === id ? { ...i, ...patch, updatedAt: todayISO() } : i),
    })),
    deleteIdea: (id) => setState(s => {
      const { [id]: _l1, ...likes } = s.ideaLikes;
      const { [id]: _l2, ...likedBy } = s.ideaLikedBy;
      const { [id]: _h, ...history } = s.ideaHistory || {};
      const { [id]: _d, ...decisions } = s.decisions || {};
      const { [id]: _b, ...budgets } = s.budgets || {};
      const { [id]: _p, ...portfolio } = s.portfolio || {};
      const { [id]: _o, ...override } = s.ideaStatusOverride || {};
      return {
        ...s,
        extraIdeas: s.extraIdeas.filter(i => i.id !== id),
        extraFeedback: (s.extraFeedback || []).filter(f => f.ideaId !== id),
        ideaLikes: likes, ideaLikedBy: likedBy,
        ideaHistory: history, decisions: decisions,
        budgets, portfolio, ideaStatusOverride: override,
      };
    }),
    addFeedback: (fb) => setState(s => ({ ...s, extraFeedback: [...s.extraFeedback, fb] })),
    dismissSuggestion: (id) => setState(s => ({ ...s, dismissedSuggestions: { ...s.dismissedSuggestions, [id]: true } })),
    dismissChecklist: () => setState(s => ({ ...s, checklistDismissed: true })),
    resetChecklist: () => setState(s => ({ ...s, checklistDismissed: false })),
    reset: () => setState(defaultState(data)),

    // --- prefs ---
    setPrefs: (patch) => setState(s => ({ ...s, prefs: { ...s.prefs, ...patch, onboarded: true } })),
    resetOnboarding: () => setState(s => ({ ...s, prefs: { ...s.prefs, onboarded: false } })),

    // --- read tracking ---
    markIdeaRead: (ideaId) => setState(s => ({ ...s, readIdeas: { ...s.readIdeas, [ideaId]: new Date().toISOString() } })),
    markFeedbackRead: (fbId) => setState(s => ({ ...s, readFeedback: { ...s.readFeedback, [fbId]: true } })),

    // --- version history ---
    snapshotIdea: (ideaId, snapshot) => setState(s => {
      const prev = s.ideaHistory[ideaId] || [];
      const v = (prev[prev.length-1]?.v || 0) + 1;
      const next = [...prev, { ...snapshot, v, at: new Date().toISOString().slice(0,16).replace("T"," ") }];
      return { ...s, ideaHistory: { ...s.ideaHistory, [ideaId]: next } };
    }),

    // --- decision workflow ---
    decideIdea: (ideaId, userId, decision, note="") => setState(s => {
      const cur = s.decisions[ideaId] || {};
      const next = { ...cur, [userId]: { decision, note, at: new Date().toISOString().slice(0,10) } };
      // If approved by ≥2 execs, mark idea as 採択
      const approvedCount = Object.values(next).filter(d => d.decision === "approve").length;
      const rejectedAny = Object.values(next).some(d => d.decision === "reject");
      const ideaStatusOverride = approvedCount >= 2 ? "採択"
                               : rejectedAny       ? "差し戻し"
                               : Object.keys(next).length > 0 ? "役員レビュー中"
                               : undefined;
      return {
        ...s,
        decisions: { ...s.decisions, [ideaId]: next },
        ideaStatusOverride: { ...(s.ideaStatusOverride||{}), ...(ideaStatusOverride ? { [ideaId]: ideaStatusOverride } : {}) },
      };
    }),
  }), [data]);

  function toggle(obj, id) { const c = {...obj}; if (c[id]) delete c[id]; else c[id] = true; return c; }
  return { state, ...api };
}

// ---------------------------------------------------------------
//  Helpers: status, consensus, unread
// ---------------------------------------------------------------
function effectiveStatus(idea, state) {
  return (state.ideaStatusOverride && state.ideaStatusOverride[idea.id]) || idea.status;
}
function consensusOf(ideaId, state) {
  const dd = state.decisions[ideaId] || {};
  const entries = Object.entries(dd);
  return {
    approve: entries.filter(([,d]) => d.decision === "approve"),
    reject:  entries.filter(([,d]) => d.decision === "reject"),
    hold:    entries.filter(([,d]) => d.decision === "hold"),
    all: entries,
  };
}
function useUnreadFBCount() {
  const data = window.SPROUT_DATA;
  const app = useApp();
  const me = data.me;
  return useMemo(() => {
    const myIdeas = new Set(allIdeas(data, app).filter(i => i.author === me.id).map(i => i.id));
    return allFeedback(data, app)
      .filter(f => myIdeas.has(f.ideaId) && f.author !== me.id && !app.state.readFeedback[f.id])
      .length;
  }, [app.state.readFeedback, app.state.extraFeedback, app.state.extraIdeas]);
}

// ---------------------------------------------------------------
//  Live ingestion hook — fetches /api/articles from local Python server
// ---------------------------------------------------------------
function useLiveArticles() {
  const [live, setLive] = useState({
    articles: [],
    sourceStatus: {},
    fetchedAt: null,
    loading: true,
    error: null,
    lastRefreshedAt: null,
  });
  const refresh = useCallback((force = false) => {
    setLive(s => ({ ...s, loading: true, error: null }));
    fetch(`/api/articles${force ? "?refresh=1" : ""}`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(d => setLive({
        articles: d.articles || [],
        sourceStatus: d.sourceStatus || {},
        fetchedAt: d.fetchedAt,
        cacheTTL: d.cacheTTL,
        llm: d.llm || { enabled: false },
        loading: false,
        error: null,
        lastRefreshedAt: new Date().toISOString(),
      }))
      .catch(e => setLive(s => ({ ...s, loading: false, error: String(e.message || e) })));
  }, []);
  useEffect(() => { refresh(false); }, [refresh]);
  return { ...live, refresh };
}

// ---------------------------------------------------------------
//  Tiny hash router
// ---------------------------------------------------------------
function useHashRoute() {
  const [hash, setHash] = useState(() => window.location.hash || "#/");
  useEffect(() => {
    const onChange = () => setHash(window.location.hash || "#/");
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  const parts = hash.replace(/^#\/?/, "").split("?")[0].split("/").filter(Boolean);
  const query = Object.fromEntries(new URLSearchParams((hash.split("?")[1] || "")));
  return { hash, parts, query, navigate: (h) => { window.location.hash = h; } };
}

// ---------------------------------------------------------------
//  SVG Icons (inline — lucide-like)
// ---------------------------------------------------------------
function Icon({ name, className = "w-4 h-4", strokeWidth = 1.75 }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth, strokeLinecap: "round", strokeLinejoin: "round", viewBox: "0 0 24 24", className };
  switch (name) {
    case "sparkles": return <svg {...common}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/></svg>;
    case "home":     return <svg {...common}><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1v-9.5Z"/></svg>;
    case "rss":      return <svg {...common}><path d="M4 11a9 9 0 0 1 9 9"/><path d="M4 4a16 16 0 0 1 16 16"/><circle cx="5" cy="19" r="1"/></svg>;
    case "beaker":   return <svg {...common}><path d="M4.5 3h15M6 3v7.5L3 19a2 2 0 0 0 1.8 3h14.4A2 2 0 0 0 21 19l-3-8.5V3"/><path d="M7 15h10"/></svg>;
    case "bulb":     return <svg {...common}><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.4c.8.8 1.4 1.8 1.6 2.6h4.8c.2-.8.8-1.8 1.6-2.6A6 6 0 0 0 12 3Z"/></svg>;
    case "inbox":    return <svg {...common}><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5 5h14l3 7v7a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-7l3-7Z"/></svg>;
    case "user":     return <svg {...common}><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>;
    case "search":   return <svg {...common}><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>;
    case "bell":     return <svg {...common}><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9Z"/><path d="M10.5 21a1.5 1.5 0 0 0 3 0"/></svg>;
    case "heart":    return <svg {...common}><path d="M20.8 5.6A5.5 5.5 0 0 0 12 4a5.5 5.5 0 0 0-8.8 1.6C1.6 8.8 3.7 12.7 12 20c8.3-7.3 10.4-11.2 8.8-14.4Z"/></svg>;
    case "heart-fill": return <svg viewBox="0 0 24 24" className={className} fill="currentColor"><path d="M20.8 5.6A5.5 5.5 0 0 0 12 4a5.5 5.5 0 0 0-8.8 1.6C1.6 8.8 3.7 12.7 12 20c8.3-7.3 10.4-11.2 8.8-14.4Z"/></svg>;
    case "bookmark": return <svg {...common}><path d="M6 3h12v18l-6-4-6 4V3Z"/></svg>;
    case "bookmark-fill": return <svg viewBox="0 0 24 24" className={className} fill="currentColor"><path d="M6 3h12v18l-6-4-6 4V3Z"/></svg>;
    case "pencil":   return <svg {...common}><path d="M4 20h4l10.5-10.5-4-4L4 16v4Z"/><path d="m13.5 5.5 4 4"/></svg>;
    case "plus":     return <svg {...common}><path d="M12 5v14M5 12h14"/></svg>;
    case "arrow-right": return <svg {...common}><path d="M5 12h14M13 5l7 7-7 7"/></svg>;
    case "arrow-up-right": return <svg {...common}><path d="M7 17 17 7M8 7h9v9"/></svg>;
    case "chevron-right": return <svg {...common}><path d="m9 6 6 6-6 6"/></svg>;
    case "chevron-down":  return <svg {...common}><path d="m6 9 6 6 6-6"/></svg>;
    case "link":     return <svg {...common}><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg>;
    case "fire":     return <svg {...common}><path d="M12 22c4 0 7-3 7-7 0-4-3-5-3-9-3 2-5 5-5 8-1-1-2-2-2-4-2 2-3 4-3 5 0 4 3 7 6 7Z"/></svg>;
    case "globe":    return <svg {...common}><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/></svg>;
    case "chart":    return <svg {...common}><path d="M3 20h18M7 16v-6M12 16V8M17 16v-10"/></svg>;
    case "tag":      return <svg {...common}><path d="M3 12V4h8l10 10-8 8L3 12Z"/><circle cx="8" cy="8" r="1.5"/></svg>;
    case "send":     return <svg {...common}><path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z"/></svg>;
    case "check":    return <svg {...common}><path d="m5 12 5 5L20 7"/></svg>;
    case "eye":      return <svg {...common}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>;
    case "clock":    return <svg {...common}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>;
    case "filter":   return <svg {...common}><path d="M3 5h18l-7 9v5l-4 2v-7L3 5Z"/></svg>;
    case "message":  return <svg {...common}><path d="M4 5h16v11H8l-4 4V5Z"/></svg>;
    case "flame":    return <svg {...common}><path d="M12 22c4 0 7-2.5 7-7 0-3-2-5-2-8 0 0-2 1-3 3-1-1-1-3-1-5-4 4-7 6-7 11 0 3.5 2 6 6 6Z"/></svg>;
    case "trophy":   return <svg {...common}><path d="M7 4h10v5a5 5 0 0 1-10 0V4Z"/><path d="M5 4h2M17 4h2M12 14v4M8 20h8"/></svg>;
    case "bolt":     return <svg {...common}><path d="M13 2 3 14h7l-1 8 10-12h-7l1-8Z"/></svg>;
    case "database": return <svg {...common}><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/></svg>;
    case "x":        return <svg {...common}><path d="M6 6l12 12M6 18 18 6"/></svg>;
    case "dots":     return <svg {...common}><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg>;
    case "stars":    return <svg {...common}><path d="M12 3v6M12 15v6M3 12h6M15 12h6"/></svg>;
    case "award":    return <svg {...common}><circle cx="12" cy="9" r="6"/><path d="m8 14-2 8 6-3 6 3-2-8"/></svg>;
    case "quote":    return <svg {...common}><path d="M7 7h4v4H7z"/><path d="M13 7h4v4h-4z"/><path d="M7 11v3a3 3 0 0 0 3 3"/><path d="M13 11v3a3 3 0 0 0 3 3"/></svg>;
    case "logo":     return <svg viewBox="0 0 64 64" className={className}><circle cx="32" cy="32" r="30" fill="#DA3A2C"/><path d="M20 42c0-10 6-18 12-18s12 8 12 18" stroke="white" strokeWidth="4" fill="none" strokeLinecap="round"/><path d="M32 24V14" stroke="white" strokeWidth="4" strokeLinecap="round"/></svg>;
    default: return null;
  }
}

// ---------------------------------------------------------------
//  Small UI primitives
// ---------------------------------------------------------------
function Avatar({ user, size = 8, className = "" }) {
  if (!user) return null;
  const dim = `h-${size} w-${size}`;
  return (
    <div className={`${dim} ${user.color} text-white font-semibold rounded-full flex items-center justify-center text-xs shadow-sm ring-1 ring-white/60 ${className}`}>
      {user.avatar}
    </div>
  );
}

function Badge({ tone = "slate", children, className = "" }) {
  const tones = {
    slate:   "bg-ink-100 text-ink-700",
    red:     "bg-asahi-50 text-asahi-700 ring-1 ring-asahi-200",
    green:   "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
    blue:    "bg-sky-50 text-sky-700 ring-1 ring-sky-200",
    amber:   "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
    violet:  "bg-violet-50 text-violet-700 ring-1 ring-violet-200",
    dark:    "bg-ink-900 text-white",
  };
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${tones[tone]} ${className}`}>{children}</span>;
}

function Button({ variant = "primary", size = "md", icon, children, className = "", ...p }) {
  const base = "inline-flex items-center justify-center gap-1.5 font-semibold rounded-lg transition active:scale-[.98] disabled:opacity-50";
  const sizes = { sm:"h-8 px-3 text-[12px]", md:"h-9 px-3.5 text-[13px]", lg:"h-11 px-5 text-[14px]" };
  const variants = {
    primary:  "bg-asahi-500 hover:bg-asahi-600 text-white shadow-sm",
    dark:     "bg-ink-900 hover:bg-ink-800 text-white shadow-sm",
    ghost:    "text-ink-700 hover:bg-ink-100",
    outline:  "border border-ink-200 hover:bg-ink-50 text-ink-800",
    soft:     "bg-ink-100 hover:bg-ink-200 text-ink-800",
    success:  "bg-emerald-600 hover:bg-emerald-700 text-white",
  };
  return (
    <button className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} {...p}>
      {icon && <Icon name={icon} className="w-4 h-4" />}
      {children}
    </button>
  );
}

function Card({ children, className = "", as: As = "div", ...p }) {
  return <As className={`bg-white rounded-xl shadow-card ring-1 ring-ink-100/80 ${className}`} {...p}>{children}</As>;
}

function Tag({ children, active=false, onClick }) {
  return (
    <button onClick={onClick} className={`px-3 h-7 rounded-full text-[11.5px] font-semibold border transition whitespace-nowrap ${active ? "bg-asahi-500 text-white border-asahi-500 shadow-sm" : "bg-white text-ink-700 border-ink-200 hover:border-asahi-300 hover:text-asahi-700"}`}>
      {children}
    </button>
  );
}

// Accessible modal shell
function Modal({ open, onClose, children, size = "lg" }) {
  if (!open) return null;
  const widths = { md:"max-w-md", lg:"max-w-2xl", xl:"max-w-4xl", "2xl":"max-w-6xl" };
  return (
    <div className="fixed inset-0 z-50 flex items-start md:items-center justify-center p-4 bg-ink-900/40 backdrop-blur-sm fade-in" onClick={onClose}>
      <div className={`bg-white w-full ${widths[size]} rounded-2xl shadow-pop ring-1 ring-ink-200 overflow-hidden`} onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------
//  App Shell (Sidebar + Header + Main)
// ---------------------------------------------------------------
const StoreCtx = createContext(null);
const useApp = () => useContext(StoreCtx);
const LiveCtx = createContext(null);
const useLive = () => useContext(LiveCtx);

function Shell({ children }) {
  const { navigate, parts } = useHashRoute();
  const app = useApp();
  const data = window.SPROUT_DATA;
  const route = parts[0] || "dashboard";
  const unreadFBCount = useUnreadFBCount();

  const nav = [
    { key: "dashboard", label: "ニュース", icon:"rss" },
    { key: "ideas",     label: "アイデア", icon:"bulb", badge: unreadFBCount },
    { key: "seeds",     label: "シーズ",   icon:"beaker" },
  ];
  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-56 shrink-0 border-r border-ink-100 bg-white hidden md:flex flex-col">
        <div className="px-5 py-5 flex items-center gap-2.5">
          <Icon name="logo" className="w-8 h-8" />
          <div className="font-extrabold tracking-tight text-[15px] text-ink-900">SPROUT</div>
        </div>
        <nav className="flex-1 px-3 space-y-1">
          {nav.map(n => {
            const active = route === n.key;
            return (
              <a key={n.key} href={`#/${n.key}`}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg transition ${
                  active ? "bg-asahi-50 text-asahi-700 font-bold" : "text-ink-600 hover:bg-ink-50 font-medium"}`}>
                <Icon name={n.icon} className="w-[18px] h-[18px]"/>
                <span className="text-[13px] flex-1">{n.label}</span>
                {n.badge > 0 && (
                  <span className="text-[10.5px] font-bold px-1.5 h-5 min-w-5 rounded-full flex items-center justify-center bg-asahi-500 text-white">
                    {n.badge}
                  </span>
                )}
              </a>
            );
          })}
          <div className="pt-3">
            <button
              onClick={() => startBlankIdea(app, data)}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-asahi-500 text-white hover:bg-asahi-600 transition text-[13px] font-semibold">
              <Icon name="plus" className="w-4 h-4"/> アイデアを書く
            </button>
          </div>
        </nav>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <Header />
        <main className="flex-1 overflow-x-hidden">
          <div className="mx-auto max-w-[1440px]">{children}</div>
        </main>
      </div>
    </div>
  );
}

function DailyStreak() {
  const data = window.SPROUT_DATA;
  const app = useApp();
  const myIdeasCount = allIdeas(data, app).filter(i => i.author === data.me.id && !i.isExample).length;
  const streak = app.state.streak.count;
  const active = streak > 0;
  return (
    <Card className="p-3 ring-1 ring-cream-200/80 bg-white">
      <div className="flex items-center gap-2.5">
        <div className={`h-10 w-10 rounded-xl flex items-center justify-center text-white shrink-0 ${active ? "bg-asahi-500 shadow-sm" : "bg-ink-200 text-ink-400"}`}>
          <Icon name="flame" className="w-5 h-5" strokeWidth={2.2}/>
        </div>
        <div className="leading-tight flex-1 min-w-0">
          <div className="text-[10.5px] text-ink-500 font-semibold tracking-wide">連続アウトプット</div>
          <div className="flex items-baseline gap-1">
            <div className="text-[18px] font-extrabold text-ink-900 tabular-nums">{streak}</div>
            <div className="text-[11px] text-ink-500 font-semibold">日連続</div>
          </div>
        </div>
      </div>
      <div className="mt-2.5 grid grid-cols-14 gap-[3px]" style={{gridTemplateColumns:"repeat(14, minmax(0, 1fr))"}}>
        {Array.from({length:14}).map((_, i) => {
          const on = i >= 14 - streak;
          return <div key={i} className={`h-2 rounded-sm transition ${on ? "bg-gradient-to-b from-asahi-400 to-asahi-500" : "bg-ink-100"}`} title={`${14-i}日前`}/>
        })}
      </div>
      <div className="text-[10.5px] text-ink-500 mt-2 leading-relaxed">
        {myIdeasCount > 0
          ? <>今月のアイデア投稿 <b className="text-sprout-700">{myIdeasCount}</b> 本 🌱</>
          : <>最初の1本を書いて、習慣をスタート 🌱</>}
      </div>
    </Card>
  );
}

function Header() {
  const data = window.SPROUT_DATA;
  const app = useApp();
  const me = data.me;
  const [q, setQ] = useState("");
  const [notifOpen, setNotifOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const unread = useMemo(() => buildNotifications(data, app), [app.state.readFeedback, app.state.readIdeas, app.state.extraFeedback, app.state.ideaStatusOverride]);
  const unreadCount = unread.filter(n => !n.read).length;

  return (
    <header className="bg-white/80 backdrop-blur border-b border-ink-200 sticky top-0 z-30">
      <div className="h-14 px-5 flex items-center gap-3">
        <button onClick={()=>window.__openPalette?.()}
          className="flex-1 max-w-xl relative h-9 pl-9 pr-3 text-[13px] rounded-lg border border-ink-200 hover:border-ink-400 outline-none bg-ink-50/60 flex items-center gap-2 text-ink-500 transition">
          <Icon name="search" className="w-4 h-4 absolute left-3 text-ink-400" />
          <span className="flex-1 text-left">シーズ・記事・アイデアを検索...</span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 h-5 text-[10px] rounded bg-white border border-ink-200 font-mono text-ink-500">⌘</kbd>
            <kbd className="px-1.5 h-5 text-[10px] rounded bg-white border border-ink-200 font-mono text-ink-500">K</kbd>
          </span>
        </button>
        <div className="flex items-center gap-2">
          {/* Settings menu */}
          <div className="relative">
            <button onClick={()=>setMenuOpen(v=>!v)} title="設定"
              className="h-9 w-9 rounded-lg flex items-center justify-center text-ink-600 hover:bg-ink-100">
              <Icon name="dots" className="w-[18px] h-[18px]"/>
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={()=>setMenuOpen(false)}/>
                <div className="absolute right-0 top-11 w-56 bg-white rounded-xl shadow-pop ring-1 ring-ink-200 p-1.5 z-40">
                  <a href="#/guide" onClick={()=>setMenuOpen(false)} className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-ink-50 text-[12.5px] text-ink-700">
                    <Icon name="bulb" className="w-4 h-4 text-ink-500"/> 使い方ガイド
                  </a>
                  <a href="#/sources" onClick={()=>setMenuOpen(false)} className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-ink-50 text-[12.5px] text-ink-700">
                    <Icon name="database" className="w-4 h-4 text-ink-500"/> 情報ソース管理
                  </a>
                  <div className="h-px bg-ink-100 my-1"/>
                  <button onClick={()=>{ app.resetOnboarding(); setMenuOpen(false); window.location.hash="#/dashboard"; }}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-ink-50 text-[12.5px] text-ink-700">
                    <Icon name="sparkles" className="w-4 h-4 text-ink-500"/> オンボーディングをやり直す
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Notifications bell */}
          <div className="relative">
            <button onClick={()=>setNotifOpen(v=>!v)} className="relative h-9 w-9 rounded-lg hover:bg-ink-100 flex items-center justify-center text-ink-700">
              <Icon name="bell" className="w-[18px] h-[18px]"/>
              {unreadCount > 0 && (
                <span className="absolute top-0.5 right-0.5 min-w-4 h-4 px-1 rounded-full bg-asahi-500 ring-2 ring-white text-white text-[9.5px] font-bold flex items-center justify-center">{unreadCount > 9 ? "9+" : unreadCount}</span>
              )}
            </button>
            {notifOpen && <NotificationsMenu items={unread} onClose={()=>setNotifOpen(false)}/>}
          </div>

        </div>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------
//  Notifications (unread events)
// ---------------------------------------------------------------
function buildNotifications(data, app) {
  const me = data.me;
  const all = [];
  const myIdeaIds = new Set(allIdeas(data, app).filter(i => i.author === me.id).map(i => i.id));
  allFeedback(data, app).forEach(f => {
    if (!myIdeaIds.has(f.ideaId) || f.author === me.id) return;
    if (app.state.readFeedback[f.id]) return;
    all.push({
      id: "n_fb_" + f.id,
      kind: "feedback",
      at: f.at,
      text: `${data.usersById[f.author]?.name} がコメント — ${data.ideasById[f.ideaId]?.codename}`,
      preview: f.text.slice(0, 80) + (f.text.length > 80 ? "…" : ""),
      href: `#/ideas/${f.ideaId}`,
      read: false,
      actor: data.usersById[f.author],
    });
  });
  all.sort((a,b) => (b.at||"").localeCompare(a.at||""));
  return all.slice(0, 12);
}

function NotificationsMenu({ items, onClose }) {
  const data = window.SPROUT_DATA;
  const app = useApp();
  return (
    <>
      <div className="fixed inset-0 z-30" onClick={onClose}/>
      <div className="absolute right-0 top-11 w-96 bg-white rounded-xl shadow-pop ring-1 ring-ink-200 overflow-hidden z-40">
        <div className="px-4 py-3 border-b border-ink-100 flex items-center justify-between">
          <div className="font-extrabold text-[13px] text-ink-900">通知</div>
          <span className="text-[11px] text-ink-500">{items.length} 件の未読</span>
        </div>
        <div className="max-h-96 overflow-auto">
          {items.length === 0 && <div className="p-8 text-center text-[12px] text-ink-500">未読はありません ✨</div>}
          {items.map(n => (
            <a key={n.id} href={n.href} onClick={()=>{
              if (n.kind === "feedback") app.markFeedbackRead(n.id.replace("n_fb_",""));
              onClose();
            }} className="flex items-start gap-3 px-4 py-3 border-b border-ink-100 hover:bg-ink-50 transition">
              <Avatar user={n.actor} size={7}/>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[12.5px] font-bold text-ink-900 truncate">{n.text}</span>
                  {n.amount && <Badge tone="amber">¥{n.amount.toFixed(1)}億</Badge>}
                </div>
                <div className="text-[11.5px] text-ink-600 line-clamp-2 mt-0.5">{n.preview}</div>
                <div className="text-[10.5px] text-ink-400 mt-1">{n.at}</div>
              </div>
            </a>
          ))}
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------
//  Helpers — derived data
// ---------------------------------------------------------------
function allIdeas(data, app) {
  return [...app.state.extraIdeas, ...data.ideas];
}
function allFeedback(data, app) {
  return [...data.feedback, ...app.state.extraFeedback];
}
function fmtDate(d) { return d; }
function relTime(d) {
  const today = new Date("2026-04-27");
  const then  = new Date(d);
  const days  = Math.floor((today - then) / (1000*60*60*24));
  if (isNaN(days)) return d;
  if (days <= 0) return "今日";
  if (days === 1) return "昨日";
  if (days < 7) return `${days}日前`;
  if (days < 30) return `${Math.floor(days/7)}週間前`;
  return `${Math.floor(days/30)}ヶ月前`;
}

// ---------------------------------------------------------------
//  Page: Dashboard (萌芽探索RSS)
// ---------------------------------------------------------------
function Dashboard() {
  const data = window.SPROUT_DATA;
  const app = useApp();
  const live = useLive();
  const { navigate } = useHashRoute();
  const [cat, setCat] = useState("all");
  const [sort, setSort] = useState("new");
  const [seedFilter, setSeedFilter] = useState(null); // seedId
  const [onlyLive, setOnlyLive] = useState(false);

  // Combine live + mock (live first). Dedupe by id.
  const baseArticles = useMemo(() => {
    const mock = data.articles.map(a => ({ ...a, live: false }));
    const merged = [...(live.articles || []), ...mock];
    const seen = new Set();
    return merged.filter(a => {
      const k = a.id;
      if (seen.has(k)) return false;
      seen.add(k); return true;
    });
  }, [data.articles, live.articles]);

  // Personalized top-5 from user prefs (focusSeeds + focusDomains)
  const prefs = app.state.prefs;
  const yourFive = useMemo(() => {
    const focusSeeds = new Set(prefs.focusSeeds || []);
    const focusDomains = new Set(prefs.focusDomains || []);
    const scored = baseArticles.map(a => {
      const seedHits = (a.relatedSeeds || []).filter(s => focusSeeds.has(s)).length;
      const domHits  = (a.tags || []).filter(d => focusDomains.has(d)).length;
      const score = seedHits * 2 + domHits;  // seeds weigh more
      return { a, score };
    })
    .filter(x => x.score > 0)
    .sort((x,y) => y.score - x.score || (y.a.date||"").localeCompare(x.a.date||""));
    return scored.slice(0, 5).map(x => x.a);
  }, [baseArticles, prefs.focusSeeds, prefs.focusDomains]);

  const articles = useMemo(() => {
    let out = baseArticles.slice();
    if (onlyLive) out = out.filter(a => a.live);
    if (cat !== "all") out = out.filter(a => a.category === cat);
    if (seedFilter) out = out.filter(a => (a.relatedSeeds || []).includes(seedFilter));
    if (sort === "new")       out.sort((a,b) => (b.date||"").localeCompare(a.date||""));
    if (sort === "important") out.sort((a,b) => (b.importance||0) - (a.importance||0));
    if (sort === "trending")  out.sort((a,b) => (b.trending?1:0) - (a.trending?1:0));
    return out.slice(0, 60); // cap UI
  }, [baseArticles, cat, sort, seedFilter, onlyLive]);

  // 自分の未完ドラフト (続きを書く用)
  const myDrafts = useMemo(() => {
    return (app.state.extraIdeas || [])
      .filter(i => i.author === data.me.id && i.status === "ドラフト")
      .sort((a,b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""))
      .slice(0, 3);
  }, [app.state.extraIdeas]);

  return (
    <div className="p-6 lg:p-10 max-w-3xl mx-auto space-y-6">
      <OnboardingChecklist/>

      {/* Hero: アイデアを書く (3エントリ) */}
      <Card className="p-5 lg:p-6 bg-gradient-to-br from-asahi-50 to-white ring-1 ring-asahi-200">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="text-[10.5px] tracking-widest font-bold text-asahi-600">START WRITING</div>
            <h2 className="text-[20px] lg:text-[22px] font-extrabold tracking-tight text-ink-900 mt-1">アイデアを書く</h2>
            <p className="text-[12.5px] text-ink-600 mt-1">思いついたらまず書く。後で記事やシーズを紐付けて深められます。</p>
          </div>
          <button onClick={() => startBlankIdea(app, data)}
            className="inline-flex items-center gap-1.5 px-4 h-10 rounded-lg bg-asahi-500 text-white hover:bg-asahi-600 text-[13px] font-bold transition">
            <Icon name="plus" className="w-4 h-4"/> 白紙から書く
          </button>
        </div>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11.5px]">
          <button onClick={() => startBlankIdea(app, data)} className="text-left p-3 rounded-lg bg-white ring-1 ring-ink-100 hover:ring-asahi-300 hover:bg-asahi-50/40 transition">
            <div className="font-bold text-ink-900 flex items-center gap-1.5"><Icon name="pencil" className="w-3.5 h-3.5"/>白紙から書く</div>
            <div className="text-ink-500 mt-0.5">タイトルだけでもOK。あとから埋める</div>
          </button>
          <a href="#/seeds" className="p-3 rounded-lg bg-white ring-1 ring-ink-100 hover:ring-asahi-300 hover:bg-asahi-50/40 transition">
            <div className="font-bold text-ink-900 flex items-center gap-1.5">🧪 シーズから着想</div>
            <div className="text-ink-500 mt-0.5">REAL-ZERO等の自社技術から発想</div>
          </a>
          <a href="#dashboard-news" onClick={(e)=>{e.preventDefault(); document.getElementById("dashboard-news")?.scrollIntoView({behavior:"smooth"});}} className="p-3 rounded-lg bg-white ring-1 ring-ink-100 hover:ring-asahi-300 hover:bg-asahi-50/40 transition">
            <div className="font-bold text-ink-900 flex items-center gap-1.5">📄 ニュースから着想</div>
            <div className="text-ink-500 mt-0.5">業界シグナルと自社シーズを掛け算</div>
          </a>
        </div>
      </Card>

      {/* 続きを書く: 自分の未完ドラフト */}
      {myDrafts.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[14px] font-extrabold text-ink-900">続きを書く</h3>
            <a href="#/ideas" className="text-[11.5px] text-ink-500 hover:text-ink-900">すべて見る →</a>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {myDrafts.map(d => (
              <a key={d.id} href={`#/ideas/${d.id}/edit`}
                 className="p-3 rounded-lg bg-white ring-1 ring-ink-100 hover:ring-asahi-300 transition">
                <div className="text-[10px] tracking-widest font-bold text-asahi-600">#{(d.codename || "UNTITLED").toUpperCase()}</div>
                <div className="text-[12.5px] font-bold text-ink-900 line-clamp-2 mt-0.5">{d.title || "(無題)"}</div>
                <div className="text-[10.5px] text-ink-400 mt-1.5">{relTime(d.updatedAt)}更新</div>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Title + meta */}
      <div id="dashboard-news">
        <h1 className="text-[22px] lg:text-[26px] font-extrabold tracking-tight text-ink-900">今朝のニュース</h1>
        <div className="mt-1.5 flex items-center gap-2 text-[12px] text-ink-500">
          {live.loading ? (
            <span className="text-amber-600">取得中…</span>
          ) : live.error ? (
            <span className="text-rose-600">取得失敗</span>
          ) : (
            <>
              <span><b className="text-ink-800">{baseArticles.length}</b> 件</span>
              {yourFive.length > 0 && <><span className="text-ink-300">·</span><span>あなた向け <b className="text-asahi-600">{yourFive.length}</b> 本</span></>}
              {live.fetchedAt && <><span className="text-ink-300">·</span><span>{live.fetchedAt.replace("T"," ").slice(11,16)} 更新</span></>}
            </>
          )}
          <button onClick={()=>live.refresh(true)} disabled={live.loading}
            className="ml-2 text-ink-500 hover:text-asahi-600 disabled:opacity-50 transition">
            <span className={live.loading ? "inline-block animate-spin" : ""}>↻</span>
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-1.5">
        {data.articleCategories.filter(c => c.key === "all" || ["生活者トレンド","市場統計","海外/先進企業事例"].includes(c.key)).map(c => (
          <Tag key={c.key} active={cat === c.key} onClick={() => setCat(c.key)}>
            {c.label || c.key}
          </Tag>
        ))}
        {seedFilter && (
          <button onClick={() => setSeedFilter(null)}
            className="ml-1 inline-flex items-center gap-1 px-2.5 h-7 rounded-full text-[11.5px] font-semibold bg-asahi-500 text-white">
            {data.seedsById[seedFilter].code} <Icon name="x" className="w-3.5 h-3.5"/>
          </button>
        )}
      </div>

      {/* Article list */}
      <div className="space-y-3">
        {yourFive.length > 0 && (
          <div className="text-[11px] tracking-widest font-bold text-asahi-600 pt-2">あなた向け</div>
        )}
        {yourFive.map(a => (
          <ArticleRow key={"f_"+a.id} article={a} onPickSeed={(sid) => setSeedFilter(sid)} />
        ))}
        {yourFive.length > 0 && articles.length > 0 && (
          <div className="text-[11px] tracking-widest font-bold text-ink-400 pt-4">すべての記事</div>
        )}
        {articles.filter(a => !yourFive.some(y => y.id === a.id)).map(a => (
          <ArticleRow key={a.id} article={a} onPickSeed={(sid) => setSeedFilter(sid)} />
        ))}
        {articles.length === 0 && yourFive.length === 0 && (
          <div className="py-16 text-center text-ink-500">
            <div className="text-[13px] mb-3">{live.loading ? "ニュースを取得しています…" : live.error ? "取得に失敗しました" : "条件に合う記事がありません"}</div>
            {!live.loading && (
              <button onClick={()=>live.refresh(true)} className="text-asahi-600 hover:text-asahi-700 font-semibold text-[12.5px]">↻ もう一度取得</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Kpi({ label, value, hint, tone = "asahi", icon }) {
  const toneMap = {
    asahi:  { bg: "bg-asahi-50",  ring: "ring-asahi-100",  text: "text-asahi-700",  iconBg: "bg-asahi-500" },
    sprout: { bg: "bg-sprout-50", ring: "ring-sprout-100", text: "text-sprout-700", iconBg: "bg-sprout-500" },
    ink:    { bg: "bg-ink-50",    ring: "ring-ink-100",    text: "text-ink-700",    iconBg: "bg-ink-700" },
  };
  const t = toneMap[tone] || toneMap.asahi;
  return (
    <div className={`relative pl-3.5 pr-4 py-2.5 rounded-xl ${t.bg} ring-1 ${t.ring} min-w-[112px]`}>
      <div className="flex items-center gap-2 mb-0.5">
        {icon && (
          <div className={`h-5 w-5 rounded ${t.iconBg} text-white flex items-center justify-center`}>
            <Icon name={icon} className="w-3 h-3" strokeWidth={2.2}/>
          </div>
        )}
        <div className={`text-[10.5px] tracking-wider font-bold ${t.text} uppercase`}>{label}</div>
      </div>
      <div className="flex items-end gap-1">
        <div className="text-[26px] leading-none font-extrabold text-ink-900">{value}</div>
        <div className="text-[11px] text-ink-500 mb-1">{hint}</div>
      </div>
    </div>
  );
}

function ArticleRow({ article, onPickSeed }) {
  const data = window.SPROUT_DATA;
  const app = useApp();
  const saved = !!app.state.savedArticles[article.id];

  const catColor = { "市場統計":"bg-ink-500", "生活者トレンド":"bg-asahi-500", "海外/先進企業事例":"bg-ink-700", "事業アイデア例":"bg-asahi-300" }[article.category] || "bg-ink-300";

  return (
    <article className="group py-4 border-b border-ink-100 last:border-0">
      {/* Meta row */}
      <div className="flex items-center gap-2 text-[11.5px] text-ink-500 mb-1.5">
        <span className={`w-1.5 h-1.5 rounded-full ${catColor}`}/>
        <span>{article.category}</span>
        <span className="text-ink-300">·</span>
        <span>{article.source}</span>
        <span className="text-ink-300">·</span>
        <span>{relTime(article.date)}</span>
      </div>

      {/* Title */}
      <h3 className="font-bold text-[15.5px] leading-snug text-ink-900 group-hover:text-asahi-700 transition">
        {article.url
          ? <a href={article.url} target="_blank" rel="noopener noreferrer">{article.title}</a>
          : article.title}
      </h3>

      {/* Summary */}
      <ul className="mt-2 space-y-1 text-[12.5px] text-ink-600 leading-relaxed">
        {article.summary.slice(0, 3).map((s,i) => (
          <li key={i} className="flex gap-2"><span className="mt-1.5 block h-1 w-1 rounded-full bg-ink-300 shrink-0"/><span>{s}</span></li>
        ))}
      </ul>

      {/* Seed pills + actions */}
      <div className="mt-3 flex items-center gap-2 flex-wrap">
        {(article.relatedSeeds || []).slice(0,3).map(sid => {
          const s = data.seedsById[sid];
          if (!s) return null;
          return (
            <button key={sid} onClick={() => onPickSeed(sid)}
              className="inline-flex items-center gap-1 px-2 h-6 rounded-full bg-asahi-50 text-asahi-700 hover:bg-asahi-100 text-[11px] font-semibold transition">
              {s.code}
            </button>
          );
        })}
        <span className="ml-auto"/>
        <button onClick={() => app.toggleArticleSave(article.id)}
          className={`h-7 w-7 rounded-lg flex items-center justify-center transition ${saved ? "text-amber-500" : "text-ink-300 hover:text-ink-600"}`}
          title="保存">
          <Icon name={saved ? "bookmark-fill":"bookmark"} className="w-4 h-4"/>
        </button>
        <button onClick={() => { window.location.hash = `#/ideas/new?article=${article.id}`; }}
          className="inline-flex items-center gap-1 px-3 h-7 rounded-full bg-ink-900 text-white hover:bg-asahi-600 text-[11.5px] font-semibold transition">
          <Icon name="bulb" className="w-3.5 h-3.5"/> アイデアにする
        </button>
      </div>
    </article>
  );
}

// ---------------------------------------------------------------
//  Page: Seeds library
// ---------------------------------------------------------------
function SeedsPage() {
  const data = window.SPROUT_DATA;
  const app = useApp();
  const [cat, setCat] = useState("all");
  const cats = ["all", ...Array.from(new Set(data.seeds.map(s => s.category)))];
  const seeds = cat === "all" ? data.seeds : data.seeds.filter(s => s.category === cat);
  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="text-[11.5px] tracking-widest font-bold text-asahi-600 mb-1">SEEDS LIBRARY</div>
          <h1 className="text-2xl lg:text-[28px] font-extrabold tracking-tight text-ink-900">自社シーズ / 技術資産</h1>
          <p className="text-ink-600 text-[13.5px] mt-1">研究開発が積み上げてきた「他社に真似しにくい資産」。<b>アイデアは必ずこのどれかに接続されます。</b></p>
        </div>
        <div className="flex gap-4">
          <Kpi label="登録シーズ" value={data.seeds.length} hint="件"/>
          <Kpi label="平均成熟度" value={Math.round(data.seeds.reduce((a,b)=>a+b.readiness,0)/data.seeds.length)} hint="%"/>
          <Kpi label="カテゴリ" value={cats.length-1} hint=""/>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {cats.map(c => <Tag key={c} active={cat===c} onClick={() => setCat(c)}>{c === "all" ? "すべて" : c}</Tag>)}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-4">
        {seeds.map(s => <SeedCard key={s.id} seed={s} />)}
      </div>
    </div>
  );
}

function SeedCard({ seed }) {
  const data = window.SPROUT_DATA;
  const app = useApp();
  const ideasLinked = allIdeas(data, app).filter(i => (i.linkedSeeds||[]).includes(seed.id));
  const articlesLinked = data.articles.filter(a => (a.relatedSeeds||[]).includes(seed.id));
  const owner = data.usersById[seed.owner];
  return (
    <Card className="p-5 hover:shadow-pop transition">
      <div className="flex items-start gap-3">
        <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-asahi-500 to-asahi-700 text-white flex items-center justify-center font-extrabold text-[12px] shadow-sm tracking-tight">
          {seed.code}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge tone="slate">{seed.category}</Badge>
            <Badge tone="green">{seed.maturity}</Badge>
          </div>
          <h3 className="mt-1.5 font-extrabold text-[15.5px] leading-snug text-ink-900">{seed.name}</h3>
          <p className="text-[12.5px] text-ink-600 mt-1 line-clamp-3 leading-relaxed">{seed.summary}</p>
        </div>
      </div>
      <div className="mt-3 text-[11px] text-ink-500">成熟度 (商用化準備)</div>
      <div className="h-1.5 rounded bg-ink-100 mt-1">
        <div className="h-1.5 rounded bg-gradient-to-r from-asahi-400 to-asahi-600" style={{width:`${seed.readiness}%`}}/>
      </div>
      <div className="mt-1 flex justify-between text-[10.5px] text-ink-400">
        <span>TRL 1</span><span className="text-ink-700 font-bold">{seed.readiness}%</span><span>商用</span>
      </div>

      <div className="mt-3 flex flex-wrap gap-1">
        {seed.tags.map(t => <span key={t} className="text-[10.5px] font-semibold text-ink-500 bg-ink-100 px-2 py-0.5 rounded-full">#{t}</span>)}
      </div>

      <div className="mt-4 pt-3 border-t border-ink-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Avatar user={owner} size={6}/>
          <div className="text-[11px] leading-tight">
            <div className="font-bold text-ink-800">{owner.name}</div>
            <div className="text-ink-500">{owner.role}</div>
          </div>
        </div>
        <div className="flex gap-2 text-[11px] text-ink-500">
          <span className="inline-flex items-center gap-1"><Icon name="bulb" className="w-3.5 h-3.5"/>{ideasLinked.length} アイデア</span>
          <span>·</span>
          <span className="inline-flex items-center gap-1"><Icon name="rss" className="w-3.5 h-3.5"/>{articlesLinked.length} 記事</span>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <Button size="sm" variant="outline" icon="eye">詳細</Button>
        <Button size="sm" variant="dark" icon="bulb" onClick={()=>{ window.location.hash = `#/ideas/new?seed=${seed.id}`; }}>このシーズでアイデアを書く</Button>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------
//  Page: Ideas Gallery
// ---------------------------------------------------------------
function IdeasPage() {
  const data = window.SPROUT_DATA;
  const app = useApp();
  const { parts } = useHashRoute();
  const [tab, setTab] = useState("all"); // all | mine | inbox
  const [status, setStatus] = useState("all");

  const all = allIdeas(data, app);
  const myIdeas = all.filter(i => i.author === data.me.id);
  const inboxFbs = allFeedback(data, app)
    .filter(f => myIdeas.some(i => i.id === f.ideaId) && f.author !== data.me.id)
    .sort((a,b) => (b.at||"").localeCompare(a.at||""));
  const unreadInbox = inboxFbs.filter(f => !app.state.readFeedback[f.id]).length;

  let ideas = tab === "mine" ? myIdeas.slice() : all.slice();
  if (status !== "all") ideas = ideas.filter(i => i.status === status);
  ideas.sort((a,b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));

  const statuses = ["all", "ドラフト", "提出済", "役員レビュー中", "採択"];

  return (
    <div className="p-6 lg:p-10 max-w-5xl mx-auto space-y-6">
      {/* Title + tabs + action */}
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-[22px] lg:text-[26px] font-extrabold tracking-tight text-ink-900">アイデア</h1>
        </div>
        <button onClick={() => startBlankIdea(app, data)}
          className="inline-flex items-center gap-1.5 px-3.5 h-9 rounded-lg bg-asahi-500 text-white hover:bg-asahi-600 text-[13px] font-semibold transition">
          <Icon name="plus" className="w-4 h-4"/> 新規作成
        </button>
      </div>

      {/* Tabs */}
      <div className="border-b border-ink-100 flex items-center gap-1">
        {[
          { k:"all",   label:"すべて",       count: all.length },
          { k:"mine",  label:"自分のアイデア", count: myIdeas.length },
          { k:"inbox", label:"受信箱",       count: unreadInbox, badge: true },
        ].map(t => (
          <button key={t.k} onClick={()=>setTab(t.k)}
            className={`relative px-4 py-2.5 text-[13px] transition ${
              tab === t.k ? "text-asahi-700 font-bold" : "text-ink-500 hover:text-ink-800 font-medium"
            }`}>
            {t.label}
            {t.count > 0 && (
              <span className={`ml-1.5 inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full text-[10.5px] font-bold ${
                t.badge && tab !== t.k ? "bg-asahi-500 text-white" : "bg-ink-100 text-ink-600"
              }`}>{t.count}</span>
            )}
            {tab === t.k && <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-asahi-500"/>}
          </button>
        ))}
      </div>

      {/* Inbox tab content */}
      {tab === "inbox" && (
        <div className="space-y-2">
          {inboxFbs.map(f => {
            const idea = data.ideasById[f.ideaId] || allIdeas(data, app).find(x=>x.id===f.ideaId);
            const u = data.usersById[f.author];
            return (
              <a key={f.id} href={`#/ideas/${f.ideaId}`} onClick={()=>app.markFeedbackRead(f.id)}
                className="block p-4 rounded-xl bg-white ring-1 ring-ink-100 hover:ring-asahi-200 hover:bg-cream-50/40 transition">
                <div className="flex items-start gap-3">
                  <Avatar user={u}/>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-[12px]">
                      <span className="font-bold text-ink-900">{u?.name}</span>
                      <span className="text-ink-400">·</span>
                      <span className="text-ink-500">{ {exec:"役員", investor:"投資家", advisor:"アドバイザー", peer:"仲間"}[f.role] || f.role }</span>
                      <span className="text-ink-400 ml-auto text-[11px]">{f.at}</span>
                    </div>
                    <div className="text-[11.5px] text-asahi-600 font-semibold mt-1">#{idea?.codename}</div>
                    <div className="text-[13px] text-ink-700 leading-relaxed mt-1.5 line-clamp-2">{f.text}</div>
                  </div>
                </div>
              </a>
            );
          })}
          {inboxFbs.length === 0 && (
            <div className="py-16 text-center text-ink-500 text-[13px]">まだコメントは届いていません。</div>
          )}
        </div>
      )}

      {/* All / Mine tab content */}
      {tab !== "inbox" && (
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            {statuses.map(s => <Tag key={s} active={status===s} onClick={() => setStatus(s)}>{s==="all"?"すべて":s}</Tag>)}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {ideas.map(i => <IdeaCard key={i.id} idea={i}/>)}
            {ideas.length === 0 && (
              <div className="col-span-full py-12 text-center">
                <div className="text-[13.5px] text-ink-700 font-bold mb-1">
                  {tab === "mine" ? "まだアイデアを書いていません" : "該当するアイデアはありません"}
                </div>
                {tab === "mine" && (
                  <>
                    <div className="text-[12px] text-ink-500 mb-4">思いついたまま書いてOK。タイトルだけからでも始められます。</div>
                    <button onClick={() => startBlankIdea(app, data)}
                      className="inline-flex items-center gap-1.5 px-4 h-10 rounded-lg bg-asahi-500 text-white hover:bg-asahi-600 text-[13px] font-bold transition">
                      <Icon name="plus" className="w-4 h-4"/> 新規作成
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function IdeaCard({ idea }) {
  const data = window.SPROUT_DATA;
  const app = useApp();
  const author = data.usersById[idea.author];
  const likes = app.state.ideaLikes[idea.id] ?? idea.likes;
  const liked = (app.state.ideaLikedBy[idea.id] || []).includes(data.me.id);
  const status = data.statusMeta[idea.status];
  const fbCount = allFeedback(data, app).filter(f => f.ideaId === idea.id).length;
  return (
    <Card className={`p-5 hover:shadow-pop transition group relative overflow-hidden ${idea.isExample ? "ring-2 ring-dashed ring-ink-300 bg-ink-50/40" : ""}`}>
      <div className="absolute -top-10 -right-10 h-32 w-32 rounded-full bg-asahi-50 opacity-60 group-hover:scale-110 transition"/>
      <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <div className="flex gap-1.5 flex-wrap">
            <span className={`px-2 py-0.5 rounded-full text-[10.5px] font-bold border ${status?.color || "bg-ink-100 text-ink-700 border-ink-200"}`}>{idea.status}</span>
            {idea.archetype && ARCHETYPES_BY_ID[idea.archetype] && (
              <span className="px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-asahi-50 text-asahi-700 ring-1 ring-asahi-200">{ARCHETYPES_BY_ID[idea.archetype].num}{ARCHETYPES_BY_ID[idea.archetype].label}</span>
            )}
            {idea.isExample && <span className="px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-ink-100 text-ink-700 ring-1 ring-ink-200">例 EXAMPLE</span>}
          </div>
          <span className="text-[10.5px] text-ink-400">{relTime(idea.updatedAt)}更新</span>
        </div>
        <div className="mt-2 text-[10.5px] font-bold tracking-widest text-asahi-600">#{(idea.codename || "UNTITLED").toUpperCase()}</div>
        <h3 className="font-extrabold text-[16.5px] leading-tight text-ink-900 line-clamp-2 mt-1 group-hover:text-asahi-700 transition">
          <a href={`#/ideas/${idea.id}`}>{idea.title || "(無題)"}</a>
        </h3>
        <p className="text-[12.5px] text-ink-600 mt-2 line-clamp-3 leading-relaxed">{idea.format?.problem || ""}</p>

        {/* Seeds / articles */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {(idea.linkedSeeds||[]).slice(0,3).map(sid => <Badge key={sid} tone="red">🧪 {data.seedsById[sid]?.code}</Badge>)}
          {(idea.linkedArticles||[]).slice(0,2).map(aid => <Badge key={aid} tone="blue">📄 {data.articlesById[aid]?.source}</Badge>)}
        </div>

        {/* Scores */}
        {idea.scores && (
          <div className="mt-3 grid grid-cols-4 gap-1 text-center">
            {[["市場性","market"],["実現性","feasibility"],["シーズ","seedFit"],["新規性","novelty"]].map(([label,key]) => (
              <div key={key} className="py-1.5 rounded bg-ink-50">
                <div className="text-[9.5px] text-ink-500 font-semibold tracking-wider">{label}</div>
                <div className="text-[13px] font-extrabold text-ink-900">{(idea.scores[key]||0).toFixed(1)}</div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 pt-3 border-t border-ink-100 flex items-center gap-2">
          <Avatar user={author} size={7}/>
          <div className="text-[11px] leading-tight min-w-0 flex-1">
            <div className="font-bold text-ink-800 truncate">{author.name}</div>
            <div className="text-ink-500 truncate">{author.role}</div>
          </div>
          <div className="flex items-center gap-3 text-[11.5px] text-ink-600">
            <button onClick={(e) => { e.preventDefault(); app.toggleIdeaLike(idea.id, data.me.id); }}
              className={`inline-flex items-center gap-1 px-2 h-7 rounded-full border ${liked ? "bg-asahi-50 text-asahi-700 border-asahi-200" : "border-ink-200 hover:bg-ink-50"}`}>
              <Icon name={liked?"heart-fill":"heart"} className="w-3.5 h-3.5"/> {likes}
            </button>
            <span className="inline-flex items-center gap-1 text-ink-500"><Icon name="message" className="w-3.5 h-3.5"/>{fbCount}</span>
          </div>
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------
//  Page: Idea Detail
// ---------------------------------------------------------------
function IdeaDetailPage({ id }) {
  const data = window.SPROUT_DATA;
  const app = useApp();
  const idea = allIdeas(data, app).find(i => i.id === id);

  // Mark as read when opened
  useEffect(() => {
    if (idea) app.markIdeaRead(idea.id);
  }, [id]);

  if (!idea) return <div className="p-10 text-ink-500">アイデアが見つかりません。<a href="#/ideas" className="text-asahi-600 font-bold ml-2">一覧に戻る</a></div>;
  const author = data.usersById[idea.author];
  const likes = app.state.ideaLikes[idea.id] ?? idea.likes;
  const liked = (app.state.ideaLikedBy[idea.id] || []).includes(data.me.id);
  const currentStatus = effectiveStatus(idea, app.state);
  const status = data.statusMeta[currentStatus];
  const threads = allFeedback(data, app).filter(f => f.ideaId === idea.id);
  const budget = app.state.budgets?.[idea.id];
  const portfolio = app.state.portfolio?.[idea.id];

  const likedByUsers = (app.state.ideaLikedBy[idea.id] || []).map(uid => data.usersById[uid]).filter(Boolean);

  return (
    <div className="p-6 lg:p-8 grid grid-cols-1 xl:grid-cols-12 gap-6">
      {/* Main column */}
      <div className="xl:col-span-8 space-y-6">
        <a href="#/ideas" className="text-[12px] text-ink-500 hover:text-ink-900 inline-flex items-center gap-1"><Icon name="chevron-right" className="w-3.5 h-3.5 rotate-180"/>アイデア一覧</a>

        {idea.isExample && (
          <div className="rounded-xl bg-ink-50 ring-2 ring-dashed ring-ink-300 p-3 flex items-center gap-2 text-[12px] text-ink-800">
            <Icon name="eye" className="w-4 h-4"/>
            <b>これはサンプル例です。</b>
            <span>「{currentStatus === "採択" ? "採択後トラッキング" : "役員レビューワークフロー"}」がどう見えるかの見本として入っています。削除しても構いません。</span>
          </div>
        )}
        <Card className="p-6 lg:p-8">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`px-2 py-0.5 rounded-full text-[10.5px] font-bold border ${status?.color || "bg-ink-100 text-ink-700 border-ink-200"}`}>{currentStatus}</span>
            <Badge tone="slate">#{idea.codename}</Badge>
            {idea.archetype && ARCHETYPES_BY_ID[idea.archetype] && (
              <Badge tone="red">{ARCHETYPES_BY_ID[idea.archetype].num}{ARCHETYPES_BY_ID[idea.archetype].label}</Badge>
            )}
            {budget && <Badge tone="amber">依頼 ¥{budget.toFixed(1)}億</Badge>}
            {idea.isExample && <Badge tone="violet">例 EXAMPLE</Badge>}
            <span className="text-[11.5px] text-ink-500 ml-auto">作成 {idea.createdAt} · 更新 {idea.updatedAt}</span>
          </div>
          <h1 className="mt-3 font-extrabold tracking-tight text-ink-900 text-2xl lg:text-[30px] leading-tight">{idea.title}</h1>
          <div className="mt-3 flex items-center gap-3">
            <Avatar user={author}/>
            <div className="text-[12px] leading-tight">
              <div className="font-bold text-ink-800">{author.name}</div>
              <div className="text-ink-500">{author.role} · {author.dept}</div>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <button onClick={() => app.toggleIdeaLike(idea.id, data.me.id)}
                className={`inline-flex items-center gap-1.5 px-3 h-9 rounded-lg text-[12.5px] font-bold border ${liked ? "bg-asahi-50 text-asahi-700 border-asahi-200" : "border-ink-200 hover:bg-ink-50"}`}>
                <Icon name={liked?"heart-fill":"heart"} className="w-4 h-4"/> {likes}
              </button>
              {!idea.isExample && (app.state.extraIdeas || []).some(i => i.id === idea.id) && (
                <Button variant="outline" icon="pencil" onClick={() => window.location.hash = `#/ideas/${idea.id}/edit`}>編集</Button>
              )}
            </div>
          </div>
        </Card>

        {/* Pre-submission self-check (gate criteria) */}
        {(() => {
          const gate = PHASES_BY_ID[1].nextGate;
          const checks = idea.gateChecks || {};
          const ck = gate.criteria.filter(c => checks[c.id]).length;
          const tot = gate.criteria.length;
          if (ck === 0) return null; // hide if user hasn't checked any
          const allMet = ck === tot;
          return (
            <Card className="p-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-[10.5px] tracking-widest font-bold text-asahi-600">SELF-CHECK</div>
                  <div className="text-[15px] font-extrabold text-ink-900 mt-0.5">提出前のセルフチェック</div>
                </div>
                <span className={`text-[12px] font-bold px-2.5 py-1 rounded-full ring-1 ${
                  allMet ? "bg-emerald-50 text-emerald-700 ring-emerald-200" :
                  ck > 0 ? "bg-amber-50 text-amber-700 ring-amber-200" :
                  "bg-ink-50 text-ink-600 ring-ink-200"
                }`}>{ck} / {tot} 達成</span>
              </div>
              <div className="space-y-1">
                {gate.criteria.map(c => {
                  const on = !!checks[c.id];
                  return (
                    <div key={c.id} className="flex items-start gap-2 p-1.5">
                      <div className={`w-4 h-4 mt-0.5 rounded border flex items-center justify-center shrink-0 ${on ? "bg-emerald-500 border-emerald-500 text-white" : "border-ink-300"}`}>
                        {on && <Icon name="check" className="w-3 h-3"/>}
                      </div>
                      <div className={`text-[12.5px] ${on ? "text-emerald-900 line-through" : "text-ink-700"}`}>{c.label}</div>
                    </div>
                  );
                })}
              </div>
            </Card>
          );
        })()}

        {/* Version history */}
        <HistoryPanel idea={idea} />

        {/* Decision Panel — visible to execs only (or demo exec mode) */}
        <DecisionPanel idea={idea} />

        {/* Portfolio tracking — only for 採択 with tracking data */}
        {currentStatus === "採択" && portfolio && <PortfolioPanel idea={idea} portfolio={portfolio}/>}

        {/* Body in Asahi format */}
        <Card className="p-6 lg:p-8">
          <div className="text-[10.5px] tracking-widest font-bold text-asahi-600 mb-1">ASAHI 新規事業フォーマット</div>
          <div className="idea-body text-[13.5px] text-ink-800">
            <Section num="01" title="Why now (構造変化と緊急性)">{idea.format.problem}</Section>
            <Section num="02" title="顧客と痛み (1人称JTBD)">{idea.format.customer}</Section>
            <Section num="03" title="提供価値 / プロダクト">{idea.format.solution}</Section>
            <Section num="04" title="自社シーズの効き (後発再現性)">{idea.format.unfairAdvantage}</Section>
            <Section num="05" title="TAM / SAM / SOM">{idea.format.marketSize}</Section>
            <Section num="06" title="GTM (Phase × チャネル × 獲得KPI)">{idea.format.goToMarket}</Section>
            <Section num="07" title="Unit Economics (LTV-CAC)">{idea.format.businessModel}</Section>
            <Section num="08" title="競合ポジショニング (2軸マップ)">{idea.format.competitors}</Section>
            <Section num="09" title="ロードマップ & 検証実験">
              <ul>{idea.format.roadmap.map((r,i)=> <li key={i}><b className="text-ink-900">{r.period}</b> — {r.milestone}</li>)}</ul>
            </Section>
            <Section num="10" title="リスクと打ち手 (Mitigation)"><ul>{idea.format.risks.map((r,i)=> <li key={i}>{r}</li>)}</ul></Section>
            <Section num="11" title="Ask (予算・人員・Go/No-Go ゲート)">{idea.format.ask}</Section>
          </div>
        </Card>

        {/* Feedback */}
        <Card className="p-6 lg:p-8">
          <div className="flex items-center gap-2 mb-4">
            <Icon name="message" className="w-[18px] h-[18px] text-ink-700"/>
            <h3 className="font-extrabold text-ink-900 text-[16px]">フィードバック <span className="text-ink-400">({threads.length})</span></h3>
            <div className="ml-auto flex items-center gap-2">
              <Badge tone="violet">役員 {threads.filter(f=>f.role==="exec").length}</Badge>
              <Badge tone="blue">投資家 {threads.filter(f=>f.role==="investor").length}</Badge>
              <Badge tone="amber">アドバイザー {threads.filter(f=>f.role==="advisor").length}</Badge>
              <Badge tone="slate">仲間 {threads.filter(f=>f.role==="peer" || f.role==="author").length}</Badge>
            </div>
          </div>
          <FeedbackThread ideaId={idea.id} threads={threads}/>
        </Card>
      </div>

      {/* Side column — 2 cards instead of 4 */}
      <div className="xl:col-span-4 space-y-5">
        {/* スコア + リアクション */}
        <Card className="p-5">
          {idea.scores ? (
            <>
              <div className="text-[10.5px] tracking-widest font-bold text-ink-400 mb-2">評価スコア</div>
              <div className="space-y-2.5">
                {Object.entries({market:"市場性", feasibility:"実現性", seedFit:"シーズ活用", novelty:"新規性"}).map(([k,lbl]) => {
                  const v = idea.scores[k] || 0;
                  return (
                    <div key={k}>
                      <div className="flex justify-between text-[11.5px] text-ink-700"><span>{lbl}</span><span className="font-bold">{v.toFixed(1)}</span></div>
                      <div className="h-1.5 rounded bg-ink-100 mt-1"><div className="h-1.5 rounded bg-gradient-to-r from-asahi-400 to-asahi-600" style={{width:`${(v/5)*100}%`}}/></div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="text-[11.5px] text-ink-500">
              <div className="text-[10.5px] tracking-widest font-bold text-ink-400 mb-1">評価スコア</div>
              役員レビュー後にスコアが付きます。
            </div>
          )}
          {likedByUsers.length > 0 && (
            <div className="mt-4 pt-4 border-t border-ink-100">
              <div className="text-[10.5px] tracking-widest font-bold text-ink-400 mb-2">いいね</div>
              <div className="flex flex-wrap gap-1">
                {likedByUsers.map(u => <div key={u.id} title={u.name}><Avatar user={u} size={7}/></div>)}
              </div>
            </div>
          )}
        </Card>

        {/* 参照: シーズ + 記事 */}
        {((idea.linkedSeeds||[]).length > 0 || (idea.linkedArticles||[]).length > 0) && (
          <Card className="p-5">
            <div className="text-[10.5px] tracking-widest font-bold text-ink-400 mb-2">参照</div>
            <div className="space-y-1.5">
              {(idea.linkedSeeds||[]).map(sid => {
                const s = data.seedsById[sid];
                if (!s) return null;
                return (
                  <a key={sid} href="#/seeds" className="flex items-center gap-2 p-2 rounded-lg hover:bg-ink-50 transition">
                    <div className="h-7 w-7 rounded-md bg-asahi-500 text-white flex items-center justify-center text-[9.5px] font-extrabold shrink-0">{s.code}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] font-bold text-ink-900 truncate">{s.name}</div>
                    </div>
                  </a>
                );
              })}
              {(idea.linkedArticles||[]).map(aid => {
                const a = data.articlesById[aid];
                if (!a) return null;
                return (
                  <a key={aid} href="#/dashboard" className="flex items-start gap-2 p-2 rounded-lg hover:bg-ink-50 transition">
                    <div className="text-[14px] shrink-0 pt-0.5">📄</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[10.5px] text-ink-500 font-semibold">{a.source}</div>
                      <div className="text-[12px] font-bold text-ink-900 line-clamp-2">{a.title}</div>
                    </div>
                  </a>
                );
              })}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

function Section({ num, title, children }) {
  return (
    <section className="mb-6 pb-6 border-b border-ink-100 last:border-0 last:mb-0 last:pb-0">
      <div className="flex items-baseline gap-3 mb-2">
        <span className="font-mono text-asahi-500 text-[11px] tracking-widest font-bold">{num}</span>
        <h4 className="font-extrabold text-ink-900 text-[14.5px]">{title}</h4>
      </div>
      <div>{children}</div>
    </section>
  );
}

function FeedbackThread({ ideaId, threads }) {
  const data = window.SPROUT_DATA;
  const app = useApp();
  const me = data.me;
  const [draft, setDraft] = useState("");
  const [role, setRole] = useState("peer");
  const [aiAssist, setAiAssist] = useState(false);
  const [isTyping, setIsTyping] = useState(false);

  function submit() {
    if (!draft.trim()) return;
    const fb = {
      id: "fb_" + Math.random().toString(36).slice(2,8),
      ideaId,
      author: me.id,
      at: new Date().toISOString().replace("T"," ").slice(0,16),
      role,
      text: draft,
      reactions: {}
    };
    app.addFeedback(fb);
    setDraft("");
    setAiAssist(false);
  }

  function aiDraft() {
    setIsTyping(true);
    setAiAssist(true);
    const sample = "コンセプトはとても共感します。1点だけ：『独自の強み』セクションで、既存ノンアル製品群（アサヒゼロなど）との差別化をもう少し明確にしたいです。『どのユーザーシーンで勝つのか』を一段深掘りすると、役員レビューの論点が絞りやすくなる気がします。";
    let i = 0;
    setDraft("");
    const t = setInterval(() => {
      setDraft(sample.slice(0, i));
      i += 2;
      if (i >= sample.length) { setDraft(sample); clearInterval(t); setIsTyping(false); }
    }, 18);
  }

  const roleTone = { exec:"violet", investor:"blue", advisor:"amber", peer:"slate", author:"red" };
  const roleLabel = { exec:"役員", investor:"社外取/投資家", advisor:"アドバイザー", peer:"仲間", author:"作者" };

  return (
    <div>
      <div className="space-y-3">
        {threads.length === 0 && <div className="text-[12px] text-ink-500">まだフィードバックはありません。最初のコメントを書きましょう。</div>}
        {threads.map(f => {
          const u = data.usersById[f.author];
          return (
            <div key={f.id} className="flex gap-3 items-start">
              <Avatar user={u}/>
              <div className="flex-1">
                <div className="flex items-center flex-wrap gap-2 text-[11.5px]">
                  <span className="font-bold text-ink-900">{u?.name}</span>
                  <span className="text-ink-500">{u?.role}</span>
                  <Badge tone={roleTone[f.role] || "slate"}>{roleLabel[f.role]}</Badge>
                  <span className="ml-auto text-ink-400 text-[11px]">{f.at}</span>
                </div>
                <div className="mt-1 text-[13px] text-ink-800 leading-relaxed bg-ink-50/70 rounded-lg ring-1 ring-ink-100 px-3.5 py-2.5">{f.text}</div>
                <div className="mt-1.5 flex items-center gap-2 text-[11px] text-ink-500">
                  <button className="hover:text-asahi-600 inline-flex items-center gap-1"><Icon name="heart" className="w-3.5 h-3.5"/>{f.reactions?.like || ""}</button>
                  <button className="hover:text-amber-600 inline-flex items-center gap-1"><Icon name="sparkles" className="w-3.5 h-3.5"/>{f.reactions?.insight || ""}</button>
                  <button className="hover:text-ink-800">返信</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Composer */}
      <div className="mt-5 pt-5 border-t border-ink-100">
        <div className="flex items-start gap-3">
          <Avatar user={me}/>
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="text-[11.5px] text-ink-500">立場を選んでコメント：</span>
              {[["peer","仲間"],["exec","役員"],["investor","投資家"],["advisor","アドバイザー"]].map(([k,lbl]) => (
                <button key={k} onClick={()=>setRole(k)}
                  className={`px-2 h-6 rounded-full text-[11px] font-semibold border ${role===k ? "bg-ink-900 text-white border-ink-900" : "bg-white text-ink-700 border-ink-200 hover:border-ink-400"}`}>{lbl}</button>
              ))}
              <button onClick={aiDraft} className="ml-auto text-[11px] font-semibold text-asahi-600 hover:text-asahi-700 inline-flex items-center gap-1">
                <Icon name="sparkles" className="w-3.5 h-3.5"/> AIで論点を下書き
              </button>
            </div>
            <textarea rows={3} value={draft} onChange={e=>setDraft(e.target.value)}
              placeholder="フィードバックを書く…"
              className={`w-full rounded-lg border border-ink-200 focus:border-ink-400 focus:ring-2 focus:ring-ink-100 outline-none px-3 py-2 text-[13px] ${isTyping ? "blink" : ""}`}/>
            <div className="mt-2 flex items-center justify-between">
              <div className="text-[11px] text-ink-500">{aiAssist ? "AI下書きを編集して投稿できます" : "Markdownは使えません"}</div>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={()=>setDraft("")}>クリア</Button>
                <Button size="sm" icon="send" onClick={submit}>投稿</Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------
//  Component: Archetype Selector — 6類型から戦い方を1つ選ぶ
// ---------------------------------------------------------------
function ArchetypeSelector({ value, onChange }) {
  const selected = value ? ARCHETYPES_BY_ID[value] : null;
  const fitColors = {
    asahi: "bg-asahi-50 text-asahi-700 ring-asahi-200",
    blue:  "bg-sky-50 text-sky-700 ring-sky-200",
    slate: "bg-ink-50 text-ink-600 ring-ink-200",
  };
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <label className="text-[11px] tracking-widest font-bold text-ink-400">この案の戦い方 (類型)</label>
          <div className="text-[11.5px] text-ink-500 mt-0.5">6類型から1つ選ぶと、AI生成の観点・KPIロジック・参考事例が変わります。</div>
        </div>
        {selected && (
          <button onClick={()=>onChange(null)} className="text-[11px] text-ink-500 hover:text-ink-900 inline-flex items-center gap-1">
            <Icon name="x" className="w-3 h-3"/>選択解除
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
        {ARCHETYPES.map(a => {
          const on = value === a.id;
          return (
            <button key={a.id} onClick={()=>onChange(on ? null : a.id)}
              className={`text-left p-3 rounded-lg border transition ${
                on
                  ? "border-asahi-500 bg-asahi-50 ring-2 ring-asahi-200"
                  : "border-ink-200 hover:border-ink-300 hover:bg-ink-50"
              }`}>
              <div className="flex items-center gap-1.5">
                <span className="text-[14px] font-extrabold text-asahi-600">{a.num}</span>
                <span className="text-[13px] font-extrabold text-ink-900">{a.label}</span>
              </div>
              <div className="text-[10.5px] text-ink-600 mt-0.5 line-clamp-2 leading-snug">{a.subtitle}</div>
              <div className={`mt-2 inline-block text-[9.5px] font-bold px-1.5 py-0.5 rounded ring-1 ${fitColors[a.fitTone] || fitColors.slate}`}>
                アサヒ適合度 {a.fit}
              </div>
            </button>
          );
        })}
      </div>

      {selected && (
        <div className="mt-4 pt-4 border-t border-ink-100 space-y-3">
          <div className="text-[12.5px] text-ink-700 leading-relaxed">{selected.desc}</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11.5px]">
            <div>
              <div className="text-[10px] tracking-widest font-bold text-ink-400 mb-0.5">WHERE</div>
              <div className="text-ink-700">{selected.where}</div>
            </div>
            <div>
              <div className="text-[10px] tracking-widest font-bold text-ink-400 mb-0.5">WHEN</div>
              <div className="text-ink-700">{selected.when}</div>
            </div>
            <div>
              <div className="text-[10px] tracking-widest font-bold text-ink-400 mb-0.5">HOW MUCH</div>
              <div className="text-ink-700">{selected.howMuch}</div>
            </div>
            <div>
              <div className="text-[10px] tracking-widest font-bold text-ink-400 mb-0.5">HOW MANY</div>
              <div className="text-ink-700">{selected.howMany}</div>
            </div>
          </div>
          <div>
            <div className="text-[10px] tracking-widest font-bold text-ink-400 mb-1">KPIロジック</div>
            <div className="text-[11.5px] text-ink-700 leading-relaxed bg-ink-50 rounded-md p-2.5">{selected.kpiLogic}</div>
          </div>
          <div>
            <div className="text-[10px] tracking-widest font-bold text-ink-400 mb-1.5">参考事例</div>
            <div className="space-y-1.5">
              {selected.examples.map((ex, i) => (
                <div key={i} className="text-[11.5px] text-ink-700 flex gap-2">
                  <span className="font-bold text-asahi-700 shrink-0">{ex.name}</span>
                  <span className="text-ink-600">— {ex.note}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[10px] tracking-widest font-bold text-ink-400 mb-1">典型的落とし穴</div>
            <div className="text-[11.5px] text-ink-700 leading-relaxed">{selected.pitfall}</div>
          </div>
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------
//  Component: Phase + Next Gate checklist
// ---------------------------------------------------------------
function PhaseGate({ gateChecks, setGateChecks }) {
  // This editor is fundamentally an アイデア開発 (Phase 1) tool.
  // We expose only the Phase 1 → Phase 2 gate criteria as a pre-submission
  // self-check; the underlying phase value stays fixed at 1 in the data model.
  const gate = PHASES_BY_ID[1].nextGate;
  const checked = gate.criteria.filter(c => gateChecks[c.id]).length;
  const total = gate.criteria.length;
  const allMet = checked === total;
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <label className="text-[11px] tracking-widest font-bold text-ink-400">提出前のセルフチェック</label>
          <div className="text-[11.5px] text-ink-500 mt-0.5">役員レビュー前に、これが満たせているかを確認。次フェーズ (Phase 2: 市場翻訳・仮説検証) への進行判定にもなります。</div>
        </div>
        <span className={`shrink-0 text-[11.5px] font-bold px-2 py-1 rounded-full ring-1 ${
          allMet ? "bg-emerald-50 text-emerald-700 ring-emerald-200" :
          checked > 0 ? "bg-amber-50 text-amber-700 ring-amber-200" :
          "bg-ink-50 text-ink-600 ring-ink-200"
        }`}>{checked} / {total} 達成</span>
      </div>
      <div className="space-y-1">
        {gate.criteria.map(c => {
          const on = !!gateChecks[c.id];
          return (
            <button key={c.id} onClick={()=>setGateChecks({ ...gateChecks, [c.id]: !on })}
              className={`w-full flex items-start gap-2 p-2 rounded-md transition text-left ${on ? "bg-emerald-50/60" : "hover:bg-ink-50"}`}>
              <div className={`w-4 h-4 mt-0.5 rounded border flex items-center justify-center shrink-0 ${on ? "bg-emerald-500 border-emerald-500 text-white" : "border-ink-300"}`}>
                {on && <Icon name="check" className="w-3 h-3"/>}
              </div>
              <div className={`text-[12.5px] ${on ? "text-emerald-900 line-through" : "text-ink-800"}`}>{c.label}</div>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------
//  Page: Idea Editor (new)
// ---------------------------------------------------------------
function IdeaEditor({ id: editingId } = {}) {
  const data = window.SPROUT_DATA;
  const app = useApp();
  const { query, navigate } = useHashRoute();

  // Existing idea (when editing)
  const existingIdea = useMemo(
    () => editingId ? (app.state.extraIdeas || []).find(i => i.id === editingId) : null,
    [editingId]  // eslint-disable-line — intentional: re-resolve only when id changes
  );

  // Prefill context: existing idea > query (?article=... or ?seed=... or ?suggestion=...) > empty
  const initCtx = useMemo(() => {
    if (existingIdea) {
      const f = existingIdea.format || {};
      return {
        articles: existingIdea.linkedArticles || [],
        seeds:    existingIdea.linkedSeeds || [],
        suggestion: null,
        title:    existingIdea.title === "(無題)" ? "" : (existingIdea.title || ""),
        codename: existingIdea.codename === "UNTITLED" ? "" : (existingIdea.codename || ""),
        archetype: existingIdea.archetype || null,
        phase:    existingIdea.phase || 1,
        gateChecks: existingIdea.gateChecks || {},
        form: {
          problem:         f.problem || "",
          customer:        f.customer || "",
          solution:        f.solution || "",
          unfairAdvantage: f.unfairAdvantage || "",
          marketSize:      f.marketSize || "",
          goToMarket:      f.goToMarket || "",
          businessModel:   f.businessModel || "",
          competitors:     f.competitors || "",
          roadmap: Array.isArray(f.roadmap)
            ? f.roadmap.map(r => `${r.period || ""} — ${r.milestone || ""}`).join("\n")
            : (f.roadmap || ""),
          risks:   Array.isArray(f.risks) ? f.risks.join("\n") : (f.risks || ""),
          ask:     f.ask || "",
        },
      };
    }
    const ctx = { articles: [], seeds: [], suggestion: null, title: "", codename: "", archetype: null, phase: 1, gateChecks: {}, form: null };
    if (query.article) ctx.articles.push(query.article);
    if (query.seed) ctx.seeds.push(query.seed);
    if (query.suggestion) {
      const sg = data.aiSuggestions.find(s => s.id === query.suggestion);
      if (sg) { ctx.suggestion = sg; ctx.seeds.push(...sg.fromSeeds); ctx.articles.push(...sg.fromArticles); }
    }
    return ctx;
  }, [editingId, existingIdea, query.article, query.seed, query.suggestion]);

  const [title, setTitle] = useState(initCtx.title || (initCtx.suggestion ? initCtx.suggestion.title : ""));
  const [codename, setCodename] = useState(initCtx.codename || (initCtx.suggestion ? initCtx.suggestion.title.split(/[ 　-ー『』]/).filter(Boolean)[0] : ""));
  const [linkedSeeds, setLinkedSeeds] = useState(initCtx.seeds);
  const [linkedArticles, setLinkedArticles] = useState(initCtx.articles);
  const [archetype, setArchetype] = useState(initCtx.archetype);
  const [phase, setPhase] = useState(initCtx.phase || 1);
  const [gateChecks, setGateChecks] = useState(initCtx.gateChecks || {});
  const [form, setForm] = useState(initCtx.form || {
    problem: initCtx.suggestion ? initCtx.suggestion.rationale : "",
    customer: "",
    solution: "",
    unfairAdvantage: "",
    marketSize: "",
    goToMarket: "",
    businessModel: "",
    competitors: "",
    roadmap: "",
    risks: "",
    ask: "",
  });
  const [aiFilling, setAiFilling] = useState({});  // { [fieldKey]: true }
  const [aiCritiques, setAiCritiques] = useState({}); // { [fieldKey]: string }
  const [aiErrors, setAiErrors] = useState({}); // { [fieldKey]: { reason, raw } }
  const [bulkFilling, setBulkFilling] = useState(false);
  const [seedQ, setSeedQ] = useState("");
  const [articleQ, setArticleQ] = useState("");
  const [saveStatus, setSaveStatus] = useState("idle"); // idle | saving | saved
  const dirty = useRef(false);
  const lastSyncedId = useRef(null);

  // Re-sync state from existingIdea on mount/id change (handles the race where
  // useState initialized before app.state.extraIdeas reflected the new idea).
  useEffect(() => {
    if (!editingId || !existingIdea) return;
    if (lastSyncedId.current === existingIdea.id) return;
    lastSyncedId.current = existingIdea.id;
    const f = existingIdea.format || {};
    setTitle(existingIdea.title === "(無題)" ? "" : (existingIdea.title || ""));
    setCodename(existingIdea.codename === "UNTITLED" ? "" : (existingIdea.codename || ""));
    setLinkedSeeds(existingIdea.linkedSeeds || []);
    setLinkedArticles(existingIdea.linkedArticles || []);
    setArchetype(existingIdea.archetype || null);
    setPhase(existingIdea.phase || 1);
    setGateChecks(existingIdea.gateChecks || {});
    setForm({
      problem:         f.problem || "",
      customer:        f.customer || "",
      solution:        f.solution || "",
      unfairAdvantage: f.unfairAdvantage || "",
      marketSize:      f.marketSize || "",
      goToMarket:      f.goToMarket || "",
      businessModel:   f.businessModel || "",
      competitors:     f.competitors || "",
      roadmap: Array.isArray(f.roadmap)
        ? f.roadmap.map(r => `${r.period || ""} — ${r.milestone || ""}`).join("\n")
        : (f.roadmap || ""),
      risks:   Array.isArray(f.risks) ? f.risks.join("\n") : (f.risks || ""),
      ask:     f.ask || "",
    });
    dirty.current = false;
  }, [editingId, existingIdea?.id]); // eslint-disable-line

  // Auto-save (only after user has actually edited something)
  useEffect(() => {
    if (!editingId || !existingIdea) return;
    if (!dirty.current) return;  // never save until user has touched something
    setSaveStatus("saving");
    const t = setTimeout(() => {
      const formatBody = {
        ...form,
        roadmap: form.roadmap
          ? form.roadmap.split("\n").filter(Boolean).map(line => {
              const [period, ...rest] = line.split("—");
              return { period: (period || "").trim(), milestone: rest.join("—").trim() };
            })
          : [],
        risks: (form.risks || "").split(/\n/).filter(Boolean),
      };
      app.updateIdea(editingId, {
        title: title || "(無題)",
        codename: codename || "UNTITLED",
        archetype: archetype || null,
        phase, gateChecks,
        linkedSeeds, linkedArticles,
        format: formatBody,
      });
      setSaveStatus("saved");
    }, 700);
    return () => clearTimeout(t);
  // eslint-disable-next-line
  }, [editingId, title, codename, archetype, phase, JSON.stringify(gateChecks), JSON.stringify(form), JSON.stringify(linkedSeeds), JSON.stringify(linkedArticles)]);

  // Guard: editing requested but idea not found (or is sample) → redirect
  if (editingId && !existingIdea) {
    return (
      <div className="p-10 text-ink-500">
        編集対象のアイデアが見つかりません。<a href="#/ideas" className="text-asahi-600 font-bold ml-2">一覧に戻る</a>
      </div>
    );
  }

  const fieldOrder = [
    { key:"problem",         num:"01", group:"A", label:"Why now (構造変化と緊急性)",
      hint:"今何が変わったか + なぜ今やるべきか + 数値シグナル1つ",
      ph:"例: GLP-1普及で外食ビール客単価が前年比 -8% (出典: 帝国DB)。一方ノンアル来店動機は同期間で +24%…",
      chars:180 },
    { key:"customer",        num:"02", group:"A", label:"顧客と痛み (1人称JTBD)",
      hint:"1人のペルソナを具体化、JTBD構文、既存代替案の不満1つ",
      ph:"例: 都市部 32 歳・年収 800 万円・週3で会食する管理職。『接待後にもう一杯欲しいが、翌朝のパフォーマンスを落とせない』時に…",
      chars:200 },
    { key:"solution",        num:"03", group:"B", label:"提供価値 / プロダクト",
      hint:"便益→機能の順。シーズコードを必ず引用",
      ph:"例: 飲む時間を、自分の状態を上げる時間に変える気分デザイン・プレミアムノンアル。REAL-ZERO で…",
      chars:200 },
    { key:"unfairAdvantage", num:"04", group:"B", label:"自社シーズの効き (後発再現性)",
      hint:"再現できない理由を3つ。シーズコード必須。再現に何年か",
      ph:"例: REAL-ZERO 由来の官能データ 20 年分は再現に最低 8 年。Hop-β は特許出願中…",
      chars:180 },
    { key:"marketSize",      num:"05", group:"C", label:"TAM / SAM / SOM (数値根拠付き)",
      hint:"3段階の数値 + 各々の出典/推定根拠",
      ph:"例: TAM 国内+海外で $30.5B (出典: Euromonitor 2030)。SAM プレミアム機能性ノンアルで $0.8B…",
      chars:260 },
    { key:"goToMarket",      num:"06", group:"D", label:"GTM (Phase × チャネル × 獲得KPI)",
      hint:"Phase 1〜3、各々のチャネル+獲得KPI(数値)、検証仮説1つ",
      ph:"例: Phase 1 (〜2026 Q4) 都内ゼロプルーフバー 5 店舗、KPI 月販 8,000 本…",
      chars:240 },
    { key:"businessModel",   num:"07", group:"D", label:"Unit Economics (LTV-CAC)",
      hint:"単価×頻度×原価、LTV/CAC/回収期間、スケール時のレバー",
      ph:"例: 単価 480 円 × 月 6 本 × 12 ヶ月 = LTV 34,560 円。CAC 8,000 円、回収 4.5 ヶ月…",
      chars:220 },
    { key:"competitors",     num:"08", group:"D", label:"競合ポジショニング (2軸マップ)",
      hint:"軸を2つ明示、競合3社の位置、自社が取るスポット",
      ph:"例: 縦軸『機能性の強度』× 横軸『風味の本格度』。Athletic Brewing は本格度高だが機能性は弱い…",
      chars:200 },
    { key:"roadmap",         num:"09", group:"E", label:"ロードマップ & 検証実験",
      hint:"Phase毎にマイルストーン+検証仮説+成功指標+Kill criteria",
      ph:"例: Phase 1 (2026 Q3-Q4) プロト 5 SKU、外食 5 店舗テスト。仮説『月 8,000 本売れる』。Kill: 月販 4,000 本未満…",
      chars:280 },
    { key:"risks",           num:"10", group:"E", label:"リスクと打ち手 (Mitigation)",
      hint:"上位3リスク (市場/技術/組織)、影響度+確率、具体的な打ち手",
      ph:"例: ①機能性表示遅延 (影響:大/確率:中 — 打ち手: 申請を 2026 Q1 前倒し、薬事 1 名専任)…",
      chars:220 },
    { key:"ask",             num:"11", group:"E", label:"Ask (予算・人員・Go/No-Go ゲート)",
      hint:"予算内訳、FTEと職種、Go/No-Goゲートの時期と判定基準",
      ph:"例: 予算 1.8 億円 (R&D 0.8 / マーケ 0.6 / 人件費 0.4)。4.5 FTE。Go/No-Go 2026 年 12 月末…",
      chars:160 },
  ];

  const FIELD_GROUPS = {
    A: { label:"1. 課題と顧客",       desc:"なぜ今やる + 誰の何が痛い" },
    B: { label:"2. 提供価値と差別化", desc:"何を出して、なぜ後発再現できないか" },
    C: { label:"3. 市場規模",         desc:"TAM / SAM / SOM の3段階" },
    D: { label:"4. ビジネス設計",     desc:"どう売り、どう儲け、誰を相手にするか" },
    E: { label:"5. 実行計画",         desc:"いつ何を確かめ、何が必要か" },
  };

  function upd(k, v) { dirty.current = true; setForm(f => ({ ...f, [k]: v })); }
  function toggleSeed(id) { dirty.current = true; setLinkedSeeds(prev => prev.includes(id) ? prev.filter(x=>x!==id) : [...prev, id]); }
  function toggleArticle(id) { dirty.current = true; setLinkedArticles(prev => prev.includes(id) ? prev.filter(x=>x!==id) : [...prev, id]); }
  // Wrap setters so user interactions mark the form dirty (auto-save gated on this)
  const onTitleChange   = (v) => { dirty.current = true; setTitle(v); };
  const onCodenameChange= (v) => { dirty.current = true; setCodename(v.toUpperCase()); };
  const onArchetypeChange = (v) => { dirty.current = true; setArchetype(v); };
  const onPhaseChange   = (v) => { dirty.current = true; setPhase(v); };
  const onGateChecksChange = (v) => { dirty.current = true; setGateChecks(v); };

  async function aiFill(k, opts = {}) {
    const { silentReveal = false } = opts;
    setAiFilling(prev => ({ ...prev, [k]: true }));
    upd(k, "");

    // Build context from current editor state
    const seedDetails = linkedSeeds.map(sid => {
      const s = data.seedsById[sid];
      if (!s) return null;
      return {
        code: s.code, name: s.name, summary: s.summary,
        readiness: s.readiness, category: s.category,
        ipStatus: s.ipStatus, constraints: s.constraints,
      };
    }).filter(Boolean);
    const articleDetails = linkedArticles.map(aid => {
      const a = data.articlesById[aid];
      if (!a) return null;
      return { title: a.title, source: a.source, date: a.date, summary: a.summary };
    }).filter(Boolean);
    const existing = {};
    Object.entries(form).forEach(([fk, fv]) => { if (fk !== k && fv) existing[fk] = fv; });

    let txt = "";
    let critique = "";
    try {
      const archetypeMeta = archetype ? ARCHETYPES_BY_ID[archetype] : null;
      const r = await fetch("/api/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          field: k,
          title, codename,
          archetype: archetypeMeta ? {
            id: archetypeMeta.id,
            label: `${archetypeMeta.num}${archetypeMeta.label}`,
            subtitle: archetypeMeta.subtitle,
            desc: archetypeMeta.desc,
            kpiLogic: archetypeMeta.kpiLogic,
            where: archetypeMeta.where,
            when: archetypeMeta.when,
            howMuch: archetypeMeta.howMuch,
            examples: archetypeMeta.examples,
          } : null,
          linkedSeeds: seedDetails,
          linkedArticles: articleDetails,
          existingFields: existing,
        }),
      });
      const httpStatus = r.status;
      const json = await r.json().catch(() => ({}));
      const apiOk = json.ok !== false && r.ok;
      if (!apiOk) {
        // Surface the failure honestly — never silently insert unrelated text.
        setAiErrors(prev => ({ ...prev, [k]: { reason: json.reason || `HTTP ${httpStatus}`, raw: (json.debug || "").slice(0, 240) } }));
        setAiFilling(prev => { const n = { ...prev }; delete n[k]; return n; });
        return;
      }
      // Clear any prior error for this field on success
      setAiErrors(prev => { const n = { ...prev }; delete n[k]; return n; });
      txt = (json.final || "").trim();
      critique = (json.critique || "").trim();
    } catch (e) {
      setAiErrors(prev => ({ ...prev, [k]: { reason: `network: ${e && e.message || e}`, raw: "" } }));
      setAiFilling(prev => { const n = { ...prev }; delete n[k]; return n; });
      return;
    }

    if (!txt) {
      setAiErrors(prev => ({ ...prev, [k]: { reason: "AIから空の応答が返りました", raw: "" } }));
      setAiFilling(prev => { const n = { ...prev }; delete n[k]; return n; });
      return;
    }

    setAiCritiques(prev => ({ ...prev, [k]: critique }));

    if (silentReveal) {
      upd(k, txt);
      setAiFilling(prev => { const n = { ...prev }; delete n[k]; return n; });
      return;
    }

    // Typewriter reveal
    return new Promise(resolve => {
      let i = 0;
      const step = Math.max(2, Math.floor(txt.length / 60));
      const t = setInterval(() => {
        upd(k, txt.slice(0, i));
        i += step;
        if (i >= txt.length) {
          upd(k, txt);
          clearInterval(t);
          setAiFilling(prev => { const n = { ...prev }; delete n[k]; return n; });
          resolve();
        }
      }, 18);
    });
  }

  async function aiFillAll() {
    if (bulkFilling) return;
    setBulkFilling(true);
    // Run requests in parallel, but reveal silently (no typewriter) so all fields fill quickly.
    await Promise.all(fieldOrder.map(f => aiFill(f.key, { silentReveal: true })));
    setBulkFilling(false);
  }

  function buildFormatBody() {
    return {
      ...form,
      roadmap: form.roadmap
        ? form.roadmap.split("\n").filter(Boolean).map(line => {
            const [period, ...rest] = line.split("—");
            return { period: (period || "").trim(), milestone: rest.join("—").trim() };
          })
        : [{ period: "〜2026 Q4", milestone: "（記入予定）" }],
      risks: (form.risks||"").split(/\n|\/|、/).filter(Boolean),
    };
  }

  function submit(status) {
    const formatBody = buildFormatBody();
    if (editingId && existingIdea) {
      // Safety: if local state is empty defaults but existingIdea has content,
      // we hit the prefill race — submit existing data unchanged instead of wiping.
      const stateLooksUninitialized = !title && !codename && !archetype && !Object.values(form).some(v => (v || "").trim());
      const existingHasContent = existingIdea.title || existingIdea.codename !== "UNTITLED" || existingIdea.archetype || (existingIdea.format && Object.values(existingIdea.format).some(v => Array.isArray(v) ? v.length : (v || "").trim()));
      if (stateLooksUninitialized && existingHasContent) {
        app.updateIdea(editingId, { status });  // only flip status, preserve content
        window.location.hash = `#/ideas/${editingId}`;
        return;
      }
      // Update existing
      app.updateIdea(editingId, {
        title: title || "(無題)",
        codename: codename || "UNTITLED",
        archetype: archetype || null,
        phase, gateChecks,
        status,
        linkedSeeds, linkedArticles,
        format: formatBody,
      });
      app.snapshotIdea(editingId, {
        by: data.me.id,
        changeNote: status === "提出済" ? "提出" : "ドラフト更新",
        format: formatBody,
        linkedSeeds: [...linkedSeeds],
        linkedArticles: [...linkedArticles],
      });
      window.location.hash = `#/ideas/${editingId}`;
      return;
    }
    // Create new
    const newId = "i_local_" + Math.random().toString(36).slice(2,8);
    const today = todayISO();
    const idea = {
      id: newId, codename: codename || "UNTITLED",
      title: title || "(無題)",
      author: data.me.id,
      status,
      archetype: archetype || null,
      phase, gateChecks,
      createdAt: today,
      updatedAt: today,
      likes: 0,
      likedBy: [],
      linkedArticles, linkedSeeds,
      format: formatBody
    };
    app.addIdea(idea);
    app.snapshotIdea(newId, {
      by: data.me.id,
      changeNote: status === "ドラフト" ? "ドラフト保存 (初稿)" : "提出 (初稿)",
      format: formatBody,
      linkedSeeds: [...linkedSeeds],
      linkedArticles: [...linkedArticles],
    });
    // After draft save, jump into edit mode (auto-save resume); after 提出 go to detail
    window.location.hash = status === "提出済" ? `#/ideas/${newId}` : `#/ideas/${newId}/edit`;
  }

  return (
    <div className="p-6 lg:p-8 grid grid-cols-1 xl:grid-cols-12 gap-6">
      <div className="xl:col-span-8 space-y-4">
        <div>
          <a href="#/ideas" className="text-[12px] text-ink-500 hover:text-ink-900 inline-flex items-center gap-1"><Icon name="chevron-right" className="w-3.5 h-3.5 rotate-180"/>アイデア一覧</a>
          <div className="flex items-center gap-3 mt-2">
            <div className="text-[10.5px] tracking-widest font-bold text-asahi-600">IDEA EDITOR</div>
            {editingId && (
              <span className={`text-[10.5px] font-bold ${saveStatus === "saving" ? "text-ink-400" : saveStatus === "saved" ? "text-emerald-600" : "text-ink-300"}`}>
                {saveStatus === "saving" ? "保存中…" : saveStatus === "saved" ? "✓ 自動保存済み" : ""}
              </span>
            )}
          </div>
          <h1 className="text-2xl lg:text-[28px] font-extrabold tracking-tight text-ink-900">{editingId ? "アイデアを編集" : "新しいアイデアを書く"}</h1>
          <p className="text-ink-600 text-[13.5px] mt-1">{editingId
            ? "入力は自動で保存されます。記事やシーズは右で任意に紐付けられます。"
            : "思いついたまま書いてOK。タイトルだけでもまず書き始めて、記事・シーズ・類型・Phaseはあとから埋められます。"}</p>
        </div>

        <Card className="p-5">
          <label className="text-[11px] tracking-widest font-bold text-ink-400">コードネーム & タイトル</label>
          <div className="flex gap-2 mt-2">
            <input value={codename} onChange={e=>onCodenameChange(e.target.value)} placeholder="Codename" className="w-40 h-11 px-3 rounded-lg border border-ink-200 font-mono uppercase text-[13px] focus:border-ink-400 focus:ring-2 focus:ring-ink-100 outline-none"/>
            <input value={title} onChange={e=>onTitleChange(e.target.value)} placeholder="1行で刺さるタイトルを" className="flex-1 h-11 px-3 rounded-lg border border-ink-200 font-bold text-[15px] focus:border-ink-400 focus:ring-2 focus:ring-ink-100 outline-none"/>
          </div>
          {initCtx.suggestion && (
            <div className="mt-3 px-3 py-2 rounded-lg bg-asahi-50 ring-1 ring-asahi-200 text-[12px] text-asahi-800 flex items-start gap-2">
              <Icon name="sparkles" className="w-4 h-4 mt-0.5"/>
              <div>AI提案『{initCtx.suggestion.title}』のコンテキストをプリフィルしました。必要に応じて編集してください。</div>
            </div>
          )}
        </Card>

        <ArchetypeSelector value={archetype} onChange={onArchetypeChange}/>

        <PhaseGate gateChecks={gateChecks} setGateChecks={onGateChecksChange}/>

        <Card className="p-4 bg-asahi-50/40 ring-1 ring-asahi-200">
          <div className="flex items-center gap-3">
            <Icon name="sparkles" className={`w-5 h-5 text-asahi-600 ${bulkFilling ? "animate-pulse" : ""}`}/>
            <div className="flex-1 min-w-0">
              <div className="text-[12.5px] font-extrabold text-ink-900">11フィールドを一括でAIに書かせる</div>
              <div className="text-[11px] text-ink-600 mt-0.5">引用記事+シーズ+既入力を全て使い、各フィールドを並列生成します。仕上げに加筆してください。</div>
            </div>
            <button
              onClick={aiFillAll}
              disabled={bulkFilling}
              className="shrink-0 inline-flex items-center gap-1.5 px-3.5 h-9 rounded-lg bg-asahi-500 text-white hover:bg-asahi-600 disabled:opacity-50 text-[12.5px] font-semibold">
              <Icon name="sparkles" className={`w-4 h-4 ${bulkFilling ? "animate-pulse" : ""}`}/>
              {bulkFilling ? "生成中…" : "一括生成"}
            </button>
          </div>
        </Card>

        {fieldOrder.map((f, i) => {
          const len = (form[f.key] || "").length;
          const overChars = f.chars && len > f.chars;
          const filling = !!aiFilling[f.key];
          const critique = aiCritiques[f.key];
          const aiErr = aiErrors[f.key];
          const prevGroup = i > 0 ? fieldOrder[i-1].group : null;
          const showGroupHeader = f.group && f.group !== prevGroup;
          const groupMeta = showGroupHeader ? FIELD_GROUPS[f.group] : null;
          return (
            <Fragment key={f.key}>
            {showGroupHeader && groupMeta && (
              <div className="pt-3 first:pt-0">
                <div className="text-[11px] tracking-widest font-bold text-asahi-600">{groupMeta.label}</div>
                <div className="text-[11px] text-ink-500 mt-0.5">{groupMeta.desc}</div>
              </div>
            )}
            <Card className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-asahi-500 text-[11px] tracking-widest font-bold">{f.num}</span>
                    <label className="font-extrabold text-ink-900 text-[14.5px]">{f.label}</label>
                  </div>
                  {f.hint && <div className="text-[11px] text-ink-500 mt-1 leading-relaxed">{f.hint}</div>}
                </div>
                <button
                  onClick={()=>aiFill(f.key)}
                  disabled={filling || bulkFilling}
                  className="shrink-0 text-[11px] font-semibold text-asahi-600 hover:text-asahi-700 disabled:opacity-50 inline-flex items-center gap-1">
                  <Icon name="sparkles" className={`w-3.5 h-3.5 ${filling ? "animate-pulse" : ""}`}/>
                  {filling ? "AIが書いています…" : "AIで書く"}
                </button>
              </div>
              {aiErr && (
                <div className="mt-2 p-2.5 rounded-md bg-rose-50 ring-1 ring-rose-200 text-[11.5px] text-rose-800 flex items-start gap-2">
                  <Icon name="x" className="w-3.5 h-3.5 mt-0.5 shrink-0"/>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold">AI生成に失敗しました</div>
                    <div className="text-[11px] text-rose-700 mt-0.5">理由: {aiErr.reason}{aiErr.raw ? ` — ${aiErr.raw}` : ""}</div>
                  </div>
                  <button onClick={()=>aiFill(f.key)} className="shrink-0 inline-flex items-center gap-1 px-2 h-6 rounded bg-rose-600 text-white text-[10.5px] font-bold hover:bg-rose-700">
                    <Icon name="sparkles" className="w-3 h-3"/>再試行
                  </button>
                </div>
              )}
              <textarea rows={4} value={form[f.key]} onChange={e=>upd(f.key, e.target.value)}
                placeholder={f.ph}
                className={`mt-2 w-full rounded-lg border focus:ring-2 outline-none px-3 py-2 text-[13px] leading-relaxed ${overChars ? "border-asahi-400 focus:border-asahi-500 focus:ring-asahi-100" : "border-ink-200 focus:border-ink-400 focus:ring-ink-100"} ${filling ? "blink" : ""}`}/>
              {f.chars && (
                <div className={`mt-1 text-[10.5px] tabular-nums text-right ${overChars ? "text-asahi-600 font-semibold" : "text-ink-400"}`}>
                  {len} / {f.chars} 字 {overChars && "(超過 — 削ること)"}
                </div>
              )}
              {critique && (
                <details className="mt-3 group">
                  <summary className="flex items-center gap-1.5 cursor-pointer text-[11px] font-bold text-ink-700 hover:text-ink-900 select-none">
                    <Icon name="chevron-right" className="w-3 h-3 transition group-open:rotate-90"/>
                    <Icon name="sparkles" className="w-3 h-3 text-asahi-500"/>
                    AI レビュー観点 — 役員が突っ込むだろう弱点 (3 点)
                  </summary>
                  <div className="mt-2 p-3 rounded-lg bg-ink-50 ring-1 ring-ink-200 text-[11.5px] text-ink-700 leading-relaxed whitespace-pre-wrap">{critique}</div>
                </details>
              )}
            </Card>
            </Fragment>
          );
        })}

        <div className="sticky bottom-4 z-10 flex gap-2 justify-end">
          {editingId ? (
            <>
              <Button variant="outline" onClick={() => {
                if (confirm("このアイデアを削除しますか？元に戻せません。")) {
                  app.deleteIdea(editingId);
                  window.location.hash = "#/ideas";
                }
              }}>削除</Button>
              <Button variant="outline" onClick={() => window.location.hash = `#/ideas/${editingId}`}>詳細を見る</Button>
              <Button icon="send" onClick={()=>submit("提出済")}>提出する</Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => window.location.hash = "#/ideas"}>キャンセル</Button>
              <Button variant="soft" icon="pencil" onClick={()=>submit("ドラフト")}>ドラフト保存</Button>
              <Button icon="send" onClick={()=>submit("提出済")}>提出する</Button>
            </>
          )}
        </div>
      </div>

      {/* Right: citations */}
      <div className="xl:col-span-4 space-y-5 xl:sticky xl:top-20 xl:h-[calc(100vh-6rem)] overflow-auto pb-6 pr-1">
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Icon name="sparkles" className="w-4 h-4 text-asahi-600"/>
            <div className="text-[13px] font-bold text-ink-900">AI アシスト</div>
          </div>
          <p className="text-[11.5px] text-ink-600 leading-relaxed">参照中のシーズ・記事から、自動で各セクションの叩き台を作れます。各セクションの<span className="text-asahi-600 font-bold">「AIで埋める」</span>ボタンを押してみてください。</p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[13px] font-bold text-ink-900">引用するシーズ</div>
            <Badge tone="red">{linkedSeeds.length}</Badge>
          </div>
          <input value={seedQ} onChange={e=>setSeedQ(e.target.value)} placeholder="コード/名称/カテゴリで検索"
            className="w-full mb-2 px-2.5 h-8 rounded-md border border-ink-200 text-[11.5px] focus:border-ink-400 focus:ring-2 focus:ring-ink-100 outline-none"/>
          <div className="space-y-1.5 max-h-72 overflow-auto pr-1">
            {(() => {
              const q = seedQ.toLowerCase().trim();
              const filtered = data.seeds.filter(s => !q || (s.code||"").toLowerCase().includes(q) || (s.name||"").toLowerCase().includes(q) || (s.category||"").toLowerCase().includes(q));
              if (filtered.length === 0) return <div className="px-2 py-3 text-[11px] text-ink-400">該当なし</div>;
              return filtered.map(s => {
                const on = linkedSeeds.includes(s.id);
                return (
                  <button key={s.id} onClick={()=>toggleSeed(s.id)} className={`w-full flex items-center gap-2 p-2 rounded-lg transition text-left ${on ? "bg-asahi-50 ring-1 ring-asahi-200" : "hover:bg-ink-50"}`}>
                    <div className={`w-4 h-4 rounded border flex items-center justify-center ${on ? "bg-asahi-500 border-asahi-500 text-white" : "border-ink-300"}`}>
                      {on && <Icon name="check" className="w-3 h-3"/>}
                    </div>
                    <div className="h-7 w-7 rounded bg-asahi-500 text-white text-[9px] font-extrabold flex items-center justify-center">{s.code}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[11.5px] font-bold text-ink-900 truncate">{s.name}</div>
                      <div className="text-[10px] text-ink-500 truncate">{s.category}</div>
                    </div>
                  </button>
                );
              });
            })()}
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[13px] font-bold text-ink-900">引用する記事</div>
            <Badge tone="blue">{linkedArticles.length}</Badge>
          </div>
          <input value={articleQ} onChange={e=>setArticleQ(e.target.value)} placeholder="タイトル/媒体名で検索"
            className="w-full mb-2 px-2.5 h-8 rounded-md border border-ink-200 text-[11.5px] focus:border-ink-400 focus:ring-2 focus:ring-ink-100 outline-none"/>
          <div className="space-y-1.5 max-h-72 overflow-auto pr-1">
            {(() => {
              const q = articleQ.toLowerCase().trim();
              const filtered = data.articles.filter(a => !q || (a.title||"").toLowerCase().includes(q) || (a.source||"").toLowerCase().includes(q));
              if (filtered.length === 0) return <div className="px-2 py-3 text-[11px] text-ink-400">該当なし</div>;
              return filtered.map(a => {
                const on = linkedArticles.includes(a.id);
                return (
                  <button key={a.id} onClick={()=>toggleArticle(a.id)} className={`w-full flex items-start gap-2 p-2 rounded-lg transition text-left ${on ? "bg-sky-50 ring-1 ring-sky-200" : "hover:bg-ink-50"}`}>
                    <div className={`w-4 h-4 mt-0.5 rounded border flex items-center justify-center ${on ? "bg-sky-600 border-sky-600 text-white" : "border-ink-300"}`}>
                      {on && <Icon name="check" className="w-3 h-3"/>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[10.5px] text-ink-500 font-semibold">{a.source} · {a.date}</div>
                      <div className="text-[11.5px] font-bold text-ink-900 line-clamp-2">{a.title}</div>
                    </div>
                  </button>
                );
              });
            })()}
          </div>
        </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------
//  Page: FB Inbox (アイデアに寄せられたFB)
// ---------------------------------------------------------------
function InboxPage() {
  const data = window.SPROUT_DATA;
  const app = useApp();
  const myIdeas = allIdeas(data, app).filter(i => i.author === data.me.id);
  const fbs = allFeedback(data, app).filter(f => myIdeas.some(i => i.id === f.ideaId) && f.author !== data.me.id);
  fbs.sort((a,b) => (b.at||"").localeCompare(a.at||""));
  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div>
        <div className="text-[11.5px] tracking-widest font-bold text-asahi-600 mb-1">INBOX</div>
        <h1 className="text-2xl lg:text-[28px] font-extrabold tracking-tight text-ink-900">自分のアイデアへのフィードバック</h1>
        <p className="text-ink-600 text-[13.5px] mt-1">役員・投資家・仲間からのコメントをまとめて確認できます。</p>
      </div>
      <div className="space-y-3">
        {fbs.map(f => {
          const idea = data.ideasById[f.ideaId] || allIdeas(data, app).find(x=>x.id===f.ideaId);
          const u = data.usersById[f.author];
          const roleTone = { exec:"violet", investor:"blue", advisor:"amber", peer:"slate" }[f.role] || "slate";
          return (
            <Card key={f.id} className="p-4 hover:shadow-pop transition">
              <div className="flex items-start gap-3">
                <Avatar user={u}/>
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-ink-900 text-[13px]">{u?.name}</span>
                    <Badge tone={roleTone}>{ {exec:"役員", investor:"投資家", advisor:"アドバイザー", peer:"仲間"}[f.role] || f.role }</Badge>
                    <span className="text-ink-400 text-[11px] ml-auto">{f.at}</span>
                  </div>
                  <a href={`#/ideas/${f.ideaId}`} className="text-[12.5px] font-bold text-asahi-700 hover:text-asahi-800 mt-1 inline-block">#{idea?.codename} — {idea?.title}</a>
                  <div className="mt-1.5 text-[13px] text-ink-800 leading-relaxed">{f.text}</div>
                </div>
              </div>
            </Card>
          );
        })}
        {fbs.length === 0 && <Card className="p-10 text-center text-ink-500">まだFBはありません。アイデアを出して意見を集めましょう。</Card>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------
//  Page: Me
// ---------------------------------------------------------------
function MePage() {
  const data = window.SPROUT_DATA;
  const app = useApp();
  const me = data.me;
  const all = allIdeas(data, app);
  const myIdeas = all.filter(i => i.author === me.id);
  const myLikesGiven = Object.keys(app.state.likedArticles).length + Object.entries(app.state.ideaLikedBy).filter(([,arr]) => arr.includes(me.id)).length;
  const myFbGiven = allFeedback(data, app).filter(f => f.author === me.id && f.role !== "author").length;
  const totalLikesReceived = myIdeas.reduce((a,i)=> a + (app.state.ideaLikes[i.id]||0), 0);

  const leaderboard = data.users.filter(u=>!u.isExec && !u.isInvestor).map(u => {
    const cnt = all.filter(i => i.author === u.id).length;
    const likes = all.filter(i => i.author === u.id).reduce((s,i)=> s + (app.state.ideaLikes[i.id]||0), 0);
    return { user: u, count: cnt, likes };
  }).sort((a,b) => b.count - a.count || b.likes - a.likes);

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="text-[11.5px] tracking-widest font-bold text-asahi-600 mb-1">MY ACTIVITY</div>
          <h1 className="text-2xl lg:text-[26px] font-extrabold tracking-tight text-ink-900">マイページ</h1>
          <p className="text-ink-500 text-[12.5px] mt-1">あなたの投稿・いいね・与えたフィードバックの記録</p>
        </div>
        <Button icon="plus" onClick={()=>startBlankIdea(app, data)}>アイデアを書く</Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatCard icon="bulb"   label="アイデア数"   value={myIdeas.length} accent="asahi-500"/>
        <StatCard icon="heart"  label="受けたいいね" value={totalLikesReceived} accent="ink-700"/>
        <StatCard icon="message" label="与えたFB"    value={myFbGiven} accent="ink-700"/>
        <StatCard icon="bookmark" label="いいね/保存" value={myLikesGiven} accent="ink-700"/>
        <StatCard icon="flame"  label="連続アウトプット" value={`${app.state.streak.count}日`} accent="asahi-500"/>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <div className="xl:col-span-8 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-extrabold text-ink-900">自分のアイデア</h3>
            <a href="#/ideas" className="text-[12px] text-ink-500 hover:text-ink-900">もっと見る</a>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {myIdeas.map(i => <IdeaCard key={i.id} idea={i}/>)}
            {myIdeas.length === 0 && (
              <Card className="md:col-span-2 p-10 text-center bg-asahi-50/40 border-2 border-dashed border-asahi-200">
                <div className="text-[28px] mb-2">🌱</div>
                <div className="font-extrabold text-ink-900 text-[15px]">最初のアイデアを書きましょう</div>
                <p className="text-[12.5px] text-ink-600 mt-1 max-w-md mx-auto">萌芽RSSで気になる記事を見つけたら、「アイデアに変える」ボタンで2クリックで書き始められます。</p>
                <div className="mt-4 flex gap-2 justify-center">
                  <Button icon="plus" onClick={()=>startBlankIdea(app, data)}>新規作成</Button>
                  <Button variant="outline" icon="rss" onClick={()=>window.location.hash = "#/dashboard"}>ニュースを見る</Button>
                </div>
              </Card>
            )}
          </div>
        </div>
        <div className="xl:col-span-4 space-y-5">
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <Icon name="trophy" className="w-[18px] h-[18px] text-amber-500"/>
              <div className="text-[13px] font-bold text-ink-900">今月のアウトプット・ランキング</div>
            </div>
            <div className="space-y-2">
              {leaderboard.slice(0,6).map((row, idx) => (
                <div key={row.user.id} className={`flex items-center gap-3 p-2 rounded-lg ${row.user.id===me.id ? "bg-asahi-50 ring-1 ring-asahi-200" : ""}`}>
                  <div className={`w-6 text-center text-[12px] font-extrabold ${idx<3 ? "text-amber-600" : "text-ink-400"}`}>{idx+1}</div>
                  <Avatar user={row.user} size={7}/>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12.5px] font-bold truncate">{row.user.name}</div>
                    <div className="text-[10.5px] text-ink-500 truncate">{row.user.role}</div>
                  </div>
                  <div className="text-[11.5px] text-ink-600"><b className="text-ink-900">{row.count}</b> 本 / ♥{row.likes}</div>
                </div>
              ))}
            </div>
          </Card>
          <Card className="p-5">
            <div className="text-[13px] font-bold text-ink-900 mb-2">最近の活動</div>
            <div className="space-y-2">
              {[...data.activity, ...app.state.extraIdeas.map(i=>({id:`ev_${i.id}`, user:me.id, type:"created-idea", at:i.createdAt, target:i.id}))]
                .sort((a,b) => (b.at||"").localeCompare(a.at||""))
                .slice(0,8).map(ev => <ActivityRow key={ev.id} ev={ev}/>)}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, accent }) {
  const accentMap = {
    "asahi-500":   "bg-asahi-50 text-asahi-600",
    "ink-700":     "bg-ink-100 text-ink-700",
  };
  const cls = accentMap[accent] || "bg-ink-100 text-ink-700";
  return (
    <Card className="p-4">
      <div className={`h-8 w-8 rounded-lg ${cls} flex items-center justify-center mb-2`}>
        <Icon name={icon} className="w-4 h-4"/>
      </div>
      <div className="text-[11px] text-ink-500 font-semibold tracking-wider uppercase">{label}</div>
      <div className="text-2xl font-extrabold text-ink-900">{value}</div>
    </Card>
  );
}

function ActivityRow({ ev }) {
  const data = window.SPROUT_DATA;
  const app = useApp();
  const u = data.usersById[ev.user];
  const all = allIdeas(data, app);
  const i = all.find(x=>x.id===ev.target);
  const a = data.articlesById[ev.target];
  const actionText = {
    "created-idea": "がアイデアを起票",
    "commented":    "がコメント",
    "liked":        "がいいね",
    "saved-article":"が記事を保存",
    "approved":     "が採択",
    "linked-seed":  "がシーズを紐付け"
  }[ev.type] || "";
  return (
    <div className="flex items-start gap-2.5 text-[12px]">
      <Avatar user={u} size={6}/>
      <div className="leading-tight flex-1 min-w-0">
        <div><b className="text-ink-900">{u?.name}</b><span className="text-ink-500"> {actionText}</span></div>
        {i && <a href={`#/ideas/${i.id}`} className="text-[11.5px] text-asahi-700 hover:text-asahi-800 font-bold line-clamp-1">#{i.codename} — {i.title}</a>}
        {a && <a href="#/dashboard" className="text-[11.5px] text-asahi-700 hover:text-asahi-800 font-bold line-clamp-1">{a.title}</a>}
        <div className="text-[10.5px] text-ink-400">{relTime(ev.at)}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------
//  HistoryPanel — versioned edit history for ideas
// ---------------------------------------------------------------
function HistoryPanel({ idea }) {
  const data = window.SPROUT_DATA;
  const app = useApp();
  const [expanded, setExpanded] = useState(false);
  const [compareWith, setCompareWith] = useState(null);

  const historyBase = app.state.ideaHistory[idea.id] || [];
  // current version (synthetic v = last+1)
  const currentVersion = {
    v: (historyBase[historyBase.length-1]?.v || 0) + 1,
    at: idea.updatedAt,
    by: idea.author,
    changeNote: "現在の版",
    format: idea.format,
    linkedSeeds: idea.linkedSeeds,
    linkedArticles: idea.linkedArticles,
    current: true,
  };
  const history = [...historyBase, currentVersion];
  if (history.length < 2) return null;

  const SECTION_LABELS = {
    problem:"Why now", customer:"顧客と痛み", solution:"提供価値/プロダクト", unfairAdvantage:"自社シーズの効き",
    marketSize:"TAM/SAM/SOM", goToMarket:"GTM", businessModel:"Unit Economics",
    competitors:"競合ポジショニング", roadmap:"ロードマップ&検証", risks:"リスクと打ち手", ask:"Ask",
  };

  function diffSections(a, b) {
    // Returns changed section keys between two format objects
    const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
    const changed = [];
    keys.forEach(k => {
      const va = JSON.stringify(a?.[k] ?? "");
      const vb = JSON.stringify(b?.[k] ?? "");
      if (va !== vb) changed.push(k);
    });
    return changed;
  }

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-3">
        <Icon name="clock" className="w-[18px] h-[18px] text-ink-700"/>
        <div className="font-extrabold text-[14.5px] text-ink-900">バージョン履歴</div>
        <Badge tone="slate">{history.length} 版</Badge>
        <button onClick={()=>setExpanded(v=>!v)} className="ml-auto text-[11.5px] text-ink-500 hover:text-ink-900 font-semibold">
          {expanded ? "閉じる" : "すべて見る"}
        </button>
      </div>

      <div className="relative">
        <div className="absolute left-[9px] top-2 bottom-2 w-0.5 bg-ink-100"/>
        <div className="space-y-3">
          {(expanded ? history : history.slice(-3)).reverse().map((v, idx, arr) => {
            const u = data.usersById[v.by] || data.usersById["u_shibata"];
            const prev = history.find(h => h.v === v.v - 1);
            const changed = prev ? diffSections(prev.format, v.format) : [];
            const seedChanged = prev && JSON.stringify(prev.linkedSeeds||[]) !== JSON.stringify(v.linkedSeeds||[]);
            const articleChanged = prev && JSON.stringify(prev.linkedArticles||[]) !== JSON.stringify(v.linkedArticles||[]);

            return (
              <div key={v.v} className="relative pl-7">
                <div className={`absolute left-0 top-1 w-[18px] h-[18px] rounded-full ring-4 ring-white flex items-center justify-center text-[9px] font-extrabold ${v.current ? "bg-asahi-500 text-white" : "bg-ink-400 text-white"}`}>v{v.v}</div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-[12.5px] font-bold ${v.current ? "text-asahi-700" : "text-ink-900"}`}>
                    {v.current ? "現在の版" : v.changeNote}
                  </span>
                  <span className="text-[11px] text-ink-500">{v.at}</span>
                  <Avatar user={u} size={5}/>
                  <span className="text-[11px] text-ink-600">{u?.name}</span>
                </div>
                {changed.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    <span className="text-[10.5px] text-ink-500 pr-1">変更:</span>
                    {changed.map(k => (
                      <button key={k} onClick={()=>setCompareWith({ v1: prev, v2: v, section: k })}
                        className="text-[10.5px] font-semibold bg-amber-100 text-amber-800 ring-1 ring-amber-200 px-1.5 py-0.5 rounded hover:bg-amber-200">
                        {SECTION_LABELS[k] || k} ⚠
                      </button>
                    ))}
                    {seedChanged && <span className="text-[10.5px] font-semibold bg-rose-50 text-rose-700 ring-1 ring-rose-200 px-1.5 py-0.5 rounded">シーズ更新</span>}
                    {articleChanged && <span className="text-[10.5px] font-semibold bg-sky-50 text-sky-700 ring-1 ring-sky-200 px-1.5 py-0.5 rounded">記事更新</span>}
                  </div>
                )}
                {!prev && !v.current && (
                  <div className="mt-1 text-[10.5px] text-ink-500">初版 (差分なし)</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {!expanded && history.length > 3 && (
        <div className="text-[11px] text-ink-500 mt-3 text-center">…過去 {history.length - 3} 版を省略</div>
      )}

      {compareWith && (
        <Modal open={true} onClose={()=>setCompareWith(null)} size="xl">
          <div className="p-6">
            <div className="flex items-center gap-2 mb-1">
              <Badge tone="amber">{SECTION_LABELS[compareWith.section] || compareWith.section}</Badge>
              <span className="text-[11.5px] text-ink-500">v{compareWith.v1.v} → v{compareWith.v2.v} の差分</span>
              <button onClick={()=>setCompareWith(null)} className="ml-auto text-ink-400 hover:text-ink-900"><Icon name="x" className="w-4 h-4"/></button>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-3">
              <div>
                <div className="text-[10.5px] font-bold tracking-wider text-ink-400 mb-1">v{compareWith.v1.v} — {compareWith.v1.at}</div>
                <div className="p-3 rounded-lg bg-rose-50 ring-1 ring-rose-200 text-[12.5px] text-ink-800 leading-relaxed whitespace-pre-wrap">
                  {formatFieldAsText(compareWith.v1.format?.[compareWith.section])}
                </div>
              </div>
              <div>
                <div className="text-[10.5px] font-bold tracking-wider text-ink-400 mb-1">v{compareWith.v2.v} — {compareWith.v2.at} {compareWith.v2.current && "(現在)"}</div>
                <div className="p-3 rounded-lg bg-emerald-50 ring-1 ring-emerald-200 text-[12.5px] text-ink-800 leading-relaxed whitespace-pre-wrap">
                  {formatFieldAsText(compareWith.v2.format?.[compareWith.section])}
                </div>
              </div>
            </div>
            <div className="mt-4 text-[11.5px] text-ink-500">
              <b>💡 AIサマリ:</b> このバージョンでは{SECTION_LABELS[compareWith.section] || compareWith.section}が書き換えられています。
              役員FB（{compareWith.v2.changeNote}）を反映した改訂と思われます。
            </div>
          </div>
        </Modal>
      )}
    </Card>
  );
}

function formatFieldAsText(v) {
  if (v == null) return "(未入力)";
  if (typeof v === "string") return v;
  if (Array.isArray(v)) {
    return v.map(x => typeof x === "string" ? "• " + x : `• ${x.period}: ${x.milestone}`).join("\n");
  }
  return JSON.stringify(v, null, 2);
}

// ---------------------------------------------------------------
//  DecisionPanel — exec approval workflow
// ---------------------------------------------------------------
function DecisionPanel({ idea }) {
  const data = window.SPROUT_DATA;
  const app = useApp();
  const execs = data.users.filter(u => u.isExec);
  const cons = consensusOf(idea.id, app.state);
  const approveCount = cons.approve.length;
  const rejectCount  = cons.reject.length;
  const holdCount    = cons.hold.length;
  const decidedCount = approveCount + rejectCount + holdCount;
  const currentStatus = effectiveStatus(idea, app.state);

  // 判断が一つも入っていない場合はパネルを表示しない (=ノイズ削減)
  if (decidedCount === 0 && currentStatus !== "採択") return null;

  return (
    <Card className="p-5 border border-ink-100">
      <div className="flex items-center gap-2 mb-3">
        <Icon name="award" className="w-[18px] h-[18px] text-violet-600"/>
        <div className="font-extrabold text-ink-900 text-[14px]">役員レビュー状況</div>
        {currentStatus === "採択" && <Badge tone="green">✓ 採択済み</Badge>}
        {currentStatus === "差し戻し" && <Badge tone="red">差し戻し</Badge>}
        <span className="ml-auto text-[12px] text-ink-600"><b className="text-violet-700">{approveCount}</b><span className="text-ink-400"> / {execs.length}</span> 承認</span>
      </div>

      {/* Consensus bar */}
      <div className="flex h-2 rounded-full overflow-hidden bg-ink-100">
        <div className="bg-emerald-500 transition-all" style={{width:`${(approveCount/execs.length)*100}%`}}/>
        <div className="bg-amber-400 transition-all"  style={{width:`${(holdCount/execs.length)*100}%`}}/>
        <div className="bg-rose-500 transition-all"   style={{width:`${(rejectCount/execs.length)*100}%`}}/>
      </div>

      {/* Per-exec cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-3">
        {execs.map(u => {
          const d = (app.state.decisions[idea.id] || {})[u.id];
          const tone = d?.decision === "approve" ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
                     : d?.decision === "reject"  ? "bg-rose-50 text-rose-800 ring-rose-200"
                     : d?.decision === "hold"    ? "bg-amber-50 text-amber-800 ring-amber-200"
                     :                             "bg-ink-50 text-ink-600 ring-ink-200";
          const label = d?.decision === "approve" ? "承認"
                      : d?.decision === "reject"  ? "差戻"
                      : d?.decision === "hold"    ? "保留"
                      :                             "未判断";
          return (
            <div key={u.id} className={`p-2.5 rounded-lg ring-1 ${tone}`}>
              <div className="flex items-center gap-2">
                <Avatar user={u} size={6}/>
                <div className="flex-1 min-w-0">
                  <div className="text-[11.5px] font-bold truncate">{u.name}</div>
                </div>
                <span className="text-[10.5px] font-extrabold">{label}</span>
              </div>
              {d?.note && <div className="text-[11px] mt-1.5 leading-relaxed opacity-90 line-clamp-2">“{d.note}”</div>}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------
//  PortfolioPanel — post-approval tracking for 採択 ideas
// ---------------------------------------------------------------
function PortfolioPanel({ idea, portfolio }) {
  const done = portfolio.milestones.filter(m => m.done).length;
  const total = portfolio.milestones.length;
  return (
    <Card className="p-6 lg:p-7 border-2 border-emerald-200/60 bg-gradient-to-br from-white to-emerald-50/30">
      <div className="flex items-center gap-2 mb-4">
        <Icon name="trophy" className="w-5 h-5 text-emerald-600"/>
        <div className="font-extrabold text-ink-900 text-[15px]">採択後トラッキング</div>
        <Badge tone="green">Portfolio</Badge>
        <span className="ml-auto text-[11.5px] text-ink-500">次ゲート: <b className="text-ink-900">{portfolio.nextGate}</b></span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <div className="p-3 rounded-lg bg-white ring-1 ring-ink-100">
          <div className="text-[10.5px] tracking-wider font-bold text-ink-400">予算</div>
          <div className="text-xl font-extrabold text-ink-900">¥{portfolio.kpi.budget.toFixed(1)}億</div>
          <div className="text-[10.5px] text-ink-500">承認済み</div>
        </div>
        <div className="p-3 rounded-lg bg-white ring-1 ring-ink-100">
          <div className="text-[10.5px] tracking-wider font-bold text-ink-400">消化</div>
          <div className="text-xl font-extrabold text-ink-900">¥{portfolio.kpi.spent.toFixed(1)}億</div>
          <div className="text-[10.5px] text-ink-500">({Math.round(portfolio.kpi.spent/portfolio.kpi.budget*100)}%)</div>
        </div>
        <div className="p-3 rounded-lg bg-white ring-1 ring-ink-100">
          <div className="text-[10.5px] tracking-wider font-bold text-ink-400">チーム</div>
          <div className="text-xl font-extrabold text-ink-900">{portfolio.kpi.team} 名</div>
          <div className="text-[10.5px] text-ink-500">稼働中</div>
        </div>
        <div className="p-3 rounded-lg bg-white ring-1 ring-ink-100">
          <div className="text-[10.5px] tracking-wider font-bold text-ink-400">進捗</div>
          <div className="text-xl font-extrabold text-ink-900">{portfolio.progress}%</div>
          <div className="text-[10.5px] text-ink-500">{done}/{total} マイルストーン</div>
        </div>
      </div>

      {/* Milestones timeline */}
      <div className="text-[10.5px] tracking-wider font-bold text-ink-400 mb-2">マイルストーン</div>
      <div className="relative">
        <div className="absolute left-2 top-2 bottom-2 w-0.5 bg-ink-100"/>
        <div className="space-y-3">
          {portfolio.milestones.map((m, i) => (
            <div key={i} className="relative pl-6">
              <div className={`absolute left-0 top-0.5 w-4 h-4 rounded-full ring-2 ring-white ${m.done ? "bg-emerald-500" : m.current ? "bg-amber-400 animate-pulse" : "bg-ink-200"}`}/>
              <div className="flex items-baseline gap-2">
                <span className="text-[11px] font-mono text-ink-400 font-bold w-24 shrink-0">{m.at}</span>
                <span className={`text-[12.5px] ${m.done ? "text-ink-400 line-through" : m.current ? "text-ink-900 font-bold" : "text-ink-700"}`}>{m.label}</span>
                {m.current && <Badge tone="amber">進行中</Badge>}
                {m.done && <Icon name="check" className="w-3.5 h-3.5 text-emerald-500"/>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}


// ---------------------------------------------------------------
//  OnboardingModal — first-time personalization
// ---------------------------------------------------------------
function OnboardingChecklist() {
  const data = window.SPROUT_DATA;
  const app = useApp();
  const me = data.me;

  const tasks = useMemo(() => {
    const savedCount = Object.keys(app.state.savedArticles || {}).length;
    const myIdeas = (app.state.extraIdeas || []).filter(i => i.author === me.id);
    const myFB    = (app.state.extraFeedback || []).filter(f => f.author === me.id);
    return [
      { id: "idea", label: "アイデアを1本書く",                  done: myIdeas.length > 0,    href: "#/ideas",     hint: "白紙からでも、ニュース・シーズからでもOK" },
      { id: "news", label: "今朝のニュースに目を通す",          done: true,                  hint: "" },
      { id: "save", label: "気になる記事を1本「保存」する",      done: savedCount > 0,        href: "#/dashboard", hint: "記事右下のしおりアイコンをタップ" },
      { id: "fb",   label: "仲間のアイデアにコメントする",        done: myFB.length > 0,       href: "#/ideas",     hint: "詳細ページの『コメントする』から" },
    ];
  }, [app.state.savedArticles, app.state.extraIdeas, app.state.extraFeedback]);

  if (app.state.checklistDismissed) return null;
  const completed = tasks.filter(t => t.done).length;
  const total = tasks.length;
  const allDone = completed === total;

  if (allDone) {
    return (
      <Card className="p-4 bg-asahi-50 ring-1 ring-asahi-200">
        <div className="flex items-start gap-3">
          <div className="h-9 w-9 rounded-full bg-asahi-500 text-white flex items-center justify-center font-extrabold shrink-0">
            <Icon name="check" className="w-5 h-5"/>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-extrabold text-ink-900">スタート完了 🎉</div>
            <div className="text-[12px] text-ink-700 mt-0.5">基本の流れを使いこなせています。日々の習慣に。</div>
          </div>
          <button onClick={()=>app.dismissChecklist()} className="text-[11px] text-ink-500 hover:text-ink-900 font-semibold">閉じる</button>
        </div>
      </Card>
    );
  }
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <Icon name="check" className="w-4 h-4 text-asahi-600"/>
        <div className="text-[12px] font-extrabold text-ink-900">スタートチェックリスト</div>
        <div className="text-[10.5px] text-ink-500 ml-1 tabular-nums">{completed} / {total}</div>
        <button onClick={()=>app.dismissChecklist()} className="ml-auto text-[10.5px] text-ink-400 hover:text-ink-700">隠す</button>
      </div>
      <div className="h-1 rounded-full bg-ink-100 mb-3 overflow-hidden">
        <div className="h-full bg-asahi-500 transition-all" style={{ width: `${(completed/total)*100}%` }}/>
      </div>
      <div className="space-y-1">
        {tasks.map(t => {
          const Inner = (
            <>
              <div className={`h-5 w-5 rounded-full flex items-center justify-center shrink-0 ${t.done ? "bg-asahi-500 text-white" : "ring-2 ring-ink-300 bg-white"}`}>
                {t.done && <svg viewBox="0 0 16 16" className="w-3 h-3" fill="none"><path d="M3 8l3 3 7-7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
              </div>
              <div className="flex-1 min-w-0">
                <div className={`text-[12.5px] font-semibold ${t.done ? "line-through text-ink-400" : "text-ink-900"}`}>{t.label}</div>
                {!t.done && t.hint && <div className="text-[10.5px] text-ink-500 mt-0.5">{t.hint}</div>}
              </div>
              {!t.done && <Icon name="chevron-right" className="w-3.5 h-3.5 text-ink-300"/>}
            </>
          );
          if (t.done || !t.href) {
            return <div key={t.id} className="flex items-center gap-2.5 p-2 rounded-lg">{Inner}</div>;
          }
          return (
            <a key={t.id} href={t.href} className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-ink-50 transition">{Inner}</a>
          );
        })}
      </div>
    </Card>
  );
}

function OnboardingIllustration({ kind }) {
  if (kind === "intro") {
    return (
      <div className="rounded-xl bg-gradient-to-br from-asahi-500 to-asahi-700 text-white p-6 ring-1 ring-asahi-200">
        <div className="grid grid-cols-4 gap-3 text-[10.5px] font-bold">
          {[
            { n: "01", t: "ニュース" },
            { n: "02", t: "アイデア" },
            { n: "03", t: "磨く" },
            { n: "04", t: "採択" },
          ].map((s, i) => (
            <div key={i} className="bg-white/15 rounded-lg p-3 ring-1 ring-white/30 backdrop-blur">
              <div className="opacity-70 tracking-widest">{s.n}</div>
              <div className="mt-1 text-[12.5px]">{s.t}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (kind === "news") {
    return (
      <div className="rounded-xl ring-1 ring-ink-200 bg-white p-4 space-y-2">
        <div className="text-[10.5px] tracking-widest font-bold text-asahi-600">あなた向け</div>
        {[
          { c: "生活者トレンド", t: "GLP-1普及で「飲む量×動機」が構造変化", s: ["YAS-17"] },
          { c: "海外/先進企業事例", t: "Athletic Brewing が D2C で前年比 2.4x", s: ["REAL-ZERO"] },
        ].map((a, i) => (
          <div key={i} className="border-b border-ink-100 last:border-0 pb-2 last:pb-0">
            <div className="flex items-center gap-1.5 text-[10px] text-ink-500">
              <span className="w-1.5 h-1.5 rounded-full bg-asahi-500"/><span>{a.c}</span>
            </div>
            <div className="text-[12px] font-bold text-ink-900 mt-0.5">{a.t}</div>
            <div className="mt-1 flex gap-1">
              {a.s.map(s => <span key={s} className="text-[9.5px] font-bold text-asahi-700 bg-asahi-50 ring-1 ring-asahi-200 px-1.5 rounded">{s}</span>)}
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (kind === "idea") {
    return (
      <div className="rounded-xl ring-1 ring-ink-200 bg-white p-4">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-ink-50 ring-1 ring-ink-200 p-2 text-[10px] text-ink-600 flex-1">
            <div className="text-[9.5px] text-ink-400 tracking-widest">記事</div>
            <div className="font-bold text-ink-800 mt-0.5">GLP-1 と飲料市場…</div>
          </div>
          <div className="text-asahi-500 text-2xl leading-none mt-3">→</div>
          <div className="rounded-lg bg-asahi-50 ring-1 ring-asahi-200 p-2 text-[10px] flex-1">
            <div className="text-[9.5px] text-asahi-600 tracking-widest font-bold">アイデア下書き</div>
            <div className="font-bold text-ink-800 mt-0.5">『Sober Wellness』</div>
            <div className="mt-1 flex gap-1 flex-wrap">
              {["YAS-17","Hop-β","REAL-ZERO"].map(s => <span key={s} className="text-[9px] font-bold text-asahi-700 bg-white ring-1 ring-asahi-200 px-1 rounded">{s}</span>)}
            </div>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-1 text-[9.5px]">
          {["問題","顧客","ソリューション","市場規模","Go-to-Market","収益モデル"].map(k => (
            <div key={k} className="bg-ink-50 rounded px-1.5 py-1 text-ink-600 font-semibold text-center">{k}</div>
          ))}
        </div>
      </div>
    );
  }
  if (kind === "feedback") {
    return (
      <div className="rounded-xl ring-1 ring-ink-200 bg-white p-4 space-y-2.5">
        {[
          { who: "山田 美咲", role: "advisor", txt: "GLP-1 の話、ライフスタイルブランド化の角度を入れた方が刺さる" },
          { who: "中村 博之", role: "exec",    txt: "ブランド設計次第。カニバリを抑えるスキームが欲しい" },
        ].map((c, i) => (
          <div key={i} className="flex gap-2">
            <div className="h-7 w-7 rounded-full bg-asahi-500 text-white text-[10px] font-bold flex items-center justify-center shrink-0">{c.who[0]}</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 text-[10px]">
                <span className="font-bold text-ink-900">{c.who}</span>
                <span className="px-1 rounded bg-ink-100 text-ink-600 font-bold tracking-wider">{c.role}</span>
              </div>
              <div className="text-[11px] text-ink-700 mt-0.5">{c.txt}</div>
            </div>
          </div>
        ))}
        <div className="flex items-center gap-2 pt-2 border-t border-ink-100 text-[10px] text-ink-500">
          <span className="font-mono bg-ink-100 px-1 rounded">v1</span>→
          <span className="font-mono bg-ink-100 px-1 rounded">v2</span>→
          <span className="font-mono bg-asahi-100 text-asahi-700 px-1 rounded font-bold">v3</span>
          <span className="ml-1">改訂履歴は自動保存</span>
        </div>
      </div>
    );
  }
  if (kind === "review") {
    return (
      <div className="rounded-xl ring-1 ring-ink-200 bg-white p-4">
        <div className="flex items-center gap-2 mb-2">
          <div className="text-[11px] font-bold text-ink-900">役員レビュー</div>
          <div className="ml-auto text-[10.5px] text-ink-600"><b className="text-asahi-700">2</b><span className="text-ink-400"> / 3</span> 承認</div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[
            { who: "中村", d: "approve" },
            { who: "林田", d: "approve" },
            { who: "上田", d: "hold" },
          ].map((x, i) => {
            const tone = x.d === "approve" ? "bg-asahi-50 text-asahi-700 ring-asahi-200" : "bg-ink-100 text-ink-700 ring-ink-200";
            const label = x.d === "approve" ? "承認" : "保留";
            return (
              <div key={i} className={`rounded-lg ring-1 ${tone} p-2 text-center`}>
                <div className="text-[10px] text-ink-500">{x.who}</div>
                <div className="text-[11.5px] font-bold mt-0.5">{label}</div>
              </div>
            );
          })}
        </div>
        <div className="mt-3 text-[10.5px] text-ink-500">採択後はマイルストーンと予算消化を自動追跡</div>
        <div className="h-1 rounded-full bg-ink-100 mt-1 overflow-hidden">
          <div className="h-full bg-asahi-500" style={{width:"42%"}}/>
        </div>
      </div>
    );
  }
  return null;
}

function OnboardingModal() {
  const data = window.SPROUT_DATA;
  const app = useApp();
  const [step, setStep] = useState(0);
  const [domains, setDomains] = useState([...app.state.prefs.focusDomains]);
  const DOMAINS = ["発酵/酵母","飲料全般","健康/機能性","サステナ","パッケージ","生活者/世代","食/アップサイクル","AI/R&D"];

  function toggleD(v) {
    setDomains(arr => arr.includes(v) ? arr.filter(x=>x!==v) : [...arr, v]);
  }
  function finish() {
    app.setPrefs({ focusDomains: domains });
    window.location.hash = "#/dashboard";
  }

  const STEPS = [
    { kind: "intro",    eyebrow: "ASAHI R&D IDEATION HUB",   title: "SPROUT へようこそ",          body: "シーズ × ニーズで事業アイデアを連続的に生み出すための場所。思いついた瞬間に書ける/業界シグナルから着想する/類型・Phaseで整える、を1つのツールで。" },
    { kind: "idea",     eyebrow: "STEP 1 ｜ 思いついたら書く",         title: "白紙からでも、ニュースからでも",   body: "サイドバーやダッシュボードの『アイデアを書く』を押せば即ドラフト作成 → 自動保存。記事やシーズはあとから任意で紐付け、AIで叩き台も生成できます。" },
    { kind: "news",     eyebrow: "STEP 2 ｜ 兆しから着想する",         title: "今朝のニュース",       body: "国内外の食・健康・サステナのトレンドを毎朝集約。担当シーズに響く記事は『あなた向け』に並び、その場でアイデアに変換できます。" },
    { kind: "feedback", eyebrow: "STEP 3 ｜ 類型 × Phase で整える",     title: "6類型 + ゲート基準",   body: "補填/シナジー/オプション/意義/再定義/プラットフォームから戦い方を選ぶと、AI生成の観点が変わります。Phaseと次ゲート基準のチェックリストで進捗を可視化。" },
    { kind: "review",   eyebrow: "STEP 4 ｜ 仲間と磨いて役員へ",        title: "コメント → 判定 → 追跡",         body: "提出すると関係者からコメントが届き、改訂履歴が残ります。役員2名以上の承認で採択、予算とマイルストーンが自動追跡されます。" },
    { kind: "domains",  eyebrow: "もう少しだけ",                        title: "興味ある領域を選んでください", body: "朝のフィード上段にこの領域の記事を並べます。あとからいつでも変更できます。" },
  ];

  if (app.state.prefs.onboarded) return null;
  const cur = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <Modal open={true} onClose={()=>{}} size="lg">
      <div className="p-8">
        {/* Progress */}
        <div className="flex items-center gap-1.5 mb-5">
          {STEPS.map((_, i) => (
            <div key={i} className={`h-1.5 rounded-full transition-all ${i === step ? "w-10 bg-asahi-500" : i < step ? "w-1.5 bg-asahi-300" : "w-1.5 bg-ink-200"}`}/>
          ))}
          <div className="ml-auto text-[10.5px] text-ink-400 font-mono tabular-nums">{step+1} / {STEPS.length}</div>
        </div>

        <div className="flex items-center gap-2 mb-1">
          <Icon name="logo" className="w-5 h-5"/>
          <div className="text-[10.5px] tracking-widest font-bold text-asahi-600">{cur.eyebrow}</div>
        </div>
        <h2 className="text-2xl font-extrabold tracking-tight text-ink-900">{cur.title}</h2>
        <p className="text-ink-600 text-[13.5px] mt-1.5 leading-relaxed">{cur.body}</p>

        {cur.kind === "domains" ? (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-5">
              {DOMAINS.map(d => {
                const on = domains.includes(d);
                return (
                  <button key={d} onClick={()=>toggleD(d)}
                    className={`p-3 rounded-lg border-2 transition text-[12.5px] font-bold ${on ? "border-asahi-500 bg-asahi-50 text-asahi-700" : "border-ink-200 hover:border-ink-400 text-ink-700"}`}>
                    {d}
                  </button>
                );
              })}
            </div>
            <div className="text-[11px] text-ink-500 mt-3">選択中 <b className="text-ink-900">{domains.length}</b> 個 (推奨 2-4個)</div>
          </>
        ) : (
          <div className="mt-5"><OnboardingIllustration kind={cur.kind}/></div>
        )}

        <div className="flex items-center justify-between mt-7 pt-5 border-t border-ink-100">
          <div className="flex items-center gap-3">
            <button onClick={finish} className="text-[12px] text-ink-500 hover:text-ink-900">スキップ</button>
            {step > 0 && (
              <button onClick={()=>setStep(s => s - 1)} className="text-[12px] text-ink-700 hover:text-ink-900 font-semibold">← 戻る</button>
            )}
          </div>
          {isLast ? (
            <Button variant="dark" icon="check" onClick={finish}>始める</Button>
          ) : (
            <Button variant="primary" onClick={()=>setStep(s => s + 1)}>次へ →</Button>
          )}
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------
//  Command Palette — global search across ideas/articles/seeds/FB/people
//  Shortcut: ⌘K (Mac) / Ctrl+K (Win)
// ---------------------------------------------------------------
function useCommandPalette() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setOpen(v => !v);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return { open, setOpen };
}

function CommandPalette({ open, onClose, liveArticles = [] }) {
  const data = window.SPROUT_DATA;
  const app = useApp();
  const [q, setQ] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) { setQ(""); setActiveIdx(0); setTimeout(()=>inputRef.current?.focus(), 30); }
  }, [open]);

  const results = useMemo(() => {
    if (!open) return [];
    const query = q.trim().toLowerCase();

    // Helper: score a text blob against the query
    function score(texts, weights) {
      if (!query) return weights.default || 0;
      let s = 0;
      query.split(/\s+/).filter(Boolean).forEach(tok => {
        texts.forEach((t, i) => {
          const L = (t || "").toLowerCase();
          if (!L) return;
          const w = weights.byField[i] || 1;
          // exact title/name match heavily boosted
          if (L === tok) s += w * 8;
          else if (L.startsWith(tok)) s += w * 4;
          else if (L.includes(tok)) s += w * 2;
        });
      });
      return s;
    }

    const out = [];

    // Ideas
    allIdeas(data, app).forEach(i => {
      const s = score([i.title, i.codename, ...(Object.values(i.format || {}).filter(v => typeof v === "string"))], { byField: [5, 6, 1], default: 0 });
      if (s > 0 || !query) out.push({ kind: "idea", score: s, entity: i, href: `#/ideas/${i.id}`, label: i.title, meta: `#${i.codename} · ${effectiveStatus(i, app.state)}` });
    });

    // Seeds
    data.seeds.forEach(s_ => {
      const s = score([s_.name, s_.code, s_.summary, ...s_.tags], { byField: [5, 7, 1, 2], default: 0 });
      if (s > 0 || !query) out.push({ kind: "seed", score: s, entity: s_, href: `#/seeds`, label: `${s_.code} — ${s_.name}`, meta: s_.category });
    });

    // Articles (mock + live)
    const allArticles = [...(liveArticles || []), ...data.articles];
    allArticles.forEach(a => {
      const s = score([a.title, a.source, ...(a.summary || []), ...(a.tags || [])], { byField: [5, 2, 1, 2], default: 0 });
      if (s > 0) out.push({ kind: "article", score: s, entity: a, href: a.url || `#/dashboard`, label: a.title, meta: `${a.source}${a.live ? " · LIVE" : ""}`, external: !!a.url });
    });

    // Users
    data.users.forEach(u => {
      const s = score([u.name, u.role, u.dept], { byField: [5, 1, 1], default: 0 });
      if (s > 0) out.push({ kind: "person", score: s, entity: u, href: `#/ideas`, label: u.name, meta: `${u.role} · ${u.dept}` });
    });

    // Feedback
    allFeedback(data, app).forEach(f => {
      const s = score([f.text], { byField: [1], default: 0 });
      if (s > 2) {
        const idea = allIdeas(data, app).find(i => i.id === f.ideaId);
        const u = data.usersById[f.author];
        out.push({ kind: "feedback", score: s * 0.6, entity: f, href: `#/ideas/${f.ideaId}`, label: `${u?.name}: ${f.text.slice(0, 70)}…`, meta: `#${idea?.codename || "?"}` });
      }
    });

    // If no query, show sensible defaults
    if (!query) {
      return [
        ...allIdeas(data, app).slice(0, 4).map(i => ({ kind: "idea", score: 1, entity: i, href: `#/ideas/${i.id}`, label: i.title, meta: `#${i.codename}` })),
        ...data.seeds.slice(0, 3).map(s_ => ({ kind: "seed", score: 1, entity: s_, href: `#/seeds`, label: `${s_.code} — ${s_.name}`, meta: s_.category })),
      ];
    }

    out.sort((a,b) => b.score - a.score);
    return out.slice(0, 30);
  }, [q, open, liveArticles, app.state.extraIdeas, app.state.extraFeedback, app.state.decisions]);

  useEffect(() => { setActiveIdx(0); }, [q]);

  function go(r) {
    if (r.external) {
      window.open(r.href, "_blank", "noopener");
    } else {
      window.location.hash = r.href;
    }
    onClose();
  }

  function onKey(e) {
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx(i => Math.min(i+1, results.length-1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx(i => Math.max(i-1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); if (results[activeIdx]) go(results[activeIdx]); }
  }

  const grouped = useMemo(() => {
    const g = {};
    results.forEach(r => { (g[r.kind] = g[r.kind] || []).push(r); });
    return g;
  }, [results]);
  const groupOrder = ["idea", "seed", "article", "feedback", "person"];
  const groupLabels = { idea: "アイデア", seed: "シーズ", article: "記事", feedback: "コメント", person: "メンバー" };
  const groupIcons =  { idea: "bulb",  seed: "beaker", article: "rss",  feedback: "message", person: "user" };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4 bg-ink-900/40 backdrop-blur-sm fade-in" onClick={onClose}>
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-pop ring-1 ring-ink-200 overflow-hidden" onClick={e=>e.stopPropagation()}>
        <div className="flex items-center gap-2 px-4 py-3 border-b border-ink-100">
          <Icon name="search" className="w-5 h-5 text-ink-400"/>
          <input ref={inputRef} value={q} onChange={e=>setQ(e.target.value)} onKeyDown={onKey}
            placeholder="検索 — アイデア / シーズ / 記事 / コメント / メンバー"
            className="flex-1 h-9 text-[14px] outline-none"/>
          <kbd className="px-1.5 h-5 text-[10px] rounded bg-ink-100 text-ink-600 border border-ink-200 font-mono">Esc</kbd>
        </div>
        <div className="max-h-[60vh] overflow-auto">
          {results.length === 0 && (
            <div className="p-10 text-center text-[13px] text-ink-500">該当する結果がありません。</div>
          )}
          {groupOrder.map(g => {
            const items = grouped[g];
            if (!items || !items.length) return null;
            return (
              <div key={g}>
                <div className="px-4 py-1.5 bg-ink-50 text-[10.5px] font-bold tracking-widest text-ink-500 uppercase flex items-center gap-1.5 border-y border-ink-100">
                  <Icon name={groupIcons[g]} className="w-3.5 h-3.5"/> {groupLabels[g]} <span className="text-ink-400">({items.length})</span>
                </div>
                {items.map((r, i) => {
                  const globalIdx = results.indexOf(r);
                  const isActive = globalIdx === activeIdx;
                  return (
                    <button key={`${g}_${i}`} onMouseEnter={()=>setActiveIdx(globalIdx)} onClick={()=>go(r)}
                      className={`w-full text-left px-4 py-2.5 flex items-start gap-3 border-b border-ink-100 last:border-0 ${isActive ? "bg-asahi-50" : "hover:bg-ink-50"}`}>
                      <div className={`h-7 w-7 rounded-lg flex items-center justify-center shrink-0 ${isActive ? "bg-asahi-500 text-white" : "bg-ink-100 text-ink-600"}`}>
                        <Icon name={groupIcons[g]} className="w-3.5 h-3.5"/>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[12.5px] font-bold text-ink-900 line-clamp-1">{r.label}</div>
                        <div className="text-[10.5px] text-ink-500 line-clamp-1 mt-0.5">{r.meta}</div>
                      </div>
                      {r.external && <Icon name="arrow-up-right" className="w-3.5 h-3.5 text-ink-400 mt-1"/>}
                      {isActive && !r.external && <div className="text-[10px] text-asahi-600 font-bold self-center">Enter ↩</div>}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
        <div className="px-4 py-2 border-t border-ink-100 flex items-center gap-4 text-[10.5px] text-ink-500 bg-ink-50/50">
          <span className="inline-flex items-center gap-1"><kbd className="px-1 rounded bg-white border border-ink-200 font-mono">↑</kbd><kbd className="px-1 rounded bg-white border border-ink-200 font-mono">↓</kbd> 移動</span>
          <span className="inline-flex items-center gap-1"><kbd className="px-1 rounded bg-white border border-ink-200 font-mono">↵</kbd> 開く</span>
          <span className="inline-flex items-center gap-1"><kbd className="px-1 rounded bg-white border border-ink-200 font-mono">Esc</kbd> 閉じる</span>
          <span className="ml-auto">{results.length} 件</span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------
//  Page: Sources Admin — live ingestion pipeline health
// ---------------------------------------------------------------
function SourcesAdminPage() {
  const live = useLive();
  const [meta, setMeta] = useState(null);
  const [tab, setTab] = useState("list"); // list | groups
  const [editing, setEditing] = useState(null); // source object or "new"
  const [presetOpen, setPresetOpen] = useState(false);
  const [busy, setBusy] = useState({}); // id -> "refresh" | "delete"
  const [filter, setFilter] = useState("all"); // all | enabled | disabled | error

  const reload = useCallback(() => {
    fetch("/api/sources").then(r => r.json()).then(setMeta).catch(()=>{});
  }, []);
  useEffect(() => { reload(); }, [reload, live.lastRefreshedAt]);

  const sources = meta?.sources || [];
  const filtered = sources.filter(s => {
    if (filter === "enabled")  return s.enabled;
    if (filter === "disabled") return !s.enabled;
    if (filter === "error")    return s.status?.ok === false;
    return true;
  });

  const enabledCount = sources.filter(s => s.enabled).length;
  const failCount = sources.filter(s => s.status?.ok === false).length;

  const setBusyFor = (id, label) => setBusy(b => ({ ...b, [id]: label }));
  const clearBusy  = (id) => setBusy(b => { const n = {...b}; delete n[id]; return n; });

  async function toggleEnabled(s) {
    const next = !s.enabled;
    setMeta(m => ({ ...m, sources: m.sources.map(x => x.id === s.id ? { ...x, enabled: next } : x) }));
    setBusyFor(s.id, "toggle");
    try {
      await fetch(`/api/sources/${s.id}`, { method:"PATCH", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ enabled: next }) });
    } catch (e) {} finally { clearBusy(s.id); }
  }
  async function refreshOne(s) {
    setBusyFor(s.id, "refresh");
    try {
      await fetch(`/api/sources/${s.id}/refresh`, { method:"POST" });
      live.refresh(true);
      setTimeout(reload, 500);
    } finally { clearBusy(s.id); }
  }
  async function removeSource(s) {
    if (!confirm(`「${s.name}」を${s.builtin ? "無効化" : "削除"}しますか？`)) return;
    setBusyFor(s.id, "delete");
    try {
      await fetch(`/api/sources/${s.id}`, { method:"DELETE" });
      reload();
    } finally { clearBusy(s.id); }
  }
  async function saveSource(form, originalId) {
    const url = originalId ? `/api/sources/${originalId}` : `/api/sources`;
    const method = originalId ? "PATCH" : "POST";
    const r = await fetch(url, { method, headers:{"Content-Type":"application/json"}, body: JSON.stringify(form) });
    if (!r.ok) {
      const e = await r.json().catch(()=>({error:"unknown"}));
      alert("保存できませんでした: " + (e.error || r.status));
      return false;
    }
    setEditing(null);
    reload();
    return true;
  }
  async function addPreset(p) {
    const exists = sources.find(s => s.id === p.id || s.url === p.url);
    if (exists) {
      if (!exists.enabled) await toggleEnabled(exists);
      alert(`「${p.name}」は既に登録済みです${exists.enabled ? "" : " — 有効化しました"}。`);
      return;
    }
    await fetch(`/api/sources`, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(p) });
    reload();
  }

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2 text-[11.5px] text-ink-500 font-semibold mb-1.5">
            <Icon name="rss" className="w-3.5 h-3.5"/>
            <span>SETTINGS</span>
          </div>
          <h1 className="text-[24px] lg:text-[26px] font-extrabold tracking-tight text-ink-900 inline-flex items-center gap-2">
            情報ソース管理
          </h1>
          <p className="text-ink-500 text-[12.5px] mt-1">
            <b className="text-ink-900">{enabledCount} 件</b> 稼働中 / 全 <b>{sources.length} 件</b>{failCount > 0 && <> · <span className="text-rose-600 font-semibold">{failCount} 件エラー</span></>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" icon="globe" onClick={()=>setPresetOpen(true)}>プリセットから追加</Button>
          <Button variant="primary" icon="plus" onClick={()=>setEditing("new")}>新規追加</Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 p-1 bg-cream-100/80 rounded-xl w-fit">
        <button onClick={()=>setTab("list")}
          className={`px-4 h-9 rounded-lg text-[12.5px] font-bold transition ${tab==="list" ? "bg-white text-ink-900 shadow-sm" : "text-ink-500 hover:text-ink-800"}`}>
          ソース一覧
        </button>
        <button onClick={()=>setTab("groups")}
          className={`px-4 h-9 rounded-lg text-[12.5px] font-bold transition ${tab==="groups" ? "bg-white text-ink-900 shadow-sm" : "text-ink-500 hover:text-ink-800"}`}>
          グループ管理
        </button>
      </div>

      {tab === "list" && (
        <>
          {/* Filter chips */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] tracking-widest font-bold text-ink-400 mr-1">FILTER</span>
            {[
              { k:"all",      label:`すべて (${sources.length})` },
              { k:"enabled",  label:`稼働中 (${enabledCount})` },
              { k:"disabled", label:`停止中 (${sources.length - enabledCount})` },
              { k:"error",    label:`エラー (${failCount})`, danger:true },
            ].map(f => (
              <button key={f.k} onClick={()=>setFilter(f.k)}
                className={`px-3 h-7 rounded-full text-[11.5px] font-semibold border transition ${
                  filter===f.k
                    ? (f.danger ? "bg-rose-500 text-white border-rose-500" : "bg-asahi-500 text-white border-asahi-500")
                    : (f.danger ? "bg-white text-rose-700 border-rose-200 hover:border-rose-400" : "bg-white text-ink-700 border-ink-200 hover:border-asahi-300 hover:text-asahi-700")
                }`}>
                {f.label}
              </button>
            ))}
            <span className="ml-auto"/>
            <Button size="sm" variant="ghost" icon="rss" onClick={()=>live.refresh(true)} disabled={live.loading}>全ソース再取得</Button>
          </div>

          {/* Source cards */}
          <div className="space-y-2.5">
            {filtered.map(s => (
              <SourceCard key={s.id} s={s} busy={busy[s.id]}
                onToggle={()=>toggleEnabled(s)}
                onEdit={()=>setEditing(s)}
                onDelete={()=>removeSource(s)}
                onRefresh={()=>refreshOne(s)}
              />
            ))}
            {filtered.length === 0 && (
              <Card className="p-10 text-center text-ink-500 text-[13px]">
                {sources.length === 0 ? "読み込み中…" : "条件に一致するソースがありません"}
              </Card>
            )}
          </div>
        </>
      )}

      {tab === "groups" && (
        <div className="space-y-4">
          {[
            { key:"region",   label:"地域別",     get:s=>s.region||"—",   tone:"slate" },
            { key:"category", label:"カテゴリ別", get:s=>s.category||"—", tone:"red" },
            { key:"lang",     label:"言語別",     get:s=>s.lang,          tone:"blue" },
          ].map(group => {
            const buckets = {};
            sources.forEach(s => { (buckets[group.get(s)] ||= []).push(s); });
            return (
              <Card key={group.key} className="p-5">
                <div className="text-[11px] tracking-widest font-bold text-ink-400 mb-3">{group.label}</div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {Object.entries(buckets).map(([k, arr]) => (
                    <div key={k} className="p-3 rounded-xl ring-1 ring-ink-100 bg-cream-50/40">
                      <div className="flex items-center justify-between mb-2">
                        <Badge tone={group.tone}>{k}</Badge>
                        <span className="text-[11px] text-ink-500 font-semibold">{arr.length} 件</span>
                      </div>
                      <div className="space-y-1">
                        {arr.slice(0,5).map(s => (
                          <div key={s.id} className="flex items-center gap-1.5 text-[11.5px]">
                            <span className={`w-1.5 h-1.5 rounded-full ${s.enabled ? "bg-sprout-500" : "bg-ink-300"}`}/>
                            <span className={`truncate ${s.enabled ? "text-ink-800" : "text-ink-400 line-through"}`}>{s.name}</span>
                          </div>
                        ))}
                        {arr.length > 5 && <div className="text-[10.5px] text-ink-400 mt-1">他 {arr.length-5} 件…</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Pipeline meta (collapsible details) */}
      <details className="rounded-xl bg-white ring-1 ring-ink-100 overflow-hidden">
        <summary className="px-5 py-3 cursor-pointer font-bold text-[13px] text-ink-700 hover:bg-cream-50 flex items-center gap-2">
          <Icon name="chevron-right" className="w-4 h-4 transition group-open:rotate-90"/>
          高度な設定 — スコアリング / AI要約
        </summary>
        <div className="p-5 border-t border-ink-100 space-y-4">
          {/* LLM */}
          <div className="flex items-start gap-3 p-4 rounded-xl ring-1 ring-violet-100 bg-violet-50/30">
            <div className={`h-9 w-9 rounded-lg flex items-center justify-center text-white shrink-0 ${meta?.llm?.enabled ? "bg-gradient-to-br from-violet-500 to-asahi-500" : "bg-ink-300"}`}>
              <Icon name="sparkles" className="w-4 h-4"/>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="font-extrabold text-[13.5px] text-ink-900">AI要約 (Claude)</div>
                {meta?.llm?.enabled
                  ? <Badge tone="violet">有効 · {meta.llm.model}</Badge>
                  : <Badge tone="slate">未接続</Badge>}
              </div>
              <p className="text-[11.5px] text-ink-600 mt-1 leading-relaxed">
                {meta?.llm?.enabled
                  ? <>上位 <b>{meta.llm.topN || 20}</b> 件を3行要約に置換中(前回 <b>{meta.llm.summarized ?? 0}</b> 件)。</>
                  : <>環境変数 <code className="bg-ink-100 px-1 rounded text-[10.5px]">ANTHROPIC_API_KEY</code> を設定すると有効化。</>}
              </p>
            </div>
          </div>
          {/* Domains / seeds / HN */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div className="p-3 rounded-xl ring-1 ring-ink-100">
              <div className="text-[10.5px] tracking-widest font-bold text-ink-400 mb-2">関連度ドメイン</div>
              <div className="flex flex-wrap gap-1.5">
                {(meta?.relevanceDomains || []).map(d => <Badge key={d} tone="red">{d}</Badge>)}
              </div>
            </div>
            <div className="p-3 rounded-xl ring-1 ring-ink-100">
              <div className="text-[10.5px] tracking-widest font-bold text-ink-400 mb-2">シーズ照合</div>
              <div className="flex flex-wrap gap-1.5">
                {(meta?.seedKeywords || []).map(sid => {
                  const seed = window.SPROUT_DATA.seedsById[sid];
                  return <Badge key={sid} tone="amber">{seed?.code || sid}</Badge>;
                })}
              </div>
            </div>
            <div className="p-3 rounded-xl ring-1 ring-ink-100">
              <div className="text-[10.5px] tracking-widest font-bold text-ink-400 mb-2">HN検索語</div>
              <div className="flex flex-wrap gap-1.5">
                {(meta?.hnTerms || []).slice(0, 12).map(t => <Badge key={t} tone="blue">{t}</Badge>)}
                {(meta?.hnTerms || []).length > 12 && <span className="text-[10.5px] text-ink-400">+{meta.hnTerms.length-12}</span>}
              </div>
            </div>
          </div>
        </div>
      </details>

      {/* Edit modal */}
      <SourceEditModal
        open={editing !== null}
        source={editing === "new" ? null : editing}
        meta={meta}
        onSave={(form) => saveSource(form, editing && editing !== "new" ? editing.id : null)}
        onClose={() => setEditing(null)}
      />

      {/* Preset modal */}
      <PresetPickerModal
        open={presetOpen}
        presets={meta?.presets || []}
        existing={sources}
        onPick={(p) => addPreset(p)}
        onClose={() => setPresetOpen(false)}
      />

      {/* Hidden architecture pre block (kept for power users) */}
      <details className="rounded-xl bg-white ring-1 ring-ink-100 overflow-hidden">
        <summary className="px-5 py-3 cursor-pointer font-bold text-[13px] text-ink-700 hover:bg-cream-50">
          パイプライン構成図 (デバッグ)
        </summary>
        <pre className="font-mono text-[11px] text-ink-700 leading-relaxed overflow-auto p-5 border-t border-ink-100">{`Python HTTP server (stdlib only, no pip install)
├─ /                        static files
├─ GET    /api/articles     並列フェッチ + 正規化 + スコアリング + キャッシュ
├─ GET    /api/sources      ソース一覧 + 状態 + プリセット
├─ POST   /api/sources      ソース追加
├─ PATCH  /api/sources/<id> ソース編集 / 有効・無効切替
├─ DELETE /api/sources/<id> ソース削除 (組込みは無効化)
└─ POST   /api/sources/<id>/refresh 個別再取得

Sources (${sources.length} 登録 · ${enabledCount} 稼働)`}</pre>
      </details>
    </div>
  );
}

// ---------------------------------------------------------------
//  Source card / Edit modal / Preset picker
// ---------------------------------------------------------------
function SourceCard({ s, busy, onToggle, onEdit, onDelete, onRefresh }) {
  const ok = s.status?.ok;
  const lastFetched = s.status?.fetchedAt || (window.__sproutLastFetched || null);
  return (
    <div className={`rounded-2xl bg-white ring-1 transition ${
      ok === false ? "ring-rose-200/80 bg-rose-50/30" : "ring-ink-100 hover:ring-asahi-200 hover:shadow-card"
    }`}>
      <div className="flex items-center gap-4 px-4 py-3.5">
        {/* Toggle */}
        <button onClick={onToggle} disabled={busy === "toggle"}
          className={`relative shrink-0 w-11 h-6 rounded-full transition ${s.enabled ? "bg-asahi-500" : "bg-ink-200"} ${busy === "toggle" ? "opacity-60" : ""}`}
          aria-label="有効/無効を切り替え">
          <span className={`absolute top-0.5 h-5 w-5 bg-white rounded-full shadow-sm transition-all ${s.enabled ? "left-5" : "left-0.5"}`}/>
        </button>

        {/* Identity */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <div className={`text-[14px] font-extrabold truncate ${s.enabled ? "text-ink-900" : "text-ink-500"}`}>{s.name}</div>
            <Badge tone={CAT_TONE[s.category] || "slate"}>{s.category}</Badge>
            <Badge tone="slate">{s.region || "—"}</Badge>
            <span className="text-[11px] text-ink-500">{s.lang}</span>
            {s.builtin && <Badge tone="slate">組込み</Badge>}
            {ok === false && <Badge tone="red">エラー</Badge>}
            {ok === true && <Badge tone="green">正常</Badge>}
          </div>
          <div className="mt-1 flex items-center gap-3 text-[11.5px] text-ink-500">
            {s.url
              ? <a href={s.url} target="_blank" rel="noopener noreferrer" className="hover:text-asahi-600 truncate inline-flex items-center gap-1 max-w-[460px]">
                  <Icon name="link" className="w-3 h-3 shrink-0"/>
                  <span className="truncate">{s.url.replace(/^https?:\/\//,"")}</span>
                </a>
              : <span className="text-ink-400">— カスタムフェッチャ —</span>}
            {s.status?.total != null && (
              <span className="inline-flex items-center gap-1">
                <Icon name="clock" className="w-3 h-3"/>
                直近 <b className="text-ink-700 mx-0.5">{s.status.total}</b> 件取得
                {s.status.relevant != null && <> ・関連 <b className="text-asahi-700 mx-0.5">{s.status.relevant}</b></>}
                {s.status.ms && <> ・{s.status.ms}ms</>}
              </span>
            )}
          </div>
          {ok === false && s.status?.error && (
            <div className="mt-1 text-[11px] text-rose-600 font-semibold truncate" title={s.status.error}>✗ {s.status.error}</div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={onRefresh} disabled={!!busy} title="このソースを再取得"
            className="h-9 w-9 rounded-lg flex items-center justify-center text-ink-500 hover:bg-cream-100 hover:text-asahi-600 disabled:opacity-50 transition">
            <span className={busy === "refresh" ? "inline-block animate-spin" : ""}>↻</span>
          </button>
          <button onClick={onEdit} title="編集"
            className="h-9 w-9 rounded-lg flex items-center justify-center text-ink-500 hover:bg-cream-100 hover:text-ink-900 transition">
            <Icon name="pencil" className="w-4 h-4"/>
          </button>
          <button onClick={onDelete} disabled={!!busy} title={s.builtin ? "無効化(組込みは削除不可)" : "削除"}
            className="h-9 w-9 rounded-lg flex items-center justify-center text-rose-500 hover:bg-rose-50 disabled:opacity-50 transition">
            <Icon name="x" className="w-4 h-4"/>
          </button>
        </div>
      </div>
    </div>
  );
}

const CAT_TONE = {
  "生活者トレンド":     "red",
  "市場統計":           "blue",
  "海外/先進企業事例":  "green",
  "事業アイデア例":     "amber",
};

function SourceEditModal({ open, source, meta, onSave, onClose }) {
  const isNew = !source;
  const [form, setForm] = useState(() => source || { name:"", url:"", category:"生活者トレンド", region:"海外", lang:"EN", type:"カスタム", enabled:true });
  useEffect(() => {
    if (open) setForm(source || { name:"", url:"", category:"生活者トレンド", region:"海外", lang:"EN", type:"カスタム", enabled:true });
  }, [open, source]);

  if (!open) return null;
  const cats    = meta?.categories || ["生活者トレンド","市場統計","海外/先進企業事例","事業アイデア例"];
  const regions = meta?.regions    || ["国内","海外"];
  const langs   = meta?.langs      || ["JP","EN"];
  const update  = (k,v) => setForm(f => ({ ...f, [k]: v }));
  const submit  = async () => {
    if (!form.name?.trim() || !form.url?.trim()) { alert("ソース名とURLは必須です"); return; }
    await onSave(form);
  };

  return (
    <Modal open={open} onClose={onClose} size="md">
      <div className="px-5 py-4 border-b border-ink-100 flex items-center gap-2">
        <div className="h-8 w-8 rounded-lg bg-asahi-50 text-asahi-600 flex items-center justify-center">
          <Icon name={isNew ? "plus" : "pencil"} className="w-4 h-4"/>
        </div>
        <div className="font-extrabold text-[15px] text-ink-900">{isNew ? "ソースを追加" : "ソースを編集"}</div>
      </div>
      <div className="p-5 space-y-3.5">
        <Field label="ソース名" required>
          <input value={form.name || ""} onChange={e=>update("name", e.target.value)}
            placeholder="例: 日経新聞"
            className="w-full h-10 px-3 rounded-lg border border-ink-200 focus:border-asahi-400 focus:ring-2 focus:ring-asahi-100 text-[13px] outline-none"/>
        </Field>
        <Field label="フィードURL (RSS / Atom / RDF)" required>
          <input value={form.url || ""} onChange={e=>update("url", e.target.value)}
            placeholder="https://example.com/feed.xml"
            className="w-full h-10 px-3 rounded-lg border border-ink-200 focus:border-asahi-400 focus:ring-2 focus:ring-asahi-100 text-[13px] outline-none font-mono"/>
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="カテゴリ">
            <select value={form.category} onChange={e=>update("category", e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-ink-200 focus:border-asahi-400 focus:ring-2 focus:ring-asahi-100 text-[13px] outline-none bg-white">
              {cats.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="地域">
            <select value={form.region} onChange={e=>update("region", e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-ink-200 focus:border-asahi-400 focus:ring-2 focus:ring-asahi-100 text-[13px] outline-none bg-white">
              {regions.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </Field>
          <Field label="言語">
            <select value={form.lang} onChange={e=>update("lang", e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-ink-200 focus:border-asahi-400 focus:ring-2 focus:ring-asahi-100 text-[13px] outline-none bg-white">
              {langs.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </Field>
        </div>
        <Field label="種別ラベル(任意)">
          <input value={form.type || ""} onChange={e=>update("type", e.target.value)}
            placeholder="例: 国内メディア / 海外スタートアップ"
            className="w-full h-10 px-3 rounded-lg border border-ink-200 focus:border-asahi-400 focus:ring-2 focus:ring-asahi-100 text-[13px] outline-none"/>
        </Field>
        <label className="flex items-center gap-2 mt-2">
          <input type="checkbox" checked={!!form.enabled} onChange={e=>update("enabled", e.target.checked)} className="rounded"/>
          <span className="text-[12.5px] text-ink-700">追加と同時に有効化する</span>
        </label>
      </div>
      <div className="px-5 py-3 border-t border-ink-100 bg-cream-50/40 flex items-center justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>キャンセル</Button>
        <Button variant="primary" icon="check" onClick={submit}>{isNew ? "追加" : "保存"}</Button>
      </div>
    </Modal>
  );
}

function Field({ label, required, children }) {
  return (
    <div>
      <div className="text-[11px] font-bold text-ink-600 mb-1.5 inline-flex items-center gap-1">
        {label} {required && <span className="text-asahi-500">*</span>}
      </div>
      {children}
    </div>
  );
}

function PresetPickerModal({ open, presets, existing, onPick, onClose }) {
  const existingIds  = new Set((existing || []).map(s => s.id));
  const existingUrls = new Set((existing || []).map(s => s.url).filter(Boolean));
  if (!open) return null;
  return (
    <Modal open={open} onClose={onClose} size="lg">
      <div className="px-5 py-4 border-b border-ink-100 flex items-center gap-2">
        <div className="h-8 w-8 rounded-lg bg-sprout-50 text-sprout-700 flex items-center justify-center">
          <Icon name="globe" className="w-4 h-4"/>
        </div>
        <div className="font-extrabold text-[15px] text-ink-900">プリセットから追加</div>
        <span className="ml-auto text-[11.5px] text-ink-500">{presets.length} 件のおすすめソース</span>
      </div>
      <div className="p-4 max-h-[60vh] overflow-auto space-y-2">
        {presets.map(p => {
          const already = existingIds.has(p.id) || (p.url && existingUrls.has(p.url));
          return (
            <div key={p.id} className="flex items-center gap-3 p-3 rounded-xl ring-1 ring-ink-100 hover:bg-cream-50 transition">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="font-bold text-[13px] text-ink-900 truncate">{p.name}</div>
                  <Badge tone={CAT_TONE[p.category] || "slate"}>{p.category}</Badge>
                  <Badge tone="slate">{p.region}</Badge>
                  <span className="text-[10.5px] text-ink-500">{p.lang}</span>
                </div>
                <div className="text-[11px] text-ink-500 truncate mt-0.5">{p.url}</div>
              </div>
              <Button size="sm" variant={already ? "soft" : "primary"} icon={already ? "check" : "plus"}
                onClick={()=>{ onPick(p); }} disabled={already}>
                {already ? "登録済" : "追加"}
              </Button>
            </div>
          );
        })}
        {presets.length === 0 && <div className="p-6 text-center text-ink-500">プリセットがありません</div>}
      </div>
      <div className="px-5 py-3 border-t border-ink-100 bg-cream-50/40 flex items-center justify-end">
        <Button variant="ghost" onClick={onClose}>閉じる</Button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------
//  Setup Guide (初見ユーザー向け使い方)
// ---------------------------------------------------------------
function ProductTourVideo() {
  const [playing, setPlaying] = useState(false);
  const [available, setAvailable] = useState(null); // null=checking, true=ok, false=missing
  const SRC = "/assets/sprout-tour.mp4";

  useEffect(() => {
    let aborted = false;
    fetch(SRC, { method: "HEAD" })
      .then(r => { if (!aborted) setAvailable(r.ok); })
      .catch(() => { if (!aborted) setAvailable(false); });
    return () => { aborted = true; };
  }, []);

  if (playing && available) {
    return (
      <div className="relative rounded-2xl overflow-hidden ring-1 ring-ink-200 aspect-video shadow-card bg-ink-900">
        <video src={SRC} controls autoPlay playsInline className="w-full h-full"/>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={() => available && setPlaying(true)}
      disabled={!available}
      className="group relative w-full rounded-2xl overflow-hidden ring-1 ring-ink-200 aspect-video shadow-card bg-gradient-to-br from-asahi-600 via-asahi-500 to-asahi-700 text-left disabled:cursor-default">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.18),transparent_60%)]"/>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
        <div className={`h-20 w-20 rounded-full bg-white/15 ring-1 ring-white/40 backdrop-blur flex items-center justify-center transition ${available ? "group-hover:scale-105 group-hover:bg-white/25" : ""}`}>
          <svg viewBox="0 0 24 24" className="w-9 h-9 ml-1" fill="white"><path d="M8 5v14l11-7z"/></svg>
        </div>
        <div className="mt-5 text-[11px] tracking-[0.25em] font-bold opacity-90">SPROUT — PRODUCT TOUR</div>
        <div className="mt-1 text-[15px] font-semibold opacity-95">Asahi R&amp;D Ideation Hub</div>
        {available === false && (
          <div className="mt-3 text-[11px] bg-black/30 rounded-full px-3 py-1">動画準備中</div>
        )}
      </div>
    </button>
  );
}

function SetupGuidePage() {
  const { navigate } = useHashRoute();

  const steps = [
    { n:1, icon:"rss",     title:"ニュースを浴びる",     desc:"19のニュースソースから、自社R&Dに関連する記事を毎日自動収集します。「あなた向け」枠に、担当シーズと重なる記事が並びます。", cta:{ label:"ニュースを開く", href:"#/dashboard" } },
    { n:2, icon:"bulb",    title:"アイデアに変える",     desc:"気になる記事の「アイデアにする」を押すと、その記事と関連シーズが下書きに自動でぶら下がります。9項目のテンプレを埋めるだけ。", cta:{ label:"アイデアを書く", href:"#/ideas/new" } },
    { n:3, icon:"message", title:"仲間と磨く",           desc:"提出すると関係者からコメントが届きます。役職タグ(exec / advisor / peer)付きなので、誰の意見か一目瞭然。改訂のたびに履歴が残ります。", cta:{ label:"アイデア一覧へ", href:"#/ideas" } },
    { n:4, icon:"trophy",  title:"役員レビュー → 採択",  desc:"3名の役員が判定し、2名以上の承認で「採択」。マイルストーン・予算消化が自動追跡されます。", cta:{ label:"サンプルを見る", href:"#/ideas" } },
  ];

  return (
    <div className="p-6 lg:p-10 max-w-3xl mx-auto space-y-8">
      {/* Title */}
      <div>
        <h1 className="text-[24px] font-extrabold tracking-tight text-ink-900">使い方</h1>
        <p className="text-ink-500 text-[13px] mt-1.5">SPROUT の使い方を 4 ステップで。</p>
      </div>

      {/* Main use-case video */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-[10.5px] tracking-widest font-bold text-asahi-600">PRODUCT TOUR</span>
          <span className="text-[11px] text-ink-400">約 90 秒</span>
        </div>
        <h2 className="text-[16px] font-bold text-ink-900">メインユースケースを動画で見る</h2>
        <p className="text-[12.5px] text-ink-600 leading-relaxed">
          毎朝のニュース取得 → 関連シーズと結びつけてアイデア化 → 仲間と磨く → 役員レビュー、までの流れを一気に確認できます。
        </p>
        <ProductTourVideo/>
        <div className="text-[11px] text-ink-500 leading-relaxed">
          ※ 動画ファイルは <code className="px-1 rounded bg-ink-100 font-mono text-[10.5px]">/assets/sprout-tour.mp4</code> に配置すると、サムネイルをタップしてその場で再生できます。
        </div>
      </div>

      {/* Steps */}
      <div className="space-y-3">
        {steps.map(s => (
          <div key={s.n} className="flex items-start gap-4 p-5 rounded-xl bg-white ring-1 ring-ink-100">
            <div className="shrink-0 h-10 w-10 rounded-lg bg-asahi-50 text-asahi-600 flex items-center justify-center font-extrabold text-[14px]">
              {s.n}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-[15px] text-ink-900">{s.title}</h3>
              <p className="text-[12.5px] text-ink-600 mt-1 leading-relaxed">{s.desc}</p>
              <button onClick={()=>navigate(s.cta.href)}
                className="mt-3 text-[12px] font-semibold text-asahi-600 hover:text-asahi-700">
                {s.cta.label} →
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------
//  Main App
// ---------------------------------------------------------------
function App() {
  const app = useStore();
  const live = useLiveArticles();
  const { parts } = useHashRoute();
  const palette = useCommandPalette();
  // expose globally so Header search input can open it
  window.__openPalette = () => palette.setOpen(true);

  // Hide loader after first paint
  useEffect(() => {
    const l = document.getElementById("loader");
    if (l) { l.style.opacity = "0"; setTimeout(()=>l.remove(), 400); }
  }, []);

  let page;
  const route = parts[0] || "dashboard";
  const sub = parts[1];
  if (route === "dashboard") page = <Dashboard/>;
  else if (route === "seeds") page = <SeedsPage/>;
  else if (route === "sources") page = <SourcesAdminPage/>;
  else if (route === "guide" || route === "setup") page = <SetupGuidePage/>;
  else if (route === "ideas" && sub === "new") page = <IdeaEditor/>;
  else if (route === "ideas" && sub && parts[2] === "edit") page = <IdeaEditor id={sub}/>;
  else if (route === "ideas" && sub) page = <IdeaDetailPage id={sub}/>;
  else if (route === "ideas") page = <IdeasPage/>;
  else if (route === "inbox") page = <InboxPage/>;
  else if (route === "me") page = <MePage/>;
  else page = <Dashboard/>;

  return (
    <StoreCtx.Provider value={app}>
      <LiveCtx.Provider value={live}>
        <Shell>
          <div className="fade-in" key={window.location.hash}>{page}</div>
        </Shell>
        <OnboardingModal/>
        <CommandPalette open={palette.open} onClose={()=>palette.setOpen(false)} liveArticles={live.articles}/>
      </LiveCtx.Provider>
    </StoreCtx.Provider>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App/>);
