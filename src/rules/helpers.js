/* ============================================================
 * rules/helpers.js —— 分录构造小工具
 * ============================================================ */
(function (root) {
  'use strict';
  const { round2, fmt } = root;

  const d = (code, amount, calc, basis) => ({ side: 'D', code, amount: round2(amount), calc, basis });
  const c = (code, amount, calc, basis) => ({ side: 'C', code, amount: round2(amount), calc, basis });
  function line(side, code, amount, calc, basis) {
    return { side, code, amount: round2(amount), calc, basis };
  }

  /* 生成一条分录 */
  function E(ctx, memo, lines, ex, flags) {
    // 展示顺序：借方在前、贷方在后（保持组内原顺序）
    const ordered = lines.slice().sort((a, b) => (a.side === b.side ? 0 : a.side === 'D' ? -1 : 1));
    return {
      memo,
      date: ctx.date,
      lines: ordered,
      ex: ex || {},
      flags: flags || {},
      text: ctx.text
    };
  }

  function explain(logic, steps, pitfalls, std) {
    return {
      logic,
      steps: steps.map((s) => ({ k: s[0], v: s[1] })),
      pitfalls: pitfalls || [],
      std: std || ''
    };
  }

  const nz = (v) => (typeof v === 'number' && isFinite(v) ? v : null);
  function firstNum() {
    for (let i = 0; i < arguments.length; i++) {
      const v = nz(arguments[i]);
      if (v !== null) return v;
    }
    return null;
  }

  // 借贷合计（用于自检）
  function sums(lines) {
    let dSum = 0, cSum = 0;
    lines.forEach((l) => { if (l.side === 'D') dSum += l.amount; else cSum += l.amount; });
    return { dSum: round2(dSum), cSum: round2(cSum), balanced: Math.abs(dSum - cSum) < 0.005 };
  }

  root.RH = { d, c, line, E, explain, nz, firstNum, sums, fmt };
})(typeof globalThis !== 'undefined' ? globalThis : this);
