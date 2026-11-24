/* ⑤ チームで開発：チュートリアル（依頼者 ?tut=req ／ 開発者 ?tut=dev）
   ・本番と 同じ 画面で、かんたんな 依頼を 1つだけ やりとりする。相手は「AI」（台本で 動く。生成AIでは ない）
   ・サーバーには 何も 送らない（/api/team… を この ブラウザの 中で 受ける）。記録は sessionStorage だけ
   ・依頼者：🕵 るすの あいだの 防犯（🗣️ 声で にげる）を 依頼する
       → AI開発チームが 1回目に わざと まちがいを 入れて 送る（「👤 人がいる」で しゃべる → 家に いる おじいさんにも「だれですか！」）
       → 家で 再現して レビューで 見つける → 2回目で 直る
   ・開発者：AI依頼チームから 同じ 困りごとの 依頼（困りごと・依頼者の ことば・大事に したい こと だけ。やり方は 開発者が 考える）
       → ブロックで 組む → 家で ためして、おじいさんの ようすと 気持ちメーターで 確かめる → AIが レビューを 返す
   ・本番の ページ（?tut なし）では、#tutEntry に チュートリアルの 入口を 出すだけ
   team.html・teamdev.html の 頭で、teamhome-check.js・team-review.js・team-guide.js の あとに 読む */
(function(){
  'use strict';
  const m = /[?&]tut=(req|dev)(?:&|#|$)/.exec(location.search);
  const MODE = m ? m[1] : null;
  const TRIAL = !!window.CHAPPY_TRIAL;
  const AUTO_Q = /[?&]auto=1(?:&|#|$)/.test(location.search);            // 先生用：?tut=req&auto=1 で「おまかせ」を すすめる
  const SRC_BASE = ((document.currentScript && document.currentScript.src) || '').replace(/[^\/?#]*(\?.*)?$/, '');   // この スクリプトの ある ところ
  const url = (kind, tut) => (TRIAL ? kind + '.html' : '/' + kind) + (tut ? '?tut=' + tut : '');
  const esc = t => String(t == null ? '' : t).replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));
  function stu(){ try{ return JSON.parse(sessionStorage.getItem('chappy_student') || 'null') || {}; }catch(e){ return {}; } }
  // クリアした しるし（この ブラウザ・この 生徒）
  function done(k, v){
    const s = stu(), key = 'chappy_tut_done:' + (s.cls || '') + ':' + (s.name || '') + ':' + k;
    try{ if(v === undefined) return localStorage.getItem(key) === '1'; localStorage.setItem(key, v ? '1' : '0'); }catch(e){}
    return !!v;
  }
  // 本番の ページの 入口（はじめての 人に すすめる）
  function entryHTML(){
    const r = done('req'), d = done('dev'), both = r && d;
    const b = (k, icon, label, ok) => '<a class="tut-eb ' + k + (ok ? ' ok' : '') + '" href="' + url(k === 'req' ? 'team' : 'teamdev', k) + '">' + icon + ' ' + label + (ok ? ' <small>✔ クリア</small>' : '') + '</a>';
    return '<div class="tut-entry' + (both ? ' small' : '') + '"><span class="tut-et">🔰 ' + (both ? 'チュートリアル（もう一度 できます）' : 'はじめての 人は、まず チュートリアル（1つ 10分くらい）') + '</span>' +
      b('req', '📨', '依頼者 チュートリアル', r) + b('dev', '🛠', '開発者 チュートリアル', d) + '</div>';
  }
  const ENTRY_CSS = '.tut-entry{display:flex;flex-wrap:wrap;align-items:center;gap:8px 10px;margin:0 0 12px;padding:10px 14px;border-radius:14px;background:#EAF7EE;border:2px solid #7CC896;word-break:keep-all;overflow-wrap:anywhere}' +
    '.tut-entry .tut-et{font-weight:900;font-size:14.5px;color:#1F6B3A;flex:1 1 260px}' +
    '.tut-eb{display:inline-block;padding:7px 14px;border-radius:999px;font-weight:900;font-size:14px;text-decoration:none;color:#fff;background:#E8604C}' +
    '.tut-eb.dev{background:#3B7DD8}.tut-eb.ok{opacity:.75}.tut-eb small{font-size:11.5px}' +
    '.tut-entry.small{padding:6px 12px}.tut-entry.small .tut-et{font-size:12.5px}.tut-entry.small .tut-eb{padding:4px 11px;font-size:12.5px}';
  function addCss(css){ const st = document.createElement('style'); st.textContent = css; (document.head || document.documentElement).appendChild(st); }
  addCss(ENTRY_CSS);
  window.TeamTutorial = { mode:MODE, url, done, entryHTML };
  if(!MODE){
    const put = () => { const el = document.getElementById('tutEntry'); if(el) el.innerHTML = entryHTML(); };
    if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', put); else put();
    return;
  }

  // ================= ここから チュートリアル =================
  // 声（チャッピー・おじいさん・知らない人・ナレーションで ちがう 声）。家の 画面も この 声を つかう
  if(!window.ChappyVoice && SRC_BASE){ const vs = document.createElement('script'); vs.src = SRC_BASE + 'chappy-voice.js?v=6'; (document.head || document.documentElement).appendChild(vs); }
  const TC = () => window.TeamCheck;
  const KEY = 'chappy_tut_' + MODE, A = 'tutMe', B = 'tutAI';
  const AI = MODE === 'req' ? 'AI開発チーム' : 'AI依頼チーム', BOT = '🤖 チャッピーAI';
  const DELAY = { chat:3, submit:14, fix:12, review:10 };
  const now = () => Date.now() / 1000;
  const cp = x => x == null ? x : JSON.parse(JSON.stringify(x));
  const str = (v, n) => String(v == null ? '' : v).trim().slice(0, n || 400);
  const ME = () => stu().name || 'あなた';
  const SPEAK = 'だれですか！ 警察を よびますよ';
  const STRANGER_ONLY = { actions:[{ type:'forever', actions:[{ type:'if', condition:{ sensor:'stranger_in', op:'==', value:true }, then:[{ type:'speak', value:SPEAK }], else:[] }] }] };
  const ANYONE = { actions:[{ type:'forever', actions:[{ type:'if', condition:{ sensor:'pir', op:'==', value:true }, then:[{ type:'speak', value:SPEAK }], else:[] }] }] };   // 1回目の まちがい
  const FACE_REQ = { hairStyle:2, hair:2, skin:1, brows:1, nose:1, eyes:1, face:1, mouth:1 };
  const FACE_DEV = { hairStyle:1, hair:1, skin:1, brows:0, nose:3, eyes:0, face:3, mouth:0 };

  function hhmm(m){ return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); }
  const ACTW = { go:'へ行く', sit:'ソファにすわる', eat:'台所で食べる', out:'そとへ出る', home:'家に帰る', sleep:'ねる', wake:'おきる' };
  const dayText = s => (s || []).map(e => hhmm(e.m) + ' ' + (e.act === 'go' ? (e.room || '') + ACTW.go : (ACTW[e.act] || e.act) + (e.room && e.act !== 'eat' ? '（' + e.room + '）' : '')) +
    (e.act === 'out' ? (e.lock === 'open' ? '・かぎを かけない' : '・かぎを かける') : e.act === 'home' ? '・かぎを かける' : '')).join('\n');

  // ---------- 記録 ----------
  function fresh(){
    const t = now(), st = { v:1, mode:MODE, teams:{}, jobs:{}, chat:{}, pending:[], seen:{}, noticed:null, finished:false };
    st.teams[A] = { id:A, label:'あなたの班', members:[ME()], persona:{}, history:[] };
    st.teams[B] = { id:B, label:AI, members:[BOT], persona:{}, history:[] };
    st.chat[A] = []; st.chat[B] = [];
    if(MODE === 'req'){
      // 依頼者：おじいさんは 用意して ある（名前・カード・見た目は かえて よい）。カード「🚶 出かけるのが 好き」で 防犯の 困りごとが 出る
      st.teams[A].persona = { name:'山田 ゲンジ', age:'95さい。一人ぐらし', life:TC().profLife('hurry,outing'), history:'', likes:'将棋', tone:'', traits:'hurry,outing',
        trouble:'', day:'', avoid:'', face:FACE_REQ, updatedBy:'先生', updatedAt:t - 900 };
      st.chat[A].push({ by:BOT, time:t - 60, side:'dev', text:'こんにちは！ ぼくは ' + AI + 'です。山田さんの 困りごとを 依頼してね。ぼくが プログラムを 作るよ' });
    } else {
      // 開発者：AI依頼チームの 依頼（🕵 留守の 間の 防犯 ／ ⭐ 安心・静か）が とどいている
      //   画面には 出さないが、AIが レビューする ために「おじいさんを まちがえない」を 家の 判定に 入れて おく
      const b = TC().buildPlan({ issues:['intruder'], care:['anshin', 'shizuka'] });
      const cr = cp(b.criteria); cr.donts = [{ k:'no_scare', from:'22:00', to:'06:00', n:3, note:'' }];
      const per = { name:'鈴木 シゲル', age:'80さい。一人ぐらし', life:'毎朝 9時に 出かけて、夕方 5時に 帰る。出かけるとき、かぎを かけわすれる ことが ある。',
        history:'むかしは 大工さん', likes:'つり・ラジオ', tone:'のんびり、やさしい 話し方', traits:'outing,alone',
        trouble:b.help, day:dayText(b.schedule), avoid:'', face:FACE_DEV,
        schedule:b.schedule, scheduleBy:AI, scheduleAt:t - 600, updatedBy:AI, updatedAt:t - 600,
        plan:Object.assign({}, b.plan, { care:['anshin', 'shizuka'] }) };
      st.teams[B].persona = per;
      st.jobs[B] = { id:B, from:B, to:A, made:t - 600, draft:null,
        events:[{ type:'request', by:BOT, time:t - 600, version:1, persona:cp(per),
                  request:{ help:b.help, want:b.want, avoid:'', criteria:cr } }] };
      st.chat[B].push({ by:BOT, time:t - 590, side:'req', text:'依頼を 送ったよ！ 鈴木さんは 毎日 出かけるんだけど、留守の 間が 心配なんだって。どう 助けるかは まかせるね。大事に したいのは 安心と 静かさだよ' });
    }
    return st;
  }
  function load(){
    let st = null;
    try{ st = JSON.parse(sessionStorage.getItem(KEY) || 'null'); }catch(e){ st = null; }
    if(!st || st.v !== 1 || st.mode !== MODE){ clearFlags(); st = fresh(); save(st); }
    return st;
  }
  function save(st){ try{ sessionStorage.setItem(KEY, JSON.stringify(st)); }catch(e){} }
  function reset(){ try{ sessionStorage.removeItem(KEY); }catch(e){} clearFlags(); }
  // 「見つけた」などの しるし（チュートリアルの ぶん）を 消す（やりなおしたら また 見つける ところから）
  function clearFlags(){ try{ const pre = 'tg:tut-' + MODE + ':'; Object.keys(localStorage).filter(k => k.indexOf(pre) === 0).forEach(k => localStorage.removeItem(k)); }catch(e){} }

  // ---------- サーバーと 同じ 形で 返す ----------
  function jobState(job){
    let req = null, sub = null, rev = null;
    ((job && job.events) || []).forEach(ev => {
      if(ev.type === 'request') req = ev;
      else if(ev.type === 'submit'){ sub = ev; rev = null; }
      else if(ev.type === 'review') rev = ev;
    });
    return { req, sub, rev };
  }
  function jobView(st, job){
    const s = jobState(job), T = st.teams;
    const evs = job.events.map(e => { const o = {}; Object.keys(e).forEach(k => { if(k !== 'program' && k !== 'workspace') o[k] = e[k]; }); return o; });
    return { id:job.id, from:job.from, to:job.to, fromLabel:T[job.from].label, toLabel:T[job.to].label, fromMembers:T[job.from].members, toMembers:T[job.to].members,
             request:s.req, submission:s.sub, review:s.rev, draft:job.draft, events:evs, reviewDraft:null };
  }
  function thread(st, id){
    const other = id === A ? B : A;
    return { id, fromLabel:st.teams[id].label, toLabel:st.teams[other].label, fromMembers:st.teams[id].members, toMembers:st.teams[other].members, messages:st.chat[id].slice(-200) };
  }
  function teamView(st){
    const me = st.teams[A], ai = st.teams[B];
    me.members = [ME()];
    return { ok:true, enabled:true, inTeam:true, me:ME(), tutorial:MODE, chatSlow:false,
             chats:[thread(st, A), thread(st, B)],
             team:{ id:A, label:me.label, members:me.members }, persona:me.persona || {},
             personaHistory:me.history.map(h => ({ by:h.by, time:h.time, name:h.name })),
             routeTo:{ id:B, label:ai.label, members:ai.members }, developFor:[{ id:B, label:ai.label, members:ai.members }],
             outgoing:st.jobs[A] ? jobView(st, st.jobs[A]) : null, incoming:st.jobs[B] ? [jobView(st, st.jobs[B])] : [] };
  }

  // ---------- AI（台本）の うごき ----------
  const later = (st, sec, kind, data) => st.pending.push({ at:now() + sec, kind, data:data || {} });
  const say = (st, th, text) => st.chat[th].push({ by:BOT, time:now(), side:th === A ? 'dev' : 'req', text });
  // 依頼者モード：AI開発チームが 作って 送る（1回目は わざと まちがい）
  const BEEP = 'ピピピ！ ピピピ！';
  const isIntr = cr => (cr.list || []).some(c => c.trig === 'intruder' && c.act === 'speak');
  function progFor(cr, fixed){
    if(isIntr(cr)) return cp(fixed ? STRANGER_ONLY : ANYONE);
    const prog = TC().sampleProgram(cr.list || []);
    if(fixed) return prog;
    const walk = acts => (acts || []).map(a => {
      if(!a || typeof a !== 'object') return a;
      if(a.type === 'if') return Object.assign({}, a, { then:walk(a.then), else:walk(a.else) });
      if(a.type === 'forever') return Object.assign({}, a, { actions:walk(a.actions) });
      if(a.type === 'speak') return { type:'speak', value:BEEP };
      if(a.type === 'mail' && a.to === 'grandpa') return Object.assign({}, a, { value:'ピピピ' });
      if((a.type === 'mail' || a.type === 'camera' || a.type === 'fan') && a.value !== false) return { type:'speak', value:BEEP };
      return a;
    });
    return { actions:walk(prog.actions) };
  }
  function descFor(cr, fixed){
    const parts = (cr.list || []).map(c => TC().critParts(c)), w = p => p.when.replace(/^\S+\s/, '');
    return fixed ? 'レビューを 読んで 直しました！\n' + parts.map(p => '・' + w(p) + ' とき、おじいさんに わかる ことばで 知らせます').join('\n')
                 : parts.map(p => '・' + w(p) + ' とき、チャッピーが 知らせます').join('\n');
  }
  function aiSubmit(st, ver){
    const job = st.jobs[A]; if(!job) return;
    const s = jobState(job), cr = ((s.req && s.req.request) || {}).criteria || { list:[], donts:[] };
    const c = cr.list[0] || {};
    const fixed = ver > 1;
    const desc = !isIntr(cr) ? descFor(cr, fixed) : fixed
      ? 'レビューを 読んで 直しました！\n・家に 知らない人が いる とき だけ、チャッピーが「' + SPEAK + '」と 大きな 声を 出します\n・おじいさんには 言いません\n・声に おどろいて、知らない人は にげていきます'
      : '・家に 人が いたら、チャッピーが「' + SPEAK + '」と 大きな 声を 出します\n・声に おどろいて、知らない人は にげていきます';
    const checks = { sig:TC().sig(cr), range:'09:00〜11:00', list:cr.list.map(x => ({ label:TC().text(x), status:'ok', n:1, okN:1, lines:[] })), donts:[] };
    const ev = { type:'submit', by:BOT, time:now(), version:ver, program:progFor(cr, fixed), workspace:null, description:desc, steps:'', checks, tutorialBot:true };
    job.events.push(ev);
    job.draft = { by:BOT, time:ev.time, program:ev.program, workspace:null, description:desc, steps:'' };
    say(st, A, fixed ? '直して 2回目を 送ったよ！ もう一度「🏠 家で再現する」で 見てね' : 'できたよ！ 説明書を 読んで、「🏠 家で再現する」で 山田さんの 一日を 見てから レビューしてね');
    void c;
  }
  // 1回目の レビューで、まちがい（おじいさんにも 言う）に 気づいたか
  function noticedIn(rev){
    const bad = (rev.checks || []).some(x => x.ok === false);
    const low = (rev.scores || []).some(x => (x.k === 'fit' || x.k === 'help') && x.stars < 3);
    const words = /ピピピ|つたわ|伝わ|わから|なんだい|ことば|言葉|消えな|おじい|まちが|間違|びっくり|おどろ|警察|だれですか|何回|何度|ずっと|うるさ|人がいる|知らない人だけ|わし|家にいる|家に いる|帰って|静か|しずか|メーター|ねて|寝て|夜/.test(String(rev.reason || '') + (rev.checks || []).map(x => x.why || '').join(''));
    return bad || low || words;
  }
  // 開発者モード：AI依頼チームが 家で ためして レビューを 返す
  function aiReview(st){
    const job = st.jobs[B]; if(!job) return;
    const s = jobState(job); if(!s.sub || s.rev) return;
    const cr = ((s.req.request || {}).criteria) || { list:[], donts:[] }, ck = s.sub.checks, T = TC();
    // チュートリアルなので、家の アニメーションで 解決して 見えれば 合格（こまかい 条件・やり方では 決めない）
    //   oc.trouble：おきた 困りごとの 数 ／ oc.solved：チャッピーの 動きで 解決した 数
    const oc = s.sub.outcome, iss = (((s.req.persona || {}).plan || {}).issues || []);
    const tr = k => ((oc && oc.trouble) || {})[k] || 0, sv = k => ((oc && oc.solved) || {})[k] || 0;
    const reached = (!!oc && !!oc.dayEnd) || (!!ck && (iss.some(k => tr(k) > 0) || (ck.list || []).some(r => r.status !== 'none')));   // 困りごとの 場面まで（一日 さいごまで）ためした
    const goalOk = oc ? reached && iss.every(k => sv(k) >= tr(k)) : (!!ck && (ck.list || []).length > 0 && ck.list.every(r => r.status === 'ok'));
    const halfway = !!ck && !goalOk && !reached;   // 一日の とちゅうで 送った（まだ 困りごとの 場面まで 見て いない）
    const dontOk = !!ck && !(ck.donts || []).some(r => r.status === 'ng');
    const label = (((s.req.persona || {}).plan || {}).issues || []).map(k => T.ISSUES.find(x => x.k === k)).filter(Boolean).map(I => I.icon + ' ' + I.title).join('・') || '依頼した こと';
    const checks = [{ ok:goalOk && dontOk, label,
      why:!ck ? '家で ためした 結果が ついていなかった' : halfway ? '一日の とちゅうまでしか ためして いなかった' : !goalOk ? (iss.includes('intruder') ? '家で 再現したら、知らない人は にげなかった' : '家で 再現したら、困りごとが 解決して いなかった')
        : !dontOk ? '知らない人は にげたけど、家に いる 鈴木さんにも「だれですか！」と 言っていた'
        : iss.includes('intruder') ? '留守の 間に 来た 知らない人が にげていった。鈴木さんには 言わなかった' : '家で 再現したら、困りごとが 解決して いた' }];
    const desc = String(s.sub.description || '');
    const stars = { help:goalOk ? 3 : 1, easy:desc.length >= 30 ? 3 : desc.length >= 15 ? 2 : 1, fit:dontOk && ck ? 3 : 1 };
    const good = [], more = [];
    if(goalOk) good.push('留守の 間に 知らない人が 来ても、家から 出ていった！ これで 鈴木さんも 安心して 出かけられる');
    else good.push('作って くれて ありがとう！');
    if(goalOk && dontOk && ck) good.push('おじいさんには 言わなくて、くらしにも 合っていた');
    if(!ck) more.push('家で ためした 結果が ついていなかったよ。「▶ 家で 一日 ためす」で 鈴木さんの 一日を 見てから 送ってね');
    else {
      if(halfway) more.push('一日の とちゅうで 送って いたよ。「▶ 家で 一日 ためす」で、さいごまで 見てから 送ってね');
      else if(!goalOk) more.push('留守の 間に 知らない人が 入ってきた とき、何も おきなかったよ');
      if(!dontOk) more.push('家に いる 鈴木さんにも「だれですか！」と 言っていたよ。びっくりして、安心が へっていた。知らない人の ときだけに して ほしいな');
    }
    if(stars.easy < 3) more.push('説明書に「いつ・何を すると・どう なるか」を もう少し くわしく 書いて ほしいな');
    if(!more.length && ck) more.push('気持ちメーターも 見て みてね。もっと 鈴木さんに 合う ように できる ところが ないか、考えて みよう');   // 合格でも おわりに しない
    const CR = (window.TeamReview && TeamReview.CRITERIA) || [{ k:'help', label:'困りごとを助けてくれる' }, { k:'easy', label:'説明だけで使い方がわかる' }, { k:'fit', label:'この人のくらし・気持ちに合っている' }];
    job.events.push({ type:'review', by:BOT, time:now(), checks, submitVersion:s.sub.version, tutorialBot:true,
      scores:CR.map(c => ({ k:c.k, label:c.label, stars:stars[c.k] || 2 })),
      reason:'👍 よかった ところ：' + good.join('。') + (more.length ? '\n💡 こうすると もっと よく なる：' + more.join('\n') : '') });
    const allOk = checks.every(c => c.ok);
    if(allOk) st.finished = true;
    say(st, B, allOk ? '家で 再現したら、鈴木さんも 安心して 出かけられそう！ ありがとう！ 💡 の ところも 読んで みてね' : 'レビューを 返したよ。💡の ところを 直して、もう一度 送ってね');
  }
  function process(st){
    const due = st.pending.filter(p => p.at <= now());
    if(!due.length) return false;
    st.pending = st.pending.filter(p => p.at > now());
    due.forEach(p => {
      try{
        if(p.kind === 'chat') say(st, p.data.th, p.data.text);
        else if(p.kind === 'submit') aiSubmit(st, p.data.ver);
        else if(p.kind === 'review') aiReview(st);
      }catch(e){ if(window.console) console.warn('チュートリアルの AI:', e); }
    });
    return true;
  }
  const cancel = (st, kinds) => { st.pending = st.pending.filter(p => kinds.indexOf(p.kind) < 0); };

  // ---------- 受けつけ（/api/team… と 同じ 名前と 返事） ----------
  function handle(u, b){
    const st = load();
    if(process(st)) save(st);
    const path = u.replace(/^[^?]*?(\/api\/[^?]*).*$/, '$1');
    const me = st.teams[A];
    const q = k => { const r = new RegExp('[?&]' + k + '=([^&]*)').exec(u); return r ? decodeURIComponent(r[1].replace(/\+/g, ' ')) : ''; };
    if(path === '/api/team') return teamView(st);
    if(path === '/api/team/submission'){
      const jb = st.jobs[q('job')], ver = Number(q('version')) || 0;
      const ev = jb && jb.events.filter(e => e.type === 'submit' && e.version === ver)[0];
      return ev ? { ok:true, version:ver, by:ev.by, time:ev.time, description:ev.description, workspace:ev.workspace, program:ev.program } : { ok:false, msg:'その提出が見つかりません' };
    }
    if(path === '/api/team/persona'){
      const src = b.persona && typeof b.persona === 'object' ? b.persona : {};
      if(!str(src.name)) return { ok:false, msg:'名前を決めよう' };
      const old = me.persona || {}, per = Object.assign({}, old);
      ['name', 'age', 'life', 'history', 'likes', 'tone', 'trouble', 'day', 'avoid', 'traits'].forEach(k => { per[k] = str(src[k]); });
      if(src.face && typeof src.face === 'object') per.face = cp(src.face);
      per.updatedBy = ME(); per.updatedAt = now();
      me.persona = per; me.history.push({ by:ME(), time:per.updatedAt, name:per.name });
      save(st);
      return { ok:true, persona:per };
    }
    if(path === '/api/team/schedule'){
      const p = me.persona || {};
      let sc = Array.isArray(b.schedule) ? b.schedule.filter(e => e && typeof e === 'object').slice(0, 40) : [];
      if(!sc.length) return { ok:false, msg:'予定が ありません' };
      sc = sc.map(e => { const o = cp(e); o.m = ((Math.round(Number(o.m) || 0) % 1440) + 1440) % 1440; return o; }).sort((x, y) => x.m - y.m);
      p.schedule = sc; p.scheduleBy = ME(); p.scheduleAt = now();
      if(b.plan && typeof b.plan === 'object') p.plan = cp(b.plan);
      if(typeof b.dayText === 'string') p.day = str(b.dayText);
      if(typeof b.troubleText === 'string') p.trouble = str(b.troubleText);
      if(typeof b.avoidText === 'string') p.avoid = str(b.avoidText);
      save(st);
      return { ok:true, schedule:sc, msg:'保存しました' };
    }
    if(path === '/api/team/request'){
      if(MODE !== 'req') return { ok:false, msg:'開発者チュートリアルでは 依頼は 出しません' };
      const rq = { help:str(b.help), want:str(b.want), avoid:str(b.avoid) };
      if(!rq.help) return { ok:false, msg:'「助けてほしいこと」を書いてね' };
      const cr = b.criteria && typeof b.criteria === 'object' ? cp(b.criteria) : {};
      rq.criteria = { list:(cr.list || []).slice(0, 3), donts:(cr.donts || []).slice(0, 2) };
      if(!rq.criteria.list.length) return { ok:false, msg:'「✅ 家で 確かめる こと」を 1つ以上 決めよう' };
      const t = now(), had = !!st.jobs[A];
      const job = st.jobs[A] = st.jobs[A] || { id:A, from:A, to:B, made:t, events:[], draft:null };
      job.events.push({ type:'request', by:ME(), time:t, persona:cp(me.persona), request:rq, version:job.events.filter(e => e.type === 'request').length + 1 });
      cancel(st, ['submit']);
      const nSub = job.events.filter(e => e.type === 'submit').length;
      later(st, DELAY.chat, 'chat', { th:A, text:had ? '新しい 依頼を 見たよ。作りなおすね！' : '依頼 見たよ！ これから 作るね 💪（15秒くらい まってね）' });
      later(st, DELAY.submit, 'submit', { ver:nSub + 1 });
      save(st);
      return { ok:true, to:AI };
    }
    if(path === '/api/team/draft' || path === '/api/team/submit'){
      if(MODE !== 'dev') return { ok:false, msg:'依頼者チュートリアルでは 開発は しません' };
      const jd = st.jobs[b.job];
      if(!jd || jd.to !== A) return { ok:false, msg:'届いた依頼が見つかりません' };
      const prog = b.program && typeof b.program === 'object' ? b.program : {};
      if(!(prog.actions || []).length && !(prog.threads || []).length) return { ok:false, msg:'ブロックが ありません' };
      const desc = str(b.description, 500), tt = now();
      if(path === '/api/team/draft'){
        jd.draft = { by:ME(), time:tt, program:prog, workspace:b.workspace || null, description:desc, steps:'' };
        save(st);
        return { ok:true, draft:{ by:ME(), time:tt, workspace:b.workspace || null, description:desc, steps:'' } };
      }
      if(desc.length < 10) return { ok:false, msg:'どんなプログラムか「説明書」をくわしく書いてね' };
      const ev = { type:'submit', by:ME(), time:tt, program:prog, workspace:b.workspace || null, description:desc, steps:'',
                   checks:b.checks && typeof b.checks === 'object' ? cp(b.checks) : null, outcome:b.outcome && typeof b.outcome === 'object' ? cp(b.outcome) : null, version:jd.events.filter(e => e.type === 'submit').length + 1 };
      jd.events.push(ev);
      jd.draft = { by:ME(), time:tt, program:prog, workspace:ev.workspace, description:desc, steps:'' };
      cancel(st, ['review']);
      later(st, DELAY.chat, 'chat', { th:B, text:'とどいたよ！ 鈴木さんの 家で ためして みるね（10秒くらい まってね）' });
      later(st, DELAY.review, 'review');
      save(st);
      return { ok:true, version:ev.version, to:AI };
    }
    if(path === '/api/team/review_draft') return { ok:true, reviewDraft:{ for:0, scores:b.scores || {}, checks:b.checks || [], reason:str(b.reason, 800), by:ME(), time:now() } };
    if(path === '/api/team/review'){
      const jr = st.jobs[A];
      if(!jr) return { ok:false, msg:'まだ依頼に出していません' };
      const s = jobState(jr);
      if(!s.sub) return { ok:false, msg:'開発チームからの提出が まだ届いていません' };
      if(s.rev) return { ok:false, already:true, msg:'この提出には もう レビューを返しました' };
      const CR = (window.TeamReview && TeamReview.CRITERIA) || [];
      const got = b.scores && typeof b.scores === 'object' ? b.scores : {}, scores = [];
      for(const c of CR){
        const v = parseInt(got[c.k], 10) || 0;
        if(v < 1 || v > 3) return { ok:false, msg:'「' + c.label + '」の★をえらんでね' };
        scores.push({ k:c.k, label:c.label, stars:v });
      }
      const reason = str(b.reason, 800);
      if(!reason) return { ok:false, msg:'理由を書いてね' };
      const checks = (Array.isArray(b.checks) ? b.checks : []).map(x => ({ ok:x && (x.ok === true || x.ok === false) ? x.ok : null, why:str(x && x.why, 200), label:str(x && x.label, 200) }));
      const rev = { type:'review', by:ME(), time:now(), scores, reason, checks, submitVersion:s.sub.version };
      jr.events.push(rev);
      if(s.sub.version === 1){
        st.noticed = noticedIn(rev);
        const intrJob = isIntr((s.req && s.req.request && s.req.request.criteria) || {});
        if(!intrJob) later(st, DELAY.chat, 'chat', { th:A, text:st.noticed
          ? 'レビュー ありがとう！ ほんとだ…。チャッピーが「ピピピ」としか 言って いなかったから、' + NM() + 'さんに つたわらなかったんだね 😱 わかる ことばで 知らせるように 直すね（10秒くらい まってね）'
          : 'レビュー ありがとう！ …あれ？ 家で 見なおしたら、チャッピーが「ピピピ」としか 言って いなかった 😱 依頼どおりに 見えても、こういう ところを 見つけるのが レビューだよ。直すね！' });
        else later(st, DELAY.chat, 'chat', { th:A, text:st.noticed
          ? 'レビュー ありがとう！ ほんとだ…。家に いる 山田さんにも「だれですか！」って 言っちゃってた 😱 知らない人の ときだけ 言うように 直すね（10秒くらい まってね）'
          : 'レビュー ありがとう！ …あれ？ 家で 見なおしたら、家に いる 山田さんにも「だれですか！」って 言っちゃってた 😱 依頼どおりに 見えても、こういう ところを 見つけるのが レビューだよ。直すね！' });
        later(st, DELAY.fix, 'submit', { ver:2 });
      } else if(checks.length && checks.some(x => x.ok === false)){
        later(st, DELAY.chat, 'chat', { th:A, text:'レビュー ありがとう！ まだ ✖ の ところが あったんだね。もう一度 直して 送るね（10秒くらい まってね）' });
        later(st, DELAY.fix, 'submit', { ver:s.sub.version + 1 });
      } else {
        st.finished = true;
        later(st, DELAY.chat, 'chat', { th:A, text:'レビュー ありがとう！ これで ' + NM() + 'さんも 安心だね 🎉' });
      }
      save(st);
      return { ok:true, review:rev };
    }
    if(path === '/api/team/message'){
      const th = MODE === 'req' ? A : B, text = str(b.text);
      if(!text) return { ok:false, msg:'メッセージを書いてね' };
      const msg = { by:ME(), time:now(), text, side:th === A ? 'req' : 'dev' };
      st.chat[th].push(msg);
      later(st, DELAY.chat, 'chat', { th, text:/[?？]/.test(text) ? 'いい しつもん！ 本番では、相手の チームが ここで こたえて くれるよ' : 'メッセージ ありがとう！ 本番でも、こまったら ここで 相手に 聞いてね' });
      save(st);
      return { ok:true, message:msg };
    }
    return { ok:false, msg:'チュートリアルでは 使えません' };
  }
  const prevFetch = window.fetch ? window.fetch.bind(window) : null;
  window.fetch = function(u, o){
    const s = String(u && u.url ? u.url : u);
    if(/\/api\/team(\/|\?|$)/.test(s)){
      let body = {}, r;
      try{ body = JSON.parse((o && o.body) || '{}'); }catch(e){ body = {}; }
      try{ r = handle(s, body); }catch(e){ r = { ok:false, msg:'チュートリアルの エラー：' + e.message }; }
      return Promise.resolve(new Response(JSON.stringify(r), { headers:{ 'Content-Type':'application/json' } }));
    }
    if(/\/deploy/.test(s)) return Promise.resolve(new Response(JSON.stringify({ ok:false, msg:'チュートリアルでは チャッピー（実機）に 送りません' }), { headers:{ 'Content-Type':'application/json' } }));
    return prevFetch ? prevFetch(u, o) : Promise.reject(new Error('no fetch'));
  };
  // 「見た」などの しるしは 本番と 分ける
  if(window.TeamGuide && TeamGuide.flag){
    const f0 = TeamGuide.flag;
    TeamGuide.flag = (s, k, v) => f0({ cls:'tut-' + MODE, name:(s && s.name) || '' }, k, v);
  }

  // ================= 画面：案内の 帯・かくす もの・光らせる =================
  addCss(
    // 案内の 帯（上に くっつく）
    '.tut-bar{position:sticky;top:0;z-index:60;margin:0 0 10px;padding:6px 12px 7px;border-radius:12px;background:#F2FBF4;border:3px solid #3FA564;box-shadow:0 6px 18px rgba(30,90,50,.18);word-break:keep-all;overflow-wrap:anywhere}' +
    '.tut-top{display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px;font-size:12px;font-weight:800;color:#2E7A4A}' +
    '.tut-top .tut-badge{background:#3FA564;color:#fff;border-radius:999px;padding:1px 10px;font-size:12px;cursor:help}' +
    '.tut-top .tut-dots{display:flex;gap:3px}.tut-top .tut-dots i{width:16px;height:6px;border-radius:4px;background:#CFE8D7}.tut-top .tut-dots i.on{background:#3FA564}.tut-top .tut-dots i.cur{background:#F0A23B}' +
    '.tut-top .sp{flex:1}.tut-top a,.tut-top button{font:inherit;font-size:12px;color:#2E7A4A;background:#fff;border:2px solid #9BD3AE;border-radius:999px;padding:1px 10px;cursor:pointer;text-decoration:none}' +
    '.tut-main{display:flex;align-items:center;gap:6px 10px;margin-top:4px}' +
    '.tut-main .tut-ic{font-size:22px;line-height:1}.tut-main .tut-tx{flex:1 1 auto;min-width:0}' +
    '.tut-main .tut-h{font-size:15px;font-weight:900;color:#1B4D2E;line-height:1.45}.tut-main .tut-s{font-size:12.5px;font-weight:700;color:#3D5A47;line-height:1.5;margin-top:1px}' +
    '.tut-go{flex:none;font:inherit;font-size:13.5px;font-weight:900;color:#fff;background:#3FA564;border:0;border-radius:10px;padding:6px 12px;cursor:pointer;box-shadow:0 3px 0 #2B7A48}' +
    '.tut-go:active{transform:translateY(2px);box-shadow:none}' +
    '.tut-ai{margin-top:4px;display:flex;gap:6px;align-items:center;font-size:12.5px;font-weight:700;color:#3A3A3A;min-width:0}' +
    '.tut-ai b{white-space:nowrap;color:#3B7DD8}.tut-ai span{min-width:0;flex:1 1 auto;background:#fff;border:1.5px solid #CFE0F5;border-radius:10px;padding:2px 8px;line-height:1.5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.tut-bar.mini{padding:4px 10px}.tut-bar.mini .tut-s,.tut-bar.mini .tut-ai,.tut-bar.mini .tut-ic,.tut-bar.mini .tut-dots{display:none}' +
    '.tut-bar.mini .tut-main{margin-top:2px}.tut-bar.mini .tut-h{font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.tut-bar.mini .tut-go{font-size:12.5px;padding:3px 10px;box-shadow:none}' +
    '.tut-bar.mini .tut-nl{margin-top:3px;padding:3px 10px;font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.tut-bar.mini .tut-nl span{overflow:hidden;text-overflow:ellipsis}.tut-bar.mini .tut-nl b{font-size:14px}' +
    '.tut-top button.tut-mini{background:#E9F6EE;font-weight:900}' +
    '.tut-bar.wait .tut-ic{animation:tutSpin 1.6s linear infinite}@keyframes tutSpin{to{transform:rotate(360deg)}}' +
    '.tut-bar.done{background:#FFF8E6;border-color:#F0B429}.tut-done-list{margin:6px 0 0;padding:0;list-style:none;font-size:13.5px;font-weight:800;color:#5A4500}.tut-done-list li{margin:2px 0}' +
    '.tut-btns{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}.tut-btns a{font-size:14px;font-weight:900;text-decoration:none;color:#fff;background:#E8604C;border-radius:12px;padding:8px 14px}.tut-btns a.dev{background:#3B7DD8}.tut-btns a.sec{background:#fff;color:#555;border:2px solid #ccc}' +
    // 1行に まとめた 帯（2行目は くわしく・AI。小さく した とき・下へ スクロールした ときは 1行目だけ）
    '.tut-row{display:flex;align-items:center;gap:8px;min-width:0;flex-wrap:wrap}.tut-row .sp{flex:1}' +
    '.tut-row .tut-badge{flex:none;background:#3FA564;color:#fff;border-radius:999px;padding:2px 10px;font-size:12px;font-weight:900;cursor:help;white-space:nowrap}' +
    '.tut-row .tut-ic{flex:none;font-size:20px;line-height:1}' +
    '.tut-row .tut-h{flex:1 1 260px;min-width:0;font-size:15px;font-weight:900;color:#1B4D2E;line-height:1.4}' +
    '.tut-row .tut-go{font-size:13px;padding:5px 12px;border-radius:10px;box-shadow:0 2px 0 #2B7A48}' +
    '.tut-ctrl{flex:none;display:flex;gap:4px;align-items:center;margin-left:auto}' +
    '.tut-ctrl a,.tut-ctrl button{font:inherit;font-size:12px;font-weight:800;color:#2E7A4A;background:#fff;border:2px solid #9BD3AE;border-radius:999px;padding:1px 9px;cursor:pointer;text-decoration:none;line-height:1.5;white-space:nowrap}' +
    '.tut-ctrl .ic{width:28px;height:25px;padding:0;display:inline-grid;place-items:center;font-size:13px}' +
    '.tut-ctrl .tut-help,.tut-ctrl .tut-auto{background:#FFF1DC;border-color:#F0A23B;color:#8A5300;font-weight:900}' +
    '.tut-row2{display:flex;flex-wrap:wrap;align-items:center;gap:2px 12px;margin:2px 0 0 4px;font-size:12.5px;font-weight:700;color:#3D5A47;line-height:1.5}' +
    '.tut-row2 .tut-s{flex:1 1 300px;min-width:0}' +
    '.tut-row2 .tut-ai{flex:0 1 auto;max-width:50%;margin:0;display:flex;gap:5px;align-items:center;min-width:0}' +
    '.tut-bar.mini .tut-row2,.tut-bar.mini .tut-row .tut-ic{display:none}' +
    '.tut-bar.mini .tut-row{flex-wrap:nowrap}.tut-bar.mini .tut-row .tut-h{font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.tut-bar.mini .tut-row .tut-go{font-size:12px;padding:2px 10px;box-shadow:none}' +
    // 光らせる（いま おす ところ）
    '.tut-hl{outline:3px dashed #F0A23B !important;outline-offset:-3px;border-radius:10px;animation:tutGlow 1.4s ease-in-out infinite}' +
    '@keyframes tutGlow{0%,100%{box-shadow:0 0 0 0 rgba(240,162,59,.0)}50%{box-shadow:0 0 0 8px rgba(240,162,59,.35)}}' +
    // チュートリアルで かくす もの（本番だけで 使う もの）
    'body.tut details.step, body.tut .card{scroll-margin-top:var(--tutH, 96px)}' +
    'body.tut #tutEntry, body.tut .subtabs, body.tut #nowBox, body.tut #guideOther, body.tut .trial-bar{display:none !important}' +
    'body.tut-req #homeBox .banner, body.tut-req #personaBanner, body.tut-req #personaHistBox{display:none !important}' +   // ①②③ は 見せる（① から じゅんばんに）
    'body.tut-req #ownWords, body.tut-req #critAdv, body.tut-req #simBox, body.tut-req .sbm:has(#tryBtn), body.tut-req #saveRd, body.tut-req .revnote, body.tut-req #rdBanner, body.tut-req #reloadTeam{display:none !important}' +
    'body.tut-dev #jobPick, body.tut-dev #teamSave, body.tut-dev #teamLoad, body.tut-dev #savedBy, body.tut-dev #draftBanner, body.tut-dev .card:has(#deployBtn), body.tut-dev details.card:has(#simRun){display:none !important}'
  );
  try{ document.title = '🔰 ' + document.title.replace(/^.*?\|/, (MODE === 'req' ? '依頼者' : '開発者') + 'チュートリアル |'); }catch(e){}

  const $ = id => document.getElementById(id);
  const G = name => { try{ return Function('return typeof ' + name + ' === "undefined" ? undefined : ' + name)(); }catch(e){ return undefined; } };   // ページの 変数・関数（let／function）
  let bar = null, hlEls = [], goFn = null, lastKey = '';
  // 依頼者の おじいさんの 名前（自分たちで かえた 名前で 話す。台本の「山田さん」を おきかえる）
  function NM(){ try{ const p = JSON.parse(sessionStorage.getItem(KEY) || 'null'); return (p && p.teams && p.teams[A] && p.teams[A].persona && p.teams[A].persona.name) || 'おじいさん'; }catch(e){ return 'おじいさん'; } }
  function fixName(t){
    if(MODE !== 'req' || t == null) return t;
    const n = NM() + 'さん';
    return String(t).replace(/山田 ゲンジさん（\d+さい）/g, n).replace(/山田 ゲンジさん/g, n).replace(/山田さん/g, n);
  }
  function aiLast(st){
    const th = MODE === 'req' ? A : B, msgs = st.chat[th] || [];
    for(let i = msgs.length - 1; i >= 0; i--) if(msgs[i].by === BOT) return fixName(msgs[i].text);
    return '';
  }
  // 上に くっつく 案内の 帯の 下に 来る ように うごかす（帯で かくれない）。ページが あとから ずれても もう一度 あわせる
  function scrollTo(el){
    if(!el) return;
    // 依頼者の ページ（家＝左・ステップ＝右）：家と 右の 欄の 上を 帯の すぐ 下に あわせ、右の 欄の 中だけ スクロールする（行きすぎて 家が 帯に かくれない）
    const work = document.querySelector('.work'), pc = el.closest && el.closest('#panelCol');
    if(work && innerWidth >= 1000 && (pc || (el.closest && el.closest('.stagecol')))){
      const fit = smooth => {
        const top = parseFloat(getComputedStyle(document.body).getPropertyValue('--tutH')) || (bar ? bar.offsetHeight + 18 : 8);
        const d = work.getBoundingClientRect().top - top;
        if(Math.abs(d) > 3) window.scrollTo({ top:Math.max(0, window.scrollY + d), behavior:smooth ? 'smooth' : 'auto' });
        if(pc){
          const pr = pc.getBoundingClientRect(), er = el.getBoundingClientRect();
          const want = pc.scrollTop + (er.top - pr.top) - (er.height + 24 < pc.clientHeight ? (pc.clientHeight - er.height) / 2 : 12);
          if(Math.abs(want - pc.scrollTop) > 6) pc.scrollTo({ top:Math.max(0, want), behavior:smooth ? 'smooth' : 'auto' });
        }
      };
      fit(true);
      setTimeout(() => fit(true), 700);                    // 帯が 小さく なると 高さが かわるので もう一度
      setTimeout(() => fit(false), 1400);
      return;
    }
    // 開発者の ページ（ブロック＝左・家＝右）：右の 列の もの（▶ 家で 一日 ためす など）は、家の 上を 帯の すぐ 下に あわせる（家が 見える）
    const dr = el.closest && el.closest('.dright'), hb = document.getElementById('homeBox');
    if(dr && hb && innerWidth >= 1100){
      const fitD = smooth => {
        const top = parseFloat(getComputedStyle(document.body).getPropertyValue('--tutH')) || (bar ? bar.offsetHeight + 18 : 8);
        const d = hb.getBoundingClientRect().top - top;
        if(Math.abs(d) > 3) window.scrollTo({ top:Math.max(0, window.scrollY + d), behavior:smooth ? 'smooth' : 'auto' });
      };
      fitD(true); setTimeout(() => fitD(true), 700); setTimeout(() => fitD(false), 1400);
      return;
    }
    const place = smooth => {
      const top = bar ? bar.offsetHeight + 8 : 0;          // 帯は うごかすと 上に くっつくので、帯の 高さ ぶん あける
      const r = el.getBoundingClientRect(), room = window.innerHeight - top;
      const want = r.height + 32 < room ? top + (room - r.height) / 2 : top + 16;   // 帯の 下の あいた ところの まん中（大きい ものは 帯の すぐ 下）
      const d = r.top - want;
      if(Math.abs(d) > 8) window.scrollTo({ top:window.scrollY + d, behavior:smooth ? 'smooth' : 'auto' });
    };
    place(true);
    setTimeout(() => place(true), 700);
  }
  function q(sel){ return sel ? document.querySelector(sel) : null; }

  // ---------- 家（iframe）が いま 1日を 動かしているか ----------
  function housePlay(){
    const f = Array.from(document.querySelectorAll('iframe')).find(x => /teamhome/.test(x.src || ''));
    try{ return f && f.contentWindow && f.contentWindow.teamhomePlay ? f.contentWindow.teamhomePlay() : null; }catch(e){ return null; }
  }
  const housePlaying = () => { const h = housePlay(); return !!(h && (h.running || h.paused) && !h.demo); };
  // レビューの 書きぐあい（どこまで できたか）
  function revProgress(){
    const rows = Array.from(document.querySelectorAll('#outgoing .rvrow'));
    const trs = Array.from(document.querySelectorAll('#outgoing .tr-row'));
    return { radios:rows.length > 0 && rows.every(r => r.querySelector('input[type=radio]:checked')),
             stars:trs.length > 0 && trs.every(r => +(r.dataset.v || 0) > 0),
             good:!!(($('rvGood') || {}).value || '').trim(), more:!!(($('rvMore') || {}).value || '').trim() };
  }
  const goRev = sel => () => { const el = q(sel); scrollTo(el); if(el && el.focus && /TEXTAREA|INPUT/.test(el.tagName)) setTimeout(() => el.focus({ preventScroll:true }), 400); };

  // ---------- いま やる こと（依頼者） ----------
  function reqStep(st){
    const P = st.teams[A].persona || {}, job = st.jobs[A], s = jobState(job);
    const goStep = G('goStep'), isFound = G('isFound');
    const savedIssue = ((P.plan && P.plan.issues) || [])[0];
    const madeOnce = !!(st.teams[A].history || []).length;
    const traitsOk = TC().profIssues(P.traits || '').indexOf('intruder') >= 0;
    // ▶ そこへ：押す ところを 見せる ／ やることカードから はじめる とき（enter）：その ステップの 見出しから 見せる
    const go = (i, sel) => { const f = () => { goStep && goStep(i); setTimeout(() => scrollTo(q(sel)), 300); };
      f.enter = () => { goStep && goStep(i); setTimeout(() => { const ids = G('STEP_IDS') || [], el = $(ids[i]); if(el) scrollTo(el); }, 300); }; return f; };
    if(!job){
      // ① おじいさんを 作る（カードで 困りごとが 決まる）
      if(!madeOnce || !traitsOk) return { id:'who', n:0, icon:'👴', h:'① おじいさんを 作って「✔ この おじいさんで けってい」を おそう',
        s:madeOnce ? '「🏠 暮らし」の カードで「🚶 出かけるのが 好き」を 選んで、もう一度 けってい しよう（チュートリアルでは 防犯の 困りごとを 使うよ）'
                   : '名前・年齢・性格・暮らし・好きな こと・見た目を 決める ところ。今日は 山田 ゲンジさんが 入って いるよ（かえても OK）',
        hl:'#savePersona', go:go(0, '#savePersona') };
      // ② 一日を 見て 困りごとを 見つける → 選ぶ
      if(savedIssue !== 'intruder'){
        const pend = G('pending') || {};
        if(pend.intruder && !(isFound && isFound('intruder'))) return { id:'guess', n:1, icon:'❓', h:'山田さんの 安心が 下がった！ なぜ 下がったのか、右で 選ぼう',
          s:'山田さんは 何と 言った？ わからない ときは「▶ その 場面を 見る」や、下の 帯の 印を おして 見なおそう', hl:'.find.q .fq', go:go(1, '.find.q') };
        if(!(isFound && isFound('intruder'))){
          const playing = housePlaying();
          return { id:'find', n:1, icon:playing ? '👀' : '🔍', h:playing ? '家を よく 見よう。おじいさんの 気持ちメーターが 下がると、下の 帯に 印が 残るよ' : '②「▶ 一日を 見る」を おして、困りごとを 見つけよう',
            s:'山田さんが 出かけて いる 間に、家で 何が おきる かな？ 気持ちメーターが 下がると、家が 止まって 下の 帯に 😊↓ の 印が 残るよ',
            hl:playing ? '' : '#dayAll', go:go(1, '#dayAll') };
        }
        return { id:'pick', n:1, icon:'🕵', h:'見つけた！「🕵 留守の 間の 防犯」を 選んで「✔ この 困りごとを 依頼する」を おそう',
          s:'カードを おすと「● これを 依頼」に なるよ。「▶ その 場面を もう一度 見る」で 見なおす ことも できる',
          hl:'[data-fk="intruder"], #planApply', go:go(1, '[data-fk="intruder"]') };
      }
      const f = (G('stepFlags') || (() => ({})))();
      // ③ 大事に したい こと
      if(!f.goal) return { id:'care', n:2, icon:'⭐', h:'③「大事に したい こと」を 選んで「✔ けってい」を おそう',
        s:'家の 右上の 気持ちメーターと 同じ 4つから、2つまで 選ぼう。人に よって ちがって いいよ', hl:'#careCards, #careApply', go:go(2, '#careCards') };
      // ④ 依頼（してほしくない ことは 書かない。くらしへの 影響は 気持ちメーターで 見る）
      return { id:'send', n:3, icon:'📨', h:'④ 依頼書を 見て「📨 依頼に出す」を おそう',
        s:'困りごとと 大事に したい ことが、カードに なって ' + AI + 'に とどくよ', hl:'#sendRequest', go:go(3, '#sendRequest') };
    }
    if(!s.sub) return { id:'wait1', n:4, wait:true, icon:'⏳', h:AI + 'が 作って います…', s:'15秒くらい まってね。とどくと ここで 知らせるよ' };
    if(!s.rev){
      const v = s.sub.version, replayed = G('checksVer') === v;
      const toRecv = () => { const f = G('showRecv'); if(f) f(); setTimeout(() => scrollTo($('houseTry')), 300); };
      toRecv.enter = () => { const f = G('showRecv'); if(f) f(); setTimeout(() => scrollTo($('recvCard')), 300); };   // カードから：「とどいた プログラム」の 見出しから
      if(!replayed) return { id:'arrive' + v, n:v === 1 ? 4 : 6, icon:'📬', h:v + '回目が とどいた！「🏠 家で再現する」を おそう',
        s:v === 1 ? 'とどいた プログラムで、山田さんの 一日が 家で 動くよ' : '直った かな？ もう一度 家で 動かして 見よう',
        hl:'#houseTry', go:toRecv };
      // 家の 1日が おわるまでは「見る」だん。レビューを 書きはじめたら（✔✖・★・文の どれか）、そちらへ すすむ
      const r = revProgress(), touched = r.radios || r.stars || r.good || r.more;
      if(housePlaying() && !touched && !st.seen['skipwatch' + v]) return { id:'watch' + v, n:v === 1 ? 5 : 6, icon:'👀', h:'家を よく 見よう（1日 動いて います。2分くらい）',
        s:v === 1 ? '山田さんが 家に いる とき、チャッピーは 何と 言った？ 山田さんは？ 気持ちメーターと「📝 家で 見えた こと」も 見よう' : '山田さんが 家に いる ときは 静か？ 知らない人は にげた？',
        btn:'✉ もう レビューを 書く', act:() => { const x = load(); x.seen['skipwatch' + v] = true; save(x); tick(); } };
      // レビュー：1つずつ（✔✖ → ★ → よかった → もっと よく → 返す）
      const base = { id:'review' + v, n:v === 1 ? 5 : 6, icon:'✉' };
      if(!r.radios) return Object.assign(base, { h:'レビュー ①：依頼した ことに「✔ できた」か「✖ できていない」を 選ぼう',
        s:'家で 見た とおりに 選ぼう。「できていない」に した ときは、何時に 何を 見たか（根拠）も 書こう。「📝 家で 見えた こと」が ヒントに なるよ', hl:'#outgoing .rvrow', go:goRev('#outgoing .rvrow') });
      if(!r.stars) return Object.assign(base, { h:'レビュー ②：★を 3つ 選ぼう',
        s:v === 1 ? '「この人の くらし・気持ちに 合っている」は、山田さんが 困って いなかったか、気持ちメーターは どうだったかを 思い出して つけよう' : '直った ところを 思い出して つけよう', hl:'#outgoing .tr-row', go:goRev('#outgoing .tr-row') });
      if(!r.good) return Object.assign(base, { h:'レビュー ③：「👍 よかった ところ」を 書こう', s:'小さな ことでも いいよ。れい：知らない人が 来たら、声で にげて いった', hl:'#rvGood', go:goRev('#rvGood') });
      if(v === 1 && !r.more) return Object.assign(base, { h:'レビュー ④：「💡 こうすると もっと よく なる」を 書こう',
        s:'山田さんが 家に いる とき、チャッピーは 何と 言って いた？ 山田さんは どう だった？ 見た ことを そのまま 書こう', hl:'#rvMore', go:goRev('#rvMore') });
      return Object.assign(base, { h:'レビュー ' + (v === 1 ? '⑤' : '④') + '：「✉ チームのレビューとして返す」を おそう', s:'書いた ことが ' + AI + 'に とどくよ', hl:'#sendResp', go:goRev('#sendResp') });
    }
    if(!st.finished) return { id:'fixing', n:6, wait:true, icon:'🔧', h:AI + 'が 直して います…', s:'レビューを 読んで 直して いるよ。10秒くらい まってね' };
    return { id:'done', n:7, done:true };
  }
  // ---------- いま やる こと（開発者） ----------
  function devStep(st){
    const job = st.jobs[B], s = jobState(job);
    const cj = G('curJob'), hasB = G('progHasBlocks'), build = G('buildProgram'), allOk = G('allOkNow');
    const pj = cj ? cj() : null;
    const blocks = !!(hasB && build && hasB(build()));
    const okNow = !!(pj && allOk && allOk(pj));
    const desc = ($('descInput') || {}).value || '';
    const fix = !!(s.sub && s.rev && !TeamGuide.reviewOk(s.rev));
    if(s.sub && !s.rev) return { id:'wait', n:4, wait:true, icon:'⏳', h:AI + 'が 家で ためしています…', s:'10秒くらい まってね。レビューが とどくよ' };
    if(st.finished) return { id:'done', n:5, done:true };
    if(!s.sub && !st.seen.card) return { id:'card', n:0, icon:'📩', h:AI + 'から 依頼が とどいた！ 依頼書を 読もう',
      s:'🧩 困りごと・💬 依頼者の ことば・⭐ 大事に したい ことを 読もう。どう 助けるかは 開発者の あなたが 考える', hl:'#jobCrit', go:() => scrollTo($('jobCrit')),
      btn:'✔ 読んだ ▶', act:() => { const x = load(); x.seen.card = true; save(x); tick(); setTimeout(() => scrollTo($('blocklyWrap')), 100); } };
    const fixId = fix ? 'rev' + s.sub.version : null;
    const pre = fix ? { icon:'🔧', h:'レビューの 💡を 読んで、ブロックを 直そう', s:'上の「✉ レビュー」に 書いて あるよ。直したら 家で ためして、もう一度 送ろう' } : null;
    if(!blocks) return Object.assign({ id:fixId || 'build', n:1, icon:'🧩', h:'ブロックで 組もう', s:'今回は れいとして、知らない人が 来たら チャッピーの 声で 追いはらう やり方で 作って みよう',
      hl:'#blocklyWrap', go:() => scrollTo($('blocklyWrap')) }, pre || {});
    // レビューで 直す ところが ある：ブロックを かえるまでは「レビューを 読もう」（送る ボタンへ すすめない）
    if(fix && build && JSON.stringify(build()) === JSON.stringify(s.sub.program || null))
      return { id:fixId, n:1, icon:'✉', h:'レビューが とどいた！ 読んで、ブロックを 直そう', s:'上の「✉ レビュー」に、できていない ところと 💡 が 書いて あるよ',
        hl:'#jobState', go:() => scrollTo($('jobState')) };
    const playing = housePlaying();
    if(!okNow || playing){
      return Object.assign({ id:fixId || 'try', n:2, icon:playing ? '👀' : '🏠',
        h:playing ? '右の 家で 1日が 動いて います。おじいさんの ようすと 気持ちメーターを 見よう' : '「▶ 家で 一日 ためす」を おそう',
        s:playing ? '困りごとは なくなった？ おじいさんが 困って いない？ 気持ちメーターが へったら、わけも 見よう' : '鈴木さんの 一日の 中で、組んだ プログラムが 右の 家で 動くよ',
        hl:playing ? '' : '#tryAll', go:() => scrollTo($('tryAll')) }, fix && !okNow ? pre : {});
    }
    const dOk = G('descOk');
    if(dOk ? !dOk(desc) : desc.trim().length < 15) return { id:'desc', n:3, icon:'📝', h:'ためしたら 説明書を 書こう', s:'「📝 ブロックから 下書きを つくる」を おすと、下書きが できるよ。「止めたい ときは」も 書いて みよう',
      hl:'#descDraft, #descInput', go:() => scrollTo($('descInput')) };
    return { id:'submit', n:3, icon:'📨', h:'「📨 依頼者に レビューを 求める」を おそう', s:'気になる ところが なければ、「📋 送る 前の チェック」を 見てから 送ろう', hl:'#submitBtn', go:() => scrollTo($('submitBtn')) };
  }
  const STEPS = MODE === 'req' ? 8 : 6;
  function learnedList(st){
    return MODE === 'req'
      ? [(st.noticed ? '👀 1回目の まちがいを、自分で 見つけられた！' : '👀 1回目の まちがい、本番では 自分で 見つけよう'),
         '🔍 困りごとは、おじいさんの 一日を 見て 見つける', '⭐ 大事に したい ことを 選ぶと、くらしへの 影響が 気持ちメーターで 見える',
         '🏠 とどいたら 家で 再現して、自分の 目で 見る（📝 メモと 気持ちメーターが 根拠に なる）',
         '✉ 依頼どおりに 見えても 安心しない。おじいさんが 困って いないか 見るのが レビュー']
      : ['📩 依頼書の 🧩 困りごと・💬 依頼者の ことば・⭐ 大事に したい ことを 読む', '🛠 どう 助けるかは 自分たちで 考えて、🧩 ブロックで 組む',
         '🏠 家で ためして、おじいさんの ようすと 気持ちメーターで 確かめてから 送る', '✉ レビューの 💡を 読んで 直す'];
  }
  function nextBtnsHTML(){
    const other = MODE === 'req' ? 'dev' : 'req', otherDone = done(other);
    return (otherDone ? '' : '<a class="' + other + '" href="' + url(other === 'req' ? 'team' : 'teamdev', other) + '">' + (other === 'req' ? '📨 つぎは 依頼者 チュートリアル ▶' : '🛠 つぎは 開発者 チュートリアル ▶') + '</a>') +
      '<a class="' + (otherDone ? (MODE === 'req' ? 'req' : 'dev') : 'sec') + '" href="' + quitUrl() + '">' + (TRIAL ? '体験版の はじめへ' : otherDone ? '▶ 本番を はじめる' : '本番の ページへ') + '</a>';
  }
  function doneHTML(st){
    return '<div class="tut-main"><span class="tut-ic">🎉</span><div class="tut-tx"><div class="tut-h">' + (MODE === 'req' ? '依頼者' : '開発者') + 'チュートリアル クリア！</div>' +
      '<ul class="tut-done-list">' + learnedList(st).map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>' +
      '<div class="tut-btns">' + nextBtnsHTML() + '</div></div></div>';
  }
  function quitUrl(){ return TRIAL ? 'index.html' : url(MODE === 'req' ? 'team' : 'teamdev'); }

  // ================= 章：とばす・もどる（依頼者） =================
  const CHAPS = ['① おじいさん', '② 困りごと', '③ 大事に したい', '④ 依頼', '⑤ 1回目', '⑥ 2回目'];
  function chapOf(id){
    if(id === 'who') return 0;
    if(id === 'find' || id === 'guess' || id === 'pick') return 1;
    if(id === 'care') return 2;
    if(id === 'send') return 3;
    if(/^(wait1|arrive1|watch1|review1)$/.test(id)) return 4;
    return 5;
  }
  // その 章の はじめまで 進んだ 記録を つくって、読みこみなおす（おまかせ中なら その 章から つづける）
  function gotoChap(k){
    const wasAuto = AUTO.on;
    AUTO.on = false;
    if(window.ChappyVoice) ChappyVoice.stop();
    reset();
    const st = fresh(), P = st.teams[A].persona, t = now();
    st.modeChosen = true;
    const flag = (key) => { if(window.TeamGuide && TeamGuide.flag) TeamGuide.flag(stu(), key, true); };
    if(k >= 1){ st.teams[A].history.push({ by:ME(), time:t - 600, name:P.name }); P.updatedBy = ME(); P.updatedAt = t - 600; }
    if(k >= 2){
      const b = TC().buildPlan(Object.assign({}, TC().PLAN_DEFAULT, { issues:['intruder'] }));
      P.schedule = b.schedule; P.plan = b.plan; P.scheduleBy = ME(); P.scheduleAt = t - 500; flag('found2:intruder');
    }
    let b2 = null;
    if(k >= 3){
      b2 = TC().buildPlan(Object.assign({}, TC().PLAN_DEFAULT, { issues:['intruder'], care:['anshin', 'shizuka'] }));
      P.schedule = b2.schedule; P.plan = b2.plan; flag('care:intruder');
    }
    if(k >= 4){
      const rq = { help:b2.help, want:b2.want, avoid:'', criteria:{ list:(b2.criteria.list || []).slice(0, 3), donts:[] } };
      st.jobs[A] = { id:A, from:A, to:B, made:t - 400, events:[{ type:'request', by:ME(), time:t - 400, persona:cp(P), request:rq, version:1 }], draft:null };
      say(st, A, '依頼 見たよ！ これから 作るね 💪');
      aiSubmit(st, 1);
    }
    if(k >= 5){
      const job = st.jobs[A], CR = (window.TeamReview && TeamReview.CRITERIA) || [];
      job.events.push({ type:'review', by:ME(), time:now(), submitVersion:1, checks:[{ ok:true, why:'10時ごろ 知らない人が にげた', label:'' }],
        scores:CR.map(c => ({ k:c.k, label:c.label, stars:c.k === 'fit' ? 1 : c.k === 'help' ? 2 : 3 })),
        reason:'👍 よかった ところ：知らない人が 来たら、チャッピーの 声で にげて いった\n💡 こうすると もっと よく なる：家に いる 山田さんにも「だれですか！」と 言って いた' });
      st.noticed = true;
      say(st, A, 'レビュー ありがとう！ ほんとだ…。家に いる 山田さんにも「だれですか！」って 言っちゃってた 😱 知らない人の ときだけ 言うように 直すね');
      aiSubmit(st, 2);
    }
    if(wasAuto){ st.auto = true; st.autoFrom = k; }
    save(st);
    location.reload();
  }
  function chapHTML(cur){
    return '<div class="tut-chaps"><button type="button" class="tc-nav" data-tut="chprev"' + (cur <= 0 ? ' disabled' : '') + '>◀ もどる</button>' +
      CHAPS.map((c, i) => '<button type="button" class="tc-c' + (i === cur ? ' cur' : i < cur ? ' done' : '') + '" data-tut="chap" data-k="' + i + '">' + esc(c) + '</button>').join('') +
      '<button type="button" class="tc-nav" data-tut="chnext"' + (cur >= CHAPS.length - 1 ? ' disabled' : '') + '>とばす ▶</button></div>';
  }
  addCss('.tut-chaps{display:flex;flex-wrap:wrap;gap:4px;align-items:center;margin-top:5px}' +
    '.tut-chaps button{font:inherit;font-size:12px;font-weight:800;border-radius:999px;padding:2px 10px;cursor:pointer;border:2px solid #CFE8D7;background:#fff;color:#2E7A4A;white-space:nowrap}' +
    '.tut-chaps .tc-c.done{background:#E9F6EE}.tut-chaps .tc-c.cur{background:#3FA564;border-color:#3FA564;color:#fff}' +
    '.tut-chaps .tc-nav{background:#FFF1DC;border-color:#F0A23B;color:#8A5300}.tut-chaps button:disabled{opacity:.4;cursor:default}' +
    '.tut-bar.mini .tut-chaps{margin-top:3px}.tut-bar.mini .tut-chaps button{font-size:11px;padding:1px 8px}');

  // ================= やることカード（モーダル）：だんかいの はじめに 1回だけ 出す =================
  addCss(
    '.tut-mbg{position:fixed;inset:0;z-index:100050;background:rgba(18,38,26,.55);display:flex;align-items:center;justify-content:center;padding:16px;animation:tutFade .2s ease-out}' +
    '@keyframes tutFade{from{opacity:0}to{opacity:1}}@keyframes tutPop{from{transform:scale(.92)}to{transform:scale(1)}}' +
    '.tut-m{position:relative;background:#fff;border-radius:22px;border:4px solid #3FA564;max-width:580px;width:100%;max-height:calc(100vh - 32px);overflow:auto;padding:16px 22px 20px;box-shadow:0 18px 50px rgba(0,0,0,.3);word-break:keep-all;overflow-wrap:anywhere;animation:tutPop .22s ease-out;font-family:inherit}' +
    '.tut-m .tm-step{display:inline-block;font-size:12.5px;font-weight:900;color:#2E7A4A;background:#E4F5EA;border-radius:999px;padding:2px 12px}' +
    '.tut-m .tm-x{position:absolute;right:10px;top:8px;font:inherit;font-size:20px;line-height:1;border:0;background:none;color:#8A99A8;cursor:pointer;padding:4px 8px}' +
    '.tut-m .tm-ic{font-size:48px;line-height:1;text-align:center;margin:4px 0 4px}' +
    '.tut-m h3{margin:0 0 8px;text-align:center;font-size:21px;color:#1B4D2E;line-height:1.45}' +
    '.tut-m .tm-lead{font-size:14.5px;font-weight:700;line-height:1.7;color:#33404F;margin:0 0 10px;text-align:center}' +
    '.tut-m .tm-flow{display:flex;flex-wrap:wrap;justify-content:center;align-items:center;gap:4px;margin:2px 0 12px}' +
    '.tut-m .tm-flow span{background:#F1F7F3;border:2px solid #CFE8D7;border-radius:999px;padding:3px 10px;font-size:13px;font-weight:800;color:#1E2A38}.tut-m .tm-flow span.cur{background:#FFF1DC;border-color:#F0A23B}' +
    '.tut-m .tm-flow i{font-style:normal;color:#9AB0A0;font-weight:900}' +
    '.tut-m ol.tm-steps{list-style:none;margin:0 0 8px;padding:0;counter-reset:tms}' +
    '.tut-m ol.tm-steps li{counter-increment:tms;position:relative;padding:9px 12px 9px 48px;margin:6px 0;background:#F5FAF6;border-radius:12px;font-size:15.5px;font-weight:800;line-height:1.5;color:#1E2A38}' +
    '.tut-m ol.tm-steps li::before{content:counter(tms);position:absolute;left:11px;top:50%;margin-top:-14px;width:28px;height:28px;border-radius:50%;background:#3FA564;color:#fff;font-size:15px;line-height:28px;text-align:center}' +
    '.tut-m .tm-note{background:#FFF6E0;border:2px solid #F0C36B;border-radius:12px;padding:8px 12px;font-size:14.5px;font-weight:800;color:#6B4A00;line-height:1.6;margin:8px 0}' +
    '.tut-m .tm-ai{display:flex;gap:8px;align-items:flex-start;margin:4px 0 10px;font-size:14.5px;font-weight:700}.tut-m .tm-ai b{color:#3B7DD8;white-space:nowrap}.tut-m .tm-ai span{background:#EEF4FC;border:2px solid #CFE0F5;border-radius:12px;padding:6px 10px;line-height:1.6}' +
    '.tut-m .tm-crit{background:#F2FBF4;border:2px solid #9BD3AE;border-radius:12px;padding:8px 12px;font-size:15px;font-weight:800;line-height:1.7;margin:6px 0}' +
    '.tut-m .tm-crit.ng{background:#FFF1F0;border-color:#F2B1AA}' +
    '.tut-m .tm-done{margin:4px 0 8px;padding:0;list-style:none}.tut-m .tm-done li{background:#FFF8E6;border-radius:10px;padding:6px 10px;margin:5px 0;font-size:14.5px;font-weight:800;color:#5A4500}' +
    '.tut-m .tm-btns{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-top:14px}' +
    '.tut-m .tm-ok{font:inherit;font-size:17px;font-weight:900;color:#fff;background:#3FA564;border:0;border-radius:14px;padding:11px 28px;cursor:pointer;box-shadow:0 3px 0 #2B7A48}.tut-m .tm-ok:active{transform:translateY(2px);box-shadow:none}' +
    '.tut-m .tm-btns a{font-size:15px;font-weight:900;text-decoration:none;color:#fff;background:#E8604C;border-radius:14px;padding:10px 16px}.tut-m .tm-btns a.dev{background:#3B7DD8}.tut-m .tm-btns a.sec{background:#fff;color:#555;border:2px solid #ccc}' +
    // ブロックの 形（色は ブロックの なかまと 同じ）
    '.tut-blk{margin:6px auto 10px;max-width:470px;font-size:14px;font-weight:800;color:#fff;line-height:1.5}' +
    '.tut-blk .b{border-radius:8px;padding:6px 10px}.tut-blk .b small{display:block;font-size:11.5px;font-weight:800;opacity:.92}' +
    '.tut-blk .loop{background:#5BA55B}.tut-blk .if{background:#A5935B;margin:6px 0 2px 14px}.tut-blk .sens{display:inline-block;background:#5B80A5;margin:4px 0;box-shadow:0 0 0 2px rgba(255,255,255,.6)}' +
    '.tut-blk .act{background:#A5625B;margin:6px 0 2px 14px}' +
    '.tut-top button.tut-help{background:#FFF1DC;border-color:#F0A23B;color:#8A5300;font-weight:900}'
  );
  const flowHTML = (list, cur) => '<div class="tm-flow">' + list.map((x, i) => (i ? '<i>→</i>' : '') + '<span' + (i === cur ? ' class="cur"' : '') + '>' + esc(x) + '</span>').join('') + '</div>';
  const REQ_FLOW = ['👴 おじいさん', '🔍 困りごと', '⭐ 大事に したい', '📨 依頼', '🏠 再現', '✉ レビュー'];
  const DEV_FLOW = ['📩 依頼を 読む', '🧩 ブロックで 組む', '🏠 家で ためす', '📝 説明書', '📨 送る → ✉ レビュー'];
  // 各だんかいの カード（id → 中身）。ready:false の ときは まだ 出さない
  function modalFor(id, st, step){
    const ai = aiLast(st);
    const job = MODE === 'req' ? st.jobs[A] : st.jobs[B], s = jobState(job);
    if(MODE === 'req') switch(id){
      case 'who': return { icon:'🔰', title:'① おじいさんを 作ろう', flow:[REQ_FLOW, 0],
        lead:'あなたは、おじいさんの 困りごとを たのむ「依頼者」です。プログラムを 作るのは 🤖 ' + AI + '。まずは おじいさんを 作ろう。',
        steps:['名前を 決める（今日は 山田 ゲンジさん。かえても OK）', '年齢・性格・暮らしの カードを 選ぶ（カードで 困りごとが 決まる）', '好きな ことと 見た目を 決める', '「✔ この おじいさんで けってい」を おす'],
        note:'🚶 山田さんは「出かけるのが 好き」。出かけて いる 間に、家で 何か おきるかも…', ok:'▶ やってみる' };
      case 'find': return { icon:'🔍', title:'② 一日を 見て、困りごとを 見つけよう', flow:[REQ_FLOW, 1],
        steps:['「▶ 一日を 見る」を おす', '左の 家で、山田さんの 一日が 動く', '気持ちメーターが 下がったら、なぜ 下がったのか 考えて 選ぶ'],
        note:'👀 山田さんの 動きと、家の ようすを よく 見よう。説明が なくても、何が おきたか わかるかな？', ok:'▶ 見てみる' };
      case 'guess': return { icon:'😊↓', title:'気持ちメーターが 下がった！ なぜかな？', flow:[REQ_FLOW, 1],
        lead:'山田さんの「安心」が 下がったね。下の 帯に 印が 残ったよ。なぜ 下がったのか、あなたが 考えて 選ぼう。',
        steps:['山田さんの 様子と ことばを 見る', '右の「❓ なぜ 下がったのかな？」から 1つ 選ぶ', 'わからない ときは、帯の 印や「▶ その 場面を 見る」で 見なおす'], ok:'▶ 選んでみる' };
      case 'pick': return { icon:'🕵', title:'困りごとを 見つけた！', flow:[REQ_FLOW, 1],
        lead:'見つけたね！ 山田さんが 出かけて いる 間の 家が 心配だ。',
        steps:['「🕵 留守の 間の 防犯」の カードを おす', '「✔ この 困りごとを 依頼する」を おす'],
        note:'▶ を おすと、その 場面を もう一度 見られるよ', ok:'▶ 選ぶ' };
      case 'care': return { icon:'⭐', title:'③ 大事に したい ことを 選ぼう', flow:[REQ_FLOW, 2],
        steps:['4つの 中から 2つまで 選ぶ', '「✔ けってい」を おす'],
        note:'😊 安心・🤫 静か・🙈 プライバシー・🌱 節電 は、家の 右上の 気持ちメーターと 同じ。チャッピーの 動きで ふえたり へったり するよ', ok:'▶ 選んでみる' };
      case 'dont': return { icon:'🙅', title:'④ してほしくない ことを 書こう', flow:[REQ_FLOW, 3],
        steps:['されたら 嫌な ことを 自由に 書く', '思いつかない ときは、れいを おす', '「✔ けってい」を おす'],
        note:'👀 を おすと、されたら どう なるか 家で 見られるよ', ok:'▶ 書いてみる' };
      case 'send': return { icon:'📨', title:'④ 依頼を 送ろう', flow:[REQ_FLOW, 3],
        steps:['依頼書の カードを 見る', '「📨 依頼に出す」を おす', AI + 'が 作って 送って くれる（15秒くらい）'], ok:'▶ 依頼書へ' };
      case 'arrive1': return { icon:'📬', title:'1回目の プログラムが とどいた！', flow:[REQ_FLOW, 4], ai,
        steps:['「🏠 家で再現する」を おす', '左の 家で 山田さんの 一日が 動く', '山田さんが 困って いないか、よく 見る'],
        note:'🤔 説明書の とおりに 動くかな？ 山田さんが 家に いる 朝と 夕方も 見のがさないで。気持ちメーターも 見よう', ok:'▶ 家で 再現する' };
      case 'review1': return { icon:'✉', title:'見た ことを レビューに 書こう', flow:[REQ_FLOW, 5],
        steps:['依頼した ことが「できた」か「できていない」か 選ぶ（できていない ときは 根拠も）', '★を 3つ 選ぶ', '👍 よかった ところ', '💡 こうすると もっと よく なる', '✉ 返す'],
        note:'📝「家で 見えた こと」に、何時に 何が おきたか、気持ちメーターが なぜ へったかが 残って いるよ。一日を さいごまで 見たら「📋 一日の まとめを 見る」で 数も 大きく 見られるよ', ok:'▶ 書きはじめる' };
      case 'fixing': {
        const rv = s.rev, reply = (st.chat[A] || []).filter(m => m.by === BOT && rv && m.time >= rv.time).pop();
        return { ready:!!reply, icon:'🤖', title:AI + 'から へんじが きた', ai:reply ? reply.text : '',
          steps:['AIが 直して、2回目を 送って くる（10秒くらい）', 'とどいたら、また 家で 再現して 見よう'], ok:'OK' };
      }
      case 'arrive2': return { icon:'📬', title:'2回目が とどいた！ 直ったかな？', flow:[REQ_FLOW, 4], ai,
        steps:['「🏠 家で再現する」を おす', '山田さんが 家に いる ときは 静か？', '知らない人は にげた？'], ok:'▶ 家で 再現する' };
      case 'review2': return { icon:'✉', title:'2回目の レビューを 返そう', flow:[REQ_FLOW, 5],
        note:'🔁「📋 一日の まとめを 見る（前の 回と くらべる）」で、1回目と 気持ちメーターを くらべて みよう',
        steps:['依頼した ことが「できた」か「できていない」か 選ぶ', '★を 3つ 選ぶ', '👍 よかった ところ（直った ところ）', '✉ 返す'], ok:'▶ 書きはじめる' };
      case 'done': return { icon:'🎉', title:'依頼者 チュートリアル クリア！', learned:learnedList(st), links:true };
    }
    else switch(id){
      case 'card': return { icon:'🔰', title:'開発者 チュートリアルへ ようこそ！', flow:[DEV_FLOW, 0],
        lead:'あなたは プログラムを 作る「開発者」です。🤖 ' + AI + 'から、鈴木 シゲルさんの 依頼が とどいたよ。',
        crit:['🧩 困りごと：🕵 留守の 間の 防犯', '💬 依頼者の ことば：出かけている 間も、家が 守られて いると 安心', '⭐ 大事に したい：😊 安心・🤫 静か'],
        note:'🛠 どう 助けるかは、開発者の あなたが 考える',
        ok:'✔ わかった ▶ ブロックへ', onOk:() => { const x = load(); x.seen.card = true; save(x); tick(); setTimeout(() => scrollTo($('blocklyWrap')), 100); } };
      case 'build': return { icon:'🧩', title:'ブロックで 組もう（今回の れい：声で 追いはらう）', flow:[DEV_FLOW, 1],
        pic:'<div class="tut-blk"><div class="b loop">🔁 ずっと<small>『くりかえし』</small>' +
          '<div class="b if">もし <span class="b sens">🕵 知らない人が 家に いる<small>『🧪 仮想だけ』</small></span> なら<small>『はんだん』</small>' +
          '<div class="b act">💬 しゃべる「だれですか！ 警察を よびますよ」<small>『うごき・はなす』</small></div></div></div></div>',
        steps:['『くりかえし』から 🔁 ずっと を 出す', '『はんだん』の「もし」を 中へ', '『🧪 仮想だけ』の 🕵 知らない人が 家に いる を「もし」の くぼみへ', '『うごき・はなす』の 💬 しゃべる を 中へ'],
        note:'🚫「👤 人がいる」だと、おじいさんが いても あてはまるよ', ok:'▶ 組んでみる' };
      case 'try': return { icon:'🏠', title:'家で ためそう', flow:[DEV_FLOW, 2],
        steps:['「▶ 家で 一日 ためす」を おす', '鈴木さんの 1日が 右の 家で 動く', '困りごとは なくなった？ 気持ちメーターは へって いない？ 自分の 目で 見よう'], ok:'▶ ためしてみる' };
      case 'desc': return { icon:'📝', title:'説明書を 書いて 送ろう', flow:[DEV_FLOW, 3],
        steps:['「📝 ブロックから 下書きを つくる」を おす', '「いつ・何を すると・どう なるか」が 書けて いるか 見る', '「📨 依頼者に レビューを 求める」を おす'], ok:'▶ 書いてみる' };
      case 'done': return { icon:'🎉', title:'開発者 チュートリアル クリア！', learned:learnedList(st), links:true };
    }
    if(MODE === 'dev' && /^rev\d+$/.test(id)){
      const rv = s.rev || {}, more = String(rv.reason || '').split('💡 こうすると もっと よく なる：')[1] || '';
      return { icon:'✉', title:'レビューが とどいた！', flow:[DEV_FLOW, 4], ai,
        crit:(rv.checks || []).map(c => (c.ok ? '✔ ' : '✖ ') + c.label + (c.ok ? '' : '：' + c.why)), critNg:true,
        note:more ? '💡 ' + more.split('\n').filter(Boolean).join('　💡 ') : '',
        steps:['できていない ところと 💡 を 読む', 'ブロックを 直す', '家で ためして 確かめたら、もう一度 送る'], ok:'▶ 直しに いく' };
    }
    return null;
  }
  let modalEl = null;
  // ページの たしかめ（ui-modal）が 出ている あいだは 出さない（position:fixed なので offsetParent では わからない）
  const uiModalOpen = () => { const u = document.getElementById('uiModal'); return !!(u && u.isConnected && getComputedStyle(u).display !== 'none'); };
  function closeModal(){ if(modalEl){ modalEl.remove(); modalEl = null; } }
  function openModal(md, step){
    closeModal();
    // 名前を おきかえる（ボタンの 関数 fn・onOk は そのまま のこす。JSON に すると 消えて しまう）
    const fixDeep = v => typeof v === 'string' ? fixName(v) : Array.isArray(v) ? v.map(fixDeep)
      : v && typeof v === 'object' ? Object.keys(v).reduce((o, k) => { o[k] = fixDeep(v[k]); return o; }, {}) : v;
    md = fixDeep(md);
    const n = Math.min(step.n || 0, STEPS - 1);
    const h = '<div class="tut-m" role="dialog" aria-modal="true">' +
      (md.choices ? '' : '<button type="button" class="tm-x" data-tm="close" aria-label="とじる">✕</button>') +
      '<span class="tm-step">' + (md.links ? '🎉 クリア' : md.choices ? '🔰 チュートリアル' : '🔰 やること ' + (n + 1) + ' ／ ' + STEPS) + '</span>' +
      '<div class="tm-ic">' + md.icon + '</div><h3>' + esc(md.title) + '</h3>' +
      (md.flow ? flowHTML(md.flow[0], md.flow[1]) : '') +
      (md.lead ? '<p class="tm-lead">' + esc(md.lead) + '</p>' : '') +
      (md.ai ? '<div class="tm-ai"><b>🤖 ' + esc(AI) + '</b><span>' + esc(md.ai) + '</span></div>' : '') +
      (md.crit && md.crit.length ? md.crit.map(c => '<div class="tm-crit' + (md.critNg && /^✖/.test(c) ? ' ng' : '') + '">' + esc(c) + '</div>').join('') : '') +
      (md.pic || '') +
      (md.steps ? '<ol class="tm-steps">' + md.steps.map(x => '<li>' + esc(x) + '</li>').join('') + '</ol>' : '') +
      (md.learned ? '<ul class="tm-done">' + md.learned.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>' : '') +
      (md.note ? '<div class="tm-note">' + esc(md.note) + '</div>' : '') +
      (md.voice ? '<label class="tm-voice"><input type="checkbox" id="tmVoice"' + (voiceWanted() ? ' checked' : '') + '> 🔊 声で 説明する（チャッピー・おじいさん・知らない人・ナレーションの 声）</label>' : '') +
      '<div class="tm-btns' + (md.choices ? ' col' : '') + '">' +
        (md.choices ? md.choices.map((c, i) => '<button type="button" class="tm-ok' + (c.sub ? ' sub' : '') + '" data-tm="c' + i + '">' + esc(c.label) + (c.small ? '<small>' + esc(c.small) + '</small>' : '') + '</button>').join('')
        : md.links ? nextBtnsHTML() + '<button type="button" class="tm-ok" data-tm="close" style="background:#8A99A8;box-shadow:none">とじる</button>'
        : '<button type="button" class="tm-ok" data-tm="ok">' + esc(md.ok || 'OK') + '</button>') + '</div></div>';
    modalEl = document.createElement('div'); modalEl.className = 'tut-mbg'; modalEl.innerHTML = h;
    document.body.appendChild(modalEl);
    modalEl.addEventListener('click', e => {
      const b = e.target.closest('[data-tm]');
      if(!b) return;
      const vb = document.getElementById('tmVoice');
      if(vb && window.ChappyVoice) ChappyVoice.set(vb.checked);
      closeModal();
      if(b.dataset.tm === 'ok'){ const f = md.onOk || step.act || (step.go && step.go.enter) || step.go; if(f) setTimeout(f, 50); }
      const c = /^c(\d+)$/.exec(b.dataset.tm || ''); if(c && md.choices[+c[1]]) setTimeout(md.choices[+c[1]].fn, 50);
      lastKey = '';
    });
    const ok = modalEl.querySelector('.tm-ok'); if(ok) setTimeout(() => { try{ ok.focus(); }catch(e){} }, 60);
  }
  const voiceWanted = () => { try{ const v = localStorage.getItem('chappy_voice'); return v == null ? true : v === '1'; }catch(e){ return true; } };
  // 📖 やりかた：いまの だんかいの カードを もう一度
  function helpModal(){
    const st = load(), step = MODE === 'req' ? reqStep(st) : devStep(st);
    const md = modalFor(step.done ? 'done' : step.id, st, step);
    if(md && md.ready !== false) openModal(md, step);
    else openModal({ icon:step.icon || '🔰', title:step.h || '', lead:step.s || '', ok:'OK' }, step);
  }
  function maybeModal(st, step){
    const id = step.done ? 'done' : step.id;
    if(!st.modeChosen || AUTO.on) return;                       // はじめの えらぶ カード・おまかせ中は 出さない
    if(!id || modalEl || uiModalOpen()) return;
    if(st.seen['m:' + id]) return;
    const md = modalFor(id, st, step);
    if(!md || md.ready === false) return;
    st.seen['m:' + id] = true; save(st);
    hideNarr();
    openModal(md, step);
  }
  // はじめに：おまかせで 見る か、自分で やる か
  function modeModal(){
    const st0 = load();
    openModal({ icon:'🎬', title:(MODE === 'req' ? '📨 依頼者' : '🛠 開発者') + ' チュートリアル',
      lead:MODE === 'req' ? '山田 ゲンジさんの 困りごとを、🤖 AI開発チームに たのむ「依頼者」の しごとを ためします。① おじいさんを 作る から レビュー まで、じゅんばんに すすみます。'
                          : '🤖 AI依頼チームから とどいた 依頼を、ブロックで 作る「開発者」の しごとを ためします。依頼を 読む → 組む → 家で ためす → 送る → レビュー の じゅんばんです。',
      voice:true,
      choices:[{ label:'🎬 おまかせで 見る', small:'自動で さいごまで すすみます（' + (MODE === 'req' ? '8' : '4') + '分くらい）。見ているだけで OK', fn:startAuto },
               { label:'✋ 自分で やる', small:'カードの 案内を 見ながら、自分で おして すすめます', sub:true, fn:() => { const x = load(); x.modeChosen = true; x.auto = false; save(x); tick(); } }] },
      { n:0 });
    void st0;
  }

  // ================= 🎬 おまかせ：ゆびが 動いて、自動で えらぶ・書く・家を 動かす（ナレーションつき） =================
  const AUTO = { on:false, paused:false, houseWasRunning:false, fastT:0 };
  // おまかせ中は、家の 一日を とても 速く 動かす（できごとの 場面は 家の「見どころ」と ナレーションで 止まるので 見のがさない）
  const AUTO_FAST = 60;
  function houseRate(r){ const f = Array.from(document.querySelectorAll('iframe')).find(x => /teamhome/.test(x.src || '')); try{ if(f && f.contentWindow && f.contentWindow.teamhomeRate) f.contentWindow.teamhomeRate(r); }catch(e){} }
  let curEl = null;
  addCss(
    '.tut-cur{position:fixed;left:-80px;top:-80px;z-index:100040;width:38px;height:38px;pointer-events:none;transition:left .7s cubic-bezier(.4,.1,.3,1),top .7s cubic-bezier(.4,.1,.3,1);filter:drop-shadow(0 3px 4px rgba(0,0,0,.35))}' +
    '.tut-cur i{position:absolute;left:-16px;top:-16px;width:38px;height:38px;border-radius:50%;border:4px solid #F0A23B;opacity:0}' +
    '.tut-cur.tap i{animation:tutTap .55s ease-out}' +
    '@keyframes tutTap{from{transform:scale(.3);opacity:1}to{transform:scale(1.7);opacity:0}}' +
    '.tut-nl{display:flex;gap:8px;align-items:flex-start;margin-top:5px;background:#1F3B2C;color:#fff;border-radius:10px;padding:6px 12px;font-size:15.5px;font-weight:800;line-height:1.6;word-break:keep-all;overflow-wrap:anywhere}' +
    '.tut-nl b{flex:none;font-size:20px;line-height:1.35}.tut-nl span{animation:tutFade .3s}' +
    '.tut-auto-hl{outline:4px solid #F0A23B !important;outline-offset:4px;border-radius:10px;box-shadow:0 0 0 10px rgba(240,162,59,.25) !important}' +
    '.tut-top button.tut-auto{background:#FFF1DC;border-color:#F0A23B;color:#8A5300;font-weight:900}' +
    '.tut-bar.auto{border-color:#F0A23B;background:#FFFBF2}.tut-bar.auto .tut-badge{background:#F0A23B}' +
    '.tut-m .tm-btns.col{flex-direction:column;align-items:stretch}.tut-m .tm-btns.col .tm-ok{display:flex;flex-direction:column;align-items:center;gap:2px}' +
    '.tut-m .tm-ok small{font-size:12.5px;font-weight:700;opacity:.92}.tut-m .tm-ok.sub{background:#fff;color:#2E7A4A;border:3px solid #3FA564;box-shadow:none}' +
    '.tut-m .tm-voice{display:flex;gap:8px;align-items:center;justify-content:center;margin:10px 0 0;font-size:14px;font-weight:800;color:#33404F;cursor:pointer}.tut-m .tm-voice input{width:20px;height:20px}'
  );
  const CUR_SVG = '<svg viewBox="0 0 24 24" width="38" height="38"><path d="M4 2 L4 19 L8.5 15 L11.5 22 L14.5 20.7 L11.6 14 L18 14 Z" fill="#fff" stroke="#1E2A38" stroke-width="1.6" stroke-linejoin="round"/></svg><i></i>';
  class Stop extends Error {}
  // ナレーションの 文字は 上の 案内の 帯の 中に 出す（画面の 上に くっついて いて、光らせる ところは いつも 帯の 下に 来る ＝ かくさない）
  let narrText = '';
  function showNarr(text){ narrText = String(text || ''); lastKey = ''; tick(); }
  function hideNarr(){ if(!narrText) return; narrText = ''; lastKey = ''; tick(); }
  function cursor(){ if(!curEl){ curEl = document.createElement('div'); curEl.className = 'tut-cur'; curEl.innerHTML = CUR_SVG; document.body.appendChild(curEl); } return curEl; }
  async function wait(ms){
    let left = ms;
    while(left > 0){
      if(!AUTO.on) throw new Stop();
      const d = Math.min(100, left);
      await new Promise(r => setTimeout(r, d));
      if(!AUTO.paused) left -= d;
    }
  }
  async function until(fn, max){
    let t = 0;
    for(;;){
      if(!AUTO.on) throw new Stop();
      let ok = false; try{ ok = !!fn(); }catch(e){ ok = false; }
      if(ok) return true;
      if(t >= (max || 30000)) return false;
      await wait(300); t += 300;
    }
  }
  async function narr(text, extra){
    if(!AUTO.on) throw new Stop();
    const h = housePlay(), mine = !!(h && h.running && !h.demo);
    if(mine) housePause(true);                                 // 家を 止めてから 話す（話の とちゅうに 新しい せりふが 入らない）。話しおわったら つづける
    if(window.ChappyVoice && ChappyVoice.on()) await until(() => !ChappyVoice.busy(), 12000);   // キャラの せりふ・家の ナレーションが おわってから
    showNarr(text);
    const V = window.ChappyVoice, est = Math.max(1800, (V ? V.clean(text) : text).length * 120);
    if(V && V.on()){
      let doneV = false; V.speak('n', text, true).then(() => { doneV = true; });
      await until(() => doneV, est + 9000);
      await wait(300);
    } else await wait(est);
    if(extra) await wait(extra);
    if(mine){ const h2 = housePlay(); if(h2 && h2.paused && !AUTO.paused) housePause(false); }   // 止めた ままに しない
  }
  async function find(sel, max){
    let el = null;
    await until(() => { el = typeof sel === 'string' ? q(sel) : sel(); return !!(el && el.getClientRects().length); }, max || 6000);
    return el && el.getClientRects().length ? el : null;
  }
  async function moveTo(el){
    if(!el) return;
    if(!el.closest('.uim-bg, .tut-mbg')){ scrollTo(el); await wait(850); }
    const r = el.getBoundingClientRect(), c = cursor();
    c.style.left = Math.round(r.left + Math.min(r.width / 2, 46)) + 'px';
    c.style.top = Math.round(r.top + Math.min(r.height / 2, 22)) + 'px';
    await wait(760);
  }
  function tapFx(){ const c = cursor(); c.classList.remove('tap'); void c.offsetWidth; c.classList.add('tap'); }
  async function tap(sel, after){
    let el = await find(sel);
    if(!el){ if(window.console) console.warn('おまかせ：見つからない', sel); return null; }
    await moveTo(el);
    // ゆびが 動いて いる 間に ページが 描きなおす ことが ある（定期の 読みこみ）→ おす 直前に もう一度 さがす
    const again = () => { if(el.isConnected) return; const e2 = typeof sel === 'string' ? q(sel) : sel(); if(e2) el = e2; };
    again();
    el.classList.add('tut-auto-hl'); tapFx();
    await wait(260);
    again();
    el.click();
    await wait(380);
    el.classList.remove('tut-auto-hl');
    await wait(after == null ? 450 : after);
    return el;
  }
  async function point(sel, text, extra){
    const el = await find(sel);
    showNarr(text);                                            // 先に 帯へ 文字を 出してから うごかす（帯の 高さで 位置を きめる）
    if(el){ await moveTo(el); el.classList.add('tut-auto-hl'); }
    try{ await narr(text, extra); } finally { if(el) el.classList.remove('tut-auto-hl'); }
    return el;
  }
  async function type(sel, text){
    const el = await tap(sel, 200);
    if(!el) return;
    el.focus(); el.value = '';
    for(const ch of text){
      el.value += ch; el.dispatchEvent(new Event('input', { bubbles:true }));
      await wait(/[\s、。]/.test(ch) ? 90 : 55);
    }
    el.dispatchEvent(new Event('change', { bubbles:true }));
    await wait(400);
  }
  async function uiOk(max){
    const el = await find('#uiModalOk', max || 3500);
    if(!el) return false;
    await wait(900);                                            // 何が 出たか 見える ように 少し まつ
    await moveTo(el); tapFx(); await wait(250);
    if(el.isConnected) el.click();
    await wait(500);
    return true;
  }
  const hwin = () => { const f = Array.from(document.querySelectorAll('iframe')).find(x => /teamhome/.test(x.src || '')); try{ return f && f.contentWindow; }catch(e){ return null; } };
  const hcap = () => { try{ const d = hwin().document; return (d.getElementById('capTitle').textContent || '') + ' ' + (d.getElementById('capText').textContent || ''); }catch(e){ return ''; } };
  function housePause(on){ try{ const w = hwin(); if(w && w.teamhomePause) w.teamhomePause(on); }catch(e){} }
  // 見おわった 場面：家を とめて、小さい 窓を とじる（説明の じゃまに しない）
  function houseDone(){ try{ const w = hwin(); if(w && w.teamhomeStop) w.teamhomeStop(); }catch(e){} closeHouse(); }
  async function houseDemo(max){
    await until(() => { const h = housePlay(); return !!(h && h.demo && !h.demoEnded && h.running); }, 15000);
    await until(() => { const h = housePlay(); return !h || !h.demo || h.demoEnded; }, max || 45000);
    await wait(500);
  }
  function autoPause(p){
    AUTO.paused = p;
    if(window.ChappyVoice) ChappyVoice.pause(p);
    if(p){ const h = housePlay(); AUTO.houseWasRunning = !!(h && h.running); if(AUTO.houseWasRunning) housePause(true); }
    else if(AUTO.houseWasRunning){ housePause(false); AUTO.houseWasRunning = false; }
    lastKey = ''; tick();
  }
  function stopAuto(){
    if(AUTO.paused) autoPause(false);
    AUTO.on = false; clearInterval(AUTO.fastT); houseRate(10);
    const x = load(); x.auto = false; x.modeChosen = true; save(x);
    hideNarr(); if(curEl){ curEl.style.left = '-80px'; curEl.style.top = '-80px'; }
    if(window.ChappyVoice) ChappyVoice.stop();
    lastKey = ''; tick();
  }
  async function startAuto(from){
    const st = load(); st.auto = true; st.modeChosen = true; save(st);
    AUTO.on = true; AUTO.paused = false; lastKey = ''; tick();
    clearInterval(AUTO.fastT);
    AUTO.fastT = setInterval(() => { if(!AUTO.on || AUTO.paused) return; const h = housePlay(); if(h && h.running && !h.demo) houseRate(AUTO_FAST); }, 300);
    try{ await (MODE === 'req' ? autoReq(typeof from === 'number' ? from : 0) : autoDev()); }
    catch(e){ if(!(e instanceof Stop)){ if(window.console) console.warn('おまかせ：', e); AUTO.on = false; showNarr('うまく すすめなく なりました。ここからは 案内を 見ながら 自分で つづけてね'); } }
    finally{
      AUTO.on = false;
      clearInterval(AUTO.fastT); houseRate(10);
      if(curEl){ curEl.style.left = '-80px'; curEl.style.top = '-80px'; }
      const x = load(); x.auto = false; save(x);
      lastKey = ''; tick();
      setTimeout(hideNarr, 6000);
    }
  }

  // ---------- 🎬 依頼者の おまかせ（① から さいごまで） ----------
  const hvmin = () => { const h = housePlay(); return h ? h.vmin : 0; };
  const houseIdle = () => { const h = housePlay(); return !!(h && !h.paused); };       // 家の 見どころ（止まって 説明）が おわった
  const jumpTo = m => { const f = G('homeSend'); if(f) f({ type:'teamhome-jump', t:m }); };   // 家の「一日の 帯」で その 時間へ（再現の とちゅうから）
  async function autoReq(from){
    from = from || 0;
    const go = i => { const f = G('goStep'); if(f) f(i); };
    const stepIs = i => () => G('curStep') === i;
    const rows = () => Array.from(document.querySelectorAll('#outgoing .rvrow'));
    const memoHas = re => { const m = G('rvMemo'); return !!(m && (m.why || []).some(x => re.test(x.why))); };
    await narr('これから、依頼者の しごとを、さいしょから さいごまで 見せるよ。見ているだけで OK！');
    if(from <= 0){
    // ① おじいさんを 作る
    go(0); await wait(700);
    await point('#nameGrp', '① まず、ペアで おじいさんを 作る。名前は 自分たちで 決めるよ。今日は 山田 ゲンジさん。');
    await tap('[data-pa="95さい"]', 500);
    await point('#profCards', '年齢・性格・暮らしの カードを 選ぶ。カードで、おじいさんの 困りごとや 気持ちの 動き方が かわるよ。山田さんは、あわてんぼうで、出かけるのが 好き。');
    await point('#likeGrp', '好きな ことは、自由に 書ける。山田さんは 将棋が 好き。');
    await tap('#lookRows [data-lk="hat"][data-i="1"]', 600);
    await point('#lookPrev', '見た目も 細かく 選べる。ぼうしを かぶせて みた。家の 中の 山田さんも、この 見た目に なるよ。');
    await tap('#savePersona', 1200);
    }
    if(from <= 1){
      if(from === 1){ go(1); await wait(800); }
    // ② 一日を 見て、気持ちメーターが 下がった ところから 困りごとを 見つける
    if(from === 0){ await until(stepIs(1), 8000); await wait(600); }
    await point('#dayAll', '② 山田さんの 一日を 見て、困りごとを 見つける。');
    await tap('#dayAll', 900);
    await narr('家の 右上の 気持ちメーターは、はじめは 80。山田さんの 気持ちが 下がると、家が 止まって、下の 帯に 印が 残るよ。');
    await until(() => !!(G('pending') || {}).intruder, 180000);
    await until(houseIdle, 20000); await wait(1200);
    await narr('夕方 帰って きた 山田さん。「物が 動いてる… だれか 入ったのか！？」と 言って、安心が 下がった。下の 帯に 😊↓ の 印が ついたね。');
    houseDone(); await wait(500);
    await point('.find.q', '右にも「なぜ 下がったのかな？」が 出た。何が あったのか、昼の ようすを 見に 行こう。帯の 時間を おすと、その 時間に もどれるよ。');
    jumpTo(9 * 60 + 50);
    await until(() => { const v = hvmin(); return v >= 10 * 60 + 5 && v < 13 * 60; }, 60000);
    await until(houseIdle, 20000); await wait(1500);
    await narr('山田さんが 出かけた あと、かぎが あいた まま。そこに 知らない人が 入って きて いた。');
    houseDone(); await wait(500);
    for(let k = 0; k < 3 && !G('isFound')('intruder'); k++) await tap('.find.q [data-guess="intruder"]', 900);
    await point('[data-fk="intruder"]', '見つけた！「留守の 間の 防犯」だね。これを 依頼しよう。');
    for(let k = 0; k < 3 && G('curStep') !== 2; k++){ await tap('[data-fk="intruder"]', 500); await tap('#planApply', 1200); await until(stepIs(2), 6000); }
    }
    if(from <= 2){
      if(from === 2){ go(2); await wait(800); }
    // ③ 大事に したい こと
    await wait(600);
    await point('#careCards', '③ 山田さんが 大事に して いる ことを 選ぶ。家の 右上の 気持ちメーターと 同じ 4つから 2つまで。');
    await tap('[data-care="anshin"]', 300);
    await tap('[data-care="shizuka"]', 300);
    await narr('今日は「安心」と「静か」。人に よって、大事に したい ことは ちがうよ。');
    for(let k = 0; k < 3 && G('curStep') !== 3; k++){ await tap('#careApply', 1200); await until(stepIs(3), 6000); }
    }
    if(from <= 3){
      if(from === 3){ go(3); await wait(800); }
    // ④ 依頼
    await wait(600);
    await point('#sendPreview', '④ 依頼書が できた。困りごとと、大事に したい ことが、開発チームに とどくよ。');
    await tap('#sendRequest');
    await uiOk(); await uiOk(1200);
    await narr('AI開発チームが、プログラムを 作って います。少し まとう。');
    await until(() => !!$('houseTry'), 60000); await wait(900);
    }
    if(from <= 4){
      if(from === 4){ const f = G('showRecv'); if(f) f(); await until(() => !!$('houseTry'), 20000); await wait(800); }
    // 1回目：家で 再現
    await point('#houseTry', 'とどいた！ 説明書を 読んだら、送られて きた プログラムで、山田さんの 一日を 家で 動かして みよう。');
    await tap('#houseTry');
    if(await until(() => memoHas(/まちがえられて/) || hvmin() >= 9 * 60 + 30, 40000) && memoHas(/まちがえられて/)){
      await until(houseIdle, 20000);
      await narr('あれ？ チャッピーが、家に いる 山田さんに「だれですか！」と 言った。山田さんは びっくりして、安心が 下がった。');
    }
    await until(() => /にげていった/.test(hcap()), 90000);
    await until(houseIdle, 20000);
    await narr('知らない人は、チャッピーの 声に おどろいて、にげて いった。ここは 依頼どおりだね。');
    await until(() => hvmin() >= 17 * 60 + 20, 120000);
    await narr('夕方、帰って きた 山田さんにも、チャッピーは「だれですか！」と 言って しまう。「静か」と「安心」が 下がって いるね。');
    await narr('夜の ようすも 見て みよう。帯の 時間を おすと、とべるよ。');
    jumpTo(22 * 60 + 50);
    await until(() => { const v = hvmin(); return v >= 23 * 60 + 5 && v < 1440 + 300; }, 60000);
    await until(houseIdle, 20000);
    await narr('夜、ねて いる 山田さんにも 話しかけて いる。「静か」が どんどん 下がって いく。');
    if(await until(() => !!(G('rvMemo') || {}).sum, 240000)){                      // 一日の 終わりまで（まとめが できる）
      await wait(800);
      await tap('[data-opensum]', 1200);
      await narr('「📋 一日の まとめ」を 開くと、この 日の 気持ちメーターと、話しかけた 回数などが 大きく 見られるよ。安心も 静かも、80から 下がって いるね。');
      await tap('[data-smclose]', 600);
    }
    await point('#rvMemo', '「家で 見えた こと」の メモに、何時に、何で 気持ちメーターが 上がったか 下がったかが、回数つきで 残って いる。これを 根拠に レビューを 書こう。');
    // レビュー（自分たちの 目で 見て 決める）
    await point('#outgoing .rvck', 'レビューでは、依頼した ことが できたかを、自分たちの 目で 見て 決める。');
    await tap(() => rows()[0] && rows()[0].querySelector('input[value="1"]'));
    await type(() => rows()[0] && rows()[0].querySelector('.rvwhy'), '10時ごろ 知らない人が 来て、チャッピーの 声で にげた');
    await narr('★を つける。くらしや 気持ちに 合って いるかは ★1つ。山田さんが 何回も びっくりして、安心も 静かも 下がって いたからね。');
    for(const [k, n] of [['help', 2], ['easy', 3], ['fit', 1]]) await tap('#outgoing .tr-row[data-k="' + k + '"] .tr-stars span[data-n="' + n + '"]', 250);
    await type('#rvGood', '知らない人が 来たら、チャッピーの 声で にげて いった');
    await type('#rvMore', '家に いる 山田さんにも「だれですか！」と 言って いて、安心と 静かが 下がった。知らない人の ときだけ 言う ように して ほしい');
    await tap('#sendResp'); await uiOk();
    await until(() => /レビュー ありがとう/.test(aiLast(load())), 20000);
    await narr('AI開発チームから へんじが きた。「' + aiLast(load()) + '」');
    await until(() => { const s = jobState(load().jobs[A]); return !!(s.sub && s.sub.version === 2 && !s.rev && $('houseTry')); }, 40000);
    await wait(800);
    }
    if(from <= 5){
      if(from === 5){ const f = G('showRecv'); if(f) f(); await until(() => !!$('houseTry'), 20000); await wait(800); }
    // 2回目
    await point('#houseTry', '2回目が とどいた。直ったか、もう一度 家で 見て みよう。');
    await tap('#houseTry');
    await until(() => /にげていった/.test(hcap()), 90000);
    await until(houseIdle, 20000);
    await narr('知らない人は、こんども にげて いった。');
    await until(() => hvmin() >= 17 * 60 + 20, 120000);
    await narr('帰って きた 山田さんには、何も 言わない。夜も 見て みよう。');
    jumpTo(22 * 60 + 50);
    await until(() => { const v = hvmin(); return v >= 23 * 60 + 10 && v < 1440 + 300; }, 60000);
    await narr('夜も 静か。気持ちメーターも 下がって いない。');
    if(await until(() => !!(G('rvMemo') || {}).sum, 240000)){
      await wait(800);
      await tap('[data-opensum]', 1200);
      await point('.sm-tbl', '「📋 一日の まとめ」の 下の「前に 送られて きた プログラムと くらべる」で、1回目と 2回目の 気持ちメーターを くらべられる。ちがいが よく わかるね。');
      await tap('[data-smclose]', 600);
    }
    for(const r of rows()) await tap(() => r.querySelector('input[value="1"]'), 250);
    await type(() => rows()[0] && rows()[0].querySelector('.rvwhy'), '10時ごろ 知らない人が にげた。山田さんには 言わなかった');
    for(const k of ['help', 'easy', 'fit']) await tap('#outgoing .tr-row[data-k="' + k + '"] .tr-stars span[data-n="3"]', 200);
    await type('#rvGood', '山田さんには 言わなく なって、安心も 静かも 下がらなかった');
    await tap('#sendResp'); await uiOk();
    await until(() => load().finished, 20000);
    }
    await narr('これで、依頼者の しごとは おしまい！ 一日を 見て、気持ちメーターが 下がった わけから 困りごとを 見つけ、大事に したい ことと 一緒に たのむ。とどいたら 家で 自分の 目で 見て、メーターと メモを 根拠に レビューする。依頼どおりに 見えても、おじいさんが 困って いないか 見るのが だいじだよ。');
  }

  // ---------- 🎬 開発者の おまかせ ----------
  const wsp = () => G('workspace');
  function mk(type, fields){
    const w = wsp(), b = w.newBlock(type);
    if(fields) Object.keys(fields).forEach(k => b.setFieldValue(fields[k], k));
    b.initSvg(); b.render();
    return b;
  }
  async function cat(name){
    const el = await find(() => Array.from(document.querySelectorAll('.blocklyTreeRow, .blocklyToolboxCategory')).find(x => x.textContent.indexOf(name) >= 0), 3000);
    if(!el) return;
    await moveTo(el); tapFx(); await wait(200);
    el.click();
    await wait(1200);                                           // 引き出しの 中の ブロックが 見える
    try{ const tb = wsp().getToolbox(); if(tb && tb.clearSelection) tb.clearSelection(); }catch(e){}
    try{ const f = wsp().getFlyout && wsp().getFlyout(); if(f && f.isVisible && f.isVisible()) f.hide(); }catch(e){}
    await wait(300);
  }
  async function showBlock(b){ try{ await moveTo(b.getSvgRoot()); tapFx(); }catch(e){} await wait(300); }
  async function autoDev(){
    const jr = () => { const f = G('jobCheckRes'), c = G('curJob'); return f && c ? f(c()) : null; };
    await narr('これから、開発者の しごとを、さいしょから さいごまで 見せるよ。見ているだけで OK！');
    await point('#jobIssues', 'AI依頼チームから 依頼が とどいた。困りごとは、留守の 間の 防犯。');
    await point('#jobCrit', '依頼者の ことばも 読もう。出かけている 間も、家が 守られて いると 安心。');
    await point('#jobCare', '大事に したい ことは、安心と 静か。おじいさんの 気持ちメーターで 見られるよ。');
    await narr('どう 助けるかは、開発者が 考える。今回は、知らない人が 来たら、チャッピーの 声で 追いはらう ことに しよう。');
    { const x = load(); x.seen.card = true; save(x); }
    const w = wsp(); if(!w){ await narr('ブロックの 画面が 見つかりませんでした'); return; }
    w.clear();
    await narr('ブロックで 組んで いこう。');
    await cat('くりかえし');
    const fe = mk('sc_forever'); fe.moveBy(40, 30); await showBlock(fe);
    await narr('「ずっと」の 中に 入れた ものは、何回も くりかえして 動くよ。');
    await cat('はんだん');
    const ifb = mk('controls_if'); fe.getInput('DO').connection.connect(ifb.previousConnection); await showBlock(ifb);
    await narr('「もし」で、センサーを 見て、どう するか 決める。');
    await cat('センサー');
    let sen = mk('sc_pir'); ifb.getInput('IF0').connection.connect(sen.outputConnection); await showBlock(sen);
    await narr('まずは「人がいる」に してみよう。');
    await cat('うごき・はなす');
    const sp = mk('sc_speak', { TEXT:'だれですか！ 警察を よびますよ' }); ifb.getInput('DO0').connection.connect(sp.previousConnection); await showBlock(sp);
    await narr('知らない人が おどろく ように、「だれですか！ 警察を よびますよ」と しゃべらせる。');
    await narr('家で 一日 ためしてみよう。');
    await tap('#tryAll');
    await until(() => { const g = jr(); return !!(g && g.list[0] && g.list[0].status === 'ok' && g.donts[0] && g.donts[0].status === 'ng'); }, 150000);
    await wait(1500);
    houseDone(); await wait(500);
    await point('#devMeter', '知らない人は にげた。でも、気持ちメーターを 見て。家に いる おじいさんにも「だれですか！」と 言って しまって、気持ちが へったんだ。へった わけも 見て みよう。');
    await narr('「人がいる」は、おじいさんが いても あてはまる。おじいさんか 知らない人かを 見わける ブロックが ないか、さがして みよう。');
    await cat('仮想だけ');
    sen.dispose(true); sen = mk('sc_stranger_in'); ifb.getInput('IF0').connection.connect(sen.outputConnection); await showBlock(sen);
    await narr('「知らない人が 家に いる」ブロックに かえた。もう一度 ためそう。');
    await tap('#tryAll'); await wait(3000);
    await until(() => { const g = jr(); return !!(g && g.list[0] && g.list[0].status === 'ok' && !(g.donts || []).some(r => r.status === 'ng')); }, 150000);
    await wait(1500);
    houseDone(); await wait(500);
    await point('#devMeter', 'こんどは、おじいさんには 言わずに、知らない人だけ にげて いった。でも、よいか どうかを 決めるのは 依頼者の レビューだよ。');
    await tap('#descDraft'); await uiOk(1500);
    await point('#descInput', '依頼者に わたす 説明書を 書く。いつ、何を すると、どう なるかを 書くよ。下書きボタンで つくれる。');
    { const d = $('descInput');
      if(d){ d.value = d.value.replace(/止めたい\s*ときは\s*[：:]\s*$/, '止めたい ときは：チャッピーの 電源を 切ると、しゃべらなく なります'); d.dispatchEvent(new Event('input', { bubbles:true })); } }
    await point('#descInput', '「止めたい ときは」も 書いて おこう。依頼者は プログラムを 見ないので、止め方が わかると 安心だね。');
    await tap('#submitBtn'); await uiOk(); await uiOk(1500);
    await narr('AI依頼チームが、家で ためして います。');
    await until(() => load().finished, 40000);
    await wait(1200);
    await narr('レビューが とどいた。よかった ところと、もっと よく なる ところを 読もう。依頼を 読んで、どう 助けるか 考えて、ブロックで 組む。家で ためして、おじいさんの ようすと 気持ちメーターで 確かめてから 送る。レビューの 💡 で、もっと よく できるよ。');
  }

  function tick(){
    if(!bar) return;
    const st = load();
    if(process(st)) save(st);
    const step = MODE === 'req' ? reqStep(st) : devStep(st);
    step.h = fixName(step.h); step.s = fixName(step.s);
    if(step.done && !done(MODE)) done(MODE, true);
    const ai = aiLast(st);
    const vOn = !!(window.ChappyVoice && ChappyVoice.on());
    const key = JSON.stringify([step.n, step.id, step.h, step.s, step.btn, ai, step.done, AUTO.on, AUTO.paused, vOn, narrText, barMini()]);
    if(key !== lastKey){
      lastKey = key;
      bar.className = 'tut-bar' + (step.wait ? ' wait' : '') + (step.done ? ' done' : '') + (AUTO.on ? ' auto' : '') + (barMini() && !step.done ? ' mini' : '');
      // 1行目：バッジ（なんばん目）・いま やる こと・「そこへ」・小さい ボタン ／ 2行目：くわしく・AIの ことば（小さく した ときは 1行目だけ）
      const badge = '<span class="tut-badge" title="相手は ' + esc(AI) + '（🤖 AI）。記録は のこりません">' + (AUTO.on ? '🎬 おまかせ' : '🔰 ' + (MODE === 'req' ? '依頼者' : '開発者')) +
        (step.done ? '' : ' ' + Math.min(step.n + 1, STEPS) + '/' + STEPS) + '</span>';
      const ctrl = '<span class="tut-ctrl">' +
        (AUTO.on ? '<button type="button" class="tut-auto" data-tut="apause">' + (AUTO.paused ? '▶ つづき' : '⏸ 止める') + '</button><button type="button" data-tut="manual" title="おまかせを やめて 自分で やる">✋ 自分で</button>'
                 : '<button type="button" class="tut-help" data-tut="help">📖 やりかた</button>') +
        '<button type="button" class="ic" data-tut="voice" title="声で 説明する／しない">' + (vOn ? '🔊' : '🔇') + '</button>' +
        (step.done ? '' : '<button type="button" class="ic tut-mini" data-tut="mini" title="' + (barMini() ? '案内を 大きく する' : '案内を 小さく する（1行）') + '">' + (barMini() ? '▾' : '▴') + '</button>') +
        '<button type="button" class="ic" data-tut="reset" title="はじめから">↺</button><a class="ic" href="' + quitUrl() + '" title="チュートリアルを やめる">✕</a></span>';
      const go = AUTO.on ? '' : step.act ? '<button type="button" class="tut-go" data-tut="act">' + esc(step.btn) + '</button>' : step.go ? '<button type="button" class="tut-go" data-tut="go">▶ そこへ</button>' : '';
      const sub = narrText || AUTO.on ? '' : String(step.s || '');
      const aiOn = ai && !narrText && !AUTO.on;
      bar.innerHTML = step.done ? '<div class="tut-row">' + badge + '<span class="sp"></span>' + ctrl + '</div>' + doneHTML(st)
        : '<div class="tut-row">' + badge + '<span class="tut-ic">' + step.icon + '</span><b class="tut-h" title="' + esc(sub) + '">' + esc(step.h) + '</b>' + go + ctrl + '</div>' +
          (sub || aiOn ? '<div class="tut-row2">' + (sub ? '<span class="tut-s">' + esc(sub) + '</span>' : '') +
            (aiOn ? '<span class="tut-ai"><b>🤖 ' + esc(AI) + '</b><span title="' + esc(ai) + '">' + esc(ai) + '</span></span>' : '') + '</div>' : '') +
          (narrText || AUTO.on ? '<div class="tut-nl"><b>🎙</b><span>' + esc(narrText || '…') + '</span></div>' : '') +
          (MODE === 'req' ? chapHTML(chapOf(step.id)) : '');   // おまかせ中は いつも 1行 とって おく（帯の 高さが かわらない）
    }
    try{ document.body.style.setProperty('--tutH', (bar.offsetHeight + 18) + 'px'); }catch(e){}
    goFn = AUTO.on ? null : step.act || step.go || null;
    // 光らせる（ページが 描きなおしても つけなおす）
    const els = step.hl && !AUTO.on ? Array.from(document.querySelectorAll(step.hl)) : [];
    hlEls.forEach(el => { if(els.indexOf(el) < 0) el.classList.remove('tut-hl'); });
    els.forEach(el => el.classList.add('tut-hl'));
    hlEls = els;
    curStepId = step.done ? 'done' : step.id;
    dockManage();
    maybeModal(st, step);
  }
  // ---------- 小さい 家の 窓：家が 動いている ときだけ 出す。おわって 4秒 たったら とじる（自分で 開いた ときは そのまま） ----------
  let curStepId = '', idleSince = 0, dockWasOn = false, dockUserOpen = false;
  // 案内の 帯を 小さく（1行）する かどうか。家や 画面を 広く 見たい とき（この パソコンで おぼえる）
  //   きめていない ときは、ページを 下へ スクロールしたら 小さく・上に もどったら 大きく
  let scrolledDown = false;
  function barMini(v){
    let pref = null;
    try{ pref = localStorage.getItem('chappy_tut_mini'); }catch(e){}
    if(v === undefined) return pref === '1' || (pref !== '0' && scrolledDown);
    try{ localStorage.setItem('chappy_tut_mini', v ? '1' : '0'); }catch(e){}
    return !!v;
  }
  window.addEventListener('scroll', () => {
    const y = window.scrollY || 0, d = scrolledDown ? y > 60 : y > 160;   // 行ったり 来たり しないように 少し はばを もたせる
    if(d !== scrolledDown && bar){ scrolledDown = d; lastKey = ''; tick(); }
  }, { passive:true });
  function closeHouse(){ return false; }        // 家は いつも 見えて いる（右下の 小さい 窓は 使わない）
  function dockManage(){}
  function start(){
    document.body.classList.add('tut', 'tut-' + MODE);
    const main = document.querySelector('main'); if(!main) return;
    // おまかせの とちゅうで 読みこみなおしたら、はじめから（見せる ものなので）
    { const s0 = load(); if(s0.auto && !s0.finished && s0.autoFrom == null){ reset(); } }   // 章へ とんだ ときは そのまま
    bar = document.createElement('div'); bar.className = 'tut-bar';
    const tb = main.querySelector('.trial-bar');
    if(tb) tb.insertAdjacentElement('afterend', bar); else main.insertBefore(bar, main.firstChild);
    bar.addEventListener('click', e => {
      const b = e.target.closest('[data-tut]'); if(!b) return;
      const k = b.dataset.tut;
      if(k === 'chap' || k === 'chprev' || k === 'chnext'){
        const cur = chapOf((MODE === 'req' ? reqStep(load()) : {}).id), to = k === 'chap' ? +b.dataset.k : cur + (k === 'chprev' ? -1 : 1);
        if(to >= 0 && to < CHAPS.length) uiAsk((to < cur ? '「' + CHAPS[to] + '」に もどります。' : '「' + CHAPS[to] + '」へ とびます。') + (AUTO.on ? '（おまかせで つづけます）' : ''), to < cur ? '◀ もどる' : 'とばす ▶', 'やめる').then(ok => { if(ok) gotoChap(to); });
        return;
      }
      if(k === 'reset'){ uiAsk('チュートリアルを はじめから やりなおしますか？', '↺ はじめから', 'やめる').then(ok => { if(ok){ AUTO.on = false; reset(); location.reload(); } }); return; }
      if(k === 'help'){ helpModal(); return; }
      if(k === 'mini'){ barMini(!barMini()); lastKey = ''; tick(); return; }
      if(k === 'apause'){ autoPause(!AUTO.paused); return; }
      if(k === 'manual'){ stopAuto(); return; }
      if(k === 'voice'){ if(window.ChappyVoice){ const v = !ChappyVoice.on(); ChappyVoice.set(v); if(v) ChappyVoice.speak('n', '声で 説明します', true); } lastKey = ''; tick(); return; }
      if(goFn) goFn();
    });
    document.addEventListener('keydown', e => { if(e.key === 'Escape' && modalEl && !modalEl.querySelector('[data-tm^="c"]')) closeModal(); });
    setTimeout(() => {
      tick(); setInterval(tick, 1000);
      const s1 = load();
      if(s1.autoFrom != null){ const k = s1.autoFrom; delete s1.autoFrom; save(s1); startAuto(k); return; }
      if(!s1.modeChosen) modeModal();
      else if(AUTO_Q && !s1.finished) startAuto();
    }, 600);
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
