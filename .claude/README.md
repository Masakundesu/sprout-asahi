# A1Growth エージェントチーム

株式会社A1Growth(仮称)/ D2Cサプリメント事業「KAMIの酵母」に最適化した Claude Code サブエージェント構成。

**会社のゴール: 日本最高峰の企業にM&Aされること。** 全エージェントはこのゴールを共有し、「買い手のデューデリジェンスに耐える会社を日常から作る」ことを行動原理とする(詳細は `company/PROFILE.md`)。

## 構成

```
.claude/
├── company/
│   └── PROFILE.md        # 会社・商品・ゴールの共有コンテキスト(全エージェントが最初に読む)
└── agents/
    ├── market-researcher.md   # 市場・競合・トレンド調査
    ├── biz-planner.md         # 事業企画・提案書・ピッチ構成
    ├── copywriter.md          # LP・広告・SNS・メルマガ
    ├── yakkiho-checker.md     # 薬機法・景表法・健増法チェック
    ├── sales-support.md       # 代理店・パートナー向け営業支援
    ├── product-engineer.md    # EC・プロダクト実装
    ├── code-reviewer.md       # コードレビュー(読み取り専用)
    ├── backoffice.md          # 議事録・契約書ドラフト・DD対応文書管理
    ├── finance-controller.md  # 月次・管理会計・資金繰り・KPI(LTV/CAC/継続率)
    └── cfo-strategist.md      # 資本政策・想定買い手マッピング・DD準備・企業価値
```

## 使い方

Claude Code 上で普通に依頼すれば、内容に応じて適切なエージェントに自動で委譲される。明示的に指名したい場合は「market-researcher で競合を調べて」のように名前を出す。

### 典型的なワークフロー

- **新しい訴求を作る**: market-researcher(競合の訴求調査)→ copywriter(コピー作成)→ **yakkiho-checker(公開前チェック・必須)**
- **代理店開拓**: market-researcher(候補リスト)→ sales-support(提案資料)→ yakkiho-checker(配布前チェック)
- **大型契約の検討**: backoffice(条項の論点洗い出し)→ cfo-strategist(エグジットへの影響評価)
- **月次の締め**: finance-controller(KPI・資金繰り更新)→ 気になる数字は biz-planner / cfo-strategist へ
- **機能開発**: product-engineer(実装)→ code-reviewer(レビュー)
- **企画立案**: market-researcher(調査)→ biz-planner(企画書)→ finance-controller(収益性検証)

### 鉄則

1. **対外表現は必ず yakkiho-checker を通す**(LP・広告・SNS・営業資料・パッケージ)。薬機法違反歴ゼロはM&A時の前提条件であり、企業価値そのもの
2. **記録はDD資料**。契約・議事録・数字は「第三者に見せられる状態」で残す
3. **売却を縛る契約に注意**。独占条項・競業避止・チェンジオブコントロールは cfo-strategist に相談

## 会社の他リポジトリへの導入

この構成はリポジトリ非依存。新しいリポジトリに `.claude/agents/` と `.claude/company/` をそのままコピーすれば動く。

## メンテナンス

- 会社・商品情報が変わったら `company/PROFILE.md` を更新する(社名確定、価格改定、機能性表示食品の届出など)
- 特に機能性表示食品の届出が通った場合は PROFILE.md と yakkiho-checker.md の前提を必ず更新すること(可能な表現範囲が変わる)
- 買い手候補や調達の検討が具体化したら、cfo-strategist の想定買い手マッピングを定期的に更新する
