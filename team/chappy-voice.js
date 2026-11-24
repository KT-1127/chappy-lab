/* 声（読み上げ）：チャッピー・おじいさん・知らない人・ナレーションを、それぞれ ちがう 声に する
   ChappyVoice.speak(who, text[, force]) → Promise（言いおわったら）。who：'c' チャッピー ／ 'g' おじいさん ／ 'i' 知らない人 ／ 'n' ナレーション
   ・1つずつ じゅんばんに 話す（自分の 列）。キャラの せりふは、まちすぎたら（4.5秒）言わない ＝ 動きより おくれて 聞こえない
     おじいさん・知らない人は 同じ せりふを 8秒いないに くりかえさない。チャッピーは くりかえし 話す（しゃべり つづける プログラムは うるさく 聞こえる ＝ 問題に 気づける）。
     ただし くりかえしの せりふは busy() に 数えない（家の 時計を 止めない）。ナレーションは とばさない
   ・busy()：いま 話している／まっている せりふが ある（家は その あいだ 時計を 止めて、話と 動きが ずれない ように する）
   ・オン／オフは localStorage 'chappy_voice'（家の 画面と チームの ページで 同じ）。はじめは オフ
   ・パソコンに 入っている 日本語の 声から えらぶ（男性＝おじいさん・知らない人、女性＝ナレーション・チャッピー）。
     声が 1つしか なくても、高さ と 速さで 聞きわけられる */
(function(){
  'use strict';
  const SS = window.speechSynthesis, KEY = 'chappy_voice', MAXAGE = 4500, REPEAT = 8000;
  // VOICEVOX の 声：まず 作って ある ファイル（static/voice/）→ なければ サーバー（/api/voice）が 作る → だめなら ブラウザの 声
  const VDIR = ((document.currentScript && document.currentScript.src) || '').replace(/[^\/?#]*(\?.*)?$/, '') + 'voice/';
  const API = /^https?:$/.test(location.protocol) && !/github\.io$/.test(location.hostname) ? '/api/voice' : '';   // 体験版（サーバーなし）は ファイルだけ
  function fnv(t){ let h = 0x811c9dc5; for(const b of new TextEncoder().encode(t)){ h ^= b; h = Math.imul(h, 0x01000193) >>> 0; } return ('0000000' + h.toString(16)).slice(-8); }
  const vfile = (who, t) => VDIR + who + '_' + fnv(t) + '.wav';
  const vapi = (who, t) => API ? API + '?who=' + who + '&text=' + encodeURIComponent(t) : '';
  function prep(it){                                   // 先に 読みこみを はじめて おく（順番が 来たら すぐ 鳴る）
    if(it.au || typeof Audio === 'undefined') return;
    const a = new Audio(); a.preload = 'auto'; it.au = a; it.step = 0;
    a.onerror = () => { if(it.step === 0 && vapi(it.who, it.t)){ it.step = 1; a.src = vapi(it.who, it.t); } else it.fail = true; };
    a.src = vfile(it.who, it.t);
  }
  let curAu = null;
  let voices = [], Q = [], cur = null, held = false;
  const recent = {};
  function load(){ try{ voices = ((SS && SS.getVoices()) || []).filter(v => /^ja/i.test(v.lang || '')); }catch(e){ voices = []; } }
  if(SS){ load(); try{ SS.addEventListener('voiceschanged', load); }catch(e){ SS.onvoiceschanged = load; } }
  const MALE = /Ichiro|Keita|Naoki|Daichi|Otoya|Hattori|Takumi|男性|Male/i;
  const FEMALE = /Haruka|Ayumi|Sayaka|Nanami|Aoi|Mayu|Shiori|Kyoko|O-?ren|Mizuki|Kaori|女性|Female/i;
  const natFirst = arr => arr.slice().sort((a, b) => (/Natural|Online|Neural/i.test(b.name) ? 1 : 0) - (/Natural|Online|Neural/i.test(a.name) ? 1 : 0));
  function pick(who){
    const M = natFirst(voices.filter(v => MALE.test(v.name))), F = natFirst(voices.filter(v => FEMALE.test(v.name) && !MALE.test(v.name)));
    const A = natFirst(voices);
    if(who === 'g') return M[0] || A[0] || null;                    // おじいさん：男性（ひくく ゆっくり）
    if(who === 'i') return M[1] || M[0] || A[1] || A[0] || null;    // 知らない人：もう 1人の 男性（はやく）
    if(who === 'c') return F[1] || F[0] || A[0] || null;            // チャッピー：女性（高く はやく。ロボットらしく）
    return F[0] || A[0] || null;                                     // ナレーション：女性（ふつう）
  }
  const STYLE = { c:{ pitch:1.75, rate:1.15 }, g:{ pitch:0.55, rate:0.95 }, i:{ pitch:0.85, rate:1.3 }, n:{ pitch:1.0, rate:1.1 } };
  const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2300}-\u{23FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}\u{20E3}]/gu;
  // 読み上げる 文に なおす（画面の 文を そのまま 読むと、絵文字や 記号の 名前を 読んだり、1語ずつ 区切って 読んだり する）
  function clean(t){
    let s = String(t == null ? '' : t);
    s = s.replace(/（れい）|\(れい\)/g, '');
    s = s.replace(/一日|(?<![0-9０-９])[1１]日/g, 'いちにち');                                  // 「ついたち」と 読まない
    s = s.replace(/(\d{1,2}):(\d{2})/g, (m0, h, mm) => h + '時' + (mm === '00' ? '' : Number(mm) + '分'));   // 8:00 → 8時、8:30 → 8時30分
    s = s.replace(/〇〇|○○/g, 'その部屋');
    s = s.replace(EMOJI, ' ');
    s = s.replace(/[A-Za-z_]+:\S*/g, ' ');                                                        // できごとの しるし（gp:eat など）
    s = s.replace(/[→⇒➜]/g, '、').replace(/[・：]/g, '、');
    s = s.replace(/[「」『』（）()〔〕【】✔✖⬇↓★☆│┃|…]/g, ' ');
    s = s.replace(/\s+/g, ' ').trim();
    s = s.replace(/([^\x00-\x7F]) (?=[^\x00-\x7F])/g, '$1');                                     // わかち書きの すき間を つめる
    s = s.replace(/、[\s、]*、/g, '、').replace(/^[、\s]+|[、\s]+$/g, '');
    return s;
  }
  function on(){ try{ return localStorage.getItem(KEY) === '1'; }catch(e){ return false; } }
  function set(v){ try{ localStorage.setItem(KEY, v ? '1' : '0'); }catch(e){} if(!v) stop(); }
  function stop(){
    if(SS) try{ SS.cancel(); }catch(e){}
    if(curAu){ try{ curAu.pause(); }catch(e){} curAu = null; }
    const q = Q; Q = []; q.forEach(it => it.res(false));
    if(cur){ const c = cur; cur = null; c.res(false); }
  }
  // 列の 先頭を 話す（おそすぎる キャラの せりふは すてる）
  function pump(){
    if(cur || held || !Q.length) return;
    let it = null;
    while(Q.length){
      it = Q.shift();
      if(it.who !== 'n' && Date.now() - it.at > MAXAGE){ it.res(false); it = null; continue; }
      break;
    }
    if(!it) return;
    cur = it;
    let fin = false;
    const end = () => { if(fin) return; fin = true; if(curAu === it.au && it.au){ try{ it.au.pause(); }catch(e){} curAu = null; } if(cur === it) cur = null; it.res(true); setTimeout(pump, 150); };
    const browser = () => {                            // ブラウザの 声
      if(fin) return;
      if(!SS || !window.SpeechSynthesisUtterance){ setTimeout(end, 600 + it.t.length * 120); return; }
      const u = new SpeechSynthesisUtterance(it.t), s = STYLE[it.who] || STYLE.n, v = pick(it.who);
      u.lang = 'ja-JP'; if(v) u.voice = v; u.pitch = s.pitch; u.rate = s.rate;
      u.onend = end; u.onerror = end;
      try{ SS.speak(u); }catch(e){ end(); }
    };
    setTimeout(end, 4000 + it.t.length * 300);                      // 声が 出ない パソコンでも 先へ すすむ（VOICEVOX で 作る 時間も ふくむ）
    prep(it);
    const a = it.au;
    if(!a || it.fail){ browser(); return; }
    curAu = a;
    a.onended = end;
    const tryPlay = () => { if(fin) return; const p = a.play(); if(p && p.catch) p.catch(() => { curAu = null; browser(); }); };
    const oldErr = a.onerror;
    a.onerror = () => { oldErr && oldErr(); if(it.fail){ curAu = null; browser(); } else a.oncanplay = () => { a.oncanplay = null; tryPlay(); }; };
    if(a.readyState >= 2) tryPlay(); else a.oncanplay = () => { a.oncanplay = null; tryPlay(); };
  }
  function speak(who, text, force){
    return new Promise(res => {
      const t = clean(text);
      if(!t || !(force || on())) return res(false);
      if(!voices.length) load();
      let rep = false;
      if(who !== 'n'){
        const k = who + ':' + t, now = Date.now();
        rep = !!(recent[k] && now - recent[k] < REPEAT);
        recent[k] = now;
        if(rep && who !== 'c') return res(false);                     // おじいさん・知らない人の くりかえし
        if(rep && ((cur && cur.t === t) || Q.some(x => x.t === t))) return res(false);   // 話している／まっている ものと 同じなら かさねない
        if(Q.filter(x => x.who !== 'n').length >= 3) return res(false);
      }
      const it = { who, t, at:Date.now(), res, rep };
      Q.push(it); prep(it);
      pump();
    });
  }
  function pause(p){
    held = !!p;
    if(curAu){ try{ p ? curAu.pause() : curAu.play(); }catch(e){} }
    if(SS) try{ p ? SS.pause() : SS.resume(); }catch(e){}
    if(!p) pump();
  }
  const busy = () => !!(cur && !cur.rep) || Q.some(x => !x.rep);
  const busyNarr = () => !!(cur && cur.who === 'n') || Q.some(x => x.who === 'n');   // ナレーションだけ（家は ナレーションの ときだけ 少し 止める）
  window.ChappyVoice = { speak, on, set, stop, pause, clean, busy, busyNarr, voices:() => voices.map(v => v.name) };
})();
