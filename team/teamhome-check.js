/* ⑤チーム：合格条件（依頼者が 先に 決める）と、家の フィールドでの 判定
   ・合格条件 c = { trig, room, temp, from, to, act, res, rroom, within, note }
       「（from〜to に）きっかけ trig が おきたら、チャッピーが act して、within 分以内に res になる」
   ・しないでほしいこと d = { k, from, to, n, note }
   ・判定 evaluate(criteria, trace) … trace は 家の画面が 動かしている 間に ためた できごと
   依頼者のページ・開発者のページ・家の画面で 同じものを 使う（サーバーの _clean_criteria と 同じ 言葉） */
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
    { k:'night_walk',    label:'夜中に おじいさんが トイレへ 歩きだした' },
    { k:'foot_empty',    label:'足元ライトが ついていて、だれも 歩いて いない', state:true },
  ];
  // チャッピーが すること
  const ACTIONS = [
    { k:'any',          label:'（なんでも よい）' },
    { k:'speak',        label:'しゃべる',               te:'しゃべって' },
    { k:'mail_grandpa', label:'おじいさんに メールする', te:'おじいさんに メールして' },
    { k:'mail_family',  label:'孫に メールする',         te:'孫に メールして' },
    { k:'fan',          label:'ファンを 回す',         te:'ファンを 回して' },
    { k:'camera',       label:'カメラを つける',         te:'カメラを つけて' },
    { k:'light_off',    label:'自分で 電気を 消す',      te:'自分で 電気を 消して', hide:true },   // チャッピーは 電気を 消せない（前の 合格条件の ために 残す）
  ];
  // 結果（どうなったら 合格か）
  const RESULTS = [
    { k:'none',          label:'（チャッピーが すれば よい）' },
    { k:'light_off',     label:'電気が 消える（部屋）', room:true },
    { k:'locked',        label:'かぎが かかる' },
    { k:'medicine',      label:'おじいさんが 薬を 飲む' },
    { k:'water',         label:'おじいさんが 水を 飲む' },
    { k:'eat',           label:'おじいさんが ごはんを 食べる' },
    { k:'sleep',         label:'おじいさんが ねる' },
    { k:'intruder_gone', label:'知らない人が いなくなる' },
    { k:'mail_grandpa',  label:'おじいさんの スマホに とどく' },
    { k:'mail_family',   label:'孫の スマホに とどく' },
    { k:'foot_on',       label:'足元ライトが つく' },
    { k:'foot_off',      label:'足元ライトが 消える' },
  ];
  // しないでほしいこと（判定できるもの）
  const DONTS = [
    { k:'quiet_night',    label:'○時〜○時は チャッピーが しゃべらない', time:true },
    { k:'no_wake',        label:'ねている おじいさんを 起こさない' },
    { k:'no_camera_home', label:'おじいさんが 家にいるときは カメラを つけない' },
    { k:'mail_limit',     label:'メールは 1日 ○通まで', n:true },
    { k:'no_scare',       label:'おじいさんを 知らない人と まちがえない（「だれですか！」と 言わない）' },
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
  // しめきりの 言葉：5分 いないは「すぐに」（防犯などは すぐ 反応しないと いけない）。それより 長い ときは「遅くても ○分後 までに」
  const limText = w => (w || 30) <= 5 ? 'すぐに' : '遅くても ' + (w || 30) + '分後 までに';
  function text(c){
    if(!c) return '';
    const win = c.trig !== 'time' && (c.from || c.to) ? (c.from || '') + '〜' + (c.to || '') + ' に、' : '';
    const A = c.act && c.act !== 'any' ? find(ACTIONS, c.act) : null;
    const res = c.res && c.res !== 'none' ? resText(c) : '';
    const within = c.within || 30, lim = limText(within);
    let s = win + trigText(c) + '、';
    if(A && res) s += 'チャッピーが ' + A.te + '、' + lim + ' ' + res;
    else if(A) s += lim + ' チャッピーが ' + A.label;
    else if(res) s += lim + ' ' + res;
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
    if(c.trig === 'unlocked' || c.trig === 'unlocked_away' || c.trig === 'foot_empty') return c.trig;
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
    const evType = { out:'out', home:'home', sleep:'sleep', intruder:'intruder', night_walk:'toilet' }[c.trig];
    tr.events.forEach(ev => {
      if(ev.type === 'gp' && ev.what === evType && evType !== 'intruder' && inWin(ev.t, c.from, c.to)) out.push({ t:ev.t });
      if(evType === 'intruder' && ev.type === 'intruder' && ev.what === 'enter' && inWin(ev.t, c.from, c.to)) out.push({ t:ev.t });
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
      case 'foot_on':       return ev.type === 'foot' && ev.on;
      case 'foot_off':      return ev.type === 'foot' && !ev.on;
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
      case 'foot':   return t + '🦶 足元ライトが ' + (ev.on ? 'ついた' : '消えた');
      case 'light':  return t + '💡 ' + ev.room + 'の電気が ' + (ev.on ? 'ついた' : '消えた') + (ev.who === 'block' ? '（チャッピー）' : '（おじいさん）');
      case 'lock':   return t + (ev.on ? '🔒 かぎが かかった' : '🔓 かぎが あいた');
      case 'gp':     return t + '👴 おじいさんが ' + ({ medicine:'薬を 飲んだ', water:'水を 飲んだ', eat:'ごはんを 食べた', sleep:'ねた', out:'出かけた', home:'帰ってきた', toilet:'夜中に トイレへ 歩きだした' }[ev.what] || ev.what);
      case 'intruder': return t + '🕵 知らない人が ' + ({ enter:'入ってきた', blocked:'ドアを ためしたが 入れなかった', flee:'にげていった', leave:'出ていった' }[ev.what] || ev.what);
      case 'woken':  return t + '😪 ねている おじいさんが 起きた';
      case 'camera_home': return t + '📷 おじいさんが 家にいるのに カメラが ついている';
      case 'scare':  return t + '😣 家に いる おじいさんに「' + ev.text + '」と 言って しまった';
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
      let aEv = c.act && c.act !== 'any' ? evs.find(ev => actMatch(c, ev)) : null;
      if(!aEv && c.act === 'camera'){                                            // カメラは 前から ついたまま でも よい
        const last = tr.events.filter(ev => ev.type === 'camera' && ev.t < o.t - 0.5).pop();
        if(last && last.on) aEv = last;
      }
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
    if(status === 'none' && c.trig === 'intruder'){
      const blocked = tr.events.find(ev => ev.type === 'intruder' && ev.what === 'blocked');
      if(blocked) return { status:'ok', n:1, okN:1, lines:[evLine(blocked) + '（かぎが かかっていて、先に ふせげた）'] };
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
    } else if(d.k === 'no_scare'){
      bad = evs.filter(ev => ev.type === 'scare');
    } else if(d.k === 'mail_limit'){
      const mails = evs.filter(ev => ev.type === 'mail');
      const n = Math.max(1, Number(d.n) || 3);
      if(mails.length > n) bad = [mails[n]];
    }
    if(bad.length) return { status:'ng', lines:[evLine(bad[0]) + (d.k === 'mail_limit' ? '（' + ((Number(d.n) || 3) + 1) + '通目）' : '')] };
    if(!covered) return { status:'none', lines:['ためした あいだに、確かめる 場面は ありませんでした'] };
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
  const WORD = { ok:'できた', ng:'できていない', wait:'確かめ中', none:'まだ おきていない' };

  // ---------- 困りごと（選ぶ）→ 一日の予定 と 合格条件 を つくる ----------
  // need：'out'＝出かける日でないと おきない ／ 'homeNoon'＝昼（11〜16時半）に 家に いないと おきない
  // opt：困りごとの 中で もう 1つ 選ぶ もの（[値, ボタンの 文, 困りごと, うれしい]）。plan.opts[opt.key] に 入る
  //   multi：いくつでも えらべる（plan.opts[opt.key] は 配列。合格条件は ぜんぶで 3こまで）
  //   kind：'where'＝困りごとの 場面（どこで 困る？ → 一日の 予定が かわる）／ 'goal'＝解決の 様子（どう なったら 解決？ → 合格条件が かわる）
  //   解決の 様子は チャッピーの やり方では なく「どう なるか」の 言葉で（何を させるかは 開発チームが 考える）
  const ISSUES = [
    { k:'light',    icon:'💡', title:'電気の 消し忘れ',
      opt:{ key:'light', multi:true, kind:'where', label:'📍 どこで 困る？（いくつでも）', list:[
        ['居間', '🛋️ 居間（ねるとき）', 'ねるとき、居間の 電気を つけたまま 寝室へ 行ってしまう', '寝室へ 行ったあと、居間の 電気が 消えると うれしい'],
        ['台所', '🍳 台所（夕ごはんの あと）', '夕ごはんの あと、台所の 電気を つけたまま 居間へ 行ってしまう', '台所を 出たあと、台所の 電気が 消えると うれしい'],
        ['寝室', '🛏️ 寝室（朝 起きた あと）', '朝 起きて つけた 寝室の 電気を、つけたまま 部屋を 出てしまう', '寝室を 出たあと、寝室の 電気が 消えると うれしい'] ] } },
    { k:'lock',     icon:'🔑', title:'かぎの かけ忘れ',   story:'出かけるとき、玄関の かぎを かけないで 出てしまう', want:'出かけている 間も、玄関の かぎが かかって いると 安心', need:'out' },
    { k:'intruder', icon:'🕵', title:'留守の 間の 防犯', need:'out',
      opt:{ key:'intruder', kind:'goal', label:'🎯 どう なったら 解決？', list:[
        ['speak',  '🗣️ チャッピーの 声で、知らない人が にげる', '出かけている 間に、知らない人が 家に 入ってきても、だれも 止められない', '出かけている 間も、家が 守られて いると 安心'],   // やり方（声・メール…）は 開発者が 考える
        ['mail',   '📱 外に いる おじいさんが すぐ 気づける', '出かけている 間に 知らない人が 来ても、おじいさんは 気づけない', '知らない人が 来たら、外に いる おじいさんの スマホに すぐ 知らせが とどくと 安心'],
        ['camera', '📷 出かけている 間、おじいさんが スマホで 家を 見られる', '出かけている 間、家の 様子が わからなくて 心配', '出かけている 間は、おじいさんの スマホで いつでも 家の 様子を 見られると 安心'] ] } },
    { k:'medicine', icon:'💊', title:'薬の 飲み忘れ',     story:'決まった 時間に 薬を 飲むのを 忘れてしまう', want:'決まった 時間に 薬を 飲めると うれしい' },
    { k:'heat',     icon:'🥵', title:'熱中症', need:'homeNoon',
      opt:{ key:'heat', kind:'goal', label:'🎯 どう なったら 解決？', list:[
        ['water', '💧 おじいさんが 水を 飲む', '暑い 昼でも、水も 飲まず、涼しくも しないで 我慢してしまう', '暑い 日でも、体が つらく ならずに 過ごせると 安心'],   // やり方（水・ファン）は 開発者が 考える
        ['fan',   '🍃 涼しい 風が あたる', '暑い 昼に、涼しく しないで 我慢してしまう', '暑く なったら、涼しい 風が あたると うれしい'],
        ['both',  '💧＋🍃 両方', '暑い 昼に、水も のまず、涼しく しないで 過ごしてしまう', '暑く なったら、水を のめて、涼しく なると 安心'] ] } },
    { k:'lunch',    icon:'🍚', title:'昼ごはんの 食べ忘れ', story:'昼ごはんを 食べないで 過ごしてしまう', want:'昼ごはんを 食べ忘れないと うれしい', need:'homeNoon' },
    { k:'night',    icon:'🌙', title:'夜ふかし',           story:'ねる時間を すぎても、居間で テレビを 見つづけてしまう', want:'ねる時間に なったら、ちゃんと ねられると うれしい' },
    { k:'toilet',   icon:'🚽', title:'夜中の トイレ（足元が 暗い）', story:'夜中に トイレに 起きる とき、足元が まっくらで 転びそう', want:'夜中に トイレへ 行く とき、足元が 明るいと 安心' },
    { k:'lonely',   icon:'🥺', title:'さみしい（話し相手が いない）', story:'一人で いる 時間が 長く、だれとも 話さないで さみしく なってしまう', want:'さみしい ときに、話し相手が いると うれしい', need:'homeNoon' },
    { k:'oversleep', icon:'🛌', title:'寝坊（見守り）',   story:'いつもの 起きる 時間を すぎても、なかなか 起きてこない。孫が 心配している', want:'起きてこない ときは、孫の スマホに 知らせて ほしい' },
  ];
  // ③ どう なれば いい？（選ぶ）。opt が goal の 困りごと（防犯・熱中症）は そちらを 使う
  //   [値, カードの 文, うれしい]。plan.opts[key] に 入る。最初が おすすめ
  const GOALS = {
    light:    { key:'lightW', list:[['5',  '💡 部屋を 出たら すぐ（5分 以内に）電気が 消える', '部屋を 出て、電気を つけたままに なったら、すぐ 消えると うれしい'],
                                   ['15', '💡 15分 以内に 消えれば よい', 'つけたままでも、15分 以内に 消えれば うれしい'],
                                   ['30', '💡 30分 以内に 消えれば よい', 'つけたままでも、30分 以内に 消えれば よい']] },
    lock:     { key:'lockG',  list:[['lock', '🔒 出かけた あとでも、かぎが かかる', '出かけている 間も、玄関の かぎが かかって いると 安心'],
                                   ['mail', '📱 外に いる おじいさんが すぐ 気づける', 'かぎが あいていたら、外に いる おじいさんの スマホに すぐ 知らせが とどくと 安心']] },
    medicine: { key:'medW',   list:[['15', '💊 薬の 時間から 15分 以内に のむ', '薬の 時間に なったら、すぐ 飲めると うれしい'],
                                   ['60', '💊 1時間 以内に 飲めれば よい', 'すこし おくれても、1時間 以内に 飲めれば よい']] },
    lunch:    { key:'lunchW', list:[['30', '🍚 12時から 30分 以内に 食べる', 'お昼に なったら、ちゃんと 昼ごはんを 食べられると うれしい'],
                                   ['60', '🍚 1時間 以内に 食べれば よい', 'すこし おくれても、昼ごはんを 食べれば よい']] },
    night:    { key:'nightW', list:[['15', '😴 ねる 時間に なったら 15分 以内に ねる', 'ねる 時間に なったら、すぐ ねられると うれしい'],
                                   ['45', '😴 45分 以内に ねれば よい', 'すこし おくれても、ねられれば よい']] },
    toilet:   { key:'toiletG', list:[['10', '🦶 歩く ときは 足元が 明るく、もどったら 10秒で 消える', '歩く ときだけ 明るく、ねたら すぐ 消えると 電気も むだに ならない'],
                                   ['on', '🦶 歩く ときに 足元が 明るく なれば よい', '夜中に 歩く とき、足元が 明るく なれば 安心']] },
    oversleep:{ key:'overW',  list:[['30', '📱 いつもより 30分 おそいと、孫に 知らせが とどく', '起きてこない ときは、早めに 孫の スマホに 知らせて ほしい'],
                                   ['60', '📱 いつもより 1時間 おそいと、孫に 知らせが とどく', '1時間 起きてこない ときは、孫の スマホに 知らせて ほしい']] },
  };
  const goalOf = (k, p) => { const G = GOALS[k]; if(!G) return null; const v = ((p && p.opts) || {})[G.key]; return G.list.find(o => o[0] === v) || G.list[0]; };
  // 選んでいる もの（いつも 配列。1つだけ 選ぶ ものは 1こ）
  function optsOf(I, p){
    if(!I.opt) return [];
    const v = ((p && p.opts) || {})[I.opt.key], vs = Array.isArray(v) ? v : [v];
    const out = I.opt.list.filter(o => vs.includes(o[0]));
    return out.length ? (I.opt.multi ? out : out.slice(0, 1)) : [I.opt.list[0]];
  }
  const optOf = (I, p) => optsOf(I, p)[0] || null;
  const issueStory = (I, p) => I.opt ? optsOf(I, p).map(o => o[2]).join('。') : I.story;
  const issueWant = (I, p) => GOALS[I.k] ? goalOf(I.k, p)[2] : I.opt ? optsOf(I, p).map(o => o[3]).join('。') : I.want;
  // 困りごと 1つから できる 合格条件の 数（電気は 部屋の 数、熱中症の「両方」は 2）
  const critN = (k, p) => k === 'light' ? optsOf(ISSUES[0], p).length : k === 'heat' && (p.opts || {}).heat === 'both' ? 2 : 1;
  // 電気の 部屋を いくつまで えらべるか（合格条件は ぜんぶで 3こまで）
  const lightMax = p => Math.max(1, 3 - (p.issues || []).filter(k => k !== 'light').reduce((n, k) => n + critN(k, p), 0));
  // 一日の 時刻の 選びかた（おすすめが 最初）
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
    { icon:'🕵', tile:'知らない人', title:'留守に 知らない人が 来る',
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
              '👴 言われると する：電気を 消す・かぎ・薬・水・ごはん・ねる・おきる', '📧 外で メールを 見て するのは、電気と かぎ。知らない人の メールなら 急いで 帰ってくる'],
      demos:[['voice_in', '🗣️ 声で 薬を すすめる'], ['mail_out', '📧 外の おじいさんに メール']] },
    { icon:'🤖', tile:'センサー', title:'チャッピーに わかること',
      points:['👤 家の中に 人が いるか（部屋ごとにも）', '👴 おじいさんか 🕵 知らない人かも わかる', '💡 部屋の 電気・🔒 かぎ・🌡️ 温度・🕐 時刻'],
      demos:[['sense', '👀 センサーを 見る']] },
  ];
  const PLAN_DEFAULT = { issues:[], wake:360, out:540, back:1020, tv:1200, sleep:1320, med:480, donts:[], dontText:'', care:[],
                         opts:{ light:['居間'], intruder:'speak', heat:'water', lightW:'5', lockG:'lock', medW:'15', lunchW:'30', nightW:'15', overW:'30', toiletG:'10' } };
  const DONT_OPTS = [
    // ex：④ の れい（自由に 書く 欄に 入る 文。この 文が 入って いれば 家で 判定する）
    { k:'quiet_night', label:'ねたあと（1時間後から 起きるまで）は しゃべらない', ex:'寝たあとは 話しかけないで' },
    { k:'no_wake',     label:'ねている おじいさんを 起こさない', ex:'寝ている ときに 起こさないで' },
    { k:'mail_limit',  label:'メールは 1日 3通まで', ex:'メールは 1日 3通までに して' },
    { k:'no_camera_home', label:'おじいさんが 家に いる ときは カメラを つけない（プライバシー）', ex:'家に いる ときは カメラで 見ないで' },
  ];
  const hhmm = m => { m = ((m % 1440) + 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
  // 困りごとに 合うように 時刻を なおす（なおした ところは notes に）
  function fixPlan(p0){
    const p = Object.assign({}, PLAN_DEFAULT, p0 || {}), notes = [];
    p.issues = (p.issues || []).filter(k => ISSUES.some(x => x.k === k)).slice(0, 6);   // ② の 一日では 6こまで 出せる（依頼するのは 先生が 決めた 数まで）
    p.opts = Object.assign({}, PLAN_DEFAULT.opts, p.opts || {});
    p.opts.intruder = { gone:'speak', family:'mail' }[p.opts.intruder] || p.opts.intruder;
    ISSUES.forEach(I => {                          // へんな 値は 最初の ものに。いくつでも えらべる ものは 配列に
      if(!I.opt) return;
      const vs = optsOf(I, p).map(o => o[0]);
      p.opts[I.opt.key] = I.opt.multi ? vs : vs[0];
    });
    Object.keys(GOALS).forEach(k => { p.opts[GOALS[k].key] = goalOf(k, p)[0]; });   // へんな 値は おすすめに
    p.dontText = String(p.dontText || '').slice(0, 100);
    p.care = (Array.isArray(p.care) ? p.care : []).filter((k, i, a) => CARE.some(c => c.k === k) && a.indexOf(k) === i).slice(0, 2);
    const has = k => p.issues.includes(k);
    if(has('light') && p.opts.light.length > lightMax(p)){
      p.opts.light = p.opts.light.slice(0, lightMax(p));
      notes.push('合格条件は ぜんぶで 3こまで なので、電気の 部屋を「' + p.opts.light.join('・') + '」に しました');
    }
    if((has('lock') || has('intruder')) && p.out < 0){ p.out = 540; notes.push('「出かける」が いる 困りごとなので、9:00に 出かける ことに しました'); }
    let backNote = '';
    if(p.out >= 0 && p.back <= p.out + 60){ p.back = Math.min(1020, p.out + 240); backNote = '帰る 時間を ' + hm(p.back) + ' に しました（出かけて すぐ 帰らないように）'; }
    if((has('heat') || has('lunch') || has('lonely')) && p.out >= 0 && p.out < 990 && p.back > 660){   // 11:00〜16:30 は 家に いるように（帰る 時間の 知らせは これに まとめる）
      p.out = Math.min(p.out, 540); p.back = 660; backNote = '';
      notes.push('昼に 家に いないと おきない 困りごとなので、' + hm(p.out) + 'に 出かけて 11:00に 帰る ことに しました');
    }
    if(backNote) notes.unshift(backNote);
    const up = p.wake + (has('oversleep') ? 90 : 0);   // 本当に 起きる 時刻（寝坊は 1時間半 おそい）
    if(has('oversleep') && p.out >= 0 && p.out < up + 60){
      p.out = up + 60; notes.push('寝坊で 起きるのが おそいので、出かけるのを ' + hm(p.out) + ' に しました');
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
    const up = p.wake + (has('oversleep') ? 90 : 0);                         // 寝坊：いつもより 1時間半 おそく 起きる
    const lrs = has('light') ? p.opts.light : [];                            // 電気を つけたままに する 部屋（いくつでも）
    if(sleepAt < 1440) add(0, 'sleep', '寝室', 'ねている');                  // 0時を すぎて ねるなら、その行が 夜中の 行に なる
    add(up, 'wake', '寝室', has('oversleep') ? '起きる（寝坊）' : '起きる', lrs.includes('寝室') ? { light:'on' } : null);
    add(up + 30, 'eat', '台所', '朝ごはん');
    const home = m => p.out < 0 || m < p.out || m >= p.back;
    if(p.out >= 0){
      add(p.out, 'out', '玄関', 'お出かけ', { lock: has('lock') || has('intruder') ? 'open' : 'lock' });
      add(p.back, 'home', '玄関', '帰ってきた', { lock:'lock' });
    } else add(Math.max(540, up + 60), 'sit', '居間', 'ソファで 過ごす');
    if(home(720) && !has('lunch')) add(720, 'eat', '台所', '昼ごはん');
    if(home(780)) add(780, 'sit', '居間', 'ひるやすみ', { leave: home(720) && !has('lunch') ? 'off' : 'keep' });
    add(1080, 'eat', '台所', '夕ごはん', { light:'auto' });
    add(p.tv, 'sit', '居間', 'テレビを 見る', { light:'auto', leave: lrs.includes('台所') ? 'keep' : 'off' });
    add(sleepAt, 'sleep', '寝室', 'ねる', { light:'off', leave: lrs.includes('居間') ? 'keep' : 'off' });
    if(has('toilet')) add(120, 'go', 'トイレ', '夜中の トイレ');   // 2時に トイレへ（もどったら そのまま 朝まで ねる。ねる 行を 足すと もう一度 起きて 歩いて しまう）
    S.sort((a, b) => a.m - b.m);
    // 合格条件（何を するかは 開発者が 考える ＝ チャッピーが すること は「なんでも よい」。ファン・カメラは チャッピーが すること）
    const list = [];
    const C = (c, note) => list.push(Object.assign({ room:'居間', temp:30, from:'', to:'', act:'any', res:'none', rroom:'居間', within:30, note }, c));
    p.issues.forEach(k => {
      const I = ISSUES.find(x => x.k === k), st = issueStory(I, p), o = optOf(I, p);
      const gv = GOALS[k] ? goalOf(k, p)[0] : null;
      if(k === 'light') optsOf(I, p).forEach(r => C({ trig:'lit_empty', room:r[0], res:'light_off', rroom:r[0], within:Number(gv) }, r[2]));   // 部屋ごとに 1つ
      if(k === 'lock')     C(gv === 'mail' ? { trig:'unlocked_away', res:'mail_grandpa', within:5 } : { trig:'unlocked_away', res:'locked' }, st);
      if(k === 'intruder') C(o[0] === 'mail' ? { trig:'intruder', res:'mail_grandpa', within:5 }          // 防犯は すぐ（5分以内に）
                           : o[0] === 'camera' ? { trig:'out', act:'camera', within:5 } : { trig:'intruder', act:'speak', res:'intruder_gone', within:5 }, st);
      if(k === 'medicine') C({ trig:'time', from:hhmm(p.med), res:'medicine', within:Number(gv) }, st);
      if(k === 'heat'){ if(o[0] !== 'fan') C({ trig:'hot', temp:30, res:'water' }, st); if(o[0] !== 'water') C({ trig:'hot', temp:30, act:'fan' }, st); }
      if(k === 'lunch')    C({ trig:'time', from:'12:00', res:'eat', within:Number(gv) }, st);
      if(k === 'night')    C({ trig:'time', from:hhmm(p.sleep), res:'sleep', within:Number(gv) }, st);
      if(k === 'oversleep') C({ trig:'time', from:hhmm(p.wake + Number(gv)), res:'mail_family', within:10 }, st);
      if(k === 'toilet'){ C({ trig:'night_walk', res:'foot_on', within:1 }, st); if(gv === '10') C({ trig:'foot_empty', res:'foot_off', within:1 }, '歩いて いない ときは 消える'); }
    });
    const donts = (p.donts || []).filter(k => DONT_OPTS.some(x => x.k === k)).slice(0, 2).map(k =>
      k === 'quiet_night' ? { k, from:hhmm(sleepAt + 60), to:hhmm(p.wake), n:3, note:'' } : { k, from:'22:00', to:'06:00', n:3, note:'' });
    const criteria = { list:list.slice(0, 8), donts };   // ② の 一日で いくつも 困りごとを 出す ため（薬の 時刻なども 家が 使う）
    const issue = k => ISSUES.find(x => x.k === k);
    const help = p.issues.map(k => issue(k).title + '：' + issueStory(issue(k), p)).join('\n');
    const want = p.issues.map(k => issueWant(issue(k), p)).join('\n');
    const avoid = p.dontText.trim() || donts.map(dontText).join('\n');   // してほしくない こと：自由に 書いた 文（れいの 文が 入って いれば donts で 家でも 判定）  //   // 「その他」は 自由に 書いた 文（家では 判定しない）
    return { plan:p, notes, schedule:S, criteria, help, want, avoid };
  }

  // ---------- 困りごとを 思いつく ための 手がかり（依頼者） ----------
  // おじいさんの 性格・くせ → 多い 困りごと（② で 選ぶと、④ の 困りごとに ⭐ が つく）
  //   prof：プロフィールの カードで 選んだ とき、② の 一日に 出てくる 困りごと（カード 1枚で 1〜2こ）
  //   life：依頼書の「生活の様子」に 入る 文 ／ hobby：好きな こと（困りごとには ならない カード）
  const TRAITS = [
    { k:'forget',   label:'🌀 忘れっぽい',     issues:['medicine', 'light', 'lock', 'lunch'], prof:['medicine', 'light'], life:'うっかり 忘れる ことが 増えてきた' },
    { k:'hurry',    label:'💨 あわてんぼう',     issues:['lock', 'light'], prof:['intruder'], life:'いつも 急いで 出かける' },
    { k:'eyes',     label:'👓 目が 弱い',         issues:['toilet'], prof:['toilet'], life:'くらい ところでは、足元が よく 見えない' },
    { k:'medday',   label:'💊 毎日 薬を 飲む',     issues:['medicine'], prof:['medicine'], life:'毎朝 8時に、薬を 飲まないと いけない' },
    { k:'patient',  label:'💪 我慢づよい',     issues:['heat'], prof:['heat'], life:'暑くても、つい 我慢して しまう' },
    { k:'nightowl', label:'🌙 夜ふかし',         issues:['night'] },
    { k:'sleepy',   label:'😪 朝が 弱い',        issues:['oversleep'], prof:['oversleep'], life:'朝が 弱く、なかなか 起きられない' },
    { k:'worry',    label:'😟 心配性',           issues:['intruder', 'lock'] },
    { k:'outing',   label:'🚶 出かけるのが 好き', issues:['intruder', 'lock'], prof:['intruder'], life:'毎日のように 出かけるのが 楽しみ' },
    { k:'tv',       label:'📺 テレビが 好き',     issues:['night', 'light'], prof:['light'], life:'夜は 居間で テレビを 見るのが 楽しみ' },
    { k:'alone',    label:'🏠 一人ぐらし',       issues:['oversleep', 'intruder'] },
    { k:'nightloo', label:'🚽 夜中に トイレに 起きる', issues:['toilet'], prof:['toilet'], life:'夜中に 1回 トイレに 起きる' },
    { k:'meal',     label:'🍙 食事を 抜きがち',   issues:['lunch'], prof:['lunch'], life:'一人だと、食事を 抜いて しまいがち' },
    { k:'lonely',   label:'🥺 さみしがり',       issues:['lonely'], prof:['lonely'], life:'一人だと さみしくて、話し相手が ほしい' },
    { k:'calm',     label:'😊 のんびりや',       issues:[], prof:[], life:'のんびり、マイペースに 過ごしている' },
    { k:'shogi',    label:'♟️ 将棋',             issues:[], hobby:true, doing:'将棋の 本を 読んで 楽しんでいる' },
    { k:'photo',    label:'📷 孫の 写真',         issues:[], hobby:true, doing:'孫の 写真を 眺めて、にこにこ している' },
    { k:'enka',     label:'🎵 演歌',             issues:[], hobby:true, doing:'好きな 演歌を 聞いて、ごきげん' },
    { k:'book',     label:'📚 読書',             issues:[], hobby:true, doing:'本を 読んで、ゆっくり 過ごしている' },
  ];
  const traitKeys = s => String(s || '').split(/[,、・\s]+/).filter(k => TRAITS.some(t => t.k === k));
  // ① プロフィールの カード（名前と 好きな ことは 自分たちで 書く。ほかは 選ぶだけ）。グループごとに 1まい
  //   好きな ことの カード（hobby）は 前の 保存を 読む ためだけに のこす
  const PROFILE = {
    ages:['90さい', '95さい', '100さい', '105さい', '110さい'],
    groups:[{ key:'sei',  icon:'🧠', label:'性格',       keys:['forget', 'hurry', 'patient', 'lonely'] },   // 😊 のんびりや は 出さない（困りごとが ない）
            { key:'kura', icon:'🏠', label:'暮らし・くせ', keys:['outing', 'tv', 'nightloo', 'medday'] }],
  };
  const trait = k => TRAITS.find(t => t.k === k) || null;
  // 依頼で あつかう 困りごと（よく 作りこんだ 4つ）。ほかの 困りごとは 前の 保存を 読む ためだけに のこす
  const FOCUS = ['light', 'intruder', 'toilet', 'medicine', 'heat', 'lonely'];
  // 大事に したい こと（気持ちメーターから 選ぶ。依頼書に のる）
  const CARE = [{ k:'anshin', icon:'😊', label:'安心', tip:'困りごとが おきないで、安心して くらせる こと' },
                { k:'shizuka', icon:'🤫', label:'静か', tip:'話しかけや メールが 多すぎない こと。夜は ゆっくり ねむれる こと' },
                { k:'privacy', icon:'🙈', label:'プライバシー', tip:'家に いる ときに、カメラで 見られない こと' },
                { k:'setsuden', icon:'🌱', label:'節電', tip:'だれも いない 部屋の 電気や ライトを、つけっぱなしに しない こと' }];
  // プロフィールから 出てくる 困りごと（② の 困りボタン。カードの じゅん）
  // 年齢カードの 困りごと（年を とるほど 暮らしの 困りごとが ふえる）。カードの 困りごとと あわせて ② の 一日に 出る
  const AGE_ISSUES = { 90:['light'], 95:['light', 'toilet'], 100:['light', 'toilet', 'medicine'] };
  const AGE_LIFE = { 90:'部屋の 電気を つけたまま 出る ことが ある', 95:'夜中に トイレに 起きる ことが ある', 100:'物忘れが 増えて、薬を 飲み忘れる ことも ある' };
  const ageNum = a => { const m = /(\d+)/.exec(String(a || '')); return m ? Number(m[1]) : 0; };
  const ageIssues = a => { const n = ageNum(a); return !n ? [] : n >= 100 ? AGE_ISSUES[100] : n >= 95 ? AGE_ISSUES[95] : AGE_ISSUES[90]; };
  function profIssues(s, age){
    const out = [];
    traitKeys(s).forEach(k => (trait(k).prof || []).forEach(i => { if(!out.includes(i) && FOCUS.includes(i)) out.push(i); }));
    ageIssues(age).forEach(i => { if(!out.includes(i) && FOCUS.includes(i)) out.push(i); });   // 年齢の ぶんは あとに
    // カードが 重なって 3つに たりない ときは 夜中の トイレ（→ 薬 → 電気）を 足す（2回目に 3つまで 選べる ように）。
    //   age が ない とき（チュートリアル）は 足さない
    if(age) ['toilet', 'medicine', 'light'].forEach(i => { if(out.length < 3 && !out.includes(i)) out.push(i); });
    return out;
  }
  function ageLife(a){ const n = ageNum(a); if(!n) return []; return [AGE_LIFE[90]].concat(n >= 95 ? [AGE_LIFE[95]] : [], n >= 100 ? [AGE_LIFE[100]] : []); }
  const profHobby = s => trait(traitKeys(s).find(k => trait(k).hobby) || '');
  // 依頼書の「生活の様子」「好きなもの」
  function profLife(s, age){
    const lines = traitKeys(s).map(k => trait(k).life).filter(Boolean).concat(ageLife(age));
    const iss = profIssues(s, age);                     // 足した 困りごとも 生活の ようすに
    if(iss.includes('toilet') && !lines.some(l => /トイレ/.test(l))) lines.push(AGE_LIFE[95]);
    if(iss.includes('medicine') && !lines.some(l => /薬/.test(l))) lines.push(AGE_LIFE[100]);
    return lines.join('。');
  }
  const profLikes = s => { const h = profHobby(s); return h ? h.label.replace(/^\S+\s/, '') : ''; };
  // 選んだ 性格から すすめる 困りごと → { issueKey: [性格の 名前, …] }
  function traitIssues(s){
    const out = {};
    traitKeys(s).forEach(k => { const t = TRAITS.find(x => x.k === k); t.issues.forEach(i => { (out[i] = out[i] || []).push(t.label); }); });
    return out;
  }
  // 一日の 中で 困りごとが おきそうな ところ（④ の「？」）。p は fixPlan した あとの 選び
  function dayHints(p){
    const up = p.wake + ((p.issues || []).includes('oversleep') ? 90 : 0);
    const out = [{ m:p.wake, icon:'⏰', text:'朝、ちゃんと 起きられる？', issues:['oversleep'] },
                 { m:up + 30, icon:'💊', text:'朝ごはんの あと、薬は 忘れない？', issues:['medicine', 'light'] }];
    if(p.out >= 0) out.push({ m:p.out, icon:'🚪', text:'出かける とき、かぎは？ 留守の 間は だいじょうぶ？', issues:['lock', 'intruder'] });
    out.push({ m:720, icon:'☀️', text:'暑い 昼。水は のんでる？ ごはんは 食べてる？', issues:['heat', 'lunch'] });
    out.push({ m:p.tv, icon:'💡', text:'部屋を 出る とき、電気は 消してる？', issues:['light'] });
    out.push({ m:p.sleep, icon:'🌙', text:'ねる 時間に ちゃんと ねられる？', issues:['night', 'light'] });
    return out.sort((a, b) => a.m - b.m);
  }
  // おじいさんが できること（チャッピーに 言われると する）。demo は teamhome-demo.js の 見本
  const ABILITIES = [
    { icon:'💡', name:'電気を 消す',     how:'「電気が ついてるよ」と 言われると、その 部屋へ 行って 消す', demo:'light_tell' },
    { icon:'🔒', name:'かぎを かける',   how:'「かぎが あいてるよ」と 言われると、玄関で かける', demo:'able_lock' },
    { icon:'💊', name:'薬を 飲む',       how:'「薬の 時間だよ」と 言われると、台所で のむ', demo:'voice_in' },
    { icon:'💧', name:'水を 飲む',       how:'「水を 飲んでね」と 言われると、台所で のむ', demo:'able_water' },
    { icon:'🍚', name:'ごはんを 食べる', how:'「ごはんですよ」と 言われると、台所で 食べる', demo:'able_eat' },
    { icon:'😴', name:'ねる',            how:'「ねる 時間ですよ」と 言われると、ベッドで ねる', demo:'able_sleep' },
    { icon:'🌅', name:'おきる',          how:'ねている ときに「おはよう」と 言われると、おきる', demo:'able_wake' },
    { icon:'📧', name:'外では メール',   how:'出かけていると 声は とどかない。スマホの メールなら とどく（電気・かぎ）', demo:'mail_out' },
  ];

  // ---------- 合格条件を 3つに 分けて 見せる（⚡ きっかけ → ⏱ ○分 以内に → 🎯 こう なれば ✔） ----------
  const GOAL_TEXT = { light_off:r => '💡 ' + r + 'の 電気が 消える', locked:() => '🔒 かぎが かかる', medicine:() => '💊 おじいさんが 薬を 飲む',
    water:() => '💧 おじいさんが 水を 飲む', eat:() => '🍚 おじいさんが ごはんを 食べる', sleep:() => '😴 おじいさんが ねる',
    intruder_gone:() => '🏃 知らない人が にげていく', mail_family:() => '📱 孫の スマホに 知らせが とどく', mail_grandpa:() => '📱 おじいさんの スマホに 知らせが とどく',
    foot_on:() => '🦶 足元ライトが ついて、足元が 明るい', foot_off:() => '🦶 足元ライトが 消える' };
  const ACT_GOAL = { fan:'🍃 涼しい 風が あたる（チャッピーの ファン）', camera:'📷 おじいさんの スマホで 家の 様子が 見られる（チャッピーの カメラ）',
    speak:'🗣️ チャッピーが しゃべる', mail_grandpa:'📱 おじいさんの スマホに メール', mail_family:'📱 孫の スマホに メール' };
  function critParts(c){
    const when = c.trig === 'lit_empty' ? '💡 ' + (c.room || '居間') + 'の 電気が ついていて、だれも いない'
      : c.trig === 'time' ? '⏰ ' + (c.from || '○:○○') + 'に なった'
      : c.trig === 'hot' ? '🌡️ ' + (c.temp || 30) + '℃ 以上に なった'
      : c.trig === 'unlocked_away' ? '🔓 出かけていて、かぎが あいている'
      : c.trig === 'unlocked' ? '🔓 かぎが あいている'
      : c.trig === 'intruder' ? '🕵 知らない人が 入ってきた'
      : c.trig === 'out' ? '🚶 おじいさんが 出かけた'
      : c.trig === 'night_walk' ? '🚽 夜中に おじいさんが トイレへ 歩きだした'
      : c.trig === 'foot_empty' ? '🦶 足元ライトが ついていて、だれも 歩いて いない'
      : '⚡ ' + trigText(c);
    const goal = c.act === 'speak' && c.res === 'intruder_gone' ? '🗣️ チャッピーの 声に おどろいて、知らない人が にげていく'
      : c.res && c.res !== 'none' && GOAL_TEXT[c.res] ? GOAL_TEXT[c.res](c.rroom || c.room || '居間')
      : c.act && ACT_GOAL[c.act] ? ACT_GOAL[c.act] : resText(c) || '';
    // 「15分 以内に」「そこから 15分 たつ までに」は 初見で わからない → きっかけ と 結果の あいだの 矢印に「遅くても 15分後 までに」
    const w = c.within || 30;
    return { when, within:limText(w), goal,
             withinWhy:w <= 5 ? '上の ことが おきたら、すぐ（' + w + '分 以内に）下の ように なれば ✔' : '上の ことが おきてから、遅くても ' + w + '分後 までに 下の ように なれば ✔（おそすぎると 間に合わない）' };
  }

  // ---------- 開発者の ヒント（こまったら 1つずつ ひらく） ----------
  function hintsFor(c){
    const R = c.room || '居間', say = (w, t) => '💬 しゃべる 言葉に『' + w + '』を 入れると、おじいさんが ' + t;
    if(c.trig === 'lit_empty') return [
      '「💡 電気がついている（' + R + '）」と「🚫 人がいない（' + R + '）」が 両方 あてはまる ときが 困りごと。どちらも『🧪 仮想だけ』に あるよ',
      'チャッピーは 電気を 消せない。' + say('電気', '消しに 来るよ') + '。出かけている ときは 声が とどかないので 📧 おじいさんに メール',
      '形の れい：🔁 ずっと → もし〔💡' + R + ' かつ 🚫' + R + '〕なら → 💬「' + R + 'の 電気が ついていますよ」'];
    if(c.trig === 'unlocked_away' || c.trig === 'unlocked') return [
      '「🔓 かぎが あいている」' + (c.trig === 'unlocked_away' ? 'と「🚶 おじいさんが 出かけている」が 両方 あてはまる とき' : 'の とき') + 'を さがそう（『🧪 仮想だけ』）',
      'チャッピーは かぎを かけられない。外の おじいさんには 声が とどかないので、📧 おじいさんの スマホに『かぎ』の メールを 送ろう',
      '形の れい：🔁 ずっと → もし〔🔓 かつ 🚶〕なら → 📧 おじいさんに「かぎが あいています」'];
    if(c.trig === 'out' && c.act === 'camera') return [
      '「👴 おじいさんが 家に いる」ブロックで、出かけて いるか しらべよう（『🧪 仮想だけ』）',
      '📷 カメラを つけると、おじいさんの スマホで 家の 様子が 見られるよ。家に いる ときは 消すと、プライバシーも まもれる',
      '形の れい：🔁 ずっと → もし〔👴 家に いる〕でなければ → 📷 カメラ つける ／ そうでなければ 📷 消す'];
    if(c.trig === 'intruder'){
      const act = c.res === 'mail_grandpa' || c.res === 'mail_family' ? ['📧 外に いる おじいさんの スマホに メールで 知らせよう（家の中の 声は 外に とどかない）', '📧 おじいさんに「家に 知らない人が います」']
        : c.act === 'camera' ? ['📷 カメラを つけると、おじいさんの スマホで 家の 様子が 見られるよ', '📷 カメラ つける']
        : ['チャッピーが しゃべると、知らない人は おどろいて にげるよ（言葉は なんでも よい）', '💬「だれですか！」'];
      return ['「🕵 知らない人が 家に いる」ブロックを つかおう（『🧪 仮想だけ』）', act[0], '形の れい：🔁 ずっと → もし〔🕵〕なら → ' + act[1]];
    }
    if(c.trig === 'night_walk' || c.trig === 'foot_empty') return [
      '「🦶 人が 歩いている（寝室〜トイレ）」で、おじいさんが 歩いて いるか しらべよう。夜中だけに するなら「時刻」も くらべよう（『🧪 仮想だけ』）',
      '「🦶 足元ライト つける」で 足元を 明るく。歩いて いない ときは「⏱ 10秒 待つ」→「🦶 足元ライト 消す」',
      '形の れい：🔁 ずっと → もし〔🦶 歩いている〕なら → 🦶 つける ／ そうでなければ → もし〔🦶 ついている〕なら ⏱ 10秒 → 🦶 消す'];
    if(c.trig === 'hot'){
      const fan = c.act === 'fan';
      return ['「🌡️ 温度(℃)」を『はんだん』の くらべる ブロックに 入れて、' + (c.temp || 30) + ' 以上か しらべよう',
        fan ? '🌀 ファンを つける ブロック。涼しく なったら「そうでなければ」で 消そう' : say('水', '台所で 水を 飲むよ'),
        '形の れい：🔁 ずっと → もし〔温度 ≥ ' + (c.temp || 30) + '〕なら → ' + (fan ? '🌀 ファン つける ／ そうでなければ 🌀 消す' : '💬「暑いので 水を 飲んでね」')];
    }
    if(c.trig === 'time'){
      const [h, m] = String(c.from || '8:00').split(':');
      const what = { medicine:[say('薬', '台所で 薬を 飲むよ'), '💬「薬を 飲む 時間ですよ」'],
        eat:[say('ごはん', '台所で 食べるよ'), '💬「ごはんですよ」'], sleep:[say('ねる 時間', 'ベッドへ 行くよ'), '💬「ねる 時間ですよ」'],
        mail_family:['📧 孫の スマホに メールで 知らせよう', '📧 孫に「起きて きません」'] }[c.res] || ['合格条件の「🎯」に なるように 知らせよう', '💬 しゃべる'];
      return ['📅「毎日 ○時○分に なったら」ブロックを「🔁 ずっと」の 中に 入れよう', what[0],
        '形の れい：🔁 ずっと → 📅 毎日 ' + Number(h) + '時' + m + '分 → ' + what[1]];
    }
    return ['合格条件の「⚡ きっかけ」を しらべる ブロックを さがそう', '「🎯」に なるように チャッピーに 知らせて もらおう', '🔁 ずっと → もし〔きっかけ〕なら → 知らせる'];
  }
  function hintsForDont(d){
    if(d.k === 'quiet_night') return ['ねたあとの 時間（' + (d.from || '22:00') + '〜' + (d.to || '6:00') + '）は しゃべらない ように しよう。📅 時刻の ブロックで 分けられるよ'];
    if(d.k === 'no_wake') return ['ねている おじいさんに 話しかけると 起きて しまう。ねる 時間に しゃべる ブロックが 動かないか 家で 確かめよう'];
    if(d.k === 'no_scare') return ['「👤 人がいる」は、おじいさんが 家に いる ときにも あてはまるよ', '「🕵 知らない人が 家にいる」ブロックなら、知らない人の ときだけ あてはまる（『🧪 仮想だけ』）'];
    if(d.k === 'mail_limit') return ['メールは 1日 ' + (d.n || 3) + '通まで。同じ 文の メールは つづけて 送っても 1通に まとまるよ'];
    return ['家で 一日 動かして、まもれているか 確かめよう'];
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
    if(c.trig === 'night_walk') return [IFP({ type:'and', left:S('foot_pir', true), right:S('hour', 5, '<') }, [{ type:'room_light', room:'足元', value:true }],
      [IFP(S('foot_lit', true), [{ type:'wait', value:10 }, IFP(S('foot_pir', false), [{ type:'room_light', room:'足元', value:false }])])])];
    if(c.trig === 'foot_empty') return [];                  // 上の night_walk の プログラムで いっしょに 消す
    if(c.trig === 'out' && c.act === 'camera') return [IFP(S('grandpa_in', false), [{ type:'camera', value:true }], [{ type:'camera', value:false }])];
    if(c.trig === 'intruder') return [IFP(S('stranger_in', true), [c.res === 'mail_family' ? { type:'mail', to:'family', value:'家に 知らない人が います' }
      : c.res === 'mail_grandpa' ? { type:'mail', to:'grandpa', value:'家に 知らない人が います' }
      : c.act === 'camera' ? { type:'camera', value:true } : { type:'speak', value:'だれですか！ 警察を よびますよ' }])];
    if(c.trig === 'hot') return [IFP(S('temp', c.temp || 30, '>='), [c.act === 'fan' ? { type:'fan', value:true } : { type:'speak', value:'暑いので 水を 飲んでね' }],
      c.act === 'fan' ? [{ type:'fan', value:false }] : [])];
    if(c.trig === 'time'){
      const f = toMin(c.from); if(f == null) return [];
      const act = { medicine:{ type:'speak', value:'薬を 飲む 時間ですよ' }, eat:{ type:'speak', value:'ごはんですよ' },
        sleep:{ type:'speak', value:'ねる 時間ですよ' }, mail_family:{ type:'mail', to:'family', value:'起きて きません' } }[c.res];
      return act ? [IFP({ calendar:true, all:[S('hour', Math.floor(f / 60)), S('minute', f % 60)] }, [act])] : [];
    }
    return [];
  }
  const sampleProgram = list => ({ actions:[{ type:'forever', actions:(list || []).reduce((a, c) => a.concat(sampleActs(c)), []) }] });
  // 「解決すると」の とちゅうに 出す 説明（チャッピーが どう 知らせて、おじいさんが どう 動いたか）。（れい）＝ やり方の 一例
  // 読み上げ・字幕の 時刻（8時、8時30分）
  const jt = m => { m = ((Math.round(m) % 1440) + 1440) % 1440; const h = Math.floor(m / 60), mm = m % 60; return h + '時' + (mm ? mm + '分' : ''); };
  // ナレーションの きまり：①チャッピーが 話す 前に「〜すると、チャッピーが 声を かけるよ」と 先に 言う（話した 後に 言いなおさない＝声が かさならない）
  //   ②✔ は おじいさんの 動きが おわってから。③1つの 文は 短く（字幕と 声が 同じ）
  function fixSteps(k, p, outM){
    const o = optOf(ISSUES.find(x => x.k === k), p) || [];
    const at = (m, narr, on) => ({ m, narr, on });
    const pre = (m, narr) => ({ m, narr, hold:2.5 });                   // 先に 言う（時計を 少し 止めて）
    const ok = (m, narr, on) => ({ m, narr, on, hold:3 });              // できごとが おきたら ✔
    if(k === 'medicine') return [pre(p.med - 1, '（れい）' + jt(p.med) + 'に なったら、チャッピーが 声を かけるよ。'),
                                 ok(p.med - 1, '✔ おじいさんが 思い出して、台所で 薬を 飲んだ。', 'gp:medicine')];
    if(k === 'intruder' && outM != null){
      if(o[0] === 'camera') return [pre(outM - 1, '（れい）おじいさんが 出かけると、チャッピーが カメラを つけるよ。'),
                                    ok(outM, '✔ 知らない人が 入ってきた。外の おじいさんは、スマホの 映像で 気づいた。', 'intruder:enter'),
                                    ok(outM, '🏃 おじいさんが 急いで 帰ってきた。知らない人は、あわてて にげて いった。', 'intruder:flee')];
      if(o[0] === 'mail') return [ok(outM, '🕵 知らない人が 入ってきた。チャッピーが 気づいて、メールを 送るよ。', 'intruder:enter'),
                                  ok(outM, '✔ 外に いる おじいさんの スマホに、知らせが とどいた。', 'mail:grandpa'),
                                  ok(outM, '🏃 おじいさんが 急いで 帰ってきた。知らない人は、あわてて にげて いった。', 'intruder:flee')];
      // 声で にげる：すぐ にげると 何が おきたか 見えないので、時計を 止めて 1つずつ 見せる（台本。プログラムは 動かさない）
      const M = outM + 50;
      return [{ m:M, when:'intruderInside', narr:'🕵 知らない人が 入ってきた！ チャッピーは どうするかな。', hold:8 },
              { m:M, when:'intruderSeen', speech:'だれですか！ 警察を よびますよ', speechMs:3800, noReact:true, hold:6, focus:4 },
              { m:M, wait:2.6, intruder:'leave', hold:5, narr:'✔ 知らない人は、チャッピーの 声に おどろいて、にげて いった。' }];
    }
    if(k === 'lock' && outM != null) return [pre(outM - 1, '（れい）かぎが あいたままなら、チャッピーが 外の おじいさんに メールするよ。'),
                                             ok(outM, '📱 おじいさんの スマホに「かぎが あいています」と とどいた。', 'mail:grandpa'),
                                             ok(outM, '✔ おじいさんが もどって、かぎを かけた。', 'lock:on')];
    if(k === 'light'){
      const room = o[0] || '居間', many = optsOf(ISSUES[0], p).length > 1;
      return [{ m:0, narr:'（れい）だれも いない 部屋の 電気が ついていたら、チャッピーが 知らせるよ。', wait:4, hold:2.5, early:true },
              ok(0, '✔ おじいさんが もどって、' + (many ? '' : room + 'の ') + '電気を 消した。', 'light:off')];
    }
    if(k === 'lunch') return [pre(719, '（れい）12時に なったら、チャッピーが 声を かけるよ。'), ok(719, '✔ おじいさんが 台所で 昼ごはんを 食べた。', 'gp:eat')];
    if(k === 'night') return [pre(p.sleep - 1, '（れい）ねる 時間に なったら、チャッピーが 声を かけるよ。'), ok(p.sleep - 1, '✔ おじいさんが ベッドで ねた。', 'gp:sleep')];
    if(k === 'toilet') return [pre(118, '（れい）夜中に 歩きだすと、チャッピーが 足元ライトを つけるよ。'),
      ok(119, '✔ 足元が 明るく なった。安心して トイレへ 行ける。', 'foot:on')].concat(((p.opts || {}).toiletG || '10') === '10' ? [ok(119, '✔ ベッドに もどって 10秒 たつと、足元ライトが 消えた。', 'foot:off')] : []);
    if(k === 'oversleep') return [pre(p.wake + 5, '（れい）いつもより おそく なっても 起きて こないと、チャッピーが 孫に メールするよ。'),
      ok(p.wake + 20, '✔ 孫の スマホに 知らせが とどいた。孫が 電話して くれる。', 'mail:family')];
    if(k === 'heat'){
      const out = [pre(749, '（れい）30℃を 超えたら、チャッピーが ' + (o[0] === 'fan' ? 'ファンを 回すよ。' : '声を かけるよ。'))];
      if(o[0] !== 'fan') out.push(ok(750, '✔ おじいさんが 台所で 水を 飲んだ。', 'gp:water'));
      if(o[0] !== 'water') out.push(ok(750, '✔ チャッピーの ファンで、涼しい 風が あたった。', 'fan:on'));
      return out;
    }
    return [];
  }
  // 家で「困る 様子」「解決すると」を 見る 見本の 台本（teamhome-demo の 台本と 同じ 形）。p は 選び、k は 困りごと
  function peekScene(p0, k, fix){
    const b = buildPlan(Object.assign({}, p0, { issues:[k] })), p = b.plan, I = ISSUES.find(x => x.k === k);
    const rows = b.schedule, rowM = act => (rows.find(e => e.act === act) || {}).m;
    const up = p.wake + (k === 'oversleep' ? 90 : 0);
    const room = (optOf(I, p) || [])[0];                // 電気は いちばん はじめの 部屋を 見せる
    const outM = rowM('out');
    // 困りごとが おきる 少し前から 見せる（電気：寝室＝起きる とき・台所＝テレビの 前・居間＝ねる 前）
    const focus = k === 'light' ? (room === '寝室' ? up - 3 : room === '台所' ? p.tv - 12 : p.sleep - 12)
      : k === 'lock' || k === 'intruder' ? (outM != null ? outM - 4 : 540)
      : k === 'toilet' ? 116 : k === 'medicine' ? p.med - 5 : k === 'heat' ? 745 : k === 'lunch' ? 715 : k === 'night' ? p.sleep - 5 : k === 'oversleep' ? p.wake - 5 : 600;
    const span = k === 'toilet' ? 14 : k === 'lock' || k === 'intruder' ? 120 : k === 'heat' ? 70 : k === 'light' && room === '寝室' ? 80 : 60;
    const crit = b.criteria.list, start = Math.max(0, focus);
    const events = [{ m:start + 1, narr:fix ? '✨ こう なれば 合格：' + crit.map(c => critParts(c).goal.replace(/^\S+\s/, '')).join('、') + '。' : '👀 ' + issueStory(I, p) + '。', hold:fix ? 3.5 : 3 }];
    // 👀 困る 様子：困る 瞬間を 時刻つきで 言う（何時に 何が おきる はずか わかる ように）
    if(!fix){
      const say = (m, narr) => { if(m > start + 1 && m < start + span) events.push({ m, narr, hold:3.5 }); };
      const lm = room === '寝室' ? up : room === '台所' ? p.tv : p.sleep;
      if(k === 'medicine') say(p.med, '⏰ ' + jt(p.med) + 'は 薬の 時間。でも おじいさんは 忘れて、薬を 飲まない。');
      if(k === 'lunch') say(720, '⏰ 12時は 昼ごはんの 時間。でも おじいさんは 食べない。');
      if(k === 'night') say(p.sleep, '⏰ ' + jt(p.sleep) + 'は ねる 時間。でも テレビを 見つづけて いる。');
      if(k === 'oversleep') say(p.wake, '⏰ ' + jt(p.wake) + 'は いつもの 起きる 時間。でも 起きて こない。');
      if(k === 'heat') say(752, '🌡️ 30℃を 超えた。でも おじいさんは ' + (((p.opts || {}).heat === 'fan') ? '涼しく しないで 我慢して いる。' : '水を 飲まない。'));
      if(k === 'light') say(lm + 1, '💡 ' + room + 'の 電気を つけたまま、おじいさんは 部屋を 出て いった。');
      if(k === 'lock' && outM != null) say(outM + 1, '🔓 おじいさんは かぎを かけずに 出かけて いった。');
      if(k === 'toilet') say(118, '🌙 夜中の 2時。足元が まっくらで、転びそう。');
    }
    if((k === 'lock' || k === 'intruder') && outM != null) events.push({ m:outM + 50, intruder:'come' });   // 見本では 知らない人は 台本で 来る
    // ✨ 電気：はじめに 家の 様子を 見る 時間を とる（チャッピーが すぐ しゃべらない ように）
    const look = fix && k === 'light';
    if(look){ events[0].wait = 4; events.unshift({ m:start + 1, narr:'👀 まず 様子を 見よう。どこの 電気が ついている？ おじいさんは どこに いる？', hold:5 }); }   // つぎの 説明は 見おわってから
    if(fix) fixSteps(k, p, outM).forEach(e => {
      if(e.early){ delete e.early; events.push(Object.assign(e, { m:start + 1 })); return; }   // はじめの 説明の すぐ あと（電気：チャッピーが 動く 前に）
      if(e.on && !e.m) e.m = start + 2;
      if(e.m < start + span) events.push(Object.assign(e, { m:Math.max(start + 2, e.m) }));
    });
    events.sort((a, b) => a.m - b.m);
    const scripted = fix && events.some(e => e.noReact);   // 台本で 見せる 見本は、プログラムを 動かさない（先に しゃべって しまうから）
    return { key:'peek', cap:'見本', start, end:start + span, rate:10, day:rows, view:k === 'light' ? '全体' : k === 'toilet' ? '寝室トイレ' : undefined,
      title:(fix ? '✨ 解決すると：' : '👀 困る 様子：') + I.icon + ' ' + I.title,
      what:fix ? 'チャッピーが 知らせると、こう なれば 合格（✔）。何を させるかは 開発チームが 考えます。' : issueStory(I, p) + '。このまま だと 困るね。',
      program:fix && !scripted ? sampleProgram(crit) : null, progAt:look ? start + 3 : undefined, events };
  }

  // ② 好きな こと（困らない カード）の 時刻：家に いる 15時。出かけていれば 夜 19時
  function hobbyMoment(p0){
    const p = fixPlan(p0).plan, home = m => p.out < 0 || m < p.out || m >= p.back;
    return home(900) ? 900 : 1140;
  }
  // ② 好きな ことの 見本（困りごとは おきない → 「これは 困りごとでは ないね」）
  function hobbyScene(p0, t){
    const b = buildPlan(p0), m = hobbyMoment(p0);
    return { key:'peek', cap:'見本', start:m - 3, end:m + 22, rate:10, day:b.schedule,
      title:'😊 好きな こと：' + t.label, what:t.doing + '。',
      events:[{ m:m - 2, narr:'😊 ' + t.doing + '。楽しそう！', hold:3 },
              { m:m + 10, narr:'困りごとは おきなかった。好きな ことは、困りごとでは ないね。', hold:3 }] };
  }
  // ④ しないでほしい ことを されると どう なるか（わざと そう する プログラムを 家で 動かす）
  const at = (m, acts) => IFP({ calendar:true, all:[S('hour', Math.floor(((m % 1440) + 1440) % 1440 / 60)), S('minute', ((m % 60) + 60) % 60)] }, acts);
  function dontScene(p0, k){
    const b = buildPlan(p0), p = b.plan;
    const sleepAt = p.issues.includes('night') ? p.sleep + 90 : p.sleep;
    const scene = (m, span, title, acts, events) => ({ key:'peek', cap:'見本', start:m - 4, end:m + span, rate:10, day:b.schedule,
      title:'🙅 されると 嫌：' + title, what:'こう されたら、おじいさんは いやだね。', program:{ actions:[{ type:'forever', actions:acts }] }, events });
    if(k === 'quiet_night'){
      const m = sleepAt + 90;
      return scene(m, 25, '夜中に しゃべる', [at(m, [{ type:'speak', value:'水を 飲んでね' }])],
        [{ m:m - 3, narr:'🌙 おじいさんは ぐっすり ねて いる。', hold:3 },
         { m:m - 3, on:'woken', narr:'😲 夜中に 話しかけられて、おじいさんが 起きて しまった！', hold:3 }]);
    }
    if(k === 'no_wake'){
      const m = p.wake + (p.issues.includes('oversleep') ? 90 : 0) - 40;
      return scene(m, 25, 'ねている ときに 起こす', [at(m, [{ type:'speak', value:'おはよう！ 朝ですよ' }])],
        [{ m:m - 3, narr:'🛏️ まだ 起きる 時間の 前。おじいさんは ねて いる。', hold:3 },
         { m:m - 3, on:'woken', narr:'😲 起きる 時間より 早く、起こされて しまった。', hold:3 }]);
    }
    if(k === 'mail_limit'){
      const m = p.out >= 0 ? p.out + 30 : 600;
      const texts = ['おはようございます', '今日は はれです', '水を 飲んでね', 'かぎは かけましたか', 'げんきですか'];
      return scene(m, 30, 'メールが 多すぎる', texts.map((t, i) => at(m + i * 5, [{ type:'mail', to:'grandpa', value:t }])),   // 5分おき（つづけて 送ると 1通に まとまる）
        [{ m:m - 3, narr:'📱 おじいさんの スマホに、メールが とどくよ。', hold:2.5 },
         { m:m + 21, narr:'😵 何通も とどいて、うるさい！ 大事な メールが わからなく なりそう。', hold:3 }]);
    }
    if(k === 'no_camera_home'){
      const m = p.out < 0 || 780 < p.out || 780 >= p.back ? 780 : p.back + 60;   // おじいさんが 家に いる 時刻
      return scene(m, 22, '家に いるのに カメラ', [{ type:'camera', value:true }],
        [{ m:m - 3, narr:'🏠 おじいさんは 家に いる。', hold:2.5 },
         { m:m + 6, narr:'📷 家に いるのに、カメラで ずっと 見られて いる。はずかしいね。', hold:3 }]);
    }
    return null;
  }

  // 家で 一日 ためす ときの はじめの 時刻（電気の 消し忘れは 暗く なる 前の 夕方 17:30 から。夜中の トイレは 21:30 から。ほかは 朝から＝null）
  function tryFrom(cr){
    const L = (cr && cr.list) || [];
    if(L.some(c => c.trig === 'lit_empty')) return 1050;
    if(L.some(c => c.trig === 'night_walk' || c.trig === 'foot_empty')) return 1290;
    return null;
  }

  global.TeamCheck = { ROOMS, TRIGGERS, ACTIONS, RESULTS, DONTS, find, hm, toMin, text, dontText, trigText, resText,
    inWin, stateKey, stateKeys, evaluate, sig, ICON, WORD, ISSUES, DAY_OPTS, PLAN_DEFAULT, DONT_OPTS, fixPlan, buildPlan, TEMPS, RULES,
    optOf, optsOf, issueStory, issueWant, lightMax,
    TRAITS, traitKeys, traitIssues, dayHints, ABILITIES, critParts, hintsFor, hintsForDont, sampleProgram, peekScene,
    GOALS, goalOf, tryFrom, FOCUS, CARE, PROFILE, profIssues, ageIssues, profHobby, profLife, profLikes, hobbyMoment, hobbyScene, dontScene };
})(window);
