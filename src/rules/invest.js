/* ============================================================
 * rules/invest.js —— 金融资产与固定资产处置
 * ============================================================ */
(function (root) {
  'use strict';
  const { d, c, E, explain, firstNum } = root.RH;
  const fmt = root.fmt;
  const r2 = root.round2;

  const rules = [
    /* ---------- 交易性金融资产 ---------- */
    {
      id: 'trading-asset',
      title: '交易性金融资产',
      scene: '投资',
      test(t) {
        return /(交易性金融资产|股票|债券|基金|证券)/.test(t) && !/(发行|回购|股本)/.test(t);
      },
      build(ctx) {
        const price = firstNum(ctx.a.price, ctx.a.amount) || 0;
        const fee = firstNum(ctx.a.fee) || 0;
        const text = ctx.text;

        // 1) 处置
        if (/(出售|处置|转让|卖出)/.test(text)) {
          const sell = firstNum(ctx.a['售价'], ctx.a.price, ctx.a.total, ctx.a.amount) || 0;
          const cost = ctx.bal('110101') > 0 ? ctx.bal('110101') : firstNum(ctx.a['成本'], ctx.a.price) || 0;
          const fv = ctx.bal('110102');
          const book = r2(cost + fv);
          const gain = r2(sell - book);
          const lines = [
            d('1002', sell, `出售所得 ${fmt(sell)} 元`, '实际收到款项'),
            c('110101', cost, `转销成本 ${fmt(cost)} 元`, '终止确认'),
            fv !== 0 ? (fv > 0 ? c('110102', fv, `转销累计公允价值变动 ${fmt(fv)} 元`, '持有期间形成的浮盈一并转销') : d('110102', -fv, `转销累计公允价值变动 ${fmt(-fv)} 元`, '持有期间形成的浮亏一并转销')) : null,
            gain >= 0 ? c('6111', gain, `处置收益 ${fmt(gain)} 元`, '售价 − 账面价值') : d('6111', -gain, `处置损失 ${fmt(-gain)} 元`, '售价 < 账面价值')
          ].filter(Boolean);
          return [E(ctx, '出售交易性金融资产', lines, explain(
            `处置时把"交易性金融资产"的明细全部转销，售价与账面价值的差额进"投资收益"；原计入公允价值变动损益的金额不再另做结转。`,
            [['业务实质', '出售投资，终止确认金融资产'],
            ['科目选择', '借"银行存款"，贷"交易性金融资产—成本/公允价值变动"、"投资收益"'],
            ['金额', `售价 ${fmt(sell)} − 账面价值 ${fmt(r2(cost + fv))} = 投资收益 ${fmt(gain)} 元`],
            ['方向', '资产增加记借方；资产减少记贷方；收益记贷方']],
            ['交易费用在取得时计入投资收益（借方），不计入成本。',
              '公允价值变动损益在处置时不再转入投资收益（新准则）。'],
            '《企业会计准则第22号——金融工具确认和计量》'
          ))];
        }

        // 2) 公允价值变动
        if (/(公允价值|上涨|下跌|涨到|跌到|升值|贬值)/.test(text) && !/(购入|取得|购买|作为交易性)/.test(text)) {
          const book = r2(ctx.bal('110101') + ctx.bal('110102'));
          const target = firstNum(ctx.a['公允价值'], ctx.a.price, ctx.a.total, ctx.a.amount);
          const diff = target !== null ? r2(target - book) : 0;
          const up = diff >= 0;
          const abs = Math.abs(diff);
          const lines = up
            ? [d('110102', abs, `账面 ${fmt(book)} → 公允 ${fmt(target)}，调增 ${fmt(abs)} 元`, '调增账面价值'), c('6101', abs, `公允价值变动收益 ${fmt(abs)} 元`, '未实现收益，计入当期损益')]
            : [d('6101', abs, `公允价值变动损失 ${fmt(abs)} 元`, '未实现损失，计入当期损益'), c('110102', abs, `账面 ${fmt(book)} → 公允 ${fmt(target)}，调减 ${fmt(abs)} 元`, '调减账面价值')];
          return [E(ctx, '交易性金融资产公允价值变动', lines, explain(
            `资产负债表日按公允价值调整账面价值，差额计入"公允价值变动损益"——这是"未实现"的盈亏，资产还没卖。`,
            [['业务实质', '按公允价值计量，账面价值随市价调整'],
            ['科目选择', up ? '借"交易性金融资产—公允价值变动"，贷"公允价值变动损益"' : '借"公允价值变动损益"，贷"交易性金融资产—公允价值变动"'],
            ['金额', `公允价值变动差额 ${fmt(diff)} 元`],
            ['方向', '资产增加记借方；收益记贷方（下跌时相反）']],
            ['公允价值变动损益是"未实现"的，处置时才最终落袋。',
              '不要把它和"投资收益"混用。'],
            '《企业会计准则第22号——金融工具确认和计量》'
          ))];
        }

        // 3) 取得
        const total = r2(price + fee);
        const lines = [d('110101', price, `公允价值 ${fmt(price)} 元`, '按取得时的公允价值计量，不含交易费用')];
        if (fee > 0) lines.push(d('6111', fee, `交易费用 ${fmt(fee)} 元`, '交易费用直接计入当期损益，不进成本'));
        lines.push(c('1002', total, `实际支付 ${fmt(total)} 元`, '银行存款减少'));
        return [E(ctx, '购入交易性金融资产', lines, explain(
          `取得交易性金融资产：成本按"公允价值"记，另付的交易费用（佣金、手续费）直接进"投资收益"借方，不计入资产成本。`,
          [['业务实质', '买入以短期获利为目的的金融资产'],
          ['科目选择', '借"交易性金融资产—成本"、"投资收益"；贷"银行存款"'],
          ['金额', `成本 ${fmt(price)} 元 + 交易费用 ${fmt(fee)} 元 = 付款 ${fmt(total)} 元`],
          ['方向', '资产增加记借方；费用（投资收益借方）增加']],
          ['交易费用计入成本是常见错误——交易性金融资产的交易费用进"投资收益"。',
            '已宣告但尚未发放的现金股利，应单独记"应收股利"，不计入成本。'],
          '《企业会计准则第22号——金融工具确认和计量》'
        ))];
      }
    },

    /* ---------- 固定资产处置 ---------- */
    {
      id: 'fixed-disposal',
      title: '固定资产处置',
      scene: '投资',
      test(t) {
        return /(处置|出售|报废|清理|转让)/.test(t) && /(固定资产|设备|机器|汽车|厂房|办公楼|生产线)/.test(t);
      },
      build(ctx) {
        const text = ctx.text;
        const toks = root.extractAmounts(text);
        const byLabel = (re) => { const t = toks.find((x) => re.test(x.label)); return t ? t.value : null; };
        const orig = firstNum(byLabel(/原值|原价|成本/), ctx.a.original) || 0;
        const dep = firstNum(byLabel(/折旧|累计折旧/), 0) || 0;
        const sell = firstNum(byLabel(/售价|价款|收入/), ctx.a.price) || 0;
        const net = r2(orig - dep);

        // 一句话给出原值+折旧+售价 → 自动生成完整三步
        if (orig > 0 && sell > 0) {
          const inclTax = !/不含税/.test(text);
          const exVat = inclTax ? r2(sell / 1.13) : sell;
          const vat = inclTax ? r2(sell - exVat) : r2(sell * 0.13);
          const cash = inclTax ? sell : r2(sell + vat);
          const gain = r2(exVat - net);
          return [
            E(ctx, '① 固定资产转入清理', [
              d('1606', net, `原值 ${fmt(orig)} − 累计折旧 ${fmt(dep)} = 净值 ${fmt(net)} 元`, '清理账户按净值转入'),
              d('1602', dep, `转销累计折旧 ${fmt(dep)} 元`, '备抵账户一并转销'),
              c('1601', orig, `转销固定资产原值 ${fmt(orig)} 元`, '资产退出账内')
            ], explain(
              `处置第一步：把固定资产的"原值"和"累计折旧"一起转销，差额（净值）进入"固定资产清理"这个过渡账户。`,
              [['业务实质', '资产退出使用，转入清理'], ['科目选择', '借"固定资产清理"、"累计折旧"；贷"固定资产"'],
              ['金额', `净值 ${fmt(net)} = 原值 ${fmt(orig)} − 折旧 ${fmt(dep)}`], ['方向', '资产减少记贷方；过渡账户记借方']],
              ['"固定资产清理"是过渡账户，最终必须结平，不能留余额。'],
              '《企业会计准则第4号——固定资产》')),
            E(ctx, '② 收到处置价款', [
              d('1002', cash, `收到价款 ${fmt(cash)} 元`, '银行存款增加'),
              c('1606', exVat, `不含税处置收入 ${fmt(exVat)} 元`, '清理收入（不含增值税）'),
              vat > 0 ? c('22210102', vat, `销项税额 ${fmt(vat)} 元`, '处置固定资产按适用税率计缴增值税（简化按 13% 价税分离）') : null
            ].filter(Boolean), explain(
              `处置收入先冲"固定资产清理"，同时确认增值税销项。**计入清理账户的是不含税收入**。`,
              [['业务实质', '清理过程中的收入'], ['科目选择', '借"银行存款"，贷"固定资产清理"、"应交税费—销项税额"'],
              ['金额', `含税价款 ${fmt(cash)} → 不含税 ${fmt(exVat)} + 销项税 ${fmt(vat)}`], ['方向', '资产增加记借方；过渡账户贷方']],
              ['售价含税时要做价税分离，别把含税额全记清理收入。'],
              '《企业会计准则第4号——固定资产》')),
            E(ctx, '③ 结转清理净损益', [
              gain >= 0 ? d('1606', Math.abs(gain), `清理账户余额 ${fmt(Math.abs(gain))} 元`, '结平过渡账户') : c('1606', Math.abs(gain), `清理账户余额 ${fmt(Math.abs(gain))} 元`, '结平过渡账户'),
              gain >= 0 ? c('6115', Math.abs(gain), `处置净收益 ${fmt(Math.abs(gain))} 元`, '处置收入高于净值') : d('6115', Math.abs(gain), `处置净损失 ${fmt(Math.abs(gain))} 元`, '处置收入低于净值')
            ], explain(
              `最后一步把"固定资产清理"结平：不含税收入大于净值是处置收益，反之是处置损失，计入"资产处置损益"。`,
              [['业务实质', '清理完成，确认处置损益'], ['科目选择', gain >= 0 ? '借"固定资产清理"，贷"资产处置损益"' : '借"资产处置损益"，贷"固定资产清理"'],
              ['金额', `净${gain >= 0 ? '收益' : '损失'} ${fmt(Math.abs(gain))} 元 = 不含税售价 ${fmt(exVat)} − 净值 ${fmt(net)}`], ['方向', '收益记贷方，损失记借方']],
              ['处置净损益进"资产处置损益"，不是"营业外收支"（报废毁损才进营业外）。'],
              '《企业会计准则第4号——固定资产》'))
          ];
        }

        // 分步：转入清理
        if (/(转入清理|转入固定资产清理|开始清理)/.test(text)) {
          const val = net || firstNum(ctx.a.amount, ctx.a.price) || 0;
          return [E(ctx, '固定资产转入清理', [
            d('1606', val, `净值 ${fmt(val)} 元`, '按账面净值转入清理'),
            d('1602', dep, `累计折旧 ${fmt(dep)} 元`, '转销备抵'),
            c('1601', orig || r2(val + dep), `原值 ${fmt(orig || r2(val + dep))} 元`, '资产退出账内')
          ], explain('处置开始时，把固定资产原值、累计折旧转销，净值进入"固定资产清理"过渡账户。',
            [['业务实质', '资产转入清理'], ['科目选择', '借"固定资产清理"、"累计折旧"；贷"固定资产"'], ['金额', `净值 ${fmt(val)} 元`], ['方向', '资产减少记贷方']],
            ['别忘了累计折旧要一起转销。'], '《企业会计准则第4号——固定资产》'))];
        }

        // 分步：收到价款
        if (/(收到|取得)/.test(text) && /(价款|款项|残值|变卖)/.test(text)) {
          const amt = firstNum(ctx.a.amount, ctx.a.price, ctx.a.total) || 0;
          const inclTax = !/不含税/.test(text);
          const exVat = inclTax ? r2(amt / 1.13) : amt;
          const vat = inclTax ? r2(amt - exVat) : r2(amt * 0.13);
          return [E(ctx, '收到固定资产处置价款', [
            d('1002', inclTax ? amt : r2(amt + vat), `收到 ${fmt(inclTax ? amt : r2(amt + vat))} 元`, '银行存款增加'),
            c('1606', exVat, `不含税收入 ${fmt(exVat)} 元`, '清理收入（不含税）'),
            vat > 0 ? c('22210102', vat, `销项税额 ${fmt(vat)} 元`, '按13%价税分离') : null
          ].filter(Boolean), explain('处置收入冲减"固定资产清理"，同时确认销项税。',
            [['业务实质', '清理收入'], ['科目选择', '借"银行存款"，贷"固定资产清理"、"应交税费"'], ['金额', `不含税 ${fmt(exVat)} 元`], ['方向', '资产增加记借方']],
            ['含税价要价税分离。'], '《企业会计准则第4号——固定资产》'))];
        }

        // 分步：结转净损益
        const amt = firstNum(ctx.a.amount, ctx.a.price, ctx.a.total) || 0;
        const loss = /(净损失|损失)/.test(text);
        return [E(ctx, '结转固定资产清理净损益', [
          loss ? d('6115', amt, `净损失 ${fmt(amt)} 元`, '清理支出大于收入') : d('1606', amt, `结平清理账户 ${fmt(amt)} 元`, '清理完成'),
          loss ? c('1606', amt, `结平清理账户 ${fmt(amt)} 元`, '过渡账户清零') : c('6115', amt, `净收益 ${fmt(amt)} 元`, '清理收入大于支出')
        ], explain('最后把"固定资产清理"结平，差额转入"资产处置损益"。',
          [['业务实质', '确认处置损益'], ['科目选择', loss ? '借"资产处置损益"，贷"固定资产清理"' : '借"固定资产清理"，贷"资产处置损益"'], ['金额', `${fmt(amt)} 元`], ['方向', '损失记借方，收益记贷方']],
          ['"固定资产清理"期末不应有余额。'], '《企业会计准则第4号——固定资产》'))];
      }
    }
  ];

  root.RULE_GROUPS_INVEST = rules;
})(typeof globalThis !== 'undefined' ? globalThis : this);
