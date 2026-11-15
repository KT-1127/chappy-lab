/* ⑤チーム：やることマップ（依頼者・開発者の 両方で 使う）
   ・mapHTML：いま どこまで できたかを、絵の みちのりで 見せる（✔ できた ／ いま ここ ／ これから）
   ・reqSteps / devSteps：/api/team の 中身から、それぞれの しごとの すすみぐあいを きめる
   ・dock：家の画面を 右下に 出す（ブロックや 困りごとを 見ながら、家で 動く ようすを 見られる）
   ・yay：✔ クリア！ の 紙ふぶき（ページの 上に） */
(function(global){
  'use strict';
  const esc = t => String(t == null ? '' : t).replace(/[&<>"]/g, m => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[m]));
  const CSS = `
  .tg-map{ display:flex; align-items:flex-start; gap:0; overflow-x:auto; padding:27px 2px 4px; margin:6px 0 2px; scrollbar-width:thin; }
  .tg-step{ flex:0 0 auto; width:84px; display:flex; flex-direction:column; align-items:center; gap:4px; text-align:center; cursor:pointer; position:relative; }
  .tg-step i{ font-style:normal; width:46px; height:46px; border-radius:50%; display:grid; place-items:center; font-size:22px; background:#EEF2F7; border:3px solid #DCE4EE; filter:grayscale(.6); opacity:.75; transition:transform .15s; }
  .tg-step span{ font-size:11.5px; font-weight:800; color:#7A8899; line-height:1.3; word-break:keep-all; }
  .tg-step.done i{ background:#EAF7EF; border-color:#2E9E5B; filter:none; opacity:1; }
  .tg-step.done i::after{ content:'✔'; position:absolute; top:-2px; left:50%; margin-left:12px; width:18px; height:18px; border-radius:50%; background:#2E9E5B; color:#fff; font-size:11px; display:grid; place-items:center; }
  .tg-step.done span{ color:#1F6E40; }
  .tg-step.cur i{ filter:none; opacity:1; background:#fff; border-color:var(--tg-c, #D9534F); box-shadow:0 0 0 0 var(--tg-c, #D9534F); animation:tgpulse 1.6s infinite; transform:scale(1.1); }
  .tg-step.cur span{ color:var(--tg-c, #D9534F); }
  .tg-step.cur em{ font-style:normal; position:absolute; top:-15px; font-size:10.5px; font-weight:900; color:#fff; background:var(--tg-c, #D9534F); border-radius:999px; padding:0 7px; white-space:nowrap; }
  .tg-step.wait i{ filter:none; opacity:1; background:#FFF5E6; border-color:#E8A23A; }
  .tg-step.wait span{ color:#8A5200; }
  .tg-step:hover i{ transform:scale(1.08); }
  .tg-line{ flex:1 0 14px; min-width:14px; height:4px; border-radius:2px; background:#DCE4EE; margin-top:23px; }
  .tg-line.done{ background:#2E9E5B; }
  @keyframes tgpulse{ 0%{ box-shadow:0 0 0 0 rgba(217,83,79,.45); } 70%{ box-shadow:0 0 0 12px rgba(217,83,79,0); } 100%{ box-shadow:0 0 0 0 rgba(217,83,79,0); } }
  .tg-map.dev .tg-step.cur i{ animation-name:tgpulse2; }
  @keyframes tgpulse2{ 0%{ box-shadow:0 0 0 0 rgba(47,111,176,.45); } 70%{ box-shadow:0 0 0 12px rgba(47,111,176,0); } 100%{ box-shadow:0 0 0 0 rgba(47,111,176,0); } }
  .tg-next{ display:flex; align-items:center; gap:14px; flex-wrap:wrap; border-radius:14px; padding:12px 16px; margin-top:8px; background:#FFF6F5; border:2.5px solid var(--tg-c, #D9534F); }
  .tg-next.wait{ background:#FFF8EC; border-color:#E8A23A; }
  .tg-next.done{ background:#EAF7EF; border-color:#2E9E5B; }
  .tg-next .tg-ni{ font-size:34px; line-height:1; }
  .tg-next .tg-nt{ flex:1; min-width:220px; }
  .tg-next .tg-nt b{ display:block; font-size:17px; line-height:1.45; word-break:keep-all; overflow-wrap:anywhere; }
  .tg-next .tg-nt small{ display:block; font-size:12.5px; color:#5B6B7E; font-weight:700; margin-top:3px; line-height:1.6; word-break:keep-all; overflow-wrap:anywhere; }
  .tg-next .tg-nb{ font-size:15px; padding:11px 20px; border-radius:12px; border:0; color:#fff; background:var(--tg-c, #D9534F); font-weight:900; cursor:pointer; font-family:inherit; white-space:nowrap; box-shadow:0 3px 0 rgba(0,0,0,.15); }
  .tg-next .tg-nb:active{ transform:translateY(2px); box-shadow:none; }
  .tg-other{ margin-top:8px; font-size:12.5px; font-weight:800; color:#5B6B7E; display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
  .tg-other a{ color:var(--tg-o, #2F6FB0); text-decoration:none; border:1.5px solid currentColor; border-radius:999px; padding:2px 10px; }
  /* 家の画面を 右下に 出す */
  .tg-dockbar{ display:flex; align-items:center; gap:8px; margin:0 0 6px; }
  .tg-dockbar .tg-dt{ font-size:13px; font-weight:800; color:#5B6B7E; flex:1; }
  .tg-dockbar button, .tg-dockph button{ font-family:inherit; font-size:12.5px; font-weight:800; border:1.5px solid #BFD5EC; background:#F3F8FE; color:#24527F; border-radius:999px; padding:4px 12px; cursor:pointer; }
  .tg-docked{ position:fixed !important; right:14px; bottom:14px; width:min(560px, 46vw); height:min(440px, 62vh); z-index:900; background:#fff; border-radius:14px; box-shadow:0 10px 32px rgba(20,30,45,.35); padding:6px 8px 8px; display:flex; flex-direction:column; }
  .tg-docked.tg-big{ width:min(820px, 62vw); height:min(620px, 80vh); }
  .tg-docked .tg-dockbar{ margin:0 0 4px; cursor:default; }
  .tg-docked iframe{ flex:1; height:auto !important; min-height:0 !important; border-radius:10px !important; }
  .tg-dockph{ display:none; border:2px dashed #BFD5EC; border-radius:12px; padding:14px; text-align:center; font-weight:800; color:#5B6B7E; font-size:13.5px; }
  @media (max-width:760px){ .tg-docked, .tg-docked.tg-big{ width:calc(100vw - 20px); right:10px; height:46vh; } }
  /* 紙ふぶき */
  .tg-toast{ position:fixed; left:50%; top:22%; transform:translateX(-50%); z-index:1000; background:linear-gradient(135deg,#2E9E5B,#1F7A44); color:#fff; font-weight:900; font-size:22px; padding:14px 26px; border-radius:16px; box-shadow:0 8px 26px rgba(0,0,0,.25); pointer-events:none; animation:tgpop .35s ease; }
  .tg-toast.big{ font-size:30px; padding:18px 34px; }
  @keyframes tgpop{ 0%{ transform:translateX(-50%) scale(.6); opacity:0; } 100%{ transform:translateX(-50%) scale(1); opacity:1; } }
  .tg-conf{ position:fixed; top:-16px; width:10px; height:15px; border-radius:2px; z-index:999; pointer-events:none; animation:tgfall 2.2s ease-in forwards; }
  @keyframes tgfall{ 0%{ transform:translate(0,0) rotate(0); opacity:1; } 100%{ transform:translate(var(--dx), 92vh) rotate(620deg); opacity:.2; } }
  `;
  let cssDone = false;
  function css(){ if(cssDone) return; cssDone = true; const s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s); }

  // みちのり：steps = [{ icon, label, state:'done'|'cur'|'wait'|'todo', tag }]
  function mapHTML(steps, kind){
    css();
    return '<div class="tg-map ' + (kind || 'req') + '">' + steps.map((s, i) =>
      (i ? '<b class="tg-line' + (s.state === 'done' || steps[i - 1].state === 'done' && s.state !== 'todo' ? ' done' : '') + '"></b>' : '') +
      '<div class="tg-step ' + s.state + '" data-step="' + i + '" title="' + esc(s.label) + '"><i>' + s.icon + '</i><span>' + esc(s.label) + '</span>' +
        (s.state === 'cur' ? '<em>' + esc(s.tag || 'いま ここ') + '</em>' : s.state === 'wait' ? '<em style="background:#E8A23A">' + esc(s.tag || 'まってね') + '</em>' : '') + '</div>').join('') + '</div>';
  }
  // つぎに やること：{ icon, title, sub, btn, kind:'act'|'wait'|'done' }
  function nextHTML(n){
    css();
    return '<div class="tg-next ' + (n.kind || 'act') + '"><div class="tg-ni">' + (n.icon || '👉') + '</div><div class="tg-nt"><b>' + n.title + '</b>' +
      (n.sub ? '<small>' + n.sub + '</small>' : '') + '</div>' + (n.btn ? '<button type="button" class="tg-nb" data-tg-go="1">' + esc(n.btn) + '</button>' : '') + '</div>';
  }
  // レビューで 合格条件が ぜんぶ ✔ か
  const reviewOk = rev => !!rev && ((rev.checks || []).length ? rev.checks.every(c => c.ok) : (rev.scores || []).every(s => s.stars >= 2));
  const subOk = sub => !!sub && !!sub.checks && (sub.checks.list || []).length > 0 && sub.checks.list.every(r => r.status === 'ok' || r.status === 'none') && !(sub.checks.donts || []).some(r => r.status === 'ng');

  // 依頼者の しごと
  const REQ = [['🏠', '家を 知る'], ['👴', 'おじいさん'], ['🗓', '一日'], ['🧩', '困りごと'], ['🔍', 'たしかめる'], ['📨', '依頼する'], ['📬', 'とどく'], ['✉', 'レビュー'], ['🎉', '解決！']];
  function reqSteps(info, f){
    f = f || {};
    const P = (info && info.persona) || {}, out = info && info.outgoing;
    const done = [!!f.seenHouse || !!P.name, !!P.name, !!P.plan, !!(P.plan && (P.plan.issues || []).length), !!f.tried || !!out, !!out,
                  !!(out && out.submission), !!(out && out.review), !!(out && out.review && reviewOk(out.review))];
    let cur = done.indexOf(false);
    const steps = REQ.map(([icon, label], i) => ({ icon, label, state:done[i] ? 'done' : 'todo' }));
    if(cur >= 0){
      // とどく（開発チームの 番）・なおしてもらう あいだは「まってね」
      if(cur === 6 || (cur === 8 && out && out.review)) steps[cur].state = 'wait';
      else steps[cur].state = 'cur';
    }
    return { steps, cur, done };
  }
  // 開発者の しごと（job：いま 開いている 依頼）
  const DEV = [['🔍', '困りごとを 見る'], ['🧩', 'ブロックを 組む'], ['🏠', '家で ✔'], ['📝', '説明書'], ['📨', 'レビューを 求める'], ['✉', 'レビュー'], ['🎉', '合格！']];
  function devSteps(job, f){
    f = f || {};
    const steps = DEV.map(([icon, label]) => ({ icon, label, state:'todo' }));
    if(!job) return { steps, cur:-1, done:[], none:true };
    const sub = job.submission, rev = job.review, fix = !!(sub && rev && !reviewOk(rev));
    const done = [!!f.watched || !!job.draft || !!sub, !!f.hasBlocks || !!job.draft || !!sub, (!!f.allOk || subOk(sub)) && !fix, (!!f.descOk || !!sub) && !fix,
                  !!sub && !fix, !!rev && !fix, !!rev && reviewOk(rev)];
    let cur = done.indexOf(false);
    steps.forEach((s, i) => { s.state = done[i] ? 'done' : 'todo'; });
    if(fix){ steps[2].state = 'cur'; steps[2].tag = 'なおそう'; cur = 2; }          // レビューで ✖：もう一度 ためして なおす
    else if(cur === 5){ steps[5].state = 'wait'; }                                 // レビューを まっている
    if(sub && !rev && !fix && cur < 5){ steps[5].state = 'wait'; }                 // 送ったが ✖ が のこっている：レビューも まっている
    else if(cur >= 0){ steps[cur].state = 'cur'; }
    return { steps, cur, done, fix };
  }

  // ---------- 家の画面を 右下に 出す ----------
  const dock = { wrap:null, frame:null, ph:null, on:false, big:false, onChange:null };
  function dockInit(wrap, frame, title){
    css();
    dock.wrap = wrap; dock.frame = frame;
    const bar = document.createElement('div'); bar.className = 'tg-dockbar';
    bar.innerHTML = '<span class="tg-dt">' + esc(title || '🏠 おじいさんの 家') + '</span><button type="button" class="tg-dsize" style="display:none">⇱ 大きく</button><button type="button" class="tg-dbtn">📌 横に 出す（見ながら 進める）</button>';
    wrap.insertBefore(bar, wrap.firstChild);
    const ph = document.createElement('div'); ph.className = 'tg-dockph';
    ph.innerHTML = '🏠 家の 画面は 右下に 出ています <button type="button">⤢ ここに もどす</button>';
    wrap.parentNode.insertBefore(ph, wrap.nextSibling);
    dock.ph = ph;
    bar.querySelector('.tg-dbtn').addEventListener('click', () => dockSet(!dock.on));
    bar.querySelector('.tg-dsize').addEventListener('click', () => { dock.big = !dock.big; wrap.classList.toggle('tg-big', dock.big); bar.querySelector('.tg-dsize').textContent = dock.big ? '⇲ 小さく' : '⇱ 大きく'; });
    ph.querySelector('button').addEventListener('click', () => { dockSet(false); wrap.scrollIntoView({ behavior:'smooth', block:'start' }); });
  }
  function dockSet(on){
    if(!dock.wrap) return;
    dock.on = !!on;
    dock.wrap.classList.toggle('tg-docked', dock.on);
    dock.ph.style.display = dock.on ? 'block' : 'none';
    const bar = dock.wrap.querySelector('.tg-dockbar');
    bar.querySelector('.tg-dbtn').textContent = dock.on ? '⤢ もとに もどす' : '📌 横に 出す（見ながら 進める）';
    bar.querySelector('.tg-dsize').style.display = dock.on ? '' : 'none';
    try{ dock.frame.contentWindow.postMessage({ type:'teamhome-layout', mini:dock.on }, location.origin); }catch(e){}
    if(dock.onChange) dock.onChange(dock.on);
  }

  // ---------- ✔ クリア！ ----------
  let toastEl = null, toastT = 0;
  function yay(text, big){
    if(!text) return;
    css();
    if(toastEl) toastEl.remove();
    toastEl = document.createElement('div'); toastEl.className = 'tg-toast' + (big ? ' big' : ''); toastEl.textContent = text;
    document.body.appendChild(toastEl);
    clearTimeout(toastT); toastT = setTimeout(() => { if(toastEl){ toastEl.remove(); toastEl = null; } }, big ? 3200 : 2000);
    const cols = ['#FFC93C', '#FF6B6B', '#4ECDC4', '#7B8CFF', '#7ED957', '#FF9F43'], n = big ? 70 : 24;
    for(let i = 0; i < n; i++){
      const s = document.createElement('i'); s.className = 'tg-conf';
      s.style.left = (4 + Math.random() * 92) + 'vw'; s.style.background = cols[i % cols.length];
      s.style.animationDelay = (Math.random() * 0.4).toFixed(2) + 's'; s.style.setProperty('--dx', Math.round(Math.random() * 160 - 80) + 'px');
      document.body.appendChild(s); setTimeout(() => s.remove(), 2800);
    }
  }

  // ---------- 生徒ごとの しるし（家を 見た・困りごとを 見た など。この パソコンに だけ のこす） ----------
  function flag(stu, key, val){
    const k = 'tg:' + ((stu && stu.cls) || '') + ':' + ((stu && stu.name) || '') + ':' + key;
    try{
      if(val === undefined) return localStorage.getItem(k) === '1';
      localStorage.setItem(k, val ? '1' : '0');
    }catch(e){}
    return !!val;
  }

  global.TeamGuide = { css, mapHTML, nextHTML, reqSteps, devSteps, reviewOk, subOk, dock, dockInit, dockSet, yay, flag, esc };
})(window);
