/* ============================================================
 * reports.js —— 资产负债表 / 利润表 / 现金流量表（教学版）
 * ============================================================ */
(function (root) {
  'use strict';
  const { ACC, round2: r2, fmt } = root;

  function makeBal(ledger) {
    return function (code) {
      if (!code) return 0;
      if (code.length === 4) {
        // 汇总一级科目时，统一按"一级科目的方向"计算，避免进项税等明细方向把净额算成加总
        const rootDir = (ACC[code] || {}).dir || 'debit';
        let sum = 0;
        Object.keys(ledger.accounts).forEach((k) => {
          if (k.indexOf(code) === 0) {
            const a = ledger.accounts[k];
            const ob = (a.ob || 0) * (a.dir === rootDir ? 1 : -1);
            sum += ob + (rootDir === 'debit' ? a.debit - a.credit : a.credit - a.debit);
          }
        });
        return r2(sum);
      }
      const a = ledger.accounts[code];
      if (!a) return 0;
      return r2((a.ob || 0) + (a.dir === 'debit' ? a.debit - a.credit : a.credit - a.debit));
    };
  }

  function makeNet(ledger) {
    return function (code) {
      let sum = 0;
      Object.keys(ledger.accounts).forEach((k) => {
        if (k.indexOf(code) === 0) { const a = ledger.accounts[k]; sum += a.debit - a.credit; }
      });
      return r2(sum);
    };
  }

  function sumOf(bal, codes, signs) {
    let s = 0;
    codes.forEach((c) => (s += bal(c)));
    (signs || []).forEach((c) => (s -= bal(c)));
    return r2(s);
  }

  /* ---------------- 资产负债表 ---------------- */
  const BS = [
    { sec: '流动资产', items: [
      ['货币资金', ['1001', '1002', '1012'], [], '库存现金 + 银行存款 + 其他货币资金'],
      ['交易性金融资产', ['1101'], [], '以公允价值计量且变动计入当期损益'],
      ['应收票据', ['1121'], [], '银行/商业承兑汇票'],
      ['应收账款', ['1122'], ['1231'], '应收账款净额（扣除坏账准备）'],
      ['预付款项', ['1123'], [], '预付供应商款项'],
      ['其他应收款', ['1221', '1131'], [], '应收暂付款项、应收股利'],
      ['存货', ['1401', '1402', '1403', '1404', '1405', '1408', '5001', '5101'], ['1471'], '材料 + 在产品（生产成本/制造费用）+ 库存商品 − 跌价准备'],
      ['其他流动资产', [], [], '留抵税额、待抵扣进项等']
    ]},
    { sec: '非流动资产', items: [
      ['其他债权投资', ['1502'], [], '以公允价值计量且变动计入其他综合收益的债务工具'],
      ['长期股权投资', ['1511'], [], '成本法/权益法核算的长期权益投资'],
      ['投资性房地产', ['1521'], ['1522', '1523'], '成本模式净额'],
      ['固定资产', ['1601'], ['1602', '1603'], '原值 − 累计折旧 − 减值准备'],
      ['在建工程', ['1604'], [], '尚未达到可使用状态的工程'],
      ['使用权资产', ['1611'], ['1612'], '租赁准则确认的使用权资产净额'],
      ['开发支出', ['5301'], [], '研发支出—资本化支出（费用化支出期末应转入管理费用）'],
      ['无形资产', ['1701'], ['1702', '1703'], '原值 − 累计摊销 − 减值准备'],
      ['长期待摊费用', ['1801'], [], '已支出但受益期超过一年'],
      ['其他非流动资产', ['1901'], [], '待处理财产损溢等']
    ]},
    { sec: '流动负债', items: [
      ['短期借款', ['2001'], [], '一年以内（含）的借款'],
      ['应付票据', ['2201'], [], '开出、承兑的商业汇票'],
      ['应付账款', ['2202'], [], '购买材料、商品应付未付款'],
      ['预收款项', ['2203'], [], '已收但尚未发货的款项'],
      ['应付职工薪酬', ['2211'], [], '工资、社保、公积金等'],
      ['应交税费', ['2221'], [], '增值税、所得税、附加税费等'],
      ['其他应付款', ['2241', '2231', '2232'], [], '应付利息、应付股利、其他暂收款']
    ]},
    { sec: '非流动负债', items: [
      ['长期借款', ['2501'], [], '期限超过一年的借款'],
      ['应付债券', ['2502'], [], '面值 ± 利息调整'],
      ['租赁负债', ['2701'], [], '尚未支付的租赁付款额现值'],
      ['递延收益', ['2401'], [], '政府补助等尚未确认的收益']
    ]},
    { sec: '所有者权益', items: [
      ['实收资本（或股本）', ['4001'], [], '投资者投入的注册资本'],
      ['资本公积', ['4002'], [], '资本溢价等'],
      ['其他综合收益', ['4003'], [], '未计入当期损益的利得/损失'],
      ['盈余公积', ['4101'], [], '法定/任意盈余公积'],
      ['未分配利润', ['4103', '4104'], [], '本年利润 + 利润分配']
    ]}
  ];

  function balanceSheet(ledger) {
    const bal = makeBal(ledger);
    const sections = [];
    const used = {};
    BS.forEach((sec) => {
      const items = sec.items.map((it) => {
        it[1].concat(it[2]).forEach((c) => (used[c] = true));
        return { label: it[0], amount: sumOf(bal, it[1], it[2]), note: it[3] };
      });
      sections.push({ sec: sec.sec, items, total: r2(items.reduce((s, i) => s + i.amount, 0)) });
    });
    // 应交税费为借方净额时（留抵税额），重分类到"其他流动资产"，避免负债出现负数
    const taxItem = sections[2].items.find((i) => i.label === '应交税费');
    if (taxItem && taxItem.amount < -0.005) {
      const v = r2(-taxItem.amount);
      taxItem.amount = 0;
      const other = sections[0].items.find((i) => i.label === '其他流动资产');
      if (other) { other.amount = r2(other.amount + v); other.note = '增值税留抵税额等'; }
    }
    // 未结转的当期损益并入"未分配利润"，这样未做期末结转时资产负债表也能平衡
    let pl = 0;
    Object.keys(ledger.accounts).forEach((code) => {
      const m = ACC[code] || {};
      const a = ledger.accounts[code];
      if (m.cat === '收入') pl += a.credit - a.debit;
      if (m.cat === '费用') pl -= a.debit - a.credit;
    });
    pl = r2(pl);
    if (Math.abs(pl) > 0.005) {
      const eq = sections[4];
      const last = eq.items[eq.items.length - 1];
      last.amount = r2(last.amount + pl);
      last.note = '本年利润 + 利润分配（含本期未结转损益 ' + fmt(pl) + '）';
    }
    sections.forEach((sec) => { sec.total = r2(sec.items.reduce((s, i) => s + i.amount, 0)); });
    const warnings = [];
    sections.forEach((sec) => sec.items.forEach((i) => {
      if (i.amount < -0.005 && sec.sec !== '所有者权益') warnings.push(`${i.label}为负数（${fmt(i.amount)}），检查是否漏记对应资产或重复计提`);
    }));
    const assets = r2(sections[0].total + sections[1].total);
    const liab = r2(sections[2].total + sections[3].total);
    const equity = sections[4].total;
    const unmapped = Object.keys(ledger.accounts)
      .filter((c) => {
        const rootCode = c.slice(0, 4);
        return !used[rootCode] && Math.abs(bal(c)) > 0.005 && ACC[c] && ACC[c].cat !== '收入' && ACC[c].cat !== '费用' && ACC[c].cat !== '利润';
      })
      .map((c) => ({ code: c, name: (ACC[c] || {}).name || c, amount: bal(c) }));
    return {
      sections, assets, liab, equity,
      liabEquity: r2(liab + equity),
      diff: r2(assets - liab - equity),
      balanced: Math.abs(assets - liab - equity) < 0.005,
      unmapped, warnings
    };
  }

  /* ---------------- 利润表 ---------------- */
  function incomeStatement(entries, ledger) {
    const op = root.buildLedger(entries.filter((e) => !e.closing));
    const net = makeNet(op);
    const rev = (code) => r2(-net(code));       // 收入类：贷方发生额
    const exp = (code) => net(code);            // 费用类：借方发生额
    const line = (label, amount, note) => ({ label, amount: r2(amount), note: note || '' });

    const revMain = r2(rev('6001') + rev('6051'));
    const costMain = r2(exp('6401') + exp('6402'));
    const tax = exp('6403');
    const selling = exp('6601');
    const admin = exp('6602');
    const fin = exp('6603');
    const invest = rev('6111');
    const fv = rev('6101');
    const credit = exp('6702');
    const impair = exp('6701');
    const dispose = rev('6115');
    const otherIncome = rev('6117');
    const nonOpIn = rev('6301');
    const nonOpOut = exp('6711');
    const incomeTax = exp('6801');

    const opProfit = r2(revMain - costMain - tax - selling - admin - fin + invest + fv + dispose - credit - impair + otherIncome);
    const totalProfit = r2(opProfit + nonOpIn - nonOpOut);
    const netProfit = r2(totalProfit - incomeTax);

    const rows = [
      line('一、营业收入', revMain, '主营业务收入 + 其他业务收入'),
      line('减：营业成本', costMain, '主营业务成本 + 其他业务成本'),
      line('　　税金及附加', tax),
      line('　　销售费用', selling),
      line('　　管理费用', admin),
      line('　　财务费用', fin),
      line('　　信用减值损失', credit, '坏账准备计提额'),
      line('　　资产减值损失', impair, '存货跌价等'),
      line('加：公允价值变动收益', fv, '交易性金融资产等'),
      line('　　投资收益', invest, '含交易费用借记'),
      line('　　资产处置收益', dispose, '处置固定资产净损益'),
      line('二、营业利润', opProfit),
      line('加：营业外收入', nonOpIn),
      line('减：营业外支出', nonOpOut),
      line('三、利润总额', totalProfit),
      line('减：所得税费用', incomeTax),
      line('四、净利润', netProfit)
    ];
    return { rows, revMain, costMain, opProfit, totalProfit, net: netProfit, incomeTax };
  }

  /* ---------------- 现金流量表（教学版） ---------------- */
  const INVEST = ['1502', '1601', '1602', '1603', '1604', '1606', '1701', '1702', '1703', '1511', '1521', '1522', '1523', '1101'];
  const FINANCE = ['2001', '2501', '2502', '4001', '4002', '2232', '4104', '2701', '2401'];

  function cashFlow(entries, ledger) {
    const bal = makeBal(ledger);
    const cashCodes = ['1001', '1002', '1012'];
    const isCash = (c) => cashCodes.some((k) => c.indexOf(k) === 0);
    const groups = {};
    const add = (k, v) => { groups[k] = r2((groups[k] || 0) + v); };

    entries.forEach((e) => {
      const cashLines = e.lines.filter((l) => isCash(l.code));
      if (!cashLines.length) return;
      const delta = r2(cashLines.reduce((s, l) => s + (l.side === 'D' ? l.amount : -l.amount), 0));
      if (Math.abs(delta) < 0.005) return;
      const others = e.lines.filter((l) => !isCash(l.code)).map((l) => l.code);
      const isInvest = others.some((c) => INVEST.some((k) => c.indexOf(k) === 0));
      const isFin = others.some((c) => FINANCE.some((k) => c.indexOf(k) === 0));
      const flow = delta > 0 ? 'in' : 'out';
      const amt = Math.abs(delta);

      if (isInvest) {
        if (flow === 'out') {
          if (others.some((c) => /^1(601|604|701|511|521)/.test(c))) add('购建固定资产、无形资产和其他长期资产支付的现金', -amt);
          else add('投资支付的现金', -amt);
        } else {
          if (others.some((c) => /^1(606|601|602|521|511|701)/.test(c))) add('处置固定资产、无形资产和其他长期资产收回的现金净额', amt);
          else add('收回投资收到的现金', amt);
        }
        return;
      }
      if (isFin) {
        if (others.some((c) => /^(4001|4002)/.test(c))) add('吸收投资收到的现金', amt);
        else if (others.some((c) => /^(2001|2501|2502)/.test(c))) {
          if (flow === 'in') add('取得借款收到的现金', amt); else add('偿还债务支付的现金', -amt);
        } else add('分配股利、利润或偿付利息支付的现金', -amt);
        return;
      }
      // 经营活动
      if (flow === 'in') {
        if (others.some((c) => /^(6001|6051|1122|1121|2203|1111)/.test(c))) add('销售商品、提供劳务收到的现金', amt);
        else add('收到其他与经营活动有关的现金', amt);
      } else {
        if (others.some((c) => /^(2211)/.test(c))) add('支付给职工以及为职工支付的现金', -amt);
        else if (others.some((c) => /^(2221)/.test(c))) add('支付的各项税费', -amt);
        else if (others.some((c) => /^(6401|6402|1401|1402|1403|1405|2202|1123)/.test(c))) add('购买商品、接受劳务支付的现金', -amt);
        else add('支付其他与经营活动有关的现金', -amt);
      }
    });

    const keys = Object.keys(groups);
    const pick = (re) => r2(keys.filter((k) => re.test(k)).reduce((s, k) => s + groups[k], 0));
    const opIn = pick(/^销售|^收到其他与经营/);
    const opOut = pick(/^支付|^购买商品/);
    const invIn = pick(/^收回投资|^处置固定资产/);
    const invOut = pick(/^购建固定资产|^投资支付/);
    const finIn = pick(/^吸收投资|^取得借款/);
    const finOut = pick(/^偿还债务|^分配股利/);
    const net = r2(opIn + opOut + invIn + invOut + finIn + finOut);

    let cashBegin = 0;
    Object.keys(ledger.accounts).forEach((c) => { if (isCash(c)) cashBegin += ledger.accounts[c].ob || 0; });
    const cashEnd = sumOf(bal, cashCodes, []);
    return {
      opIn, opOut, opNet: r2(opIn + opOut),
      invIn, invOut, invNet: r2(invIn + invOut),
      finIn, finOut, finNet: r2(finIn + finOut),
      net, cashBegin: r2(cashBegin), cashEnd,
      details: groups,
      reconciled: Math.abs(cashBegin + net - cashEnd) < 0.005
    };
  }

  function openingLedger(opening) {
    const list = Object.keys(opening || {}).filter((c) => Math.abs(opening[c] || 0) > 0.005);
    const entries = list.map((code) => {
      const dir = (ACC[code] || {}).dir || 'debit';
      const amt = opening[code];
      const isDebit = (amt > 0) === (dir === 'debit');
      return { date: '', memo: '期初余额', lines: [{ code, side: isDebit ? 'D' : 'C', amount: Math.abs(amt) }] };
    });
    return root.buildLedger(entries);
  }

  function buildStatements(entries, ledger, opening) {
    const bs = balanceSheet(ledger);
    const bsOpen = opening && Object.keys(opening).length ? balanceSheet(openingLedger(opening)) : null;
    const is = incomeStatement(entries, ledger);
    const cf = cashFlow(entries, ledger);
    return { bs, bsOpen, is, cf };
  }

  root.buildStatements = buildStatements;
  root.makeBal = makeBal;
})(typeof globalThis !== 'undefined' ? globalThis : this);
