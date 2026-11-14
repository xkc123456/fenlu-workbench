/* ============================================================
 * import.js —— 文件导入（txt/md/docx）与图片 OCR
 * ============================================================ */
(function (root) {
  'use strict';

  const $ = (s, r) => (r || document).querySelector(s);
  let onText = null;
  let worker = null;
  let loggerFn = null;
  let modal = null;

  /* ---------------- 通用 ---------------- */
  function setStatus(msg) {
    const el = $('#importStatus');
    if (el) el.textContent = msg;
  }

  function ensureModal() {
    if (modal) return modal;
    modal = document.createElement('div');
    modal.className = 'modal hidden';
    modal.id = 'importModal';
    modal.innerHTML = `
      <div class="modal-card">
        <header class="modal-head">
          <h3 id="importTitle">导入</h3>
          <button type="button" class="modal-x" data-close="1">×</button>
        </header>
        <div class="modal-body">
          <div class="ocr-preview-wrap"><img id="ocrPreview" alt="待识别图片"></div>
          <div class="ocr-progress"><div class="bar" id="ocrBar"></div><span id="ocrStatus">准备中…</span></div>
          <textarea id="ocrText" class="ocr-text" placeholder="识别结果会出现在这里，可先修改再插入"></textarea>
        </div>
        <footer class="modal-foot">
          <button type="button" class="primary small" id="ocrInsert">插入题干</button>
          <button type="button" class="ghost small" data-close="1">取消</button>
        </footer>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => {
      if (e.target.closest('[data-close]')) closeModal();
    });
    $('#ocrInsert', modal).addEventListener('click', () => {
      const text = $('#ocrText', modal).value.trim();
      if (text && onText) onText(text, { ocr: true });
      closeModal();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal && !modal.classList.contains('hidden')) closeModal();
    });
    return modal;
  }

  function closeModal() {
    if (modal) modal.classList.add('hidden');
    const img = $('#ocrPreview');
    if (img) { URL.revokeObjectURL(img.src); img.removeAttribute('src'); }
  }

  function openModal(title) {
    ensureModal();
    $('#importTitle').textContent = title;
    $('#ocrText').value = '';
    $('#ocrBar').style.width = '0%';
    $('#ocrStatus').textContent = '准备中…';
    modal.classList.remove('hidden');
    return modal;
  }

  /* ---------------- 文本 / docx ---------------- */
  function decodeBytes(buf) {
    let text = new TextDecoder('utf-8').decode(buf);
    const bad = (text.match(/\uFFFD/g) || []).length;
    if (bad > 6 && bad / text.length > 0.002) {
      try { text = new TextDecoder('gbk').decode(buf); } catch (e) { /* 保留 utf-8 */ }
    }
    return text;
  }

  async function inflateRaw(bytes) {
    if (typeof DecompressionStream === 'undefined') throw new Error('当前浏览器不支持解压，请升级 Chrome/Edge');
    const ds = new DecompressionStream('deflate-raw');
    const stream = new Blob([bytes]).stream().pipeThrough(ds);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  async function unzipEntry(buf, wanted) {
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    // EOCD
    let eocd = -1;
    for (let i = buf.length - 22; i >= 0 && i > buf.length - 66000; i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('不是有效的 docx（zip）文件');
    const count = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    for (let i = 0; i < count; i++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const method = dv.getUint16(p + 10, true);
      const compSize = dv.getUint32(p + 20, true);
      const nameLen = dv.getUint16(p + 28, true);
      const extraLen = dv.getUint16(p + 30, true);
      const commentLen = dv.getUint16(p + 32, true);
      const localOff = dv.getUint32(p + 42, true);
      const name = new TextDecoder('utf-8').decode(buf.subarray(p + 46, p + 46 + nameLen));
      if (name === wanted) {
        if (dv.getUint32(localOff, true) !== 0x04034b50) throw new Error('zip 结构异常');
        const lName = dv.getUint16(localOff + 26, true);
        const lExtra = dv.getUint16(localOff + 28, true);
        const start = localOff + 30 + lName + lExtra;
        const data = buf.subarray(start, start + compSize);
        if (method === 0) return data;
        if (method === 8) return await inflateRaw(data);
        throw new Error('不支持的压缩方式');
      }
      p += 46 + nameLen + extraLen + commentLen;
    }
    throw new Error('docx 中未找到正文');
  }

  function xmlToText(xml) {
    const s = xml
      .replace(/<w:tab[^>]*\/>/g, '\t')
      .replace(/<w:br[^>]*\/>/g, '\n')
      .replace(/<\/w:p>/g, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'").replace(/&amp;/g, '&')
      .replace(/&#x([0-9a-fA-F]+);/g, (m, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/&#(\d+);/g, (m, d) => String.fromCharCode(Number(d)));
    return s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  async function readDocx(file) {
    const buf = new Uint8Array(await file.arrayBuffer());
    const xmlBytes = await unzipEntry(buf, 'word/document.xml');
    return xmlToText(new TextDecoder('utf-8').decode(xmlBytes));
  }

  async function readText(file) {
    const buf = new Uint8Array(await file.arrayBuffer());
    return decodeBytes(buf);
  }

  /* ---------------- OCR ---------------- */
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src; s.onload = resolve; s.onerror = () => reject(new Error('脚本加载失败：' + src));
      document.head.appendChild(s);
    });
  }

  async function getWorker() {
    if (worker) return worker;
    if (typeof Tesseract === 'undefined') await loadScript('vendor/tesseract/tesseract.min.js');
    const base = location.origin + '/vendor/tesseract';
    worker = await Tesseract.createWorker('chi_sim', 1, {
      workerPath: base + '/worker.min.js',
      corePath: base,
      langPath: base + '/lang',
      gzip: true,
      workerBlobURL: false,
      logger: (m) => { if (loggerFn) loggerFn(m); }
    });
    return worker;
  }

  function cleanOcr(text) {
    let s = text
      .replace(/\r/g, '')
      .replace(/([\u4e00-\u9fa5])\s+(?=[\u4e00-\u9fa5])/g, '$1')
      .replace(/([\u4e00-\u9fa5])\s+(?=[，。；：、）】])/g, '$1')
      .replace(/([（【])\s+(?=[\u4e00-\u9fa5])/g, '$1')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n');
    // 常见 OCR 混淆：数字中的 O/o → 0，l/I → 1
    s = s.replace(/(?<=\d)[Oo](?=\d)/g, '0').replace(/(?<=\d)[lI](?=\d)/g, '1');
    return s.trim();
  }

  async function preprocess(img) {
    const max = 1600;
    const scale = img.naturalWidth < 900 ? 1.6 : img.naturalWidth > max ? max / img.naturalWidth : 1;
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * scale);
    c.height = Math.round(img.naturalHeight * scale);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return c;
  }

  async function ocrImage(file) {
    const isHttp = /^https?:/.test(location.protocol);
    openModal('图片识别（OCR）');
    const img = $('#ocrPreview');
    img.src = URL.createObjectURL(file);
    await new Promise((r) => { img.onload = r; img.onerror = r; });
    if (!isHttp) {
      $('#ocrStatus').textContent = 'OCR 需要本地服务：请双击 start-server.cmd 后用 http://localhost:8787 打开本页，再试。';
      $('#ocrText').value = '';
      $('#ocrText').placeholder = '当前是 file:// 直接打开，浏览器禁止加载 OCR 的本地组件。';
      return;
    }
    try {
      $('#ocrStatus').textContent = '正在加载识别引擎（首次约 3–8 秒）…';
      loggerFn = (m) => {
        const pct = Math.round((m.progress || 0) * 100);
        $('#ocrBar').style.width = Math.min(100, pct) + '%';
        $('#ocrStatus').textContent = `${m.status || '识别中'} ${pct}%`;
      };
      const w = await getWorker();
      const canvas = await preprocess(img);
      loggerFn = (m) => {
        const pct = Math.round((m.progress || 0) * 100);
        $('#ocrBar').style.width = Math.min(100, pct) + '%';
        $('#ocrStatus').textContent = `${m.status || '识别中'} ${pct}%`;
      };
      $('#ocrStatus').textContent = '正在识别文字…';
      const res = await w.recognize(canvas);
      const text = cleanOcr(res.data.text || '');
      $('#ocrText').value = text;
      $('#ocrStatus').textContent = text ? `识别完成，共 ${text.length} 字，请核对后插入` : '没有识别到文字，换一张更清晰的图试试';
      $('#ocrBar').style.width = '100%';
    } catch (err) {
      console.error(err);
      $('#ocrStatus').textContent = '识别失败：' + err.message;
    }
  }

  /* ---------------- 入口 ---------------- */
  async function handleFiles(files, cb) {
    if (cb) onText = cb;
    for (const file of Array.from(files || [])) {
      const name = file.name || '';
      const lower = name.toLowerCase();
      try {
        if (file.type.startsWith('image/') || /\.(png|jpe?g|webp|bmp|gif)$/.test(lower)) {
          await ocrImage(file);
          setStatus('图片已打开：确认 OCR 文字后插入。');
          return;
        }
        if (/\.docx$/.test(lower)) {
          const text = await readDocx(file);
          if (text) { onText(text, { file: name }); setStatus(`已导入 ${name}（${text.length} 字）`); }
          else setStatus('docx 里没有读到文字。');
          return;
        }
        if (/\.doc$/.test(lower)) {
          setStatus('旧版 .doc 无法直接读取，请另存为 .docx 或复制粘贴。');
          return;
        }
        if (/\.pdf$/.test(lower)) {
          setStatus('PDF 暂不支持直接读取：请用 Word 打开另存为 .docx，或截图后用图片识别。');
          return;
        }
        if (/\.(txt|md|csv|json)$/.test(lower) || file.type.startsWith('text/')) {
          const text = await readText(file);
          if (text) { onText(text, { file: name }); setStatus(`已导入 ${name}（${text.length} 字）`); }
          return;
        }
        setStatus('暂不支持这种文件：支持 txt / md / docx / 图片。');
      } catch (err) {
        console.error(err);
        setStatus('导入失败：' + err.message);
      }
    }
  }

  function init(opts) {
    onText = opts.onText;
    const fileInput = $('#fileInput');
    const imageInput = $('#imageInput');
    if (fileInput) fileInput.addEventListener('change', (e) => { handleFiles(e.target.files); e.target.value = ''; });
    if (imageInput) imageInput.addEventListener('change', (e) => { handleFiles(e.target.files); e.target.value = ''; });

    const dz = $('#source');
    if (dz) {
      ['dragenter', 'dragover'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('dragging'); }));
      ['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('dragging'); }));
      dz.addEventListener('drop', (e) => {
        if (e.dataTransfer && e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
      });
    }
  }

  root.Importer = { init, handleFiles, ocrImage };
})(typeof globalThis !== 'undefined' ? globalThis : this);
