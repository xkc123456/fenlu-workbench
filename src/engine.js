/* ============================================================
 * engine.js —— 总账、试算平衡、勾稽检查、期末自动结转
 * ============================================================ */
(function (root) {
  'use strict';
  const { ACC, round2: r2, fmt } = root;
  const { d, c, explain } = root.RH;

  function emptyAcct(code) {
    const m = ACC[code] || { name: code, cat: '资产', dir: 'debit' };
    return { code, name: m.name, cat: m.cat, dir: m.dir, contra: !!m.contra, temp: !!m.temp, debit: 0, credit: 0, ob: 0, obDebit: 0, obCredit: 0, rows: [] };
  }

  function post(ledger, entry) {
    entry.lines.forEach((l) => {
      const a = ledger.accounts[l.code] || (ledger.accounts[l.code] = emptyAcct(l.code));
      if (l.side === 'D') a.debit = r2(a.debit + l.amount); else a.credit = r2(a.credit + l.amount);
      a.rows.push({ date: entry.date, memo: entry.memo, side: l.side, amount: l.amount, entry, line: l });
      if (l.side === 'D') ledger.totalDebit = r2(ledger.totalDebit + l.amount); else ledger.totalCredit = r2(ledger.totalCredit + l.amount);
    });
  }

  function buildLedger(entries, opening) {
    const ledger = { accounts: {}, totalDebit: 0, totalCredit: 0, obDebit: 0, obCredit: 0 };
    if (opening) {
      Object.keys(opening).forEach((code) => {
        const amt = r2(opening[code] || 0);
        if (!amt) return;
        const a = ledger.accounts[code] || (ledger.accounts[code] = emptyAcct(code));
        a.ob = amt;
        const isDebit = (amt > 0) === (a.dir === 'debit');
        if (isDebit) { a.obDebit = Math.abs(amt); ledger.obDebit = r2(ledger.obDebit + Math.abs(amt)); }
        else { a.obCredit = Math.abs(amt); ledger.obCredit = r2(ledger.obCredit + Math.abs(amt)); }
      });
    }
    entries.forEach((e) => post(ledger, e));
    return ledger;
  }

  function balanceOf(ledger, code) {
    if (!code) return 0;
    if (code.length === 4) {
      const rootDir = (ACC[code] || {}).dir || 'debit';
      let sum = 0;
      Object.keys(ledger.accounts).forEach((k) => {
        if (k.indexOf(code) === 0) {
          const a = ledger.accounts[k];
          const cur = rootDir === 'debit' ? a.debit - a.credit : a.credit - a.debit;
          const ob = (a.ob || 0) * (a.dir === rootDir ? 1 : -1);
          sum += ob + cur;
        }
      });
      return r2(sum);
    }
    const a = ledger.accounts[code];
    if (!a) return 0;
    return r2((a.ob || 0) + (a.dir === 'debit' ? a.debit - a.credit : a.credit - a.debit));
  }

  function balanceSide(ledger, code) {
    const a = ledger.accounts[code];
    if (!a) return '';
    const v = (a.ob || 0) + (a.dir === 'debit' ? a.debit - a.credit : a.credit - a.debit);
    if (Math.abs(v) < 0.005) return '';
    if (v > 0) return a.dir === 'debit' ? '借' : '贷';
    return a.dir === 'debit' ? '贷' : '借';
  }

  /* 试算平衡表 */
  function trialBalance(ledger) {
    const rows = Object.keys(ledger.accounts).sort().map((code) => {
      const a = ledger.accounts[code];
      const bal = r2((a.ob || 0) + (a.dir === 'debit' ? a.debit - a.credit : a.credit - a.debit));
      return {
        code, name: a.name, cat: a.cat, contra: a.contra,
        obDebit: a.obDebit || 0, obCredit: a.obCredit || 0,
        debit: a.debit, credit: a.credit,
        balance: Math.abs(bal), side: bal > 0.005 ? (a.dir === 'debit' ? '借' : '贷') : bal < -0.005 ? (a.dir === 'debit' ? '贷' : '借') : ''
      };
    });
    const debitSum = r2(rows.reduce((s, r) => s + r.debit, 0));
    const creditSum = r2(rows.reduce((s, r) => s + r.credit, 0));
    const obD = r2(rows.reduce((s, r) => s + r.obDebit, 0));
    const obC = r2(rows.reduce((s, r) => s + r.obCredit, 0));
    const balD = r2(rows.filter((r) => r.side === '借').reduce((s, r) => s + r.balance, 0));
    const balC = r2(rows.filter((r) => r.side === '贷').reduce((s, r) => s + r.balance, 0));
    return { rows, debitSum, creditSum, obD, obC, obBalanced: Math.abs(obD - obC) < 0.005,
      balD, balC, balanced: Math.abs(debitSum - creditSum) < 0.005 && Math.abs(balD - balC) < 0.005 };
  }

  /* 损益汇总（口径：剔除期末结转分录，反映本期经营成果） */
  function plSummary(ledger, entries) {
    const src = entries ? buildLedger(entries.filter((e) => !e.closing)) : ledger;
    let revenue = 0, expense = 0, incomeTax = 0, cost = 0;
    Object.keys(src.accounts).forEach((code) => {
      const a = src.accounts[code], m = ACC[code] || {};
      const amt = r2(a.debit - a.credit);
      if (m.cat === '收入') revenue = r2(revenue + (a.credit - a.debit));
      if (m.cat === '费用') {
        expense = r2(expense + amt);
        if (code === '6801') incomeTax = r2(incomeTax + amt);
        if (code === '6401' || code === '6402') cost = r2(cost + amt);
      }
    });
    const profitBeforeTax = r2(revenue - expense + incomeTax);
    return { revenue, expense, profitBeforeTax, incomeTax, netProfit: r2(revenue - expense), cost };
  }

  /* 每个板块的 T 型账户 */
  function tAccounts(entries) {
    const map = {};
    entries.forEach((e) => e.lines.forEach((l) => {
      const a = map[l.code] || (map[l.code] = { code: l.code, name: (ACC[l.code] || {}).name || l.code, dir: (ACC[l.code] || {}).dir || 'debit', contra: !!(ACC[l.code] || {}).contra, debit: [], credit: [] });
      (l.side === 'D' ? a.debit : a.credit).push({ date: e.date, memo: e.memo, amount: l.amount });
    }));
    return Object.keys(map).sort().map((code) => {
      const a = map[code];
      const dSum = r2(a.debit.reduce((s, x) => s + x.amount, 0));
      const cSum = r2(a.credit.reduce((s, x) => s + x.amount, 0));
      const bal = r2(a.dir === 'debit' ? dSum - cSum : cSum - dSum);
      return Object.assign({}, a, {
        dSum, cSum, balance: Math.abs(bal),
        side: Math.abs(bal) < 0.005 ? '' : (bal > 0 ? (a.dir === 'debit' ? '借' : '贷') : (a.dir === 'debit' ? '贷' : '借'))
      });
    });
  }

  /* 勾稽检查 */
  function checks(parsed, ledger, trial, pl) {
    const out = [];
    const unk = parsed.entries.filter((e) => e.flags && e.flags.unknown);
    if (trial.obD || trial.obC) {
      out.push(trial.obBalanced
        ? { level: 'ok', text: `期初余额借贷平衡：${fmt(trial.obD)} = ${fmt(trial.obC)}` }
        : { level: 'bad', text: `期初余额借贷不平：借 ${fmt(trial.obD)}，贷 ${fmt(trial.obC)}，差额 ${fmt(trial.obD - trial.obC)}` });
    }
    if (trial.balanced) out.push({ level: 'ok', text: `试算平衡：借方发生额合计 ${fmt(trial.debitSum)} = 贷方发生额合计 ${fmt(trial.creditSum)}` });
    else out.push({ level: 'bad', text: `试算不平：借方 ${fmt(trial.debitSum)}，贷方 ${fmt(trial.creditSum)}，差额 ${fmt(trial.debitSum - trial.creditSum)}` });
    if (unk.length) out.push({ level: 'warn', text: `有 ${unk.length} 句业务未能自动识别，已在对应板块标出，可改写表述或手工录入。` });
    const cash = balanceOf(ledger, '1001'), bank = balanceOf(ledger, '1002');
    if (cash < -0.005) out.push({ level: 'warn', text: `库存现金余额为负（${fmt(cash)}），检查是否漏记提现或收款。` });
    if (bank < -0.005) out.push({ level: 'warn', text: `银行存款余额为负（${fmt(bank)}），检查是否漏记借款或收款。` });
    const outVat = balanceOf(ledger, '22210102'), inVat = balanceOf(ledger, '22210101');
    if (outVat || inVat) out.push({ level: 'info', text: `增值税：销项 ${fmt(outVat)} − 进项 ${fmt(inVat)} = 应交 ${fmt(r2(outVat - inVat))}` });
    if (pl.revenue) out.push({ level: 'info', text: `本期收入 ${fmt(pl.revenue)}，成本费用 ${fmt(pl.expense)}，利润总额 ${fmt(pl.profitBeforeTax)}` });
    return out;
  }

  /* ---------- 期末自动结转 ---------- */
  function autoClose(parsed, extra) {
    const o = parsed.opts;
    const entries = parsed.entries.filter((e) => !e.auto);
    parsed.blocks = parsed.blocks.filter((b) => !b.auto);
    const ledger = buildLedger(entries, parsed.opening);
    const newEntries = [];

    function bal(code) { return balanceOf(ledger, code); }
    function add(memo, lines, ex, tag, isClosing) {
      const e = {
        memo, date: o.baseDate, lines, ex, auto: true, balanced: true, closing: !!isClosing || /结转|结平利润分配/.test(memo),
        ruleId: 'auto-close', ruleTitle: tag || '期末结转', scene: '期末'
      };
      newEntries.push(e);
      post(ledger, e);
      return e;
    }

    /* 1) 转出未交增值税 */
    const outVat = bal('22210102'), inVat = bal('22210101');
    const payable = r2(outVat - inVat);
    if (payable > 0.005) {
      add('月末转出未交增值税', [
        d('22210104', payable, `销项 ${fmt(outVat)} − 进项 ${fmt(inVat)} = ${fmt(payable)} 元`, '应交增值税明细结平'),
        c('222102', payable, `转入未交增值税 ${fmt(payable)} 元`, '下月申报缴纳')
      ], explain(
        `月末把"销项 − 进项"的净额从"应交增值税"转入"未交增值税"，让"应交增值税"明细归零。`,
        [['为什么', '增值税采用"价外税"核算，销项与进项在明细账中分别归集，月末轧差'],
        ['科目', '借"应交税费—应交增值税（转出未交增值税）"，贷"应交税费—未交增值税"'],
        ['金额', `${fmt(outVat)} − ${fmt(inVat)} = ${fmt(payable)} 元`],
        ['方向', '明细账户借方转出、未交增值税贷方增加']],
        ['进项大于销项时是留抵税额，不做本分录。'], '《增值税会计处理规定》'
      ), '期末结转');
    }

    /* 2) 附加税费 */
    const vatBase = payable > 0.005 ? payable : Math.max(0, bal('222102'));
    if (vatBase > 0.005 && !parsed.flags_SurchargeDone) {
      const city = r2(vatBase * o.cityRate), edu = r2(vatBase * o.eduRate), local = r2(vatBase * o.localEduRate);
      const total = r2(city + edu + local);
      if (total > 0.005) {
        add('计提城建税及教育费附加', [
          d('6403', total, `以增值税 ${fmt(vatBase)} 元为计税依据，合计 ${fmt(total)} 元`, '计入税金及附加'),
          c('222104', city, `${fmt(vatBase)} × ${(o.cityRate * 100).toFixed(0)}% = ${fmt(city)} 元`, '城建税'),
          c('222105', edu, `${fmt(vatBase)} × ${(o.eduRate * 100).toFixed(0)}% = ${fmt(edu)} 元`, '教育费附加'),
          c('222106', local, `${fmt(vatBase)} × ${(o.localEduRate * 100).toFixed(0)}% = ${fmt(local)} 元`, '地方教育附加')
        ], explain(
          `附加税费以"实际应缴纳的增值税"为基数计算，是"税上税"。`,
          [['为什么', '城建税、教育费附加的计税依据是流转税，不是利润'],
          ['科目', '借"税金及附加"，贷"应交税费"各明细'],
          ['金额', `增值税 ${fmt(vatBase)} × (7% + 3% + 2%) = ${fmt(total)} 元`],
          ['方向', '费用增加记借方，负债增加记贷方']],
          ['城建税税率按所在地可能为 7%/5%/1%。', '附加税计入"税金及附加"，不是管理费用。'],
          '《城市维护建设税法》'
        ), '期末结转');
      }
    }

    /* 3) 企业所得税 */
    const pl = plSummary(ledger);
    const profitBeforeTax = r2(pl.revenue - pl.expense);
    if (profitBeforeTax > 0.005) {
      const tax = r2(profitBeforeTax * o.incomeRate);
      add('计提企业所得税', [
        d('6801', tax, `${fmt(profitBeforeTax)} × ${(o.incomeRate * 100).toFixed(0)}% = ${fmt(tax)} 元`, '按应纳税所得额（简化按利润总额）计算'),
        c('222103', tax, `应交所得税 ${fmt(tax)} 元`, '尚未缴纳')
      ], explain(
        `按本期利润总额乘以所得税率计提所得税费用。实务中还要做纳税调整，这里按利润总额简化。`,
        [['为什么', '会计利润 ≠ 应纳税所得额，但教学题通常按利润总额 × 税率'],
        ['科目', '借"所得税费用"，贷"应交税费—应交所得税"'],
        ['金额', `${fmt(profitBeforeTax)} × ${(o.incomeRate * 100).toFixed(0)}% = ${fmt(tax)} 元`],
        ['方向', '费用增加记借方，负债增加记贷方']],
        ['亏损不交所得税；有纳税调整时以应纳税所得额为准。'], '《企业会计准则第18号——所得税》'
      ), '期末结转');
    }

    /* 4) 结转收入 */
    const revCodes = ['6001', '6051', '6111', '6101', '6301', '6115'];
    const revLines = [];
    let revTotal = 0;
    revCodes.forEach((code) => {
      const b = bal(code);
      if (Math.abs(b) > 0.005) {
        revLines.push(d(code, b, `${fmt(b)} 元`, '收入类账户结平'));
        revTotal = r2(revTotal + b);
      }
    });
    if (revLines.length) {
      revLines.push(c('4103', revTotal, `收入合计 ${fmt(revTotal)} 元`, '转入本年利润'));
      add('结转本期收入至本年利润', revLines, explain(
        `期末把收入类账户余额全部转入"本年利润"，收入账户结平。`,
        [['为什么', '账结法：收入、费用期末归集到本年利润，据以计算净利润'],
        ['科目', '借"主营业务收入"等，贷"本年利润"'],
        ['金额', `收入合计 ${fmt(revTotal)} 元`],
        ['方向', '收入减少记借方，本年利润增加记贷方']],
        ['结转后收入类账户应无余额。'], '《企业会计准则第30号》'
      ), '期末结转');
    }

    /* 5) 结转费用 */
    const expCodes = ['6401', '6402', '6403', '6601', '6602', '6603', '6701', '6702', '6711', '6801'];
    const expLines = [];
    let expTotal = 0;
    expCodes.forEach((code) => {
      const b = bal(code);
      if (Math.abs(b) > 0.005) {
        expLines.push(c(code, b, `${fmt(b)} 元`, '费用类账户结平'));
        expTotal = r2(expTotal + b);
      }
    });
    if (expLines.length) {
      expLines.unshift(d('4103', expTotal, `成本费用合计 ${fmt(expTotal)} 元`, '转入本年利润'));
      add('结转本期成本费用至本年利润', expLines, explain(
        `把成本、费用、税金及附加、所得税费用全部转入"本年利润"借方，与收入配比。`,
        [['为什么', '收入与费用配比，得出净利润'],
        ['科目', '借"本年利润"，贷"主营业务成本"等'],
        ['金额', `合计 ${fmt(expTotal)} 元`],
        ['方向', '费用减少记贷方，本年利润减少记借方']],
        ['费用类账户结转后应无余额。'], '《企业会计准则第30号》'
      ), '期末结转');
    }

    /* 6) 本年利润 → 未分配利润 */
    const net = bal('4103');
    if (Math.abs(net) > 0.005) {
      const val = Math.abs(net);
      add('年末结转本年利润', net >= 0
        ? [d('4103', val, `本年净利润 ${fmt(val)} 元`, '结平本年利润'), c('410401', val, `转入未分配利润 ${fmt(val)} 元`, '留存收益增加')]
        : [d('410401', val, `本年净亏损 ${fmt(val)} 元`, '冲减未分配利润'), c('4103', val, `结平本年利润 ${fmt(val)} 元`, '亏损结转')],
        explain(
          `年末把"本年利润"全年累计余额转入"利润分配—未分配利润"，"本年利润"结平。`,
          [['为什么', '本年利润是"期间汇总"账户，年末必须清零，利润进入留存收益'],
          ['科目', net >= 0 ? '借"本年利润"，贷"利润分配—未分配利润"' : '借"利润分配—未分配利润"，贷"本年利润"'],
          ['金额', `${net >= 0 ? '净利润' : '净亏损'} ${fmt(val)} 元`],
          ['方向', '本年利润结平']],
          ['"本年利润"年末无余额，"未分配利润"逐年累积。'], '《企业会计准则第30号》'
        ), '期末结转');

      if (net > 0.005 && extra && extra.surplus !== false) {
        const surplus = r2(net * 0.1);
        add('提取法定盈余公积', [
          d('410402', surplus, `净利润 ${fmt(net)} × 10% = ${fmt(surplus)} 元`, '法定盈余公积'),
          c('410101', surplus, `盈余公积增加 ${fmt(surplus)} 元`, '留存收益内部结转')
        ], explain(
          `按净利润的 10% 提取法定盈余公积：未分配利润减少，盈余公积增加，所有者权益总额不变。`,
          [['为什么', '法律强制要求企业留存一部分利润，增强抗风险能力'],
          ['科目', '借"利润分配—提取法定盈余公积"，贷"盈余公积—法定盈余公积"'],
          ['金额', `${fmt(net)} × 10% = ${fmt(surplus)} 元`],
          ['方向', '利润分配减少记借方，盈余公积增加记贷方']],
          ['累计提取达到注册资本 50% 时可不再提取。'], '《公司法》'
        ), '期末结转');
        add('结平利润分配明细', [
          d('410401', surplus, `转入未分配利润 ${fmt(surplus)} 元`, '明细科目之间结转'),
          c('410402', surplus, `结平"提取法定盈余公积"明细 ${fmt(surplus)} 元`, '利润分配各明细年末结平')
        ], explain(
          `年末把"利润分配"下各明细（提取盈余公积、应付股利）转入"未分配利润"，只留下"未分配利润"一个明细有余额。`,
          [['为什么', '利润分配是明细核算账户，年末要归集到一个明细'],
          ['科目', '借"利润分配—未分配利润"，贷"利润分配—提取法定盈余公积"'],
          ['金额', `${fmt(surplus)} 元`],
          ['方向', '明细之间一借一贷']],
          ['结转后"利润分配"只有"未分配利润"明细可能有余额。'], '《企业会计准则第30号》'
        ), '期末结转');
      }
    }

    if (!newEntries.length) return null;
    const block = {
      auto: true, index: parsed.blocks.length, label: '期末结转（自动生成）',
      raw: '按本期账目自动生成期末结转：转出未交增值税 → 城建税及附加 → 企业所得税 → 结转收入/费用 → 结转本年利润 → 提取法定盈余公积。', clauses: [], entries: newEntries, warnings: []
    };
    newEntries.forEach((e, i) => {
      e.blockIndex = block.index;
      e.seqInBlock = i + 1;
      e.balanced = root.checkEntry(e);
    });
    parsed.blocks.push(block);
    parsed.entries = entries.concat(newEntries);
    return block;
  }

  /* 汇总 */
  function summarize(parsed, opening) {
    const ledger = buildLedger(parsed.entries, opening || parsed.opening);
    const trial = trialBalance(ledger);
    const pl = plSummary(ledger, parsed.entries);
    const blocks = parsed.blocks.filter((b) => b.entries.length).map((b) => {
      const lines = b.entries.reduce((s, e) => s + e.lines.length, 0);
      const dSum = r2(b.entries.reduce((s, e) => s + e.lines.filter((l) => l.side === 'D').reduce((x, l) => x + l.amount, 0), 0));
      const cSum = r2(b.entries.reduce((s, e) => s + e.lines.filter((l) => l.side === 'C').reduce((x, l) => x + l.amount, 0), 0));
      return Object.assign({}, b, { lineCount: lines, dSum, cSum, balanced: Math.abs(dSum - cSum) < 0.005, t: tAccounts(b.entries) });
    });
    return { blocks, ledger, trial, pl, checks: checks(parsed, ledger, trial, pl) };
  }

  root.buildLedger = buildLedger;
  root.balanceOf = balanceOf;
  root.balanceSide = balanceSide;
  root.trialBalance = trialBalance;
  root.plSummary = plSummary;
  root.tAccounts = tAccounts;
  root.autoClose = autoClose;
  root.summarize = summarize;
})(typeof globalThis !== 'undefined' ? globalThis : this);
