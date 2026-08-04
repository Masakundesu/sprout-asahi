#!/usr/bin/env python3
"""KAMIの酵母 月次PL・CF計画モデル(ローンチ前版)

前提はすべて ASSUMPTIONS / PLAN に集約。確定情報が入り次第ここを更新して再実行する。
実行: python3 finance/financial_model.py
出力: Markdown表(PL_CF_PLAN.mdに反映して使う)

計画期間: 2026-09(設立)〜2027-10 の14ヶ月。販売開始は2026-11。
"""

MONTHS = ["2026-09", "2026-10", "2026-11", "2026-12", "2027-01", "2027-02",
          "2027-03", "2027-04", "2027-05", "2027-06", "2027-07", "2027-08",
          "2027-09", "2027-10"]
LAUNCH_IDX = 2  # 2026-11 に販売開始

# ---- 価格(確定) ----
PRICE, FIRST_PRICE = 4980, 2490

# ---- 前提(すべて仮定。確定し次第更新) ----
ASSUMPTIONS = {
    "initial_cash": 5_000_000,   # 初期資金(資本金) ※仮定・要確認
    "product_cost_initial": 800, # 初回小ロットの製品原価/個(OEM相場調査より1,000個帯)
    "product_cost_repeat": 500,  # 3,000個以上の継続発注単価(創業者見込み)
    "materials": 150, "shipping": 350, "warehouse": 300,  # 変動費/出荷 ※仮定
    "payment_fee_rate": 0.04,
    "fixed_opex": 120_000,       # 固定費/月: カート5万+サーバ1万+税理士3万+雑費3万 ※仮定
    "officer_comp": 0,           # 役員報酬(初年度ゼロと仮定 ※要判断)
    "setup_costs": {             # 初期費用(発生月インデックス: 金額)
        0: 250_000 + 150_000,    # 設立登記25万 + 商標出願15万 ※仮定
        1: 300_000 + 200_000,    # EC構築30万 + OEM初期費(試作・検査・版代)20万 ※仮定
    },
    "initial_lot_units": 1_000,  # 初回ロット(在庫リスク最小化優先)
    "initial_lot_pay_idx": 0,    # 発注・支払 2026-09(全額前払と保守的に仮定)、納品10月
    "reorder_units": 3_000,      # 継続発注ロット(500円/個の目標単価帯)
    "reorder_cover_months": 2,   # 在庫が今後2ヶ月の出荷予測を下回ったら発注
    "settlement_lag": 1,         # カード入金サイト: 当月売上→翌月入金 ※仮定
}

# ---- シナリオ(継続率はMODEL_LTV.mdと同一) ----
SCENARIOS = {
    "悲観": {"f2": 0.30, "repeat": 0.80, "cac": 4_500, "acq_mult": 0.7},
    "中立": {"f2": 0.45, "repeat": 0.85, "cac": 3_300, "acq_mult": 1.0},
    "楽観": {"f2": 0.55, "repeat": 0.90, "cac": 2_500, "acq_mult": 1.2},
}

# 新規獲得計画(中立ケース、2026-11以降) ※混合CAC3,300円で獲得できる前提の計画値
NEW_CUSTOMERS_PLAN = [50, 75, 100, 130, 160, 200, 240, 280, 320, 360, 400, 440]


def reach(f2, rep, age):
    """獲得からageヶ月後の決済到達率(age=0が初回)"""
    if age == 0:
        return 1.0
    return f2 * (rep ** (age - 1))


def run(name, s):
    a = ASSUMPTIONS
    n = len(MONTHS)
    new = [0] * n
    for i, v in enumerate(NEW_CUSTOMERS_PLAN):
        idx = LAUNCH_IDX + i
        if idx < n:
            new[idx] = round(v * s["acq_mult"])

    rows, cash = [], a["initial_cash"]
    inv_units = 0
    pending_delivery = {}  # 納品月idx -> units
    receivable = [0] * (n + 2)  # 入金予定(売上ベース)
    unit_cost = a["product_cost_initial"]  # 出荷原価は先入先出の近似で切替
    initial_units_left = a["initial_lot_units"]
    min_cash, min_cash_month = cash, MONTHS[0]

    for t in range(n):
        # --- 受注(出荷)数 ---
        first_orders = new[t]
        repeat_orders = 0.0
        for t0 in range(LAUNCH_IDX, t):
            repeat_orders += new[t0] * reach(s["f2"], s["repeat"], t - t0)
        repeat_orders = round(repeat_orders)
        shipments = first_orders + repeat_orders

        # --- 在庫: 納品受入 ---
        inv_units += pending_delivery.pop(t, 0)

        # --- 発注判断(今後cover月の出荷予測を下回ったら発注) ---
        purchase_cash = 0
        if t == a["initial_lot_pay_idx"]:
            purchase_cash += a["initial_lot_units"] * a["product_cost_initial"]
            pending_delivery[t + 1] = pending_delivery.get(t + 1, 0) + a["initial_lot_units"]
        else:
            fut = 0.0
            for dt in range(1, a["reorder_cover_months"] + 1):
                tt = t + dt
                if tt >= n:
                    break
                f = new[tt]
                for t0 in range(LAUNCH_IDX, tt):
                    f += new[t0] * reach(s["f2"], s["repeat"], tt - t0)
                fut += f
            on_order = sum(pending_delivery.values())
            if t >= LAUNCH_IDX - 1 and inv_units + on_order < fut:
                purchase_cash += a["reorder_units"] * a["product_cost_repeat"]
                pending_delivery[t + 1] = pending_delivery.get(t + 1, 0) + a["reorder_units"]

        # --- PL ---
        revenue = first_orders * FIRST_PRICE + repeat_orders * PRICE
        # 出荷原価: 初回ロット分を消化するまで800円、以降500円(近似)
        cogs_product = 0
        u = shipments
        take_init = min(u, initial_units_left)
        cogs_product += take_init * a["product_cost_initial"]
        initial_units_left -= take_init
        cogs_product += (u - take_init) * a["product_cost_repeat"]
        fulfill = shipments * (a["materials"] + a["shipping"] + a["warehouse"])
        pay_fee = revenue * a["payment_fee_rate"]
        gross = revenue - cogs_product - fulfill - pay_fee
        ad = new[t] * s["cac"]
        fixed = a["fixed_opex"] + a["officer_comp"] + a["setup_costs"].get(t, 0)
        op = gross - ad - fixed
        inv_units = max(0, inv_units - shipments)

        # --- CF(入金サイト反映) ---
        receivable[t + a["settlement_lag"]] += revenue - pay_fee
        cash_in = receivable[t]
        cash_out = purchase_cash + fulfill + ad + fixed
        cash = cash + cash_in - cash_out
        if cash < min_cash:
            min_cash, min_cash_month = cash, MONTHS[t]

        active = repeat_orders + first_orders
        rows.append(dict(m=MONTHS[t], new=new[t], act=active, rev=revenue,
                         gross=gross, ad=ad, fixed=fixed, op=op,
                         cin=cash_in, cout=cash_out, cash=cash,
                         inv=inv_units, buy=purchase_cash))
    return rows, min_cash, min_cash_month


def fmt(v):
    return f"{v:,.0f}"


def main():
    # 中立ケースの詳細
    rows, min_cash, min_m = run("中立", SCENARIOS["中立"])
    print("## 月次PL・CF計画(中立シナリオ)\n")
    print("| 月 | 新規 | 出荷件数 | 売上 | 限界利益 | 広告費 | 固定費+初期費 | 営業利益 | 入金 | 出金 | 月末現金 | 在庫(個) |")
    print("|---|---|---|---|---|---|---|---|---|---|---|---|")
    for r in rows:
        print(f"| {r['m']} | {r['new']} | {r['act']} | {fmt(r['rev'])} | {fmt(r['gross'])} | "
              f"{fmt(r['ad'])} | {fmt(r['fixed'])} | {fmt(r['op'])} | {fmt(r['cin'])} | "
              f"{fmt(r['cout'])} | **{fmt(r['cash'])}** | {r['inv']} |")
    total_rev = sum(r['rev'] for r in rows)
    total_op = sum(r['op'] for r in rows)
    print(f"\n- 14ヶ月累計売上: {fmt(total_rev)}円 / 累計営業利益: {fmt(total_op)}円")
    print(f"- 資金繰りの底: **{fmt(min_cash)}円({min_m})**")

    print("\n## シナリオ比較(初期資金500万円の場合)\n")
    print("| シナリオ | 14ヶ月累計売上 | 累計営業利益 | 現金の底(月) | 期末現金 | 追加資金の要否 |")
    print("|---|---|---|---|---|---|")
    for name, s in SCENARIOS.items():
        rr, mc, mm = run(name, s)
        need = "不要" if mc > 0 else f"**要 約{fmt(-mc + 500_000)}円**"
        print(f"| {name} | {fmt(sum(r['rev'] for r in rr))} | {fmt(sum(r['op'] for r in rr))} | "
              f"{fmt(mc)}円({mm}) | {fmt(rr[-1]['cash'])} | {need} |")


if __name__ == "__main__":
    main()
