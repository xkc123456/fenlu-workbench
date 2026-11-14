/* ============================================================
 * rules/index.js —— 规则注册表（顺序即匹配优先级）
 * ============================================================ */
(function (root) {
  'use strict';
  // 顺序很重要：先具体、后笼统
  const RULES = [].concat(
    root.RULE_GROUPS_ADVANCED || [], // 计划成本、长投、投资性房地产、租赁、债券、研发、补贴
    root.RULE_GROUPS_INVEST || [],   // 交易性金融资产、固定资产处置
    root.RULE_GROUPS_FUND || [],     // 投资、借款、利息、还本
    root.RULE_GROUPS_SELL || [],     // 坏账、退货、贴现、销售、收款
    root.RULE_GROUPS_BUY || [],      // 固定资产、材料、预付、应付
    root.RULE_GROUPS_PRODUCE || [],  // 领料、工资、折旧、制造费用、完工
    root.RULE_GROUPS_PERIOD || []    // 附加税、增值税、所得税、结转、分配
  );
  root.RULES = RULES;
  root.RULE_BY_ID = RULES.reduce((m, r) => { m[r.id] = r; return m; }, {});
})(typeof globalThis !== 'undefined' ? globalThis : this);
