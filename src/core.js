/* ============================================================
 * core.js —— 科目表、金额与文本工具（无依赖）
 * 会计工作台 / 分录工坊
 * ============================================================ */
(function (root) {
  'use strict';

  /* ---------- 一、会计科目表 ----------
   * cat: 资产 | 负债 | 权益 | 成本 | 收入 | 费用 | 利润
   * dir: debit（借方增加）/ credit（贷方增加）
   * contra: 备抵/抵减账户（余额方向与所属大类相反）
   * temp: 过渡/归集账户（在资金流里承担"中转"角色）
   */
  const ACC = {

    '1131': { name: '应收股利', cat: '资产', dir: 'debit', note: '因股权投资应收取的现金股利或利润。' },
    '1404': { name: '材料成本差异', cat: '资产', dir: 'debit', temp: true, note: '计划成本法下实际成本与计划成本的差额，借方超支、贷方节约。' },

    '1502': { name: '其他债权投资', cat: '资产', dir: 'debit', note: '以公允价值计量且其变动计入其他综合收益的债务工具投资。' },
    '150201': { name: '其他债权投资—债券面值', cat: '资产', dir: 'debit', parent: '1502', note: '债券的票面金额。' },
    '150202': { name: '其他债权投资—利息调整', cat: '资产', dir: 'credit', parent: '1502', temp: true, note: '取得成本与面值的差额，按实际利率法摊销；贷方为折价、借方为溢价。' },
    '150203': { name: '其他债权投资—公允价值变动', cat: '资产', dir: 'debit', parent: '1502', note: '累计公允价值变动，对应其他综合收益。' },
    '150204': { name: '其他债权投资—应计利息', cat: '资产', dir: 'debit', parent: '1502', note: '到期一次还本付息债券的已计提未收利息。' },
    '400302': { name: '其他综合收益—金融资产公允价值变动', cat: '权益', dir: 'credit', parent: '4003', note: '其他债权投资公允价值变动形成的未实现利得或损失。' },
    '151101': { name: '长期股权投资—投资成本', cat: '资产', dir: 'debit', parent: '1511', note: '权益法下初始投资成本（含调整后的份额）。' },
    '151102': { name: '长期股权投资—损益调整', cat: '资产', dir: 'debit', parent: '1511', note: '权益法下按持股比例确认的净损益份额。' },
    '151103': { name: '长期股权投资—其他综合收益', cat: '资产', dir: 'debit', parent: '1511', note: '权益法下被投资方其他综合收益的份额。' },
    '151104': { name: '长期股权投资—其他权益变动', cat: '资产', dir: 'debit', parent: '1511', note: '权益法下被投资方除净损益、其他综合收益外的权益变动份额。' },
    '1521': { name: '投资性房地产', cat: '资产', dir: 'debit', note: '为赚取租金或资本增值而持有的房地产。' },
    '1522': { name: '投资性房地产累计折旧', cat: '资产', dir: 'credit', contra: true, note: '成本模式下投资性房地产的备抵账户。' },
    '1523': { name: '投资性房地产减值准备', cat: '资产', dir: 'credit', contra: true, note: '投资性房地产的减值准备。' },
    '1603': { name: '固定资产减值准备', cat: '资产', dir: 'credit', contra: true, note: '固定资产可收回金额低于账面价值的差额。' },
    '1611': { name: '使用权资产', cat: '资产', dir: 'debit', note: '承租人在租赁期内使用租赁资产的权利。' },
    '1612': { name: '使用权资产累计折旧', cat: '资产', dir: 'credit', contra: true, note: '使用权资产的备抵账户。' },
    '1703': { name: '无形资产减值准备', cat: '资产', dir: 'credit', contra: true, note: '无形资产可收回金额低于账面价值的差额。' },
    '2401': { name: '递延收益', cat: '负债', dir: 'credit', note: '政府补助等尚未确认的收益，需在以后期间分摊。' },
    '2502': { name: '应付债券', cat: '负债', dir: 'credit', note: '企业发行的长期债券。' },
    '250201': { name: '应付债券—面值', cat: '负债', dir: 'credit', parent: '2502', note: '债券票面金额。' },
    '250202': { name: '应付债券—利息调整', cat: '负债', dir: 'credit', parent: '2502', temp: true, note: '发行价与面值的差额，按实际利率法摊销。' },
    '2701': { name: '租赁负债', cat: '负债', dir: 'credit', note: '尚未支付的租赁付款额的现值。' },
    '4003': { name: '其他综合收益', cat: '权益', dir: 'credit', note: '未计入当期损益的各项利得和损失。' },
    '5301': { name: '研发支出', cat: '成本', dir: 'debit', temp: true, note: '研究与开发过程中发生的支出，分费用化与资本化。' },
    '530101': { name: '研发支出—费用化支出', cat: '成本', dir: 'debit', parent: '5301', note: '研究阶段及不满足资本化条件的开发支出，期末转入管理费用。' },
    '530102': { name: '研发支出—资本化支出', cat: '成本', dir: 'debit', parent: '5301', note: '满足资本化条件的开发支出，完工转入无形资产。' },
    '1001': { name: '库存现金', cat: '资产', dir: 'debit', note: '企业库存的现钞，日常零星支出用。' },
    '1002': { name: '银行存款', cat: '资产', dir: 'debit', note: '存放在银行等金融机构的款项，大额收付的主通道。' },
    '1012': { name: '其他货币资金', cat: '资产', dir: 'debit', note: '外埠存款、银行汇票存款、信用证保证金等。' },
    '1101': { name: '交易性金融资产', cat: '资产', dir: 'debit', note: '以公允价值计量且其变动计入当期损益的金融资产。' },
    '110101': { name: '交易性金融资产—成本', cat: '资产', dir: 'debit', parent: '1101', note: '取得时的公允价值，不含交易费用。' },
    '110102': { name: '交易性金融资产—公允价值变动', cat: '资产', dir: 'debit', parent: '1101', note: '资产负债表日公允价值与账面余额的差额。' },
    '1121': { name: '应收票据', cat: '资产', dir: 'debit', note: '因销售商品等收到的商业汇票（银行/商业承兑）。' },
    '1122': { name: '应收账款', cat: '资产', dir: 'debit', note: '因销售商品、提供劳务应向购货方收取的款项。' },
    '1123': { name: '预付账款', cat: '资产', dir: 'debit', note: '按合同预先付给供应商的款项，属于债权。' },
    '1221': { name: '其他应收款', cat: '资产', dir: 'debit', note: '除应收票据、应收账款、预付账款以外的应收暂付款项。' },
    '1231': { name: '坏账准备', cat: '资产', dir: 'credit', contra: true, note: '应收款项的备抵账户，抵减应收款项账面价值。' },
    '1401': { name: '材料采购', cat: '资产', dir: 'debit', temp: true, note: '计划成本法下核算材料采购成本的过渡账户。' },
    '1402': { name: '在途物资', cat: '资产', dir: 'debit', temp: true, note: '已付款或已开票但尚未验收入库的材料。' },
    '1403': { name: '原材料', cat: '资产', dir: 'debit', note: '库存的各种原料及主要材料、辅助材料等。' },
    '1405': { name: '库存商品', cat: '资产', dir: 'debit', note: '已完成生产、验收入库、可对外销售的产品。' },
    '1408': { name: '委托加工物资', cat: '资产', dir: 'debit', temp: true, note: '委托外单位加工的材料物资的实际成本。' },
    '1471': { name: '存货跌价准备', cat: '资产', dir: 'credit', contra: true, note: '存货的备抵账户，抵减存货可变现净值低于成本的差额。' },
    '1511': { name: '长期股权投资', cat: '资产', dir: 'debit', note: '对被投资单位实施控制、重大影响或共同控制的权益性投资。' },
    '1601': { name: '固定资产', cat: '资产', dir: 'debit', note: '使用寿命超过一个会计年度、为生产经营持有的有形资产。' },
    '1602': { name: '累计折旧', cat: '资产', dir: 'credit', contra: true, note: '固定资产的备抵账户，反映已计提的折旧总额。' },
    '1604': { name: '在建工程', cat: '资产', dir: 'debit', temp: true, note: '正在建造或安装、尚未达到预定可使用状态的工程支出。' },
    '1606': { name: '固定资产清理', cat: '资产', dir: 'debit', temp: true, note: '固定资产处置过程中的过渡账户，核算清理收支。' },
    '1701': { name: '无形资产', cat: '资产', dir: 'debit', note: '专利权、商标权、土地使用权、软件等可辨认非货币性资产。' },
    '1702': { name: '累计摊销', cat: '资产', dir: 'credit', contra: true, note: '无形资产的备抵账户，反映已摊销金额。' },
    '2001': { name: '短期借款', cat: '负债', dir: 'credit', note: '向银行等借入、期限在一年以内（含）的款项。' },
    '2201': { name: '应付票据', cat: '负债', dir: 'credit', note: '因购买材料、商品等开出、承兑的商业汇票。' },
    '2202': { name: '应付账款', cat: '负债', dir: 'credit', note: '因购买材料、商品或接受劳务应付给供应商的款项。' },
    '2203': { name: '预收账款', cat: '负债', dir: 'credit', note: '按合同预先向购货方收取的款项，属于负债。' },
    '2211': { name: '应付职工薪酬', cat: '负债', dir: 'credit', note: '应付给职工的各种形式的报酬及相关支出。' },
    '221101': { name: '应付职工薪酬—工资', cat: '负债', dir: 'credit', parent: '2211', note: '应发给职工的计时/计件工资、奖金、津贴。' },
    '221102': { name: '应付职工薪酬—社会保险费', cat: '负债', dir: 'credit', parent: '2211', note: '企业为职工承担的基本养老、医疗、工伤、失业、生育保险。' },
    '221103': { name: '应付职工薪酬—住房公积金', cat: '负债', dir: 'credit', parent: '2211', note: '企业为职工缴存的住房公积金（单位部分）。' },
    '221104': { name: '应付职工薪酬—职工福利费', cat: '负债', dir: 'credit', parent: '2211', note: '职工食堂、体检、节日慰问等福利支出。' },
    '2221': { name: '应交税费', cat: '负债', dir: 'credit', note: '按税法规定应缴纳的各种税费。' },
    '222101': { name: '应交税费—应交增值税', cat: '负债', dir: 'credit', parent: '2221', temp: true, note: '增值税的"价外税"专用账户，下设专栏分明细核算。' },
    '22210101': { name: '应交税费—应交增值税（进项税额）', cat: '负债', dir: 'debit', parent: '222101', note: '购进货物、服务支付的可抵扣增值税，记借方。' },
    '22210102': { name: '应交税费—应交增值税（销项税额）', cat: '负债', dir: 'credit', parent: '222101', note: '销售货物、服务收取的增值税，记贷方。' },
    '22210103': { name: '应交税费—应交增值税（进项税额转出）', cat: '负债', dir: 'credit', parent: '222101', note: '已抵扣但后续不得抵扣的进项税（如用于集体福利）。' },
    '22210104': { name: '应交税费—应交增值税（转出未交增值税）', cat: '负债', dir: 'debit', parent: '222101', temp: true, note: '月末把应交未交的增值税从"应交增值税"结转到"未交增值税"。' },
    '22210105': { name: '应交税费—应交增值税（已交税金）', cat: '负债', dir: 'debit', parent: '222101', note: '当月预缴当月增值税时使用。' },
    '222102': { name: '应交税费—未交增值税', cat: '负债', dir: 'credit', parent: '2221', note: '月末结转后，反映尚未缴纳的增值税。' },
    '222103': { name: '应交税费—应交所得税', cat: '负债', dir: 'credit', parent: '2221', note: '按应纳税所得额计算的应交企业所得税。' },
    '222104': { name: '应交税费—应交城市维护建设税', cat: '负债', dir: 'credit', parent: '2221', note: '以实际缴纳的增值税、消费税为计税依据。' },
    '222105': { name: '应交税费—教育费附加', cat: '负债', dir: 'credit', parent: '2221', note: '按增值税、消费税的3%计算。' },
    '222106': { name: '应交税费—地方教育附加', cat: '负债', dir: 'credit', parent: '2221', note: '按增值税、消费税的2%计算（各地或有差异）。' },
    '222107': { name: '应交税费—应交个人所得税', cat: '负债', dir: 'credit', parent: '2221', note: '企业代扣代缴的职工工资薪金个人所得税。' },
    '2231': { name: '应付利息', cat: '负债', dir: 'credit', note: '按合同约定应支付但尚未支付的利息。' },
    '2241': { name: '其他应付款', cat: '负债', dir: 'credit', note: '除应付票据、应付账款、预收账款等以外的应付暂收款项。' },
    '2232': { name: '应付股利', cat: '负债', dir: 'credit', note: '经股东大会或类似机构决议确定分配的现金股利或利润。' },
    '2501': { name: '长期借款', cat: '负债', dir: 'credit', note: '向银行等借入、期限在一年以上的款项。' },
    '4001': { name: '实收资本', cat: '权益', dir: 'credit', note: '投资者按章程或合同实际投入、构成注册资本的部分。' },
    '4002': { name: '资本公积', cat: '权益', dir: 'credit', note: '由资本溢价（股本溢价）等形成的、不属于留存收益的权益。' },
    '400201': { name: '资本公积—资本溢价', cat: '权益', dir: 'credit', parent: '4002', note: '投资者投入超过其在注册资本中所占份额的部分。' },
    '4101': { name: '盈余公积', cat: '权益', dir: 'credit', note: '从净利润中提取的积累资金。' },
    '410101': { name: '盈余公积—法定盈余公积', cat: '权益', dir: 'credit', parent: '4101', note: '按净利润10%提取，累计达注册资本50%可不再提取。' },
    '4103': { name: '本年利润', cat: '利润', dir: 'credit', temp: true, note: '期末结转收入与费用的"汇总过渡"账户，结转后无余额。' },
    '4104': { name: '利润分配', cat: '权益', dir: 'credit', note: '核算净利润的分配（或亏损的弥补）和历年结存。' },
    '410401': { name: '利润分配—未分配利润', cat: '权益', dir: 'credit', parent: '4104', note: '历年结存的未分配利润，可留待以后年度分配。' },
    '410402': { name: '利润分配—提取法定盈余公积', cat: '权益', dir: 'credit', parent: '4104', note: '利润分配的明细去向之一，年末转入未分配利润。' },
    '410403': { name: '利润分配—应付现金股利', cat: '权益', dir: 'credit', parent: '4104', note: '经股东大会决议宣告分配给股东的现金股利。' },
    '5001': { name: '生产成本', cat: '成本', dir: 'debit', temp: true, note: '归集产品生产过程中发生的直接材料、直接人工和制造费用。' },
    '500101': { name: '生产成本—基本生产成本', cat: '成本', dir: 'debit', parent: '5001', note: '基本生产车间为生产产品发生的成本。' },
    '5101': { name: '制造费用', cat: '成本', dir: 'debit', temp: true, note: '车间为组织生产发生的间接费用，期末分配转入生产成本。' },
    '6001': { name: '主营业务收入', cat: '收入', dir: 'credit', note: '销售商品、提供劳务等日常活动实现的收入。' },
    '6051': { name: '其他业务收入', cat: '收入', dir: 'credit', note: '销售材料、出租资产等非主营业务的收入。' },
    '6101': { name: '公允价值变动损益', cat: '收入', dir: 'credit', note: '交易性金融资产等公允价值变动形成的应计入当期损益的利得或损失。' },
    '6111': { name: '投资收益', cat: '收入', dir: 'credit', note: '对外投资取得的收益或发生的损失（损失记借方）。' },
    '6115': { name: '资产处置损益', cat: '收入', dir: 'credit', note: '处置固定资产、无形资产等产生的处置利得或损失。' },
    '6301': { name: '营业外收入', cat: '收入', dir: 'credit', note: '与日常活动无直接关系的利得，如政府补助、盘盈利得。' },
    '6401': { name: '主营业务成本', cat: '费用', dir: 'debit', note: '销售商品、提供劳务等主营业务所结转的成本。' },
    '6402': { name: '其他业务成本', cat: '费用', dir: 'debit', note: '销售材料、出租资产等所结转的成本。' },
    '6403': { name: '税金及附加', cat: '费用', dir: 'debit', note: '消费税、城建税、教育费附加、房产税、印花税等。' },
    '6601': { name: '销售费用', cat: '费用', dir: 'debit', note: '销售过程中发生的运输、广告、展览、销售人员薪酬等。' },
    '6602': { name: '管理费用', cat: '费用', dir: 'debit', note: '企业行政管理部门为组织和管理生产经营发生的费用。' },
    '6603': { name: '财务费用', cat: '费用', dir: 'debit', note: '利息支出、手续费、汇兑损益等筹资相关费用。' },
    '6701': { name: '资产减值损失', cat: '费用', dir: 'debit', note: '存货、固定资产等资产减值形成的损失。' },
    '6702': { name: '信用减值损失', cat: '费用', dir: 'debit', note: '应收款项等金融资产计提坏账形成的损失。' },
    '6711': { name: '营业外支出', cat: '费用', dir: 'debit', note: '与日常活动无直接关系的损失，如捐赠、罚款、盘亏。' },
    '6801': { name: '所得税费用', cat: '费用', dir: 'debit', note: '按应纳税所得额计算的当期所得税费用。' }
  };

  // 补齐 root（一级科目代码）与层级
  Object.keys(ACC).forEach((code) => {
    const a = ACC[code];
    a.code = code;
    a.root = code.slice(0, 4);
    a.level = code.length > 4 ? 2 : 1;
  });

  function acct(code) {
    return ACC[code] || { code, name: code, cat: '资产', dir: 'debit', note: '' };
  }
  function acctName(code) {
    return acct(code).name;
  }

  /* ---------- 二、金额工具 ---------- */
  const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  const isNum = (n) => typeof n === 'number' && isFinite(n);

  function fmt(n, opt) {
    if (!isNum(n)) return '—';
    const o = opt || {};
    const neg = n < 0;
    const v = Math.abs(round2(n));
    let s = v.toLocaleString('zh-CN', { minimumFractionDigits: o.dp === 0 ? 0 : 2, maximumFractionDigits: o.dp === 0 ? 0 : 2 });
    if (o.dp === 0) s = Math.round(v).toLocaleString('zh-CN');
    return (neg ? '−' : '') + s;
  }
  // 用于公式展示的紧凑数字（无千分位）
  function plain(n) {
    const v = round2(n);
    return (Math.round(v * 100) % 100 === 0 ? String(Math.round(v)) : v.toFixed(2));
  }

  /* ---------- 三、中文数字与金额识别 ---------- */
  const CN_DIGIT = { 零: 0, 〇: 0, 一: 1, 壹: 1, 二: 2, 贰: 2, 两: 2, 三: 3, 叁: 3, 四: 4, 肆: 4, 五: 5, 伍: 5, 六: 6, 陆: 6, 七: 7, 柒: 7, 八: 8, 捌: 8, 九: 9, 玖: 9 };
  const CN_UNIT = { 十: 10, 拾: 10, 百: 100, 佰: 100, 千: 1000, 仟: 1000 };
  const CN_BIG = { 万: 1e4, 亿: 1e8 };

  function cn2num(str) {
    if (!str) return NaN;
    let total = 0, section = 0, num = 0, seen = false;
    for (const ch of str) {
      if (ch in CN_DIGIT) { num = CN_DIGIT[ch]; seen = true; }
      else if (ch in CN_UNIT) { if (num === 0) num = 1; section += num * CN_UNIT[ch]; num = 0; seen = true; }
      else if (ch in CN_BIG) { section += num; total += section * CN_BIG[ch]; section = 0; num = 0; seen = true; }
      else return NaN;
    }
    if (!seen) return NaN;
    return total + section + num;
  }

  const NUM_RE = /(?:(?:人民币|RMB|￥|¥)\s*)?((?:\d{1,3}(?:[,，]\d{3})+|\d+(?:\.\d+)?)|[零〇一壹二贰两三叁四肆五伍六陆七柒八捌九玖十拾百佰千仟万]+)\s*(万元|万|元|块)?/g;

  /* ---------- 四、日期 ---------- */
  const pad2 = (n) => String(n).padStart(2, '0');
  function toDate(y, m, d) {
    if (!m) return null;
    const dt = new Date(y, (m || 1) - 1, d || 1);
    if (isNaN(dt.getTime())) return null;
    return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
  }
  function parseDate(text, fallbackYear) {
    let m = text.match(/(\d{4})\s*年\s*(\d{1,2})\s*月(?:\s*(\d{1,2})\s*[日号])?/);
    if (m) return toDate(+m[1], +m[2], m[3] ? +m[3] : 1);
    m = text.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]/);
    if (m) return toDate(fallbackYear, +m[1], +m[2]);
    return null;
  }
  function addDays(iso, n) {
    const d = new Date(iso + 'T00:00:00');
    d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }
  function cnDate(iso) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    return `${y}年${+m}月${+d}日`;
  }

  /* ---------- 五、金额抽取（带语义线索） ---------- */
  const LABEL_KWS = [
    '价税合计', '含税价', '含税', '不含税', '增值税', '进项税额', '销项税额', '税额',
    '运费', '运输费', '安装费', '调试费', '包装费', '保险费', '交易费用', '手续费', '佣金', '贴现息', '面值', '票面',
    '可变现净值', '净值', '市价',
    '工资', '薪酬', '个人所得税', '个税', '社会保险费', '社会保险', '社保', '公积金', '福利费',
    '折旧', '利息', '租金', '借款', '本金', '投资款', '出资额', '注册资本', '溢价',
    '实收资本', '股本', '份额', '资本公积', '盈余公积', '未分配利润', '股利',
    '成本', '售价', '销售额', '收入', '费用', '金额', '价款', '货款', '合计', '总额', '余额', '原值', '市值', '公允价值'
  ];
  const SKIP_AFTER = /^(年|月|日|号|%|％|吨|件|台|个|人|天|小时|千克|公斤|平方|米|股|份|期|次|台班|批次|年利率)/;

  function extractAmounts(text) {
    const out = [];
    NUM_RE.lastIndex = 0;
    let m;
    while ((m = NUM_RE.exec(text))) {
      const raw = m[1];
      const unit = m[2] || '';
      const idx = m.index;
      const after = text.slice(idx + m[0].length);
      const isCn = !/[\d]/.test(raw);
      // 中文字符必须带"元/万"单位，避免把"一批""三项"当金额
      if (isCn && !unit) continue;
      if (!unit && SKIP_AFTER.test(after)) continue;
      if (unit === '%' || unit === '％') continue;
      let val = /[\d]/.test(raw) ? Number(raw.replace(/[,，]/g, '')) : cn2num(raw);
      if (!isFinite(val)) continue;
      if (unit === '万元' || unit === '万') val *= 10000;
      const before = text.slice(Math.max(0, idx - 16), idx);
      // 与紧邻的百分号区分
      if (/[%％]\s*$/.test(text.slice(0, idx))) continue;
      out.push({
        index: idx,
        raw: m[0].trim(),
        value: round2(val),
        unit,
        before,
        after: after.slice(0, 16),
        label: inferLabel(before, after)
      });
    }
    return out;
  }

  function inferLabel(before, after) {
    // 取"结束位置最靠后"的关键词；位置相同时取更长的（"交易费用" 优于 "费用"）
    let best = null, bestEnd = -1, bestLen = 0;
    for (const kw of LABEL_KWS) {
      let p = before.lastIndexOf(kw);
      if (p < 0) continue;
      const end = p + kw.length;
      if (end > bestEnd || (end === bestEnd && kw.length > bestLen)) { bestEnd = end; bestLen = kw.length; best = kw; }
    }
    if (best && bestEnd >= Math.max(0, before.length - 14)) return best;
    // 金额后面的说明文字里带关键词："1000000元计入实收资本"
    let bestAfter = null, bestAfterEnd = -1;
    for (const kw of LABEL_KWS) {
      const p = after.indexOf(kw);
      if (p < 0 || p > 8) continue;
      const end = p + kw.length;
      if (end > bestAfterEnd || (end === bestAfterEnd && kw.length > (bestAfter || '').length)) { bestAfterEnd = end; bestAfter = kw; }
    }
    return bestAfter || '';
  }

  function extractRate(text, dflt) {
    const m = text.match(/(\d{1,2}(?:\.\d+)?)\s*[%％]/);
    if (m) return { rate: Number(m[1]) / 100, raw: m[0] };
    if (/税率/.test(text)) {
      const m2 = text.match(/税率[^\d]{0,6}(\d{1,2}(?:\.\d+)?)/);
      if (m2) return { rate: Number(m2[1]) / 100, raw: m2[0] };
    }
    return { rate: dflt, raw: '' };
  }

  const api = {
    ACC, acct, acctName,
    round2, isNum, fmt, plain,
    cn2num, extractAmounts, extractRate, inferLabel,
    parseDate, cnDate, addDays, toDate, pad2
  };
  Object.assign(root, api);
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
