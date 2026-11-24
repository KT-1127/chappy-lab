/* ⑤ チームで開発 体験版：サーバーの代わり（このブラウザの中だけで動く）
   ・あなたは「1班」。相手の「2班」（みらい・そら）は コンピュータが うごかす
       - 2班の 依頼（佐藤 マサルさん：💊 薬の 飲み忘れ／大事に したい：安心・静か）は はじめから とどいている → あなたが 開発する
       - あなたが 依頼を 出すと、2班が 作って 送ってくる。1回目は 困りごとは 解決するが 気持ちメーターが 下がる 作り（折り合いが わるい）
         → レビューを 返すと 2回目で ちょうど よい 作りに 直す
       - あなたが 提出すると、2班が 家で ためした 結果（困りごとが 解決したか・気持ちメーター）を もとに レビューを 返す（「合格」とは 言わない）
   ・生成AIは 使わない。実機（チャッピー）には 送れない
   ・記録は この ブラウザの localStorage（chappy_trial5）だけに のこる。授業の サーバーとは 関係ない
   make_trial_team.py が team.html / teamdev.html の いちばん 上で 読みこませる */
(function(){
  'use strict';
  var KEY = 'chappy_trial5', CLS = '体験版', ME = 'あなた', VER = 2, ISSUE_MAX = 1;   // VER：記録の 形（かわったら はじめから）
  var A = 'tA', B = 'tB', BMEM = ['みらい', 'そら'];
  var DELAY = { chat:4, submit:20, fix:20, review:12 };      // 2班が 動くまでの 秒
  var RV_GOOD = '👍 よかった ところ：', RV_MORE = '💡 こうすると もっと よく なる：';
  var CRIT = [['help', '困りごとを助けてくれる'], ['easy', '説明だけで使い方がわかる'], ['fit', 'この人のくらし・気持ちに合っている']];
  var PKEYS = ['name', 'age', 'life', 'history', 'likes', 'tone', 'trouble', 'day', 'avoid', 'traits'];
  var SCHED_ACT = { go:'へ行く', sit:'ソファにすわる', eat:'台所で食べる', out:'そとへ出る', home:'家に帰る', sleep:'ねる', wake:'おきる' };

  window.CHAPPY_TRIAL = true;
  window.CHAPPY_TRIAL_RESET = function(){
    try{
      Object.keys(localStorage).forEach(function(k){ if(k === KEY || k.indexOf(CLS) >= 0) localStorage.removeItem(k); });
    }catch(e){}
  };
  try{ sessionStorage.setItem('chappy_student', JSON.stringify({ cls:CLS, name:ME })); }catch(e){}

  function now(){ return Date.now() / 1000; }
  function J(x){ return Promise.resolve(new Response(JSON.stringify(x), { headers:{ 'Content-Type':'application/json' } })); }
  function cp(x){ return x == null ? x : JSON.parse(JSON.stringify(x)); }
  function str(v, n){ return String(v == null ? '' : v).trim().slice(0, n || 400); }
  function q(url, k){ var m = new RegExp('[?&]' + k + '=([^&]*)').exec(url); return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : ''; }
  function TC(){ return window.TeamCheck; }
  function hhmm(m){ return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); }
  function dayText(s){
    return (s || []).map(function(e){
      var what = e.act === 'go' ? (e.room || '') + SCHED_ACT.go : (SCHED_ACT[e.act] || e.act) + (e.room && e.act !== 'eat' ? '（' + e.room + '）' : '');
      var key = e.act === 'out' ? (e.lock === 'open' ? '・かぎを かけない' : '・かぎを かける') : e.act === 'home' ? '・かぎを かける' : '';
      return hhmm(e.m) + ' ' + what + key;
    }).join('\n');
  }

  // ---------- 記録 ----------
  function fresh(){
    var t0 = now(), st = { v:VER, made:t0, teams:{}, jobs:{}, chat:{}, pending:[] };
    st.teams[A] = { id:A, no:1, members:[ME], persona:{}, personaHistory:[] };
    st.teams[B] = { id:B, no:2, members:BMEM.slice(), persona:{}, personaHistory:[] };
    st.chat[A] = [];
    st.chat[B] = [];
    var r = bRequest(t0 - 600);
    if(r){
      st.teams[B].persona = r.persona;
      st.jobs[B] = { id:B, from:B, to:A, made:t0 - 600, events:[{ type:'request', by:BMEM[0], time:t0 - 600, persona:cp(r.persona), request:r.request, version:1 }],
                     draft:null, draftHistory:[] };
      st.chat[B].push({ by:BMEM[0], time:t0 - 590, side:'req', text:'依頼を 送りました！マサルさんは 薬を 飲み忘れて しまうんだ。どう 助けるかは まかせるね。大事に したいのは 安心と 静かさだよ' });
    }
    return st;
  }
  // 2班の 依頼：佐藤 マサルさん（95さい・忘れっぽい・テレビが 好き）の 💊 薬の 飲み忘れ。大事に したい こと：安心・静か
  function bRequest(t){
    if(!TC()) return null;
    var b = TC().buildPlan({ issues:['medicine'], med:480, care:['anshin', 'shizuka'] });
    var persona = { name:'佐藤 マサル', age:'95さい。一人ぐらし', life:TC().profLife('forget,tv', '95さい') + '。むすめは となり町に すんでいて、週に1回 来てくれる',
      history:'むかしは 大工さん。家の ことは なるべく 自分で したい。', likes:'囲碁', tone:'のんびり、やさしい 話し方',
      trouble:b.help, day:dayText(b.schedule), avoid:'', traits:'forget,tv',
      face:{ hairStyle:1, hair:1, skin:1, brows:0, nose:3, eyes:0, face:3, mouth:0 },
      schedule:b.schedule, scheduleBy:BMEM[0], scheduleAt:t, plan:b.plan, updatedBy:BMEM[0], updatedAt:t };
    return { persona:persona, request:{ help:b.help, want:b.want, avoid:'', criteria:b.criteria } };
  }
  function load(){
    var st = null;
    try{ st = JSON.parse(localStorage.getItem(KEY) || 'null'); }catch(e){ st = null; }
    if(!st || st.v !== VER){ st = fresh(); save(st); }   // 前の 形の 記録は はじめから
    else if(!st.jobs[B] && TC()){                          // はじめは TeamCheck が まだ なかった とき
      var r = bRequest(now() - 600);
      if(r){
        st.teams[B].persona = r.persona;
        st.jobs[B] = { id:B, from:B, to:A, made:now() - 600, events:[{ type:'request', by:BMEM[0], time:now() - 600, persona:cp(r.persona), request:r.request, version:1 }], draft:null, draftHistory:[] };
        if(!st.chat[B].length) st.chat[B].push({ by:BMEM[0], time:now(), side:'req', text:'依頼を 送りました！マサルさんを 助けてあげてね' });
        save(st);
      }
    }
    return st;
  }
  function save(st){ try{ localStorage.setItem(KEY, JSON.stringify(st)); }catch(e){} }

  // ---------- サーバーと 同じ 形で 返す ----------
  function label(st, id){ var t = st.teams[id]; return t ? t.no + '班' : ''; }
  function route(id){ return id === A ? B : A; }
  function jobState(job){
    var req = null, sub = null, rev = null;
    (job.events || []).forEach(function(ev){
      if(ev.type === 'request') req = ev;
      else if(ev.type === 'submit'){ sub = ev; rev = null; }
      else if(ev.type === 'review') rev = ev;
    });
    return { req:req, sub:sub, rev:rev };
  }
  function jobView(st, job, light){
    var s = jobState(job), evs = job.events || [];
    if(light) evs = evs.map(function(e){ var o = {}; Object.keys(e).forEach(function(k){ if(k !== 'program' && k !== 'workspace') o[k] = e[k]; }); return o; });
    var rd = job.reviewDraft;
    return { id:job.id, from:job.from, to:job.to, made:job.made || 0, fromLabel:label(st, job.from), toLabel:label(st, job.to),
             fromMembers:st.teams[job.from].members, toMembers:st.teams[job.to].members,
             request:s.req, submission:s.sub, review:s.rev, draft:job.draft, events:evs,
             reviewDraft:(s.sub && !s.rev && rd && rd.for === s.sub.version) ? rd : null };
  }
  function threadView(st, rid){
    return { id:rid, fromLabel:label(st, rid), toLabel:label(st, route(rid)), fromMembers:st.teams[rid].members,
             toMembers:st.teams[route(rid)].members, messages:(st.chat[rid] || []).slice(-300) };
  }
  function teamView(st){
    var me = st.teams[A];
    return { ok:true, enabled:true, inTeam:true, me:ME, trial:true,
             chats:[threadView(st, A), threadView(st, B)], chatSlow:false, issueMax:ISSUE_MAX, rounds:0,
             team:{ id:A, label:'1班', members:me.members },
             persona:me.persona || {},
             personaHistory:(me.personaHistory || []).map(function(h){ return { by:h.by, time:h.time, name:(h.persona || {}).name }; }),
             routeTo:{ id:B, label:'2班', members:st.teams[B].members },
             developFor:[{ id:B, label:'2班', members:st.teams[B].members }],
             outgoing:st.jobs[A] ? jobView(st, st.jobs[A], true) : null,
             incoming:st.jobs[B] ? [jobView(st, st.jobs[B], true)] : [] };
  }

  // ---------- 2班（コンピュータ）の うごき ----------
  function later(st, sec, kind, data){ st.pending.push({ at:now() + sec, kind:kind, data:data || {} }); }
  function say(st, thread, text, who){
    st.chat[thread].push({ by:who || BMEM[thread === A ? 0 : 1], time:now(), side:thread === A ? 'dev' : 'req', text:text });
  }
  function issuesOf(job){ var s = jobState(job); return ((((s.req || {}).persona || {}).plan || {}).issues) || []; }
  function issueTitle(k){ var I = (TC().ISSUES || []).filter(function(x){ return x.k === k; })[0]; return I ? I.icon + ' ' + I.title : k; }
  function IFP(cond, then, els){ return { type:'if', condition:cond, then:then, else:els || [] }; }
  function S(k, v, op){ return { sensor:k, op:op || '==', value:v }; }
  // 1回目：困りごとは 解決するが、気持ちメーターが 下がる 作り（折り合いが わるい）。2回目：ちょうど よい 作り
  function flawActs(c){
    if(c.trig === 'time' && c.res === 'medicine'){ var f = TC().toMin(c.from) || 480; return [IFP(S('hour', Math.floor(f / 60), '>='), [{ type:'speak', value:'薬を 飲む 時間ですよ' }])]; }   // 「8時に なったら」の つもりが「8時 いこう ずっと」→ 一日中・夜まで 言う → 静か↓
    if(c.trig === 'intruder') return [IFP(S('pir', true), [{ type:'speak', value:'だれですか！ 警察を よびますよ' }])];   // 家に いる おじいさんにも 言う → 安心↓
    if(c.trig === 'hot') return [{ type:'fan', value:true }];                                                          // ファン つけっぱなし → 節電↓
    if(c.trig === 'night_walk') return [{ type:'room_light', room:'足元', value:true }];                                 // 足元ライト つけっぱなし → 節電↓
    if(c.trig === 'foot_empty') return [];
    return TC().sampleProgram([c]).actions[0].actions;                                                                 // 電気は 見本の まま（くりかえし 声を かける）
  }
  function devProgram(job, fixed){
    var s = jobState(job), list = ((s.req.request || {}).criteria || {}).list || [], iss = issuesOf(job), acts = [];
    list.forEach(function(c){
      var c2 = c.trig === 'hot' ? Object.assign({}, c, { act:'fan', res:'none' }) : c;
      acts = acts.concat(fixed ? TC().sampleProgram([c2]).actions[0].actions : flawActs(c2));
    });
    if(iss.indexOf('lonely') >= 0) acts.push(fixed ? IFP(S('button_red', true), [{ type:'ai', value:'やさしく 話を 聞く。好きな ことの 話を する' }]) : { type:'ai', value:'やさしく 話を 聞く' });   // さみしい：1回目は ずっと 話しかける
    return { actions:[{ type:'forever', actions:acts }] };
  }
  function devDesc(job, fixed){
    var iss = issuesOf(job);
    var how = { medicine:'薬の 時間に なったら「薬を 飲む 時間ですよ」と 声を かけます', intruder:'知らない人が 入ってきたら「だれですか！」と 大きな 声を 出します',
                heat:'暑く なったら ファンを まわします', light:'だれも いない 部屋の 電気が ついて いたら、知らせます', toilet:'夜中に 歩くと、足元ライトが つきます',
                lonely:'おじいさんが ボタンを おしたら、AIで おはなし します' };
    var flaw = { medicine:'薬の 時間に なったら「薬を 飲む 時間ですよ」と 声を かけます', intruder:'家に 人が いたら「だれですか！」と 言います',
                 heat:'ファンは ずっと まわして います', toilet:'足元ライトは ずっと つけて います', lonely:'ずっと AIで 話しかけます', light:'電気が ついて いたら 声を かけつづけます' };
    return (fixed ? 'レビューの 💡 を 読んで 直しました！\n' : '') + iss.map(function(k){ return '・' + (fixed ? how[k] : flaw[k] || how[k]); }).join('\n') + '\n・止めたい ときは：チャッピーの 電源を 切ります';
  }
  // あなたの 依頼に こたえて 2班が 作る（1回目は 折り合いの わるい 作り・2回目から ちょうど よい 作り）
  function devSubmit(st, full){
    var job = st.jobs[A]; if(!job) return;
    var ver = job.events.filter(function(e){ return e.type === 'submit'; }).length + 1, fixed = !!full || ver > 1;
    var ev = { type:'submit', by:BMEM[ver % 2], time:now(), program:devProgram(job, fixed), workspace:null,
               description:devDesc(job, fixed), steps:'', checks:null, version:ver, trialBot:true };
    job.events.push(ev);
    job.draft = { by:ev.by, time:ev.time, program:ev.program, workspace:null, description:ev.description, steps:'' };
    say(st, A, ver === 1 ? 'できました！ 家で 再現して、おじいさんの ようすと 気持ちメーターを 見てから レビューしてね'
                         : 'レビューの 💡 を 読んで 直して ' + ver + '回目を 送りました！ もう一度 家で 再現して、1回目と くらべてみてね', ev.by);
  }
  // あなたの 提出に 2班が レビューを 返す（家で 困りごとが 解決したか ＋ 大事に したい こと の 気持ちメーター。合格とは 言わない）
  var CARE_JA = { anshin:'😊 安心', shizuka:'🤫 静か', privacy:'🙈 プライバシー', setsuden:'🌱 節電' };
  function reqReview(st){
    var job = st.jobs[B]; if(!job) return;
    var s = jobState(job); if(!s.sub || s.rev) return;
    var oc = s.sub.outcome, iss = issuesOf(job), care = ((((s.req.persona || {}).plan) || {}).care) || [];
    var tr = function(k){ return ((oc && oc.trouble) || {})[k] || 0; }, sv = function(k){ return ((oc && oc.solved) || {})[k] || 0; };
    var reached = !!oc && (!!oc.dayEnd || iss.some(function(k){ return tr(k) > 0; }));
    var checks = iss.map(function(k){
      var ok = reached && sv(k) >= tr(k);
      return { ok:ok, label:issueTitle(k), why:!oc ? '家で 一日 ためした 結果が ついて いなかった' : !reached ? '一日の とちゅうまでしか ためして いなかった'
        : ok ? (tr(k) ? '困りごとが おきても、チャッピーの おかげで 解決した' : '家で 再現したら、困りごとが おきなかった') : '家で 再現したら、困りごとが 解決して いなかった' };
    });
    var m = (oc && oc.meter) || null, low = care.filter(function(k){ return m && m[k] != null && m[k] < 70; });
    var allOk = checks.length && checks.every(function(c){ return c.ok; });
    var desc = String(s.sub.description || '');
    var stars = { help:allOk ? 3 : checks.some(function(c){ return c.ok; }) ? 2 : 1, easy:desc.length >= 40 ? 3 : desc.length >= 20 ? 2 : 1,
                  fit:!m ? 2 : low.length ? (low.some(function(k){ return m[k] < 50; }) ? 1 : 2) : 3 };
    var good = [], more = [];
    good.push(allOk ? 'マサルさんの 困りごとが 解決して いた！' : '作って くれて ありがとう！');
    if(m && care.length && !low.length) good.push('大事に したい ' + care.map(function(k){ return CARE_JA[k]; }).join('・') + ' も 下がって いなかった');
    checks.forEach(function(c){ if(!c.ok) more.push(c.label + '：' + c.why + '。家の 画面で その 時刻を 見てみてね'); });
    low.forEach(function(k){ more.push(CARE_JA[k] + ' が ' + Math.round(m[k]) + ' まで 下がって いたよ。困りごとを 助けながら、' + (k === 'shizuka' ? '声を かける 回数や 時間を' : k === 'setsuden' ? 'つけっぱなしの 時間を' : k === 'privacy' ? 'カメラを つける 時間を' : 'おじいさんの 気持ちを') + ' 考えて ほしいな'); });
    if(!m) more.push('気持ちメーターも 見て みてね。家で 一日 さいごまで ためすと わかるよ');
    if(stars.easy < 3) more.push('説明書に「いつ・何を すると・どう なるか」を もう少し くわしく 書いてほしいな');
    if(!more.length) more.push('マサルさんの くらしに もっと 合う ように できる ところが ないか、気持ちメーターを 見ながら 考えて みてね');
    var ev = { type:'review', by:BMEM[1], time:now(), checks:checks, submitVersion:s.sub.version, trialBot:true,
               scores:CRIT.map(function(c){ return { k:c[0], label:c[1], stars:stars[c[0]] }; }),
               reason:RV_GOOD + good.join('。') + '\n' + RV_MORE + more.join('\n') };
    job.events.push(ev);
    say(st, B, 'レビューを 返したよ。よかった ところと 💡 を 読んでね', BMEM[1]);
  }
  function process(st){
    var due = st.pending.filter(function(p){ return p.at <= now(); });
    if(!due.length) return false;
    st.pending = st.pending.filter(function(p){ return p.at > now(); });
    due.forEach(function(p){
      try{
        if(p.kind === 'chat') say(st, p.data.thread, p.data.text, p.data.who);
        else if(p.kind === 'devSubmit') devSubmit(st, !!p.data.full);
        else if(p.kind === 'reqReview') reqReview(st);
      }catch(e){ if(window.console) console.warn('体験版の 2班:', e); }
    });
    return true;
  }
  function cancel(st, kinds){ st.pending = st.pending.filter(function(p){ return kinds.indexOf(p.kind) < 0; }); }

  // ---------- 受けつけ（サーバーの /api/team… と 同じ 名前と 返事） ----------
  function handle(url, b){
    var st = load();
    if(process(st)) save(st);
    var path = url.replace(/^[^?]*?(\/api\/[^?]*).*$/, '$1');
    var me = st.teams[A];
    if(path === '/api/team') return teamView(st);
    if(path === '/api/team/submission'){
      var jb = st.jobs[q(url, 'job')], ver = Number(q(url, 'version')) || 0;
      var ev = jb && jb.events.filter(function(e){ return e.type === 'submit' && e.version === ver; })[0];
      return ev ? { ok:true, version:ver, by:ev.by, time:ev.time, description:ev.description, workspace:ev.workspace, program:ev.program }
                : { ok:false, msg:'その提出が見つかりません' };
    }
    if(path === '/api/team/persona'){
      var src = b.persona && typeof b.persona === 'object' ? b.persona : {}, per = {};
      PKEYS.forEach(function(k){ per[k] = str(src[k]); });
      per.name = per.name.slice(0, 30);
      if(!per.name) return { ok:false, msg:'名前を決めよう' };
      per.face = {};
      ['hairStyle', 'eyes', 'brows', 'nose', 'mouth', 'face', 'skin', 'hair'].forEach(function(k){ per.face[k] = Math.max(0, Math.min(20, parseInt((src.face || {})[k], 10) || 0)); });
      per.updatedBy = ME; per.updatedAt = now();
      var old = me.persona || {};
      if(old.schedule){ per.schedule = old.schedule; per.scheduleBy = old.scheduleBy || ''; per.scheduleAt = old.scheduleAt || 0; }
      if(old.plan) per.plan = old.plan;
      me.persona = per;
      me.personaHistory.push({ by:ME, time:per.updatedAt, persona:cp(per) });
      if(me.personaHistory.length > 40) me.personaHistory.splice(0, me.personaHistory.length - 40);
      save(st);
      return { ok:true, persona:per };
    }
    if(path === '/api/team/schedule'){
      var p = me.persona || {};
      if(!p.name) return { ok:false, msg:'先にペルソナをつくって保存しよう' };
      var sc = Array.isArray(b.schedule) ? b.schedule.filter(function(e){ return e && typeof e === 'object'; }).slice(0, 40) : [];
      if(!sc.length) return { ok:false, msg:'予定が ありません' };
      sc = sc.map(function(e){ var o = cp(e); o.m = ((Math.round(Number(o.m) || 0) % 1440) + 1440) % 1440; return o; }).sort(function(x, y){ return x.m - y.m; });
      p.schedule = sc; p.scheduleBy = ME; p.scheduleAt = now();
      if(b.plan && typeof b.plan === 'object'){ p.plan = cp(b.plan); p.plan.issues = (p.plan.issues || []).slice(0, ISSUE_MAX); }   // 困りごとは 決めた 数まで
      if(typeof b.dayText === 'string') p.day = str(b.dayText);
      if(typeof b.troubleText === 'string') p.trouble = str(b.troubleText);
      if(typeof b.avoidText === 'string') p.avoid = str(b.avoidText);
      save(st);
      return { ok:true, schedule:sc, msg:'保存しました' };
    }
    if(path === '/api/team/request'){
      var pr = me.persona || {};
      if(!pr.name) return { ok:false, msg:'先にペルソナをつくって保存しよう' };
      var rq = { help:str(b.help), want:str(b.want), avoid:str(b.avoid) };
      if(!rq.help) return { ok:false, msg:'「助けてほしいこと」を書いてね' };
      var cr = b.criteria && typeof b.criteria === 'object' ? cp(b.criteria) : {};
      rq.criteria = { list:(cr.list || []).slice(0, 6), donts:(cr.donts || []).slice(0, 2) };
      if(!rq.criteria.list.length && !(((pr.plan || {}).issues) || []).length) return { ok:false, msg:'② で、依頼する 困りごとを 選んで 保存しよう' };
      var job = st.jobs[A], t = now();
      if(!job) job = st.jobs[A] = { id:A, from:A, to:B, made:t, events:[], draft:null, draftHistory:[] };
      var hadSub = job.events.some(function(e){ return e.type === 'submit'; });
      job.events.push({ type:'request', by:ME, time:t, persona:cp(pr), request:rq,
                        version:job.events.filter(function(e){ return e.type === 'request'; }).length + 1 });
      cancel(st, ['devSubmit']);
      later(st, DELAY.chat, 'chat', { thread:A, text:hadSub ? '新しい 依頼を 見ました。作りなおします！' : '依頼 見ました！これから 作ります 💪（20秒ほど 待ってね）', who:BMEM[0] });
      later(st, DELAY.submit, 'devSubmit', { full:hadSub });
      save(st);
      return { ok:true, to:'2班' };
    }
    if(path === '/api/team/draft' || path === '/api/team/submit'){
      var jd = st.jobs[b.job];
      if(!jd || jd.to !== A) return { ok:false, msg:'届いた依頼が見つかりません' };
      var prog = b.program && typeof b.program === 'object' ? b.program : {};
      if(!(prog.actions || []).length && !(prog.threads || []).length) return { ok:false, msg:'ブロックが ありません' };
      var desc = str(b.description, 500), tt = now();
      if(path === '/api/team/draft'){
        jd.draft = { by:ME, time:tt, program:prog, workspace:b.workspace || null, description:desc, steps:'' };
        jd.draftHistory.push({ by:ME, time:tt, description:desc, steps:'' });
        save(st);
        return { ok:true, draft:{ by:ME, time:tt, workspace:b.workspace || null, description:desc, steps:'' } };
      }
      if(desc.length < 10) return { ok:false, msg:'どんなプログラムか「動作の説明」をくわしく書いてね' };
      var ev2 = { type:'submit', by:ME, time:tt, program:prog, workspace:b.workspace || null, description:desc, steps:'',
                  checks:b.checks && typeof b.checks === 'object' ? cp(b.checks) : null, outcome:b.outcome && typeof b.outcome === 'object' ? cp(b.outcome) : null,
                  version:jd.events.filter(function(e){ return e.type === 'submit'; }).length + 1 };
      jd.events.push(ev2);
      jd.draft = { by:ME, time:tt, program:prog, workspace:ev2.workspace, description:desc, steps:'' };
      cancel(st, ['reqReview']);
      later(st, DELAY.chat, 'chat', { thread:B, text:'とどいたよ！これから 家で 再現して みるね（10秒ほど 待ってね）', who:BMEM[1] });
      later(st, DELAY.review, 'reqReview');
      save(st);
      return { ok:true, version:ev2.version, to:'2班' };
    }
    if(path === '/api/team/review_draft' || path === '/api/team/review'){
      var jr = st.jobs[A];
      if(!jr) return { ok:false, msg:'まだ依頼に出していません' };
      var s = jobState(jr);
      if(!s.sub) return { ok:false, msg:'開発チームからの提出が まだ届いていません' };
      if(s.rev) return { ok:false, already:true, msg:'この提出には もう レビューを返しました。つぎの提出を待とう' };
      var got = b.scores && typeof b.scores === 'object' ? b.scores : {};
      var n = (((s.req.request || {}).criteria || {}).list || []).length + (((s.req.request || {}).criteria || {}).donts || []).length;
      var checks = [];
      for(var i = 0; i < n; i++){
        var x = (Array.isArray(b.checks) && b.checks[i]) || {};
        checks.push({ ok:x.ok === true || x.ok === false ? x.ok : null, why:str(x.why, 200), label:str(x.label, 200) });
      }
      if(path === '/api/team/review_draft'){
        var sc2 = {};
        CRIT.forEach(function(c){ var v = parseInt(got[c[0]], 10) || 0; sc2[c[0]] = v >= 0 && v <= 3 ? v : 0; });
        jr.reviewDraft = { for:s.sub.version, scores:sc2, checks:checks, reason:str(b.reason, 800), by:ME, time:now() };
        save(st);
        return { ok:true, reviewDraft:jr.reviewDraft };
      }
      var scores = [];
      for(var k = 0; k < CRIT.length; k++){
        var v2 = parseInt(got[CRIT[k][0]], 10) || 0;
        if(v2 < 1 || v2 > 3) return { ok:false, msg:'「' + CRIT[k][1] + '」の★をえらんでね' };
        scores.push({ k:CRIT[k][0], label:CRIT[k][1], stars:v2 });
      }
      var reason = str(b.reason, 800);
      if(!reason) return { ok:false, msg:'理由を書いてね' };
      if(checks.some(function(c){ return c.ok === null; })) return { ok:false, msg:'依頼した ことごとに「できた」か「できていない」を えらんでね' };
      var rev = { type:'review', by:ME, time:now(), scores:scores, reason:reason, checks:checks, submitVersion:s.sub.version };
      jr.events.push(rev);
      delete jr.reviewDraft;
      // できていない・★2いか が あれば 直す（気持ちメーターの 💡 も ふくめて）。ぜんぶ よければ おしまい
      var allOk = checks.every(function(c){ return c.ok !== false; }) && scores.every(function(x){ return x.stars >= 3; });
      var nSub = jr.events.filter(function(e){ return e.type === 'submit'; }).length;
      if(allOk) later(st, DELAY.chat, 'chat', { thread:A, text:'レビュー ありがとう！ 💡 も あったら、つぎに いかすね。おじいさんが 助かると いいな', who:BMEM[0] });
      else if(nSub < 3){
        later(st, DELAY.chat, 'chat', { thread:A, text:'レビュー ありがとう！💡を 読んで 直すね（20秒ほど 待ってね）', who:BMEM[0] });
        later(st, DELAY.fix, 'devSubmit', { full:true });
      } else later(st, DELAY.chat, 'chat', { thread:A, text:'ごめんね、体験版の 2班は ここまでしか 直せないんだ…。ここまで 体験して くれて ありがとう！', who:BMEM[0] });
      save(st);
      return { ok:true, review:rev };
    }
    if(path === '/api/team/message'){
      var th = b.thread && b.thread !== A ? (b.thread === B ? B : null) : A;
      if(!th) return { ok:false, msg:'このやりとりには送れません' };
      var text = str(b.text);
      if(!text) return { ok:false, msg:'メッセージを書いてね' };
      var msg = { by:ME, time:now(), text:text, side:th === A ? 'req' : 'dev' };
      st.chat[th].push(msg);
      var ask = /[?？]/.test(text);
      later(st, DELAY.chat, 'chat', th === A
        ? { thread:A, who:BMEM[0], text:ask ? 'いい しつもん！説明書に 書いておくね' : 'メッセージ ありがとう！がんばります 💪' }
        : { thread:B, who:BMEM[1], text:ask ? 'いい しつもん！ マサルさんは 薬を 飲み忘れて しまうのと、静かに すごしたいんだ。家で 一日 ためして、気持ちメーターも 見てみてね' : 'ありがとう！マサルさんも よろこぶと 思う 😊' });
      save(st);
      return { ok:true, message:msg };
    }
    return null;
  }

  var realFetch = window.fetch ? window.fetch.bind(window) : null;
  window.fetch = function(u, o){
    var url = String(u && u.url ? u.url : u), body = {};
    try{ body = JSON.parse((o && o.body) || '{}'); }catch(e){ body = {}; }
    if(/\/api\/team(\/|\?|$)/.test(url)){
      var r = null;
      try{ r = handle(url, body); }catch(e){ r = { ok:false, msg:'体験版の エラー：' + e.message }; }
      return J(r || { ok:false, msg:'体験版では 使えません' });
    }
    if(/\/api\/classes/.test(url)) return J({ classes:[CLS] });
    if(/\/api\/login/.test(url)) return J({ ok:true, cls:CLS, name:ME });
    if(/\/api\/telemetry/.test(url)) return J({ ok:true, devices:[] });
    if(/\/deploy/.test(url)) return J({ ok:false, msg:'体験版では チャッピー（実機）に 送れません' });
    if(/\/api\//.test(url)) return J({ ok:false, msg:'体験版では 使えません' });
    return realFetch ? realFetch(u, o) : Promise.reject(new Error('no fetch'));
  };
})();
