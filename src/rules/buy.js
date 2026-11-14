/* ============================================================
 * rules/buy.js —— 采购与付款：材料、固定资产、在建工程、预付、应付
 * ============================================================ */
(function (root) {
  'use strict';
  const { d, c, E, explain, firstNum } = root.RH;
  const fmt = root.fmt;
  const r2 = root.round2;

  // 付款方式 → 贷方科目
  function payAcct(text) {
    if (/现金/.test(text) && !/银行存款/.test(text)) return { code: '1001', verb: '现金支付' };
    if (/(商业汇票|银行承兑汇票|商业承兑汇票|开出.{0,4}汇票|承兑)/.test(text)) return { code: '2201', verb: '开出商业汇票' };
    if (/(未付|未支付|尚未支付|暂欠|赊购|赊销|欠款|应付|以后再付|下月支付)/.test(text)) return { code: '2202', verb: '款项未付' };
    return { code: '1002', verb: '银行付款' };
  }

  const rules = [
    /* ---------- 购入固定资产 ---------- */
    {
      id: 'purchase-fixed',
      title: '购入固定资产',
      scene: '采购',
      test(t) {
        return /(购入|购置|购买|采购|买)/.test(t) &&
          /(固定资产|设备|机器|生产线|汽车|货车|厂房|办公楼|空调|电脑)/.test(t) &&
          !/(原材料|材料|商品|存货)/.test(t) && !/(处置|出售|报废|清理|折旧)/.test(t);
      },
      build(ctx) {
        const price = firstNum(ctx.a.price, ctx.a.amount, ctx.a.total) || 0;
        const vat = firstNum(ctx.a.vat) || (ctx.a.rate ? r2(price * ctx.a.rate) : 0);
        const freight = firstNum(ctx.a.freight) || 0;
        const needInstall = /(需安装|需要安装|安装|调试|尚未达到预定可使用状态|在建)/.test(ctx.text) && !/(不需安装|无需安装)/.test(ctx.text);
        const p = payAcct(ctx.text);
        const cost = r2(price + freight);
        const tax = r2(vat + (freight ? r2(freight * 0.09) : 0));
        const total = r2(cost + tax);
        const assetCode = needInstall ? '1604' : '1601';
        const lines = [d(assetCode, cost, freight ? `买价 ${fmt(price)} + 运费 ${fmt(freight)} = ${fmt(cost)} 元` : `买价 ${fmt(price)} 元`,
          needInstall ? '需安装：先通过"在建工程"归集，达到可使用状态再转固定资产' : '不需安装：直接计入固定资产成本')];
        if (tax > 0) lines.push(d('22210101', tax, freight ? `设备税额 ${fmt(vat)} + 运费税额 ${fmt(freight)}×9% = ${fmt(tax)}` : `价款 × 税率 = ${fmt(tax)} 元`, '取得增值税专用发票，进项税可抵扣，不计入资产成本'));
        lines.push(c(p.code, total, `${fmt(cost)} + ${fmt(tax)} = ${fmt(total)} 元`, p.verb));
        return [E(ctx, needInstall ? '购入需安装设备（在建工程）' : '购入不需安装固定资产', lines, explain(
          `外购固定资产的成本 = 买价 + 运输费 + 安装调试费（达到预定可使用状态前）。增值税是价外税，取得专票可抵扣，**不计入成本**。`,
          [['业务实质', '花钱买长期使用的资产，支出资本化而不是费用化'],
          ['科目选择', needInstall ? '"在建工程"先归集，安装完毕转入"固定资产"' : '"固定资产"直接入账'],
          ['金额', `成本 ${fmt(cost)} 元（买价${freight ? '+运费' : ''}）；进项税 ${fmt(tax)} 元单独核算`],
          ['方向', '资产增加记借方；资产减少/负债增加记贷方']],
          ['把增值税记进固定资产成本是最常见的错误——一般纳税人取得专票时税不进成本。',
            '运费也要按 9% 计算进项税（取得专票时）；安装领用本企业产品还涉及视同销售。'],
          '《企业会计准则第4号——固定资产》'
        ))];
      }
    },

    /* ---------- 支付安装费 / 工程款 ---------- */
    {
      id: 'install-cost',
      title: '支付安装费/工程款',
      scene: '采购',
      test(t) {
        return /(安装费|安装调试费|调试费|工程款|工程物资|建造|施工)/.test(t) && !/(完工|达到预定可使用状态)/.test(t);
      },
      build(ctx) {
        const amt = firstNum(ctx.a.amount, ctx.a.price, ctx.a.total) || 0;
        const hasTax = /(增值税|专票|税额|税率)/.test(ctx.text);
        const vat = hasTax ? (firstNum(ctx.a.vat) || 0) : 0;
        const total = r2(amt + vat);
        const p = payAcct(ctx.text);
        const lines = [d('1604', amt, `安装/工程支出 ${fmt(amt)} 元`, '达到预定可使用状态前的支出计入在建工程')];
        if (vat > 0) lines.push(d('22210101', vat, `安装费 × 税率 = ${fmt(vat)} 元`, '取得专票的进项税可抵扣'));
        lines.push(c(p.code, total, `价税合计 ${fmt(total)} 元`, p.verb));
        return [E(ctx, '支付安装/工程款', lines, explain(
          `安装调试费是固定资产达到可使用状态前的必要支出，要资本化计入"在建工程"，不能直接进管理费用。`,
          [['业务实质', '为让设备能用而发生的必要支出，属于资产成本'],
          ['科目选择', '借"在建工程"，贷"银行存款"'],
          ['金额', `安装费 ${fmt(amt)} 元，进项税 ${fmt(vat)} 元`],
          ['方向', '资产（在建工程）增加记借方']],
          ['"在建工程"是过渡账户：所有支出先归集，完工时一次性转"固定资产"。',
            '若安装领用了本企业原材料，还要做进项税额转出（用于非应税项目）。'],
          '《企业会计准则第4号——固定资产》'
        ))];
      }
    },

    /* ---------- 工程完工转固定资产 ---------- */
    {
      id: 'project-done',
      title: '工程完工转固定资产',
      scene: '采购',
      test(t) {
        return /(完工|达到预定可使用状态|交付使用|验收合格|办理竣工决算)/.test(t) &&
          /(工程|设备|生产线|厂房|在建)/.test(t);
      },
      build(ctx) {
        const given = firstNum(ctx.a.amount, ctx.a.price, ctx.a.total);
        const bal = ctx.bal ? ctx.bal('1604') : 0;
        const amt = given !== null && given > 0 ? given : bal;
        return [E(ctx, '在建工程完工转固定资产', [
          d('1601', amt, given !== null ? `竣工决算成本 ${fmt(amt)} 元` : `"在建工程"账户余额 ${fmt(bal)} 元（买价+运费+安装费）`, '达到预定可使用状态，转入固定资产开始计提折旧'),
          c('1604', amt, `结转在建工程 ${fmt(amt)} 元`, '过渡账户清零')
        ], explain(
          `"在建工程"只是过程中的"停车场"。设备达到预定可使用状态时，把归集的全部成本一次性转入"固定资产"，此后开始计提折旧。`,
          [['业务实质', '资产形态转换：在建 → 可用'],
          ['科目选择', '借"固定资产"，贷"在建工程"'],
          ['金额', `取"在建工程"账户余额 ${fmt(amt)} 元（买价 + 运费 + 安装费，不含可抵扣进项税）`],
          ['方向', '固定资产增加记借方；在建工程减少记贷方']],
          ['转入时点不是"付款时"，而是"达到预定可使用状态时"。',
            '在建工程若发生减值，要先计提减值准备再转固。'],
          '《企业会计准则第4号——固定资产》'
        ))];
      }
    },

    /* ---------- 采购材料 ---------- */
    {
      id: 'purchase-material',
      title: '采购原材料',
      scene: '采购',
      test(t) {
        return /(购入|采购|购进|买进|购买|收到)/.test(t) &&
          /(原材料|材料|物资|库存商品|商品|货物|配件|燃料)/.test(t) &&
          !/(固定资产|设备|机器|生产线|汽车|厂房|办公楼|销售|售出|出售|领用|发出)/.test(t);
      },
      build(ctx) {
        const price = firstNum(ctx.a.price, ctx.a.amount, ctx.a.total) || 0;
        const vat = firstNum(ctx.a.vat) || (ctx.a.rate ? r2(price * ctx.a.rate) : 0);
        const freight = firstNum(ctx.a.freight) || 0;
        const cost = r2(price + freight);
        const tax = r2(vat + (freight ? r2(freight * 0.09) : 0));
        const total = r2(cost + tax);
        const prepaid = /预付/.test(ctx.text) || /(已经预付|已预付)/.test(ctx.text);
        const p = payAcct(ctx.text);
        const lines = [
          d('1403', cost, freight ? `价款 ${fmt(price)} + 运费 ${fmt(freight)} = ${fmt(cost)} 元` : `不含税价款 ${fmt(price)} 元`, '采购成本包括买价、运输费、装卸费等，不包括可抵扣增值税'),
          d('22210101', tax, freight ? `材料税额 ${fmt(vat)} + 运费税额 ${fmt(freight)}×9% = ${fmt(tax)}` : `价款 ${fmt(price)} × ${(ctx.a.rate * 100).toFixed(0)}% = ${fmt(tax)} 元`, '一般纳税人取得专票，进项税单独确认，不计入材料成本')
        ];
        if (prepaid) {
          const preBal = ctx.bal ? Math.max(0, ctx.bal('1123')) : 0;
          const usePre = Math.min(preBal, total);
          if (usePre > 0.005) {
            lines.push(c('1123', usePre, `冲减此前预付账款 ${fmt(usePre)} 元`, '收货时冲减预付款（资产减少）'));
            const rest = r2(total - usePre);
            if (rest > 0.005) lines.push(c('1002', rest, `补付差额 ${fmt(total)} − ${fmt(usePre)} = ${fmt(rest)} 元`, '预付款不足，银行补付'));
            else if (rest < -0.005) lines.push(d('1002', -rest, `退回多付款 ${fmt(-rest)} 元`, '预付款有余额，银行退回'));
          } else {
            lines.push(c('1123', total, `冲减预付账款 ${fmt(total)} 元`, '按价税合计冲减预付款（资产减少）'));
          }
        } else {
          lines.push(c(p.code, total, `${fmt(cost)} + ${fmt(tax)} = ${fmt(total)} 元`, p.verb));
        }
        return [E(ctx, prepaid ? '收到预购材料（冲预付）' : '采购原材料', lines, explain(
          `采购材料要拆成"成本"和"进项税"两件事：成本进存货，税额进"应交税费—应交增值税（进项税额）"，等以后销售产生销项税时抵扣。`,
          [['业务实质', '存货增加，同时支付货款或承担应付义务；增值税可抵扣'],
          ['科目选择', '借"原材料"（成本）；借"应交税费—应交增值税（进项税额）"；贷方看付款方式'],
          ['金额', `成本 ${fmt(cost)} 元、进项税 ${fmt(tax)} 元、价税合计 ${fmt(total)} 元`],
          ['方向', '资产增加、负债（可抵扣税额）增加记借方；资产减少或负债增加记贷方']],
          ['小规模纳税人不能抵扣，税额要计入材料成本，不能照抄一般纳税人的做法。',
            '运费取得专票按 9% 抵扣，取得普票不能抵扣。',
            '材料未到先付款，应先进"在途物资"，验收入库再转"原材料"。'],
          '《企业会计准则第1号——存货》'
        ))];
      }
    },

    /* ---------- 预付货款 ---------- */
    {
      id: 'prepay',
      title: '预付货款',
      scene: '采购',
      test(t) {
        return /(预付|预先支付|先付|预付款)/.test(t) && /(款|货款|定金|订金)/.test(t) &&
          !/(收到|购入|采购|购进)/.test(t);
      },
      build(ctx) {
        const amt = firstNum(ctx.a.amount, ctx.a.price, ctx.a.total) || 0;
        return [E(ctx, '预付货款', [
          d('1123', amt, `按合同预付 ${fmt(amt)} 元`, '预付账款是资产（债权），不是费用'),
          c('1002', amt, `银行付款 ${fmt(amt)} 元`, '银行存款减少')
        ], explain(
          `预付账款是"先给钱、后收货"形成的债权。它属于资产，不能一付款就记成本或费用。`,
          [['业务实质', '钱付出去了，但货还没到，企业拥有一项索取货物的权利'],
          ['科目选择', '借"预付账款"，贷"银行存款"'],
          ['金额', `实际预付 ${fmt(amt)} 元`],
          ['方向', '资产（债权）增加记借方；资产（银行存款）减少记贷方']],
          ['预付账款与应收账款都是债权，但成因不同：一个先付款，一个先发货。',
            '收到货物时要冲减预付账款，而不是再记一次"应付账款"。'],
          '《企业会计准则第22号——金融工具确认和计量》'
        ))];
      }
    },

    /* ---------- 支付前欠货款 ---------- */
    {
      id: 'pay-payable',
      title: '支付前欠货款',
      scene: '采购',
      test(t) {
        return /(支付|偿付|归还|结清|付清)/.test(t) &&
          /(货款|欠款|账款|款项|材料款|设备款)/.test(t) &&
          !/(预付|利息|工资|税费|税款)/.test(t);
      },
      build(ctx) {
        const amt = firstNum(ctx.a.amount, ctx.a.price, ctx.a.total) ||
          (ctx.prev && ctx.prev.total ? ctx.prev.total : 0);
        const discRate = ctx.a.discountRate || 0;
        const disc = r2(amt * discRate);
        const pay = r2(amt - disc);
        const lines = [d('2202', amt, `冲减应付账款 ${fmt(amt)} 元`, '偿还以前形成的商业信用负债')];
        if (disc > 0) lines.push(c('6603', disc, `享受现金折扣 ${(discRate * 100).toFixed(0)}%：${fmt(amt)} × ${(discRate * 100).toFixed(0)}% = ${fmt(disc)} 元`, '购货方享受的现金折扣冲减财务费用'));
        lines.push(c('1002', pay, disc > 0 ? `实际付款 ${fmt(amt)} − ${fmt(disc)} = ${fmt(pay)} 元` : `银行付款 ${fmt(pay)} 元`, '银行存款减少'));
        return [E(ctx, '支付前欠货款', lines, explain(
          `偿还应付账款：负债减少、资产减少。若在折扣期内付款，少付的部分是"理财收益"，冲减财务费用。`,
          [['业务实质', '用银行存款清偿商业信用负债'],
          ['科目选择', '借"应付账款"，贷"银行存款"（有现金折扣时贷"财务费用"）'],
          ['金额', disc > 0 ? `应付 ${fmt(amt)}，折扣 ${fmt(disc)}，实付 ${fmt(pay)}` : `应付 ${fmt(amt)} 元`],
          ['方向', '负债减少记借方；资产减少记贷方']],
          ['题目说"支付上述材料款"时，金额要回到上一笔采购的价税合计，不要只付价款。',
            '现金折扣按总价法处理，实际发生时冲减财务费用，不调整采购成本。'],
          '《企业会计准则第14号——收入》应用指南（现金折扣）'
        ))];
      }
    },

    /* ---------- 开出商业汇票抵付货款 ---------- */
    {
      id: 'issue-note',
      title: '开出商业汇票抵付货款',
      scene: '采购',
      test(t) {
        return /(开出|签发|承兑)/.test(t) && /(商业汇票|银行承兑汇票|商业承兑汇票|汇票)/.test(t);
      },
      build(ctx) {
        const amt = firstNum(ctx.a.amount, ctx.a.price, ctx.a.total) || (ctx.prev && ctx.prev.total ? ctx.prev.total : 0);
        return [E(ctx, '开出商业汇票抵付货款', [
          d('2202', amt, `原应付账款 ${fmt(amt)} 元`, '以票据替换商业信用，负债内部结构变化'),
          c('2201', amt, `开出汇票面值 ${fmt(amt)} 元`, '应付票据是有明确到期日的法定付款义务')
        ], explain(
          `开汇票不是"又欠一笔钱"，而是把"应付账款"换成"应付票据"：负债总额不变，但性质从商业信用变成票据债务。`,
          [['业务实质', '债务形式转换，负债总额不变'],
          ['科目选择', '借"应付账款"，贷"应付票据"'],
          ['金额', `票据面值 ${fmt(amt)} 元`],
          ['方向', '负债减少记借方；负债增加记贷方']],
          ['不要把开票再记一次采购——材料在采购时就已入账。',
            '银行承兑汇票的手续费计入财务费用。'],
          '《企业会计准则第22号——金融工具确认和计量》'
        ))];
      }
    }
  ];

  root.RULE_GROUPS_BUY = rules;
})(typeof globalThis !== 'undefined' ? globalThis : this);
