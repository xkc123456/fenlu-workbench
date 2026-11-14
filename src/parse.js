/* ============================================================
 * parse.js —— 题干解析：分板块 → 分句 → 抽金额 → 匹配规则 → 生成分录
 * ============================================================ */
(function (root) {
  'use strict';
  const fmt = root.fmt, r2 = root.round2, ACC = root.ACC;

  const CP = /[（(]\s*([0-9]{1,2}|[一二三四五六七八九十]{1,2})\s*[)）]/; // 全角括号
  const normalize = (s) => squeezeNumbers(s
    .replace(/\r\n?/g, '\n')
    .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/[％]/g, '%')
    .replace(/[：]/g, ':')
    .replace(/[，]/g, '，')
    .replace(/[；]/g, ';')
    .replace(/[。]/g, '。')
    .replace(/\u3000/g, ' ')
    .replace(/[ \t]+/g, ' '));

  // 去掉数字间的千分位空格（"100 000" → "100000"）
  function squeezeNumbers(s) {
    for (let i = 0; i < 3; i++) s = s.replace(/(\d)[ \u00a0](?=\d{3}(?:\D|$))/g, '$1');
    return s;
  }

  /* 板块切分：行首的（1）/1./①/第1题/资料一/业务一/【...】 */
  const BLOCK_MARK = /(?:^|(?<=[。;\n]))[ \t]*(?:[（(]\s*([0-9]{1,2}|[一二三四五六七八九十]{1,3})\s*[)）]|([0-9]{1,2})\s*[.、．](?![0-9])|([①-⑳])|第\s*([0-9一二三四五六七八九十]{1,3})\s*(?:题|问|小问|笔|项)|资料\s*([0-9一二三四五六七八九十]{1,3})|业务\s*([0-9一二三四五六七八九十]{1,3})|【([^】]{1,16})】)[ \t]*/gm;

  function splitBlocks(text) {
    const marks = [];
    let m;
    BLOCK_MARK.lastIndex = 0;
    while ((m = BLOCK_MARK.exec(text))) {
      marks.push({ index: m.index, length: m[0].length, label: m[0].trim() });
      if (m.index === BLOCK_MARK.lastIndex) BLOCK_MARK.lastIndex++;
    }
    if (!marks.length) return [{ label: '', raw: text.trim() }];
    const blocks = [];
    if (marks[0].index > 0) {
      const pre = text.slice(0, marks[0].index).trim();
      if (pre) blocks.push({ label: '', raw: pre, preamble: true });
    }
    marks.forEach((mk, i) => {
      const end = i + 1 < marks.length ? marks[i + 1].index : text.length;
      const raw = text.slice(mk.index + mk.length, end).trim();
      blocks.push({ label: mk.label, raw });
    });
    return blocks.filter((b) => b.raw.length > 0);
  }

  /* 分句：句号、分号、换行（保留逗号，因为金额描述常在逗号里） */
  function splitClauses(text) {
    return text.split(/[。;\n]+/).map((s) => s.trim()).filter((s) => s.length >= 2);
  }

  /* 科目名 → 代码 */
  const NAME_MAP = (() => {
    const map = {};
    Object.keys(ACC).forEach((code) => {
      const nm = ACC[code].name;
      map[nm] = code;
      map[nm.replace(/[—\-－\s]/g, '')] = code;
      const tail = nm.split('—').pop();
      if (tail && !map[tail]) map[tail] = code;
      const noParen = nm.replace(/（[^）]*）/g, '');
      if (!map[noParen]) map[noParen] = code;
    });
    return map;
  })();

  function codeByName(name) {
    const n = name.trim().replace(/[：:]/g, '');
    if (NAME_MAP[n]) return NAME_MAP[n];
    const norm = n.replace(/[—\-－\s、]/g, '');
    if (NAME_MAP[norm]) return NAME_MAP[norm];
    // 模糊：包含关系
    let hit = null;
    Object.keys(NAME_MAP).forEach((k) => {
      if (!hit && (k.includes(norm) || norm.includes(k)) && k.length >= 2) hit = NAME_MAP[k];
    });
    return hit;
  }

  /* 金额语义解析 */
  function resolveAmounts(text, tokens, opts) {
    const rateInfo = root.extractRate(text, opts.vatRate);
    let rate = rateInfo.rate;
    let price = null, vat = null, freight = null, total = null, amount = null, cost = null, share = null, interest = null, original = null, fee = null;
    tokens.forEach((tk) => {
      const L = tk.label || '';
      if (/交易费用|手续费|佣金/.test(L)) { if (fee === null) fee = tk.value; }
      else if (/增值税|进项税额|销项税额|税额/.test(L)) { if (vat === null) vat = tk.value; }
      else if (/运费|运输费/.test(L)) { if (freight === null) freight = tk.value; }
      else if (/价税合计|含税/.test(L)) { if (total === null) total = tk.value; }
      else if (/利息|贴现息/.test(L)) { if (interest === null) interest = tk.value; }
      else if (/原值|原价/.test(L)) { if (original === null) original = tk.value; }
      else if (/注册资本|实收资本|股本|份额|资本公积/.test(L)) { if (share === null) share = tk.value; }
      else if (/成本/.test(L)) { if (cost === null) cost = tk.value; if (amount === null) amount = tk.value; }
      else if (/价款|货款|不含税|售价|销售额|收入|金额|费用|关税|投资款|工资|薪酬|折旧|租金|借款|本金|面值|票面|市值|公允价值|余额/.test(L)) { if (price === null) price = tk.value; }
      else { if (amount === null) amount = tk.value; }
    });
    // 含税价：文字里有"含税"且没有"不含税"
    if (price !== null && total === null && /含税/.test(text) && !/不含税/.test(text)) { total = price; price = null; }
    // 只有税额与税率 → 反推不含税价
    if (price === null && vat !== null && rate && amount === null) price = r2(vat / rate);
    // 只有价税合计 → 价税分离
    if (price === null && total !== null && rate) { price = r2(total / (1 + rate)); if (vat === null) vat = r2(total - price); }
    // 只有不含税价 → 算税
    if (vat === null && price !== null && rate) vat = r2(price * rate);
    if (total === null && price !== null) total = r2(price + (vat || 0) + (freight ? r2(freight * 1.09) : 0));
    if (price === null) price = amount !== null ? amount : (total !== null ? total : null);

    const discM = text.match(/(\d{1,2})\s*\/\s*(\d{1,2})/);
    const discP = text.match(/现金折扣[^0-9]{0,4}(\d{1,2}(?:\.\d+)?)\s*[%％]/);
    const discountRate = discM ? Number(discM[1]) / 100 : discP ? Number(discP[1]) / 100 : 0;

    return {
      price, vat, freight, total, amount, cost, share, interest, original, fee, rate, discountRate,
      rateRaw: rateInfo.raw, tokens
    };
  }

  /* 借贷平衡校验 */
  function checkEntry(e) {
    let dSum = 0, cSum = 0;
    e.lines.forEach((l) => { if (l.side === 'D') dSum += l.amount; else cSum += l.amount; });
    return Math.abs(dSum - cSum) < 0.005;
  }

  /* 手动分录：借：科目 金额 */
  function parseManual(lines) {
    const entries = [];
    let cur = null;
    lines.forEach((raw) => {
      const m = raw.match(/^\s*(借|贷)\s*[:：]?\s*(.+?)\s+([\d,，]+(?:\.\d+)?)\s*(?:元)?\s*$/);
      if (!m) {
        const memoM = raw.match(/^\s*(?:摘要|业务)\s*[:：]\s*(.+)$/);
        if (memoM) { if (cur) cur.memo = memoM[1]; }
        return;
      }
      const side = m[1] === '借' ? 'D' : 'C';
      const code = codeByName(m[2]);
      const amount = Number(m[3].replace(/[,，]/g, ''));
      if (side === 'D' && (!cur || (cur.lines.length && cur.lines[cur.lines.length - 1].side === 'C'))) {
        cur = { memo: '手工录入分录', date: null, lines: [], manual: true, ruleTitle: '手工分录', ruleId: 'manual', scene: '手工', ex: { logic: '手工录入的分录。', steps: [], pitfalls: [] } };
        entries.push(cur);
      }
      if (!cur) { cur = { memo: '手工录入分录', date: null, lines: [], manual: true, ruleTitle: '手工分录', ruleId: 'manual', scene: '手工', ex: { logic: '', steps: [], pitfalls: [] } }; entries.push(cur); }
      cur.lines.push({ side, code: code || m[2], amount: r2(amount), calc: m[3], basis: code ? '' : '未在科目表中找到该科目名' });
    });
    entries.forEach((e) => { e.balanced = checkEntry(e); });
    return entries;
  }

  /* 主入口 */
  function parse(text, opts) {
    const o = Object.assign({ vatRate: 0.13, baseDate: '2026-12-31', cityRate: 0.07, eduRate: 0.03, localEduRate: 0.02, incomeRate: 0.25 }, opts || {});
    const year = Number((o.baseDate || '2026-01-01').slice(0, 4));
    const src = normalize(text || '');
    const rawBlocks = splitBlocks(src);
    const balances = {}; // code -> {debit, credit}
    const meta = {};     // 跨句业务参数（如债券的票面利率、实际利率）
    const allEntries = [];

    function bal(code) {
      if (code.length === 4) {
        // 一级科目：汇总其下所有明细
        let sum = 0;
        Object.keys(balances).forEach((k) => {
          if (k.indexOf(code) === 0) {
            const b = balances[k];
            const dir = (ACC[k] || {}).dir || 'debit';
            sum += dir === 'debit' ? b.debit - b.credit : b.credit - b.debit;
          }
        });
        return r2(sum);
      }
      const b = balances[code];
      if (!b) return 0;
      const dir = (ACC[code] || {}).dir || 'debit';
      return r2(dir === 'debit' ? b.debit - b.credit : b.credit - b.debit);
    }
    function plBeforeTaxLocal() {
      let sum = 0;
      Object.keys(balances).forEach((code) => {
        const meta = ACC[code];
        if (!meta) return;
        const b = balances[code];
        if (meta.cat === '收入') sum += b.credit - b.debit;
        if (meta.cat === '费用') sum -= b.debit - b.credit;
      });
      return r2(sum);
    }
    function post(entry) {
      entry.lines.forEach((l) => {
        const b = balances[l.code] || (balances[l.code] = { debit: 0, credit: 0 });
        if (l.side === 'D') b.debit = r2(b.debit + l.amount); else b.credit = r2(b.credit + l.amount);
      });
    }

    const blocks = [];
    let prevGlobal = null;   // 跨板块的"上一笔业务"，用于"支付上述款项"这类指代
    let recentText = '';     // 最近几句原文，供规则判断"采用权益法"这类跨句上下文
    rawBlocks.forEach((rb, bi) => {
      const lines = rb.raw.split('\n');
      const hasManual = lines.some((l) => /^\s*(借|贷)\s*[:：]/.test(l));
      const block = {
        index: bi,
        label: rb.label || `板块 ${bi + 1}`,
        raw: rb.raw,
        preamble: !!rb.preamble,
        clauses: [],
        entries: [],
        warnings: []
      };
      if (hasManual) {
        const manual = parseManual(lines);
        manual.forEach((e, i) => {
          e.date = o.baseDate;
          e.blockIndex = bi;
          e.clauseText = e.memo;
          if (!e.balanced) block.warnings.push(`第 ${i + 1} 笔手工分借贷不平，请检查。`);
          block.entries.push(e);
          allEntries.push(e);
          post(e);
        });
        blocks.push(block);
        return;
      }

      const clauses = splitClauses(rb.raw);
      let prev = prevGlobal;
      clauses.forEach((ct, ci) => {
        const tokens = root.extractAmounts(ct);
        const date = root.parseDate(ct, year) || o.baseDate;
        const a = resolveAmounts(ct, tokens, o);
        const ctx = {
          text: ct, date, a, opts: o, prev, bal,
          blockIndex: bi, clauseIndex: ci,
          recent: recentText,
          blockText: rb.raw,
          docText: src,
          meta,
          plBeforeTax: plBeforeTaxLocal
        };
        // 未给金额但指代上文 → 沿用上一笔
        if (!tokens.length && prev && /(上述|该批|此笔|前述|以上)/.test(ct)) {
          a.price = prev.price; a.vat = prev.vat; a.total = prev.total; a.amount = prev.total; a.rate = prev.rate;
          ctx.carry = true;
        }
        let rule = null;
        for (const r of root.RULES) {
          let ok = false;
          try { ok = r.test(ct, ctx); } catch (err) { ok = false; }
          if (ok) { rule = r; break; }
        }
        let built = [];
        if (rule) {
          try {
            built = rule.build(ctx) || [];
          } catch (err) {
            built = [];
            block.warnings.push(`「${ct}」解析出错：${err.message}`);
          }
        }
        if (!built.length) {
          // 没有金额的过渡句（如"材料已验收入库"）直接跳过
          if (!tokens.length) { prev = a; prevGlobal = a; return; }
          built = [{
            memo: '未识别业务', date, lines: [], text: ct,
            flags: { unknown: true },
            ex: {
              logic: /债券/.test(ct) && /(购入|取得|买入)/.test(ct)
                ? '这句像"债券投资"，但缺少分类关键词。请补一句"确认为其他债权投资"（或"交易性金融资产""债权投资"）——三类的科目和后续计量完全不同，我不能替你猜。'
                : '这句话里找到了金额，但没有匹配到内置业务规则。可以把它改写成标准表述，或在题干里用"借：/贷：科目 金额"手工录入。',
              steps: [], pitfalls: []
            }
          }];
          block.warnings.push(`「${ct}」未匹配到业务类型`);
        }
        built.forEach((e, k) => {
          e.date = e.date || date;
          e.blockIndex = bi;
          e.clauseIndex = ci;
          e.ruleId = rule ? rule.id : 'unknown';
          if (/^(closing-|vat-transfer$)/.test(e.ruleId)) e.closing = true;
          e.ruleTitle = rule ? rule.title : '未识别';
          e.scene = rule ? rule.scene : '其他';
          e.clauseText = ct;
          e.seqInBlock = block.entries.length + k + 1;
          e.balanced = checkEntry(e);
          if (!e.balanced && e.lines.length) block.warnings.push(`「${e.memo}」借贷不平，请检查。`);
          block.entries.push(e);
          allEntries.push(e);
          post(e);
        });
        prev = a;
        prevGlobal = a;
        recentText = (recentText + ' ' + ct).slice(-600);
      });
      blocks.push(block);
    });

    return { blocks, entries: allEntries, opts: o, src };
  }

  /* 税前利润（用于所得税等） */
  function plBeforeTax(ledger) {
    if (!ledger) return 0;
    let sum = 0;
    Object.keys(ledger).forEach((code) => {
      const meta = ACC[code]; if (!meta) return;
      if (meta.cat === '收入') sum += ledger[code].credit - ledger[code].debit;
      if (meta.cat === '费用') sum -= ledger[code].debit - ledger[code].credit;
    });
    return r2(sum);
  }

  root.parseInput = parse;
  root.plBeforeTax = plBeforeTax;
  root.codeByName = codeByName;
  root.checkEntry = checkEntry;
  root.splitBlocks = splitBlocks;
  root.splitClauses = splitClauses;
  root.resolveAmounts = resolveAmounts;
  root.normalizeText = normalize;
})(typeof globalThis !== 'undefined' ? globalThis : this);
