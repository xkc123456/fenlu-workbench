/* ============================================================
 * app.js —— 界面渲染与交互
 * ============================================================ */
(function () {
  'use strict';
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const fmt = window.fmt, esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const rich = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  const state = {
    source: '',
    parsed: null,
    summary: null,
    view: 'blocks',
    auto: false,
    showZero: false,
    opening: {},
    playTimer: null
  };

  /* ---------------- 入口 ---------------- */
  const VIEWS = { blocks: '#viewBlocks', trial: '#viewTrial', reports: '#viewReports', flow: '#viewFlow', coverage: '#viewCoverage' };

  function switchView(name) {
    state.view = name;
    $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === name));
    $$('.view').forEach((v) => v.classList.add('hidden'));
    const target = $(VIEWS[name]);
    if (target) target.classList.remove('hidden');
    setupZoom();
  }

  function init() {
    $('#btnRun').addEventListener('click', run);
    $('#btnPrint').addEventListener('click', () => window.print());
    $('#btnPresent').addEventListener('click', () => openPresent(null));
    $('#btnExport').addEventListener('click', exportMarkdown);
    $('#tabs').addEventListener('click', (e) => {
      const b = e.target.closest('.tab'); if (!b) return;
      switchView(b.dataset.view);
    });
    $$('.chip[data-example]').forEach((b) => b.addEventListener('click', () => loadExample(b.dataset.example)));
    $('#source').addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') run();
    });

    // 文件 / 图片导入
    $('#btnImportFile').addEventListener('click', () => $('#fileInput').click());
    $('#btnImportImage').addEventListener('click', () => $('#imageInput').click());
    if (window.Importer) {
      window.Importer.init({
        onText: (text) => {
          const ta = $('#source');
          ta.value = (ta.value.trim() ? ta.value.trim() + '\n' : '') + text.trim();
          run();
        }
      });
    }

    // 期初余额
    state.opening = window.Opening ? window.Opening.load() : {};
    updateOpeningLabel();
    $('#btnOpening').addEventListener('click', () => window.Opening.open({
      get: () => state.opening,
      onSave: (obj) => { state.opening = obj; updateOpeningLabel(); run(); }
    }));

    $('#btnHistory').addEventListener('click', (e) => {
      e.stopPropagation();
      renderHistory();
      $('#historyPanel').classList.toggle('hidden');
    });
    $('#historyPanel').addEventListener('click', (e) => {
      const item = e.target.closest('[data-hist]');
      if (item) {
        const h = readHistory()[Number(item.dataset.hist)];
        if (h) { $('#source').value = h.source; state.source = h.source; run(); }
        $('#historyPanel').classList.add('hidden');
        return;
      }
      if (e.target.closest('[data-histclear]')) {
        try { localStorage.removeItem(HIST_KEY); } catch (err) { /* ignore */ }
        renderHistory();
      }
    });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#historyPanel') && !e.target.closest('#btnHistory')) $('#historyPanel').classList.add('hidden');
    });

    document.addEventListener('click', onClick);
    window.addEventListener('beforeprint', () => { $$('details').forEach((d) => (d.dataset.wasOpen = d.open, d.open = true)); });
    window.addEventListener('afterprint', () => { $$('details').forEach((d) => { d.open = d.dataset.wasOpen === 'true'; }); });
    const q = new URLSearchParams(location.search);
    const v = q.get('view');
    if (v && ['blocks', 'trial', 'reports', 'flow', 'coverage'].indexOf(v) >= 0) {
      switchView(v);
    }
    const exKey = q.get('example');
    const ws = readWorkspace();
    if (!exKey && ws && ws.source) {
      if (ws.opts) {
        if (ws.opts.baseDate) $('#baseDate').value = ws.opts.baseDate;
        if (ws.opts.vatRate) $('#vatRate').value = String(ws.opts.vatRate);
        if (ws.opts.cityRate) $('#cityRate').value = String(ws.opts.cityRate);
        if (ws.opts.incomeRate) $('#incomeRate').value = String(ws.opts.incomeRate);
      }
      $('#autoClose').checked = !!ws.auto;
      if (ws.opening && Object.keys(ws.opening).length) state.opening = ws.opening;
      updateOpeningLabel();
      $('#source').value = ws.source;
      state.source = ws.source;
      run();
      $('#historyState').textContent = '已恢复上次题目';
    } else {
      loadExample(exKey && window.EXAMPLES[exKey] ? exKey : 'full');
    }
  }

  function loadExample(key) {
    const ex = window.EXAMPLES[key];
    if (!ex) return;
    state.source = ex.text;
    $('#source').value = ex.text;
    run();
  }

  const WS_KEY = 'fenlu-workspace-v1';
  const HIST_KEY = 'fenlu-history-v1';

  function readWorkspace() {
    try { return JSON.parse(localStorage.getItem(WS_KEY) || 'null'); } catch (e) { return null; }
  }
  function saveWorkspace() {
    try {
      localStorage.setItem(WS_KEY, JSON.stringify({
        source: state.source,
        auto: $('#autoClose').checked,
        opts: collectOpts(),
        opening: state.opening,
        ts: Date.now()
      }));
    } catch (e) { /* ignore */ }
  }
  function readHistory() {
    try { return JSON.parse(localStorage.getItem(HIST_KEY) || '[]'); } catch (e) { return []; }
  }
  function fmtTime(ts) {
    const d = new Date(ts || Date.now());
    return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }
  function pushHistory(src) {
    if (!src) return;
    const list = readHistory().filter((x) => x.source !== src);
    list.unshift({ ts: Date.now(), source: src });
    try { localStorage.setItem(HIST_KEY, JSON.stringify(list.slice(0, 8))); } catch (e) { /* ignore */ }
    renderHistory();
  }
  function renderHistory() {
    const panel = $('#historyPanel');
    if (!panel) return;
    const list = readHistory();
    if (!list.length) {
      panel.innerHTML = '<p class="history-empty">还没有记录。生成过一次分录后，题干会自动保存在这里。</p>';
      return;
    }
    panel.innerHTML = list.map((h, i) => {
      const first = (h.source || '').split('\n')[0].replace(/\s+/g, ' ');
      const preview = first.length > 34 ? first.slice(0, 34) + '…' : first;
      const lines = (h.source || '').split('\n').length;
      return '<button type="button" class="history-item" data-hist="' + i + '">' + esc(preview)
        + '<small>' + fmtTime(h.ts) + ' · ' + lines + ' 段</small></button>';
    }).join('') + '<button type="button" class="history-clear" data-histclear="1">清空历史</button>';
  }

  function updateOpeningLabel() {
    const n = window.Opening ? window.Opening.count(state.opening) : 0;
    const el = $('#openingState');
    if (el) el.textContent = n ? `已设置 ${n} 个科目` : '未设置（期初为 0）';
    const btn = $('#btnOpening');
    if (btn) btn.classList.toggle('on', !!n);
  }

  function collectOpts() {
    return {
      vatRate: Number($('#vatRate').value),
      cityRate: Number($('#cityRate').value),
      eduRate: 0.03,
      localEduRate: 0.02,
      incomeRate: Number($('#incomeRate').value),
      baseDate: $('#baseDate').value || '2026-03-31'
    };
  }

  function run() {
    state.source = $('#source').value.trim();
    if (!state.source) {
      $('#runHint').textContent = '题干还是空的，先粘贴一段业务描述吧。';
      return;
    }
    const opts = collectOpts();
    state.auto = $('#autoClose').checked;
    try {
      const parsed = window.parseInput(state.source, opts);
      parsed.opening = state.opening;
      if (state.auto) window.autoClose(parsed, { surplus: true });
      state.parsed = parsed;
      state.summary = window.summarize(parsed, state.opening);
      render();
      const n = state.summary.blocks.length;
      const lines = state.parsed.entries.reduce((s, e) => s + e.lines.length, 0);
      $('#runHint').textContent = `已解析 ${n} 个板块、${state.parsed.entries.length} 笔分录、${lines} 行。`;
      saveWorkspace();
      pushHistory(state.source);
    } catch (err) {
      console.error(err);
      $('#runHint').textContent = '解析出错：' + err.message;
    }
  }

  /* ---------------- 总渲染 ---------------- */
  function render() {
    const s = state.summary;
    if (!s) return;
    $('#emptyState').classList.add('hidden');
    renderBadge(s);
    renderBlocks(s);
    renderTrial(s);
    renderReports(s);
    renderFlowAll(s);
    renderCoverage();
    switchView(state.view);
    const m = /^#blk-(\d+)$/.exec(location.hash || '');
    if (m && state.view === 'blocks') {
      const el = document.getElementById('blk-' + m[1]);
      if (el) setTimeout(() => el.scrollIntoView({ block: 'start' }), 30);
    }
  }

  function renderBadge(s) {
    const b = $('#balanceBadge');
    const ok = s.trial.balanced;
    const warn = s.checks.filter((c) => c.level === 'warn' || c.level === 'bad').length;
    b.className = 'badge ' + (ok ? (warn ? 'badge-warn' : 'badge-ok') : 'badge-bad');
    b.textContent = ok ? (warn ? `${warn} 处需留意` : '借贷平衡') : '借贷不平';
    b.title = `借方 ${fmt(s.trial.debitSum)} / 贷方 ${fmt(s.trial.creditSum)}`;
  }

  /* ---------------- 板块 ---------------- */
  function renderBlocks(s) {
    const host = $('#viewBlocks');
    host.innerHTML = '';
    if (!s.blocks.length) {
      host.innerHTML = '<div class="empty small"><p>没有识别出可生成分录的业务。试试\"购入原材料一批，价款100 000元，增值税13 000元，款项未付\"。</p></div>';
      return;
    }
    const nav = document.createElement('div');
    nav.className = 'blocknav';
    nav.innerHTML = s.blocks.map((b, i) => { const e0 = b.entries[0] || {}; const label = (e0.memo || e0.ruleTitle || b.label || '').replace(/^[①②③④⑤⑥⑦⑧⑨⑩]\s*/, ''); return `<a href="#blk-${b.index}" title="${esc(label)}">${String(i + 1).padStart(2, '0')} ${esc(label)}</a>`; }).join('');
    host.appendChild(nav);

    s.blocks.forEach((b, i) => host.appendChild(renderBlock(b, i)));
    const tail = document.createElement('div');
    tail.className = 'tail-actions';
    const hasClose = state.parsed.blocks.some((x) => x.auto);
    tail.innerHTML = `
      <div class="tail-card">
        <h4>${hasClose ? '已生成期末结转' : '还差期末处理？'}</h4>
        <p>${hasClose ? '自动结转板块已在最后，包含增值税结转、附加税、所得税、损益结转与利润分配。修改题干后重新点击即可刷新。' : '按本期账目自动生成：转出未交增值税 → 城建税及附加 → 所得税 → 结转收入/费用 → 本年利润 → 提取盈余公积。'}</p>
        <button type="button" class="ghost" data-act="${hasClose ? 'reclose' : 'close'}">${hasClose ? '重新生成期末结转' : '生成期末结转'}</button>
      </div>`;
    host.appendChild(tail);
  }

  function renderBlock(b, i) {
    const art = document.createElement('article');
    art.className = 'block';
    art.id = 'blk-' + b.index;
    const title = (b.entries[0] || {}).ruleTitle || b.label || `板块 ${i + 1}`;
    const dates = Array.from(new Set(b.entries.map((e) => e.date))).join(' / ');
    const status = b.balanced ? '<span class="pill ok">借贷平衡</span>' : '<span class="pill bad">借贷不平</span>';
    const warn = b.warnings.length ? `<div class="warn">${b.warnings.map((w) => `<p>${esc(w)}</p>`).join('')}</div>` : '';

    art.innerHTML = `
      <header class="block-head">
        <span class="block-no">${String(i + 1).padStart(2, '0')}</span>
        <div class="block-title">
          <h2>${esc(title)}</h2>
          <p class="block-meta">${esc(dates)} · ${b.entries.length} 笔分录 · 借 ${fmt(b.dSum)} / 贷 ${fmt(b.cSum)} ${status}
            ${b.auto ? '<span class="pill auto">自动结转</span>' : ''}</p>
        </div>
        <div class="block-tools">
          <button type="button" class="link" data-act="edit" data-index="${b.index}">改文字</button>
          <button type="button" class="link" data-act="present" data-index="${b.index}">演示</button>
          <button type="button" class="link" data-act="play" data-index="${b.index}">播放箭头</button>
        </div>
      </header>
      <blockquote class="clause" id="clause-${b.index}">${esc(b.raw || b.entries.map((e) => e.clauseText).join('；'))}</blockquote>
      ${warn}
      <div class="entries">${b.entries.map((e, k) => entryHTML(e, k, b.index)).join('')}</div>
      ${flowHTML(b)}
      ${tHTML(b)}
    `;
    return art;
  }

  function entryHTML(e, k, bi) {
    if (!e.lines.length) {
      return `<div class="entry entry-empty" id="e-${bi}-${k}">
        <div class="entry-bar"><span class="entry-no">分录 ${k + 1}</span><span class="entry-memo">${esc(e.memo)}</span></div>
        <p class="entry-unknown">「${esc(e.clauseText)}」里有金额，但没能匹配到内置业务。可把表述改得更标准（如"购入原材料一批，价款…，增值税…，款项未付"），或在题干中用 <code>借：科目 金额</code> 手工录入。</p>
      </div>`;
    }
    const rows = e.lines.map((l, li) => {
      const a = window.acct(l.code);
      const name = a.name;
      return `<tr class="line ${l.side === 'D' ? 'is-d' : 'is-c'}">
        <td class="side"><span class="tag ${l.side === 'D' ? 'tag-d' : 'tag-c'}">${l.side === 'D' ? '借' : '贷'}</span></td>
        <td class="acct"><span class="acct-name">${esc(name)}</span><span class="acct-code">${l.code}</span></td>
        <td class="amt">${l.side === 'D' ? amountBtn(l.amount, bi, k, li) : ''}</td>
        <td class="amt">${l.side === 'C' ? amountBtn(l.amount, bi, k, li) : ''}</td>
        <td class="calc"><span class="calc-main">${esc(l.calc || '')}</span>${l.basis ? `<span class="calc-basis">${esc(l.basis)}</span>` : ''}</td>
      </tr>`;
    }).join('');

    const ex = e.ex || {};
    const steps = (ex.steps || []).map((s, i) => `<div class="step"><span class="step-no">${'①②③④'[i] || i + 1}</span><div><b>${esc(s.k)}</b><p>${rich(s.v)}</p></div></div>`).join('');
    const pitfalls = (ex.pitfalls || []).length
      ? `<div class="pitfalls"><h5>容易记错的地方</h5><ul>${ex.pitfalls.map((p) => `<li>${rich(p)}</li>`).join('')}</ul></div>` : '';

    return `<div class="entry" id="e-${bi}-${k}">
      <div class="entry-bar">
        <span class="entry-no">分录 ${k + 1}</span>
        <span class="entry-memo">${esc(e.memo)}</span>
        <span class="entry-rule">${esc(e.ruleTitle || '')}</span>
      </div>
      <div class="tablewrap">
        <table class="et">
          <thead><tr><th class="c-side">方向</th><th class="c-acct">科目</th><th class="c-amt">借方金额</th><th class="c-amt">贷方金额</th><th class="c-calc">数字怎么来的 / 记账依据</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div class="explain">
        <p class="logic">${rich(ex.logic || '')}</p>
        <div class="steps">${steps}</div>
        ${pitfalls}
        ${ex.std ? `<p class="std">依据：${esc(ex.std)}</p>` : ''}
      </div>
    </div>`;
  }

  function amountBtn(amount, bi, ei, li) {
    return `<button type="button" class="numq" data-q="line" data-b="${bi}" data-e="${ei}" data-l="${li}" title="点我看这笔数字怎么来的">${fmt(amount)}<span class="qmark">?</span></button>`;
  }

  function flowHTML(b) {
    if (!b.entries.length) return '';
    const flow = window.buildFlow(b.entries);
    const svg = window.renderFlow(flow, { uid: 'b' + b.index });
    const steps = flow.steps.map((s) => `<li><b>${s.i + 1}</b>${esc(s.memo)}</li>`).join('');
    return `<section class="flowbox">
      <div class="flow-head">
        <h3>资金流向 · T 型账户</h3>
        <span class="flow-hint">箭头从贷方科目指向借方科目，标注的是这笔钱的金额</span>
        <button type="button" class="link" data-act="play" data-index="${b.index}">▶ 逐步播放</button>
      </div>
      <div class="flow-scroll zoomable" data-flow="${b.index}" data-block="${b.index}">${svg}</div>
      <p class="zoom-hint">Ctrl + 滚轮缩放 · 按住拖拽平移 · 双击复位 · 点击箭头/科目看讲解</p>
      <ol class="flow-steps">${steps}</ol>
    </section>`;
  }

  function tHTML(b) {
    if (!b.t || !b.t.length) return '';
    const cards = b.t.map((a) => {
      const meta = window.acct(a.code);
      const dRows = a.debit.map((x) => `<li title="${esc(x.memo)}"><span>${esc(x.memo)}</span><b>${fmt(x.amount)}</b></li>`).join('') || '<li class="none">—</li>';
      const cRows = a.credit.map((x) => `<li title="${esc(x.memo)}"><span>${esc(x.memo)}</span><b>${fmt(x.amount)}</b></li>`).join('') || '<li class="none">—</li>';
      return `<div class="tcard">
        <header>
          <div class="tname" title="${esc(meta.name)}">${esc(meta.name)}</div>
          <div class="tmeta"><span class="tcode">${a.code}</span>${a.contra ? '<span class="pill contra">备抵</span>' : ''}${meta.temp ? '<span class="pill temp">过渡</span>' : ''}</div>
        </header>
        <div class="tcols">
          <div class="tside"><h5>借方</h5><ul>${dRows}</ul><footer>合计 ${fmt(a.dSum)}</footer></div>
          <div class="tside"><h5>贷方</h5><ul>${cRows}</ul><footer>合计 ${fmt(a.cSum)}</footer></div>
        </div>
        <p class="tbal">余额 ${a.side ? a.side + ' ' + fmt(a.balance) : '0.00'}</p>
      </div>`;
    }).join('');
    return `<details class="tbox"><summary>展开 T 型账户（${b.t.length} 个）</summary><div class="tgrid">${cards}</div></details>`;
  }

  /* ---------------- 试算平衡 ---------------- */
  function renderTrial(s) {
    const hasOpen = !!(s.trial.obD || s.trial.obC);
    const rows = s.trial.rows.map((r) => `<tr>
      <td class="mono">${r.code}</td>
      <td>${esc(r.name)}${r.contra ? ' <span class="pill contra">备抵</span>' : ''}</td>
      <td class="dim">${esc(r.cat)}</td>
      ${hasOpen ? `<td class="amt dim-amt">${r.obDebit ? fmt(r.obDebit) : ''}</td><td class="amt dim-amt">${r.obCredit ? fmt(r.obCredit) : ''}</td>` : ''}
      <td class="amt">${r.debit ? fmt(r.debit) : ''}</td>
      <td class="amt">${r.credit ? fmt(r.credit) : ''}</td>
      <td class="side-c">${r.side}</td>
      <td class="amt">${r.balance ? fmt(r.balance) : ''}</td>
    </tr>`).join('');
    const checks = s.checks.map((c) => `<li class="chk ${c.level}"><span class="dot"></span>${esc(c.text)}</li>`).join('');
    const pl = s.pl;
    $('#viewTrial').innerHTML = `
      <section class="card">
        <h2 class="card-h">勾稽检查</h2>
        <ul class="checks">${checks}</ul>
      </section>
      <section class="card">
        <h2 class="card-h">试算平衡表 <span class="muted">${hasOpen ? '期初余额 + 本期发生额 + 期末余额' : '本期发生额与期末余额'}</span></h2>
        <div class="tablewrap"><table class="tb">
          <thead><tr><th>代码</th><th>科目</th><th>类别</th>${hasOpen ? '<th class="c-amt">期初借方</th><th class="c-amt">期初贷方</th>' : ''}<th class="c-amt">本期借方</th><th class="c-amt">本期贷方</th><th>方向</th><th class="c-amt">期末余额</th></tr></thead>
          <tbody>${rows}</tbody>
          <tfoot><tr><td colspan="3">合计</td>${hasOpen ? `<td class="amt">${fmt(s.trial.obD)}</td><td class="amt">${fmt(s.trial.obC)}</td>` : ''}<td class="amt">${fmt(s.trial.debitSum)}</td><td class="amt">${fmt(s.trial.creditSum)}</td><td></td><td class="amt">${fmt(s.trial.balD)} / ${fmt(s.trial.balC)}</td></tr></tfoot>
        </table></div>
        <p class="note">借方合计 = 贷方合计，且借方余额合计 = 贷方余额合计，才说明记账没有破坏会计恒等式。${hasOpen ? ' 期初余额也需借贷平衡；不平衡时请回到「期初余额」检查。' : ''}</p>
      </section>
      <section class="card">
        <h2 class="card-h">利润表（简表）</h2>
        <div class="plgrid">
          <div><span>营业收入</span><b>${fmt(pl.revenue)}</b></div>
          <div><span>成本费用合计</span><b>${fmt(pl.expense)}</b></div>
          <div class="${pl.profitBeforeTax >= 0 ? 'pos' : 'neg'}"><span>利润总额</span><b>${fmt(pl.profitBeforeTax)}</b></div>
          <div><span>所得税费用</span><b>${fmt(pl.incomeTax)}</b></div>
          <div class="${pl.profitBeforeTax - pl.incomeTax >= 0 ? 'pos' : 'neg'}"><span>净利润</span><b>${fmt(pl.profitBeforeTax - pl.incomeTax)}</b></div>
        </div>
      </section>`;
  }

  /* ---------------- 全景资金流：逐板块图 + 余额速览 ---------------- */
  function renderFlowAll(s) {
    const blocks = s.blocks.filter((b) => b.entries.length);
    if (!blocks.length) { $('#viewFlow').innerHTML = ''; return; }
    const bal = (code) => window.balanceOf(s.ledger, code);
    const chips = [
      ['货币资金', window.round2(bal('1001') + bal('1002'))],
      ['存货（原材料+库存商品）', window.round2(bal('1403') + bal('1405'))],
      ['未交税费', window.round2(bal('222102') + bal('222103'))],
      ['未分配利润', bal('410401')]
    ].map((x) => `<div class="kpi"><span>${x[0]}</span><b>${fmt(x[1])}</b></div>`).join('');

    const cards = blocks.map((b, i) => {
      const flow = window.buildFlow(b.entries);
      const svg = window.renderFlow(flow, { uid: 'f' + b.index });
      const title = (b.entries[0] || {}).ruleTitle || b.label;
      return `<div class="miniflow">
        <header>
          <span class="mf-no">${String(i + 1).padStart(2, '0')}</span>
          <h4><a href="#blk-${b.index}">${esc(title)}</a></h4>
          <button type="button" class="link" data-act="play" data-index="${b.index}">▶ 播放</button>
        </header>
        <div class="flow-scroll mini" data-flow="${b.index}">${svg}</div>
      </div>`;
    }).join('');

    $('#viewFlow').innerHTML = `
      <section class="card">
        <h2 class="card-h">资金流总览 <span class="muted">${blocks.length} 个板块 · ${state.parsed.entries.length} 笔分录</span></h2>
        <p class="note">每个板块一张图：箭头从贷方科目指向借方科目，标注的是这笔业务的金额。虚框为备抵账户（累计折旧、坏账准备、存货跌价准备），带"过渡"标记的是归集中转账户（生产成本、制造费用、在建工程、本年利润等）。</p>
        <div class="kpis">${chips}</div>
        <div class="legend">
          <span><i style="background:#eef4fb;border-color:#9dbcd9"></i>资产</span>
          <span><i style="background:#fdf3e4;border-color:#d9b98a"></i>负债</span>
          <span><i style="background:#f3effb;border-color:#b6a6d6"></i>权益</span>
          <span><i style="background:#eaf6f2;border-color:#8fc4b2"></i>成本</span>
          <span><i style="background:#edf7ea;border-color:#9fc98e"></i>收入</span>
          <span><i style="background:#fbeceb;border-color:#d9a09c"></i>费用</span>
          <span class="dash"><i></i>备抵</span>
        </div>
        <div class="flowgrid">${cards}</div>
      </section>`;
  }

  /* ---------------- 交互 ---------------- */
  let suppressClick = false;

  function findBlock(bi) {
    return (state.summary && state.summary.blocks.find((b) => b.index === bi)) || { entries: [] };
  }

  function onClick(e) {
    const q = e.target.closest('[data-q="line"]');
    if (q) { e.stopPropagation(); explainLine(+q.dataset.b, +q.dataset.e, +q.dataset.l); return; }

    const go = e.target.closest('[data-goto]');
    if (go) { e.stopPropagation(); jumpTo(go.dataset.goto); return; }

    if (e.target.closest('[data-qclose]')) { hideQ(); return; }

    const edge = e.target.closest('.flow-edge');
    if (edge && !suppressClick) {
      const box = edge.closest('[data-block]');
      if (box) { explainEntry(+box.dataset.block, +edge.dataset.step, edge.dataset.from, edge.dataset.to); return; }
    }
    const node = e.target.closest('.flow-node');
    if (node && !suppressClick) {
      const box = node.closest('[data-block]');
      if (box) { explainNode(+box.dataset.block, node.dataset.code); return; }
    }

    const btn = e.target.closest('[data-act]');
    if (btn) {
      const act = btn.dataset.act;
      const idx = btn.dataset.index;
      if (act === 'play') playFlow(idx === 'all' ? 'all' : Number(idx), btn);
      else if (act === 'close' || act === 'reclose') { generateClose(); }
      else if (act === 'edit') startEdit(Number(idx));
      else if (act === 'saveedit') saveEdit(Number(idx));
      else if (act === 'present') openPresent(Number(idx));
      else if (act === 'zero') { state.showZero = !state.showZero; renderReports(state.summary); }
      else if (act === 'canceledit') renderBlocks(state.summary);
      return;
    }
    const card = e.target.closest('.tcard');
    if (card) card.classList.toggle('hl');
  }

  function playFlow(id, btn) {
    const wrap = id === 'all' ? $('[data-flow="all"]') : $(`[data-flow="${id}"]`);
    if (!wrap) return;
    const svg = wrap.querySelector('svg');
    const edges = $$('.flow-edge', svg);
    if (!edges.length) return;
    if (state.playTimer) { clearTimeout(state.playTimer); state.playTimer = null; }
    const steps = Array.from(new Set(edges.map((x) => Number(x.dataset.step)))).sort((a, b) => a - b);
    const label = id === 'all' ? $('#playlabel-all') : null;
    let i = 0;
    const tick = () => {
      const cur = steps[i];
      edges.forEach((x) => {
        const on = (x.dataset.steps || String(x.dataset.step)).split(',').indexOf(String(cur)) >= 0;
        x.classList.toggle('dim', !on);
        x.classList.toggle('active', on);
      });
      if (label) {
        const memo = (state.parsed.entries[cur] || {}).memo || '';
        label.textContent = `第 ${i + 1} / ${steps.length} 步：${memo}`;
      }
      i++;
      if (i < steps.length) state.playTimer = setTimeout(tick, 1100);
      else state.playTimer = setTimeout(() => { edges.forEach((x) => x.classList.remove('dim', 'active')); if (label) label.textContent = ''; }, 1400);
    };
    tick();
  }

  function generateClose() {
    if (!state.parsed) return;
    const parsed = state.parsed;
    const keep = parsed.entries.filter((e) => !e.auto);
    parsed.entries = keep;
    parsed.blocks = parsed.blocks.filter((b) => !b.auto);
    const blk = window.autoClose(parsed, { surplus: true });
    state.parsed = parsed;
    state.summary = window.summarize(parsed, state.opening);
    render();
    if (blk) document.getElementById('blk-' + blk.index)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    $('#runHint').textContent = blk ? '已追加期末结转板块。' : '本期没有需要结转的余额。';
  }

  function startEdit(index) {
    const b = state.parsed.blocks.find((x) => x.index === index);
    if (!b) return;
    const q = document.getElementById('clause-' + index);
    q.innerHTML = `<textarea class="edit-area" id="edit-${index}">${esc(b.raw)}</textarea>
      <div class="edit-actions"><button type="button" class="primary small" data-act="saveedit" data-index="${index}">保存并重新生成</button>
      <button type="button" class="ghost small" data-act="canceledit">取消</button></div>`;
    $('#edit-' + index).focus();
  }

  function saveEdit(index) {
    const ta = $('#edit-' + index);
    if (!ta) return;
    const newRaw = ta.value.trim();
    const blocks = state.parsed.blocks.filter((b) => !b.auto);
    const target = blocks.find((b) => b.index === index);
    if (target) target.raw = newRaw;
    const rebuilt = blocks.map((b) => (b.preamble ? '' : b.label + ' ') + b.raw).join('\n');
    $('#source').value = rebuilt;
    state.source = rebuilt;
    state.auto = $('#autoClose').checked;
    const parsed = window.parseInput(rebuilt, collectOpts());
    parsed.opening = state.opening;
    if (state.auto) window.autoClose(parsed, { surplus: true });
    state.parsed = parsed;
    state.summary = window.summarize(parsed, state.opening);
    render();
    $('#runHint').textContent = '本板块已按新文字重新解析。';
  }

  /* ---------------- 缩放与拖拽 ---------------- */
  function setupZoom() {
    $$('.flow-scroll.zoomable').forEach((box) => {
      if (box.dataset.zready || !box.clientWidth) return;
      const svg = box.querySelector('svg');
      if (!svg) return;
      box.dataset.zready = '1';
      const W = +svg.getAttribute('width') || 600;
      const H = +svg.getAttribute('height') || 300;
      const inner = document.createElement('div');
      inner.className = 'zoomer';
      inner.style.width = W + 'px';
      inner.style.height = H + 'px';
      box.insertBefore(inner, svg);
      inner.appendChild(svg);
      svg.removeAttribute('width');
      svg.removeAttribute('height');
      svg.style.width = '100%';
      svg.style.height = '100%';

      const bar = document.createElement('div');
      bar.className = 'zoombar';
      bar.innerHTML = '<button type="button" data-z="out" title="缩小">−</button>'
        + '<input type="range" class="zslider" min="10" max="400" step="1" value="100" aria-label="缩放比例">'
        + '<span class="zlevel">100%</span>'
        + '<button type="button" data-z="in" title="放大">＋</button>'
        + '<button type="button" data-z="fit" title="适应窗口">适应</button>'
        + '<button type="button" data-z="one" title="原始大小">1:1</button>';
      box.appendChild(bar);

      const st = { s: 1, tx: 0, ty: 0, fit: 1 };
      const lvl = bar.querySelector('.zlevel');
      const slider = bar.querySelector('.zslider');
      const MIN = 0.1, MAX = 4;

      function clamp() {
        const vw = box.clientWidth, vh = box.clientHeight;
        const cw = W * st.s, ch = H * st.s;
        if (cw <= vw - 4) st.tx = (vw - cw) / 2;
        else st.tx = Math.max(vw - cw - 8, Math.min(8, st.tx));
        if (ch <= vh - 4) st.ty = (vh - ch) / 2;
        else st.ty = Math.max(vh - ch - 8, Math.min(8, st.ty));
      }
      function apply() {
        inner.style.transform = `translate(${st.tx}px, ${st.ty}px) scale(${st.s})`;
        lvl.textContent = Math.round(st.s * 100) + '%';
        slider.value = Math.round(st.s * 100);
      }
      function fit() {
        const vw = box.clientWidth - 12, vh = box.clientHeight - 12;
        st.fit = Math.min(box.classList.contains('fill') ? 2 : 1, vw / W, vh / H);
        st.s = Math.max(MIN, st.fit);
        clamp(); apply();
      }
      function setScale(ns, cx, cy) {
        ns = Math.max(MIN, Math.min(MAX, ns));
        const rect = box.getBoundingClientRect();
        const px = cx == null ? rect.width / 2 : cx - rect.left;
        const py = cy == null ? rect.height / 2 : cy - rect.top;
        const k = ns / st.s;
        st.tx = px - (px - st.tx) * k;
        st.ty = py - (py - st.ty) * k;
        st.s = ns;
        clamp(); apply();
      }

      if (!box.classList.contains('fill')) box.style.height = Math.max(220, Math.min(560, H + 8)) + 'px';
      fit();

      slider.addEventListener('input', () => setScale(Number(slider.value) / 100));
      bar.addEventListener('pointerdown', (e) => e.stopPropagation());
      bar.addEventListener('click', (e) => {
        const z = e.target.closest('[data-z]');
        if (!z) return;
        e.preventDefault();
        e.stopPropagation();
        if (z.dataset.z === 'in') setScale(st.s * 1.25);
        else if (z.dataset.z === 'out') setScale(st.s / 1.25);
        else if (z.dataset.z === 'one') setScale(1);
        else fit();
      });

      box.addEventListener('wheel', (e) => {
        if (!(e.ctrlKey || e.metaKey)) return;
        e.preventDefault();
        setScale(st.s * (e.deltaY < 0 ? 1.12 : 1 / 1.12), e.clientX, e.clientY);
      }, { passive: false });

      // 拖拽平移：不用 pointer capture（会把 click 事件重定向到容器，导致点箭头没反应）
      let drag = null;
      const onMove = (e) => {
        if (!drag) return;
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 4) {
          suppressClick = true;
          st.tx = drag.tx + dx;
          st.ty = drag.ty + dy;
          clamp(); apply();
        }
      };
      const onUp = () => {
        drag = null;
        window.removeEventListener('pointermove', onMove);
        setTimeout(() => { suppressClick = false; }, 120);
      };
      box.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 || e.target.closest('.zoombar')) return;
        drag = { x: e.clientX, y: e.clientY, tx: st.tx, ty: st.ty };
        suppressClick = false;
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp, { once: true });
      });
      box.addEventListener('dblclick', (e) => { if (!e.target.closest('.zoombar')) fit(); });
    });
  }

  /* ---------------- 点击讲解 ---------------- */
  let qp = null;
  function ensureQ() {
    if (qp) return qp;
    qp = document.createElement('aside');
    qp.className = 'qpanel hidden';
    qp.innerHTML = `<header class="qhead"><span class="qtag" id="qtag">讲解</span><button type="button" class="qclose" data-qclose="1">×</button></header>
      <div class="qbody" id="qbody"></div><footer class="qfoot" id="qfoot"></footer>`;
    document.body.appendChild(qp);
    return qp;
  }
  function showQ(tag, body, foot) {
    ensureQ();
    $('#qtag').textContent = tag;
    $('#qbody').innerHTML = body;
    $('#qfoot').innerHTML = foot || '';
    qp.classList.remove('hidden');
  }
  function hideQ() { if (qp) qp.classList.add('hidden'); }

  function explainLine(bi, ei, li) {
    const b = findBlock(bi), e = b.entries[ei];
    if (!e) return;
    const l = e.lines[li];
    if (!l) return;
    const a = window.acct(l.code);
    const side = l.side === 'D' ? '借方' : '贷方';
    const steps = (e.ex && e.ex.steps || []).map((s) => `<li><b>${esc(s.k)}</b>${rich(s.v)}</li>`).join('');
    showQ(`这笔数字 · ${side}`, `
      <h4 class="qtitle">${esc(a.name)} <span class="qcode">${l.code}</span></h4>
      <div class="qamt">${fmt(l.amount)}</div>
      <p class="qcalc">${esc(l.calc || '')}</p>
      ${l.basis ? `<p class="qbasis">依据：${esc(l.basis)}</p>` : ''}
      <div class="qwhy"><b>为什么这么记</b><p>${rich(e.ex.logic || '')}</p></div>
      ${steps ? `<ol class="qsteps">${steps}</ol>` : ''}
      <p class="qnow">对应题干：${esc(e.clauseText || '')}</p>
    `, `<button type="button" class="primary small" data-goto="${bi}-${ei}">跳到这笔业务</button><button type="button" class="ghost small" data-qclose="1">关闭</button>`);
  }

  function explainEntry(bi, step, from, to) {
    const b = findBlock(bi), e = b.entries[step];
    if (!e) return;
    const fn = window.acct(from || '').name, tn = window.acct(to || '').name;
    const lines = e.lines.map((l) => `<li><span class="qside ${l.side === 'D' ? 'd' : 'c'}">${l.side === 'D' ? '借' : '贷'}</span>${esc(window.acct(l.code).name)}<b>${fmt(l.amount)}</b></li>`).join('');
    showQ('这笔业务', `
      <h4 class="qtitle">${esc(e.memo)}</h4>
      ${from && to ? `<p class="qflow">${esc(fn)} <span class="qarrow">→</span> ${esc(tn)}</p>` : ''}
      <p class="qwhy">${rich(e.ex.logic || '')}</p>
      <ul class="qline-list">${lines}</ul>
      <p class="qnow">题干：${esc(e.clauseText || '')}</p>
    `, `<button type="button" class="primary small" data-goto="${bi}-${step}">跳到这笔业务</button><button type="button" class="ghost small" data-qclose="1">关闭</button>`);
  }

  function explainNode(bi, code) {
    const b = findBlock(bi);
    const a = window.acct(code);
    const rows = b.entries.filter((e) => e.lines.some((l) => l.code === code))
      .map((e, i) => `<li>${esc(e.memo)}<b>${fmt(e.lines.filter((l) => l.code === code).reduce((s, l) => s + l.amount, 0))}</b></li>`).join('');
    showQ('这个科目', `
      <h4 class="qtitle">${esc(a.name)} <span class="qcode">${code}</span></h4>
      <p class="qmeta">${esc(a.cat)} · ${a.dir === 'debit' ? '借方增加' : '贷方增加'}${a.contra ? ' · 备抵账户' : ''}${a.temp ? ' · 过渡账户' : ''}</p>
      <p class="qwhy">${esc(a.note || '')}</p>
      <p class="qsub">本板块涉及这个科目的分录：</p>
      <ul class="qline-list">${rows || '<li class="none">无</li>'}</ul>
    `, `<button type="button" class="ghost small" data-qclose="1">关闭</button>`);
  }

  function jumpTo(key) {
    const parts = String(key).split('-');
    const bi = Number(parts[0]), ei = Number(parts[1]);
    switchView('blocks');
    const el = document.getElementById(`e-${bi}-${ei}`);
    if (!el) return;
    hideQ();
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('flash');
    setTimeout(() => el.classList.remove('flash'), 1800);
  }

  /* ---------------- 财务报表 ---------------- */
  function renderReports(s) {
    const host = $('#viewReports');
    if (!host) return;
    const st = window.buildStatements(state.parsed.entries, s.ledger, state.opening);
    const bs = st.bs, bsOpen = st.bsOpen, is = st.is, cf = st.cf;
    const hasOpen = !!bsOpen;
    const openMap = {};
    const openSecTotal = {};
    if (bsOpen) {
      bsOpen.sections.forEach((sec) => {
        openSecTotal[sec.sec] = sec.total;
        sec.items.forEach((i) => { openMap[i.label] = i.amount; });
      });
    }
    const openCell = (label) => `<td class="amt dim-amt">${fmt(openMap[label] || 0)}</td>`;

    const bsRows = bs.sections.map((sec) => {
      const cls = sec.sec.indexOf('负债') >= 0 || sec.sec.indexOf('权益') >= 0 ? 'liab' : 'asset';
      const items = sec.items.filter((i) => state.showZero || Math.abs(i.amount) > 0.005 || Math.abs(openMap[i.label] || 0) > 0.005);
      const head = `<tr class="sec ${cls}"><td colspan="2">${esc(sec.sec)}</td>`
        + (hasOpen ? `<td class="amt dim-amt">${fmt(openSecTotal[sec.sec] || 0)}</td>` : '')
        + `<td class="amt">${fmt(sec.total)}</td></tr>`;
      return head + (items.length ? items : [{ label: '（本类无余额项目）', note: '', amount: 0, empty: true }]).map((i) => i.empty
        ? `<tr><td class="ind dim">（本类无余额项目）</td><td></td>${hasOpen ? '<td></td>' : ''}<td class="amt">—</td></tr>`
        : `<tr><td class="ind">${esc(i.label)}</td><td class="dim">${esc(i.note)}</td>${hasOpen ? openCell(i.label) : ''}<td class="amt">${fmt(i.amount)}</td></tr>`).join('');
    }).join('');

    const isRows = is.rows.map((r) => {
      const strong = /^[一二三四五]、/.test(r.label);
      return `<tr class="${strong ? 'strong' : ''}"><td>${esc(r.label)}</td><td class="dim">${esc(r.note || '')}</td><td class="amt">${fmt(r.amount)}</td></tr>`;
    }).join('');

    const cfRow = (label, v) => `<tr><td>${label}</td><td class="amt">${fmt(v)}</td></tr>`;
    const cfRows = [
      ['一、经营活动产生的现金流量', ''],
      cfRow('销售商品、提供劳务收到的现金', cf.opIn),
      cfRow('购买商品、接受劳务支付的现金', cf.opOut),
      cfRow('经营活动产生的现金流量净额', cf.opNet),
      ['二、投资活动产生的现金流量', ''],
      cfRow('投资活动现金流入', cf.invIn),
      cfRow('投资活动现金流出', cf.invOut),
      cfRow('投资活动产生的现金流量净额', cf.invNet),
      ['三、筹资活动产生的现金流量', ''],
      cfRow('筹资活动现金流入', cf.finIn),
      cfRow('筹资活动现金流出', cf.finOut),
      cfRow('筹资活动产生的现金流量净额', cf.finNet)
    ].map((r) => (Array.isArray(r) ? `<tr class="sec"><td colspan="2">${r[0]}</td></tr>` : r)).join('');

    const warns = []
      .concat(bs.unmapped.map((u) => `科目「${esc(u.name)}」暂未映射到报表项目（${fmt(u.amount)}）`))
      .concat(bs.warnings || []);
    const unmapped = warns.length
      ? `<div class="warn">${warns.map((w) => `<p>${w}</p>`).join('')}</div>` : '';

    const openNote = hasOpen
      ? `期初余额取自「期初余额」录入的数据（${window.Opening.count(state.opening)} 个科目）。`
      : '未录入期初余额，期初数按 0 处理。可在左侧「期初余额」补录。';

    host.innerHTML = `
      <section class="card">
        <h2 class="card-h">财务报表 <span class="muted">教学版 · ${hasOpen ? '期初 + 本期' : '期末数'}</span></h2>
        <p class="note">三张表均由本期分录汇总生成。${openNote}未做一年内到期重分类与合并抵销；现金流量表按每笔分录的"对方科目"自动归类，属于教学演示口径，正式编报需按收付实现制逐笔认定。</p>
        <div class="report-kpis">
          <div><span>资产总计（期末）</span><b>${fmt(bs.assets)}</b></div>
          <div><span>负债合计</span><b>${fmt(bs.liab)}</b></div>
          <div><span>所有者权益合计</span><b>${fmt(bs.equity)}</b></div>
          <div class="${bs.balanced ? 'pos' : 'neg'}"><span>平衡校验</span><b>${bs.balanced ? '平衡' : '差 ' + fmt(bs.diff)}</b></div>
        </div>
        ${unmapped}
      </section>

      <section class="card">
        <div class="card-h-row"><h2 class="card-h">资产负债表 <span class="muted">${state.parsed.opts.baseDate}</span></h2>
        <button type="button" class="link" data-act="zero">${state.showZero ? '隐藏零值项目' : '显示零值项目'}</button></div>
        <div class="tablewrap"><table class="tb report-table">
          <thead><tr><th>项目</th><th>口径说明</th>${hasOpen ? '<th class="c-amt">期初数</th>' : ''}<th class="c-amt">期末数</th></tr></thead>
          <tbody>${bsRows}</tbody>
          <tfoot>
            <tr><td colspan="2">资产总计</td>${hasOpen ? `<td class="amt dim-amt">${fmt(bsOpen.assets)}</td>` : ''}<td class="amt">${fmt(bs.assets)}</td></tr>
            <tr><td colspan="2">负债和所有者权益总计</td>${hasOpen ? `<td class="amt dim-amt">${fmt(bsOpen.liabEquity)}</td>` : ''}<td class="amt">${fmt(bs.liabEquity)}</td></tr>
            <tr><td colspan="2">平衡校验</td>${hasOpen ? `<td class="amt dim-amt">${bsOpen.balanced ? '平衡' : fmt(bsOpen.diff)}</td>` : ''}<td class="amt">${bs.balanced ? '平衡' : '差 ' + fmt(bs.diff)}</td></tr>
          </tfoot>
        </table></div>
      </section>

      <section class="card">
        <h2 class="card-h">利润表 <span class="muted">本期</span></h2>
        <div class="tablewrap"><table class="tb report-table">
          <thead><tr><th>项目</th><th>说明</th><th class="c-amt">本期金额</th></tr></thead>
          <tbody>${isRows}</tbody>
        </table></div>
      </section>

      <section class="card">
        <h2 class="card-h">现金流量表 <span class="muted">教学版</span></h2>
        <div class="tablewrap"><table class="tb report-table cf">
          <thead><tr><th>项目</th><th class="c-amt">本期金额</th></tr></thead>
          <tbody>${cfRows}
            <tr class="strong"><td>四、现金及现金等价物净增加额</td><td class="amt">${fmt(cf.net)}</td></tr>
            <tr><td>加：期初现金及现金等价物余额</td><td class="amt">${fmt(cf.cashBegin)}</td></tr>
            <tr class="strong"><td>五、期末现金及现金等价物余额</td><td class="amt">${fmt(cf.cashEnd)}</td></tr>
          </tbody>
        </table></div>
        <p class="note">${cf.reconciled ? '✓ 期初现金 + 净增加额 = 期末货币资金，勾稽通过。' : '⚠ 期初现金 + 净增加额 ≠ 期末货币资金：可能存在未识别为现金流量的现金内部划转。'}</p>
      </section>`;
  }

  /* ---------------- 演示模式 ---------------- */
  let pv = null;

  function presentBlocks() {
    return state.summary ? state.summary.blocks.filter((b) => b.entries.length) : [];
  }

  function buildPresentDOM() {
    if (pv) return pv;
    const el = document.createElement('div');
    el.className = 'present hidden';
    el.id = 'present';
    el.innerHTML = `
      <header class="present-head">
        <div class="present-title"><span class="pill auto">演示</span><span id="presentName"></span></div>
        <div class="present-actions">
          <button type="button" class="ghost small" data-pr="prevb">← 上一板块</button>
          <button type="button" class="ghost small" data-pr="nextb">下一板块 →</button>
          <button type="button" class="ghost small" data-pr="full">全屏</button>
          <button type="button" class="ghost small" data-pr="exit">退出（Esc）</button>
        </div>
      </header>
      <div class="present-stage">
        <div class="flow-scroll zoomable fill" id="presentFlow"></div>
        <aside class="present-note hidden" id="presentNote"></aside>
      </div>
      <footer class="present-foot">
        <button type="button" class="ghost small" data-pr="prev">← 上一步</button>
        <span class="present-step" id="presentStep">1 / 1</span>
        <button type="button" class="ghost small" data-pr="next">下一步 →</button>
        <button type="button" class="primary small" data-pr="play" id="presentPlay">▶ 自动播放</button>
        <label class="present-explain"><input type="checkbox" id="presentExplain"> 显示讲解</label>
        <span class="present-tip">← → 切换步骤 · ↑ ↓ 切换板块 · Ctrl+滚轮缩放 · 拖拽平移</span>
      </footer>`;
    document.body.appendChild(el);
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-pr]');
      if (!b) return;
      const a = b.dataset.pr;
      if (a === 'exit') closePresent();
      else if (a === 'prevb') movePresentBlock(-1);
      else if (a === 'nextb') movePresentBlock(1);
      else if (a === 'prev') movePresentStep(-1);
      else if (a === 'next') movePresentStep(1);
      else if (a === 'play') togglePresentPlay();
      else if (a === 'full') toggleFullscreen();
    });
    el.addEventListener('change', (e) => {
      if (e.target.id === 'presentExplain') { pv.explain = e.target.checked; renderPresentStep(); }
    });
    document.addEventListener('keydown', presentKey);
    pv = { el, idx: 0, step: 0, explain: false, timer: null, playing: false };
    return pv;
  }

  function toggleFullscreen() {
    try {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen();
    } catch (e) { /* 忽略 */ }
  }

  function openPresent(blockIndex) {
    const blocks = presentBlocks();
    if (!blocks.length) return;
    buildPresentDOM();
    const i = blockIndex == null ? 0 : blocks.findIndex((b) => b.index === blockIndex);
    pv.idx = i >= 0 ? i : 0;
    pv.step = 0;
    pv.playing = false;
    if (pv.timer) { clearInterval(pv.timer); pv.timer = null; }
    pv.el.classList.remove('hidden');
    document.documentElement.classList.add('presenting');
    renderPresentBlock();
  }

  function closePresent() {
    if (!pv) return;
    if (pv.timer) { clearInterval(pv.timer); pv.timer = null; }
    pv.playing = false;
    pv.el.classList.add('hidden');
    document.documentElement.classList.remove('presenting');
    if (document.fullscreenElement) { try { document.exitFullscreen(); } catch (e) { /* ignore */ } }
  }

  function renderPresentBlock() {
    const blocks = presentBlocks();
    const b = blocks[pv.idx];
    if (!b) return;
    $('#presentName').textContent = (b.entries[0] || {}).ruleTitle || b.label;
    const flow = window.buildFlow(b.entries);
    const box = $('#presentFlow');
    box.innerHTML = window.renderFlow(flow, { uid: 'pv' });
    delete box.dataset.zready;
    pv.step = 0;
    setupZoom();
    renderPresentStep();
  }

  function renderPresentStep() {
    const blocks = presentBlocks();
    const b = blocks[pv.idx];
    if (!b) return;
    const e = b.entries[pv.step];
    if (!e) return;
    $('#presentStep').textContent = `${pv.step + 1} / ${b.entries.length} · ${e.memo}`;
    $$('#presentFlow .flow-edge').forEach((x) => {
      const on = (x.dataset.steps || x.dataset.step).split(',').indexOf(String(pv.step)) >= 0;
      x.classList.toggle('dim', !on);
      x.classList.toggle('active', on);
    });
    const note = $('#presentNote');
    if (pv.explain) {
      note.classList.remove('hidden');
      const lines = e.lines.map((l) => `<div class="pv-line"><span class="qside ${l.side === 'D' ? 'd' : 'c'}">${l.side === 'D' ? '借' : '贷'}</span><span class="pv-acct">${esc(window.acct(l.code).name)}</span><b>${fmt(l.amount)}</b></div>`).join('');
      note.innerHTML = `<h4>${esc(e.memo)}</h4>
        <div class="pv-lines">${lines}</div>
        <p class="pv-logic">${rich((e.ex && e.ex.logic) || '')}</p>
        ${(e.ex && e.ex.pitfalls || []).length ? `<div class="pv-pitfall">${e.ex.pitfalls.map((p) => `<p>⚠️ ${rich(p)}</p>`).join('')}</div>` : ''}`;
    } else {
      note.classList.add('hidden');
      note.innerHTML = '';
    }
    $('#presentPlay').textContent = pv.playing ? '⏸ 暂停' : '▶ 自动播放';
  }

  function movePresentStep(d) {
    const blocks = presentBlocks();
    const b = blocks[pv.idx];
    if (!b) return;
    let s = pv.step + d;
    if (s < 0) {
      if (pv.idx > 0) {
        pv.idx -= 1;
        renderPresentBlock();
        pv.step = presentBlocks()[pv.idx].entries.length - 1;
        renderPresentStep();
      }
      return;
    }
    if (s >= b.entries.length) {
      if (pv.idx < blocks.length - 1) {
        pv.idx += 1;
        renderPresentBlock();
      } else if (pv.playing) {
        togglePresentPlay();
      }
      return;
    }
    pv.step = s;
    renderPresentStep();
  }

  function movePresentBlock(d) {
    const blocks = presentBlocks();
    const n = Math.max(0, Math.min(blocks.length - 1, pv.idx + d));
    if (n === pv.idx) return;
    pv.idx = n;
    renderPresentBlock();
  }

  function togglePresentPlay() {
    if (!pv) return;
    pv.playing = !pv.playing;
    if (pv.timer) { clearInterval(pv.timer); pv.timer = null; }
    if (pv.playing) {
      pv.timer = setInterval(() => movePresentStep(1), 1800);
    }
    $('#presentPlay').textContent = pv.playing ? '⏸ 暂停' : '▶ 自动播放';
  }

  function presentKey(e) {
    if (!pv || pv.el.classList.contains('hidden')) return;
    if (e.key === 'Escape') { closePresent(); return; }
    if (e.key === 'ArrowRight') { e.preventDefault(); movePresentStep(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); movePresentStep(-1); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); movePresentBlock(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); movePresentBlock(-1); }
    else if (e.code === 'Space') { e.preventDefault(); togglePresentPlay(); }
  }

  /* ---------------- 准则覆盖 ---------------- */
  function renderCoverage() {
    const host = $('#viewCoverage');
    if (!host || !window.CAS_COVERAGE) return;
    const list = window.CAS_COVERAGE;
    const full = list.filter((x) => x.status === 'full').length;
    const part = list.filter((x) => x.status === 'part').length;
    const none = list.length - full - part;
    const pill = (st) => st === 'full' ? '<span class="pill ok">已覆盖</span>' : st === 'part' ? '<span class="pill warn">部分</span>' : '<span class="pill">待补</span>';
    const rows = list.map((x) => `<tr class="${x.status === 'none' ? 'dimrow' : ''}">
      <td class="mono">CAS ${x.no}</td><td>${esc(x.name)}</td><td>${pill(x.status)}</td><td class="dim">${esc(x.note)}</td></tr>`).join('');
    host.innerHTML = `
      <section class="card">
        <h2 class="card-h">企业会计准则覆盖 <span class="muted">${list.length} 号 · 已覆盖 ${full} · 部分 ${part} · 待补 ${none}</span></h2>
        <p class="note">"完整纳入"不是一句口号：准则共 40 余号，每号下面还有大量具体交易。本表是公开的覆盖清单——"已覆盖"表示常见业务能自动生成分录并有讲解，"部分"表示主干已支持、特殊交易待补。规则库按此表逐号补充。</p>
        <div class="cover-summary">
          <div><b>${full}</b><span>已覆盖</span></div>
          <div><b>${part}</b><span>部分覆盖</span></div>
          <div><b>${none}</b><span>待补</span></div>
          <div><b>${list.length}</b><span>准则总数</span></div>
        </div>
        <div class="tablewrap"><table class="tb cover-table">
          <thead><tr><th>编号</th><th>准则名称</th><th>状态</th><th>本版覆盖的业务</th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>
      </section>`;
  }

  /* ---------------- 导出 ---------------- */
  function toMarkdown() {
    const s = state.summary;
    const out = ['# 会计分录', '', `> 记账日期：${state.parsed.opts.baseDate}　借方合计 ${fmt(s.trial.debitSum)}　贷方合计 ${fmt(s.trial.creditSum)}　${s.trial.balanced ? '借贷平衡' : '借贷不平'}`, ''];
    s.blocks.forEach((b, i) => {
      out.push(`## ${String(i + 1).padStart(2, '0')} ${(b.entries[0] || {}).ruleTitle || b.label}`);
      out.push('');
      if (b.raw) out.push('> ' + b.raw.replace(/\n/g, ' '));
      out.push('');
      b.entries.forEach((e, k) => {
        out.push(`### 分录 ${k + 1}　${e.memo}`);
        out.push('');
        out.push('| 方向 | 科目 | 金额 |');
        out.push('| :--: | :-- | --: |');
        e.lines.forEach((l) => out.push(`| ${l.side === 'D' ? '借' : '贷'} | ${window.acct(l.code).name}（${l.code}） | ${fmt(l.amount)} |`));
        out.push('');
        if (e.ex && e.ex.logic) out.push('**讲解**：' + e.ex.logic);
        if (e.ex && e.ex.steps && e.ex.steps.length) {
          out.push('');
          e.ex.steps.forEach((st) => out.push(`- **${st.k}**：${st.v}`));
        }
        if (e.ex && e.ex.pitfalls && e.ex.pitfalls.length) {
          out.push('');
          e.ex.pitfalls.forEach((p) => out.push(`> ⚠️ ${p}`));
        }
        out.push('');
      });
    });
    return out.join('\n');
  }

  function exportMarkdown() {
    if (!state.summary) return;
    const md = toMarkdown();
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '会计分录.md';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    $('#runHint').textContent = '已导出 Markdown 文件。';
  }

  document.addEventListener('DOMContentLoaded', init);
})();
