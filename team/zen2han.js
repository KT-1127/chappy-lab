/* 全角の数字（０〜９）を 打っても、そのまま 半角（0〜9）に なおす
   ・パスワード・時刻・メモ・ブロックの数（待つ秒数など）すべての 入力欄で はたらく
   ・日本語入力の 変換中は さわらず、変換が 決まってから なおす
   ・ブロックの 入力欄より 先に なおすため、capture（いちばん はじめ）で 受けとる */
(function(){
  'use strict';
  function isField(el){ return el && el.matches && el.matches('input, textarea') && typeof el.value === 'string'; }
  function fix(el){
    if(!isField(el) || !/[０-９]/.test(el.value)) return false;
    const s = el.selectionStart, e = el.selectionEnd;
    el.value = el.value.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    try{ if(s != null) el.setSelectionRange(s, e); }catch(err){}
    return true;
  }
  document.addEventListener('input', e => { if(!e.isComposing) fix(e.target); }, true);
  // 変換が 決まったとき：なおしたら、まわりにも 「かわった」と 知らせる
  document.addEventListener('compositionend', e => { if(fix(e.target)) e.target.dispatchEvent(new Event('input', { bubbles:true })); }, true);
})();
