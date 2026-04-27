// ============================================================
//  SPROUT — Asahi R&D Ideation Hub / Mock Data
//  全てダミーデータ。実在の企業・人物・数値とは無関係。
// ============================================================

window.SPROUT_DATA = (function () {
  // -------- Users --------
  const users = [
    { id: "u_shibata",  name: "柴田 遼",         role: "R&D / 発酵技術",    dept: "研究開発部",   avatar: "柴", color: "bg-rose-500",    isExec: false, isInvestor: false },
    { id: "u_yamada",   name: "山田 美咲",       role: "マーケ戦略",         dept: "事業企画",     avatar: "山", color: "bg-amber-500",   isExec: false, isInvestor: false },
    { id: "u_sasaki",   name: "佐々木 健",       role: "事業開発",           dept: "新規事業推進",  avatar: "佐", color: "bg-emerald-500", isExec: false, isInvestor: false },
    { id: "u_kimura",   name: "木村 亮太",       role: "若手エンジニア",      dept: "研究開発部",   avatar: "木", color: "bg-sky-500",     isExec: false, isInvestor: false },
    { id: "u_nakamura", name: "中村 博之",       role: "CTO",                dept: "技術本部",     avatar: "中", color: "bg-indigo-600",  isExec: true,  isInvestor: false },
    { id: "u_ueda",     name: "上田 恵子",       role: "執行役員 / 新規事業担当", dept: "経営企画",  avatar: "上", color: "bg-violet-600",  isExec: true,  isInvestor: false },
    { id: "u_hayashida",name: "林田 慶一郎",     role: "社外取締役",         dept: "外部 (元VC)",  avatar: "林", color: "bg-slate-700",   isExec: true,  isInvestor: true },
    { id: "u_chen",     name: "David Chen",     role: "外部アドバイザー",    dept: "SF / Venture",avatar: "DC", color: "bg-teal-600",    isExec: false, isInvestor: true },
    { id: "u_mori",     name: "森田 さくら",     role: "生活者インサイト",    dept: "マーケ本部",   avatar: "森", color: "bg-pink-500",    isExec: false, isInvestor: false },
    { id: "u_takahashi",name: "高橋 純平",       role: "R&D / 素材",         dept: "研究開発部",   avatar: "高", color: "bg-orange-500",  isExec: false, isInvestor: false },
  ];
  const me = users[0]; // 柴田 遼 としてログイン

  // -------- Seeds (自社シーズ) --------
  const seeds = [
    {
      id: "s_yas17",
      code: "YAS-17",
      name: "高香気生成 独自酵母",
      category: "発酵",
      tags: ["酵母", "香気成分", "フレーバー", "発酵制御"],
      owner: "u_shibata",
      maturity: "TRL 6 — パイロット生産済",
      readiness: 78,
      summary: "エステル系香気成分を通常株の2.4倍生成する独自改良酵母。低温帯でも発酵効率を維持し、多様な用途展開が可能。",
      detail: "10年以上の社内育種により得た酵母株。ビール領域外でも展開余地があるが、安定供給オペレーションと用途拡大は未検証。",
      ipStatus: "特許出願中 (JP 2024-XXXXXX) / 3カ国",
      constraints: ["発酵温度 12-18℃ に最適", "生産リードタイム 3週間", "他菌との共培養は未検証"]
    },
    {
      id: "s_hopbeta",
      code: "Hop-β",
      name: "ホップ由来機能性成分",
      category: "機能性素材",
      tags: ["ホップ", "機能性", "リラックス", "睡眠"],
      owner: "u_takahashi",
      maturity: "TRL 5 — ヒト試験初期",
      readiness: 62,
      summary: "ホップ苞から抽出する希少成分。予備的臨床でストレス指標とリラックス主観評価で有意差を確認。",
      detail: "抽出収率が現行プロセスで0.03%と低く、コスト改善が商用化の壁。機能性表示食品への展開を検討中。",
      ipStatus: "物質特許取得済",
      constraints: ["抽出収率の改善要", "独自サプライチェーン必要"]
    },
    {
      id: "s_co2loop",
      code: "CO2-LOOP",
      name: "発酵由来CO2回収・資源化プロセス",
      category: "サステナ",
      tags: ["CO2", "脱炭素", "循環", "発酵副産物"],
      owner: "u_nakamura",
      maturity: "TRL 7 — 実プラント稼働",
      readiness: 84,
      summary: "発酵工程で発生するCO2を95%以上回収し、食品用途・化学原料用途で再利用する循環プロセス。",
      detail: "既に国内2工場で稼働。外販・ライセンス供与の事業化はこれから。",
      ipStatus: "プロセス特許 + ノウハウ",
      constraints: ["回収設備の初期投資が大きい", "需要地近接が前提"]
    },
    {
      id: "s_paperpack",
      code: "PAPER-PAK",
      name: "紙ベース飲料パッケージ (PET代替)",
      category: "パッケージ",
      tags: ["紙", "サステナ", "PET代替", "リサイクル"],
      owner: "u_takahashi",
      maturity: "TRL 6 — 量産化技術確立",
      readiness: 70,
      summary: "複層紙+薄膜ライナーによる炭酸対応紙容器。PET比でCO2排出を約65%削減。",
      detail: "ラインスピードと炭酸保持の両立は確立。冷蔵流通前提の低温耐性は検証中。",
      ipStatus: "共同特許 (製紙大手)",
      constraints: ["炭酸の保持は4週間まで検証", "印刷工程は一部既存設備の改造が必要"]
    },
    {
      id: "s_lb4012",
      code: "LB-4012",
      name: "腸内環境改善 乳酸菌",
      category: "機能性素材",
      tags: ["乳酸菌", "腸内", "機能性", "プロバイオ"],
      owner: "u_shibata",
      maturity: "TRL 6 — 機能性表示食品化済",
      readiness: 80,
      summary: "腸管粘膜付着性の高い独自株。ストレス応答に関わる脳腸相関の機能性エビデンスを蓄積中。",
      detail: "飲料への配合実績あり。パーソナライズ領域や海外展開は未着手。",
      ipStatus: "菌株寄託 + 用途特許",
      constraints: ["加熱殺菌で失活", "冷蔵流通が前提"]
    },
    {
      id: "s_realzero",
      code: "REAL-ZERO",
      name: "ノンアル発酵制御技術",
      category: "発酵",
      tags: ["ノンアル", "低アル", "発酵制御", "リアルテイスト"],
      owner: "u_shibata",
      maturity: "TRL 7 — 既存商品で採用済",
      readiness: 82,
      summary: "通常発酵後にアルコールのみを選択的に除去する独自プロセス。本格的な発酵風味を維持。",
      detail: "ビール以外のカテゴリ（ワイン類、蒸留酒風など）への展開余地。",
      ipStatus: "プロセス特許 / 3カ国",
      constraints: ["蒸留工程が必要で小ロット不向き", "0.00%まで除去時の風味劣化は要調整"]
    },
    {
      id: "s_microfd",
      code: "μ-FD",
      name: "超微細フリーズドライ",
      category: "食品加工",
      tags: ["フリーズドライ", "微細化", "食感", "機能保持"],
      owner: "u_takahashi",
      maturity: "TRL 5 — ラボ量産",
      readiness: 55,
      summary: "従来比で粒径を1/10以下にするフリーズドライ技術。機能性成分の熱劣化を回避。",
      detail: "顆粒飲料やサプリ用途で引き合いあり。量産設備投資判断が未実施。",
      ipStatus: "ノウハウ中心",
      constraints: ["大型設備が必要", "現状は試作ライン"]
    },
    {
      id: "s_flavorai",
      code: "FLAVOR-AI",
      name: "AI香味設計プラットフォーム",
      category: "AI / デジタル",
      tags: ["AI", "香味", "データ", "レシピ設計"],
      owner: "u_nakamura",
      maturity: "TRL 4 — 社内試験運用",
      readiness: 50,
      summary: "20年超の官能評価データを学習し、任意のコンセプトから候補レシピを秒で生成するAI。",
      detail: "社内の試作リードタイムを1/5に短縮。外販・他業種展開の検討余地。",
      ipStatus: "ソフトウェア / データ権利",
      constraints: ["社内データ依存", "他社データを統合する場合はスキーマ設計から"]
    },
    {
      id: "s_huskprotein",
      code: "HUSK-P",
      name: "麦芽粕アップサイクル高タンパク素材",
      category: "食品加工",
      tags: ["アップサイクル", "プロテイン", "副産物", "サステナ"],
      owner: "u_takahashi",
      maturity: "TRL 5 — ピロット試作",
      readiness: 58,
      summary: "ビール製造副産物のスペントグレインから、繊維・タンパクを高効率で回収。",
      detail: "プロテインバーや代替肉の原料として引き合い。レギュラー供給体制は未整備。",
      ipStatus: "プロセス特許出願",
      constraints: ["季節変動あり", "保存性の確保が課題"]
    },
    {
      id: "s_swallow",
      code: "SWALLOW-C",
      name: "嚥下配慮 とろみ制御技術",
      category: "食品加工",
      tags: ["嚥下", "高齢者", "とろみ", "機能性"],
      owner: "u_shibata",
      maturity: "TRL 6 — 介護施設試験済",
      readiness: 72,
      summary: "温度に依存しない安定したとろみを実現する独自増粘系。炭酸飲料でも使用可能。",
      detail: "医療・介護向けルートあり。一般向けブランド化は未着手。",
      ipStatus: "処方特許",
      constraints: ["原料コスト", "特定温度帯での白濁"]
    }
  ];

  // -------- Articles (萌芽探索RSS) --------
  //  LIVE取得 (server.py /api/articles) で実データが入ります。
  //  サーバ停止時はダッシュボードは空になります。
  const articles = [];


  // -------- Ideas --------
  const ideas = [
    {
      isExample: true,
      id: "i_soberwellness",
      codename: "Sober Wellness",
      title: "GLP-1時代のノンアル戦略ブランド『Sober Wellness』",
      author: "u_shibata",
      status: "役員レビュー中",
      createdAt: "2026-04-21",
      updatedAt: "2026-04-23",
      likes: 23,
      likedBy: ["u_yamada", "u_sasaki", "u_ueda", "u_chen", "u_mori"],
      linkedArticles: ["a_glp1", "a_sober", "a_zeroproofbar"],
      linkedSeeds: ["s_realzero", "s_hopbeta", "s_lb4012"],
      scores: { market: 4.6, feasibility: 4.0, seedFit: 4.8, novelty: 3.8 },
      format: {
        problem: "GLP-1 の普及で『飲む量 × 飲む動機』の両方が構造変化。既存ビール事業の将来需要が収縮する可能性が高い。一方で『少量・機能性・気分設計』という新しい飲用ニーズが立ち上がりつつある。",
        customer: "都市部の25-45歳、健康・パフォーマンスに投資する層。プライマリは『飲酒習慣を減らしつつも、飲用体験の豊かさは捨てたくない人』。",
        solution: "『REAL-ZERO』による本格風味のノンアル × 『Hop-β』のリラックス機能性 × 『LB-4012』の腸内機能性を組み合わせた、気分デザインノンアルのプレミアムブランド。",
        unfairAdvantage: "20年以上蓄積されたノンアル発酵の官能評価データと、独自酵母・独自機能性素材。後発では作れない『機能性 × 本格風味』の両立。",
        marketSize: "国内 $2.5B(機能性ノンアル) + 海外 $28B(2030予測) / 初期3年で国内 50億円 GMV を目標。",
        goToMarket: "Phase1: プレミアム外食・ゼロプルーフバー / Phase2: 高感度スーパー・EC / Phase3: GMS・海外 (欧米・インド)。",
        competitors: "Athletic Brewing, Recess, 国内大手各社のノンアル派生ブランド。いずれも『機能性 × 本格風味 × ライフスタイルブランド』の三位一体を実現できていない。",
        businessModel: "D2Cサブスク + 外食BtoB + プレミアム小売。GMS参入までは意図的に限定流通でブランド価値を積む。",
        roadmap: [
          { period: "〜2026 Q3", milestone: "コンセプト検証 & プロトタイプ5SKU試作" },
          { period: "2026 Q4",  milestone: "都内ゼロプルーフバー 3店舗での先行提供" },
          { period: "2027 Q1",  milestone: "D2C ローンチ & サブスク開始" },
          { period: "2027 Q3",  milestone: "海外(米・英・シンガポール)テスト販売" },
        ],
        risks: [
          "機能性表示の取得遅延",
          "プレミアム単価の受容性",
          "自社ビール事業とのカニバリゼーション（段階的にブランド分離でヘッジ）"
        ],
        ask: "Phase1実施のための R&D + マーケ予算 1.8億円、および外食アライアンス起点に向けた事業開発リソースの配分。",
      }
    },
    {
      isExample: true,
      id: "i_airbeer",
      codename: "Air Beer",
      title: "『Air Beer』— 発酵CO2を再利用する地球規模カーボンニュートラル飲料",
      author: "u_nakamura",
      status: "採択",
      createdAt: "2026-03-29",
      updatedAt: "2026-04-18",
      likes: 41,
      likedBy: ["u_ueda", "u_hayashida", "u_chen", "u_yamada", "u_sasaki", "u_mori", "u_takahashi", "u_shibata"],
      linkedArticles: ["a_co2nature", "a_paperpack", "a_water"],
      linkedSeeds: ["s_co2loop", "s_paperpack"],
      scores: { market: 4.2, feasibility: 4.6, seedFit: 4.9, novelty: 4.2 },
      format: {
        problem: "ビール製造は大量のCO2と水を使い、ESG圧力が年々強まっている。単なる排出削減だけでは、Z世代・欧州市場・ESG投資家の期待を超えられない。",
        customer: "ESG志向の高感度消費者、サステナ調達方針を持つ大手小売・外食・エアライン。",
        solution: "CO2-LOOPで発酵由来CO2を95%回収し、同じプロダクトに戻す真の循環設計。容器は PAPER-PAK で非PET化。",
        unfairAdvantage: "CO2-LOOPの実プラント稼働実績 + PAPER-PAK の共同特許。単独で揃う競合は国内に存在しない。",
        marketSize: "国内外サステナ・プレミアム飲料 約 $8B(2028)。",
        goToMarket: "欧州のサステナ先進小売(Tesco, REWE)、アジアのプレミアムチェーン、エアライン機内食BtoBから。",
        competitors: "Coca-Cola系(紙容器のみ)、Heineken(CO2排出削減のみ)。両方を同時に商品体験に統合しているプレイヤーなし。",
        businessModel: "既存ブランドのサステナ・プレミアムラインとして展開。+15〜20% の価格プレミアムを戦略的に設計。",
        roadmap: [
          { period: "〜2026 Q4", milestone: "プロトタイプ製造+欧州小売 2社との商談" },
          { period: "2027 Q2",  milestone: "欧州限定ローンチ" },
          { period: "2027 Q4",  milestone: "国内展開 + エアラインBtoB" },
          { period: "2028",     milestone: "CO2-LOOPの他社ライセンス事業化" }
        ],
        risks: [
          "紙容器の冷蔵物流対応",
          "地域ごとのリサイクル規格整合",
          "既存容器ラインの稼働率影響"
        ],
        ask: "欧州ローンチの事業予算 3.2億円 + CO2-LOOP外販用の事業開発人員2名。"
      }
    }
    ];

  // -------- Feedback (threaded) --------
  // 各 feedback は ideaId に紐付く。
  const feedback = [
    { id:"f1",  ideaId:"i_soberwellness", author:"u_ueda",      at:"2026-04-22 09:14", role:"exec",     text:"論点が明確で非常に良い。ひとつ確認：既存ビールブランドとのカニバリはどう評価している？段階的なブランド分離の考え方、もう少し説明が欲しい。", reactions:{like:5, insight:2} },
    { id:"f2",  ideaId:"i_soberwellness", author:"u_shibata",   at:"2026-04-22 10:40", role:"author",   text:"上田さんご指摘ありがとうございます。Phase1は完全別ブランドで、Phase3のGMS参入時に初めてマスターブランド側との関係を設計する前提です。Phase1・2ではユーザー層の重なりが小さく、実質カニバリは限定的と見ています。", reactions:{like:3} },
    { id:"f3",  ideaId:"i_soberwellness", author:"u_hayashida", at:"2026-04-22 13:22", role:"investor", text:"数字面：GMV 50億円(3年)は保守的。外食+D2Cの組合せで、米Athletic Brewingと同規模なら100億円も見える。Phase1の投資インテンシティを上げる議論を歓迎。", reactions:{like:6, agree:2} },
    { id:"f4",  ideaId:"i_soberwellness", author:"u_chen",      at:"2026-04-22 16:05", role:"advisor",  text:"Strong pitch. If you want US entry, do NOT launch as Asahi-brand. Instead, acquire or JV with a cult brand in LA/NYC. I can intro 2-3.", reactions:{like:4, insight:3} },
    { id:"f5",  ideaId:"i_soberwellness", author:"u_yamada",    at:"2026-04-23 10:11", role:"peer",     text:"マーケ視点の補足です。カテゴリ名は『機能性ノンアル』より『Sober Lifestyle』の方が欧米で刺さります。Zen Brewと棲み分けを明確化したい。", reactions:{like:2} },
    { id:"f6",  ideaId:"i_airbeer", author:"u_ueda",      at:"2026-04-05 09:00", role:"exec",     text:"採択します。CO2-LOOPを外販する発想まで踏み込んでいる点を評価。ただし欧州ローンチのタイミングは2027 Q2で本当に間に合うか、物流+認証の詳細を詰めて次回報告を。", reactions:{like:8, agree:2} },
    { id:"f7",  ideaId:"i_airbeer", author:"u_nakamura",  at:"2026-04-05 11:10", role:"author",   text:"上田さん、承知。物流は DHL の欧州循環便契約で前倒し可能性あり、認証は EU Ecolabel を先行取得する方向です。", reactions:{like:3} },
    { id:"f8",  ideaId:"i_airbeer", author:"u_hayashida", at:"2026-04-06 15:30", role:"investor", text:"このアイデアは事業単体だけでなく『CO2-LOOP ライセンス外販』の方が EBITDA マージンが高い可能性。別スキームで子会社化して自立採算で運営するのはどうか。", reactions:{like:7, insight:4} },
    { id:"f9",  ideaId:"i_airbeer", author:"u_sasaki",    at:"2026-04-08 10:00", role:"peer",     text:"事業開発として言えば、エアライン(JAL/ANA)機内食の B2B 予算はサステナ連動で大きく動いている。そこを最速ローンチのショーケースにしたい。", reactions:{like:4} },
    { id:"f10", ideaId:"i_airbeer", author:"u_chen",      at:"2026-04-10 20:30", role:"advisor",  text:"Globally, Coca-Cola has paper but no CO2 loop; Heineken has CO2 story but no paper. You're the only one who can claim both. Double down on this narrative in press.", reactions:{like:6} },
    ];

  // -------- Activity events (サンプル2本に紐づくもののみ) --------
  const activity = [
    { id:"ev1", user:"u_shibata",   type:"created-idea", at:"2026-04-21", target:"i_soberwellness" },
    { id:"ev2", user:"u_ueda",      type:"commented",    at:"2026-04-22", target:"i_soberwellness" },
    { id:"ev3", user:"u_hayashida", type:"liked",        at:"2026-04-22", target:"i_airbeer" },
    { id:"ev6", user:"u_ueda",      type:"approved",     at:"2026-04-18", target:"i_airbeer" },
    { id:"ev7", user:"u_chen",      type:"commented",    at:"2026-04-22", target:"i_soberwellness" },
  ];

  // -------- AI suggestions (例としてサンプル2件) --------
  //  LIVE記事が蓄積されると、シーズ × 萌芽記事の組み合わせが自動生成されます。
  const aiSuggestions = [
    {
      id: "sg1",
      title: "(例) REAL-ZERO × Hop-β のプレミアム機能性ノンアル",
      fromSeeds: ["s_realzero", "s_hopbeta"],
      fromArticles: [],
      rationale: "AI提案のサンプルです。『少量・高満足・機能性』という生活者トレンドに、本格ノンアル発酵技術とリラックス成分を掛け合わせる組み合わせ。",
      confidence: 0.78,
      isExample: true,
    },
    {
      id: "sg2",
      title: "(例) CO2-LOOP の外販による『発酵CO2 as a Service』",
      fromSeeds: ["s_co2loop"],
      fromArticles: [],
      rationale: "自社内利用のCO2回収プロセスを、食品グレードCO2の構造的不足を狙ったB2B供給事業へ外販。既存資産のレバレッジで粗利率の高い別事業化が可能。",
      confidence: 0.72,
      isExample: true,
    },
  ];

  // -------- Helpers --------
  const byId = (arr) => Object.fromEntries(arr.map(x => [x.id, x]));
  const usersById    = byId(users);
  const seedsById    = byId(seeds);
  const articlesById = byId(articles);
  const ideasById    = byId(ideas);

  const articleCategories = [
    { key: "all", label: "すべて", color:"bg-slate-800" },
    { key: "生活者トレンド",     color:"bg-rose-500" },
    { key: "市場統計",           color:"bg-indigo-500" },
    { key: "海外/先進企業事例",  color:"bg-emerald-500" },
    { key: "事業アイデア例",     color:"bg-amber-500" },
  ];

  const statusMeta = {
    "ドラフト":       { color: "bg-slate-200 text-slate-700 border-slate-300" },
    "提出済":         { color: "bg-sky-100 text-sky-800 border-sky-300" },
    "役員レビュー中": { color: "bg-amber-100 text-amber-800 border-amber-300" },
    "採択":           { color: "bg-emerald-100 text-emerald-800 border-emerald-300" },
    "差し戻し":       { color: "bg-rose-100 text-rose-800 border-rose-300" },
  };

  return {
    me, users, usersById,
    seeds, seedsById,
    articles, articlesById, articleCategories,
    ideas, ideasById, statusMeta,
    feedback,
    activity,
    aiSuggestions
  };
})();
