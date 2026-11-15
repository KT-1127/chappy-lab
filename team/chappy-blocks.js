/* チャッピーのブロック定義・ツールボックス・プログラム変換（①つくる・④問題解決で共通）
   ★ブロックを増やす・変えるときは、このファイルだけを直す（①と④が自動でそろう）★ */
(function(global){

  function defineBlocks(){
    const B = Blockly.Blocks, F = Blockly.FieldDropdown;
    const FACES = [['ふつう','neutral'],['笑顔','happy'],['悲しい','sad'],['怒り','angry'],['眠い','sleepy'],['困り','doubt']];
    const ONOFF = [['つける','on'],['消す','off']];

    function sensor(name, label, color){
      B[name] = { init(){ this.appendDummyInput().appendField(label); this.setOutput(true,'Number'); this.setColour(color); } };
    }
    sensor('sc_distance','📏 きょり(cm)',174);
    sensor('sc_light','💡 明るさ',174);
    sensor('sc_temp','🌡️ 温度(℃)',174);
    sensor('sc_hour','🕐 いまの時(0-23)',174);
    sensor('sc_minute','🕐 いまの分(0-59)',174);
    B['sc_pir'] = { init(){ this.appendDummyInput().appendField('👤 人がいる'); this.setOutput(true,'Boolean'); this.setColour(174); } };
    B['sc_nopir'] = { init(){ this.appendDummyInput().appendField('🚫 人がいない'); this.setOutput(true,'Boolean'); this.setColour(174); } };
    B['sc_button_red'] = { init(){ this.appendDummyInput().appendField('🔴 赤ボタン'); this.setOutput(true,'Boolean'); this.setColour(174); } };
    B['sc_button_blue'] = { init(){ this.appendDummyInput().appendField('🔵 青ボタン'); this.setOutput(true,'Boolean'); this.setColour(174); } };
    B['sc_button_both'] = { init(){ this.appendDummyInput().appendField('🔴🔵 赤と青を同時におした'); this.setOutput(true,'Boolean'); this.setColour(174);
      this.setTooltip('赤ボタンと青ボタンの両方を いっしょに おしているとき「本当」になる'); } };

    // ---- 🧪 仮想だけ（実機にはない。仮想の家（⑤チームの「いえでためす」）でだけ動く）----
    const ROOM_PICK = [['寝室','寝室'],['台所','台所'],['居間','居間'],['玄関','玄関']];
    B['sc_mail'] = { init(){
      this.appendDummyInput().appendField('📧').appendField(new F([['孫','family'],['おじいさん','grandpa']]),'TO')
        .appendField('のスマホに メール').appendField(new Blockly.FieldTextInput('げんき？'),'TEXT');
      this.setPreviousStatement(true); this.setNextStatement(true); this.setColour(210);
      this.setTooltip('仮想の家の中で、孫か おじいさんの スマホに メールが届く（実機にはない）'); }};
    B['sc_room_light'] = { init(){
      this.appendDummyInput().appendField('💡').appendField(new F(ROOM_PICK),'ROOM').appendField('の電気').appendField(new F(ONOFF),'STATE');
      this.setPreviousStatement(true); this.setNextStatement(true); this.setColour(210);
      this.setTooltip('部屋の電気を つける・消す（実機にはない）'); }};
    B['sc_lock'] = { init(){
      this.appendDummyInput().appendField('🔒 玄関のかぎ').appendField(new F([['かける','on'],['あける','off']]),'STATE');
      this.setPreviousStatement(true); this.setNextStatement(true); this.setColour(210);
      this.setTooltip('玄関のかぎを かける・あける（実機にはない）'); }};
    // 家ぜんたいの ようす（チャッピーは 家じゅうを 見ている。仮想の家でだけ わかる）
    const houseSensor = (type, build, tip) => { B[type] = { init(){ build(this.appendDummyInput()); this.setOutput(true,'Boolean'); this.setColour(210); this.setTooltip(tip); } }; };
    houseSensor('sc_room_pir', d => d.appendField('👤 人がいる（').appendField(new F(ROOM_PICK),'ROOM').appendField('）'), 'その部屋に 人がいるとき「本当」（仮想の家だけ）');
    houseSensor('sc_room_nopir', d => d.appendField('🚫 人がいない（').appendField(new F(ROOM_PICK),'ROOM').appendField('）'), 'その部屋に だれもいないとき「本当」（仮想の家だけ）');
    houseSensor('sc_room_lit', d => d.appendField('💡 電気がついている（').appendField(new F(ROOM_PICK),'ROOM').appendField('）'), 'その部屋の電気が ついているとき「本当」（仮想の家だけ）');
    houseSensor('sc_door_open', d => d.appendField('🚪 玄関のドアが あいている'), '玄関のドアが あいているとき「本当」（仮想の家だけ）');
    houseSensor('sc_locked', d => d.appendField('🔒 かぎが かかっている'), '玄関のかぎが かかっているとき「本当」（仮想の家だけ）');
    houseSensor('sc_unlocked', d => d.appendField('🔓 かぎが あいている'), '玄関のかぎが あいているとき「本当」（仮想の家だけ）');
    // おじいさんか 知らない人かも わかる（仮想の家だけ）
    houseSensor('sc_grandpa_in', d => d.appendField('👴 おじいさんが 家に いる'), 'おじいさんが 家の中に いるとき「本当」（仮想の家だけ）');
    houseSensor('sc_grandpa_out', d => d.appendField('🚶 おじいさんが 出かけている'), 'おじいさんが 家の中に いないとき「本当」（仮想の家だけ）');
    houseSensor('sc_stranger_in', d => d.appendField('🕵 知らない人が 家に いる'), '知らない人が 家の中に いるとき「本当」（仮想の家だけ）');
    // 部屋ごとの 明るさ（数。くらべるブロックに 入れて「明るさ（台所） ＞ 100」のように使う）
    B['sc_room_bright'] = { init(){
      this.appendDummyInput().appendField('☀ 明るさ（').appendField(new F(ROOM_PICK),'ROOM').appendField('）');
      this.setOutput(true,'Number'); this.setColour(210);
      this.setTooltip('その部屋の明るさ（昼は 600。夜は 電気がついていると 350、消えていると 60）（仮想の家だけ）'); }};

    B['sc_face'] = { init(){
      this.appendDummyInput().appendField('😊 表情').appendField(new F(FACES),'FACE');
      this.setPreviousStatement(true); this.setNextStatement(true); this.setColour(16); }};
    B['sc_speak'] = { init(){
      this.appendDummyInput().appendField('💬 しゃべる').appendField(new Blockly.FieldTextInput('こんにちは'),'TEXT');
      this.setPreviousStatement(true); this.setNextStatement(true); this.setColour(16); }};
    B['sc_ai'] = { init(){
      this.appendDummyInput().appendField('🤖 AIとおはなし せいかく').appendField(new Blockly.FieldTextInput(''),'PROMPT');
      this.setPreviousStatement(true); this.setNextStatement(true); this.setColour(16); }};
    B['sc_camera'] = { init(){
      this.appendDummyInput().appendField('📷 カメラ').appendField(new F(ONOFF),'STATE');
      this.setPreviousStatement(true); this.setNextStatement(true); this.setColour(16); }};
    B['sc_pan'] = { init(){
      this.appendDummyInput().appendField('↔ 首よこ').appendField(new Blockly.FieldNumber(90,0,180),'ANGLE').appendField('°');
      this.setPreviousStatement(true); this.setNextStatement(true); this.setColour(16); }};
    B['sc_tilt'] = { init(){
      this.appendDummyInput().appendField('↕ 首たて').appendField(new Blockly.FieldNumber(15,0,30),'ANGLE').appendField('°');
      this.setPreviousStatement(true); this.setNextStatement(true); this.setColour(16); }};
    B['sc_led'] = { init(){
      this.appendDummyInput().appendField('💡 LED').appendField(new F(ONOFF),'STATE');
      this.setPreviousStatement(true); this.setNextStatement(true); this.setColour(16); }};
    B['sc_fan'] = { init(){
      this.appendDummyInput().appendField('🌀 ファン').appendField(new F(ONOFF),'STATE');
      this.setPreviousStatement(true); this.setNextStatement(true); this.setColour(16); }};
    B['sc_color'] = { init(){
      this.appendDummyInput().appendField('🎨 色').appendField(new F([
        ['くろ','black'],['あか','red'],['あお','blue'],['みどり','green'],
        ['きいろ','yellow'],['ピンク','pink'],['むらさき','purple'],['しろ','white']]),'COLOR');
      this.setPreviousStatement(true); this.setNextStatement(true); this.setColour(16); }};
    B['sc_wait'] = { init(){
      this.appendDummyInput().appendField('⏱ 待つ').appendField(new Blockly.FieldNumber(1,0.1,3600),'SEC').appendField('秒');
      this.setPreviousStatement(true); this.setNextStatement(true); this.setColour(16); }};
    B['sc_forever'] = { init(){
      this.appendDummyInput().appendField('🔁 ずっと');
      this.appendStatementInput('DO');
      this.setPreviousStatement(true); this.setColour(120); }};
    B['sc_until'] = { init(){
      this.appendValueInput('COND').setCheck('Boolean').appendField('🔁');
      this.appendDummyInput().appendField('になるまで くりかえす');
      this.appendStatementInput('DO');
      this.setPreviousStatement(true); this.setNextStatement(true); this.setColour(120);
      this.setInputsInline(true); }};
    B['sc_on_date'] = { init(){
      this.appendDummyInput().appendField('📅')
        .appendField(new Blockly.FieldNumber(10,1,12),'MONTH').appendField('月')
        .appendField(new Blockly.FieldNumber(25,1,31),'DAY').appendField('日');
      this.appendDummyInput().appendField(new Blockly.FieldNumber(10,0,23),'HOUR').appendField('時')
        .appendField(new Blockly.FieldNumber(0,0,59),'MIN').appendField('分になったら');
      this.appendStatementInput('DO');
      this.setPreviousStatement(true); this.setNextStatement(true); this.setColour(290);
      this.setTooltip('その日の、その時刻になった分のあいだに、中のブロックを1回だけ動かす。「🔁 ずっと」の中に入れて使う'); }};
    B['sc_on_week'] = { init(){
      this.appendDummyInput().appendField('🔁 毎週')
        .appendField(new F([['日曜','0'],['月曜','1'],['火曜','2'],['水曜','3'],['木曜','4'],['金曜','5'],['土曜','6']]),'WEEKDAY');
      this.appendDummyInput().appendField(new Blockly.FieldNumber(9,0,23),'HOUR').appendField('時')
        .appendField(new Blockly.FieldNumber(0,0,59),'MIN').appendField('分になったら');
      this.appendStatementInput('DO');
      this.setPreviousStatement(true); this.setNextStatement(true); this.setColour(290);
      this.setTooltip('毎週その曜日・その時刻になった分のあいだに、中のブロックを1回だけ動かす。「🔁 ずっと」の中に入れて使う'); }};
    B['sc_on_day'] = { init(){
      this.appendDummyInput().appendField('🔁 毎日');
      this.appendDummyInput().appendField(new Blockly.FieldNumber(8,0,23),'HOUR').appendField('時')
        .appendField(new Blockly.FieldNumber(0,0,59),'MIN').appendField('分になったら');
      this.appendStatementInput('DO');
      this.setPreviousStatement(true); this.setNextStatement(true); this.setColour(290);
      this.setTooltip('毎日その時刻になった分のあいだに、中のブロックを1回だけ動かす。「🔁 ずっと」の中に入れて使う'); }};
  }

  const toolbox = { kind:'categoryToolbox', contents:[
    { kind:'category', name:'センサー', colour:'174', contents:[
      {kind:'block',type:'sc_distance'},{kind:'block',type:'sc_light'},
      {kind:'block',type:'sc_temp'},{kind:'block',type:'sc_pir'},{kind:'block',type:'sc_nopir'},
      {kind:'block',type:'sc_button_red'},{kind:'block',type:'sc_button_blue'},{kind:'block',type:'sc_button_both'},
      {kind:'block',type:'sc_hour'},{kind:'block',type:'sc_minute'} ]},
    { kind:'category', name:'すう字', colour:'230', contents:[
      {kind:'block',type:'math_number'} ]},
    { kind:'category', name:'はんだん', colour:'40', contents:[
      {kind:'block', type:'controls_if', extraState:{ hasElse:true } },
      {kind:'block', type:'controls_if'},
      {kind:'block',type:'logic_compare'},
      {kind:'block',type:'logic_operation'},
      {kind:'block',type:'logic_boolean'} ]},
    { kind:'category', name:'うごき・はなす', colour:'16', contents:[
      {kind:'block',type:'sc_face'},{kind:'block',type:'sc_speak'},{kind:'block',type:'sc_ai'},{kind:'block',type:'sc_camera'},
      {kind:'block',type:'sc_pan'},{kind:'block',type:'sc_tilt'},
      {kind:'block',type:'sc_led'},{kind:'block',type:'sc_fan'},{kind:'block',type:'sc_color'},{kind:'block',type:'sc_wait'} ]},
    { kind:'category', name:'くりかえし', colour:'120', contents:[
      {kind:'block',type:'sc_forever'},
      {kind:'block',type:'controls_repeat_ext',
        inputs:{ TIMES:{ shadow:{ type:'math_number', fields:{ NUM:5 } } } } },
      {kind:'block',type:'sc_until'} ]},
  ]};

  const OP = { EQ:'==', NEQ:'!=', LT:'<', LTE:'<=', GT:'>', GTE:'>=' };
  const SENSOR = { sc_distance:'distance', sc_light:'light', sc_temp:'temp', sc_pir:'pir', sc_button_red:'button_red', sc_button_blue:'button_blue', sc_button_both:'button_both', sc_hour:'hour', sc_minute:'minute' };

  function blockChainToActions(block){
    const acts = [];
    while(block){ const a = oneBlockToAction(block); if(a) acts.push(a); block = block.getNextBlock(); }
    return acts;
  }
  function oneBlockToAction(b){
    const t = b.type;
    if(t==='sc_face') return {type:'face', value:b.getFieldValue('FACE')};
    if(t==='sc_speak') return {type:'speak', value:b.getFieldValue('TEXT')};
    if(t==='sc_ai') return {type:'ai', value:b.getFieldValue('PROMPT')};
    if(t==='sc_camera') return {type:'camera', value:b.getFieldValue('STATE')==='on'};
    if(t==='sc_pan') return {type:'pan', value:Number(b.getFieldValue('ANGLE'))};
    if(t==='sc_tilt') return {type:'tilt', value:Number(b.getFieldValue('ANGLE'))};
    if(t==='sc_led') return {type:'led', value:b.getFieldValue('STATE')==='on'};
    if(t==='sc_fan') return {type:'fan', value:b.getFieldValue('STATE')==='on'};
    if(t==='sc_color') return {type:'color', value:b.getFieldValue('COLOR')};
    if(t==='sc_wait') return {type:'wait', value:Number(b.getFieldValue('SEC'))};
    if(t==='sc_mail') return {type:'mail', value:b.getFieldValue('TEXT'), to:b.getFieldValue('TO') || 'family'};
    if(t==='sc_room_light') return {type:'room_light', room:b.getFieldValue('ROOM'), value:b.getFieldValue('STATE')==='on'};
    if(t==='sc_lock') return {type:'lock', value:b.getFieldValue('STATE')==='on'};
    if(t==='sc_forever'){
      const inner = b.getInputTargetBlock('DO');
      return {type:'forever', actions:inner ? blockChainToActions(inner) : []};
    }
    if(t==='controls_if') return buildIf(b);
    if(t==='controls_repeat_ext'){
      const times = numberFrom(b.getInputTargetBlock('TIMES')) || 5;
      const body = b.getInputTargetBlock('DO');
      return {type:'repeat', times, actions:body ? blockChainToActions(body) : []};
    }
    if(t==='sc_until'){
      const cond = parseCond(b.getInputTargetBlock('COND'));
      const body = b.getInputTargetBlock('DO');
      return {type:'until', condition:cond, actions:body ? blockChainToActions(body) : []};
    }
    if(t==='sc_on_date' || t==='sc_on_week' || t==='sc_on_day'){
      const all = t==='sc_on_date'
        ? [{sensor:'month', op:'==', value:Number(b.getFieldValue('MONTH'))}, {sensor:'day', op:'==', value:Number(b.getFieldValue('DAY'))}]
        : t==='sc_on_week' ? [{sensor:'weekday', op:'==', value:Number(b.getFieldValue('WEEKDAY'))}] : [];
      all.push({sensor:'hour', op:'==', value:Number(b.getFieldValue('HOUR'))}, {sensor:'minute', op:'==', value:Number(b.getFieldValue('MIN'))});
      const body = b.getInputTargetBlock('DO');
      return {type:'if', condition:{calendar:true, all}, then: body ? blockChainToActions(body) : [], else: []};
    }
    return null;
  }
  function buildIf(b){
    const cond = parseCond(b.getInputTargetBlock('IF0'));
    const then = b.getInputTargetBlock('DO0');
    const els = b.getInputTargetBlock('ELSE');
    return {type:'if', condition:cond, then:then?blockChainToActions(then):[], else:els?blockChainToActions(els):[]};
  }
  function parseCond(cmp){
    if(!cmp) return {sensor:'distance',op:'<',value:0};
    if(cmp.type==='logic_boolean') return {sensor:'button_red',op:'==',value:cmp.getFieldValue('BOOL')==='TRUE'};
    if(SENSOR[cmp.type]) return {sensor:SENSOR[cmp.type],op:'==',value:true};
    if(cmp.type==='sc_nopir') return {sensor:'pir',op:'==',value:false};   // 人がいない（実機も 人感＝0 で判定）
    // 家ぜんたいの ようす（仮想の家だけ）：センサーの名前に 部屋を つける（例：pir_台所・lit_居間）
    if(cmp.type==='sc_room_pir') return {sensor:'pir_' + cmp.getFieldValue('ROOM'), op:'==', value:true};
    if(cmp.type==='sc_room_nopir') return {sensor:'pir_' + cmp.getFieldValue('ROOM'), op:'==', value:false};
    if(cmp.type==='sc_room_lit') return {sensor:'lit_' + cmp.getFieldValue('ROOM'), op:'==', value:true};
    const HOUSE = { sc_door_open:'door_open', sc_locked:'locked' };
    if(HOUSE[cmp.type]) return {sensor:HOUSE[cmp.type], op:'==', value:true};
    if(cmp.type==='sc_unlocked') return {sensor:'locked', op:'==', value:false};
    if(cmp.type==='sc_grandpa_in') return {sensor:'grandpa_in', op:'==', value:true};
    if(cmp.type==='sc_grandpa_out') return {sensor:'grandpa_in', op:'==', value:false};
    if(cmp.type==='sc_stranger_in') return {sensor:'stranger_in', op:'==', value:true};
    if(cmp.type==='logic_operation'){
      const op=cmp.getFieldValue('OP')==='AND'?'and':'or';
      return {type:op, left:parseCond(cmp.getInputTargetBlock('A')), right:parseCond(cmp.getInputTargetBlock('B'))};
    }
    if(cmp.type!=='logic_compare') return {sensor:'distance',op:'<',value:0};
    const rawOp = OP[cmp.getFieldValue('OP')] || '<';
    const A = cmp.getInputTargetBlock('A'), B = cmp.getInputTargetBlock('B');
    // プログラムは「センサー 記号 数」の形で持つ。
    // 生徒が「数 記号 センサー」（例：28 < 温度）と置いたときは、
    // 左右を入れかえる分だけ 記号の向きも 反対にしないと、意味が逆になる。
    let sensor = null, value = 0, sensorOnRight = false;
    // センサーの名前（部屋の明るさは「light_台所」のように 部屋をつける）
    const sensorOf = x => !x ? null : SENSOR[x.type] || (x.type === 'sc_room_bright' ? 'light_' + x.getFieldValue('ROOM') : null);
    if(sensorOf(A)) sensor = sensorOf(A);
    if(sensorOf(B) && sensor === null){ sensor = sensorOf(B); sensorOnRight = true; }
    [A,B].forEach(x => { if(x && !sensorOf(x)){ const n = numberFrom(x); if(n != null) value = n; } });
    if(sensor === null) sensor = 'distance';
    const FLIP = { '<':'>', '>':'<', '<=':'>=', '>=':'<=', '==':'==', '!=':'!=' };
    return { sensor, op: sensorOnRight ? FLIP[rawOp] : rawOp, value };
  }
  function numberFrom(b){ return b && b.type==='math_number' ? Number(b.getFieldValue('NUM')) : null; }

  // ワークスペース → 実機に送る形。「ずっと」が2つ以上あれば並列スレッドに分ける
  function buildProgram(ws){
    if(!ws) return {actions:[]};
    const tops = ws.getTopBlocks(true).filter(b => !b.outputConnection);
    let actions = [];
    tops.forEach(t => { actions = actions.concat(blockChainToActions(t)); });
    const forevers = actions.filter(a => a.type === 'forever');
    if(forevers.length >= 2){
      const rest = actions.filter(a => a.type !== 'forever');
      return { actions: rest, threads: forevers.map(f => ({ actions: f.actions || [] })) };
    }
    return {actions};
  }

  // ⑤チーム だけに出す「📅 日付」の分（①と④には出さない）
  const teamToolbox = { kind:'categoryToolbox', contents: toolbox.contents.concat([
    { kind:'category', name:'📅 日付', colour:'290', contents:[
      {kind:'block',type:'sc_on_day'},{kind:'block',type:'sc_on_week'},{kind:'block',type:'sc_on_date'} ]},
    // 玄関の かぎは チャッピーが かけない（おじいさんに しゃべる・メールで 知らせると、おじいさんが かける）。sc_lock は 前のプログラムの ために 定義だけ 残す
    // 部屋の 電気も チャッピーは 消せない（知らせると、おじいさんが 消しに 来る）。sc_room_light も 定義だけ 残す
    { kind:'category', name:'🧪 仮想だけ', colour:'210', contents:[
      {kind:'block',type:'sc_mail'},
      {kind:'block',type:'sc_room_pir'},{kind:'block',type:'sc_room_nopir'},{kind:'block',type:'sc_room_lit'},{kind:'block',type:'sc_room_bright'},
      {kind:'block',type:'sc_locked'},{kind:'block',type:'sc_unlocked'},
      {kind:'block',type:'sc_grandpa_in'},{kind:'block',type:'sc_grandpa_out'},{kind:'block',type:'sc_stranger_in'} ]} ]) };   // 「玄関のドアが あいている」は かぎで 足りるので 出さない（前のプログラムの ために 定義は 残す）

  global.ChappyBlocks = { defineBlocks, toolbox, teamToolbox, buildProgram };
})(window);
