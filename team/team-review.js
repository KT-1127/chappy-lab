/* チームで開発：依頼者のレビュー（観点ごとに★1〜3＋自由記述の理由）
   依頼者のページ・開発者のページ・教師ページで同じ形で表示する */
(function(){
  // 観点（サーバーの TEAM_CRITERIA と同じ）
  const CRITERIA = [
    { k:'help', label:'困りごとを助けてくれる', hint:'依頼した困りごとが、これで本当に助かりそうか' },
    { k:'easy', label:'説明だけで使い方がわかる', hint:'プログラムを見なくても、説明を読めば使えるか' },
    { k:'fit',  label:'この人のくらし・気持ちに合っている', hint:'1日の過ごし方や苦手なことに合っているか' },
  ];
  const esc = t => String(t == null ? '' : t).replace(/[&<>"]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
  const stars = n => '<span style="color:#F5B301;letter-spacing:1px">' + '★'.repeat(n) + '</span>' +
                     '<span style="color:#D5DCE5;letter-spacing:1px">' + '★'.repeat(Math.max(0, 3 - n)) + '</span>';
  // 合格条件（依頼書）を 文で（TeamCheck が 読みこまれていれば 文章に、なければ メモだけ）
  function critHTML(cr){
    if(!cr || !((cr.list || []).length || (cr.donts || []).length)) return '';
    const TC = window.TeamCheck;
    const li = (mark, s, note) => '<div style="margin:2px 0">' + mark + ' ' + esc(s) + (note ? '<span style="color:#7A8899;font-weight:700">（' + esc(note) + '）</span>' : '') + '</div>';
    return (cr.list || []).map((c, i) => li('✅' + '①②③④⑤'[i], TC ? TC.text(c) : (c.note || ''), TC ? c.note : '')).join('') +
           (cr.donts || []).map(d => li('🚫', TC ? TC.dontText(d) : (d.note || ''), TC ? d.note : '')).join('');
  }
  const CK_ICON = { ok:'✔', ng:'✖', wait:'⏳', none:'ー' };
  const CK_COL = { ok:'#1F7A44', ng:'#B23A2C', wait:'#8A6200', none:'#7A8899' };
  // 提出に ついている「家の フィールドで ためした 結果」（✔／✖ だけ。何時に 何が おきたかは 家の 画面で 見る）
  function checksHTML(ch, title){
    if(!ch || !((ch.list || []).length || (ch.donts || []).length)) return '';
    const row = (r, mark) => '<div style="margin:2px 0"><b style="color:' + CK_COL[r.status] + '">' + CK_ICON[r.status] + '</b> ' + mark + ' ' + esc(r.label) + '</div>';
    return '<div style="margin-top:6px;font-size:12.5px"><b style="font-size:11.5px;color:#7A8899">' + esc(title || '🏠 家で ためした 結果') + (ch.range ? '（' + esc(ch.range) + '）' : '') + '</b>' +
      (ch.list || []).map((r, i) => row(r, '①②③④⑤'[i])).join('') + (ch.donts || []).map(r => row(r, '🚫')).join('') + '</div>';
  }
  function total(e){
    const sc = (e && e.scores) || [];
    return { got: sc.reduce((a, s) => a + (s.stars || 0), 0), max: sc.length * 3 };
  }
  // レビュー1件を表示する（前の形「受け取ります／直してほしい」も そのまま出す）
  function html(e){
    if(!e) return '';
    let h = '';
    if(e.scores && e.scores.length){
      h += '<div style="display:grid;grid-template-columns:auto auto;gap:2px 12px;justify-content:start;font-weight:800;font-size:13px;margin:4px 0">' +
        e.scores.map(s => '<span>' + esc(s.label) + '</span><span>' + stars(s.stars || 0) + '</span>').join('') + '</div>';
    } else if(e.verdict){
      h += '<div style="font-weight:800">' + (e.verdict === 'ok' ? '🎁 受け取ります' : '🔧 もう少し直してほしい') + '</div>';
    }
    if(e.checks && e.checks.length){                   // 合格条件ごとの ✔／✖ と 根拠
      h += '<div style="margin:4px 0;font-size:13px">' + e.checks.map(c => '<div style="margin:2px 0"><b style="color:' + (c.ok ? '#1F7A44' : '#B23A2C') + '">' + (c.ok ? '✔' : '✖') + '</b> ' +
        esc(c.label) + (c.why ? '<div style="font-size:12px;color:#5B6B7E;font-weight:700;margin-left:18px">根拠：' + esc(c.why) + '</div>' : '') + '</div>').join('') + '</div>';
    }
    if(e.reason) h += '<div style="white-space:pre-wrap;font-weight:700;line-height:1.6">' + esc(e.reason) + '</div>';
    return h;
  }
  // 短く（★合計）
  function short(e){
    if(!e) return '';
    if(e.scores && e.scores.length){ const t = total(e); return '★' + t.got + '/' + t.max; }
    if(e.verdict) return e.verdict === 'ok' ? '受け取ります' : '直してほしい';
    return '';
  }
  // 入力フォーム（観点ごとに★1〜3をえらぶ）
  function formHTML(){
    return '<div class="tr-form">' + CRITERIA.map(c =>
      '<div class="tr-row" data-k="' + c.k + '" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:8px 0;border-bottom:1px dashed #DCE4EE">' +
        '<div style="flex:1;min-width:200px"><div style="font-weight:800;font-size:14px">' + esc(c.label) + '</div>' +
        '<div style="font-size:12px;color:#5B6B7E;font-weight:700">' + esc(c.hint) + '</div></div>' +
        '<div class="tr-stars" style="font-size:30px;line-height:1;cursor:pointer;user-select:none">' +
          [1,2,3].map(n => '<span data-n="' + n + '" style="color:#D5DCE5;padding:0 2px">★</span>').join('') +
        '</div></div>').join('') + '</div>';
  }
  function bindForm(root){
    root.querySelectorAll('.tr-row').forEach(row => {
      const paint = n => row.querySelectorAll('.tr-stars span').forEach(sp => { sp.style.color = (+sp.dataset.n <= n) ? '#F5B301' : '#D5DCE5'; });
      row.querySelectorAll('.tr-stars span').forEach(sp => sp.addEventListener('click', () => {
        row.dataset.v = sp.dataset.n; paint(+sp.dataset.n);
      }));
    });
  }
  function setForm(root, scores){
    root.querySelectorAll('.tr-row').forEach(row => {
      const n = +((scores || {})[row.dataset.k] || 0);
      row.dataset.v = n || '';
      row.querySelectorAll('.tr-stars span').forEach(sp => { sp.style.color = (+sp.dataset.n <= n) ? '#F5B301' : '#D5DCE5'; });
    });
  }
  function readForm(root){
    const out = {};
    root.querySelectorAll('.tr-row').forEach(row => { out[row.dataset.k] = +(row.dataset.v || 0); });
    return out;
  }
  // 履歴の「提出」につける『そのとき送ったブロックを見る』ボタン
  function subBtnHTML(jobId, ver){
    return '<div><button type="button" class="sv-btn" data-job="' + esc(jobId) + '" data-ver="' + ver + '" ' +
      'style="margin-top:4px;padding:4px 10px;border:1.5px solid #BFD5EC;border-radius:8px;background:#F4F8FD;color:#24527F;font-weight:800;font-size:12px;cursor:pointer;font-family:inherit">' +
      '🧩 このとき送ったブロックを見る</button><div class="sv-box" style="display:none;height:260px;margin-top:6px;border:2px solid #DCE4EE;border-radius:10px;overflow:hidden;background:#FBFDFF"></div></div>';
  }
  // root の中の ボタンを動くようにする。query(job, ver) は 取り出すURL
  // onUse(j) があれば、開いたブロックの下に『いまのプログラムにする』ボタンを出す（開発者のページ）
  function bindSubViewers(root, query, onUse){
    root.querySelectorAll('.sv-btn').forEach(b => {
      if(b.dataset.bound) return; b.dataset.bound = '1';
      b.addEventListener('click', async () => {
        const box = b.nextElementSibling;
        const oldUse = box.nextElementSibling && box.nextElementSibling.classList.contains('sv-use') ? box.nextElementSibling : null;
        if(box.style.display === 'block'){
          box.style.display = 'none'; if(box._ws){ box._ws.dispose(); box._ws = null; } box.innerHTML = '';
          if(oldUse) oldUse.remove();
          b.textContent = '🧩 このとき送ったブロックを見る'; return;
        }
        box.style.display = 'block'; box.innerHTML = '<div style="padding:12px;font-size:12px;color:#5B6B7E">読みこみ中…</div>';
        b.textContent = '🧩 ブロックをとじる';
        try{
          const j = await (await fetch(query(b.dataset.job, b.dataset.ver))).json();
          if(!j.ok || !j.workspace){ box.innerHTML = '<div style="padding:12px;font-size:12px;color:#5B6B7E">' + esc(j.msg || 'ブロックが残っていません') + '</div>'; return; }
          box.innerHTML = ''; void box.offsetHeight;
          const ws = Blockly.inject(box, { readOnly:true, renderer:'zelos', media:'blockly/media/', scrollbars:true,
            zoom:{ controls:true, wheel:false, startScale:0.7, maxScale:2, minScale:0.2 } });
          Blockly.serialization.workspaces.load(j.workspace, ws);
          Blockly.svgResize(ws);
          if(ws.zoomToFit) ws.zoomToFit();
          if(ws.getScale() < 0.5) ws.setScale(0.5);
          if(ws.getScale() > 1.0) ws.setScale(1.0);
          ws.scrollCenter();
          box._ws = ws;
          if(onUse && !oldUse){
            const u = document.createElement('button');
            u.type = 'button'; u.className = 'sv-use';
            u.textContent = '📥 このときのブロックを いまのプログラムにする';
            u.style.cssText = 'margin-top:6px;padding:7px 14px;border:0;border-radius:9px;background:#2F6FB0;color:#fff;font-weight:800;font-size:13px;cursor:pointer;font-family:inherit';
            u.addEventListener('click', () => onUse(j));
            box.after(u);
          }
        }catch(e){ box.innerHTML = '<div style="padding:12px;font-size:12px;color:#E8604C">ブロックを表示できませんでした</div>'; }
      });
    });
  }
  // ---- やりとりの履歴（チャットの形）----
  // viewer: 'req'（依頼者のページ）/ 'dev'（開発者のページ）/ 'teacher'
  const CHAT_CSS = `
  .tchat{ padding:6px 0 0; }
  /* LINE のように：ふだんは いちばん下（最新）が見えていて、上にスクロールすると前のやりとり */
  .tchat-scroll{ display:flex; flex-direction:column-reverse; gap:12px; max-height:min(460px,60vh); overflow-y:auto;
    padding:10px 6px 8px; background:#F7F9FC; border-radius:12px; border:1.5px solid #E3EAF2; overscroll-behavior:contain; }
  .tchat-top{ align-self:center; font-size:11.5px; font-weight:800; color:#9AA7B6; padding:2px 0 4px; }
  .tchat-hint{ font-size:11.5px; font-weight:700; color:#7A8899; text-align:right; margin-top:4px; }
  .tchat .legend{ display:flex; justify-content:space-between; gap:8px; font-size:12px; font-weight:800; padding:0 2px 6px;
    border-bottom:1.5px dashed #DCE4EE; }
  .tchat .legend span{ padding:3px 10px; border-radius:999px; }
  .tchat .legend{ flex-wrap:wrap; }
  .tchat .lg-req{ background:#FBE3E2; color:#9B2F2B; } .tchat .lg-dev{ background:#DDEBFA; color:#24527F; }
  .tmsg{ max-width:86%; border-radius:14px; padding:10px 12px; border:2px solid; position:relative; }
  .tmsg.left{ align-self:flex-start; border-top-left-radius:4px; }
  .tmsg.right{ align-self:flex-end; border-top-right-radius:4px; }
  .tmsg.req{ background:#FFF5F4; border-color:#F0B4B0; }
  .tmsg.dev{ background:#F2F8FF; border-color:#A9CBEE; }
  .tmsg .mh{ display:flex; gap:8px; align-items:center; flex-wrap:wrap; font-size:12px; font-weight:800; margin-bottom:6px; }
  .tmsg .kind{ padding:2px 9px; border-radius:999px; color:#fff; font-size:11.5px; }
  .tmsg.req .kind{ background:#D9534F; } .tmsg.dev .kind{ background:#2F6FB0; }
  .tmsg .who{ color:#33414F; } .tmsg .tm{ color:#7A8899; font-weight:700; }
  .tmsg .me{ background:#1E2A38; color:#fff; padding:1px 7px; border-radius:6px; font-size:11px; }
  .tmsg .bd{ white-space:pre-wrap; font-weight:700; font-size:13.5px; line-height:1.65; color:#1E2A38; }
  .tmsg .bd b{ display:block; font-size:11.5px; color:#7A8899; margin-top:4px; }
  .tsys{ align-self:center; font-size:12px; font-weight:800; color:#5B6B7E; background:#F1F5FA; border-radius:999px; padding:4px 12px; }
  .tmsg.chat{ max-width:78%; background:#fff; border-color:#D5DEE9; padding:8px 12px; }
  .tmsg.chat.right{ background:#EEF6FF; border-color:#BBD8F5; }
  .tmsg.chat .bd{ font-size:13.5px; }
  .tmsg.chat .cname{ font-size:11px; font-weight:700; color:#8A97A8; margin-top:4px; display:flex; gap:4px; align-items:center; flex-wrap:wrap; }
  .tmsg.chat.right .cname{ justify-content:flex-end; }
  .chatbox{ display:flex; gap:8px; margin-top:10px; align-items:flex-end; }
  .chatbox textarea{ flex:1; min-height:44px; padding:9px 12px; border:2px solid #D5DEE9; border-radius:12px;
    font-family:inherit; font-size:14px; font-weight:700; resize:vertical; box-sizing:border-box; }
  .chatbox button{ padding:10px 16px; border:0; border-radius:12px; background:#2F6FB0; color:#fff; font-weight:800; font-size:14px; cursor:pointer; font-family:inherit; }
  .chatbox button:disabled{ opacity:.5; cursor:default; }
  .chatmsg{ font-size:12px; font-weight:800; margin-top:4px; min-height:1em; }
  `;
  function ensureChatCss(){
    if(document.getElementById('tchatCss')) return;
    const st = document.createElement('style'); st.id = 'tchatCss'; st.textContent = CHAT_CSS; document.head.appendChild(st);
  }
  function chatHTML(job, viewer, hm){
    ensureChatCss();
    hm = hm || (t => { const d = new Date(t * 1000); return (d.getMonth()+1) + '/' + d.getDate() + ' ' + String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0'); });
    const evs = job.events || [];
    if(!evs.length) return '<div style="font-size:13px;color:#5B6B7E;padding:8px">まだ やりとりはありません</div>';
    const reqLabel = job.fromLabel, devLabel = job.toLabel;
    // 自分たちは右。先生が見るときは 依頼者=左・開発者=右
    const sideOf = role => viewer === 'teacher' ? (role === 'req' ? 'left' : 'right') : (role === viewer ? 'right' : 'left');
    const tag = role => (viewer !== 'teacher' && role === viewer) ? ' <span class="me">あなたたち</span>' : '';
    const who = (label, members) => esc(label) + ((members || []).length ? '：' + members.map(esc).join('・') : '');
    const reqWho = who(reqLabel, job.fromMembers), devWho = who(devLabel, job.toMembers);
    const legend = viewer === 'teacher'
      ? '<div class="legend"><span class="lg-req">◀ 依頼者 ' + reqWho + '</span><span class="lg-dev">開発者 ' + devWho + ' ▶</span></div>'
      : (viewer === 'req'
        ? '<div class="legend"><span class="lg-dev">◀ 開発者 ' + devWho + '（相手）</span><span class="lg-req">あなたたち（依頼者 ' + reqWho + '）▶</span></div>'
        : '<div class="legend"><span class="lg-req">◀ 依頼者 ' + reqWho + '（相手）</span><span class="lg-dev">あなたたち（開発者 ' + devWho + '）▶</span></div>');
    // 先生が見るときは、1件ずつ消せる
    const del = e => viewer === 'teacher' ? '<button type="button" class="tdel" data-job="' + esc(job.id) + '" data-time="' + e.time + '"' + (e.type === 'message' ? ' data-kind="msg"' : '') + ' title="この1件を消す" ' +
      'style="margin-left:auto;border:1.5px solid #E3B9B6;background:#fff;color:#9B2F2B;border-radius:7px;font-size:11px;font-weight:800;cursor:pointer;padding:1px 7px">🗑</button>' : '';
    const msg = (role, kind, e, body) =>
      '<div class="tmsg ' + role + ' ' + sideOf(role) + '"><div class="mh"><span class="kind">' + kind + '</span>' +
      '<span class="who">' + esc(role === 'req' ? reqLabel : devLabel) + '・' + esc(e.by) + 'さん' + tag(role) + '</span>' +
      '<span class="tm">' + hm(e.time) + '</span>' + del(e) + '</div><div class="bd">' + body + '</div></div>';
    // 新しい順に並べて column-reverse で表示する（＝上が古く、下が最新。はじめから最新が見える）
    return '<div class="tchat">' + legend + '<div class="tchat-scroll">' + evs.slice().reverse().map(e => {
      if(e.type === 'request'){
        const q = e.request || {};
        return msg('req', '📨 依頼書 ' + (e.version || 1) + '回目', e,
          '<b>助けてほしいこと</b>' + esc(q.help) + (q.want ? '<b>こうなったらうれしい</b>' + esc(q.want) : '') + (q.avoid ? '<b>これはしないでほしい</b>' + esc(q.avoid) : '') +
          (q.criteria && (q.criteria.list || []).length ? '<b>合格条件</b>' + critHTML(q.criteria) : ''));
      }
      if(e.type === 'submit')
        return msg('dev', '🛠 提出 ' + e.version + '回目（レビューしてください）', e, '<b>説明書</b>' + esc(e.description) + checksHTML(e.checks, '🏠 開発者が 家で ためした 結果') + '</div><div>' + subBtnHTML(job.id, e.version));
      if(e.type === 'review')
        return msg('req', '✉ レビュー（' + (e.submitVersion || '') + '回目の提出へ）', e, html(e));
      if(e.type === 'route')
        return '<div class="tsys">🔀 ' + hm(e.time) + ' 届け先が ' + esc(e.toLabel || '') + ' に変わりました（' + esc(e.by) + '）</div>';
      if(e.type === 'message'){
        const who = (e.side === 'req' ? reqLabel : devLabel) + '・' + esc(e.by) + 'さん';
        return '<div class="tmsg chat ' + sideOf(e.side) + '"><div class="bd">' + esc(e.text) + '</div>' +
          '<div class="cname">' + who + ' ・ ' + hm(e.time) + del(e) + '</div></div>';
      }
      return '';
    }).join('') + '<div class="tchat-top">― ここから やりとりが はじまりました ―</div></div>' +
      '<div class="tchat-hint">↑ 上にスクロールすると 前のやりとりが見られます</div></div>';
  }
  // 依頼・提出・レビューの流れに、チャットのメッセージを時間順に混ぜる
  function timeline(base, msgs){
    const evs = (base.events || []).concat((msgs || []).map(m => Object.assign({ type: 'message' }, m)));
    evs.sort((a, b) => (a.time || 0) - (b.time || 0));
    return Object.assign({}, base, { events: evs });
  }
  function chatBoxHTML(){
    return '<div class="chatbox"><textarea id="chatIn" rows="2" placeholder="メッセージを書こう（話すかわりに、ここに書いてね）"></textarea>' +
      '<button type="button" id="chatSend">送る</button></div><div class="chatmsg" id="chatMsg"></div>';
  }
  // 未読（だれが・どこまで見たかは、その人のブラウザに保存する）
  const SEEN_KEY = 'chappy_chat_seen_v1';
  function readSeen(){ try{ return JSON.parse(localStorage.getItem(SEEN_KEY) || '{}'); }catch(e){ return {}; } }
  function seenOf(cls, name, threadId){ return ((readSeen()[cls + '|' + name] || {})[threadId]) || 0; }
  function markSeen(cls, name, threadId, time){
    try{
      const all = readSeen(), k = cls + '|' + name;
      all[k] = all[k] || {};
      all[k][threadId] = Math.max(all[k][threadId] || 0, time || 0);
      localStorage.setItem(SEEN_KEY, JSON.stringify(all));
    }catch(e){}
  }
  function latestTime(thread){ return (thread.messages || []).reduce((a, m) => Math.max(a, m.time || 0), 0); }
  function unreadIn(thread, cls, name){
    const s = seenOf(cls, name, thread.id);
    return (thread.messages || []).filter(m => m.by !== name && (m.time || 0) > s).length;
  }
  function setTabUnread(n){
    const base = document.title.replace(/^\(\d+\) /, '');
    document.title = (n > 0 ? '(' + n + ') ' : '') + base;
  }
  // 画面に出ているかを、交差の変化で知らせる
  function watchVisible(el, cb){
    if(!el || !('IntersectionObserver' in window)) return;
    new IntersectionObserver(es => es.forEach(e => cb(e.target, e.isIntersecting && e.intersectionRatio >= 0.3)), { threshold: [0, 0.3] }).observe(el);
  }

  window.TeamReview = { CRITERIA, critHTML, checksHTML, html, short, total, formHTML, bindForm, readForm, setForm, stars, subBtnHTML, bindSubViewers, chatHTML, timeline, chatBoxHTML,
    markSeen, latestTime, unreadIn, setTabUnread, watchVisible };
})();
