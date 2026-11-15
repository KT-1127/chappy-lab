/* ⑤チームの ペルソナの顔：おじいさんの家（3D）の おじいさんと 同じ見た目
   白い髪・金ぶちの めがね・ピンクの ほほ・赤い マフラー・水色の カーディガン（えらぶと かわる）
   GrandpaFace.svg(大きさ, face) で <svg> の 文字列を 返す。face は ペルソナの face（なければ ふつうの おじいさん）
   face の つかいかた（サーバーの _clean_face と 同じ キー）：
     hairStyle＝髪型 ／ hair＝髪の色 ／ skin＝肌 ／ brows＝目 ／ nose＝口 ／ eyes＝めがね ／ face＝服の色 ／ mouth＝マフラー
   GrandpaFace.look(face) で 色と 形を かえす（家の 3D の おじいさんも 同じ 見た目に する） */
(function(global){
  'use strict';
  const LOOK = {
    hairStyle:[['ふさふさ', 'full'], ['うすい', 'thin'], ['なし', 'none'], ['みじかい', 'short'], ['ながめ', 'long']],
    hair:[['白', '#F4F4F4'], ['灰色', '#B9B9B9'], ['黒', '#4A4A4A'], ['茶色', '#7A5634']],
    skin:[['うすい', '#F8D9BD'], ['ふつう', '#F0C29C'], ['こい', '#DDA77E'], ['日やけ', '#C48A5E']],
    brows:[['まる', 'round'], ['にっこり', 'happy'], ['ほそめ', 'thin'], ['ぱっちり', 'big'], ['てん', 'dot']],
    nose:[['にっこり', 'smile'], ['大わらい', 'laugh'], ['むすっ', 'grump'], ['ひげ', 'beard']],
    eyes:[['あり', true], ['なし', false]],
    face:[['水色', '#8FB3D9'], ['緑', '#8CC59A'], ['茶色', '#C9A27A'], ['紺', '#4E5F8C'], ['えんじ', '#B5545C'], ['黄色', '#E6C86A']],
    mouth:[['赤', '#E36B57'], ['黄色', '#E8B84A'], ['緑', '#5FA77A'], ['青', '#5B7DB8'], ['なし', null]],
  };
  const KEYS = ['hairStyle', 'hair', 'skin', 'brows', 'nose', 'eyes', 'face', 'mouth'];
  const NAMES = { hairStyle:'💇 髪型', hair:'🎨 髪の 色', skin:'🙂 肌', brows:'👀 目', nose:'👄 口', eyes:'👓 めがね', face:'🧥 服の 色', mouth:'🧣 マフラー' };
  const DEF = { hairStyle:0, hair:0, skin:1, brows:0, nose:0, eyes:0, face:0, mouth:0 };
  const idx = (f, k) => { const n = Number((f || {})[k]); const L = LOOK[k].length; return f && Number.isFinite(n) ? ((Math.round(n) % L) + L) % L : DEF[k]; };
  function shade(h, a){
    const n = parseInt(h.slice(1), 16), c = v => Math.max(0, Math.min(255, v + a));
    return '#' + ((1 << 24) + (c(n >> 16) << 16) + (c((n >> 8) & 255) << 8) + c(n & 255)).toString(16).slice(1);
  }
  function look(f){
    const o = {}; KEYS.forEach(k => { o[k] = idx(f, k); });
    const skin = LOOK.skin[o.skin][1], hair = LOOK.hair[o.hair][1];
    return { hairStyle:LOOK.hairStyle[o.hairStyle][1], hair, brow:hair === '#F4F4F4' ? '#D4D4D4' : shade(hair, -10), skin, skinDark:shade(skin, -22),
             eye:LOOK.brows[o.brows][1], mouthKind:LOOK.nose[o.nose][1], glasses:LOOK.eyes[o.eyes][1], cardigan:LOOK.face[o.face][1], scarf:LOOK.mouth[o.mouth][1], idx:o };
  }
  // 目（左右）
  function eyesSVG(t){
    const D = '#3B2A20';
    return [40, 60].map(x => {
      if(t === 'happy') return '<path d="M' + (x - 5) + ' 47.5 Q' + x + ' 41 ' + (x + 5) + ' 47.5" stroke="' + D + '" stroke-width="2.6" fill="none" stroke-linecap="round"/>';
      if(t === 'thin') return '<path d="M' + (x - 5.5) + ' 46.5 L' + (x + 5.5) + ' 46.5" stroke="' + D + '" stroke-width="2.6" stroke-linecap="round"/><circle cx="' + x + '" cy="46.6" r="1.6" fill="' + D + '"/>';
      if(t === 'dot') return '<circle cx="' + x + '" cy="46.4" r="2.4" fill="' + D + '"/>';
      const big = t === 'big', rx = big ? 6.4 : 5.2, ry = big ? 6 : 4.6, ir = big ? 3.9 : 3.2;
      return '<ellipse cx="' + x + '" cy="46" rx="' + rx + '" ry="' + ry + '" fill="#fff"/><circle cx="' + x + '" cy="46.4" r="' + ir + '" fill="' + D + '"/>' +
             '<circle cx="' + (x + 1.2) + '" cy="45.2" r="1" fill="#fff"/>';
    }).join('');
  }
  // 口（ひげは 白い ひげ＋にっこり）
  function mouthSVG(t, hair){
    if(t === 'laugh') return '<path d="M42 60 Q50 70 58 60 Z" fill="#8A3A30" stroke="#A4483C" stroke-width="1.6" stroke-linejoin="round"/>';
    if(t === 'grump') return '<path d="M43 63 Q50 59 57 63" stroke="#A4483C" stroke-width="2.4" fill="none" stroke-linecap="round"/>';
    const smile = '<path d="M42 61 Q50 67 58 61" stroke="#A4483C" stroke-width="2.4" fill="none" stroke-linecap="round"/>';
    if(t === 'beard') return smile + '<path d="M38 57 Q44 53 50 56 Q56 53 62 57 Q58 61 50 59 Q42 61 38 57 Z" fill="' + hair + '"/>';
    return smile;
  }
  function svg(size, face){
    const s = size || 72, L = look(face), hs = L.hairStyle;
    const side = hs === 'none' ? '' : hs === 'short' ? '<ellipse cx="25.5" cy="38" rx="5" ry="8" fill="' + L.hair + '"/><ellipse cx="74.5" cy="38" rx="5" ry="8" fill="' + L.hair + '"/>'
      : hs === 'long' ? '<ellipse cx="25" cy="44" rx="8" ry="17" fill="' + L.hair + '"/><ellipse cx="75" cy="44" rx="8" ry="17" fill="' + L.hair + '"/>'
      : '<ellipse cx="26" cy="36" rx="8" ry="11" fill="' + L.hair + '"/><ellipse cx="74" cy="36" rx="8" ry="11" fill="' + L.hair + '"/>';
    const top = hs === 'full' || hs === 'long' ? '<path d="M24 38 Q26 15 50 14 Q74 15 76 38 Q68 25 50 25 Q32 25 24 38 Z" fill="' + L.hair + '"/>'
      : hs === 'short' ? '<path d="M26 33 Q30 18 50 18 Q70 18 74 33 Q66 24 50 24 Q34 24 26 33 Z" fill="' + L.hair + '"/>' : '';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="' + s + '" height="' + s + '" aria-label="おじいさん">' +
      (hs === 'long' ? '<path d="M24 40 Q22 70 34 74 L66 74 Q78 70 76 40 Z" fill="' + shade(L.hair, -12) + '"/>' : '') +   // うしろの 長い 髪
      '<path d="M12 100 Q14 76 50 74 Q86 76 88 100 Z" fill="' + L.cardigan + '"/>' +                          // カーディガン
      '<rect x="43" y="64" width="14" height="12" rx="5" fill="' + L.skinDark + '"/>' +                        // くび
      (L.scarf ? '<path d="M29 75 Q50 86 71 75 L72 83 Q50 95 28 83 Z" fill="' + L.scarf + '"/>' +             // マフラー
                 '<rect x="54" y="82" width="8" height="14" rx="3" fill="' + shade(L.scarf, -16) + '"/>' : '') +
      '<circle cx="23" cy="47" r="5.5" fill="' + L.skin + '"/><circle cx="77" cy="47" r="5.5" fill="' + L.skin + '"/>' +   // みみ
      '<circle cx="50" cy="45" r="27" fill="' + L.skin + '"/>' +                                                // かお
      side + top +                                                                                             // かみ
      '<path d="M33 38 Q39 35 45 37" stroke="' + L.brow + '" stroke-width="2.6" fill="none" stroke-linecap="round"/>' +   // まゆ
      '<path d="M55 37 Q61 35 67 38" stroke="' + L.brow + '" stroke-width="2.6" fill="none" stroke-linecap="round"/>' +
      eyesSVG(L.eye) +                                                                                         // め
      (L.glasses ? '<circle cx="40" cy="46" r="8" stroke="#B7A074" stroke-width="1.6" fill="none"/>' +       // めがね
                   '<circle cx="60" cy="46" r="8" stroke="#B7A074" stroke-width="1.6" fill="none"/>' +
                   '<path d="M48 46 L52 46" stroke="#B7A074" stroke-width="1.6"/>' : '') +
      '<ellipse cx="33" cy="58" rx="6" ry="3.6" fill="rgba(240,120,110,.45)"/><ellipse cx="67" cy="58" rx="6" ry="3.6" fill="rgba(240,120,110,.45)"/>' +   // ほほ
      '<path d="M48 53 Q50 56 52 53" stroke="' + shade(L.skin, -50) + '" stroke-width="1.6" fill="none" stroke-linecap="round"/>' +   // はな
      mouthSVG(L.mouthKind, L.hair) +                                                                         // くち
      '</svg>';
  }
  global.GrandpaFace = { svg, look, LOOK, KEYS, NAMES, DEF };
})(window);
