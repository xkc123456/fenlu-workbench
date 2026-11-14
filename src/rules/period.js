/* ============================================================
 * rules/period.js —— 期末：附加税、增值税结转、所得税、结转损益、利润分配
 * ============================================================ */
(function (root) {
  'use strict';
  const { d, c, E, explain, firstNum } = root.RH;
  const fmt = root.fmt;
  const r2 = root.round2;
  const { ACC } = root;

  const rules = [
    /* ---------- 计提城建税及教育费附加 ---------- */
    {
      id: 'tax-surcharge',
      title: '计提城建税及教育费附加',
      scene: '期末',
      test(t) {
        return /(城建税|城市维护建设税|教育费附加|地方教育附加|税金及附加)/.test(t);
      },
      build(ctx) {
        const rateOf = (kw, dflt) => {
          const m = ctx.text.match(new RegExp(kw + '[^0-9]{0,8}(\\d{1,2}(?:\\.\\d+)?)\\s*[%％]'));
          return m ? Number(m[1]) / 100 : dflt;
        };
        const cityRate = rateOf('城建税', ctx.opts.cityRate);
        const eduRate = rateOf('教育费附加', ctx.opts.eduRate);
        const localRate = rateOf('地方教育', ctx.opts.localEduRate);
        let base = firstNum(ctx.a['增值税'], ctx.a['税额']) || 0;
        if (!base && ctx.bal) base = Math.max(0, r2(ctx.bal('22210102') - ctx.bal('22210101')));
        const city = r2(base * cityRate);
        const edu = r2(base * eduRate);
        const local = r2(base * localRate);
        const total = r2(city + edu + local);
        const lines = [
          d('6403', total, `以实际缴纳增值税 ${fmt(base)} 元为计税依据，合计 ${fmt(total)} 元`, '"税金及附加"核算附加税费'),
          c('222104', city, `${fmt(base)} × ${(cityRate * 100).toFixed(0)}% = ${fmt(city)} 元`, '城市维护建设税'),
          c('222105', edu, `${fmt(base)} × ${(eduRate * 100).toFixed(0)}% = ${fmt(edu)} 元`, '教育费附加'),
          c('222106', local, `${fmt(base)} × ${(localRate * 100).toFixed(0)}% = ${fmt(local)} 元`, '地方教育附加')
        ];
        return [E(ctx, '计提城市维护建设税及教育费附加', lines, explain(
          `附加税费的计税依据是"实际缴纳的增值税、消费税"，不是利润，也不是收入。它是"税上税"。`,
          [['业务实质', '以流转税为基数计算的附加税费，属于营业税金'],
          ['科目选择', '借"税金及附加"；贷"应交税费—应交城建税/教育费附加/地方教育附加"'],
          ['金额', `${fmt(base)} × (7% + 3% + 2%) = ${fmt(total)} 元（城建税税率按纳税人所在地可能为 7%/5%/1%）`],
          ['方向', '费用增加记借方；负债增加记贷方']],
          ['附加税计入"税金及附加"，不是"管理费用"（2016年营改增后已调整）。',
            '计税依据是"实际缴纳"的增值税；有留抵税额时可能无需缴纳，也就无需计提。'],
          '《企业会计准则第30号——财务报表列报》；《城市维护建设税法》'
        ))];
      }
    },

    /* ---------- 月末转出未交增值税 ---------- */
    {
      id: 'vat-transfer',
      title: '月末结转未交增值税',
      scene: '期末',
      test(t) {
        return /(转出未交增值税|结转.{0,6}增值税|未交增值税|缴纳增值税|交纳增值税)/.test(t);
      },
      build(ctx) {
        let amt = firstNum(ctx.a.amount, ctx.a['增值税'], ctx.a['税额']);
        let outVat = 0, inVat = 0;
        if (ctx.bal) {
          outVat = r2(ctx.bal('22210102'));
          inVat = r2(ctx.bal('22210101'));
          if (amt === null) amt = Math.max(0, r2(outVat - inVat));
        }
        if (/缴纳|交纳|实际缴纳/.test(ctx.text)) {
          return [E(ctx, '缴纳增值税', [
            d('222102', amt, `缴纳上月/本月应交增值税 ${fmt(amt)} 元`, '冲减"未交增值税"'),
            c('1002', amt, `银行划款 ${fmt(amt)} 元`, '银行存款减少')
          ], explain(
            `缴纳增值税：负债减少、银行存款减少。注意缴的是"未交增值税"明细，不再是"应交增值税"。`,
            [['业务实质', '清偿税款负债'], ['科目选择', '借"应交税费—未交增值税"，贷"银行存款"'], ['金额', `实缴 ${fmt(amt)} 元`], ['方向', '负债减少记借方；资产减少记贷方']],
            ['缴纳当月增值税用"已交税金"专栏；缴纳以前期间用"未交增值税"。'],
            '《增值税会计处理规定》（财会〔2016〕22号）'
          ))];
        }
        return [E(ctx, '月末转出未交增值税', [
          d('22210104', amt, `销项 ${fmt(outVat)} − 进项 ${fmt(inVat)} = 应交 ${fmt(amt)} 元`, '把应交未交的税额转出'),
          c('222102', amt, `转入"未交增值税" ${fmt(amt)} 元`, '月末"应交增值税"明细结平')
        ], explain(
          `月末把"应交增值税"明细里贷方余额（销项 − 进项）转进"未交增值税"，这样"应交增值税"明细归零，下月缴纳时冲"未交增值税"。`,
          [['业务实质', '增值税明细账户的月末结转'],
          ['科目选择', '借"应交税费—应交增值税（转出未交增值税）"，贷"应交税费—未交增值税"'],
          ['金额', `销项税额 ${fmt(outVat)} − 进项税额 ${fmt(inVat)} = ${fmt(amt)} 元`],
          ['方向', '应交增值税明细借方转出；未交增值税贷方增加']],
          ['进项大于销项时形成留抵税额，不做这笔分录，留待下期继续抵扣。',
            '这一步只是明细账户之间的结转，不影响损益。'],
          '《增值税会计处理规定》（财会〔2016〕22号）'
        ))];
      }
    },

    /* ---------- 计提企业所得税 ---------- */
    {
      id: 'income-tax',
      title: '计提企业所得税',
      scene: '期末',
      test(t) {
        return /所得税/.test(t) && !/(个人所得税|递延所得税)/.test(t);
      },
      build(ctx) {
        let profit = firstNum(ctx.a['利润总额'], ctx.a['应纳税所得额'], ctx.a.amount);
        if (profit === null && ctx.bal) profit = ctx.plBeforeTax ? ctx.plBeforeTax() : 0;
        const rate = ctx.a.rate && ctx.a.rate < 1 ? ctx.a.rate : ctx.opts.incomeRate;
        const amt = firstNum(ctx.a['税额']) || r2(Math.max(0, profit) * rate);
        return [E(ctx, '计提企业所得税', [
          d('6801', amt, `${fmt(profit)} × ${(rate * 100).toFixed(0)}% = ${fmt(amt)} 元`, '按应纳税所得额计算当期所得税'),
          c('222103', amt, `应交所得税 ${fmt(amt)} 元`, '尚未缴纳，形成负债')
        ], explain(
          `所得税费用按"应纳税所得额"计算，不是按会计利润直接乘税率（存在纳税调整）。`,
          [['业务实质', '按税法计算的当期税负'], ['科目选择', '借"所得税费用"，贷"应交税费—应交所得税"'], ['金额', `${fmt(profit)} × ${(rate * 100).toFixed(0)}% = ${fmt(amt)} 元`], ['方向', '费用增加记借方；负债增加记贷方']],
          ['亏损时不确认应交所得税，但可能确认递延所得税资产。',
            '所得税费用 = 当期所得税 + 递延所得税。'],
          '《企业会计准则第18号——所得税》'
        ))];
      }
    },

    /* ---------- 结转收入 ---------- */
    {
      id: 'closing-revenue',
      title: '结转收入类科目',
      scene: '期末',
      test(t) {
        return /(结转)/.test(t) && /(收入|收益)/.test(t) && /(本年利润|损益)/.test(t) ||
          /(结转.{0,4}收入)/.test(t);
      },
      build(ctx) {
        const total = ctx.bal ? r2(ctx.bal('6001') + ctx.bal('6051') + ctx.bal('6111') + ctx.bal('6101') + ctx.bal('6301') + ctx.bal('6115')) : 0;
        const lines = [];
        ['6001', '6051', '6111', '6101', '6301', '6115'].forEach((code) => {
          const b = ctx.bal ? ctx.bal(code) : 0;
          if (Math.abs(b) > 0.005) lines.push(d(code, b, `${ACC[code].name} 余额 ${fmt(b)} 元`, '收入类账户期末结平'));
        });
        lines.push(c('4103', total, `本期收入合计 ${fmt(total)} 元转入本年利润`, '收入类账户期末无余额'));
        return [E(ctx, '结转本期收入至本年利润', lines, explain(
          `期末把收入类账户的余额全部转入"本年利润"，收入账户随之结平。这是"账结法"下计算利润的第一步。`,
          [['业务实质', '收入类账户清零，汇总到利润账户'], ['科目选择', '借"主营业务收入"等，贷"本年利润"'], ['金额', `收入合计 ${fmt(total)} 元`], ['方向', '收入减少记借方；本年利润增加记贷方']],
          ['结转后收入类账户应无余额；若还有余额说明漏结。',
            '实务中也可用"表结法"（不结转，直接编利润表），但考试多用账结法。'],
          '《企业会计准则第30号——财务报表列报》'
        ))];
      }
    },

    /* ---------- 结转成本费用 ---------- */
    {
      id: 'closing-expense',
      title: '结转成本费用类科目',
      scene: '期末',
      test(t) {
        return /(结转)/.test(t) && /(成本|费用|支出|损失)/.test(t) && /(本年利润|损益)/.test(t);
      },
      build(ctx) {
        const codes = ['6401', '6402', '6403', '6601', '6602', '6603', '6701', '6702', '6711', '6801'];
        const lines = [];
        let total = 0;
        codes.forEach((code) => {
          const b = ctx.bal ? ctx.bal(code) : 0;
          if (Math.abs(b) > 0.005) { lines.push(c(code, b, `${ACC[code].name} 余额 ${fmt(b)} 元`, '费用类账户期末结平')); total = r2(total + b); }
        });
        lines.unshift(d('4103', total, `本期成本费用合计 ${fmt(total)} 元`, '费用类账户期末无余额'));
        return [E(ctx, '结转本期成本费用至本年利润', lines, explain(
          `把成本、费用、税金及附加、减值损失、所得税费用等全部转入"本年利润"借方，与收入配比，算出净利润。`,
          [['业务实质', '费用类账户清零，汇总到利润账户'], ['科目选择', '借"本年利润"，贷"主营业务成本"等'], ['金额', `合计 ${fmt(total)} 元`], ['方向', '费用减少记贷方；本年利润减少记借方']],
          ['成本费用类账户结转后应无余额。',
            '"本年利润"借贷相抵后的贷方余额才是净利润。'],
          '《企业会计准则第30号——财务报表列报》'
        ))];
      }
    },

    /* ---------- 结转本年利润 ---------- */
    {
      id: 'closing-profit',
      title: '结转本年利润',
      scene: '期末',
      test(t) {
        return /(结转)/.test(t) && /本年利润/.test(t) && !/(收入|费用|成本)/.test(t);
      },
      build(ctx) {
        const b = ctx.bal ? ctx.bal('4103') : firstNum(ctx.a.amount, ctx.a.price) || 0;
        const profit = b;
        const lines = profit >= 0
          ? [d('4103', Math.abs(profit), `本年利润贷方余额 ${fmt(Math.abs(profit))} 元`, '全年净利润转出'), c('410401', Math.abs(profit), `转入未分配利润 ${fmt(Math.abs(profit))} 元`, '留存收益增加')]
          : [d('410401', Math.abs(profit), `本年亏损 ${fmt(Math.abs(profit))} 元`, '结转亏损'), c('4103', Math.abs(profit), `结平本年利润 ${fmt(Math.abs(profit))} 元`, '亏损由未分配利润弥补')];
        return [E(ctx, '年末结转本年利润', lines, explain(
          `年末把"本年利润"的全年累计余额转入"利润分配—未分配利润"，结转后"本年利润"账户无余额，新的一年重新归集。`,
          [['业务实质', '净利润（或亏损）转入留存收益'], ['科目选择', profit >= 0 ? '借"本年利润"，贷"利润分配—未分配利润"' : '借"利润分配—未分配利润"，贷"本年利润"'], ['金额', `${profit >= 0 ? '净利润' : '净亏损'} ${fmt(Math.abs(profit))} 元`], ['方向', '本年利润结平']],
          ['"本年利润"年末必须结平；"利润分配—未分配利润"可以有余额，逐年累积。'],
          '《企业会计准则第30号——财务报表列报》'
        ))];
      }
    },

    /* ---------- 提取盈余公积 / 分配股利 ---------- */
    {
      id: 'profit-distribute',
      title: '提取盈余公积/分配股利',
      scene: '期末',
      test(t) {
        return /(提取|宣告|分配|发放)/.test(t) && /(盈余公积|股利|利润分配)/.test(t);
      },
      build(ctx) {
        const text = ctx.text;
        const isDividend = /(股利|利润)/.test(text) && !/盈余公积/.test(text);
        const rateM = text.match(/(\d{1,2}(?:\.\d+)?)\s*[%％]/);
        let base = firstNum(ctx.a['净利润'], ctx.a['利润'], ctx.a['未分配利润']);
        if (base === null && ctx.bal) base = Math.max(0, ctx.bal('410401') + ctx.bal('4103'));
        const amt = firstNum(ctx.a.amount, ctx.a.price) || (rateM && base !== null ? r2(base * Number(rateM[1]) / 100) : 0);
        if (isDividend) {
          return [E(ctx, '宣告分配现金股利', [
            d('410403', amt, `宣告分配 ${fmt(amt)} 元`, '利润分配的明细去向'),
            c('2232', amt, `应付股利 ${fmt(amt)} 元`, '形成对股东的负债')
          ], explain(
            `宣告分派现金股利：未分配利润减少，同时确认对股东的负债。注意"宣告"和"支付"是两个时点。`,
            [['业务实质', '净利润分配给股东'], ['科目选择', '借"利润分配—应付现金股利"，贷"应付股利"'], ['金额', `${fmt(amt)} 元`], ['方向', '所有者权益减少记借方；负债增加记贷方']],
            ['宣告但未支付时，资产负债表上仍要列"应付股利"负债。',
              '支付时：借"应付股利"，贷"银行存款"。'],
            '《企业会计准则第30号——财务报表列报》'
          ))];
        }
        return [E(ctx, '提取法定盈余公积', [
          d('410402', amt, `按净利润的 ${rateM ? rateM[1] : '10'}% 提取 ${fmt(amt)} 元`, '利润分配的明细去向'),
          c('410101', amt, `法定盈余公积增加 ${fmt(amt)} 元`, '留存收益内部结构变化')
        ], explain(
          `提取盈余公积是"留存收益内部搬家"：未分配利润减少，盈余公积增加，所有者权益总额不变。`,
          [['业务实质', '净利润留在企业，转为法定积累'], ['科目选择', '借"利润分配—提取法定盈余公积"，贷"盈余公积—法定盈余公积"'], ['金额', `净利润 × 10% = ${fmt(amt)} 元`], ['方向', '利润分配减少记借方；盈余公积增加记贷方']],
          ['法定盈余公积按净利润的 10% 提取，累计达到注册资本 50% 时可不再提取。',
            '提取盈余公积不影响所有者权益总额。'],
          '《公司法》第一百六十六条'
        ))];
      }
    },

    /* ---------- 缴纳税费 ---------- */
    {
      id: 'pay-tax',
      title: '缴纳税费',
      scene: '期末',
      test(t) {
        return /(缴纳|交纳|缴税|上缴)/.test(t) && /(税|费)/.test(t) && !/(增值税)/.test(t);
      },
      build(ctx) {
        const amt = firstNum(ctx.a.amount, ctx.a.price, ctx.a.total) || 0;
        const isIncomeTax = /(所得税)/.test(ctx.text);
        const isSurcharge = /(城建税|附加)/.test(ctx.text);
        const code = isIncomeTax ? '222103' : isSurcharge ? '222104' : '222102';
        return [E(ctx, `缴纳${isIncomeTax ? '企业所得税' : isSurcharge ? '附加税费' : '增值税'}`, [
          d(code, amt, `冲减应交税费 ${fmt(amt)} 元`, '清偿税款负债'),
          c('1002', amt, `银行划款 ${fmt(amt)} 元`, '银行存款减少')
        ], explain(
          `缴税：负债减少、银行存款减少，不影响当期损益（费用在计提时已确认）。`,
          [['业务实质', '清偿税款负债'], ['科目选择', `借"${ACC[code].name}"，贷"银行存款"`], ['金额', `实缴 ${fmt(amt)} 元`], ['方向', '负债减少记借方；资产减少记贷方']],
          ['如果此前没有计提就直接缴纳，要先补计提，否则费用会漏记。'],
          '《企业会计准则第30号——财务报表列报》'
        ))];
      }
    }
  ];

  root.RULE_GROUPS_PERIOD = rules;
})(typeof globalThis !== 'undefined' ? globalThis : this);
