# A1Growth エージェントチーム

株式会社A1Growth(仮称)/ D2Cサプリメント事業「KAMIの酵母」に最適化した Claude Code サブエージェント構成。

## 構成

```
.claude/
├── company/
│   └── PROFILE.md        # 会社・商品の共有コンテキスト(全エージェントが最初に読む)
└── agents/
    ├── market-researcher.md   # 市場・競合・トレンド調査
    ├── biz-planner.md         # 事業企画・提案書・ピッチ構成
    ├── copywriter.md          # LP・広告・SNS・メルマガ
    ├── yakkiho-checker.md     # 薬機法・景表法・健増法チェック
    ├── sales-support.md       # 代理店・パートナー向け営業支援
    ├── product-engineer.md    # EC・プロダクト実装
    ├── code-reviewer.md       # コードレビュー(読み取り専用)
    └── backoffice.md          # 議事録・契約書ドラフト・管理業務
```

## 使い方

Claude Code 上で普通に依頼すれば、内容に応じて適切なエージェントに自動で委譲される。明示的に指名したい場合は「market-researcher で競合を調べて」のように名前を出す。

### 典型的なワークフロー

- **新しい訴求を作る**: market-researcher(競合の訴求調査)→ copywriter(コピー作成)→ **yakkiho-checker(公開前チェック・必須)**
- **代理店開拓**: market-researcher(候補リスト)→ sales-support(提案資料)→ yakkiho-checker(配布前チェック)
- **機能開発**: product-engineer(実装)→ code-reviewer(レビュー)
- **企画立案**: market-researcher(調査)→ biz-planner(企画書)

### 鉄則

対外に出る表現(LP・広告・SNS・営業資料・パッケージ)は、公開・配布前に必ず `yakkiho-checker` にかける。サプリD2Cでは表現の一発アウトがブランド毀損に直結する。

## 会社の他リポジトリへの導入

この構成はリポジトリ非依存。新しいリポジトリに `.claude/agents/` と `.claude/company/` をそのままコピーすれば動く。

## メンテナンス

- 会社・商品情報が変わったら `company/PROFILE.md` を更新する(社名確定、価格改定、機能性表示食品の届出など)
- 特に機能性表示食品の届出が通った場合は PROFILE.md と yakkiho-checker.md の前提を必ず更新すること(可能な表現範囲が変わる)
