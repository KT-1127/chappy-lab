/* ⑤チーム：合格条件（依頼者が 先に 決める）と、家の フィールドでの 判定
   ・合格条件 c = { trig, room, temp, from, to, act, res, rroom, within, note }
       「（from〜to に）きっかけ trig が おきたら、チャッピーが act して、within 分以内に res になる」
   ・しないでほしいこと d = { k, from, to, n, note }
   ・判定 evaluate(criteria, trace) … trace は 家の画面が 動かしている あいだに ためた できごと
   依頼者のページ・開発者のページ・家の画面で 同じものを 使う（サーバーの _clean_criteria と 同じ ことば） */
(function(global){
  'use strict';
  const ROOMS = ['寝室', '台所', '居間', '玄関'];
  // きっかけ（いつ・どんなとき）
  const TRIGGERS = [
    { k:'time',          label:'決めた時刻に なったら',            needFrom:true },
    { k:'lit_empty',     label:'電気がついていて、だれもいない（部屋）', room:true, state:true },
    { k:'unlocked',      label:'玄関の かぎが あいている',           state:true },
    { k:'unlocked_away', label:'出かけていて、かぎが あいている',     state:true },
    { k:'hot',           label:'温度が ○℃ 以上',                    temp:true, state:true },
    { k:'out',           label:'おじいさんが 出かけた' },
    { k:'home',          label:'おじいさんが 帰ってきた' },
    { k:'sleep',         label:'おじいさんが ねた' },
    { k:'intruder',      label:'知らない人が 来た' },
  ];
  // チャッピーが すること
  const ACTIONS = [
    { k:'any',          label:'（なんでも よい）' },
    { k:'speak',        label:'しゃべる',               te:'しゃべって' },
    { k:'mail_grandpa', label:'おじいさんに メールする', te:'おじいさんに メールして' },
    { k:'mail_family',  label:'孫に メールする',         te:'孫に メールして' },
    { k:'fan',          label:'ファンを まわす',         te:'ファンを まわして' },
    { k:'camera',       label:'カメラを つける',         te:'カメラを つけて' },
    { k:'light_off',    label:'自分で 電気を 消す',      te:'自分で 電気を 消して', hide:true },   // チャッピーは 電気を 消せない（前の 合格条件の ために 残す）
  ];
  // 結果（どうなったら 合格か）
  const RESULTS = [
    { k:'none',          label:'（チャッピーが すれば よい）' },
    { k:'light_off',     label:'電気が 消える（部屋）', room:true },
    { k:'locked',        label:'かぎが かかる' },
    { k:'medicine',      label:'おじいさんが 薬を のむ' },
    { k:'water',         label:'おじいさんが 水を のむ' },
    { k:'eat',           label:'おじいさんが ごはんを 食べる' },
    { k:'sleep',         label:'おじいさんが ねる' },
    { k:'intruder_gone', label:'知らない人が いなくなる' },
    { k:'mail_grandpa',  label:'おじいさんの スマホに とどく' },
    { k:'mail_family',   label:'孫の スマホに とどく' },
  ];
  // しないでほしいこと（判定できるもの）
  const DONTS = [
    { k:'quiet_night',    label:'○時〜○時は チャッピーが しゃべらない', time:true },
    { k:'no_wake',        label:'ねている おじいさんを 起こさない' },
    { k:'no_camera_home', label:'おじいさんが 家にいるときは カメラを つけない' },
    { k:'mail_limit',     label:'メールは 1日 ○通まで', n:true },
  ];
  const find = (list, k) => list.find(x => x.k === k) || null;
  const hm = m => { m = Math.floor(((m % 1440) + 1440) % 1440); return Math.floor(m / 60) + ':' + String(m % 60).padStart(2, '0'); };
  const toMin = s => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '')); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };

  // ---------- 文章にする ----------
  function trigText(c){
    const t = find(TRIGGERS, c.trig); if(!t) return '';
    if(c.trig === 'time') return (c.from || '○:○○') + 'に なったら';
    if(c.trig === 'lit_empty') return (c.room || '○○') + 'の電気が ついていて、' + (c.room || '○○') + 'に だれも いないとき';
    if(c.trig === 'hot') return '温度が ' + (c.temp || 30) + '℃ 以上の とき';
    return t.label.replace(/た$/, 'たら').replace(/いる$/, 'いるとき');
  }
  function resText(c){
    if(c.res === 'light_off') return (c.rroom || c.room || '○○') + 'の電気が 消える';
    const r = find(RESULTS, c.res); return r ? r.label : '';
  }
  // 「21:00〜23:00 に、居間の電気が ついていて、居間に だれも いないとき、チャッピーが しゃべって、30分以内に 居間の電気が 消える」
  function text(c){
    if(!c) return '';
    const win = c.trig !== 'time' && (c.from || c.to) ? (c.from || '') + '〜' + (c.to || '') + ' に、' : '';
    const A = c.act && c.act !== 'any' ? find(ACTIONS, c.act) : null;
    const res = c.res && c.res !== 'none' ? resText(c) : '';
    const within = c.within || 30;
    let s = win + trigText(c) + '、';
    if(A && res) s += 'チャッピーが ' + A.te + '、' + within + '分以内に ' + res;
    else if(A) s += within + '分以内に チャッピーが ' + A.label;
    else if(res) s += within + '分以内に ' + res;
    else s += '（何が おきれば よいか 決めていません）';
    return s;
  }
  function dontText(d){
    if(!d) return '';
    if(d.k === 'quiet_night') return (d.from || '22:00') + '〜' + (d.to || '6:00') + ' は チャッピーが しゃべらない';
    if(d.k === 'mail_limit') return 'メールは 1日 ' + (d.n || 3) + '通まで';
    const x = find(DONTS, d.k); return x ? x.label : '';
  }

  // ---------- 判定 ----------
  // 時間の わく（from〜to。日を またいでも よい）に 入っているか
  function inWin(t, from, to){
    const f = toMin(from), e = toMin(to);
    if(f == null && e == null) return true;
    const m = Math.floor(((t % 1440) + 1440) % 1440);
    if(f != null && e != null) return f <= e ? (m >= f && m <= e) : (m >= f || m <= e);
    return f != null ? m >= f : m <= e;
  }
  // 状態の きっかけの なまえ（家の画面が 毎フレーム 見る）
  function stateKey(c){
    if(c.trig === 'lit_empty') return 'lit_empty:' + (c.room || '居間');
    if(c.trig === 'hot') return 'hot:' + (c.temp || 30);
    if(c.trig === 'unlocked' || c.trig === 'unlocked_away') return c.trig;
    return null;
  }
  function stateKeys(cr){
    const out = new Set();
    ((cr && cr.list) || []).forEach(c => { const k = stateKey(c); if(k) out.add(k); });
    return [...out];
  }
  // きっかけが おきた 時刻の 一覧（{t, e}：e は 状態が おわった 時刻）
  function occurrences(c, tr){
    const out = [];
    if(c.trig === 'time'){
      const f = toMin(c.from); if(f == null) return out;
      let a = tr.from + (((f - tr.from) % 1440) + 1440) % 1440;
      if(a - tr.from < 0.001 && Math.floor(tr.from) % 1440 !== f) a += 1440;
      for(; a <= tr.now; a += 1440) out.push({ t:a });
      return out;
    }
    const sk = stateKey(c);
    if(sk) return ((tr.edges || {})[sk] || []).filter(o => inWin(o.t, c.from, c.to));
    const evType = { out:'out', home:'home', sleep:'sleep', intruder:'intruder' }[c.trig];
    tr.events.forEach(ev => {
      if(ev.type === 'gp' && ev.what === evType && evType !== 'intruder' && inWin(ev.t, c.from, c.to)) out.push({ t:ev.t });
      if(evType === 'intruder' && ev.type === 'intruder' && (ev.what === 'enter' || ev.what === 'blocked') && inWin(ev.t, c.from, c.to)) out.push({ t:ev.t });
    });
    return out;
  }
  function actMatch(c, ev){
    switch(c.act){
      case 'speak':        return ev.type === 'speak';
      case 'mail_grandpa': return ev.type === 'mail' && ev.to === 'grandpa';
      case 'mail_family':  return ev.type === 'mail' && ev.to === 'family';
      case 'fan':          return ev.type === 'fan' && ev.on;
      case 'camera':       return ev.type === 'camera' && ev.on;
      case 'light_off':    return ev.type === 'light' && !ev.on && ev.who === 'block' && (!c.room || c.trig !== 'lit_empty' || ev.room === c.room);
    }
    return false;
  }
  function resMatch(c, ev){
    switch(c.res){
      case 'light_off':     return ev.type === 'light' && !ev.on && ev.room === (c.rroom || c.room || '居間');
      case 'locked':        return ev.type === 'lock' && ev.on;
      case 'medicine': case 'water': case 'eat': case 'sleep':
                            return ev.type === 'gp' && ev.what === c.res;
      case 'intruder_gone': return ev.type === 'intruder' && (ev.what === 'flee' || ev.what === 'leave' || ev.what === 'blocked');
      case 'mail_grandpa':  return ev.type === 'mail' && ev.to === 'grandpa';
      case 'mail_family':   return ev.type === 'mail' && ev.to === 'family';
    }
    return false;
  }
  function evLine(ev){
    const t = hm(ev.t) + '　';
    switch(ev.type){
      case 'speak':  return t + '🤖 チャッピー「' + ev.text + '」';
      case 'mail':   return t + '📧 ' + (ev.to === 'grandpa' ? 'おじいさん' : '孫') + 'の スマホに「' + ev.text + '」';
      case 'fan':    return t + '🌀 ファンを ' + (ev.on ? 'まわした' : 'とめた');
      case 'camera': return t + '📷 カメラを ' + (ev.on ? 'つけた' : 'けした');
      case 'light':  return t + '💡 ' + ev.room + 'の電気が ' + (ev.on ? 'ついた' : '消えた') + (ev.who === 'block' ? '（チャッピー）' : '（おじいさん）');
      case 'lock':   return t + (ev.on ? '🔒 かぎが かかった' : '🔓 かぎが あいた');
      case 'gp':     return t + '👴 おじいさんが ' + ({ medicine:'薬を のんだ', water:'水を のんだ', eat:'ごはんを 食べた', sleep:'ねた', out:'出かけた', home:'帰ってきた' }[ev.what] || ev.what);
      case 'intruder': return t + '🕵 知らない人が ' + ({ enter:'入ってきた', blocked:'ドアを ためしたが 入れなかった', flee:'にげていった', leave:'出ていった' }[ev.what] || ev.what);
      case 'woken':  return t + '😪 ねている おじいさんが 起きた';
      case 'camera_home': return t + '📷 おじいさんが 家にいるのに カメラが ついている';
    }
    return t + ev.type;
  }
  // 1つの 合格条件を 判定する → { status:'ok'|'ng'|'wait'|'none', n, okN, lines }
  function judge(c, tr){
    const occ = occurrences(c, tr);
    const within = Math.max(1, Number(c.within) || 30);
    let okN = 0, ngN = 0, waitN = 0, lines = [], shown = false;
    occ.forEach(o => {
      const end = o.t + within;
      const evs = tr.events.filter(ev => ev.t >= o.t - 0.5 && ev.t <= end);
      const aEv = c.act && c.act !== 'any' ? evs.find(ev => actMatch(c, ev)) : null;
      const rEv = c.res && c.res !== 'none' ? evs.find(ev => resMatch(c, ev)) : null;
      const needA = c.act && c.act !== 'any', needR = c.res && c.res !== 'none';
      const done = (!needA || aEv) && (!needR || rEv);
      let st;
      if(done) st = 'ok';
      else if(o.e != null && o.e < end && !(needR && rEv)) st = 'skip';        // 状態が ほかの 理由で おわった（人が もどった など）→ 数えない
      else if(tr.now < end) st = 'wait';
      else st = 'ng';
      if(st === 'skip') return;
      if(st === 'ok') okN++; else if(st === 'ng') ngN++; else waitN++;
      // 根拠：ng を いちばんに、なければ いちばん あたらしい ものを 出す
      if(!shown || st === 'ng'){
        shown = st === 'ng';
        lines = [hm(o.t) + '　⚡ きっかけ：' + trigText(c)];
        if(needA) lines.push(aEv ? evLine(aEv) : '　　✖ ' + hm(end) + ' までに チャッピーが ' + find(ACTIONS, c.act).label + ' ことは なかった');
        if(needR) lines.push(rEv ? evLine(rEv) : (st === 'wait' ? '　　⏳ ' + hm(end) + ' までに ' + resText(c) + 'か 見ています' : '　　✖ ' + hm(end) + ' までに ' + resText(c) + 'ことは なかった'));
      }
    });
    const n = okN + ngN + waitN;
    const status = ngN ? 'ng' : waitN ? 'wait' : okN ? 'ok' : 'none';
    // かぎ：出かける ときに チャッピーが 知らせて すぐ かかった ＝ 困りごとを 先に ふせげた（「出かけていて あいている」が おきない）
    if(status === 'none' && c.trig === 'unlocked_away'){
      const saved = tr.events.find(o => o.type === 'gp' && o.what === 'out' && tr.events.some(ev => ev.type === 'lock' && ev.on && Math.abs(ev.t - o.t) <= 20));
      if(saved) return { status:'ok', n:1, okN:1, lines:[hm(saved.t) + '　🔒 出かける ときに かぎが かかった（困りごとを 先に ふせげた）'] };
    }
    if(status === 'none') lines = ['ためした あいだに、きっかけ（' + trigText(c) + '）は おきませんでした'];
    return { status, n, okN, lines };
  }
  function judgeDont(d, tr){
    let bad = [], covered = true;
    const evs = tr.events;
    if(d.k === 'quiet_night'){
      const from = d.from || '22:00', to = d.to || '6:00';
      bad = evs.filter(ev => ev.type === 'speak' && inWin(ev.t, from, to));
      covered = false;
      for(let t = Math.floor(tr.from); t <= tr.now; t += 5){ if(inWin(t, from, to)){ covered = true; break; } }
    } else if(d.k === 'no_wake'){
      bad = evs.filter(ev => ev.type === 'woken');
      covered = !!tr.slept;
    } else if(d.k === 'no_camera_home'){
      bad = evs.filter(ev => ev.type === 'camera_home');
    } else if(d.k === 'mail_limit'){
      const mails = evs.filter(ev => ev.type === 'mail');
      const n = Math.max(1, Number(d.n) || 3);
      if(mails.length > n) bad = [mails[n]];
    }
    if(bad.length) return { status:'ng', lines:[evLine(bad[0]) + (d.k === 'mail_limit' ? '（' + ((Number(d.n) || 3) + 1) + '通目）' : '')] };
    if(!covered) return { status:'none', lines:['ためした あいだに、たしかめる 場面は ありませんでした'] };
    return { status:'ok', lines:['ためした あいだ（' + hm(tr.from) + '〜' + hm(tr.now) + '）、まもれていました'] };
  }
  function evaluate(cr, tr){
    if(!cr || !tr) return null;
    return {
      sig: sig(cr),
      range: hm(tr.from) + '〜' + hm(tr.now),
      list: (cr.list || []).map(c => Object.assign({ label: text(c) }, judge(c, tr))),
      donts: (cr.donts || []).map(d => Object.assign({ label: dontText(d) }, judgeDont(d, tr))),
    };
  }
  // 合格条件が 同じかどうかを くらべる しるし（項目の ならび・時刻の 書きかた（8:00／08:00）・メモの ちがいは 気にしない）
  function sig(cr){
    const t = v => { const m = toMin(v); return m == null ? '' : m; };
    const one = c => [c.trig, c.trig === 'lit_empty' ? c.room || '居間' : '', c.trig === 'hot' ? Number(c.temp) || 30 : '', t(c.from), t(c.to),
                      c.act || 'any', c.res || 'none', c.res === 'light_off' ? c.rroom || c.room || '居間' : '', Number(c.within) || 30];
    const dn = d => [d.k, d.k === 'quiet_night' ? t(d.from || '22:00') : '', d.k === 'quiet_night' ? t(d.to || '6:00') : '', d.k === 'mail_limit' ? Number(d.n) || 3 : ''];
    return JSON.stringify([((cr && cr.list) || []).map(one), ((cr && cr.donts) || []).map(dn)]);
  }
  const ICON = { ok:'✔', ng:'✖', wait:'⏳', none:'ー' };
  const WORD = { ok:'合格', ng:'不合格', wait:'たしかめ中', none:'まだ おきていない' };

  // ---------- 困りごと（えらぶ）→ 一日の予定 と 合格条件 を つくる ----------
  // need：'out'＝出かける日でないと おきない ／ 'homeNoon'＝昼（11〜16時半）に 家に いないと おきない
  // opt：困りごとの 中で もう 1つ えらぶ もの（[値, ボタンの 文, 困りごと, うれしい]）。plan.opts[opt.key] に 入る
  //   multi：いくつでも えらべる（plan.opts[opt.key] は 配列。合格条件は ぜんぶで 3こまで）
  //   kind：'where'＝困りごとの 場面（どこで 困る？ → 一日の 予定が かわる）／ 'goal'＝解決の ようす（どう なったら 解決？ → 合格条件が かわる）
  //   解決の ようすは チャッピーの やり方では なく「どう なるか」の ことばで（何を させるかは 開発チームが 考える）
  const ISSUES = [
    { k:'light',    icon:'💡', title:'電気の 消しわすれ',
      opt:{ key:'light', multi:true, kind:'where', label:'📍 どこで 困る？（いくつでも）', list:[
        ['居間', '🛋️ 居間（ねるとき）', 'ねるとき、居間の 電気を つけたまま 寝室へ 行ってしまう', '寝室へ 行ったあと、居間の 電気が 消えると うれしい'],
        ['台所', '🍳 台所（夕ごはんの あと）', '夕ごはんの あと、台所の 電気を つけたまま 居間へ 行ってしまう', '台所を 出たあと、台所の 電気が 消えると うれしい'],
        ['寝室', '🛏️ 寝室（朝 起きた あと）', '朝 起きて つけた 寝室の 電気を、つけたまま 部屋を 出てしまう', '寝室を 出たあと、寝室の 電気が 消えると うれしい'] ] } },
    { k:'lock',     icon:'🔑', title:'かぎの かけわすれ',   story:'出かけるとき、玄関の かぎを かけないで 出てしまう', want:'出かけている あいだも、玄関の かぎが かかって いると 安心', need:'out' },
    { k:'intruder', icon:'🕵', title:'るすの あいだの 防犯', need:'out',
      opt:{ key:'intruder', kind:'goal', label:'🎯 どう なったら 解決？', list:[
        ['gone',   '🏃 知らない人が いなくなる', '出かけている あいだに、知らない人が 家に 入ってくる', '知らない人が 来ても、すぐに いなくなって くれると 安心'],
        ['family', '📱 孫の スマホに 知らせが とどく', '出かけている あいだに 知らない人が 来ても、家族は だれも 気づかない', '知らない人が 来たら、孫の スマホに すぐ 知らせが とどいて ほしい'],
        ['camera', '👀 孫が 家の ようすを 見られる', '出かけている あいだに 知らない人が 来ても、家の ようすが わからない', '知らない人が 来たら、家の ようすを 見られると 安心'] ] } },
    { k:'medicine', icon:'💊', title:'薬の のみわすれ',     story:'決まった 時間に 薬を のむのを わすれてしまう', want:'決まった 時間に 薬を のめると うれしい' },
    { k:'heat',     icon:'🥵', title:'熱中症', need:'homeNoon',
      opt:{ key:'heat', kind:'goal', label:'🎯 どう なったら 解決？', list:[
        ['water', '💧 おじいさんが 水を のむ', '暑い 昼に、水を のまないで すごしてしまう', '暑く なったら、ちゃんと 水を のめると 安心'],
        ['fan',   '🍃 すずしい 風が あたる', '暑い 昼に、すずしく しないで がまんしてしまう', '暑く なったら、すずしい 風が あたると うれしい'],
        ['both',  '💧＋🍃 両方', '暑い 昼に、水も のまず、すずしく しないで すごしてしまう', '暑く なったら、水を のめて、すずしく なると 安心'] ] } },
    { k:'lunch',    icon:'🍚', title:'昼ごはんの 食べわすれ', story:'昼ごはんを 食べないで すごしてしまう', want:'昼ごはんを 食べわすれないと うれしい', need:'homeNoon' },
    { k:'night',    icon:'🌙', title:'夜ふかし',           story:'ねる時間を すぎても、居間で テレビを 見つづけてしまう', want:'ねる時間に なったら、ちゃんと ねられると うれしい' },
    { k:'oversleep', icon:'🛌', title:'ねぼう（見守り）',   story:'いつもの 起きる 時間を すぎても、なかなか 起きてこない。孫が 心配している', want:'起きてこない ときは、孫の スマホに 知らせて ほしい' },
  ];
  // えらんでいる もの（いつも 配列。1つだけ えらぶ ものは 1こ）
  function optsOf(I, p){
    if(!I.opt) return [];
    const v = ((p && p.opts) || {})[I.opt.key], vs = Array.isArray(v) ? v : [v];
    const out = I.opt.list.filter(o => vs.includes(o[0]));
    return out.length ? (I.opt.multi ? out : out.slice(0, 1)) : [I.opt.list[0]];
  }
  const optOf = (I, p) => optsOf(I, p)[0] || null;
  const issueStory = (I, p) => I.opt ? optsOf(I, p).map(o => o[2]).join('。') : I.story;
  const issueWant = (I, p) => I.opt ? optsOf(I, p).map(o => o[3]).join('。') : I.want;
  // 困りごと 1つから できる 合格条件の 数（電気は 部屋の 数、熱中症の「両方」は 2）
  const critN = (k, p) => k === 'light' ? optsOf(ISSUES[0], p).length : k === 'heat' && (p.opts || {}).heat === 'both' ? 2 : 1;
  // 電気の 部屋を いくつまで えらべるか（合格条件は ぜんぶで 3こまで）
  const lightMax = p => Math.max(1, 3 - (p.issues || []).filter(k => k !== 'light').reduce((n, k) => n + critN(k, p), 0));
  // 一日の 時刻の えらびかた（おすすめが 最初）
  const DAY_OPTS = {
    wake:  { label:'起きる',   list:[360, 390, 420] },
    out:   { label:'出かける', list:[540, 600, 780, -1] },          // -1 ＝ 出かけない
    back:  { label:'帰る',     list:[1020, 660, 900] },
    tv:    { label:'テレビ（ソファ）', list:[1200, 1140] },
    sleep: { label:'ねる',     list:[1320, 1260, 1380] },
    med:   { label:'薬の 時間', list:[480, 750, 1140] },
  };
  // 家の ルール（一日の 情報）。依頼者・開発者に 見せる。温度は 家の画面の TEMP_CURVE と 同じ
  //   tile：カードの 短い 名前 ／ points：短い 1行ずつ ／ demos：[台本の key, ボタンの 文]（teamhome-demo.js の RULE_SCENES を 家で 動かす）
  const TEMPS = [[6, 22], [9, 25], [12, 29], [14, 32], [16, 31], [18, 27], [20, 24], [22, 22]];
  const RULES = [
    { icon:'🕵', tile:'知らない人', title:'るすに 知らない人が 来る',
      points:['🚶 おじいさんが 出かけると、1時間くらいで 玄関に 来る', '🔓 かぎが あいている → 入ってきて、居間に 45分 いる',
              '🔒 かぎが かかっている → 入れずに 帰る', '🗣️ チャッピーが しゃべる → おどろいて にげる'],
      demos:[['intr_open', '🔓 あいていると'], ['intr_lock', '🔒 かかっていると'], ['intr_speak', '🗣️ しゃべると']] },
    { icon:'🌡️', tile:'一日の 温度', title:'いちばん 暑いのは 14時',
      points:['🌅 朝 22℃ → 🌞 14時 32℃ → 🌙 夜 24℃', '🔥 12時半〜16時半は 30℃より 上', '🌀 ファンでは 温度は 下がらない'],
      demos:[['temp_day', '🌡️ 一日の 温度']], temps:true },
    { icon:'💡', tile:'電気', title:'電気は かってに 消えない',
      points:['🚪 部屋を 出ても、ついたまま', '👴 消えるのは、予定で「消す」と 決めたとき', '🗣️ チャッピーは 消せない。知らせると、おじいさんが 消しに 来る', '🌆 18時から 外が 暗い'],
      demos:[['light_stay', '🚪 出ても ついたまま'], ['light_tell', '🗣️ 知らせると 消しに 来る']] },
    { icon:'🗣️', tile:'声と メール', title:'家の中は 声、外は メール',
      points:['🏠 家の中 → チャッピーの 声が とどく', '🚶 外 → 声は とどかない。📧 メールなら とどく',
              '👴 言われると する：電気を 消す・かぎ・薬・水・ごはん・ねる・おきる', '📧 外で メールを 見て するのは、電気と かぎだけ'],
      demos:[['voice_in', '🗣️ 声で 薬を すすめる'], ['mail_out', '📧 外の おじいさんに メール']] },
    { icon:'🤖', tile:'センサー', title:'チャッピーに わかること',
      points:['👤 家の中に 人が いるか（部屋ごとにも）', '👴 おじいさんか 🕵 知らない人かも わかる', '💡 部屋の 電気・🔒 かぎ・🌡️ 温度・🕐 時刻'],
      demos:[['sense', '👀 センサーを 見る']] },
  ];
  const PLAN_DEFAULT = { issues:[], wake:360, out:540, back:1020, tv:1200, sleep:1320, med:480, donts:[], dontText:'',
                         opts:{ light:['居間'], intruder:'gone', heat:'water' } };
  const DONT_OPTS = [
    { k:'quiet_night', label:'ねたあと（1時間後から 起きるまで）は しゃべらない' },
    { k:'no_wake',     label:'ねている おじいさんを 起こさない' },
    { k:'mail_limit',  label:'メールは 1日 3通まで' },
  ];
  const hhmm = m => { m = ((m % 1440) + 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
  // 困りごとに 合うように 時刻を なおす（なおした ところは notes に）
  function fixPlan(p0){
    const p = Object.assign({}, PLAN_DEFAULT, p0 || {}), notes = [];
    p.issues = (p.issues || []).filter(k => ISSUES.some(x => x.k === k)).slice(0, 2);
    p.opts = Object.assign({}, PLAN_DEFAULT.opts, p.opts || {});
    ISSUES.forEach(I => {                          // へんな 値は 最初の ものに。いくつでも えらべる ものは 配列に
      if(!I.opt) return;
      const vs = optsOf(I, p).map(o => o[0]);
      p.opts[I.opt.key] = I.opt.multi ? vs : vs[0];
    });
    p.dontText = String(p.dontText || '').slice(0, 60);
    const has = k => p.issues.includes(k);
    if(has('light') && p.opts.light.length > lightMax(p)){
      p.opts.light = p.opts.light.slice(0, lightMax(p));
      notes.push('合格条件は ぜんぶで 3こまで なので、電気の 部屋を「' + p.opts.light.join('・') + '」に しました');
    }
    if((has('lock') || has('intruder')) && p.out < 0){ p.out = 540; notes.push('「出かける」が いる 困りごとなので、9:00に 出かける ことに しました'); }
    let backNote = '';
    if(p.out >= 0 && p.back <= p.out + 60){ p.back = Math.min(1020, p.out + 240); backNote = '帰る 時間を ' + hm(p.back) + ' に しました（出かけて すぐ 帰らないように）'; }
    if((has('heat') || has('lunch')) && p.out >= 0 && p.out < 990 && p.back > 660){   // 11:00〜16:30 は 家に いるように（帰る 時間の 知らせは これに まとめる）
      p.out = Math.min(p.out, 540); p.back = 660; backNote = '';
      notes.push('昼に 家に いないと おきない 困りごとなので、' + hm(p.out) + 'に 出かけて 11:00に 帰る ことに しました');
    }
    if(backNote) notes.unshift(backNote);
    const up = p.wake + (has('oversleep') ? 90 : 0);   // 本当に 起きる 時刻（ねぼうは 1時間半 おそい）
    if(has('oversleep') && p.out >= 0 && p.out < up + 60){
      p.out = up + 60; notes.push('ねぼうで 起きるのが おそいので、出かけるのを ' + hm(p.out) + ' に しました');
    }
    if(p.tv <= 1080) p.tv = 1200;
    if(p.sleep <= p.tv) p.sleep = p.tv + 120;
    if(has('medicine')){                           // 薬の 時間に 家に いて、起きている ように
      const ok = m => m >= up + 30 && m < p.sleep && (p.out < 0 || m < p.out || m >= p.back + 30);
      if(!ok(p.med)){
        const alt = [up + 60].concat(DAY_OPTS.med.list, [p.back + 60]).find(ok);
        if(alt != null){ p.med = alt; notes.push('薬の 時間に 家に いるように、薬の 時間を ' + hm(p.med) + ' に しました'); }
      }
    }
    return { plan:p, notes };
  }
  // 予定の表（[{m, act, room, light, leave, lock, text}]）と 合格条件 と 依頼書の 文を つくる
  function buildPlan(p0){
    const { plan:p, notes } = fixPlan(p0);
    const has = k => p.issues.includes(k);
    const S = [];
    const add = (m, act, room, text, extra) => S.push(Object.assign({ m:((m % 1440) + 1440) % 1440, act, room, light:'keep', leave:'keep', text }, extra || {}));
    const sleepAt = has('night') ? p.sleep + 90 : p.sleep;                  // 夜ふかし：決めた 時間より 1時間半 おそく ねる
    const up = p.wake + (has('oversleep') ? 90 : 0);                         // ねぼう：いつもより 1時間半 おそく 起きる
    const lrs = has('light') ? p.opts.light : [];                            // 電気を つけたままに する 部屋（いくつでも）
    if(sleepAt < 1440) add(0, 'sleep', '寝室', 'ねている');                  // 0時を すぎて ねるなら、その行が 夜中の 行に なる
    add(up, 'wake', '寝室', has('oversleep') ? '起きる（ねぼう）' : '起きる', lrs.includes('寝室') ? { light:'on' } : null);
    add(up + 30, 'eat', '台所', '朝ごはん');
    const home = m => p.out < 0 || m < p.out || m >= p.back;
    if(p.out >= 0){
      add(p.out, 'out', '玄関', 'おでかけ', { lock: has('lock') || has('intruder') ? 'open' : 'lock' });
      add(p.back, 'home', '玄関', 'かえってきた', { lock:'lock' });
    } else add(Math.max(540, up + 60), 'sit', '居間', 'ソファで すごす');
    if(home(720) && !has('lunch')) add(720, 'eat', '台所', '昼ごはん');
    if(home(780)) add(780, 'sit', '居間', 'ひるやすみ', { leave: home(720) && !has('lunch') ? 'off' : 'keep' });
    add(1080, 'eat', '台所', '夕ごはん', { light:'auto' });
    add(p.tv, 'sit', '居間', 'テレビを 見る', { light:'auto', leave: lrs.includes('台所') ? 'keep' : 'off' });
    add(sleepAt, 'sleep', '寝室', 'ねる', { light:'off', leave: lrs.includes('居間') ? 'keep' : 'off' });
    S.sort((a, b) => a.m - b.m);
    // 合格条件（何を するかは 開発者が 考える ＝ チャッピーが すること は「なんでも よい」。ファン・カメラは チャッピーが すること）
    const list = [];
    const C = (c, note) => list.push(Object.assign({ room:'居間', temp:30, from:'', to:'', act:'any', res:'none', rroom:'居間', within:30, note }, c));
    p.issues.forEach(k => {
      const I = ISSUES.find(x => x.k === k), st = issueStory(I, p), o = optOf(I, p);
      if(k === 'light') optsOf(I, p).forEach(r => C({ trig:'lit_empty', room:r[0], res:'light_off', rroom:r[0] }, r[2]));   // 部屋ごとに 1つ
      if(k === 'lock')     C({ trig:'unlocked_away', res:'locked' }, st);
      if(k === 'intruder') C(o[0] === 'family' ? { trig:'intruder', res:'mail_family', within:15 }
                           : o[0] === 'camera' ? { trig:'intruder', act:'camera', within:15 } : { trig:'intruder', res:'intruder_gone', within:15 }, st);
      if(k === 'medicine') C({ trig:'time', from:hhmm(p.med), res:'medicine' }, st);
      if(k === 'heat'){ if(o[0] !== 'fan') C({ trig:'hot', temp:30, res:'water' }, st); if(o[0] !== 'water') C({ trig:'hot', temp:30, act:'fan' }, st); }
      if(k === 'lunch')    C({ trig:'time', from:'12:00', res:'eat' }, st);
      if(k === 'night')    C({ trig:'time', from:hhmm(p.sleep), res:'sleep' }, st);
      if(k === 'oversleep') C({ trig:'time', from:hhmm(p.wake + 30), res:'mail_family' }, st);
    });
    const donts = (p.donts || []).filter(k => DONT_OPTS.some(x => x.k === k)).slice(0, 2).map(k =>
      k === 'quiet_night' ? { k, from:hhmm(sleepAt + 60), to:hhmm(p.wake), n:3, note:'' } : { k, from:'22:00', to:'06:00', n:3, note:'' });
    const criteria = { list:list.slice(0, 3), donts };
    const issue = k => ISSUES.find(x => x.k === k);
    const help = p.issues.map(k => issue(k).title + '：' + issueStory(issue(k), p)).join('\n');
    const want = p.issues.map(k => issueWant(issue(k), p)).join('\n');
    const avoid = donts.map(dontText).concat(p.dontText.trim() ? [p.dontText.trim()] : []).join('\n');   // 「その他」は 自由に 書いた 文（家では 判定しない）
    return { plan:p, notes, schedule:S, criteria, help, want, avoid };
  }

  // ---------- 困りごとを 思いつく ための 手がかり（依頼者） ----------
  // おじいさんの せいかく・くせ → 多い 困りごと（② で えらぶと、④ の 困りごとに ⭐ が つく）
  const TRAITS = [
    { k:'forget',   label:'🌀 わすれっぽい',     issues:['medicine', 'light', 'lock', 'lunch'] },
    { k:'hurry',    label:'💨 あわてんぼう',     issues:['lock', 'light'] },
    { k:'patient',  label:'💪 がまんづよい',     issues:['heat'] },
    { k:'nightowl', label:'🌙 夜ふかし',         issues:['night'] },
    { k:'sleepy',   label:'😪 朝が 弱い',        issues:['oversleep'] },
    { k:'worry',    label:'😟 心配性',           issues:['intruder', 'lock'] },
    { k:'outing',   label:'🚶 出かけるのが すき', issues:['intruder', 'lock'] },
    { k:'tv',       label:'📺 テレビが すき',     issues:['night', 'light'] },
    { k:'alone',    label:'🏠 一人ぐらし',       issues:['oversleep', 'intruder'] },
    { k:'meal',     label:'🍙 食事を ぬきがち',   issues:['lunch'] },
  ];
  const traitKeys = s => String(s || '').split(/[,、・\s]+/).filter(k => TRAITS.some(t => t.k === k));
  // えらんだ せいかくから すすめる 困りごと → { issueKey: [せいかくの 名前, …] }
  function traitIssues(s){
    const out = {};
    traitKeys(s).forEach(k => { const t = TRAITS.find(x => x.k === k); t.issues.forEach(i => { (out[i] = out[i] || []).push(t.label); }); });
    return out;
  }
  // 一日の 中で 困りごとが おきそうな ところ（④ の「？」）。p は fixPlan した あとの えらび
  function dayHints(p){
    const up = p.wake + ((p.issues || []).includes('oversleep') ? 90 : 0);
    const out = [{ m:p.wake, icon:'⏰', text:'朝、ちゃんと 起きられる？', issues:['oversleep'] },
                 { m:up + 30, icon:'💊', text:'朝ごはんの あと、薬は わすれない？', issues:['medicine', 'light'] }];
    if(p.out >= 0) out.push({ m:p.out, icon:'🚪', text:'出かける とき、かぎは？ るすの あいだは だいじょうぶ？', issues:['lock', 'intruder'] });
    out.push({ m:720, icon:'☀️', text:'暑い 昼。水は のんでる？ ごはんは 食べてる？', issues:['heat', 'lunch'] });
    out.push({ m:p.tv, icon:'💡', text:'部屋を 出る とき、電気は 消してる？', issues:['light'] });
    out.push({ m:p.sleep, icon:'🌙', text:'ねる 時間に ちゃんと ねられる？', issues:['night', 'light'] });
    return out.sort((a, b) => a.m - b.m);
  }
  // おじいさんが できること（チャッピーに 言われると する）。demo は teamhome-demo.js の 見本
  const ABILITIES = [
    { icon:'💡', name:'電気を 消す',     how:'「電気が ついてるよ」と 言われると、その 部屋へ 行って 消す', demo:'light_tell' },
    { icon:'🔒', name:'かぎを かける',   how:'「かぎが あいてるよ」と 言われると、玄関で かける', demo:'able_lock' },
    { icon:'💊', name:'薬を のむ',       how:'「薬の 時間だよ」と 言われると、台所で のむ', demo:'voice_in' },
    { icon:'💧', name:'水を のむ',       how:'「水を のんでね」と 言われると、台所で のむ', demo:'able_water' },
    { icon:'🍚', name:'ごはんを 食べる', how:'「ごはんですよ」と 言われると、台所で 食べる', demo:'able_eat' },
    { icon:'😴', name:'ねる',            how:'「ねる 時間ですよ」と 言われると、ベッドで ねる', demo:'able_sleep' },
    { icon:'🌅', name:'おきる',          how:'ねている ときに「おはよう」と 言われると、おきる', demo:'able_wake' },
    { icon:'📧', name:'外では メール',   how:'出かけていると 声は とどかない。スマホの メールなら とどく（電気・かぎ）', demo:'mail_out' },
  ];

  // ---------- 合格条件を 3つに 分けて 見せる（⚡ きっかけ → ⏱ ○分 いないに → 🎯 こう なれば ✔） ----------
  const GOAL_TEXT = { light_off:r => '💡 ' + r + 'の 電気が 消える', locked:() => '🔒 かぎが かかる', medicine:() => '💊 おじいさんが 薬を のむ',
    water:() => '💧 おじいさんが 水を のむ', eat:() => '🍚 おじいさんが ごはんを 食べる', sleep:() => '😴 おじいさんが ねる',
    intruder_gone:() => '🏃 知らない人が いなくなる', mail_family:() => '📱 孫の スマホに 知らせが とどく', mail_grandpa:() => '📱 おじいさんの スマホに とどく' };
  const ACT_GOAL = { fan:'🍃 すずしい 風が あたる（チャッピーの ファン）', camera:'👀 家の ようすが 見られる（チャッピーの カメラ）',
    speak:'🗣️ チャッピーが しゃべる', mail_grandpa:'📱 おじいさんの スマホに メール', mail_family:'📱 孫の スマホに メール' };
  function critParts(c){
    const when = c.trig === 'lit_empty' ? '💡 ' + (c.room || '居間') + 'の 電気が ついていて、だれも いない'
      : c.trig === 'time' ? '⏰ ' + (c.from || '○:○○') + 'に なった'
      : c.trig === 'hot' ? '🌡️ ' + (c.temp || 30) + '℃ 以上に なった'
      : c.trig === 'unlocked_away' ? '🔓 出かけていて、かぎが あいている'
      : c.trig === 'unlocked' ? '🔓 かぎが あいている'
      : c.trig === 'intruder' ? '🕵 知らない人が 来た'
      : '⚡ ' + trigText(c);
    const goal = c.res && c.res !== 'none' && GOAL_TEXT[c.res] ? GOAL_TEXT[c.res](c.rroom || c.room || '居間')
      : c.act && ACT_GOAL[c.act] ? ACT_GOAL[c.act] : resText(c) || '';
    return { when, within:(c.within || 30) + '分 いないに', goal };
  }

  // ---------- 開発者の ヒント（こまったら 1つずつ ひらく） ----------
  function hintsFor(c){
    const R = c.room || '居間', say = (w, t) => '💬 しゃべる ことばに『' + w + '』を 入れると、おじいさんが ' + t;
    if(c.trig === 'lit_empty') return [
      '「💡 電気がついている（' + R + '）」と「🚫 人がいない（' + R + '）」が 両方 本当の ときが 困りごと。どちらも『🧪 仮想だけ』に あるよ',
      'チャッピーは 電気を 消せない。' + say('電気', '消しに 来るよ') + '。出かけている ときは 声が とどかないので 📧 おじいさんに メール',
      '形の れい：🔁 ずっと → もし〔💡' + R + ' かつ 🚫' + R + '〕なら → 💬「' + R + 'の 電気が ついていますよ」'];
    if(c.trig === 'unlocked_away' || c.trig === 'unlocked') return [
      '「🔓 かぎが あいている」' + (c.trig === 'unlocked_away' ? 'と「🚶 おじいさんが 出かけている」が 両方 本当の とき' : 'の とき') + 'を さがそう（『🧪 仮想だけ』）',
      'チャッピーは かぎを かけられない。外の おじいさんには 声が とどかないので、📧 おじいさんの スマホに『かぎ』の メールを 送ろう',
      '形の れい：🔁 ずっと → もし〔🔓 かつ 🚶〕なら → 📧 おじいさんに「かぎが あいています」'];
    if(c.trig === 'intruder'){
      const act = c.res === 'mail_family' ? ['📧 孫の スマホに メールで 知らせよう', '📧 孫に「家に 知らない人が います」']
        : c.act === 'camera' ? ['📷 カメラを つけると、孫の スマホで 家の ようすが 見られるよ', '📷 カメラ つける']
        : ['チャッピーが しゃべると、知らない人は おどろいて にげるよ（ことばは なんでも よい）', '💬「だれですか！」'];
      return ['「🕵 知らない人が 家に いる」ブロックを つかおう（『🧪 仮想だけ』）', act[0], '形の れい：🔁 ずっと → もし〔🕵〕なら → ' + act[1]];
    }
    if(c.trig === 'hot'){
      const fan = c.act === 'fan';
      return ['「🌡️ 温度(℃)」を『はんだん』の くらべる ブロックに 入れて、' + (c.temp || 30) + ' 以上か しらべよう',
        fan ? '🌀 ファンを つける ブロック。すずしく なったら「そうでなければ」で 消そう' : say('水', '台所で 水を のむよ'),
        '形の れい：🔁 ずっと → もし〔温度 ≥ ' + (c.temp || 30) + '〕なら → ' + (fan ? '🌀 ファン つける ／ そうでなければ 🌀 消す' : '💬「暑いので 水を のんでね」')];
    }
    if(c.trig === 'time'){
      const [h, m] = String(c.from || '8:00').split(':');
      const what = { medicine:[say('薬', '台所で 薬を のむよ'), '💬「薬を のむ 時間ですよ」'],
        eat:[say('ごはん', '台所で 食べるよ'), '💬「ごはんですよ」'], sleep:[say('ねる 時間', 'ベッドへ 行くよ'), '💬「ねる 時間ですよ」'],
        mail_family:['📧 孫の スマホに メールで 知らせよう', '📧 孫に「起きて きません」'] }[c.res] || ['合格条件の「🎯」に なるように 知らせよう', '💬 しゃべる'];
      return ['📅「毎日 ○時○分に なったら」ブロックを「🔁 ずっと」の 中に 入れよう', what[0],
        '形の れい：🔁 ずっと → 📅 毎日 ' + Number(h) + '時' + m + '分 → ' + what[1]];
    }
    return ['合格条件の「⚡ きっかけ」を しらべる ブロックを さがそう', '「🎯」に なるように チャッピーに 知らせて もらおう', '🔁 ずっと → もし〔きっかけ〕なら → 知らせる'];
  }
  function hintsForDont(d){
    if(d.k === 'quiet_night') return ['ねたあとの 時間（' + (d.from || '22:00') + '〜' + (d.to || '6:00') + '）は しゃべらない ように しよう。📅 時刻の ブロックで 分けられるよ'];
    if(d.k === 'no_wake') return ['ねている おじいさんに 話しかけると 起きて しまう。ねる 時間に しゃべる ブロックが 動かないか 家で たしかめよう'];
    if(d.k === 'mail_limit') return ['メールは 1日 ' + (d.n || 3) + '通まで。同じ 文の メールは つづけて 送っても 1通に まとまるよ'];
    return ['家で 一日 動かして、まもれているか たしかめよう'];
  }

  // ---------- 依頼者の「解決すると こう なる」見本（家で 動かす プログラム。依頼者には ブロックは 見せない） ----------
  const S = (sensor, value, op) => ({ sensor, op:op || '==', value });
  const IFP = (condition, then, els) => ({ type:'if', condition, then, else:els || [] });
  function sampleActs(c){
    const R = c.room || '居間';
    if(c.trig === 'lit_empty') return [IFP({ type:'and', left:S('lit_' + R, true), right:S('pir_' + R, false) },
      [IFP(S('grandpa_in', false), [{ type:'mail', to:'grandpa', value:R + 'の 電気が ついたままです' }], [{ type:'speak', value:R + 'の 電気が ついていますよ' }])])];
    if(c.trig === 'unlocked_away') return [IFP({ type:'and', left:S('locked', false), right:S('grandpa_in', false) }, [{ type:'mail', to:'grandpa', value:'かぎが あいています' }])];
    if(c.trig === 'unlocked') return [IFP(S('locked', false), [{ type:'speak', value:'かぎが あいていますよ' }])];
    if(c.trig === 'intruder') return [IFP(S('stranger_in', true), [c.res === 'mail_family' ? { type:'mail', to:'family', value:'家に 知らない人が います' }
      : c.act === 'camera' ? { type:'camera', value:true } : { type:'speak', value:'だれですか！' }])];
    if(c.trig === 'hot') return [IFP(S('temp', c.temp || 30, '>='), [c.act === 'fan' ? { type:'fan', value:true } : { type:'speak', value:'暑いので 水を のんでね' }],
      c.act === 'fan' ? [{ type:'fan', value:false }] : [])];
    if(c.trig === 'time'){
      const f = toMin(c.from); if(f == null) return [];
      const act = { medicine:{ type:'speak', value:'薬を のむ 時間ですよ' }, eat:{ type:'speak', value:'ごはんですよ' },
        sleep:{ type:'speak', value:'ねる 時間ですよ' }, mail_family:{ type:'mail', to:'family', value:'起きて きません' } }[c.res];
      return act ? [IFP({ calendar:true, all:[S('hour', Math.floor(f / 60)), S('minute', f % 60)] }, [act])] : [];
    }
    return [];
  }
  const sampleProgram = list => ({ actions:[{ type:'forever', actions:(list || []).reduce((a, c) => a.concat(sampleActs(c)), []) }] });
  // 家で「困る ようす」「解決すると」を 見る 見本の 台本（teamhome-demo の 台本と 同じ 形）。p は えらび、k は 困りごと
  function peekScene(p0, k, fix){
    const b = buildPlan(Object.assign({}, p0, { issues:[k] })), p = b.plan, I = ISSUES.find(x => x.k === k);
    const rows = b.schedule, rowM = act => (rows.find(e => e.act === act) || {}).m;
    const up = p.wake + (k === 'oversleep' ? 90 : 0);
    const room = (optOf(I, p) || [])[0];                // 電気は いちばん はじめの 部屋を 見せる
    const outM = rowM('out');
    // 困りごとが おきる 少し前から 見せる（電気：寝室＝起きる とき・台所＝テレビの 前・居間＝ねる 前）
    const focus = k === 'light' ? (room === '寝室' ? up - 3 : room === '台所' ? p.tv - 12 : p.sleep - 12)
      : k === 'lock' || k === 'intruder' ? (outM != null ? outM - 4 : 540)
      : k === 'medicine' ? p.med - 5 : k === 'heat' ? 745 : k === 'lunch' ? 715 : k === 'night' ? p.sleep - 5 : k === 'oversleep' ? p.wake - 5 : 600;
    const span = k === 'lock' || k === 'intruder' ? 120 : k === 'heat' ? 70 : k === 'light' && room === '寝室' ? 80 : 60;
    const crit = b.criteria.list, start = Math.max(0, focus);
    const events = [{ m:start + 1, narr:fix ? '✨ ' + crit.map(c => critParts(c).goal).join('・') + ' ように なれば 合格' : '👀 ' + issueStory(I, p) }];
    if((k === 'lock' || k === 'intruder') && outM != null) events.push({ m:outM + 50, intruder:'come' });   // 見本では 知らない人は 台本で 来る
    return { key:'peek', cap:'見本', start, end:start + span, rate:10, day:rows,
      title:(fix ? '✨ 解決すると：' : '👀 困る ようす：') + I.icon + ' ' + I.title,
      what:fix ? 'チャッピーが 知らせると、こう なれば 合格（✔）。何を させるかは 開発チームが 考えます。' : issueStory(I, p) + '。このまま だと 困るね。',
      program:fix ? sampleProgram(crit) : null, events };
  }

  global.TeamCheck = { ROOMS, TRIGGERS, ACTIONS, RESULTS, DONTS, find, hm, toMin, text, dontText, trigText, resText,
    inWin, stateKey, stateKeys, evaluate, sig, ICON, WORD, ISSUES, DAY_OPTS, PLAN_DEFAULT, DONT_OPTS, fixPlan, buildPlan, TEMPS, RULES,
    optOf, optsOf, issueStory, issueWant, lightMax,
    TRAITS, traitKeys, traitIssues, dayHints, ABILITIES, critParts, hintsFor, hintsForDont, sampleProgram, peekScene };
})(window);
