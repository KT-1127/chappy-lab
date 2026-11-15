/* おじいさんの「一日の予定」（依頼者が決める）
   ・予定の形：時刻・する・場所・着いた部屋の電気・出た部屋の電気・かぎ（表情は 決めない。ねむるときだけ 目を とじる）
   ・玄関の かぎは 最初 かかっている。「そとへ出る」「家に帰る」の 行で かけるか どうか きめる
   ・電気は 「消す」と 決めたときだけ 消える（部屋を出ても 自動では消えない）
   ・保存するときは clean() で 形を そろえる（へんな値や長すぎる文は 直して保存する。データは消さない）
   ・表は renderRows() で作り、readRows() で 読みとる */
(function(global){
  'use strict';

  const ACTS = [['go', '行く'], ['sit', 'ソファにすわる'], ['eat', '台所で食べる'], ['out', 'そとへ出る'], ['home', '家に帰る'], ['sleep', 'ねる'], ['wake', 'おきる']];
  const ROOMS = ['寝室', '台所', '居間', '玄関'];
  // 場所が きまっている「する」（えらぶと 場所は 自動で これになり、変えられない）
  const FIXED_ROOM = { sleep:'寝室', wake:'寝室', sit:'居間', eat:'台所', out:'玄関', home:'玄関' };
  // 電気は 2つ：light＝着いた部屋（場所の列の部屋）、leave＝出た部屋（ひとつ前の行の部屋）
  const LIGHTS = [['keep', 'そのまま'], ['auto', '暗いとつける'], ['on', 'つける'], ['off', '消す']];
  // 玄関の かぎ（そとへ出る・家に帰る の 行だけ）。lock＝かける、open＝かけない
  const LOCK_OUT = [['lock', 'かける'], ['open', 'かけない']];
  const LOCK_HOME = [['lock', 'かける'], ['open', 'あけたまま']];
  const MAX_ROWS = 40, MAX_TEXT = 30;

  // 最初の一日（朝6時から、次の朝6時まで）
  const DEFAULT = [
    { m:0,    act:'sleep', room:'寝室', light:'keep', text:'ねている' },
    { m:360,  act:'wake',  room:'寝室', light:'keep', text:'おきる' },
    { m:420,  act:'go',    room:'台所', light:'keep', text:'朝ごはんを作る' },
    { m:480,  act:'go',    room:'台所', light:'keep', text:'薬をのむ' },
    { m:540,  act:'out',   room:'玄関', light:'keep', text:'おでかけ' },
    { m:1020, act:'home',  room:'玄関', light:'keep', text:'かえってきた' },
    { m:1080, act:'go',    room:'台所', light:'auto', text:'夕ごはんを作る' },
    { m:1200, act:'sit',   room:'居間', light:'auto', text:'テレビを見る' },
    { m:1320, act:'sleep', room:'寝室', light:'off',  text:'ねる' },
  ];

  const ACT_SET = new Set(ACTS.map(a => a[0]));
  const ROOM_SET = new Set(ROOMS);
  const LIGHT_SET = new Set(LIGHTS.map(l => l[0]));

  // 保存・読みこみのための 形そろえ（どんな入力でも 安全な形にする）
  function clean(list){
    if(!Array.isArray(list)) return clean(DEFAULT);
    const out = [];
    list.slice(0, MAX_ROWS).forEach(e => {
      if(!e || typeof e !== 'object') return;
      let m = Math.round(Number(e.m));
      if(!isFinite(m)) return;
      m = ((m % 1440) + 1440) % 1440;
      const act = ACT_SET.has(e.act) ? e.act : 'go';
      out.push({
        m,
        act,
        room: FIXED_ROOM[act] || (ROOM_SET.has(e.room) ? e.room : '居間'),
        light: act !== 'out' && LIGHT_SET.has(e.light) ? e.light : 'keep',      // そとへ出るときは 着いた部屋が ない
        leave: e.leave === 'off' ? 'off' : 'keep',
        lock: act === 'out' || act === 'home' ? (e.lock === 'open' ? 'open' : 'lock') : 'keep',
        text: String(e.text == null ? '' : e.text).slice(0, MAX_TEXT),
      });
    });
    out.sort((a, b) => a.m - b.m);
    out.forEach((e, i) => { if(!fromRoom(out, i)) e.leave = 'keep'; });
    return out.length ? out : clean(DEFAULT);
  }
  // その行で「出る部屋」＝ ひとつ前の行の部屋（1行目は 前の日の 最後の行）。外から帰るときや 同じ部屋のままなら なし
  function fromRoom(list, i){
    const e = list[i];
    if(!e || e.act === 'home' || list.length < 2) return null;
    const prev = list[i > 0 ? i - 1 : list.length - 1];
    if(prev.act === 'out') return null;
    const to = e.act === 'out' ? null : e.room;
    return prev.room !== to ? prev.room : null;
  }

  const hm = m => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));
  function opts(list, cur){ return list.map(([v, l]) => '<option value="' + v + '"' + (v === cur ? ' selected' : '') + '>' + l + '</option>').join(''); }
  const NONE = (cls, why) => '<select class="' + cls + '" disabled title="' + why + '"><option value="keep">ー</option></select>';

  // 表（editable なら 編集できる。読むだけ なら 見るだけ）
  function renderRows(list, editable){
    const dis = editable ? '' : ' disabled';
    return list.map((e, i) => {
      const fixed = FIXED_ROOM[e.act], room = fixed || e.room, from = fromRoom(list, i);
      const prev = list[i > 0 ? i - 1 : list.length - 1];
      const noFrom = e.act === 'home' || (prev && prev.act === 'out') ? '外から 帰るので、出た部屋は ありません' : '前と 同じ部屋なので、出た部屋は ありません';
      const roomOpts = ROOMS.map(r => '<option' + (r === room ? ' selected' : '') + '>' + r + '</option>').join('');
      const roomDis = fixed ? ' disabled title="「' + ACTS.find(a => a[0] === e.act)[1] + '」は ' + fixed + 'で きまりです"' : dis;
      return '<tr data-i="' + i + '" data-text="' + esc(e.text || '') + '">' +     // メモの列は なし（前に書いたメモは 消さずに とっておく）
        '<td><input type="time" class="ptime" value="' + hm(e.m) + '"' + dis + '></td>' +
        '<td><select class="pact"' + dis + '>' + opts(ACTS, e.act) + '</select></td>' +
        '<td><select class="proom"' + roomDis + '>' + roomOpts + '</select></td>' +
        '<td>' + (e.act === 'out' ? NONE('plight', '外へ出るので、着いた部屋は ありません')
                                  : '<select class="plight"' + dis + '>' + opts(LIGHTS, e.light) + '</select>') + '</td>' +
        '<td>' + (from ? '<select class="pleave"' + dis + '>' + opts([['keep', 'そのまま'], ['off', from + 'を消す']], e.leave) + '</select>'
                       : NONE('pleave', noFrom)) + '</td>' +
        '<td>' + (e.act === 'out' || e.act === 'home'
                   ? '<select class="plock"' + dis + '>' + opts(e.act === 'out' ? LOCK_OUT : LOCK_HOME, e.lock) + '</select>'
                   : NONE('plock', 'かぎは「そとへ出る」「家に帰る」の 行で きめます')) + '</td>' +
        (editable ? '<td><button class="pdel" title="この行を消す">🗑</button></td>' : '') + '</tr>';
    }).join('');
  }
  function readRows(root){
    const rows = [...root.querySelectorAll('tbody tr')];
    return clean(rows.map(tr => {
      const m = /^(\d{1,2}):(\d{2})$/.exec(tr.querySelector('.ptime').value) || [0, 0, 0];
      return {
        m: Number(m[1]) * 60 + Number(m[2]),
        act: tr.querySelector('.pact').value,
        room: tr.querySelector('.proom').value,
        light: tr.querySelector('.plight').value,
        leave: tr.querySelector('.pleave').value,
        lock: tr.querySelector('.plock').value,
        text: tr.dataset.text || '',
      };
    }));
  }

  // 予定の1行を ことばで（画面の下の「いま」の説明に使う）
  function describe(e){
    if(!e) return '';
    if(e.act === 'go') return e.room + 'へ行く';
    const a = ACTS.find(x => x[0] === e.act);
    return a ? a[1] : e.act;
  }

  global.TeamHomePlan = { ACTS, ROOMS, FIXED_ROOM, LIGHTS, DEFAULT, MAX_ROWS, clean, fromRoom, renderRows, readRows, describe, hm };
})(window);
