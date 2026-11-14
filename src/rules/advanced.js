/* ============================================================
 * rules/advanced.js —— 进阶准则：计划成本、长期股权投资、投资性房地产、
 * 租赁、应付债券、研发支出、资产减值、政府补助
 * ============================================================ */
(function (root) {
  'use strict';
  const { d, c, E, explain, firstNum } = root.RH;
  const fmt = root.fmt;
  const r2 = root.round2;

  function numAfter(text, kw) {
    const re = new RegExp(kw + '[^0-9]{0,8}([0-9][0-9,，]*(?:\\.[0-9]+)?)\\s*(万元|元)?');
    const m = text.match(re);
    if (!m) return null;
    let v = Number(m[1].replace(/[,，]/g, ''));
    if (m[2] === '万元') v *= 10000;
    return r2(v);
  }
  const rateNear = (text, kw) => {
    let m = text.match(new RegExp(kw + '[^0-9]{0,6}([0-9]{1,2}(?:\\.[0-9]+)?)\\s*[%％]'));
    if (!m) m = text.match(new RegExp('([0-9]{1,2}(?:\\.[0-9]+)?)\\s*[%％][^0-9]{0,4}' + kw));
    return m ? Number(m[1]) / 100 : null;
  };
  const rateAfter = (text, kw) => {
    const m = text.match(new RegExp(kw + '[^0-9]{0,6}([0-9]{1,2}(?:\\.[0-9]+)?)\\s*[%％]'));
    return m ? Number(m[1]) / 100 : null;
  };

  const rules = [
    /* ---------- 计划成本法：采购与入库 ---------- */
    {
      id: 'planned-purchase',
      title: '计划成本法采购入库',
      scene: '采购',
      test(t) {
        return /计划成本/.test(t) && /(购入|采购|购进|入库|验收)/.test(t) && !/(领用|发出)/.test(t);
      },
      build(ctx) {
        const actual = firstNum(numAfter(ctx.text, '实际成本'), ctx.a.price, ctx.a.amount) || 0;
        const planned = firstNum(numAfter(ctx.text, '计划成本'), actual) || actual;
        const vat = firstNum(ctx.a.vat) || (ctx.a.rate ? r2(actual * ctx.a.rate) : 0);
        const total = r2(actual + vat);
        const credit = /(未付|未支付|应付|赊)/.test(ctx.text) ? '2202' : '1002';
        const diff = r2(actual - planned);
        const entries = [E(ctx, '① 采购材料（按实际成本）', [
          d('1401', actual, `实际成本 ${fmt(actual)} 元`, '计划成本法下先通过"材料采购"归集实际成本'),
          d('22210101', vat, `进项税额 ${fmt(vat)} 元`, '取得专票可抵扣'),
          c(credit, total, `价税合计 ${fmt(total)} 元`, credit === '2202' ? '款项未付' : '银行付款')
        ], explain(
          `计划成本法下，采购先按**实际成本**记入"材料采购"，入库时再按**计划成本**转"原材料"，差额进"材料成本差异"。`,
          [['业务实质', '实际成本与计划成本分离核算，便于考核采购业绩'],
          ['科目选择', '借"材料采购"（实际成本）；贷"银行存款/应付账款"'],
          ['金额', `实际成本 ${fmt(actual)} + 进项税 ${fmt(vat)} = ${fmt(total)} 元`],
          ['方向', '资产增加记借方；资产减少/负债增加记贷方']],
          ['计划成本法只适用于存货，且计划单价一经确定年度内不得随意变更。',
            '"材料采购"是过渡账户，入库后应结平。'],
          '《企业会计准则第1号——存货》'
        ))];
        if (/(入库|验收)/.test(ctx.text) || numAfter(ctx.text, '计划成本') !== null) {
          const lines = [d('1403', planned, `计划成本 ${fmt(planned)} 元（数量 × 计划单价）`, '按计划成本入库'),
            c('1401', actual, `结转实际成本 ${fmt(actual)} 元`, '结平"材料采购"')];
          if (Math.abs(diff) > 0.005) {
            if (diff > 0) lines.push(d('1404', diff, `实际 ${fmt(actual)} − 计划 ${fmt(planned)} = 超支 ${fmt(diff)} 元`, '超支差异记借方'));
            else lines.push(c('1404', -diff, `计划 ${fmt(planned)} − 实际 ${fmt(actual)} = 节约 ${fmt(-diff)} 元`, '节约差异记贷方'));
          }
          entries.push(E(ctx, '② 材料验收入库（按计划成本）', lines, explain(
            `入库时按计划成本记"原材料"，同时把"材料采购"的实际成本转出，差额计入"材料成本差异"。`,
            [['业务实质', '存货按计划成本入账，差异单独归集'],
            ['科目选择', '借"原材料"（计划成本）；贷"材料采购"（实际成本）；差额记"材料成本差异"'],
            ['金额', `计划 ${fmt(planned)}，实际 ${fmt(actual)}，差异 ${fmt(diff)} 元`],
            ['方向', diff >= 0 ? '超支差异记借方' : '节约差异记贷方']],
            ['差异不是费用，月末要按差异率分摊到发出存货和结存存货。',
              '超支记借方、节约记贷方，方向别记反。'],
            '《企业会计准则第1号——存货》'
          )));
        }
        return entries;
      }
    },

    /* ---------- 计划成本法：领用与差异分摊 ---------- */
    {
      id: 'planned-issue',
      title: '计划成本法领用材料',
      scene: '生产',
      test(t) {
        return /计划成本/.test(t) && /(领用|发出|耗用)/.test(t);
      },
      build(ctx) {
        const planned = firstNum(numAfter(ctx.text, '计划成本'), ctx.a.amount) || 0;
        const rate = rateNear(ctx.text, '差异率') || 0;
        const saving = /节约/.test(ctx.text);
        const diff = r2(planned * rate);
        const entries = [E(ctx, '领用材料（按计划成本）', [
          d('500101', planned, `计划成本 ${fmt(planned)} 元`, '按计划成本计入生产成本'),
          c('1403', planned, `原材料减少 ${fmt(planned)} 元`, '计划成本出库')
        ], explain(
          `领用时先按计划成本转出，月末再把应分摊的材料成本差异转入成本。`,
          [['业务实质', '存货按计划成本出库，差异另行分摊'],
          ['科目选择', '借"生产成本"，贷"原材料"（均为计划成本）'],
          ['金额', `计划成本 ${fmt(planned)} 元`],
          ['方向', '成本增加记借方；存货减少记贷方']],
          ['差异分摊额 = 计划成本 × 差异率，超支调增成本、节约调减成本。'],
          '《企业会计准则第1号——存货》'
        ))];
        if (diff > 0.005) {
          entries.push(E(ctx, saving ? '结转节约差异（调减成本）' : '结转超支差异（调增成本）', saving
            ? [d('1404', diff, `分摊节约差异 ${fmt(diff)} 元`, '冲减材料成本差异'), c('500101', diff, `调减生产成本 ${fmt(diff)} 元`, '节约差异冲减成本')]
            : [d('500101', diff, `分摊超支差异 ${fmt(diff)} 元`, '调增生产成本'), c('1404', diff, `材料成本差异 ${fmt(diff)} 元`, '超支差异转出')],
            explain(
              `月末按差异率把"材料成本差异"分摊到领用存货，把计划成本还原为实际成本。`,
              [['业务实质', '计划成本 → 实际成本'],
              ['科目选择', saving ? '借"材料成本差异"，贷"生产成本"' : '借"生产成本"，贷"材料成本差异"'],
              ['金额', `${fmt(planned)} × ${(rate * 100).toFixed(1)}% = ${fmt(diff)} 元`],
              ['方向', '超支调增成本，节约调减成本']],
              ['差异率要区分"本期差异率"与"期初结存差异率"，考试常按期初数计算。'],
              '《企业会计准则第1号——存货》'
            )));
        }
        return entries;
      }
    },

    /* ---------- 长期股权投资 ---------- */
    {
      id: 'lt-equity',
      title: '长期股权投资',
      scene: '投资',
      test(t) {
        return /(长期股权投资|权益法|持股比例)/.test(t);
      },
      build(ctx) {
        const text = ctx.text;
        const equity = /权益法/.test(text) || (!/成本法/.test(text) && /权益法/.test(ctx.recent || ''));
        const amt = firstNum(ctx.a.price, ctx.a.amount, ctx.a.total) || 0;

        // 处置
        if (/(处置|出售|转让|收回投资)/.test(text)) {
          const sell = firstNum(ctx.a.price, ctx.a.total, ctx.a.amount) || 0;
          const book = ctx.bal ? ctx.bal('1511') : 0;
          const gain = r2(sell - book);
          const entries = [E(ctx, '处置长期股权投资', [
            d('1002', sell, `收到价款 ${fmt(sell)} 元`, '银行存款增加'),
            c('1511', book, `转销长期股权投资账面价值 ${fmt(book)} 元`, '终止确认'),
            gain >= 0 ? c('6111', gain, `投资收益 ${fmt(gain)} 元`, '售价 − 账面价值') : d('6111', -gain, `投资损失 ${fmt(-gain)} 元`, '售价 < 账面价值')
          ].filter(Boolean), explain(
            `处置时转销长投账面价值，售价与账面价值的差额计入投资收益。`,
            [['业务实质', '终止确认长期股权投资'],
            ['科目选择', '借"银行存款"，贷"长期股权投资"、"投资收益"'],
            ['金额', `售价 ${fmt(sell)} − 账面 ${fmt(book)} = ${fmt(gain)} 元`],
            ['方向', '资产增加记借方；资产减少记贷方']],
            ['权益法下原计入其他综合收益的份额，处置时要转入投资收益。'],
            '《企业会计准则第2号——长期股权投资》'
          ))];
          return entries;
        }

        // 被投资方净损益 / 其他综合收益（权益法）
        if (equity && /(净利润|净亏损|亏损|其他综合收益)/.test(text)) {
          const isOCI = /其他综合收益/.test(text);
          const pct = rateNear(text, '持股比例') || rateNear(text, '份额') || 1;
          const base = firstNum(numAfter(text, '净利润'), numAfter(text, '亏损'), amt) || 0;
          const share = r2(base * pct);
          if (isOCI) {
            return [E(ctx, '权益法：确认其他综合收益份额', [
              d('151103', share, `享有份额 ${fmt(share)} 元`, '调整长投账面价值'),
              c('4003', share, `其他综合收益 ${fmt(share)} 元`, '不计入当期损益')
            ], explain(
              `权益法下，被投资方其他综合收益的变动，投资方按份额调整长投账面价值，同时计入其他综合收益（权益项目）。`,
              [['业务实质', '被投资方权益变动，投资方同步确认'],
              ['科目选择', '借"长期股权投资—其他综合收益"，贷"其他综合收益"'],
              ['金额', `${fmt(base)} × ${(pct * 100).toFixed(0)}% = ${fmt(share)} 元`],
              ['方向', '资产增加记借方；权益增加记贷方']],
              ['其他综合收益不影响当期利润，但会影响所有者权益。'],
              '《企业会计准则第2号——长期股权投资》'
            ))];
          }
          const loss = /亏损/.test(text);
          return [E(ctx, loss ? '权益法：确认投资损失' : '权益法：确认投资收益', [
            loss ? d('6111', share, `投资损失 ${fmt(share)} 元`, '按份额确认亏损') : d('151102', share, `损益调整 ${fmt(share)} 元`, '按份额调整长投'),
            loss ? c('151102', share, `长投账面价值减少 ${fmt(share)} 元`, '亏损冲减长投') : c('6111', share, `投资收益 ${fmt(share)} 元`, '按份额确认收益')
          ], explain(
            `权益法下，被投资方实现净利润（或亏损），投资方按持股比例确认投资收益并调整长投账面价值——不是按收到股利确认。`,
            [['业务实质', '被投资方经营成果的份额'],
            ['科目选择', '借"长期股权投资—损益调整"，贷"投资收益"（亏损相反）'],
            ['金额', `${fmt(base)} × ${(pct * 100).toFixed(0)}% = ${fmt(share)} 元`],
            ['方向', '资产增加记借方；收益记贷方']],
            ['权益法下收到现金股利是冲减长投，不是确认收益；成本法下才确认投资收益。'],
            '《企业会计准则第2号——长期股权投资》'
          ))];
        }

        // 宣告 / 收到股利
        if (/(股利|利润分配)/.test(text)) {
          const isReceive = /(收到|发放|支付)/.test(text) && !/(宣告|宣布)/.test(text);
          if (isReceive) {
            return [E(ctx, '收到现金股利', [
              d('1002', amt, `收到股利 ${fmt(amt)} 元`, '银行存款增加'),
              c('1131', amt, `冲减应收股利 ${fmt(amt)} 元`, '债权收回')
            ], explain('收到此前已宣告的股利，冲减应收股利。',
              [['业务实质', '债权变现'], ['科目选择', '借"银行存款"，贷"应收股利"'], ['金额', `${fmt(amt)} 元`], ['方向', '资产一增一减']],
              ['收到股利不再确认收益，收益在宣告时已确认。'], '《企业会计准则第2号》'))];
          }
          const pctD = rateNear(text, '持股比例') || 1;
          const div = r2(amt * pctD);
          return [E(ctx, '宣告现金股利', [
            d('1131', div, `应收股利 ${fmt(div)} 元`, '形成债权'),
            c(equity ? '151102' : '6111', div, equity ? '冲减长投账面价值' : '确认投资收益', equity ? '权益法下冲减长投' : '成本法下确认收益')
          ], explain(
            equity
              ? `权益法下，被投资方宣告分派现金股利，投资方冲减长投账面价值（因为损益已按份额确认过，不能重复确认收益）。`
              : `成本法下，被投资方宣告分派现金股利，投资方确认投资收益。`,
            [['业务实质', equity ? '收回部分投资' : '取得投资回报'],
            ['科目选择', equity ? '借"应收股利"，贷"长期股权投资—损益调整"' : '借"应收股利"，贷"投资收益"'],
            ['金额', `宣告分派 ${fmt(amt)} × ${(pctD * 100).toFixed(0)}% = ${fmt(div)} 元`],
            ['方向', '资产增加记借方；资产减少或收益增加记贷方']],
            ['成本法与权益法对股利的处理完全不同，这是高频考点。'],
            '《企业会计准则第2号——长期股权投资》'
          ))];
        }

        // 取得
        const share = firstNum(numAfter(text, '享有'), ctx.a.share);
        if (equity && share !== null && share > amt) {
          const gain = r2(share - amt);
          return [E(ctx, '权益法：取得长期股权投资（负商誉）', [
            d('151101', share, `享有可辨认净资产公允价值份额 ${fmt(share)} 元`, '按份额调整投资成本'),
            c('1002', amt, `支付价款 ${fmt(amt)} 元`, '银行存款减少'),
            c('6301', gain, `差额 ${fmt(gain)} 元`, '初始投资成本小于享有份额，计入营业外收入')
          ], explain(
            `权益法下，初始投资成本小于应享有被投资单位可辨认净资产公允价值份额的，差额计入营业外收入，同时调增长投成本。`,
            [['业务实质', '"捡便宜"：花得少、享有的多'],
            ['科目选择', '借"长期股权投资—投资成本"，贷"银行存款"、"营业外收入"'],
            ['金额', `享有 ${fmt(share)} − 支付 ${fmt(amt)} = ${fmt(gain)} 元`],
            ['方向', '资产增加记借方；利得记贷方']],
            ['只有"小于"才调增；大于时不调整，差额内含商誉。'],
            '《企业会计准则第2号——长期股权投资》'
          ))];
        }
        return [E(ctx, equity ? '权益法：取得长期股权投资' : '成本法：取得长期股权投资', [
          d(equity ? '151101' : '1511', amt, `投资成本 ${fmt(amt)} 元`, '按实际支付的购买价款及相关费用入账'),
          c('1002', amt, `支付 ${fmt(amt)} 元`, '银行存款减少')
        ], explain(
          `取得长期股权投资，按实际支付的购买价款（含相关税费）作为初始投资成本。`,
          [['业务实质', '对外长期投资，资产形态转换'],
          ['科目选择', equity ? '借"长期股权投资—投资成本"' : '借"长期股权投资"；贷"银行存款"'],
          ['金额', `实际支付 ${fmt(amt)} 元`],
          ['方向', '资产增加记借方；资产减少记贷方']],
          ['成本法vs权益法的判断看是否"控制/共同控制/重大影响"，不是看持股比例本身。',
            '已宣告未发放的现金股利应单独记"应收股利"，不计入投资成本。'],
          '《企业会计准则第2号——长期股权投资》'
        ))];
      }
    },

    /* ---------- 投资性房地产 ---------- */
    {
      id: 'investment-property',
      title: '投资性房地产',
      scene: '投资',
      test(t) {
        return /(投资性房地产|写字楼|商铺|用于出租|出租的房屋)/.test(t);
      },
      build(ctx) {
        const text = ctx.text;
        const fvMode = /公允价值/.test(text);
        const amt = firstNum(ctx.a.price, ctx.a.amount, ctx.a.total) || 0;

        if (/(租金|出租收入)/.test(text)) {
          const vat = firstNum(ctx.a.vat) || (ctx.a.rate ? r2(amt * ctx.a.rate) : 0);
          const total = r2(amt + vat);
          return [E(ctx, '收到投资性房地产租金', [
            d('1002', total, `收到租金 ${fmt(total)} 元`, '价税合计'),
            c('6051', amt, `其他业务收入 ${fmt(amt)} 元`, '租金收入不属于主营业务'),
            c('22210102', vat, `销项税额 ${fmt(vat)} 元`, '不动产租赁适用 9%（简化按设定税率）')
          ], explain('出租投资性房地产的租金计入"其他业务收入"，增值税单独确认。',
            [['业务实质', '让渡资产使用权取得收入'], ['科目选择', '借"银行存款"，贷"其他业务收入"、"应交税费—销项税额"'],
            ['金额', `不含税租金 ${fmt(amt)} + 税额 ${fmt(vat)}`], ['方向', '资产增加记借方；收入、负债增加记贷方']],
            ['投资性房地产的租金和处置都走"其他业务收入/成本"，不是主营业务。'], '《企业会计准则第3号——投资性房地产》'))];
        }

        if (/(折旧|摊销)/.test(text) && !fvMode) {
          return [E(ctx, '计提投资性房地产折旧', [
            d('6402', amt, `折旧 ${fmt(amt)} 元`, '成本模式下计提折旧，计入其他业务成本'),
            c('1522', amt, `投资性房地产累计折旧 ${fmt(amt)} 元`, '备抵账户')
          ], explain('成本模式下，投资性房地产比照固定资产计提折旧，折旧额计入其他业务成本。',
            [['业务实质', '资产价值消耗'], ['科目选择', '借"其他业务成本"，贷"投资性房地产累计折旧"'],
            ['金额', `${fmt(amt)} 元`], ['方向', '成本增加记借方；备抵增加记贷方']],
            ['公允价值模式下不计提折旧、不摊销，这是两种模式的根本区别。'], '《企业会计准则第3号——投资性房地产》'))];
        }

        if (/(公允价值变动|升值|贬值|上涨|下跌|涨到|跌到|公允价值为)/.test(text) && fvMode) {
          const target = firstNum(numAfter(text, '公允价值为'), numAfter(text, '公允价值'), amt);
          const book = ctx.bal ? ctx.bal('1521') : 0;
          const diff = target !== null && book ? r2(target - book) : (numAfter(text, '变动') || amt);
          const up = diff >= 0;
          return [E(ctx, '投资性房地产公允价值变动', up
            ? [d('1521', diff, `公允价值上升 ${fmt(diff)} 元`, '调增账面价值'), c('6101', diff, `公允价值变动损益 ${fmt(diff)} 元`, '计入当期损益')]
            : [d('6101', diff, `公允价值变动损失 ${fmt(diff)} 元`, '计入当期损益'), c('1521', diff, `公允价值下降 ${fmt(diff)} 元`, '调减账面价值')],
            explain('公允价值模式下，资产负债表日按公允价值调整账面价值，差额计入公允价值变动损益（不计提折旧）。',
              [['业务实质', '按公允价值计量'], ['科目选择', up ? '借"投资性房地产"，贷"公允价值变动损益"' : '借"公允价值变动损益"，贷"投资性房地产"'],
              ['金额', `变动额 ${fmt(diff)} 元`], ['方向', '资产增加记借方；收益记贷方（下跌相反）']],
              ['公允价值模式一经选择，不得随意变更为成本模式。'], '《企业会计准则第3号——投资性房地产》'))];
        }

        return [E(ctx, fvMode ? '取得投资性房地产（公允价值模式）' : '取得投资性房地产（成本模式）', [
          d('1521', amt, `取得成本 ${fmt(amt)} 元`, '按实际成本入账'),
          c('1002', amt, `支付 ${fmt(amt)} 元`, '银行存款减少')
        ], explain('取得投资性房地产按实际成本入账；后续计量可选成本模式或公允价值模式。',
          [['业务实质', '为赚取租金或资本增值持有房地产'], ['科目选择', '借"投资性房地产"，贷"银行存款"'],
          ['金额', `${fmt(amt)} 元`], ['方向', '资产增加记借方；资产减少记贷方']],
          ['只有"为赚取租金或资本增值"持有的房地产才是投资性房地产；自用是固定资产。'], '《企业会计准则第3号——投资性房地产》'))];
      }
    },

    /* ---------- 租赁（承租方） ---------- */
    {
      id: 'lease-in',
      title: '租赁（承租方）',
      scene: '租赁',
      test(t) {
        return /(租赁|租金|使用权资产|租赁负债)/.test(t) && /(使用权资产|租赁负债|租赁|租金)/.test(t);
      },
      build(ctx) {
        const text = ctx.text;
        const amt = firstNum(numAfter(text, '现值'), numAfter(text, '租赁付款额'), ctx.a.interest, ctx.a.amount, ctx.a.price) || 0;

        if (/(折旧)/.test(text)) {
          return [E(ctx, '计提使用权资产折旧', [
            d('6602', amt, `折旧 ${fmt(amt)} 元`, '按租赁期系统分摊'),
            c('1612', amt, `使用权资产累计折旧 ${fmt(amt)} 元`, '备抵账户')
          ], explain('使用权资产在租赁期内计提折旧，计入相关成本费用。',
            [['业务实质', '使用权资产价值消耗'], ['科目选择', '借"管理费用/制造费用"，贷"使用权资产累计折旧"'],
            ['金额', `${fmt(amt)} 元`], ['方向', '费用增加记借方；备抵增加记贷方']],
            ['使用权资产折旧一般按直线法，自租赁期开始日起计提。'], '《企业会计准则第21号——租赁》'))];
        }

        if (/(利息|融资费用)/.test(text)) {
          return [E(ctx, '确认租赁负债利息', [
            d('6603', amt, `利息费用 ${fmt(amt)} 元`, '按实际利率法计算'),
            c('2701', amt, `租赁负债增加 ${fmt(amt)} 元`, '利息资本化到负债')
          ], explain('租赁负债按实际利率法确认利息费用，计入财务费用，同时增加租赁负债。',
            [['业务实质', '融资成本'], ['科目选择', '借"财务费用"，贷"租赁负债"'],
            ['金额', `期初租赁负债 × 实际利率 = ${fmt(amt)} 元`], ['方向', '费用增加记借方；负债增加记贷方']],
            ['利息费用不是租金；租金支付时冲减租赁负债。'], '《企业会计准则第21号——租赁》'))];
        }

        if (/(支付|支付租金)/.test(text)) {
          return [E(ctx, '支付租金', [
            d('2701', amt, `冲减租赁负债 ${fmt(amt)} 元`, '支付租金减少负债'),
            c('1002', amt, `银行付款 ${fmt(amt)} 元`, '银行存款减少')
          ], explain('支付租金时冲减租赁负债，不再确认费用（费用已通过折旧和利息分期确认）。',
            [['业务实质', '清偿租赁负债'], ['科目选择', '借"租赁负债"，贷"银行存款"'],
            ['金额', `${fmt(amt)} 元`], ['方向', '负债减少记借方；资产减少记贷方']],
            ['短期租赁和低价值资产租赁可以选择简化处理，直接计入费用。'], '《企业会计准则第21号——租赁》'))];
        }

        return [E(ctx, '租赁期开始日确认使用权资产与租赁负债', [
          d('1611', amt, `租赁付款额现值 ${fmt(amt)} 元`, '按增量借款利率折现'),
          c('2701', amt, `租赁负债 ${fmt(amt)} 元`, '尚未支付的租赁付款额现值')
        ], explain(
          `承租人在租赁期开始日确认"使用权资产"和"租赁负债"，金额均为租赁付款额的现值（未含预付租金和初始直接费用）。`,
          [['业务实质', '取得使用权，同时承担付款义务'],
          ['科目选择', '借"使用权资产"，贷"租赁负债"'],
          ['金额', `租赁付款额现值 ${fmt(amt)} 元`],
          ['方向', '资产增加记借方；负债增加记贷方']],
          ['预付租金和初始直接费用要计入使用权资产，但不计入租赁负债。'],
          '《企业会计准则第21号——租赁》'
        ))];
      }
    },

    /* ---------- 其他债权投资（FVOCI 债务工具） ---------- */
    {
      id: 'other-debt',
      title: '其他债权投资',
      scene: '投资',
      test(t, ctx) {
        const bt = (ctx && ctx.blockText) || '';
        const dt = (ctx && ctx.docText) || '';
        if (/应付债券/.test(t)) return false;
        if (/其他债权投资/.test(t) || /其他债权投资/.test(bt) || /其他债权投资/.test(dt)) return true;
        const known = ctx && ctx.meta && ctx.meta.bond;
        return !!(known && /(债券|面值|利息|投资收益|公允价值|出售|处置)/.test(t));
      },
      build(ctx) {
        const text = ctx.text;
        const meta = ctx.meta || (ctx.meta = {});
        const face = firstNum(numAfter(text, '面值'), ctx.a.face);
        const price = firstNum(numAfter(text, '实际支付价款'), numAfter(text, '支付价款'), numAfter(text, '价款'), ctx.a.price);
        const vat = firstNum(numAfter(text, '进项税额'), ctx.a.vat) || 0;
        const couponRate = rateNear(text, '票面利率');
        const effRate = rateNear(text, '实际利率');
        // 票面利率、实际利率、面值可能分散在相邻小问里，先记到共享上下文
        {
          const prev = meta.bond || {};
          if (face !== null && face > 0) prev.face = face;
          if (couponRate) prev.couponRate = couponRate;
          if (effRate) prev.effRate = effRate;
          if (prev.face) meta.bond = prev;
        }

        /* 1) 出售 / 处置 */
        if (/(出售|处置|转让|卖出)/.test(text)) {
          const proceeds = firstNum(numAfter(text, '价款'), numAfter(text, '售价'), ctx.a.price, ctx.a.amount) || 0;
          if (!proceeds) return [];
          const faceBal = ctx.bal('150201');
          const adj = ctx.bal('150202');   // 贷方余额（折价）为正
          const fv = ctx.bal('150203');    // 借方余额（浮盈）为正
          const book = r2(faceBal - adj + fv);
          const gain = r2(proceeds - book);
          const lines = [d('1002', proceeds, `实际收到价款 ${fmt(proceeds)} 元`, '银行存款增加')];
          if (adj > 0.005) lines.push(d('150202', adj, `转销利息调整 ${fmt(adj)} 元`, '折价余额转平'));
          else if (adj < -0.005) lines.push(c('150202', -adj, `转销利息调整 ${fmt(-adj)} 元`, '溢价余额转平'));
          lines.push(c('150201', faceBal, `转销债券面值 ${fmt(faceBal)} 元`, '终止确认'));
          if (fv > 0.005) lines.push(c('150203', fv, `转销公允价值变动 ${fmt(fv)} 元`, '累计浮盈转平'));
          else if (fv < -0.005) lines.push(d('150203', -fv, `转销公允价值变动 ${fmt(-fv)} 元`, '累计浮亏转平'));
          if (gain >= 0) lines.push(c('6111', gain, `处置收益 ${fmt(gain)} 元`, '售价 − 账面价值'));
          else lines.push(d('6111', -gain, `处置损失 ${fmt(-gain)} 元`, '售价 < 账面价值'));
          const entries = [E(ctx, '出售其他债权投资', lines, explain(
            `出售其他债权投资：终止确认，把"面值 / 利息调整 / 公允价值变动"三个明细全部转平，差额计入投资收益。`,
            [['业务实质', '出售 FVOCI 债务工具，终止确认'],
            ['科目选择', '借"银行存款"；贷"其他债权投资"各明细；差额记"投资收益"'],
            ['金额', `售价 ${fmt(proceeds)} − 账面价值 ${fmt(book)} = ${fmt(gain)} 元`],
            ['方向', '资产增加记借方；资产减少记贷方']],
            ['原计入其他综合收益的累计公允价值变动，出售时要转入投资收益（"其他综合收益"不能留在账上）。'],
            '《企业会计准则第22号——金融工具确认和计量》'
          ))];
          const oci = ctx.bal('400302');
          if (Math.abs(oci) > 0.005) {
            entries.push(E(ctx, '结转其他综合收益至投资收益', oci > 0
              ? [d('400302', oci, `冲减其他综合收益 ${fmt(oci)} 元`, '累计浮盈转出'), c('6111', oci, `投资收益 ${fmt(oci)} 元`, '重分类进损益')]
              : [d('6111', -oci, `投资收益 ${fmt(-oci)} 元`, '重分类进损益'), c('400302', -oci, `转回其他综合收益 ${fmt(-oci)} 元`, '累计浮亏转出')],
              explain('其他债权投资处置时，之前计入"其他综合收益"的累计公允价值变动要重分类转入投资收益。',
                [['业务实质', 'OCI 重分类进损益'],
                ['科目选择', oci > 0 ? '借"其他综合收益"，贷"投资收益"' : '借"投资收益"，贷"其他综合收益"'],
                ['金额', `结转 ${fmt(Math.abs(oci))} 元`],
                ['方向', '权益减少记借方；收益增加记贷方']],
                ['这一步很容易漏：不结转的话，损益会少一块。'],
                '《企业会计准则第22号——金融工具确认和计量》')));
          }
          return entries;
        }

        /* 2) 公允价值变动 */
        if (/公允价值/.test(text) && !/(取得|购入|买入)/.test(text)) {
          const target = firstNum(numAfter(text, '公允价值'), ctx.a.price, ctx.a.amount);
          if (target === null) return [];
          const book = r2(ctx.bal('150201') - ctx.bal('150202') + ctx.bal('150203'));
          const diff = r2(target - book);
          if (Math.abs(diff) < 0.005) return [];
          return [E(ctx, '其他债权投资公允价值变动', diff > 0
            ? [d('150203', diff, `账面 ${fmt(book)} → 公允 ${fmt(target)}，调增 ${fmt(diff)} 元`, '计入公允价值变动明细'),
              c('400302', diff, `其他综合收益增加 ${fmt(diff)} 元`, '不计入当期损益')]
            : [d('400302', -diff, `其他综合收益减少 ${fmt(-diff)} 元`, '不计入当期损益'),
              c('150203', -diff, `账面 ${fmt(book)} → 公允 ${fmt(target)}，调减 ${fmt(-diff)} 元`, '冲减公允价值变动明细')],
            explain(
              `其他债权投资按公允价值计量，但公允价值变动**不进利润表**，而是计入其他综合收益（权益）。`,
              [['业务实质', '资产按公允价值调整，差额计入 OCI'],
              ['科目选择', diff > 0 ? '借"其他债权投资—公允价值变动"，贷"其他综合收益"' : '借"其他综合收益"，贷"其他债权投资—公允价值变动"'],
              ['金额', `公允价值 ${fmt(target)} − 账面 ${fmt(book)} = ${fmt(diff)} 元`],
              ['方向', '资产增加记借方；权益增加记贷方']],
              ['不要和交易性金融资产混淆：后者的公允价值变动进"公允价值变动损益"，影响利润。'],
              '《企业会计准则第22号——金融工具确认和计量》'
            ))];
        }

        /* 3) 期末计息（实际利率法） */
        if (/(利息|投资收益|计息|摊销)/.test(text) && !/(取得|购入|买入)/.test(text)) {
          const m = meta.bond || {};
          const faceNow = firstNum(m.face, ctx.bal('150201'), face) || 0;
          const cr = firstNum(couponRate, m.couponRate) || 0;
          const er = firstNum(effRate, m.effRate) || 0;
          if (!faceNow || !cr || !er) return [];
          const book = r2(faceNow - ctx.bal('150202'));
          const coupon = r2(faceNow * cr);
          const interest = r2(book * er);
          const amort = r2(interest - coupon);
          const accrue = /(到期一次|应计|尚未支付|未收)/.test(text);
          const lines = [d(accrue ? '150204' : '1002', coupon, `票面利息 = 面值 ${fmt(faceNow)} × ${(cr * 100).toFixed(0)}% = ${fmt(coupon)} 元`, accrue ? '未收到，计入应计利息' : '每年付息，收到银行存款')];
          if (amort > 0.005) lines.push(d('150202', amort, `利息调整摊销 ${fmt(amort)} 元`, '折价摊销，账面价值增加'));
          else if (amort < -0.005) lines.push(c('150202', -amort, `利息调整摊销 ${fmt(-amort)} 元`, '溢价摊销，账面价值减少'));
          lines.push(c('6111', interest, `实际利息 = 期初摊余成本 ${fmt(book)} × ${(er * 100).toFixed(0)}% = ${fmt(interest)} 元`, '实际利率法'));
          return [E(ctx, '确认其他债权投资利息收入', lines, explain(
            `实际利率法：投资收益按"期初摊余成本 × 实际利率"计算，与票面利息的差额摊销"利息调整"。`,
            [['业务实质', '按实际利率确认利息收入，同时摊销溢折价'],
            ['科目选择', accrue ? '借"其他债权投资—应计利息"' : '借"银行存款"；差额借/贷"利息调整"；贷"投资收益"'],
            ['金额', `票面 ${fmt(coupon)}，实际 ${fmt(interest)}，摊销 ${fmt(amort)} 元`],
            ['方向', '资产增加记借方；收益增加记贷方']],
            ['实际利息不是"面值 × 票面利率"，而是"期初摊余成本 × 实际利率"。',
              '折价摊销会增加账面价值，到期时账面价值正好回到面值。'],
            '《企业会计准则第22号——金融工具确认和计量》'
          ))];
        }

        /* 4) 取得 */
        if (!face || !price) return [];
        const net = r2(price - vat);
        const adj = r2(face - net);
        const lines = [d('150201', face, `债券面值 ${fmt(face)} 元`, '按面值记入"债券面值"明细')];
        if (vat > 0.005) lines.push(d('22210101', vat, `可抵扣进项税额 ${fmt(vat)} 元`, '取得专票，进项税单独抵扣'));
        if (adj > 0.005) lines.push(c('150202', adj, `面值 ${fmt(face)} − 实际成本 ${fmt(net)} = 折价 ${fmt(adj)} 元`, '折价记贷方，以后按实际利率法摊销'));
        else if (adj < -0.005) lines.push(d('150202', -adj, `实际成本 ${fmt(net)} − 面值 ${fmt(face)} = 溢价 ${fmt(-adj)} 元`, '溢价记借方，以后摊销'));
        lines.push(c('1002', price, `实际支付价款 ${fmt(price)} 元`, '含可抵扣进项税'));
        return [E(ctx, '取得其他债权投资', lines, explain(
          `其他债权投资按"公允价值 + 交易费用"作为初始成本；面值与实际成本的差额记入"利息调整"，后续按实际利率法摊销。增值税进项税单独抵扣，不进成本。`,
          [['业务实质', '取得以公允价值计量且变动计入其他综合收益的债务工具'],
          ['科目选择', '借"其他债权投资—债券面值"、应交税费—进项；差额借/贷"利息调整"；贷"银行存款"'],
          ['金额', `面值 ${fmt(face)}，实际成本 ${fmt(net)}，差额 ${fmt(adj)} 元（折价记贷方）`],
          ['方向', '资产增加记借方；资产减少记贷方']],
          ['注意"其他债权投资"不是"交易性金融资产"：它的公允价值变动进其他综合收益，不进利润表。',
            '交易费用计入初始成本；进项税可抵扣，不计入成本。'],
          '《企业会计准则第22号——金融工具确认和计量》'
        ))];
      }
    },

    /* ---------- 应付债券 ---------- */
    {
      id: 'bond',
      title: '应付债券',
      scene: '筹资',
      test(t) {
        if (/(购入|取得|买入|其他债权投资|债权投资|其他权益工具投资|交易性金融资产|股票)/.test(t)) return false;
        if (/(应付债券|发行债券|本公司.{0,6}债券)/.test(t)) return true;
        return /债券/.test(t) && /(利息|计提|票面利率|实际利率|到期|偿还)/.test(t);
      },
      build(ctx) {
        const text = ctx.text;
        const face = firstNum(numAfter(text, '面值'), ctx.a.face) || 0;
        const price = firstNum(numAfter(text, '发行价'), numAfter(text, '实际收到'), ctx.a.price) || 0;

        if (/(到期|偿还|兑付)/.test(text)) {
          const amt = firstNum(ctx.a.amount, face) || 0;
          return [E(ctx, '债券到期还本付息', [
            d('250201', amt, `偿还面值 ${fmt(amt)} 元`, '冲减应付债券—面值'),
            c('1002', amt, `银行付款 ${fmt(amt)} 元`, '银行存款减少')
          ], explain('债券到期，按面值偿还本金，冲减"应付债券—面值"。',
            [['业务实质', '清偿债券本金'], ['科目选择', '借"应付债券—面值"，贷"银行存款"'],
            ['金额', `面值 ${fmt(amt)} 元`], ['方向', '负债减少记借方；资产减少记贷方']],
            ['最后一期还要摊销完"利息调整"明细。'], '《企业会计准则第22号——金融工具确认和计量》'))];
        }

        if (/(计提|利息|摊销)/.test(text) && !/(发行)/.test(text)) {
          const couponRate = rateNear(text, '票面利率') || 0.05;
          const effRate = rateNear(text, '实际利率') || couponRate;
          const faceVal = face || (ctx.bal ? ctx.bal('250201') : 0);
          const book = (ctx.bal ? ctx.bal('2502') : 0) || faceVal;
          const coupon = r2(faceVal * couponRate);
          const interest = r2(book * effRate);
          const adj = r2(interest - coupon);
          const lines = [d('6603', interest, `实际利息 = 期初摊余成本 × 实际利率 = ${fmt(interest)} 元`, '实际利率法'),
            c('2231', coupon, `票面利息 = 面值 × 票面利率 = ${fmt(coupon)} 元`, '应付未付利息')];
          if (Math.abs(adj) > 0.005) {
            if (adj > 0) lines.push(c('250202', adj, `利息调整摊销 ${fmt(adj)} 元`, '折价摊销，负债账面价值增加'));
            else lines.push(d('250202', -adj, `利息调整摊销 ${fmt(-adj)} 元`, '溢价摊销，负债账面价值减少'));
          }
          return [E(ctx, '计提债券利息并摊销利息调整', lines, explain(
            `实际利率法：利息费用按"期初摊余成本 × 实际利率"计算，与票面利息的差额摊销"利息调整"。`,
            [['业务实质', '融资成本的确认与溢折价摊销'],
            ['科目选择', '借"财务费用"（或在建工程）；贷"应付利息"、"应付债券—利息调整"'],
            ['金额', `实际利息 ${fmt(interest)}，票面利息 ${fmt(coupon)}，差额 ${fmt(adj)}`],
            ['方向', '费用增加记借方；负债增加记贷方']],
            ['折价发行时，实际利息大于票面利息，差额贷记"利息调整"（摊销折价）；溢价相反。'],
            '《企业会计准则第22号——金融工具确认和计量》'
          ))];
        }

        const cash = price || face;
        const lines = [d('1002', cash, `实际收到 ${fmt(cash)} 元`, '发行价格')];
        if (face > 0 && Math.abs(cash - face) > 0.005) {
          if (cash < face) lines.push(d('250202', r2(face - cash), `折价 ${fmt(r2(face - cash))} 元`, '发行价低于面值'));
          else lines.push(c('250202', r2(cash - face), `溢价 ${fmt(r2(cash - face))} 元`, '发行价高于面值'));
        }
        lines.push(c('250201', face || cash, `面值 ${fmt(face || cash)} 元`, '应付债券—面值'));
        return [E(ctx, '发行债券', lines, explain(
          `发行债券按实际收到的款项入账，面值记"应付债券—面值"，差额记"利息调整"（溢价或折价）。`,
          [['业务实质', '举借长期资金'], ['科目选择', '借"银行存款"；贷"应付债券—面值"、"应付债券—利息调整"'],
          ['金额', `面值 ${fmt(face || cash)}，实收 ${fmt(cash)}，差额 ${fmt(r2(face - cash))}`], ['方向', '资产增加记借方；负债增加记贷方']],
          ['发行费用应计入利息调整，不是当期费用。'], '《企业会计准则第22号——金融工具确认和计量》'))];
      }
    },

    /* ---------- 研发支出 ---------- */
    {
      id: 'rnd',
      title: '研发支出',
      scene: '研发',
      test(t) {
        return /(研发|研究阶段|开发阶段|开发支出)/.test(t) && !/(政府补助)/.test(t);
      },
      build(ctx) {
        const text = ctx.text;
        const amt = firstNum(ctx.a.amount, ctx.a.price, ctx.a.total) || 0;
        if (/(结转|转入无形资产|达到预定用途|完成)/.test(text)) {
          const cap = ctx.bal ? ctx.bal('530102') : amt;
          return [E(ctx, '开发支出结转无形资产', [
            d('1701', cap, `资本化支出 ${fmt(cap)} 元`, '达到预定用途，确认为无形资产'),
            c('530102', cap, `结转研发支出—资本化支出 ${fmt(cap)} 元`, '过渡账户结平')
          ], explain('开发阶段满足资本化条件的支出，先归集在"研发支出—资本化支出"，达到预定用途时转入无形资产。',
            [['业务实质', '研发成果转化为无形资产'], ['科目选择', '借"无形资产"，贷"研发支出—资本化支出"'],
            ['金额', `${fmt(cap)} 元`], ['方向', '资产增加记借方；成本类账户减少记贷方']],
            ['资本化条件包括技术可行性、意图、能力、经济利益、资源支持等五项。'], '《企业会计准则第6号——无形资产》'))];
        }
        const cap = /资本化/.test(text);
        return [E(ctx, cap ? '发生资本化研发支出' : '发生费用化研发支出', [
          d(cap ? '530102' : '530101', amt, `${cap ? '资本化' : '费用化'}支出 ${fmt(amt)} 元`, cap ? '满足资本化条件' : '研究阶段或不满足资本化条件'),
          c('1002', amt, `银行付款 ${fmt(amt)} 元`, '银行存款减少')
        ], explain(cap
          ? '开发阶段满足资本化条件的支出，计入"研发支出—资本化支出"，待达到预定用途转入无形资产。'
          : '研究阶段支出及不满足资本化条件的开发支出，计入"研发支出—费用化支出"，期末转入管理费用。',
          [['业务实质', cap ? '形成无形资产的前期投入' : '期间费用'],
          ['科目选择', cap ? '借"研发支出—资本化支出"' : '借"研发支出—费用化支出"；贷"银行存款"'],
          ['金额', `${fmt(amt)} 元`], ['方向', '成本/费用增加记借方；资产减少记贷方']],
          [cap ? '资本化要谨慎：只有开发阶段且满足五项条件才能资本化。' : '费用化支出期末要转入"管理费用"，不能长期挂在研发支出。'],
          '《企业会计准则第6号——无形资产》'))];
      }
    },

    /* ---------- 固定资产减值 ---------- */
    {
      id: 'fixed-impair',
      title: '固定资产减值',
      scene: '期末',
      test(t) {
        return /(减值)/.test(t) && /(固定资产|设备|机器|生产线)/.test(t) && !/(存货|坏账|投资性房地产)/.test(t);
      },
      build(ctx) {
        const amt = firstNum(ctx.a.amount, ctx.a.price) || 0;
        return [E(ctx, '计提固定资产减值准备', [
          d('6701', amt, `可收回金额低于账面价值 ${fmt(amt)} 元`, '账面价值 = 原值 − 累计折旧 − 已提减值'),
          c('1603', amt, `固定资产减值准备 ${fmt(amt)} 元`, '备抵账户，不得转回')
        ], explain('固定资产可收回金额低于账面价值时，差额计提减值准备；减值损失一经确认，以后期间不得转回。',
          [['业务实质', '资产账面价值高估'], ['科目选择', '借"资产减值损失"，贷"固定资产减值准备"'],
          ['金额', `账面价值 − 可收回金额 = ${fmt(amt)} 元`], ['方向', '损失增加记借方；备抵增加记贷方']],
          ['固定资产减值不得转回；存货跌价准备可以转回。', '计提减值后，折旧要按新的账面价值重新计算。'],
          '《企业会计准则第8号——资产减值》'))];
      }
    },

    /* ---------- 政府补助 ---------- */
    {
      id: 'gov-grant',
      title: '政府补助',
      scene: '其他',
      test(t) {
        return /(政府补助|财政补贴|补助款|财政拨款)/.test(t);
      },
      build(ctx) {
        const text = ctx.text;
        const amt = firstNum(ctx.a.amount, ctx.a.price) || 0;
        const assetRelated = /(与资产相关|购置|购建|设备|资产)/.test(text);
        if (/(分摊|确认收益)/.test(text)) {
          return [E(ctx, '分摊递延收益', [
            d('2401', amt, `分摊 ${fmt(amt)} 元`, '递延收益转入当期损益'),
            c('6301', amt, `其他收益 ${fmt(amt)} 元`, '与日常活动相关的政府补助')
          ], explain('与资产相关的政府补助，在资产使用寿命内按合理、系统的方法分期计入损益。',
            [['业务实质', '递延收益的分期确认'], ['科目选择', '借"递延收益"，贷"其他收益"'],
            ['金额', `${fmt(amt)} 元`], ['方向', '负债减少记借方；收益增加记贷方']],
            ['与日常活动相关记"其他收益"，无关的记"营业外收入"。'], '《企业会计准则第16号——政府补助》'))];
        }
        if (assetRelated) {
          return [E(ctx, '收到与资产相关的政府补助', [
            d('1002', amt, `收到补助 ${fmt(amt)} 元`, '银行存款增加'),
            c('2401', amt, `递延收益 ${fmt(amt)} 元`, '先确认负债，以后分期转入损益')
          ], explain('与资产相关的政府补助，先确认为递延收益，自相关资产达到预定可使用状态时起，在使用寿命内分期计入损益。',
            [['业务实质', '补偿未来资产成本'], ['科目选择', '借"银行存款"，贷"递延收益"'],
            ['金额', `${fmt(amt)} 元`], ['方向', '资产增加记借方；负债增加记贷方']],
            ['总额法下先记递延收益；净额法是冲减资产账面价值，两种方法只能选其一。'], '《企业会计准则第16号——政府补助》'))];
        }
        return [E(ctx, '收到与收益相关的政府补助', [
          d('1002', amt, `收到补助 ${fmt(amt)} 元`, '银行存款增加'),
          c('6301', amt, `其他收益 ${fmt(amt)} 元`, '补偿已发生的成本费用')
        ], explain('与收益相关、用于补偿已发生成本费用的政府补助，直接计入当期损益（其他收益）。',
          [['业务实质', '补偿已发生的费用'], ['科目选择', '借"银行存款"，贷"其他收益"'],
          ['金额', `${fmt(amt)} 元`], ['方向', '资产增加记借方；收益增加记贷方']],
          ['补偿以后期间费用的，应先记"递延收益"，再分期确认。'], '《企业会计准则第16号——政府补助》'))];
      }
    }
  ];

  root.RULE_GROUPS_ADVANCED = rules;
})(typeof globalThis !== 'undefined' ? globalThis : this);
