/* ============================================================
 * rules/produce.js —— 生产：领料、薪酬、社保、折旧、制造费用、完工、跌价
 * ============================================================ */
(function (root) {
  'use strict';
  const { d, c, E, explain, firstNum } = root.RH;
  const fmt = root.fmt;
  const r2 = root.round2;

  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  /* 按关键词把一段文字里的多个金额拆到不同科目
   * buckets: [{code, label, kws:[...]}]
   * 返回 [{code,label,amount,numPos}]，按金额出现位置去重
   */
  function splitByKeywords(text, buckets, fallbackCode) {
    const hits = [];
    buckets.forEach((b) => {
      b.kws.forEach((kw) => {
        const re = new RegExp(esc(kw) + '[^。；]{0,18}?(\\d[\\d,，]*(?:\\.\\d+)?)\\s*(万元|元)?', 'g');
        let m;
        while ((m = re.exec(text))) {
          let v = Number(m[1].replace(/[,，]/g, ''));
          if (m[2] === '万元') v *= 10000;
          const numPos = m.index + m[0].lastIndexOf(m[1]);
          hits.push({ code: b.code, label: b.label, amount: r2(v), numPos });
        }
      });
      // 反向语序："10000元为车间设备折旧"
      const re2 = new RegExp('(\\d[\\d,，]*(?:\\.\\d+)?)\\s*(万元|元)?\\s*(?:为|系|属于|是)\\s*[^。；]{0,6}?' + esc(b.kws[0]), 'g');
      let m2;
      while ((m2 = re2.exec(text))) {
        let v = Number(m2[1].replace(/[,，]/g, ''));
        if (m2[2] === '万元') v *= 10000;
        hits.push({ code: b.code, label: b.label, amount: r2(v), numPos: m2.index });
      }
    });
    hits.sort((a, b) => a.numPos - b.numPos);
    const seen = new Set(), out = [];
    hits.forEach((h) => {
      const key = Math.round(h.amount * 100) + '@' + h.numPos;
      if (seen.has(key)) return;
      seen.add(key);
      out.push(h);
    });
    if (!out.length) return [];
    // 同一个数字只归入一个科目
    const used = new Map();
    const final = [];
    out.forEach((h) => {
      const k = Math.round(h.amount * 100);
      if (used.has(k)) return;
      used.set(k, true);
      final.push(h);
    });
    return final;
  }

  const rules = [
    /* ---------- 领用材料 ---------- */
    {
      id: 'material-issue',
      title: '领用原材料',
      scene: '生产',
      test(t) {
        return /(领用|发出|耗用|投入生产|生产领用)/.test(t) && /(材料|原材料|物资)/.test(t) &&
          !/(销售|售出|委托加工|在建工程|福利)/.test(t);
      },
      build(ctx) {
        const broken = splitByKeywords(ctx.text, [
          { code: '5101', label: '车间一般耗用', kws: ['车间一般耗用', '车间管理', '一般耗用', '车间耗用'] },
          { code: '500101', label: '产品生产耗用', kws: ['产品耗用', '直接材料', 'A产品', 'B产品', '甲产品', '乙产品'] }
        ]);
        let lines, logic;
        if (broken.length) {
          lines = broken.map((b) => d(b.code, b.amount, `${b.label} ${fmt(b.amount)} 元`, b.code === '5101' ? '车间间接耗用，先进制造费用再分配' : '直接构成产品实体，计入生产成本'));
          const total = r2(broken.reduce((s, b) => s + b.amount, 0));
          lines.push(c('1403', total, `发出材料合计 ${fmt(total)} 元`, '存货减少'));
          logic = '领料要区分"直接材料"和"车间一般耗用"：前者直接进生产成本，后者先进制造费用，期末再分配。';
        } else {
          const amt = firstNum(ctx.a.amount, ctx.a.price, ctx.a.total, ctx.a.cost) || 0;
          const toOverhead = /(车间|一般耗用|修理|维护)/.test(ctx.text) && !/(生产产品|产品耗用)/.test(ctx.text);
          const code = toOverhead ? '5101' : '500101';
          lines = [
            d(code, amt, `领用材料成本 ${fmt(amt)} 元`, toOverhead ? '车间间接耗用' : '直接材料，构成产品实体'),
            c('1403', amt, `原材料减少 ${fmt(amt)} 元`, '按实际成本发出（先进先出/加权平均由企业政策决定）')
          ];
          logic = `材料从仓库发出，成本从"原材料"转入"生产成本"（或"制造费用"）。这是存货成本向产品成本的第一站。`;
        }
        return [E(ctx, '领用原材料', lines, explain(logic,
          [['业务实质', '存货形态改变：材料 → 在产品，成本跟着走'],
          ['科目选择', '直接用于产品生产 → "生产成本—基本生产成本"；车间一般耗用 → "制造费用"'],
          ['金额', `按发出材料的实际成本 ${fmt(lines[0].amount)} 元`],
          ['方向', '成本增加记借方；存货减少记贷方']],
          ['"制造费用"是车间间接费用，不是期间费用，期末必须分配转入生产成本，不能留在账上。',
            '领用材料用于在建工程、职工福利等，要作进项税额转出。'],
          '《企业会计准则第1号——存货》'
        ))];
      }
    },

    /* ---------- 计提/分配职工工资 ---------- */
    {
      id: 'payroll-accrue',
      title: '计提职工工资',
      scene: '生产',
      test(t) {
        return /(工资|薪酬|职工薪酬)/.test(t) && /(计提|分配|结算|计算)/.test(t) && !/(发放|支付|实际发放)/.test(t);
      },
      build(ctx) {
        const buckets = [
          { code: '500101', label: '生产工人', kws: ['生产工人', '生产人员', '一线工人', '直接人工', '生产部门人员'] },
          { code: '5101', label: '车间管理人员', kws: ['车间管理', '车间技术', '车间人员'] },
          { code: '6602', label: '行政管理人员', kws: ['行政管理', '管理人员', '厂部', '行政部门'] },
          { code: '6601', label: '销售人员', kws: ['销售人员', '销售部门'] },
          { code: '1604', label: '在建工程人员', kws: ['在建工程', '安装人员', '工程人员'] }
        ];
        let parts = splitByKeywords(ctx.text, buckets);
        if (!parts.length) {
          const amt = firstNum(ctx.a.amount, ctx.a.price, ctx.a.total) || 0;
          parts = [{ code: '500101', label: '生产工人（题目未细分）', amount: amt }];
        }
        const total = r2(parts.reduce((s, p) => s + p.amount, 0));
        const lines = parts.map((p) => d(p.code, p.amount, `${p.label}工资 ${fmt(p.amount)} 元`,
          p.code === '500101' ? '直接人工，计入产品生产成本' :
          p.code === '5101' ? '车间间接人工，先入制造费用' :
          p.code === '1604' ? '工程人员薪酬资本化计入在建工程' : '期间费用，不计入产品成本'));
        lines.push(c('221101', total, `应付工资总额 ${fmt(total)} 元`, '尚未发放，形成对职工的负债'));
        const detail = parts.map((p) => `${p.label} ${fmt(p.amount)}`).join(' + ');
        return [E(ctx, '计提（分配）职工工资', lines, explain(
          `计提工资是"费用/成本 ↑、负债 ↑"：钱还没发，但职工已经为企业提供了劳务，按权责发生制要确认。**借方按受益对象分摊**，这是本题的核心考点。`,
          [['业务实质', '已发生的人工成本，尚未支付 → 成本费用增加、负债增加'],
          ['科目选择', '谁受益谁承担：生产工人→生产成本；车间管理→制造费用；行政→管理费用；销售→销售费用；工程→在建工程'],
          ['金额', `${detail} = ${fmt(total)} 元（应付工资总额，含代扣项）`],
          ['方向', '成本费用增加记借方；负债增加记贷方']],
          ['计提与发放是两笔：计提看"谁受益"，发放看"怎么付"。',
            '代扣的个人所得税、社保个人部分，在发放时才能从"应付职工薪酬"里转出，不要在计提时直接冲。',
            '车间管理人员工资进"制造费用"，不是"管理费用"。'],
          '《企业会计准则第9号——职工薪酬》'
        ))];
      }
    },

    /* ---------- 发放工资 ---------- */
    {
      id: 'payroll-pay',
      title: '发放职工工资',
      scene: '生产',
      test(t) {
        return /(发放|支付|实际发放|代发)/.test(t) && /(工资|薪酬)/.test(t);
      },
      build(ctx) {
        const toks = root.extractAmounts(ctx.text);
        const grossTok = toks.find((t) => /工资|薪酬/.test(t.label));
        let tax = 0, social = 0;
        toks.forEach((t) => {
          if (/个人所得税|个税/.test(t.label)) tax = r2(tax + t.value);
          else if (/社保|社会保险|公积金/.test(t.label)) social = r2(social + t.value);
        });
        let gross = grossTok ? grossTok.value : (firstNum(ctx.a.amount, ctx.a.price, ctx.a.total) || 0);
        if (/(实发|实际发放|净发)/.test(ctx.text) && (tax || social)) gross = r2(gross + tax + social);
        if (!grossTok && (tax || social)) gross = r2(gross + tax + social);
        const net = r2(gross - tax - social);
        const lines = [d('221101', gross, `应付工资总额 ${fmt(gross)} 元`, '发放时冲减已计提的负债')];
        if (tax > 0) lines.push(c('222107', tax, `代扣个人所得税 ${fmt(tax)} 元`, '企业代扣代缴，形成对税务局的负债'));
        if (social > 0) lines.push(c('2241', social, `代扣个人社保/公积金 ${fmt(social)} 元`, '代扣个人部分，形成对其他单位的负债'));
        lines.push(c('1002', net, `实发到职工账户 ${fmt(net)} 元`, '银行存款减少'));
        return [E(ctx, '发放职工工资', lines, explain(
          `发放工资：负债减少，银行存款减少；代扣的部分并没有发给职工，而是替职工转交给税务和社保机构，所以形成新的负债。`,
          [['业务实质', '清偿职工薪酬负债，同时代扣代缴'],
          ['科目选择', '借"应付职工薪酬—工资"；贷"银行存款"、"应交税费—应交个人所得税"、"其他应付款"'],
          ['金额', `应发 ${fmt(gross)} = 实发 ${fmt(net)} + 代扣个税 ${fmt(tax)} + 代扣社保 ${fmt(social)}`],
          ['方向', '负债减少记借方；资产减少、负债增加记贷方']],
          ['代扣项不是企业的费用，只是"过路财神"，千万别计入管理费用。',
            '发放金额小于计提金额时，差额可能是代扣项，先核对再调账。'],
          '《企业会计准则第9号——职工薪酬》'
        ))];
      }
    },

    /* ---------- 计提单位社保 / 公积金 ---------- */
    {
      id: 'social-insure',
      title: '计提单位社保/公积金',
      scene: '生产',
      test(t) {
        return /(社会保险|社保|公积金|五险一金)/.test(t) && /(计提|缴纳|缴存|承担)/.test(t);
      },
      build(ctx) {
        const amt = firstNum(ctx.a.amount, ctx.a.price, ctx.a.total) || 0;
        const lines = [
          d('500101', amt, `单位承担部分 ${fmt(amt)} 元`, '生产人员社保属于人工成本，计入生产成本'),
          c('221102', amt, `应付社保（单位部分）${fmt(amt)} 元`, '尚未缴纳，形成负债')
        ];
        return [E(ctx, '计提单位承担的社会保险费', lines, explain(
          `社保分"单位部分"和"个人部分"：单位部分是企业的职工薪酬成本，要计提；个人部分是从职工工资里代扣的，不是企业费用。`,
          [['业务实质', '企业承担的社保是人工成本的组成部分'],
          ['科目选择', '借"生产成本/制造费用/管理费用/销售费用"，贷"应付职工薪酬—社会保险费"'],
          ['金额', `单位承担 ${fmt(amt)} 元（题目按生产人员举例，实务中按部门分摊）`],
          ['方向', '成本费用增加记借方；负债增加记贷方']],
          ['单位部分进成本费用，个人部分只是代扣，二者不能混。',
            '缴纳时：借"应付职工薪酬—社会保险费"（单位）+ "其他应付款"（个人），贷"银行存款"。'],
          '《企业会计准则第9号——职工薪酬》'
        ))];
      }
    },

    /* ---------- 计提折旧 ---------- */
    {
      id: 'depreciation',
      title: '计提固定资产折旧',
      scene: '生产',
      test(t) {
        return /(折旧)/.test(t) && /(计提|本月|折旧费)/.test(t) && !/(处置|出售|清理)/.test(t);
      },
      build(ctx) {
        const buckets = [
          { code: '5101', label: '车间（生产用）', kws: ['车间', '生产用', '生产设备', '机器设备', '厂房'] },
          { code: '6602', label: '行政管理部门', kws: ['行政管理', '管理部门', '办公', '厂部', '办公楼'] },
          { code: '6601', label: '销售部门', kws: ['销售部门', '销售用', '销售机构'] },
          { code: '1604', label: '在建工程', kws: ['在建工程', '工程用'] },
          { code: '6402', label: '出租', kws: ['出租', '经营租出'] }
        ];
        let parts = splitByKeywords(ctx.text, buckets);
        if (!parts.length) {
          const amt = firstNum(ctx.a.amount, ctx.a.price, ctx.a.total) || 0;
          parts = [{ code: '5101', label: '车间（题目未细分）', amount: amt }];
        }
        const total = r2(parts.reduce((s, p) => s + p.amount, 0));
        const lines = parts.map((p) => d(p.code, p.amount, `${p.label}折旧 ${fmt(p.amount)} 元`,
          p.code === '5101' ? '车间设备折旧属于制造费用，最终进产品成本' :
          p.code === '1604' ? '工程用固定资产折旧资本化' :
          p.code === '6402' ? '出租资产折旧计入其他业务成本' : '行政/销售用资产折旧属于期间费用'));
        lines.push(c('1602', total, `累计折旧增加 ${fmt(total)} 元`, '备抵账户贷方登记，不直接冲减固定资产原值'));
        return [E(ctx, '计提固定资产折旧', lines, explain(
          `折旧不是"把钱花掉"，而是把固定资产的成本按受益对象分摊到各期。**贷方永远是"累计折旧"这个备抵账户**，固定资产原值不动。`,
          [['业务实质', '固定资产价值消耗，按受益部门分摊'],
          ['科目选择', '车间设备→制造费用；行政→管理费用；销售→销售费用；工程→在建工程'],
          ['金额', `本月应提折旧合计 ${fmt(total)} 元（按年限平均法/工作量法等）`],
          ['方向', '成本费用增加记借方；备抵账户（累计折旧）增加记贷方']],
          ['折旧费用不直接贷记"固定资产"——原值要保留在账上，用"累计折旧"抵减。',
            '当月增加的固定资产当月不提折旧，当月减少的当月照提。',
            '车间设备折旧进"制造费用"，不是"管理费用"，这是高频错点。'],
          '《企业会计准则第4号——固定资产》'
        ))];
      }
    },

    /* ---------- 支付水电费/其他制造费用 ---------- */
    {
      id: 'utility',
      title: '支付费用（水电/办公/广告等）',
      scene: '生产',
      test(t) {
        return /(水电费|水费|电费|办公费|差旅费|租金|广告费|运输费|保险费|修理费|劳保|通讯费)/.test(t) &&
          /(支付|以银行存款|开出|发生)/.test(t) && !/(分配|结转)/.test(t);
      },
      build(ctx) {
        const amt = firstNum(ctx.a.price, ctx.a.amount, ctx.a.total) || 0;
        const hasTax = /(增值税|专票|税额|税率)/.test(ctx.text);
        const vat = hasTax ? (firstNum(ctx.a.vat) || 0) : 0;
        const total = r2(amt + vat);
        const kind = (ctx.text.match(/(水电费|水费|电费|办公费|差旅费|租金|广告费|运输费|保险费|修理费|劳保|通讯费)/) || [])[0] || '费用';
        const isSelling = /(广告费|展览费|销售|运输费|业务宣传)/.test(ctx.text);
        const isAdmin = /(办公费|差旅费|招待费|管理人员|行政|通讯费|租金)/.test(ctx.text);
        const code = isSelling ? '6601' : isAdmin ? '6602' : '5101';
        const label = code === '5101' ? '车间耗用，先计入制造费用' : '期间费用，直接进当期损益';
        const lines = [d(code, amt, `${kind} ${fmt(amt)} 元`, label)];
        if (vat > 0) lines.push(d('22210101', vat, `取得专票，进项税 ${fmt(vat)} 元`, '水电费取得专票可按 13%（或 9%）抵扣'));
        lines.push(c('1002', total, `价税合计 ${fmt(total)} 元`, '银行付款'));
        return [E(ctx, `支付${kind}`, lines, explain(
          `同样是付钱，记哪个科目取决于"谁受益"：车间耗用的水电先归集到制造费用，行政办公的直接进管理费用，销售环节的进销售费用。`,
          [['业务实质', '支付本期已发生的费用（或先归集后分配）'],
          ['科目选择', code === '5101' ? '车间水电 → "制造费用"，期末再分配' : '管理部门 → "管理费用"；销售部门 → "销售费用"'],
          ['金额', `费用 ${fmt(amt)} 元 + 进项税 ${fmt(vat)} 元 = ${fmt(total)} 元`],
          ['方向', '费用/成本增加记借方；资产减少记贷方']],
          ['水电费不是一律进管理费用：车间用的要进制造费用（最终进产品成本）。',
            '增值税专用发票才能抵扣，普票的税额要并入费用。'],
          '《企业会计准则第1号——存货》《企业会计准则第30号——财务报表列报》'
        ))];
      }
    },

    /* ---------- 分配制造费用 ---------- */
    {
      id: 'overhead-allocate',
      title: '分配制造费用',
      scene: '生产',
      test(t) {
        return /(制造费用)/.test(t) && /(分配|结转|转入|计入生产成本)/.test(t);
      },
      build(ctx) {
        const given = firstNum(ctx.a.amount, ctx.a.price, ctx.a.total);
        const bal = ctx.bal ? ctx.bal('5101') : 0;
        const amt = given !== null && given > 0 ? given : bal;
        return [E(ctx, '分配制造费用计入生产成本', [
          d('500101', amt, given !== null ? `按分配标准转入 ${fmt(amt)} 元` : `"制造费用"账户余额 ${fmt(bal)} 元全部转入`, '制造费用是间接成本，期末必须分配到产品'),
          c('5101', amt, `结转制造费用 ${fmt(amt)} 元`, '过渡账户期末一般无余额')
        ], explain(
          `制造费用（车间水电、折旧、管理人员工资）无法直接对应到某个产品，期末要按一定标准（工时、机器工时、工资比例）分配计入生产成本。`,
          [['业务实质', '间接成本 → 产品成本的归集与分配'],
          ['科目选择', '借"生产成本—基本生产成本"，贷"制造费用"'],
          ['金额', given !== null ? `按分配率计算 ${fmt(amt)} 元` : `取"制造费用"本期发生额 ${fmt(bal)} 元（全额结转）`],
          ['方向', '生产成本增加记借方；制造费用减少记贷方']],
          ['制造费用是"车间"的间接费用，不是"管理费用"，期末必须转出，不能留余额。',
            '分配标准一经确定不得随意变更；分配率 = 制造费用总额 ÷ 分配标准总量。'],
          '《企业会计准则第1号——存货》'
        ))];
      }
    },

    /* ---------- 完工产品入库 ---------- */
    {
      id: 'finish-goods',
      title: '完工产品验收入库',
      scene: '生产',
      test(t) {
        return /(完工|验收入库|生产完成|完工入库)/.test(t) && /(产品|商品|产成品)/.test(t) &&
          !/(销售|售出|出售|退回)/.test(t);
      },
      build(ctx) {
        const given = firstNum(ctx.a.amount, ctx.a.price, ctx.a.total);
        const bal = ctx.bal ? ctx.bal('5001') : 0;
        const amt = given !== null && given > 0 ? given : bal;
        return [E(ctx, '完工产品验收入库', [
          d('1405', amt, given !== null ? `完工产品成本 ${fmt(amt)} 元` : `"生产成本"账户余额 ${fmt(bal)} 元`, '产品成本从生产成本转入库存商品'),
          c('500101', amt, `结转生产成本 ${fmt(amt)} 元`, '在产品转为产成品，生产成本账户结清')
        ], explain(
          `完工入库是存货形态的第二次转换：在产品 → 产成品。成本金额来自"生产成本"账户的归集结果（直接材料 + 直接人工 + 分配的制造费用）。`,
          [['业务实质', '在产品完工，成本随实物转入库存商品'],
          ['科目选择', '借"库存商品"，贷"生产成本"'],
          ['金额', given !== null ? `完工产品成本 ${fmt(amt)} 元` : `"生产成本"余额 ${fmt(bal)} 元（材料+人工+制造费用）`],
          ['方向', '存货增加记借方；生产成本减少记贷方']],
          ['完工产品成本 = 期初在产品 + 本期生产费用 − 期末在产品，别把期间费用算进去。',
            '未完工的在产品要继续留在"生产成本"账户，不能全部转出。'],
          '《企业会计准则第1号——存货》'
        ))];
      }
    },

    /* ---------- 存货跌价准备 ---------- */
    {
      id: 'inventory-writedown',
      title: '计提存货跌价准备',
      scene: '生产',
      test(t) {
        return /(跌价|减值)/.test(t) && /(存货|原材料|库存商品|产品|材料)/.test(t);
      },
      build(ctx) {
        const nums = root.extractAmounts(ctx.text);
        let amt = firstNum(ctx.a.amount, ctx.a.price, ctx.a.total) || 0;
        const costTok = nums.find((t) => /成本|原值|账面/.test(t.label));
        const nrvTok = nums.find((t) => /可变现|净值|市价/.test(t.label)) || nums.find((t) => /可变现|净值|市价/.test(t.before));
        if (costTok && nrvTok) amt = r2(costTok.value - nrvTok.value);
        const lines = [
          d('6701', amt, `成本 ${costTok ? fmt(costTok.value) : '—'} − 可变现净值 ${nrvTok ? fmt(nrvTok.value) : '—'} = ${fmt(amt)} 元`, '存货按成本与可变现净值孰低计量，差额计提跌价准备'),
          c('1471', amt, `存货跌价准备增加 ${fmt(amt)} 元`, '备抵账户，抵减存货账面价值')
        ];
        return [E(ctx, '计提存货跌价准备', lines, explain(
          `存货期末按"成本与可变现净值孰低"计量。当可变现净值低于成本时，差额不能挂在存货里，要通过"存货跌价准备"这个备抵账户调减。`,
          [['业务实质', '资产账面价值高估，需要确认减值损失'],
          ['科目选择', '借"资产减值损失"，贷"存货跌价准备"'],
          ['金额', `成本 − 可变现净值 = 应计提金额 ${fmt(amt)} 元`],
          ['方向', '损失增加记借方；备抵账户增加记贷方']],
          ['跌价准备可以转回（存货），但固定资产减值准备一经计提不得转回——这是重要区别。',
            '可变现净值 = 估计售价 − 至完工估计将发生的成本 − 销售费用 − 相关税费。'],
          '《企业会计准则第1号——存货》'
        ))];
      }
    },

    /* ---------- 无形资产摊销 ---------- */
    {
      id: 'amortize',
      title: '无形资产摊销',
      scene: '生产',
      test(t) {
        return /摊销/.test(t) && !/(长期待摊费用)/.test(t);
      },
      build(ctx) {
        const amt = firstNum(ctx.a.amount, ctx.a.price, ctx.a.total) || 0;
        const code = /(车间|生产)/.test(ctx.text) ? '5101' : /(销售)/.test(ctx.text) ? '6601' : '6602';
        return [E(ctx, '无形资产摊销', [
          d(code, amt, `本月应摊销 ${fmt(amt)} 元`, '按受益对象计入成本费用'),
          c('1702', amt, `累计摊销增加 ${fmt(amt)} 元`, '备抵账户，不直接冲减无形资产原值')
        ], explain(
          `无形资产摊销与固定资产折旧逻辑一致：原值不动，用"累计摊销"备抵，摊销额按受益对象进成本费用。`,
          [['业务实质', '无形资产价值按使用寿命分期消耗'],
          ['科目选择', '借"管理费用/制造费用/销售费用"，贷"累计摊销"'],
          ['金额', `本月摊销额 ${fmt(amt)} 元`],
          ['方向', '费用增加记借方；备抵账户增加记贷方']],
          ['使用寿命不确定的无形资产不摊销，但每年必须减值测试。',
            '摊销不直接贷记"无形资产"，而是贷记"累计摊销"。'],
          '《企业会计准则第6号——无形资产》'
        ))];
      }
    }
  ];

  root.RULE_GROUPS_PRODUCE = rules;
  root.splitByKeywords = splitByKeywords;
})(typeof globalThis !== 'undefined' ? globalThis : this);
