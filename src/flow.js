/* ============================================================
 * flow.js —— 资金/价值流向图：T 型账户 + 箭头
 * 布局：按"资金来源 → 去向"做分层，跨层用走线上/下通道
 * ============================================================ */
(function (root) {
  'use strict';
  const { ACC, round2: r2, fmt } = root;

  const CAT_COLOR = {
    资产: { bg: '#eef4fb', bd: '#9dbcd9', tx: '#1d4568' },
    负债: { bg: '#fdf3e4', bd: '#d9b98a', tx: '#6b4a17' },
    权益: { bg: '#f3effb', bd: '#b6a6d6', tx: '#4b3a71' },
    成本: { bg: '#eaf6f2', bd: '#8fc4b2', tx: '#1f5a48' },
    收入: { bg: '#edf7ea', bd: '#9fc98e', tx: '#33591f' },
    费用: { bg: '#fbeceb', bd: '#d9a09c', tx: '#6d2a26' },
    利润: { bg: '#f0eee7', bd: '#c0b79e', tx: '#4a432f' }
  };

  function shortName(code) {
    const nm = (ACC[code] || {}).name || code;
    let s = nm.replace(/^[^—]+—/, '');
    s = s.replace(/[（(]([^）)]*)[)）]/g, '·$1');
    return s;
  }

  /* 借贷配对：把一笔分录的借方行和贷方行连成箭头 */
  function pairLines(debits, credits) {
    const D = debits.map((l) => ({ code: l.code, left: l.amount }));
    const C = credits.map((l) => ({ code: l.code, left: l.amount }));
    const out = [];
    let di = 0, ci = 0;
    while (di < D.length && ci < C.length) {
      const amt = Math.min(D[di].left, C[ci].left);
      if (amt > 0.004) out.push({ from: C[ci].code, to: D[di].code, amount: r2(amt) });
      D[di].left = r2(D[di].left - amt);
      C[ci].left = r2(C[ci].left - amt);
      if (D[di].left < 0.005) di++;
      if (C[ci].left < 0.005) ci++;
    }
    return out;
  }

  function buildFlow(entries, opts) {
    const o = opts || {};
    const agg = !!o.aggregate;
    const map = (code) => (agg ? code.slice(0, 4) : code);
    const nodeMap = {};
    const edges = [];

    entries.forEach((e, step) => {
      const debits = e.lines.filter((l) => l.side === 'D');
      const credits = e.lines.filter((l) => l.side === 'C');
      e.lines.forEach((l) => {
        const code = map(l.code);
        if (!nodeMap[code]) {
          const m = ACC[code] || { name: l.code, cat: '资产', dir: 'debit' };
          nodeMap[code] = { code, name: m.name, short: agg ? m.name : shortName(code), cat: m.cat, dir: m.dir, contra: !!m.contra, temp: !!m.temp };
        }
      });
      pairLines(debits, credits).forEach((p) => {
        const from = map(p.from), to = map(p.to);
        if (from === to) return;   // 同一科目内部结转，不画箭头
        edges.push({ step, memo: e.memo, from, to, amount: p.amount });
      });
    });
    const nodes = Object.keys(nodeMap).map((k) => nodeMap[k]);

    // 合并重复边（同一 from→to 跨多笔业务时累计金额）
    const merged = [];
    const byKey = {};
    edges.forEach((e) => {
      const k = e.from + '>' + e.to;
      if (byKey[k]) {
        byKey[k].amount = r2(byKey[k].amount + e.amount);
        byKey[k].steps.push(e.step);
        return;
      }
      const copy = Object.assign({}, e, { steps: [e.step] });
      byKey[k] = copy;
      merged.push(copy);
    });

    // 分层：从资金来源逐层向后
    const depth = {};
    nodes.forEach((n) => (depth[n.code] = 0));
    for (let it = 0; it < 30; it++) {
      let changed = false;
      merged.forEach((e) => {
        if (depth[e.to] < depth[e.from] + 1 && depth[e.from] + 1 < 12) { depth[e.to] = depth[e.from] + 1; changed = true; }
      });
      if (!changed) break;
    }
    const maxDepth = Math.max(0, ...Object.values(depth));
    const cols = {};
    nodes.forEach((n) => { (cols[depth[n.code]] = cols[depth[n.code]] || []).push(n); });

    const order = ['负债', '权益', '收入', '利润', '资产', '成本', '费用'];
    const colW = o.colW || 266, rowH = 94, padX = 26;
    let maxRows = 0;
    Object.keys(cols).forEach((d) => {
      cols[d].sort((a, b) => order.indexOf(a.cat) - order.indexOf(b.cat) || a.code.localeCompare(b.code));
      maxRows = Math.max(maxRows, cols[d].length);
    });

    // 长边走上通道，回边走下通道
    const longs = [], backs = [];
    merged.forEach((e) => {
      e.span = depth[e.to] - depth[e.from];
      if (e.span > 1) longs.push(e);
      else if (e.span <= 0) backs.push(e);
    });
    longs.sort((a, b) => b.span - a.span);
    backs.sort((a, b) => a.span - b.span);
    const LANE = 22;   // 每个跨层箭头占一条独立走线通道，避免金额标签互相压住
    longs.forEach((e, i) => { e.laneY = 8 + i * LANE; });
    const topPad = longs.length ? 8 + longs.length * LANE + 10 : 12;
    backs.forEach((e, i) => { e.laneBottom = i; });

    const nodeAreaH = Math.max(180, maxRows * rowH + 12);
    const botPad = backs.length ? 10 + backs.length * LANE : 12;
    const height = topPad + nodeAreaH + botPad;
    const width = Math.max(360, padX * 2 + (maxDepth + 1) * colW - (colW - 206));

    Object.keys(cols).forEach((d) => {
      const arr = cols[d];
      const totalH = arr.length * rowH;
      const top = topPad + 6 + (nodeAreaH - totalH) / 2;
      arr.forEach((n, i) => {
        n.x = padX + Number(d) * colW;
        n.y = top + i * rowH;
        n.w = 186;
        n.h = 58;
      });
    });

    const byCode = {};
    nodes.forEach((n) => (byCode[n.code] = n));
    backs.forEach((e, i) => { e.laneY = height - botPad + 8 + i * LANE; });

    merged.forEach((e, i) => {
      const a = byCode[e.from], b = byCode[e.to];
      e.fromNode = a; e.toNode = b; e.d = i;
      if (!a || !b) return;
      if (e.span > 1) {
        const x1 = a.x + a.w * 0.55, x2 = b.x + b.w * 0.45;
        e.path = `M ${x1} ${a.y} L ${x1} ${e.laneY} L ${x2} ${e.laneY} L ${x2} ${b.y}`;
        e.lx = (x1 + x2) / 2; e.ly = e.laneY;
      } else if (e.span <= 0) {
        const x1 = a.x + a.w * 0.55, x2 = b.x + b.w * 0.45;
        e.path = `M ${x1} ${a.y + a.h} L ${x1} ${e.laneY} L ${x2} ${e.laneY} L ${x2} ${b.y + b.h}`;
        e.lx = (x1 + x2) / 2; e.ly = e.laneY;
      } else {
        const x1 = a.x + a.w, y1 = a.y + a.h / 2, x2 = b.x, y2 = b.y + b.h / 2;
        const mx = (x1 + x2) / 2;
        const bow = (i % 3 - 1) * 8;
        e.path = `M ${x1} ${y1} C ${mx} ${y1 + bow}, ${mx} ${y2 + bow}, ${x2 - 4} ${y2}`;
        e.lx = mx; e.ly = (y1 + y2) / 2 - 13 + bow;
      }
    });

    // 金额标签避让：避免两个标签压在一起，或标签压住科目框
    const overlap = (a, b) => a.x < b.x + b.w - 1 && a.x + a.w > b.x + 1 && a.y < b.y + b.h - 1 && a.y + a.h > b.y + 1;
    const nodeRects = nodes.map((n) => ({ x: n.x - 2, y: n.y - 2, w: n.w + 4, h: n.h + 4 }));
    for (let pass = 0; pass < 80; pass++) {
      let moved = false;
      const labs = merged.map((e) => ({ e, x: e.lx - 35, y: e.ly - 9, w: 70, h: 18 }));
      for (let i = 0; i < labs.length && !moved; i++) {
        const hitNode = nodeRects.find((n) => overlap(labs[i], n));
        if (hitNode) {
          const dir = labs[i].y + 9 < hitNode.y + hitNode.h / 2 ? -1 : 1;
          merged[i].ly = Math.max(12, Math.min(height - 12, merged[i].ly + dir * 11));
          moved = true;
          break;
        }
        for (let j = i + 1; j < labs.length; j++) {
          if (overlap(labs[i], labs[j])) {
            merged[j].ly = Math.max(12, Math.min(height - 12, merged[j].ly + 11));
            moved = true;
            break;
          }
        }
      }
      if (!moved) break;
    }

    const steps = [];
    entries.forEach((e, i) => steps.push({ i, memo: e.memo, date: e.date }));

    return { nodes, edges: merged, width, height, steps };
  }

  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  function nodeLabel(n) {
    const s = n.short;
    if (s.length <= 7) return [s];
    if (s.length <= 13) {
      const mid = Math.ceil(s.length / 2);
      return [s.slice(0, mid), s.slice(mid)];
    }
    return [s.slice(0, 10) + '…'];
  }

  function renderFlow(flow, opts) {
    const o = opts || {};
    const parts = [];
    parts.push(`<svg class="flow-svg" viewBox="0 0 ${flow.width} ${flow.height}" width="${flow.width}" height="${flow.height}" xmlns="http://www.w3.org/2000/svg">`);
    parts.push(`<defs>
      <marker id="arrow-${o.uid}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 z" fill="#b4522f"/>
      </marker>
      <filter id="soft-${o.uid}" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="1.5" stdDeviation="1.6" flood-opacity="0.12"/>
      </filter>
    </defs>`);

    flow.edges.forEach((e) => {
      parts.push(`<g class="flow-edge" data-step="${e.step}" data-steps="${e.steps.join(',')}" data-from="${e.from}" data-to="${e.to}">
        <path d="${e.path}" fill="none" stroke="transparent" stroke-width="14" class="edge-hit" pointer-events="stroke"/>
        <path d="${e.path}" fill="none" stroke="#b4522f" stroke-width="1.6" stroke-opacity="0.85" stroke-linejoin="round" marker-end="url(#arrow-${o.uid})" class="edge-line"/>
        <rect x="${e.lx - 35}" y="${e.ly - 9}" width="70" height="18" rx="9" fill="#fffdf7" stroke="#e3d4b8" stroke-width="0.8" opacity="0.97"/>
        <text x="${e.lx}" y="${e.ly + 4}" text-anchor="middle" class="edge-amount">${esc(fmt(e.amount))}</text>
      </g>`);
    });

    flow.nodes.forEach((n) => {
      const c = CAT_COLOR[n.cat] || CAT_COLOR.资产;
      const lines = nodeLabel(n);
      const dash = n.contra ? ' stroke-dasharray="5 3"' : '';
      parts.push(`<g class="flow-node" data-code="${n.code}">
        <rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="7" fill="${c.bg}" stroke="${c.bd}" stroke-width="1.2"${dash} filter="url(#soft-${o.uid})"/>
        <text x="${n.x + 10}" y="${n.y + 17}" class="node-code">${esc(n.code)}</text>
        ${lines.map((ln, i) => `<text x="${n.x + 10}" y="${n.y + 34 + i * 15}" class="node-name">${esc(ln)}</text>`).join('')}
        ${n.contra ? `<text x="${n.x + n.w - 8}" y="${n.y + 17}" text-anchor="end" class="node-badge">备抵</text>` : ''}
        ${n.temp && !n.contra ? `<text x="${n.x + n.w - 8}" y="${n.y + 17}" text-anchor="end" class="node-badge temp">过渡</text>` : ''}
      </g>`);
    });
    parts.push('</svg>');
    return parts.join('\n');
  }

  root.buildFlow = buildFlow;
  root.renderFlow = renderFlow;
  root.CAT_COLOR = CAT_COLOR;
  root.shortName = shortName;
})(typeof globalThis !== 'undefined' ? globalThis : this);
