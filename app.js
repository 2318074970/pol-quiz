(function () {
  'use strict';

  const D = window.POLQ;
  if (!D) {
    document.getElementById('view').innerHTML = '<div class="empty"><h3>数据未加载</h3><p>请检查 data/questions.js 是否存在。</p></div>';
    return;
  }

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const DAY = 86400000;
  const INTERVALS = [1, 3, 7, 15, 30]; // days after each successful stage
  const LS_KEY = 'polq-v1';

  const byId = Object.create(null);
  const chapterById = Object.create(null);
  const yearBy = Object.create(null);
  D.questions.forEach(q => { byId[q.id] = q; });
  D.chapters.forEach(c => { chapterById[c.ch] = c; });

  let store = { answers: {}, theme: 'light' };
  try {
    const raw = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
    if (raw && typeof raw === 'object') store = Object.assign(store, raw);
    if (!store.answers || typeof store.answers !== 'object') store.answers = {};
  } catch (e) { store = { answers: {}, theme: 'light' }; }

  let state = {
    mode: 'knowledge',
    mod: '',
    search: '',
    wfilter: 'wrong',
    session: null,
    timer: null
  };

  function save() {
    try { localStorage.setItem(LS_KEY, JSON.stringify({ answers: store.answers, theme: store.theme })); } catch (e) {}
  }

  function A(id) {
    if (!store.answers[id]) {
      store.answers[id] = {
        attempts: 0, correct: 0, wrong: 0, last: 0, lastSel: [], lastOk: null,
        stage: 0, streak: 0, due: 0, wrong: false, fav: false, note: '', mastered: false
      };
    }
    return store.answers[id];
  }

  function todayEnd() {
    const d = new Date(); d.setHours(23, 59, 59, 999); return d.getTime();
  }

  function isDue(a) {
    return !!(a && a.due && a.due <= todayEnd() && !a.mastered);
  }

  function wrongIds() {
    return D.questions.filter(q => { const a = A(q.id); return a.wrong && !a.mastered; }).map(q => q.id);
  }

  function favIds() {
    return D.questions.filter(q => A(q.id).fav).map(q => q.id);
  }

  function dueIds() {
    return D.questions.filter(q => { const a = A(q.id); return isDue(a); }).map(q => q.id);
  }

  function attemptedIds() {
    return D.questions.filter(q => A(q.id).attempts > 0).map(q => q.id);
  }

  function stats() {
    let seen = 0, attempts = 0, correct = 0, mastered = 0;
    D.questions.forEach(q => {
      const a = A(q.id);
      if (a.attempts) seen++;
      attempts += a.attempts;
      correct += a.correct || 0;
      if (a.mastered) mastered++;
    });
    return { seen, attempts, correct, mastered, wrong: wrongIds().length, due: dueIds().length, fav: favIds().length, acc: attempts ? Math.round(correct * 100 / attempts) : 0 };
  }

  function chapterStat(ch) {
    let seen = 0, attempts = 0, correct = 0, wrong = 0;
    ch.ids.forEach(id => {
      const a = A(id);
      if (a.attempts) seen++;
      attempts += a.attempts;
      correct += a.correct || 0;
      if (a.wrong) wrong++;
    });
    return { seen, attempts, correct, wrong, acc: attempts ? Math.round(correct * 100 / attempts) : 0, pct: ch.ids.length ? Math.round(seen * 100 / ch.ids.length) : 0 };
  }

  function yearStat(y) {
    let seen = 0, attempts = 0, correct = 0, wrong = 0;
    y.ids.forEach(id => {
      const a = A(id);
      if (a.attempts) seen++;
      attempts += a.attempts;
      correct += a.correct || 0;
      if (a.wrong) wrong++;
    });
    return { seen, attempts, correct, wrong, pct: y.ids.length ? Math.round(seen * 100 / y.ids.length) : 0 };
  }

  function applyTheme() {
    if (store.theme !== 'night') store.theme = 'light';
    document.documentElement.dataset.theme = store.theme;
    const b = $('#theme-btn');
    if (b) b.textContent = store.theme === 'night' ? '☀ 护眼' : '◐ 夜间';
  }

  function toast(msg) {
    const t = $('#toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove('on'), 1900);
  }

  function refreshMeta() {
    const s = stats();
    const st = $('#stat-total'), sc = $('#stat-chap'), sy = $('#stat-year');
    if (st) st.textContent = D.meta.total;
    if (sc) sc.textContent = D.meta.chapterCount;
    if (sy) sy.textContent = D.meta.yearCount;
    const bw = $('#badge-wrong'), bd = $('#badge-due');
    if (bw) bw.textContent = s.wrong;
    if (bd) bd.textContent = s.due;
    $$('.tab').forEach(b => b.classList.toggle('on', b.dataset.mode === state.mode));
  }

  function renderRail() {
    const rail = $('#rail');
    if (!rail) return;
    const s = stats();
    const mods = D.meta.modules;
    rail.innerHTML = `
      <div class="rail-box">
        <p class="rail-title">模块</p>
        <div class="rail-list">
          <button class="rail-item ${state.mod === '' ? 'on' : ''}" data-act="set-mod" data-mod=""><b>全部模块</b><em>${D.meta.total}</em></button>
          ${mods.map(m => `<button class="rail-item ${state.mod === m.name ? 'on' : ''}" data-act="set-mod" data-mod="${esc(m.name)}"><b>${esc(m.name)}</b><em>${m.count}</em></button>`).join('')}
        </div>
        <div class="rail-sep"></div>
        <div class="rail-progress">已做 <b>${s.seen}</b> / ${D.meta.total} 题，正确率 <b>${s.acc}%</b></div>
        <div class="pbar"><i style="width:${D.meta.total ? (s.seen * 100 / D.meta.total) : 0}%"></i></div>
        <div class="rail-links">
          <div class="rail-link" data-act="goto" data-mode="wrong"><span>错题本</span><b>${s.wrong}</b></div>
          <div class="rail-link" data-act="goto" data-mode="review"><span>今日待复习</span><b>${s.due}</b></div>
          <div class="rail-link" data-act="goto" data-mode="wrong"><span>收藏</span><b>${s.fav}</b></div>
        </div>
      </div>`;
  }

  function pageHead(title, desc, search) {
    return `<div class="page-head">
      <div><h2>${esc(title)}</h2><p>${esc(desc)}</p></div>
      ${search ? `<div class="search"><span style="color:var(--muted);font-size:15px">⌕</span><input id="search" type="search" placeholder="搜章 / 题号 / 题干关键词" value="${esc(state.search)}" autocomplete="off"></div>` : ''}
    </div>`;
  }

  function filteredChapters() {
    const q = state.search.trim().toLowerCase();
    let list = D.chapters.filter(c => !state.mod || c.mod === state.mod);
    if (!q) return list;
    const hitIds = new Set(D.questions.filter(x => (x.stem + ' ' + x.options.A + ' ' + x.options.B + ' ' + x.options.C + ' ' + x.options.D).toLowerCase().includes(q)).map(x => x.ch));
    return list.filter(c => (c.name + ' ' + c.mod + ' ' + c.ch).toLowerCase().includes(q) || hitIds.has(c.ch));
  }

  function chapterCard(c) {
    const st = chapterStat(c);
    return `<article class="card">
      <div class="card-top"><span class="num">第${esc(c.ch)}章</span><span class="tag ${['马原','新思想'].includes(c.mod) ? 'amber' : ''}">${esc(c.mod)}</span></div>
      <h3>${esc(c.name)}</h3>
      <div class="meta"><span><b>${c.count}</b> 题</span><span>${c.years[0]}–${c.years[1]}</span><span>已做 <b>${st.seen}</b> / ${c.count}</span></div>
      <div class="pbar"><i style="width:${st.pct}%"></i></div>
      <div class="foot">
        <span style="font-size:12px;color:var(--muted)">${st.seen ? '正确率 ' + st.acc + '%' : '未开始'}${st.wrong ? ' · 错题 ' + st.wrong : ''}</span>
        <div style="display:flex;gap:7px">
          ${st.wrong ? `<button class="btn small ghost" data-act="start-chapter-wrong" data-ch="${esc(c.ch)}">错题</button>` : ''}
          <button class="btn small primary" data-act="start-chapter" data-ch="${esc(c.ch)}">开始刷</button>
        </div>
      </div>
    </article>`;
  }

  function renderKnowledge() {
    $('#view').innerHTML = pageHead('按知识点刷', `43 个知识点，${D.meta.total} 道真题；按章连续刷，答案解析逐题展开。`, true) +
      `<div class="chips" id="kchips">
        <button class="chip ${state.mod === '' ? 'on' : ''}" data-act="set-mod" data-mod="">全部 ${D.meta.total}</button>
        ${D.meta.modules.map(m => `<button class="chip ${state.mod === m.name ? 'on' : ''}" data-act="set-mod" data-mod="${esc(m.name)}">${esc(m.name)} ${m.count}</button>`).join('')}
      </div>
      <div class="grid" id="kgrid"></div>`;
    renderKnowledgeCards();
    const input = $('#search');
    if (input) {
      input.addEventListener('input', e => {
        state.search = e.target.value;
        renderKnowledgeCards();
      });
    }
  }

  function renderKnowledgeCards() {
    const box = $('#kgrid');
    if (!box) return;
    const list = filteredChapters();
    box.innerHTML = list.length
      ? list.map(chapterCard).join('')
      : `<div class="empty" style="grid-column:1/-1"><h3>没有匹配的知识点</h3><p>换个关键词，或清空模块筛选。</p></div>`;
  }

  function renderPapers() {
    $('#view').innerHTML = pageHead('按年份套卷', '2017–2026 共 10 套精选题；按年份连续做，提交后立刻看逐题详解。', false) +
      `<div style="background:var(--paper);border:1px solid var(--line);border-radius:12px;padding:12px 14px;margin-bottom:16px;font-size:12px;color:var(--muted);line-height:1.8">
        说明：这里是 <b style="color:var(--ink)">267 道高频精选题</b>，不是每年 33 道完整整卷；适合按年份集中刷和查漏补缺。整卷原题可在套卷页打开。
      </div>
      <div class="year-grid">
        ${D.years.map(y => {
          const st = yearStat(y);
          const best = y.ids.reduce((m, id) => { const a = A(id); return a.lastOk ? m + 1 : m; }, 0);
          return `<article class="card year-card">
            <div class="card-top"><span class="num">${y.y}</span><span class="tag">${st.seen ? '已做 ' + st.seen : '未做'}</span></div>
            <div class="year">${y.y}</div>
            <div class="sub">${y.count} 题 · 单选 ${y.single} · 多选 ${y.multi}</div>
            <div class="pbar" style="margin-top:12px"><i style="width:${st.pct}%"></i></div>
            <div class="score"><span>${st.seen ? '历史答对 ' + best + ' / ' + y.count : '从头开始'}</span><span>${st.wrong ? '错题 ' + st.wrong : ''}</span></div>
            <div class="foot" style="margin-top:14px">
              <button class="btn small ghost" data-act="start-year-wrong" data-y="${y.y}">错题重做</button>
              <button class="btn small primary" data-act="start-year" data-y="${y.y}">开始套卷</button>
            </div>
          </article>`;
        }).join('')}
      </div>`;
  }

  function qTags(q) {
    return `<span class="tag ${q.type === 'multi' ? 'amber' : ''}">${q.type === 'multi' ? '多选' : '单选'}</span>
      <span class="tag">${esc(q.mod)}</span>
      <span class="tag">第${esc(q.ch)}章</span>
      <span>${q.y} 年第 ${q.t} 题</span>`;
  }

  function fmtExp(text) {
    let s = esc(text || '');
    s = s.replace(/([A-D])\s*项/gu, '\n$1 项');
    s = s.replace(/([A-D])\s*、\s*([A-D])\s*、\s*([A-D])\s*正确/gu, '$1、$2、$3 正确');
    return s.replace(/^\n+/, '').trim();
  }

  function explanationOf(q) {
    if (q.explanation && q.explanation.trim()) return q.explanation;
    const lines = [
      `【考点】本题考查「${q.chname}」中的核心概念与判断。`,
      `【正确答案】${q.answer}。`,
      `【正确项】${q.answer.split('').map(k => `${k}. ${q.options[k]}`).join('；')}`,
      `【提示】本题原题库只保留了答案，没有逐项解析。做题时抓住题干的主体、限定条件和设问方向，再对照选项是否偷换概念、扩大范围或颠倒因果。`
    ];
    return lines.join('\n');
  }

  function pdfHref(q) {
    const segs = String(D.meta.pdf || '').split('/').map(x => encodeURIComponent(x)).join('/');
    return './' + segs + '#page=' + (q.p || 1);
  }

  function qCard(q, opts) {
    opts = opts || {};
    const a = A(q.id);
    const sel = (a.lastSel || []).join('');
    return `<article class="qcard" data-id="${esc(q.id)}">
      <div class="qmeta">${qTags(q)}${a.wrong ? '<span class="tag" style="color:var(--red)">错题</span>' : ''}${a.fav ? '<span class="tag">收藏</span>' : ''}</div>
      <p class="stem">${esc(q.stem)}</p>
      <div class="ansline">正确答案 <b>${esc(q.answer)}</b>${a.attempts ? ` · 我上次选 ${esc(sel || '—')}` : ''}${a.attempts ? ` · 已答 ${a.attempts} 次` : ''}</div>
      <div class="exp">${fmtExp(explanationOf(q))}<a class="src" href="${pdfHref(q)}" target="_blank" rel="noopener">原书 P${esc(q.p || '?')} ↗</a></div>
      <div class="qf">
        <button class="btn small ghost" data-act="toggle-exp">${opts.open ? '收起解析' : '展开解析'}</button>
        <button class="btn small" data-act="redo-one" data-id="${esc(q.id)}">重做</button>
        <button class="btn small ghost" data-act="toggle-fav" data-id="${esc(q.id)}">${a.fav ? '取消收藏' : '收藏'}</button>
        ${a.wrong ? `<button class="btn small ghost" data-act="master-one" data-id="${esc(q.id)}">移出错题</button>` : ''}
      </div>
    </article>`;
  }

  function renderWrong() {
    const s = stats();
    let ids;
    if (state.wfilter === 'fav') ids = favIds();
    else if (state.wfilter === 'all') ids = attemptedIds();
    else ids = wrongIds();
    $('#view').innerHTML = pageHead('错题本', '答错自动进来；连续答对 2 次后会自动移出，也可以手动移出。', false) +
      `<div class="chips">
        <button class="chip ${state.wfilter === 'wrong' ? 'on' : ''}" data-act="wfilter" data-w="wrong">错题 ${s.wrong}</button>
        <button class="chip ${state.wfilter === 'fav' ? 'on' : ''}" data-act="wfilter" data-w="fav">收藏 ${s.fav}</button>
        <button class="chip ${state.wfilter === 'all' ? 'on' : ''}" data-act="wfilter" data-w="all">已做 ${s.seen}</button>
        <span style="flex:1"></span>
        <button class="btn small ghost" data-act="export-wrong">导出 Markdown</button>
        <button class="btn small danger" data-act="clear-wrong">清空错题</button>
      </div>
      <div class="list">${ids.length ? ids.map(id => qCard(byId[id])).join('') : `<div class="empty"><h3>${state.wfilter === 'wrong' ? '还没有错题' : '这里还是空的'}</h3><p>开始刷题后，答错和收藏会自动记录。</p></div>`}</div>`;
  }

  function renderReview() {
    const s = stats();
    const due = dueIds();
    const now = new Date(); now.setHours(0, 0, 0, 0);
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(now.getTime() + i * DAY);
      const next = new Date(now.getTime() + (i + 1) * DAY);
      let n = 0;
      Object.keys(store.answers).forEach(id => {
        const a = A(id);
        if (a.due && a.due >= d.getTime() && a.due < next.getTime() && !a.mastered) n++;
      });
      days.push({ label: i === 0 ? '今天' : (i === 1 ? '明日' : ['周日','周一','周二','周三','周四','周五','周六'][d.getDay()]), n, today: i === 0 });
    }
    const max = Math.max(1, ...days.map(d => d.n));
    const weak = D.chapters.map(c => ({ c, st: chapterStat(c) }))
      .filter(x => x.st.seen >= 3)
      .sort((a, b) => a.st.acc - b.st.acc || a.st.wrong - b.st.wrong)
      .slice(0, 6);

    $('#view').innerHTML = pageHead('复习计划', '按 1 / 3 / 7 / 15 / 30 天的间隔安排；答错明天必复习。', false) +
      `<div class="review-hero">
        <div>
          <h2>今天该复习 <span style="color:var(--accent)">${due.length}</span> 题</h2>
          <p>${due.length ? '这些题已经到期，先清今天的复习队列。' : '今天的复习队列已清空，可以继续刷新题。'}</p>
          <div style="margin-top:18px;display:flex;gap:10px;flex-wrap:wrap">
            <button class="btn primary" data-act="start-review" ${due.length ? '' : 'disabled'}>开始今日复习</button>
            <button class="btn ghost" data-act="goto" data-mode="wrong">去错题本</button>
          </div>
        </div>
        <div>
          <div class="big">${s.mastered}<small>/ ${D.meta.total} 已掌握</small></div>
          <p style="margin-top:8px">累计作答 ${s.attempts} 次，正确率 ${s.acc}%</p>
          <div class="forecast">${days.map(d => `<div class="fday"><div class="fbar"><i class="${d.today ? 'today' : ''}" style="height:${Math.max(3, Math.round(d.n * 100 / max))}%"></i></div><span>${d.label}</span><b style="display:block;color:var(--muted);font-weight:400">${d.n}</b></div>`).join('')}</div>
        </div>
      </div>
      <div class="card" style="padding:20px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><h3 style="margin:0">薄弱知识点</h3><span style="font-size:12px;color:var(--muted)">按正确率从低到高</span></div>
        ${weak.length ? weak.map(x => `<div class="weak-row"><span>第${esc(x.c.ch)}章 ${esc(x.c.name)}</span><b>${x.st.acc}% · ${x.st.seen}/${x.c.count}</b></div>`).join('') : '<div style="padding:16px 0;color:var(--muted);font-size:13px">至少做 3 题后，这里会出现薄弱知识点。</div>'}
        <div style="margin-top:14px;font-size:12px;color:var(--muted);line-height:1.9">规则：答错 → 明天复习；答对 → 按阶段往后推 1 / 3 / 7 / 15 / 30 天；连续答对 2 次自动移出错题本。</div>
      </div>`;
  }

  function render() {
    refreshMeta();
    renderRail();
    if (state.mode === 'papers') renderPapers();
    else if (state.mode === 'wrong') renderWrong();
    else if (state.mode === 'review') renderReview();
    else renderKnowledge();
  }

  /* ---------- practice ---------- */
  function startSession(ids, title, mode, meta) {
    ids = Array.from(new Set(ids || []));
    if (!ids.length) { toast('这里还没有题目'); return; }
    if (state.session) closeSession(false);
    state.session = { ids, title, mode: mode || 'practice', meta: meta || {}, index: 0, results: {}, start: Date.now(), elapsed: 0 };
    $('#overlay').classList.add('on');
    document.body.style.overflow = 'hidden';
    renderSession();
    startTimer();
  }

  function startTimer() {
    stopTimer();
    const tick = () => {
      if (!state.session) return;
      state.session.elapsed = Math.floor((Date.now() - state.session.start) / 1000);
      const t = $('#p-timer');
      if (t) {
        const m = String(Math.floor(state.session.elapsed / 60)).padStart(2, '0');
        const s = String(state.session.elapsed % 60).padStart(2, '0');
        t.textContent = '⏱ ' + m + ':' + s;
        t.hidden = false;
      }
    };
    tick();
    state.timer = setInterval(tick, 1000);
  }

  function stopTimer() {
    if (state.timer) { clearInterval(state.timer); state.timer = null; }
  }

  function closeSession(clear) {
    stopTimer();
    $('#overlay').classList.remove('on');
    document.body.style.overflow = '';
    if (clear !== false) state.session = null;
    render();
  }

  function currentQ() {
    const s = state.session;
    if (!s || s.index < 0 || s.index >= s.ids.length) return null;
    return byId[s.ids[s.index]];
  }

  function renderSession() {
    const s = state.session;
    if (!s) return;
    const title = $('#p-title');
    const count = $('#p-count');
    if (title) title.textContent = s.title;
    if (s.index >= s.ids.length) { renderSummary(); return; }
    const q = currentQ();
    const res = s.results[q.id];
    const sel = res ? res.sel : [];
    const answered = !!res;
    const a = A(q.id);
    const pMain = $('#p-main');
    if (count) count.textContent = `第 ${s.index + 1} / ${s.ids.length} 题`;

    pMain.innerHTML = `
      <div class="q-head">
        <span class="q-no">${String(q.t).padStart(2, '0')}</span>
        <span class="q-index">${q.y} 年 · 第 ${q.t} 题</span>
        ${qTags(q)}
      </div>
      <p class="stem">${esc(q.stem)}</p>
      <div class="opts" id="opts">
        ${['A','B','C','D'].map(k => {
          const on = sel.includes(k);
          const isRight = answered && q.answer.includes(k);
          const isWrong = answered && on && !q.answer.includes(k);
          return `<button type="button" class="opt ${on ? 'on' : ''} ${isRight ? 'ok' : ''} ${isWrong ? 'bad' : ''}" data-act="opt" data-k="${k}" ${answered ? 'disabled' : ''}>
            <span class="key">${k}</span><span class="tx">${esc(q.options[k] || '')}</span>
          </button>`;
        }).join('')}
      </div>
      <div class="p-actions">
        <button class="btn small ghost" data-act="p-prev" ${s.index === 0 ? 'disabled' : ''}>← 上一题</button>
        ${answered
          ? `<button class="btn primary" data-act="p-next">${s.index === s.ids.length - 1 ? '交卷看结果' : '下一题 →'}</button>
             <button class="btn small ghost" data-act="p-redo">重做本题</button>`
          : `<button class="btn primary" data-act="p-submit" ${sel.length ? '' : 'disabled'}>提交答案</button>`}
        <span class="spacer"></span>
        <span style="font-size:11px;color:var(--muted)">${q.type === 'multi' ? '多选题：选全对才得分' : '单选题'}</span>
        <button class="btn small ghost" data-act="p-close">结束</button>
      </div>
      <div class="ans-panel ${answered ? 'on' : ''}" id="ans-panel">
        ${answered ? `<div class="ans-head">
          <span class="${res.ok ? 'ok' : 'no'}">${res.ok ? '✓ 回答正确' : '✕ 回答错误'}</span>
          <span>正确答案 <b>${esc(q.answer)}</b></span>
          <span class="right">你的答案 ${esc(sel.join('') || '—')}</span>
        </div>
        <div class="ans-body">${fmtExp(explanationOf(q))}<a class="src" href="${pdfHref(q)}" target="_blank" rel="noopener">原书 P${esc(q.p || '?')} ↗</a></div>
        <div class="note-box" style="padding:0 16px 16px">
          <label for="q-note">我的笔记（自动保存）</label>
          <textarea id="q-note" placeholder="记下这道题的陷阱、易混点…">${esc(a.note || '')}</textarea>
        </div>` : ''}
      </div>`;
  }

  function selectOption(k) {
    const s = state.session;
    if (!s) return;
    const q = currentQ();
    if (!q || s.results[q.id]) return;
    if (q.type === 'single') {
      s._sel = [k];
    } else {
      const cur = s._sel || [];
      s._sel = cur.includes(k) ? cur.filter(x => x !== k) : cur.concat(k).sort();
    }
    // rerender options only to keep scroll position
    const box = $('#opts');
    if (box) {
      $$('.opt', box).forEach(b => {
        const on = (s._sel || []).includes(b.dataset.k);
        b.classList.toggle('on', on);
      });
    }
    const submit = $('[data-act="p-submit"]');
    if (submit) submit.disabled = !(s._sel || []).length;
  }

  function submitAnswer() {
    const s = state.session;
    if (!s) return;
    const q = currentQ();
    if (!q) return;
    const sel = s._sel || [];
    if (!sel.length) { toast('先选一个答案'); return; }
    const ok = sel.slice().sort().join('') === q.answer.split('').sort().join('');
    s.results[q.id] = { sel: sel.slice(), ok };
    const a = A(q.id);
    a.attempts = (a.attempts || 0) + 1;
    a.last = Date.now();
    a.lastSel = sel.slice();
    a.lastOk = ok;
    if (ok) {
      a.correct = (a.correct || 0) + 1;
      a.streak = (a.streak || 0) + 1;
      a.stage = Math.min(5, (a.stage || 0) + 1);
      a.due = a.last + INTERVALS[Math.max(0, a.stage - 1)] * DAY;
      if (a.streak >= 2 && a.stage >= 3) a.wrong = false;
      if (a.stage >= 5) a.mastered = true;
    } else {
      a.wrong = true;
      a.wrongCount = (a.wrongCount || 0) + 1;
      a.streak = 0;
      a.stage = 0;
      a.mastered = false;
      a.due = a.last + DAY;
    }
    a.done = true;
    save();
    s._sel = [];
    refreshMeta();
    renderSession();
    toast(ok ? '✓ 答对了' : '✕ 已记入错题本');
  }

  function redoCurrent() {
    const s = state.session;
    if (!s) return;
    const q = currentQ();
    if (!q) return;
    delete s.results[q.id];
    s._sel = [];
    renderSession();
  }

  function nextQuestion() {
    const s = state.session;
    if (!s) return;
    if (s.index >= s.ids.length - 1) { renderSummary(); return; }
    s.index++;
    s._sel = [];
    renderSession();
  }

  function prevQuestion() {
    const s = state.session;
    if (!s) return;
    if (s.index <= 0) return;
    s.index--;
    s._sel = [];
    renderSession();
  }

  function renderSummary() {
    const s = state.session;
    if (!s) return;
    stopTimer();
    const total = s.ids.length;
    const results = s.results || {};
    const done = Object.keys(results).length;
    const correct = Object.values(results).filter(r => r.ok).length;
    const wrong = Object.values(results).filter(r => !r.ok).length;
    const pct = total ? Math.round(correct * 100 / total) : 0;
    const wrongList = Object.entries(results).filter(([, r]) => !r.ok).map(([id]) => id);
    const m = Math.floor((s.elapsed || 0) / 60), sec = String((s.elapsed || 0) % 60).padStart(2, '0');
    $('#p-main').innerHTML = `<div class="summary">
      <div class="score">${correct}<small>/ ${total} 题</small></div>
      <h2>${pct >= 80 ? '这一轮很稳' : pct >= 60 ? '及格线上，继续补漏' : '先把错题吃透'}</h2>
      <p>本次作答 ${done} 题，用时 ${m}:${sec}；未作答 ${total - done} 题。</p>
      <div class="sgrid">
        <div class="sbox"><b>${correct}</b><span>答对</span></div>
        <div class="sbox"><b>${wrong}</b><span>答错</span></div>
        <div class="sbox"><b>${pct}%</b><span>正确率</span></div>
      </div>
      <div class="acts">
        ${wrongList.length ? `<button class="btn primary" data-act="summary-wrong" data-ids="${esc(wrongList.join(','))}">重做本轮错题</button>` : ''}
        <button class="btn ghost" data-act="p-close">返回</button>
      </div>
      <p style="margin-top:18px;font-size:12px;color:var(--muted)">本次错题已按题记录；连续答对 2 次会自动移出错题本。</p>
    </div>`;
    $('#p-count').textContent = `完成 ${done} / ${total}`;
    $('#p-title').textContent = s.title + ' · 结果';
  }

  /* ---------- export ---------- */
  function exportWrong() {
    const ids = state.wfilter === 'fav' ? favIds() : state.wfilter === 'all' ? attemptedIds() : wrongIds();
    if (!ids.length) { toast('没有可导出的题'); return; }
    const lines = [`# 政治错题本`, '', `导出时间：${new Date().toLocaleString()}`, `共 ${ids.length} 题`, ''];
    ids.forEach((id, i) => {
      const q = byId[id], a = A(id);
      lines.push(`## ${i + 1}. ${q.y} 年第 ${q.t} 题 · ${q.mod} · 第${q.ch}章`);
      lines.push('');
      lines.push(q.stem);
      lines.push('');
      ['A','B','C','D'].forEach(k => lines.push(`${k}. ${q.options[k]}`));
      lines.push('');
      lines.push(`**答案：${q.answer}**　我的作答：${(a.lastSel || []).join('') || '—'}`);
      lines.push('');
      lines.push(q.explanation);
      if (a.note) { lines.push(''); lines.push(`**我的笔记：** ${a.note}`); }
      lines.push('');
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `政治错题本_${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('已导出 Markdown');
  }

  /* ---------- events ---------- */
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'goto') {
      state.mode = b.dataset.mode || 'knowledge';
      state.search = '';
      render();
      return;
    }
    if (act === 'set-mod') {
      state.mod = b.dataset.mod || '';
      if (state.mode !== 'knowledge') state.mode = 'knowledge';
      state.search = '';
      render();
      return;
    }
    if (act === 'start-chapter') {
      const c = chapterById[b.dataset.ch];
      if (c) startSession(c.ids, `第${c.ch}章 · ${c.name}`, 'chapter', { ch: c.ch });
      return;
    }
    if (act === 'start-chapter-wrong') {
      const c = chapterById[b.dataset.ch];
      if (!c) return;
      const ids = c.ids.filter(id => { const a = A(id); return a.wrong && !a.mastered; });
      startSession(ids, `第${c.ch}章 · 错题`, 'chapter-wrong', { ch: c.ch });
      return;
    }
    if (act === 'start-year') {
      const y = D.years.find(x => String(x.y) === b.dataset.y);
      if (y) startSession(y.ids, `${y.y} 年套卷`, 'paper', { y: y.y });
      return;
    }
    if (act === 'start-year-wrong') {
      const y = D.years.find(x => String(x.y) === b.dataset.y);
      if (!y) return;
      const ids = y.ids.filter(id => { const a = A(id); return a.wrong && !a.mastered; });
      startSession(ids, `${y.y} 年 · 错题重做`, 'paper-wrong', { y: y.y });
      return;
    }
    if (act === 'start-wrong') { startSession(wrongIds(), '错题本 · 重做', 'wrong'); return; }
    if (act === 'start-review') { startSession(dueIds(), '今日复习', 'review'); return; }
    if (act === 'wfilter') { state.wfilter = b.dataset.w || 'wrong'; renderWrong(); return; }
    if (act === 'toggle-exp') {
      const card = b.closest('.qcard');
      if (card) { card.classList.toggle('open'); b.textContent = card.classList.contains('open') ? '收起解析' : '展开解析'; }
      return;
    }
    if (act === 'toggle-fav') {
      const id = b.dataset.id;
      if (!id) return;
      const a = A(id); a.fav = !a.fav; save(); refreshMeta();
      if (state.mode === 'wrong') renderWrong();
      toast(a.fav ? '已收藏' : '已取消收藏');
      return;
    }
    if (act === 'master-one') {
      const id = b.dataset.id; if (!id) return;
      const a = A(id); a.wrong = false; a.mastered = true; save(); refreshMeta(); renderWrong();
      toast('已移出错题本');
      return;
    }
    if (act === 'redo-one') {
      const id = b.dataset.id;
      if (id) startSession([id], '单题重做', 'single');
      return;
    }
    if (act === 'export-wrong') { exportWrong(); return; }
    if (act === 'clear-wrong') {
      if (!confirm('清空所有错题标记？答题记录会保留，但错题本会清空。')) return;
      D.questions.forEach(q => { const a = A(q.id); a.wrong = false; });
      save(); refreshMeta(); renderWrong(); toast('错题本已清空');
      return;
    }
    if (act === 'opt') { selectOption(b.dataset.k); return; }
    if (act === 'p-submit') { submitAnswer(); return; }
    if (act === 'p-next') { nextQuestion(); return; }
    if (act === 'p-prev') { prevQuestion(); return; }
    if (act === 'p-redo') { redoCurrent(); return; }
    if (act === 'p-close') { closeSession(); return; }
    if (act === 'summary-wrong') {
      const ids = (b.dataset.ids || '').split(',').filter(Boolean);
      startSession(ids, '本轮错题重做', 'summary-wrong');
      return;
    }
  });

  document.addEventListener('input', e => {
    if (e.target && e.target.id === 'q-note') {
      const s = state.session;
      const q = currentQ();
      if (s && q) { A(q.id).note = e.target.value; save(); }
    }
  });

  document.addEventListener('keydown', e => {
    if (!state.session || state.session.index >= state.session.ids.length) return;
    if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
    const q = currentQ();
    if (!q) return;
    if (['1','2','3','4'].includes(e.key)) { selectOption('ABCD'[Number(e.key) - 1]); e.preventDefault(); }
    if (e.key === 'Enter') {
      const res = state.session.results[q.id];
      if (res) nextQuestion(); else submitAnswer();
      e.preventDefault();
    }
  });

  $('#theme-btn').addEventListener('click', () => {
    store.theme = store.theme === 'night' ? 'light' : 'night';
    save(); applyTheme();
  });

  $$('.tab').forEach(b => b.addEventListener('click', () => {
    state.mode = b.dataset.mode || 'knowledge';
    state.search = '';
    render();
  }));

  applyTheme();
  refreshMeta();
  render();
})();
