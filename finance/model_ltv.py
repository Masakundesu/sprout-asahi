#!/usr/bin/env python3
"""KAMIの酵母 モデルLTV計算(ローンチ前版)

前提はすべて ASSUMPTIONS に集約。原価表確定・実績コホート取得後に置き換えること。
実行: python3 finance/model_ltv.py
出力: 標準出力にMarkdown表(MODEL_LTV.mdに貼り付け/リダイレクトして使う)
"""

# ---- 価格前提(確定情報) ----
PRICE = 4980          # 30日・税込
FIRST_PRICE = 2490    # 初回半額

# ---- コスト前提(すべて仮定・原価表確定後に更新) ----
ASSUMPTIONS = {
    "product_cost": 500,    # 製品原価(OEM・30粒) ※2026-08 創業者見込み値。OEM見積で確定させる
    "materials": 150,       # 資材・同梱物 ※仮定
    "shipping": 350,        # 配送費(ポスト投函前提) ※仮定
    "warehouse": 300,       # 倉庫作業費(ピッキング・梱包) ※仮定
    "payment_fee_rate": 0.04,  # 決済手数料率 ※仮定
}

# ---- 継続率シナリオ(F2転換率、3回目以降の各回継続率) ----
SCENARIOS = {
    "悲観": {"f2": 0.30, "repeat": 0.80},
    "中立": {"f2": 0.45, "repeat": 0.85},
    "楽観": {"f2": 0.55, "repeat": 0.90},
}

CAC_ASSUMPTION = 8000   # 仮のCAC(円) ※要検証
MONTHS = 12             # LTV算定期間(決済回数=月次課金と仮定)


def margin(net_price: int) -> float:
    """1決済あたり限界利益(KPI_DESIGN.md §2.3 の定義)"""
    a = ASSUMPTIONS
    variable = a["product_cost"] + a["materials"] + a["shipping"] + a["warehouse"]
    fee = net_price * a["payment_fee_rate"]
    return net_price - variable - fee


def reach_rates(f2: float, repeat: float, months: int) -> list[float]:
    """n回目決済への到達率。1回目=100%、2回目=F2、以降は各回repeatを乗じる"""
    rates = [1.0, f2]
    for _ in range(3, months + 1):
        rates.append(rates[-1] * repeat)
    return rates[:months]


def ltv(f2: float, repeat: float, months: int = MONTHS) -> dict:
    rates = reach_rates(f2, repeat, months)
    m_first, m_repeat = margin(FIRST_PRICE), margin(PRICE)
    margins = [m_first] + [m_repeat] * (months - 1)
    cum, payback = 0.0, None
    for n, (r, m) in enumerate(zip(rates, margins), start=1):
        cum += r * m
        if payback is None and cum >= CAC_ASSUMPTION:
            payback = n
    revenue = sum(r * p for r, p in zip(rates, [FIRST_PRICE] + [PRICE] * (months - 1)))
    return {
        "reach": rates, "ltv12": cum, "revenue12": revenue,
        "ltv_cac": cum / CAC_ASSUMPTION, "payback": payback,
    }


def main() -> None:
    m_first, m_repeat = margin(FIRST_PRICE), margin(PRICE)
    print("## 1決済あたり限界利益(仮定原価ベース)\n")
    print("| 区分 | 実収 | 限界利益 | 利益率 |")
    print("|---|---|---|---|")
    print(f"| 初回(半額) | {FIRST_PRICE:,}円 | {m_first:,.0f}円 | {m_first/FIRST_PRICE:.0%} |")
    print(f"| 2回目以降 | {PRICE:,}円 | {m_repeat:,.0f}円 | {m_repeat/PRICE:.0%} |")

    print("\n## シナリオ別 12ヶ月LTV(粗利ベース)\n")
    print(f"| シナリオ | F2 | 3回目以降継続 | 12ヶ月LTV | LTV/CAC(CAC {CAC_ASSUMPTION:,}円) | 回収 |")
    print("|---|---|---|---|---|---|")
    for name, s in SCENARIOS.items():
        r = ltv(s["f2"], s["repeat"])
        pb = f"{r['payback']}回目" if r["payback"] else "12回内で未回収"
        print(f"| {name} | {s['f2']:.0%} | {s['repeat']:.0%} | "
              f"{r['ltv12']:,.0f}円 | {r['ltv_cac']:.2f} | {pb} |")

    print("\n## 到達率カーブ(n回目決済到達率)\n")
    header = "| シナリオ | " + " | ".join(f"n{i}" for i in range(1, MONTHS + 1)) + " |"
    print(header)
    print("|" + "---|" * (MONTHS + 1))
    for name, s in SCENARIOS.items():
        r = ltv(s["f2"], s["repeat"])
        cells = " | ".join(f"{x:.0%}" for x in r["reach"])
        print(f"| {name} | {cells} |")

    print("\n## 感度分析: 12ヶ月LTV(円) — F2 × 3回目以降継続率\n")
    f2_range = [0.30, 0.35, 0.40, 0.45, 0.50, 0.55, 0.60]
    rep_range = [0.75, 0.80, 0.85, 0.90]
    print("| F2 \\ 継続 | " + " | ".join(f"{r:.0%}" for r in rep_range) + " |")
    print("|---|" + "---|" * len(rep_range))
    for f2 in f2_range:
        row = " | ".join(f"{ltv(f2, rep)['ltv12']:,.0f}" for rep in rep_range)
        print(f"| {f2:.0%} | {row} |")

    print("\n## 損益分岐CAC(LTV/CAC=3.0を守れる上限CAC)\n")
    print("| シナリオ | 12ヶ月LTV | 上限CAC(=LTV/3) |")
    print("|---|---|---|")
    for name, s in SCENARIOS.items():
        r = ltv(s["f2"], s["repeat"])
        print(f"| {name} | {r['ltv12']:,.0f}円 | {r['ltv12']/3:,.0f}円 |")


if __name__ == "__main__":
    main()
