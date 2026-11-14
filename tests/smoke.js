/* 冒烟测试：加载引擎，跑全部示例，校验借贷平衡与关键金额 */
const path = require('path');
const base = path.join(__dirname, '..', 'src');
[
  'core.js',
  'rules/helpers.js', 'rules/fund.js', 'rules/buy.js', 'rules/produce.js',
  'rules/sell.js', 'rules/invest.js', 'rules/period.js', 'rules/advanced.js', 'rules/index.js',
  'parse.js', 'engine.js', 'reports.js', 'examples.js'
].forEach((f) => require(path.join(base, f)));

const { parseInput, summarize, autoClose, buildStatements, EXAMPLES, fmt } = globalThis;

let fails = 0;
function ok(cond, msg) {
  if (!cond) { fails++; console.log('  ✗ ' + msg); }
  else console.log('  ✓ ' + msg);
}

Object.keys(EXAMPLES).forEach((key) => {
  const ex = EXAMPLES[key];
  console.log('\n=== ' + ex.name + ' ===');
  const parsed = parseInput(ex.text, { baseDate: '2026-12-31' });
  const s = summarize(parsed);
  console.log(`板块 ${s.blocks.length} / 分录 ${parsed.entries.length} / 借 ${fmt(s.trial.debitSum)} 贷 ${fmt(s.trial.creditSum)}`);
  s.blocks.forEach((b) => {
    console.log(`  [${b.index}] ${b.entries.map((e) => e.ruleTitle).join(' | ')}`);
    b.entries.forEach((e) => {
      const d = e.lines.filter((l) => l.side === 'D').reduce((x, l) => x + l.amount, 0);
      const c = e.lines.filter((l) => l.side === 'C').reduce((x, l) => x + l.amount, 0);
      if (Math.abs(d - c) > 0.005) console.log(`    ✗ 不平：${e.memo} 借 ${d} 贷 ${c}`);
    });
  });
  ok(s.trial.balanced, '整体试算平衡');
  const unk = parsed.entries.filter((e) => e.flags && e.flags.unknown);
  ok(unk.length === 0, `无未识别业务${unk.length ? '（' + unk.map((u) => u.clauseText).join(' / ') + '）' : ''}`);

  const closed = summarize(parseInput(ex.text, { baseDate: '2026-12-31' }));
  const p2 = parseInput(ex.text, { baseDate: '2026-12-31' });
  const blk = autoClose(p2, { surplus: true });
  const s2 = summarize(p2);
  ok(s2.trial.balanced, '期末结转后仍试算平衡');
  const st = buildStatements(p2.entries, s2.ledger);
  ok(st.bs.balanced, `资产负债表平衡（资产 ${fmt(st.bs.assets)} = 负债 ${fmt(st.bs.liab)} + 权益 ${fmt(st.bs.equity)}）`);
  ok(Math.abs(st.is.totalProfit) >= 0, `利润表可生成（利润总额 ${fmt(st.is.totalProfit)}）`);
  ok(st.cf.reconciled, `现金流量勾稽（净额 ${fmt(st.cf.net)} = 货币资金 ${fmt(st.cf.cashEnd)}）`);
  console.log(`  期末结转 ${blk ? blk.entries.length : 0} 笔，净利润 ${fmt(s2.pl.profitBeforeTax - s2.pl.incomeTax)}`);
});

// 期初余额场景
const op = { '1002': 500000, '4001': 500000 };
const p3 = parseInput(EXAMPLES.full.text, { baseDate: '2026-12-31' });
const s3 = summarize(p3, op);
ok(s3.trial.obBalanced && Math.abs(s3.trial.obD - 500000) < 0.005, '期初余额借贷平衡且金额正确');
ok(s3.trial.balanced, '带期初余额时试算平衡');
const st3 = buildStatements(p3.entries, s3.ledger, op);
ok(st3.bs.balanced, '带期初余额时资产负债表平衡');
ok(st3.bsOpen && Math.abs(st3.bsOpen.assets - 500000) < 0.005, '期初资产负债表资产 = 期初货币资金');
ok(st3.cf.reconciled, '带期初余额时现金流勾稽通过');

console.log(fails ? `\n${fails} 项失败` : '\n全部通过');
process.exit(fails ? 1 : 0);
