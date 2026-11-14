/* ============================================================
 * rules/fund.js —— 筹资与投资：投入资本、借款、利息、还本
 * ============================================================ */
(function (root) {
  'use strict';
  const { d, c, E, explain, firstNum } = root.RH;
  const fmt = root.fmt;

  const rules = [
    /* ---------- 接受非货币资产投资 ---------- */
    {
      id: 'invest-asset',
      title: '接受设备/无形资产投资',
      scene: '筹资',
      test(t) {
        return /(投入|投资|出资|增资)/.test(t) &&
          /(设备|机器|生产线|厂房|汽车|办公楼|专利|商标|土地|软件|无形资产|固定资产)/.test(t) &&
          !/(借款|利息)/.test(t);
      },
      build(ctx) {
        const total = firstNum(ctx.a.total, ctx.a.amount, ctx.a.price) || 0;
        const vat = firstNum(ctx.a.vat, ctx.a.total !== null && ctx.a.price !== null ? ctx.a.total - ctx.a.price : null) || 0;
        const isFixed = /(设备|机器|生产线|厂房|汽车|办公楼|固定资产)/.test(ctx.text);
        const code = isFixed ? '1601' : '1701';
        const label = isFixed ? '固定资产' : '无形资产';
        const val = firstNum(ctx.a.price, total - vat) || 0;
        const lines = [d(code, val, `投资合同/评估作价 ${fmt(val)} 元`, '投资转入资产按合同或协议约定的价值入账（公允价值）')];
        if (vat > 0) lines.push(d('22210101', vat, `随设备转入的增值税 ${fmt(vat)} 元，取得专票可抵扣`, '投资转入的货物视同销售，可凭专票抵扣进项税'));
        lines.push(c('4001', total, `资产作价与税额合计 ${fmt(total)} 元`));
        return [E(ctx, `接受${label}投资`, lines, explain(
          `投资方以${label}出资：企业取得${label}，同时增加所有者权益（实收资本）。资产按投资合同或协议约定的价值入账，不按"账面原值"。`,
          [['业务实质', `非货币资产出资，属于"投资"而非"购买"，不确认收入，也不产生应付账款`],
          ['科目选择', `取得${label}记"${label}"；投资方享有的注册资本份额记"实收资本"`],
          ['金额', `按合同/评估作价 ${fmt(val)} 元 + 可抵扣进项 ${fmt(vat)} 元 = ${fmt(total)} 元`],
          ['方向', '资产增加记借方；所有者权益增加记贷方']],
          ['非货币资产投资要视同销售处理增值税，别忘了进项税这一行（取得专票时）。',
            '如果协议价明显不公允，应按公允价值调整。'],
          '《企业会计准则第4号——固定资产》《公司法》关于非货币出资的规定'
        ))];
      }
    },

    /* ---------- 接受货币资金投资 ---------- */
    {
      id: 'invest-cash',
      title: '接受货币资金投资',
      scene: '筹资',
      test(t) {
        return /(投入|投资|出资|增资|募股|发行股票|实收资本|股本)/.test(t) &&
          !/(设备|机器|厂房|汽车|专利|商标|土地|软件|无形资产|固定资产|借款|利息|股利|其他债权投资|债权投资|交易性金融资产|长期股权投资|其他权益工具投资|购入|购买|取得)/.test(t);
      },
      build(ctx) {
        const amt = firstNum(ctx.a.amount, ctx.a.price, ctx.a.total) || 0;
        const share = firstNum(ctx.a.share, ctx.a['实收资本'], ctx.a['注册资本']);
        const paidIn = share !== null ? Math.min(share, amt) : amt;
        const premium = root.round2(amt - paidIn);
        const lines = [d('1002', amt, `实际收到投资款 ${fmt(amt)} 元`, '按实际收到的金额入账')];
        lines.push(c('4001', paidIn, share !== null ? `占注册资本份额 ${fmt(paidIn)} 元` : `全额计入实收资本 ${fmt(paidIn)} 元`));
        if (premium > 0.005) {
          lines.push(c('400201', premium, `${fmt(amt)} − ${fmt(paidIn)} = ${fmt(premium)} 元`, '超过注册资本份额的部分属于资本溢价，不是利润'));
        }
        const hasPremium = premium > 0.005;
        return [E(ctx, hasPremium ? '收到投资款（含资本溢价）' : '收到投资款', lines, explain(
          `投资者投入货币资金。关键判断：这笔钱里有多少是"注册资本份额"，有多少是"溢价"。前者进实收资本，后者进资本公积——两者都不进利润表。`,
          [['业务实质', '企业收到股东投入的现金，资产与所有者权益同时增加'],
          ['科目选择', '银行存款 ↑；实收资本 ↑；超出份额的部分记"资本公积—资本溢价"'],
          ['金额', hasPremium ? `${fmt(amt)} = 实收资本 ${fmt(paidIn)} + 资本公积 ${fmt(premium)}` : `全额 ${fmt(amt)} 元计入实收资本（题目未给出份额与溢价）`],
          ['方向', '资产增加记借方；所有者权益增加记贷方']],
          ['资本溢价不是"营业外收入"，不进利润表，也不交企业所得税。',
            '若题目只给"投资款"未提份额，通常全额计入实收资本。'],
          '《企业会计准则第37号——金融工具列报》《公司法》'
        ))];
      }
    },

    /* ---------- 取得借款 ---------- */
    {
      id: 'loan-in',
      title: '取得银行借款',
      scene: '筹资',
      test(t) {
        return /(借入|取得.{0,6}借款|向.{0,8}借|贷款|借款)/.test(t) &&
          !/(利息|还本|归还|偿还|支付|计提)/.test(t);
      },
      build(ctx) {
        const amt = firstNum(ctx.a.amount, ctx.a.price, ctx.a.total) || 0;
        const isLong = /(长期|三年|五年|2年|3年|5年|两年|三年|五年)/.test(ctx.text);
        const code = isLong ? '2501' : '2001';
        const nm = root.acctName(code);
        return [E(ctx, `取得${nm}`, [
          d('1002', amt, `借款到账 ${fmt(amt)} 元`, '按实际到账金额入账'),
          c(code, amt, `本金 ${fmt(amt)} 元`, isLong ? '期限超过 1 年，属于非流动负债' : '期限在 1 年以内（含），属于流动负债')
        ], explain(
          `向银行借入资金：银行存款增加，同时承担偿还义务。判断短/长期看"借款期限"，不看金额大小。`,
          [['业务实质', '借钱：资产增加 + 负债增加，所有者权益不变'],
          ['科目选择', `期限 ≤ 1 年记"短期借款"；> 1 年记"长期借款"`],
          ['金额', `按实际到账本金 ${fmt(amt)} 元入账，手续费另计`],
          ['方向', '资产增加记借方；负债增加记贷方']],
          ['借款手续费应计入"财务费用"（或按实际利率法调整），不要塞进本金。',
            '短期借款的利息通常按月计提、按季支付，不要直接冲减本金。'],
          '《企业会计准则第22号——金融工具确认和计量》'
        ))];
      }
    },

    /* ---------- 计提借款利息 ---------- */
    {
      id: 'loan-interest-accrue',
      title: '计提借款利息',
      scene: '筹资',
      test(t) {
        return /利息/.test(t) && /(计提|预提|尚未支付|未付|计入当期|应付)/.test(t) && !/(支付|收到|存入)/.test(t);
      },
      build(ctx) {
        const amt = firstNum(ctx.a.amount, ctx.a.price, ctx.a.total, ctx.a.interest) || 0;
        const isLong = /(长期借款|资本化|在建工程)/.test(ctx.text);
        const drCode = isLong && /(资本化|在建工程)/.test(ctx.text) ? '1604' : '6603';
        const drName = root.acctName(drCode);
        return [E(ctx, '计提借款利息', [
          d(drCode, amt, `本金 × 年利率 × 占用月数/12 = ${fmt(amt)} 元`, drCode === '1604' ? '符合资本化条件的利息计入在建工程成本' : '借款利息属于筹资费用，计入财务费用'),
          c('2231', amt, `尚未支付，形成对银行的短期债务 ${fmt(amt)} 元`, '权责发生制：利息已发生，即使未付也要确认')
        ], explain(
          `权责发生制下，利息"发生了"就要记账，与银行是否已扣款无关。计提时先挂"应付利息"，实际支付时再冲减。`,
          [['业务实质', '利息费用已经发生，但尚未支付 → 费用 + 负债同时增加'],
          ['科目选择', '费用化利息记"财务费用"；建造期间可资本化的记"在建工程"；对方科目是"应付利息"'],
          ['金额', '本金 × 年利率 ÷ 12 × 占用月数（题目直接给利息时按给定金额）'],
          ['方向', '费用增加记借方；负债增加记贷方']],
          ['不要直接贷记"银行存款"——钱还没付。直接贷记银行存款是收付实现制的思维。',
            '长期借款利息若发生在资产达到预定可使用状态前，才可能资本化。'],
          '《企业会计准则第17号——借款费用》'
        ))];
      }
    },

    /* ---------- 支付借款利息 ---------- */
    {
      id: 'loan-interest-pay',
      title: '支付借款利息',
      scene: '筹资',
      test(t) {
        return /(支付|付|扣收)/.test(t) && /利息/.test(t) && !/(计提|预提)/.test(t);
      },
      build(ctx) {
        const amt = firstNum(ctx.a.amount, ctx.a.price, ctx.a.total, ctx.a.interest) || 0;
        return [E(ctx, '支付借款利息', [
          d('2231', amt, `冲减已计提的应付利息 ${fmt(amt)} 元`, '支付前期已计提的利息，冲减负债'),
          c('1002', amt, `银行划扣 ${fmt(amt)} 元`, '银行存款减少')
        ], explain(
          `支付"已经计提过"的利息：只是负债减少、银行存款减少，不再影响当期费用（费用在计提当期已确认）。`,
          [['业务实质', '用现金偿还一项已确认的负债，费用不再增加'],
          ['科目选择', '借"应付利息"，贷"银行存款"'],
          ['金额', `实际支付 ${fmt(amt)} 元`],
          ['方向', '负债减少记借方；资产减少记贷方']],
          ['若此前没有计提，支付时应直接借"财务费用"；本题若为跨期支付，注意别重复确认费用。',
            '银行扣收的手续费单独计入财务费用。'],
          '《企业会计准则第22号——金融工具确认和计量》'
        ))];
      }
    },

    /* ---------- 归还借款本金 ---------- */
    {
      id: 'loan-repay',
      title: '归还借款本金',
      scene: '筹资',
      test(t) {
        return /(归还|偿还|到期|还本)/.test(t) && /(借款|本金|贷款)/.test(t);
      },
      build(ctx) {
        const amt = firstNum(ctx.a.amount, ctx.a.price, ctx.a.total, ctx.a['本金']) || 0;
        const isLong = /(长期借款|长期)/.test(ctx.text);
        const code = isLong ? '2501' : '2001';
        return [E(ctx, `归还${root.acctName(code)}本金`, [
          d(code, amt, `冲减借款本金 ${fmt(amt)} 元`, '偿还本金，负债减少'),
          c('1002', amt, `银行划出 ${fmt(amt)} 元`, '资产减少')
        ], explain(
          `还本：负债与资产同减，不影响利润。利息与本金要分开处理，不要合并成一笔。`,
          [['业务实质', '清偿本金义务'],
          ['科目选择', `借"${root.acctName(code)}"，贷"银行存款"`],
          ['金额', `本金 ${fmt(amt)} 元（不含利息）`],
          ['方向', '负债减少记借方；资产减少记贷方']],
          ['"还本付息"题要拆成两笔：本金冲负债，利息看是否已计提。',
            '提前还款的违约金计入"营业外支出"或"财务费用"。'],
          '《企业会计准则第22号——金融工具确认和计量》'
        ))];
      }
    }
  ];

  root.RULE_GROUPS_FUND = rules;
})(typeof globalThis !== 'undefined' ? globalThis : this);
