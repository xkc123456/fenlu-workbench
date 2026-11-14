/* ============================================================
 * opening.js —— 期初余额录入
 * 数值口径：按科目正常方向填正数（资产/成本/费用填借方正数，负债/权益/收入填贷方正数），
 * 反向余额填负数即可。
 * ============================================================ */
(function (root) {
  'use strict';
  const KEY = 'fenlu-opening-v1';
  const { ACC, fmt } = root;
  const $ = (s, r) => (r || document).querySelector(s);

  let rows = [];
  let opts = {};
  let modal = null;

  const CATS = ['资产', '负债', '权益', '成本', '收入', '费用', '利润'];

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      const obj = raw ? JSON.parse(raw) : {};
      return obj && typeof obj === 'object' ? obj : {};
    } catch (e) { return {}; }
  }
  function save(obj) {
    try { localStorage.setItem(KEY, JSON.stringify(obj || {})); } catch (e) { /* ignore */ }
  }

  function accountOptions(selected) {
    return CATS.map((cat) => {
      const items = Object.keys(ACC).filter((c) => ACC[c].cat === cat && ACC[c].level === 1)
        .sort().map((c) => `<option value="${c}"${c === selected ? ' selected' : ''}>${c} ${ACC[c].name}</option>`).join('');
      return items ? `<optgroup label="${cat}">${items}</optgroup>` : '';
    }).join('');
  }

  function ensure() {
    if (modal) return modal;
    modal = document.createElement('div');
    modal.className = 'modal hidden';
    modal.innerHTML = `
      <div class="modal-card ob-card">
        <header class="modal-head">
          <h3>期初余额 <span class="muted">可选 · 用于资产负债表"期初数"与试算平衡</span></h3>
          <button type="button" class="modal-x" data-obclose="1">×</button>
        </header>
        <div class="modal-body">
          <p class="note">按科目正常方向填正数：资产/成本/费用填借方正数，负债/权益/收入填贷方正数；反向余额填负数。留空即为期初 0。</p>
          <div class="ob-table-wrap">
            <table class="tb ob-table">
              <thead><tr><th>科目</th><th class="c-amt">期初余额</th><th style="width:40px"></th></tr></thead>
              <tbody id="obRows"></tbody>
            </table>
          </div>
          <button type="button" class="ghost small" id="obAdd">＋ 添加科目</button>
          <div class="ob-sum" id="obSum"></div>
        </div>
        <footer class="modal-foot">
          <button type="button" class="primary small" id="obSave">保存并重算</button>
          <button type="button" class="ghost small" id="obClear">清空</button>
          <button type="button" class="ghost small" data-obclose="1">取消</button>
        </footer>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => { if (e.target.closest('[data-obclose]')) close(); });
    $('#obAdd', modal).addEventListener('click', () => { rows.push({ code: '1002', amount: '' }); render(); });
    $('#obClear', modal).addEventListener('click', () => { rows = []; render(); });
    $('#obSave', modal).addEventListener('click', () => {
      const obj = {};
      rows.forEach((r) => {
        const v = Number(r.amount);
        if (r.code && isFinite(v) && Math.abs(v) > 0.001) obj[r.code] = Math.round(v * 100) / 100;
      });
      save(obj);
      if (opts.onSave) opts.onSave(obj);
      close();
    });
    modal.addEventListener('input', (e) => {
      const tr = e.target.closest('tr[data-i]');
      if (!tr) return;
      const i = Number(tr.dataset.i);
      if (e.target.matches('select')) rows[i].code = e.target.value;
      else rows[i].amount = e.target.value;
      renderSum();
    });
    modal.addEventListener('click', (e) => {
      const del = e.target.closest('[data-obdel]');
      if (!del) return;
      rows.splice(Number(del.dataset.obdel), 1);
      render();
    });
    return modal;
  }

  function renderSum() {
    let d = 0, c = 0;
    rows.forEach((r) => {
      const v = Number(r.amount);
      if (!r.code || !isFinite(v) || !v) return;
      const dir = (ACC[r.code] || {}).dir || 'debit';
      if ((v > 0) === (dir === 'debit')) d += Math.abs(v); else c += Math.abs(v);
    });
    const diff = Math.round((d - c) * 100) / 100;
    $('#obSum', modal).innerHTML = `借方合计 <b>${fmt(d)}</b>　贷方合计 <b>${fmt(c)}</b>　`
      + (Math.abs(diff) < 0.005 ? '<span class="ob-ok">借贷平衡</span>' : `<span class="ob-bad">差额 ${fmt(diff)}</span>`);
  }

  function render() {
    const tbody = $('#obRows', modal);
    if (!rows.length) rows = [{ code: '1002', amount: '' }];
    tbody.innerHTML = rows.map((r, i) => `<tr data-i="${i}">
      <td><select class="ob-acct">${accountOptions(r.code)}</select></td>
      <td><input class="ob-amt" type="number" step="0.01" value="${r.amount === '' ? '' : r.amount}" placeholder="0.00"></td>
      <td><button type="button" class="link" data-obdel="${i}" title="删除">删除</button></td>
    </tr>`).join('');
    renderSum();
  }

  function open(o) {
    opts = o || {};
    ensure();
    const cur = typeof o.get === 'function' ? o.get() : load();
    rows = Object.keys(cur || {}).map((code) => ({ code, amount: cur[code] }));
    if (!rows.length) rows = [{ code: '1002', amount: '' }];
    modal.classList.remove('hidden');
    render();
  }
  function close() { if (modal) modal.classList.add('hidden'); }

  function count(obj) {
    return Object.keys(obj || {}).filter((k) => Math.abs(obj[k]) > 0.005).length;
  }

  root.Opening = { load, save, open, close, count };
})(typeof globalThis !== 'undefined' ? globalThis : this);
