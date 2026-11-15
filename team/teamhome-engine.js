/* チャッピーのいえ：動きのエンジン（依頼者ページ・開発者ページの 両方で使う）
   ・role=request（依頼者）：おじいさんの一日を決める・見本を見る・保存は親のページへ送る
   ・role=dev（開発者）：親のページから届いたプログラムを、おじいさんの一日の中で動かす
   ・人・ドア・カギ・電気・知らない人は 家の中のルールで動く。チャッピーの反応は、プログラム（開発者）か 見本（依頼者）が決める */
(function(){
  'use strict';
  const T = THREE;
  const L = TeamHome.LAYOUT;
  const P = TeamHomePlan;
  const $ = id => document.getElementById(id);
  const ROLE = (new URLSearchParams(location.search)).get('role') === 'dev' ? 'dev' : 'request';
  const EMBED = !!window.parent && window.parent !== window;
  const DAY_MIN = 1440, DAY_START = 360;                      // 1日は 朝6時から
  const RAD = Math.PI / 180;
  const DOOR = { x:1.5, z:4.0 };                              // 玄関のドアの まんなか
  const DOOR_OPEN = 1.45;                                     // ドアを ひらいた角度（ラジアン）
  const VIEWS = {
    '全体': { x:0.3, y:0.3, z:0.9, r:18.5, theta:0.72, phi:0.74 },
    '居間': { x:-2.5, y:0.5, z:1.8, r:7.5, theta:0.9, phi:0.85 },
    '台所': { x:2.5,  y:0.5, z:-2.0, r:7.5, theta:2.2, phi:0.85 },
    '寝室': { x:-2.5, y:0.5, z:-2.0, r:7.5, theta:2.2, phi:0.85 },
    '玄関': { x:1.5,  y:1.0, z:3.0, r:6.5, theta:0.5, phi:0.95 },
  };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const wrapAngle = a => Math.atan2(Math.sin(a), Math.cos(a));
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));
  const clockText = m => { const t = Math.floor(m) % DAY_MIN; return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); };

  // ---------- 状態 ----------
  let vmin = DAY_START, dayStart = DAY_START, rate = 10;
  let running = false, manual = false, mode3p = false, appliedKey = null, dirty = false;
  let tblEdit = false;                                  // 依頼者が 表を 直接 なおす（発展）。ふつうは チームのページで えらんで つくる
  let schedule = P.clean(null);
  let prog = null;                                            // 開発者ページ：親から届いたプログラム
  const btn = { red:false, blue:false };
  const keys = {};
  let prevPaint = null, runner = null, world = null, camera = null, stageEl = null, bubble = null, lastLock = null;
  let demo = null, tween = null, statics = [];
  let follow = true, followZoom = 1, camDrag = false;        // 🎥 おじいさんを 追う（カメラが いつも おじいさんの 近くに いる）
  let personaName = '';                                       // 依頼者が つくった おじいさんの 名前（「〇〇さんの 一日」）
  const pops = [];                                            // ポップ（「💡 ついた」など、できごとを 小さく 見せる）
  const ckPrev = { plain:[], program:[], allOk:false };       // 合格条件の 前の 判定（✔ に かわったら いわう）
  const orbit = { theta:VIEWS['全体'].theta, phi:VIEWS['全体'].phi, r:VIEWS['全体'].r, target:new T.Vector3(VIEWS['全体'].x, VIEWS['全体'].y, VIEWS['全体'].z) };
  // おじいさん：away ＝ 家の外へ出きった（見えない）。pose ＝ stand / sit（ソファ）/ lie（ベッド）/ eat（台所のいす）
  const persona = { x:0, z:0, rot:0, pitch:0, queue:[], onDone:null, phase:0, away:false, outing:false, pose:'stand',
                    eatT:0, headYaw:0, hearQ:[], hearCur:null, did:{}, farAt:null };   // hearQ：あとで する たのみ ／ did：さいごに した 時刻（薬・水・ごはん）
  const intr = { x:0, z:0, rot:0, queue:[], onDone:null, phase:0, active:false, fleeing:false, turnAway:false, hideT:null };
  const door = { angle:0, wanted:false, closeT:0 };
  const lights = { 寝室:false, 台所:false, 居間:false, 玄関:false };
  // スマホは 2台（孫・おじいさん）。メールは それぞれに とどく
  const phone = { inbox:{ family:[], grandpa:[] }, owner:'family', unread:0, tab:'mail', open:false, lastCam:0 };
  const PHONE_NAME = { family:'孫のスマホ', grandpa:'おじいさんのスマホ' };
  let lastMailN = 0;

  // ---------- 歩けるところ ----------
  const DOOR_ZONES = [
    [-3.2, -2.2, -0.25, 0.25], [2.2, 3.2, -0.25, 0.25],
    [-0.25, 0.25, -2.5, -1.5], [-0.25, 0.25, 1.5, 2.5],
    [1.0, 2.0, 3.8, 4.4],
  ];
  function walkable(x, z){
    for(const k of L.ROOM_ORDER){
      const r = L.ROOMS[k];
      if(x >= r.x0 + 0.2 && x <= r.x1 - 0.2 && z >= r.z0 + 0.2 && z <= r.z1 - 0.2) return true;
    }
    for(const [a, b, c, d] of DOOR_ZONES) if(x >= a && x <= b && z >= c && z <= d) return true;
    return x >= 0.6 && x <= 2.4 && z >= 4.0 && z <= 7.2;
  }

  // ---------- 道すじ ----------
  function route(fromRoom, toRoom){
    if(fromRoom === toRoom) return [];
    const prev = { [fromRoom]: null }, queue = [fromRoom];
    while(queue.length){
      const r = queue.shift();
      if(r === toRoom) break;
      L.DOORS.forEach(d => {
        const n = d.a === r ? d.b : (d.b === r ? d.a : null);
        if(n && !(n in prev)){ prev[n] = { from:r, door:d }; queue.push(n); }
      });
    }
    const steps = [];
    let cur = toRoom;
    while(prev[cur] && cur !== fromRoom){ steps.unshift({ x:prev[cur].door.x, z:prev[cur].door.z }); cur = prev[cur].from; }
    return steps;
  }
  function pathTo(w, room, finalPt){
    const q = [];
    let here = L.roomAt(w.x, w.z);
    if(!here && w.z > 4){ q.push({ x:L.FRONT_DOOR.x, z:L.FRONT_DOOR.z - 0.5 }); here = '玄関'; }
    route(here || '玄関', room).forEach(p => q.push(p));
    q.push(finalPt || L.ROOMS[room].spot);
    return q;
  }
  function pathOut(w){
    const here = L.roomAt(w.x, w.z);
    if(!here && w.z > 4) return [L.OUTSIDE];
    const q = route(here || '玄関', '玄関');
    q.push({ x:L.FRONT_DOOR.x, z:L.FRONT_DOOR.z - 0.5 }, L.OUTSIDE);
    return q;
  }
  // 立ちどまって する 動きの とちゅうで べつの 動きに なったら、その 動き（かぎを かける）は すませてから
  function finishPause(w){
    if(!(w.pauseT > 0)) return;
    const f = w.afterPause; w.pauseT = 0; w.afterPause = null; w.lockAnim = false;
    if(f) f();
  }
  function placeWalker(w, p){ finishPause(w); w.x = p.x; w.z = p.z; w.queue = []; w.onDone = null; }
  // おじいさんの 歩く速さ。動いている あいだは 時計が 止まる（holdClock）ので、いつも 同じ 速さで よい
  let walkMul = 1;
  function personaSpeed(){ return 2.2; }
  // 時計を 止める：おじいさん・知らない人が 動いている あいだ（予定の 時刻ぴったりに 動きが おわる。動きが まざらない）
  let holdT = 0;
  // チャッピーが しゃべって いる あいだも 時計を 止める（「しゃべる」を 2つ つづけても、2つめが 何十分も おくれない ように）。
  // ずっと しゃべりつづける プログラムでも 一日が 止まらない ように、止められるのは 家の 5分ごとに 1秒（たまるのは 6秒まで）
  let talkBudget = 6, talkRepeat = false, lastTalk = { text:'', at:-999 };
  function holdClock(dt){
    const busy = (!persona.away && (persona.queue.length > 0 || persona.pauseT > 0)) || persona.reacting || door.angle > 0.05 ||   // ドアが あいている あいだも 止める
                 (intr.active && (intr.queue.length > 0 || intr.freeze > 0 || intr.turnAway));
    const talking = !!robotState().speech && !talkRepeat && talkBudget > 0;   // 同じ ことばの くりかえしでは 止めない
    if(talking) talkBudget -= dt;
    if(!busy && talking) return true;
    if(!busy){ holdT = 0; return false; }
    holdT += dt;
    return holdT < 20;                                  // 20秒 たっても 動きが おわらなければ 時計を すすめる（とまり防止）
  }

  // 向きを なめらかに変える
  function turnTo(w, dt, mul){
    if(w.want === undefined) return;
    const diff = wrapAngle(w.want - w.rot), mx = 5 * dt * (mul || 1);
    w.rot += clamp(diff, -mx, mx);
  }
  // ドアの ところで、ドアが開くまで 待つ（すり抜けない）
  function doorHold(w){
    if(door.angle > 0.9) return false;
    if(Math.hypot(w.x - DOOR.x, w.z - DOOR.z) > 0.9) return false;
    const next = w.queue[0];
    if(!next) return false;
    return (w.z - DOOR.z) * (next.z - DOOR.z) < 0;
  }
  // 急いでいるとき（予定が つまっている・1秒＝30分 など）は、その場で 回らずに 向きを変え、1回で いくつもの 曲がり角を すすむ
  // 歩く道の とちゅうで 立ちどまって する 動き（かぎを かける など）。点に pause（秒）・face（向き）・lockAnim・after() を つける
  //   lockIfOut：外に出たら かける つもり（persona.lockOut）なら ここで かける ／ lockIfIn：家に入ったら かける（persona.lockIn）なら ここで かける
  function stopAt(w, t){
    if(t.lockIfOut && !(persona.lockOut && !lockOn())) return false;
    if(t.lockIfIn && !(persona.lockIn && !lockOn())) return false;
    if(!t.pause && !t.lockIfOut && !t.lockIfIn) return false;
    w.pauseT = t.pause || 1.2; w.face = t.face; w.lockAnim = !!(t.lockAnim || t.lockIfOut || t.lockIfIn);
    w.afterPause = t.lockIfOut ? () => { persona.lockOut = false; setHouseLock(true); addLog('🔒', 'おじいさんが 外から かぎを かけた'); }
                 : t.lockIfIn ? () => { persona.lockIn = false; setHouseLock(true); addLog('🔒', 'おじいさんが 家に入って、かぎを かけた'); }
                 : (t.after || null);
    return true;
  }
  function stepWalker(w, dt, speed){
    if(w.pauseT > 0){                                 // 立ちどまって 動き ちゅう（ドアの方を 向いて かぎを かける など）
      if(w.face != null){ w.want = w.face; turnTo(w, dt, 3); }
      w.pauseT -= dt;
      if(w.pauseT <= 0){
        w.pauseT = 0; w.lockAnim = false;
        const f = w.afterPause; w.afterPause = null; if(f) f();
        if(!w.queue.length && w.onDone){ const g = w.onDone; w.onDone = null; g(); }
      }
      return false;
    }
    if(!w.queue.length) return false;
    const fast = speed > 4.5;
    let step = speed * dt, moved = false;
    while(w.queue.length && step > 0){
      if(doorHold(w)) break;
      const t = w.queue[0];
      const dx = t.x - w.x, dz = t.z - w.z, d = Math.hypot(dx, dz);
      if(d > 1e-6) w.want = Math.atan2(dx, dz);
      if(fast) w.rot = w.want;
      else {
        turnTo(w, dt, Math.max(1, speed / 1.4));
        if(Math.abs(wrapAngle(w.want - w.rot)) > 0.35) break;         // 先に 向きを変える（その場で回る）
      }
      moved = true;
      if(d <= step){
        w.x = t.x; w.z = t.z; w.queue.shift(); step -= d;
        if(stopAt(w, t)) return moved;                  // ここで 立ちどまって 動く
        if(!fast) break;
      }
      else { w.x += dx / d * step; w.z += dz / d * step; step = 0; }
    }
    if(!w.queue.length && w.onDone){ const f = w.onDone; w.onDone = null; f(); }
    return moved;
  }
  // 歩く・立つ（足と うでが ふれる）
  function poseWalker(w, Pp, moving, dt){
    w.phase += dt * (moving ? 8 * (w.stepMul || 1) : 0);
    const sw = Math.sin(w.phase) * (moving ? 0.5 : 0);
    Pp.hipL.rotation.x = sw; Pp.hipR.rotation.x = -sw;
    Pp.shinL.rotation.x = Math.max(0, -Math.sin(w.phase)) * 0.5 * (moving ? 1 : 0);
    Pp.shinR.rotation.x = Math.max(0, Math.sin(w.phase)) * 0.5 * (moving ? 1 : 0);
    Pp.shoulderL.rotation.x = -sw * 0.6; Pp.shoulderR.rotation.x = sw * 0.6;
    Pp.elbowL.rotation.x = -Math.max(0, sw) * 0.3; Pp.elbowR.rotation.x = -Math.max(0, -sw) * 0.3;
    Pp.group.rotation.order = 'XYZ';
    Pp.group.position.set(w.x, 0, w.z);
    Pp.group.rotation.set(0, w.rot, 0);
    if(Pp.cane) Pp.cane.visible = true;
  }

  // ---------- おじいさん：予定・手動 ----------
  function nowMin(){ return Math.floor(vmin) % DAY_MIN; }
  // おじいさんの顔：ねむるときは 目を とじる。ふだんは にこにこ
  function setExpr(expr){ world.refs.persona.face.set(expr); }
  function planEnter(room, finalPt, onDone){
    finishPause(persona);
    persona.pose = 'stand';
    persona.outing = false; persona.lockOut = false;
    persona.queue = pathTo(persona, room, finalPt);
    persona.onDone = onDone || null;
  }
  // 外へ出る。lockAfter：外に出たら かぎを かける（false ＝ かけない）
  function planOut(lockAfter){
    finishPause(persona);
    persona.pose = 'stand';
    persona.queue = pathOut(persona);
    // 外に出たら ドアの 外がわで 立ちどまって かぎを かける（かける つもりの ときだけ）
    persona.queue.splice(persona.queue.length - 1, 0, { x:L.FRONT_DOOR.x, z:L.FRONT_DOOR.z + 0.5, lockIfOut:true, face:Math.PI });
    persona.outing = true; persona.lockIn = false; persona.lockOut = !!lockAfter;
    persona.onDone = () => {
      const lk = persona.lockOut;                       // 出かける とちゅうで 言われたときも（lockOut が true に なる）外から かける
      persona.away = true; persona.outing = false; persona.queue = []; persona.lockOut = false;
      if(lk && !lockOn()){ setHouseLock(true); addLog('🔒', 'おじいさんが 外から かぎを かけた'); }
      if(!persona.reacting) rec('gp', { what:'out' });
    };
  }
  function appearIfAway(){
    if(persona.away){ placeWalker(persona, L.OUTSIDE); persona.away = false; intruderOnReturn(); }
    if(persona.pose === 'lie') standUp();
    if(persona.pose === 'sit' || persona.pose === 'eat') persona.pose = 'stand';
  }
  function lieDown(){
    if(persona.pose !== 'lie'){ rec('gp', { what:'sleep' }); pop(L.BED.x + 0.85, 1.3, L.BED.z, '💤 ねた'); }
    persona.pose = 'lie'; persona.queue = []; persona.away = false;
    persona.x = L.BED.x + 0.85; persona.z = L.BED.z;
  }
  function standUp(){
    persona.pose = 'stand'; persona.x = -1.7; persona.z = -3.0; persona.rot = 0;
  }
  function sitDown(){
    persona.pose = 'sit'; persona.queue = []; persona.away = false;
    persona.x = L.SOFA_SEAT.x; persona.z = 3.75; persona.rot = Math.PI;
  }
  function eatDown(){
    if(persona.pose !== 'eat'){ rec('gp', { what:'eat' }); persona.did.eat = vmin; pop(L.EAT_SEAT.x, 1.6, L.EAT_SEAT.z, '🍚 もぐもぐ'); }
    persona.pose = 'eat'; persona.queue = []; persona.away = false; persona.eatT = 0;
    persona.x = L.EAT_SEAT.x; persona.z = L.EAT_SEAT.z; persona.rot = L.EAT_SEAT.rot;
  }
  function roomOf(e){ return e.room || '居間'; }

  // 予定の1行を 実行する
  function applyEntry(e){
    setExpr(e.act === 'sleep' ? 'sleepy' : 'smile');
    persona.leaveOff = null;
    const resume = persona.resume; persona.resume = false;   // 言われた用事の あとに もどるときは、予定の 電気は もう さわらない
    if(e.leave === 'off' && !resume){                   // 出た部屋の電気：その部屋を 出たところで 消す
      const list = entriesNow(), from = P.fromRoom(list, list.indexOf(e));
      if(from){
        if(!persona.away && L.roomAt(persona.x, persona.z) === from) persona.leaveOff = from;
        else setLight(from, false, 'person');
      }
    }
    const onArrive = () => {
      const key = keyOf(e);                             // この行の「着いた部屋の電気」は 1回だけ（言われた用事の あとに もどったときは もう しない。着く前に 呼ばれた ときは する）
      if(persona.arrivedKey === key) return;
      persona.arrivedKey = key;
      if(e.light === 'auto') autoLightOnEnter(roomOf(e));
      else if(e.light === 'on' || e.light === 'off') setLight(roomOf(e), e.light === 'on', 'person');
    };
    switch(e.act){
      case 'out':
        if(persona.away) return;
        if(!resume) say('g', '「いってきます」');
        planOut(e.lock !== 'open' || (resume && lockOn()));   // かぎ：出たら かける ／ かけない（言われて かけた あとなら かけ直す）
        break;
      case 'home':
        if(persona.away || persona.outing){ placeWalker(persona, L.OUTSIDE); persona.away = false; intruderOnReturn(); say('g', '「ただいま」'); rec('gp', { what:'home' }); }   // もう 家の中なら 外に 出しなおさない
        persona.pose = 'stand';
        planEnter(e.room || '玄関', null, onArrive);
        if(!resume) persona.lockIn = e.lock !== 'open';  // かぎ：入ったら かける ／ あけたまま
        const q0 = persona.queue[0];                      // 入ってすぐの ドアの 内がわで ふりかえって かける
        if(q0 && Math.abs(q0.z - (L.FRONT_DOOR.z - 0.5)) < 0.01) persona.queue[0] = Object.assign({}, q0, { lockIfIn:true, face:0 });
        break;
      case 'sleep':
        appearIfAway();
        planEnter('寝室', { x:L.BED.x + 0.85, z:L.BED.z }, () => { lieDown(); onArrive(); });
        break;
      case 'sit':
        appearIfAway();
        planEnter('居間', { x:L.SOFA_SEAT.x, z:3.0 }, () => { sitDown(); onArrive(); });
        break;
      case 'eat':
        appearIfAway();
        planEnter('台所', L.EAT_SEAT, () => { eatDown(); onArrive(); });
        break;
      case 'wake':
        appearIfAway();
        planEnter(e.room || '寝室', null, onArrive);
        break;
      default:
        appearIfAway();
        planEnter(roomOf(e), null, onArrive);
    }
  }
  function keyOf(e){ return [e.m, e.act, e.room, e.light, e.leave, e.lock].join('|'); }
  function entriesNow(){ return demo && demo.sc.day ? demo.sc.day : schedule; }
  function currentEntry(list, m){
    let cur = null;
    list.forEach(e => { if(e.m <= m) cur = e; });
    return cur || list[list.length - 1] || null;
  }
  function updateSchedule(){
    if(manual || persona.reacting || vmin >= dayStart + DAY_MIN) return;
    const cur = currentEntry(entriesNow(), nowMin());
    if(!cur) return;
    const key = keyOf(cur);
    if(key === appliedKey) return;
    appliedKey = key;
    if(!persona.resume) addLog('📅', '予定：' + P.describe(cur));   // 言われた用事の あとに もどる ときは 書かない
    applyEntry(cur);
  }
  function manualOn(){ persona.resume = false; if(!manual){ manual = true; addLog('👤', '手で動かしています（予定は止まっています）'); } }
  function manualGo(room){
    manualOn(); appearIfAway();
    if(L.roomAt(persona.x, persona.z) === room){
      planEnter(room, L.ROOMS[room].spot2);
      addLog('👤', 'もう ' + room + ' にいるので、ちかくへ 行く');
    } else {
      planEnter(room);
      addLog('👤', 'おじいさんが ' + room + ' へ行く');
    }
  }
  function manualOutside(){
    manualOn();
    if(persona.away){ addLog('👤', 'おじいさんは もう 外に出ています'); return; }
    planOut(lockOn()); addLog('👤', 'おじいさんが 外へ出る');
  }
  function manualEnter(){
    manualOn(); appearIfAway();
    planEnter('玄関', { x:L.FRONT_DOOR.x - 0.5, z:2.6 });
    addLog('👤', 'おじいさんが 家に入る');
  }
  function manualSit(){
    manualOn(); appearIfAway();
    planEnter('居間', { x:L.SOFA_SEAT.x, z:3.0 }, () => { sitDown(); });
    addLog('👤', 'おじいさんが ソファに すわる');
  }
  function manualEat(){
    manualOn(); appearIfAway();
    planEnter('台所', L.EAT_SEAT, () => { eatDown(); });
    addLog('👤', 'おじいさんが 台所で ごはんを 食べる');
  }
  function manualSleep(){
    manualOn(); appearIfAway();
    planEnter('寝室', { x:L.BED.x + 0.85, z:L.BED.z }, () => { lieDown(); setExpr('sleepy'); });
    addLog('👤', 'おじいさんが ベッドで ねる');
  }
  function manualWake(){
    manualOn();
    if(persona.pose === 'lie') standUp();
    appearIfAway();
    addLog('👤', 'おじいさんが おきる');
  }
  // 人目線：W・S で歩く、A・D で向きを変える（マウスの ドラッグでも 見まわせる）
  function walkFirstPerson(dt){
    if(!mode3p || persona.away || persona.pose !== 'stand') return;
    const turn = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
    if(turn) persona.rot += turn * 2.2 * dt;
    const fwd = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);
    if(fwd){
      manualOn(); persona.queue = []; persona.onDone = null;
      const sp = 1.5 * dt * fwd;
      const nx = persona.x + Math.sin(persona.rot) * sp, nz = persona.z + Math.cos(persona.rot) * sp;
      if(walkable(nx, persona.z)) persona.x = nx;
      if(walkable(persona.x, nz)) persona.z = nz;
    }
  }

  // ---------- ドアとカギ ----------
  // 玄関の かぎは 家のもの（チャッピーの 状態とは べつ。プログラムを はじめても リセットされない）
  let houseLock = true;
  function lockOn(){ return houseLock; }
  function setHouseLock(v){
    const was = houseLock;
    houseLock = !!v; robotState().lock = houseLock;
    if(was !== houseLock) rec('lock', { on:houseLock });
    if(was !== houseLock && running) pop(L.FRONT_DOOR.x, 2.0, L.FRONT_DOOR.z, houseLock ? '🔒 かぎが かかった' : '🔓 かぎが あいた');
    if(running && !demo){                              // 動かしている あいだの かぎの 変化を 時刻つきで おぼえる（時刻を 合わせなおしても 引きつぐ）
      const k = dayKey(nowMin());
      while(lockLog.list.length && lockLog.list[lockLog.list.length - 1].k > k) lockLog.list.pop();
      lockLog.list.push({ k, lock:houseLock });
    }
  }
  // 1日の中の 順番（朝6時が 0）
  const dayKey = m => ((m - DAY_START) % 1440 + 1440) % 1440;
  // かぎの きろく：mode ＝ 'program'（プログラムで）／'plain'（はじめの状態）。ちがう 動かし方の きろくは 使わない
  // mail ＝ チャッピーが 送った メールの きろく（スマホは いつも この きろくと そろえる）
  const lockLog = { mode:null, list:[], mail:[] };
  function resetLockLog(mode){ lockLog.mode = mode || null; lockLog.list = []; lockLog.mail = []; inboxAt(null); }
  // 動かしはじめた 時刻より あとの きろくは 消す（ここから 動かしなおすので、また できる）
  function cutLogsAfter(mins){
    const k = dayKey(mins);
    lockLog.list = lockLog.list.filter(x => x.k <= k);
    lockLog.mail = lockLog.mail.filter(x => x.k <= k);
  }
  // スマホの メール：その時刻までに 届いた ものだけ（null ＝ からっぽ）
  function inboxAt(mins){
    phone.inbox = { family:[], grandpa:[] }; mailSeen = {};
    if(mins != null){ const k = dayKey(mins); lockLog.mail.filter(x => x.k <= k).forEach(x => phone.inbox[x.to].unshift({ t:x.t, text:x.text })); }
    if(phone.open) renderPhone();
  }
  // 時刻を 合わせたときの かぎ：その時刻までの きろく と 予定の「出る／帰る」の 新しいほう
  function lockAt(mins){
    const k = dayKey(mins);
    const rec = lockLog.list.filter(x => x.k <= k).pop();   // その時刻までで いちばん あたらしい きろく（あとの きろくは、動かしなおして 変わったときに 書きかわる）
    let rowK = -1;
    entriesNow().forEach(e => { if((e.act === 'out' || e.act === 'home') && dayKey(e.m) <= k) rowK = Math.max(rowK, dayKey(e.m)); });
    return rec && rec.k >= rowK ? rec.lock : lockFromSchedule(mins);
  }
  function useMode(mode){                              // 動かし方を かえたら、前の きろくは 使わない
    if(lockLog.mode !== mode){ resetLockLog(mode); houseLock = lockFromSchedule(nowMin()); robotState().lock = houseLock; }
    cutLogsAfter(nowMin()); inboxAt(nowMin());
    traceFor(mode);
  }

  // ---------- 合格条件（依頼者が 決めた）を フィールドで たしかめる ----------
  // trace ＝ 動かしている あいだの できごと（時刻つき）。はじめの状態・プログラム それぞれの いちばん新しい ぶんを のこす
  let criteria = { list:[], donts:[] };
  let trace = null;
  const traces = { plain:null, program:null }, checkRes = { plain:null, program:null };
  let checkDirty = false, lastCheckEval = 0, lastCheckPost = '', checkOpen = -1;
  function newTrace(mode){
    trace = { mode:mode || null, from:vmin, now:vmin, events:[], edges:{}, active:{}, slept:false }; if(mode) traces[mode] = trace; checkDirty = true;
    ckPrev.plain = []; ckPrev.program = []; ckPrev.allOk = false;
  }
  function traceFor(mode){
    if(!trace || (trace.mode && trace.mode !== mode)) newTrace(mode);
    else if(!trace.mode){ trace.mode = mode; traces[mode] = trace; }
  }
  // できごとを 記録する（見本・止まっているときは 記録しない）
  function rec(type, data){
    if(!running || demo || !trace || !trace.mode) return;
    trace.events.push(Object.assign({ t:vmin, type }, data || {}));
    if(trace.events.length > 800) trace.events.shift();
    if(type === 'gp' && data && data.what === 'sleep') trace.slept = true;
    checkDirty = true;
  }
  // 状態の きっかけ（電気がついていて だれもいない など）を 毎フレーム 見て、はじまり・おわりの 時刻を のこす
  function stateNow(key){
    const [k, arg] = key.split(':');
    if(k === 'lit_empty') return !!lights[arg] && !(!persona.away && L.roomAt(persona.x, persona.z) === arg);
    if(k === 'unlocked') return !houseLock;
    if(k === 'unlocked_away') return !houseLock && persona.away;
    if(k === 'hot') return roomTemp() >= Number(arg);
    return false;
  }
  function sampleStates(){
    if(!running || demo || !trace || !trace.mode) return;
    if(Math.floor(vmin) !== Math.floor(trace.now)) checkDirty = true;   // 時刻が すすんだら 判定しなおす（「○分以内に」の しめきり）
    trace.now = vmin;
    TeamCheck.stateKeys(criteria).forEach(key => {
      const on = stateNow(key), act = trace.active[key];
      if(on && !act){ const o = { t:vmin, e:null }; trace.active[key] = o; (trace.edges[key] = trace.edges[key] || []).push(o); checkDirty = true; }
      else if(!on && act){ act.e = vmin; trace.active[key] = null; checkDirty = true; }
    });
    const camHome = !!robotState().camera && !persona.away;
    if(camHome && !trace.camHome) rec('camera_home');
    trace.camHome = camHome;
  }
  // 判定して パネルに 出す（0.4秒ごと・できごとが あったとき）
  function updateChecks(force){
    const now = performance.now();
    if(!force && (!checkDirty || now - lastCheckEval < 400)) return;
    lastCheckEval = now; checkDirty = false;
    ['plain', 'program'].forEach(m => { checkRes[m] = traces[m] ? TeamCheck.evaluate(criteria, traces[m]) : null; });
    renderChecks();
    celebrateChecks();
    if(EMBED){
      const msg = { type:'teamhome-checks', sig:TeamCheck.sig(criteria), checks:{ plain:checkRes.plain, program:checkRes.program } };
      const s = JSON.stringify(msg);
      if(s !== lastCheckPost){ lastCheckPost = s; window.parent.postMessage(msg, location.origin); }
    }
  }
  const CK_CLS = { ok:'ok', ng:'ng', wait:'wait', none:'none' };
  function ckCell(r, label){
    if(!r) return '<span class="ck-s none">' + label + '：まだ ためしていない</span>';
    return '<span class="ck-s ' + CK_CLS[r.status] + '">' + label + '：' + TeamCheck.ICON[r.status] + ' ' + TeamCheck.WORD[r.status] + (r.n > 1 ? '（' + r.okN + '/' + r.n + '）' : '') + '</span>';
  }
  function renderChecks(){
    const box = $('ckBox'); if(!box) return;
    const L1 = criteria.list || [], L2 = criteria.donts || [];
    if(!L1.length && !L2.length){
      box.innerHTML = '<div class="ck-empty">' + (ROLE === 'request' ? 'チームのページの「③ 困りごとと 一日を えらぶ」で 合格条件が できると、ここで はじめの状態と プログラムを くらべて ためせます。' : '依頼書に 合格条件が まだ ありません。') + '</div>';
      return;
    }
    const P = checkRes.plain, G = checkRes.program, cur = (trace && trace.mode) || 'program';
    const row = (i, kind, label, rp, rg) => {
      const ev = (cur === 'plain' ? rp : rg) || rp || rg;
      return '<div class="ck' + (checkOpen === i ? ' open' : '') + '" data-i="' + i + '">' +
        '<div class="ck-h"><b>' + (kind === 'c' ? '✅ ' + '①②③④⑤'[i] : '🚫') + '</b> ' + esc(label) + '</div>' +
        '<div class="ck-r">' + ckCell(rp, 'はじめの状態') + ckCell(rg, 'プログラム') +
        (kind === 'c' ? '<span class="ck-go"><button data-run="plain" data-i="' + i + '">▶ はじめで ためす</button>' +
          '<button data-run="program" data-i="' + i + '"' + (prog && progHas() ? '' : ' disabled title="プログラムが まだ ありません"') + '>▶ プログラムで ためす</button></span>' : '') + '</div>' +
        (ev ? '<div class="ck-ev">' + ev.lines.map(esc).join('<br>') + '<small>（' + (ev === rp ? 'はじめの状態' : 'プログラム') + '・ためした 時間 ' + ((ev === rp ? P : G) || {}).range + '）</small></div>' : '') + '</div>';
    };
    const hasProg = prog && progHas();
    drawCkMini();
    box.innerHTML = '<div class="ck-all">一日まるごと（起きる 1時間前から 速く）：<button data-all="plain">▶ はじめの状態で ためす</button>' +
        '<button data-all="program"' + (hasProg ? '' : ' disabled title="プログラムが まだ ありません"') + '>▶ プログラムで ためす</button></div>' +
      L1.map((c, i) => row(i, 'c', TeamCheck.text(c), P && P.list[i], G && G.list[i])).join('') +
      L2.map((d, j) => row(100 + j, 'd', TeamCheck.dontText(d), P && P.donts[j], G && G.donts[j])).join('');
  }
  function progHas(){ return !!(prog && ((prog.actions && prog.actions.length) || (prog.threads && prog.threads.length))); }
  // 小さい 家の 右上：いま 動かしている ほうの 判定（①✔ ②✖ …）
  function drawCkMini(){
    const el = $('ckMini'); if(!el) return;
    const m = (trace && trace.mode) || 'program', r = checkRes[m];
    el.innerHTML = (criteria.list || []).map((c, i) => { const s = r && r.list[i] ? r.list[i].status : null;
      return '<span class="' + (s || '') + '">' + '①②③④⑤'[i] + (s ? TeamCheck.ICON[s] : '・') + '</span>'; }).join('');
  }
  // ✔ に かわったら いわう（プログラム）／ ✖ が 出たら 知らせる（はじめの状態 ＝ 困りごと はっけん）
  function celebrateChecks(){
    if(!running || demo || !trace || !trace.mode) return;
    const m = trace.mode, r = checkRes[m]; if(!r) return;
    r.list.forEach((x, i) => {
      if(x.status === ckPrev[m][i]) return;
      if(m === 'program' && x.status === 'ok') celebrate('✔ ' + '①②③④⑤'[i] + ' クリア！');
      if(m === 'plain' && x.status === 'ng') celebrate('⚠ ' + '①②③④⑤'[i] + ' 困りごと はっけん！', false, true);
    });
    const all = !!r.list.length && r.list.every(x => x.status === 'ok') && !(r.donts || []).some(x => x.status === 'ng');
    if(m === 'program' && all && !ckPrev.allOk) celebrate('🎉 ぜんぶ クリア！', true);
    if(m === 'program') ckPrev.allOk = all;
    ckPrev[m] = r.list.map(x => x.status);
  }
  function celebrate(text, big, warn){
    const t = $('toast');
    t.textContent = text; t.className = big ? 'yay big' : warn ? 'warn' : 'yay'; t.style.display = 'block';
    clearTimeout(toastT); toastT = setTimeout(() => { t.style.display = 'none'; t.className = ''; }, big ? 3600 : 2300);
    if(!warn) confetti(big ? 48 : 18);
    if(EMBED) window.parent.postMessage({ type:'teamhome-yay', text, big:!!big, warn:!!warn }, location.origin);
  }
  function confetti(n){
    const cols = ['#FFC93C', '#FF6B6B', '#4ECDC4', '#7B8CFF', '#7ED957', '#FF9F43'];
    for(let i = 0; i < n; i++){
      const s = document.createElement('i'); s.className = 'conf';
      s.style.left = (8 + Math.random() * 84) + '%'; s.style.background = cols[i % cols.length];
      s.style.animationDelay = (Math.random() * 0.35).toFixed(2) + 's'; s.style.setProperty('--dx', Math.round(Math.random() * 140 - 70) + 'px');
      stageEl.appendChild(s); setTimeout(() => s.remove(), 2400);
    }
  }
  // 「▶ ためす」：きっかけが おきそうな 時刻の 少し前から 動かす
  function startTimeFor(c){
    const back = m => ((m - 5) % 1440 + 1440) % 1440;
    if(c.from && TeamCheck.toMin(c.from) != null) return back(TeamCheck.toMin(c.from));
    const rowM = act => { const e = entriesNow().find(x => x.act === act); return e ? e.m : null; };
    const m = c.trig === 'out' || c.trig === 'unlocked_away' || c.trig === 'intruder' ? rowM('out')
            : c.trig === 'home' ? rowM('home') : c.trig === 'sleep' ? rowM('sleep') : null;
    if(m != null) return back(m);
    if(c.trig === 'hot'){ for(let t = 360; t < 1440; t += 10){ if(roomTempAt(t) >= (Number(c.temp) || 30)) return back(t - 25); } }
    if(c.trig === 'lit_empty'){                         // 時刻を 合わせると 電気は 消えるので、その部屋の 電気が つく 前から
      const room = c.room || '居間';
      const on = ((traces.plain || traces.program || {}).events || []).find(ev => ev.type === 'light' && ev.on && ev.room === room);
      if(on) return back(Math.floor(on.t));
      const row = entriesNow().find(x => (x.light === 'on' || x.light === 'auto') && (x.room === room || P.FIXED_ROOM[x.act] === room));
      return back(row ? (row.light === 'auto' ? Math.max(row.m, 1080) : row.m) : 1080);
    }
    return DAY_START;
  }
  function runCheck(i, mode){
    const c = (criteria.list || [])[i]; if(!c) return;
    setClockTo(startTimeFor(c));
    if(mode === 'program'){ if(ROLE === 'request') replay(prog); else run(); }
    else plainDay();
    checkOpen = i; updateChecks(true);
  }
  function setCriteria(cr){
    const ok = x => x && typeof x === 'object';
    criteria = { list:(ok(cr) && Array.isArray(cr.list) ? cr.list : []).filter(ok).slice(0, 5),
                 donts:(ok(cr) && Array.isArray(cr.donts) ? cr.donts : []).filter(ok).slice(0, 4) };
    updateChecks(true);
  }
  // 家の かぎ：最初は かかっている。いまより前で いちばん近い「そとへ出る」「家に帰る」の きめかたで きまる
  // 朝6時は いつも かかっている（前の日の ことは もちこさない）。その日の 6時から いままでの「出る／帰る」で かわる
  function lockFromSchedule(mins){
    const k = dayKey(mins);
    let best = null, bestK = -1;
    entriesNow().forEach(e => {
      if(e.act !== 'out' && e.act !== 'home') return;
      const ek = dayKey(e.m);
      if(ek <= k && ek > bestK){ bestK = ek; best = e; }
    });
    return !best || best.lock !== 'open';
  }
  // おじいさんが ドアを通るとき、かぎが かかっていれば 自分の かぎで あける（かけ直すかは 予定の「かぎ」で きまる）
  function personaKeyCheck(){
    if(persona.lockIn && !persona.away && L.roomAt(persona.x, persona.z) && persona.z < DOOR.z - 0.8){   // 家に入ったら ドアを しめて かける
      persona.lockIn = false; door.closeT = 0;
      if(!lockOn()){ setHouseLock(true); addLog('🔒', 'おじいさんが 家に入って、かぎを かけた'); }
    }
    if(persona.away || !lockOn()) return;
    const d = Math.hypot(persona.x - DOOR.x, persona.z - DOOR.z);
    if(d < 1.6 && persona.queue.some(p => (p.z - DOOR.z) * (persona.z - DOOR.z) < 0)){
      setHouseLock(false);
      addLog('🔑', persona.outing ? 'おじいさんが かぎを あけて、外へ 出る' : 'おじいさんが かぎを あけて、ドアを とおる');
    }
  }
  function updateDoor(dt){
    // ドアは 通りぬける ときだけ あける（近くを 歩くだけ・外から かぎを かける ときは あけない）。通ったら すぐ しめる
    const crossing = w => w.queue.some(p => (p.z - DOOR.z) * (w.z - DOOR.z) < 0);
    const near = (!persona.away && !persona.outsideTask && Math.hypot(persona.x - DOOR.x, persona.z - DOOR.z) < 1.5 && crossing(persona)) ||
                 (intr.active && !intr.turnAway && Math.hypot(intr.x - DOOR.x, intr.z - DOOR.z) < 1.5 && crossing(intr));
    const openable = !lockOn() || (intr.active && intr.fleeing);   // にげる 知らない人は 中から あけて 出ていく
    door.wanted = near && openable;
    door.closeT = door.wanted ? 0.5 : Math.max(0, door.closeT - dt);
    const target = (door.wanted || door.closeT > 0) ? DOOR_OPEN : 0;
    const ds = 2.2 * dt * Math.max(1, walkMul);                   // 速く歩くときは ドアも 速く あく
    door.angle += clamp(target - door.angle, -ds, ds);
    world.refs.door.rotation.y = door.angle;
  }

  // ---------- 電気 ----------
  // 電気は 「消す」と 決められたときだけ 消える（部屋を出ても、ひとりでには 消えない）
  function setLight(room, on, who){
    if(lights[room] === on) return;
    lights[room] = on;
    rec('light', { room, on, who: who === 'block' ? 'block' : 'person' });
    const sp = L.ROOMS[room] && L.ROOMS[room].spot;
    if(sp && running) pop(sp.x, 2.1, sp.z, (on ? '💡 ' : '🌑 ') + room + (on ? 'の 電気が ついた' : 'の 電気が 消えた'));
    if(who === 'block') noteReaction('room', room + 'の電気を ' + (on ? 'つけた' : 'けした'));
    else addLog('💡', room + 'の電気を ' + (on ? 'つけた' : 'けした') + '（おじいさん）');
  }
  function autoLightOnEnter(room){
    const h = nowMin() / 60;
    if(h < 6 || h >= 18) setLight(room, true, 'person');
  }

  // ---------- 知らない人 ----------
  // 留守のたびに 1回、知らない人が 来る（出かけて 1時間後。帰る予定が 近ければ その まんなか）。見本の ときは 見本どおり
  function autoIntruder(){
    if(demo || !running) return;
    if(intr.active && !intr.fleeing && !intr.turnAway && !intr.queue.length){       // 家の中で 立ちどまってから 45分で 出ていく
      if(intr.stayFrom == null) intr.stayFrom = vmin;
      else if(vmin - intr.stayFrom > 45) intruderLeave('知らない人は 外へ 出ていった', true);
    }
    if(!persona.away){ persona.intrAt = null; return; }
    if(persona.intrAt == null){
      const now = nowMin(), homes = entriesNow().filter(e => e.act === 'home').map(e => ((e.m - now) % 1440 + 1440) % 1440).filter(d => d > 0);
      const gap = homes.length ? Math.min(...homes) : 600;
      persona.intrAt = gap >= 20 ? vmin + Math.min(60, gap / 2) : Infinity;
      return;
    }
    if(vmin >= persona.intrAt){ persona.intrAt = Infinity; if(!intr.active) intruderCome(); }
  }
  // おじいさんが 帰ってくると、家の中の 知らない人は にげる
  function intruderOnReturn(){
    if(intr.active && !intr.fleeing && !intr.turnAway && L.roomAt(intr.x, intr.z)) intruderLeave('おじいさんが 帰ってきて、知らない人は にげていった');
  }
  function intruderCome(){
    if(!persona.away){ showToast('知らない人は、おじいさんが 外に出ているときだけ 来ます'); return; }
    if(intr.active){ addLog('🕵', 'もう 知らない人が 来ています'); return; }
    intr.active = true; intr.fleeing = false; intr.turnAway = false; intr.freeze = 0; intr.stayFrom = null;
    placeWalker(intr, L.OUTSIDE); intr.rot = Math.PI;               // 玄関の外から、家の方を向いて 入ってくる
    poseWalker(intr, world.refs.intruder, false, 0);                // 体の位置も 玄関の外へ（以前は 原点＝家の中 に 出ていた）
    world.refs.intruder.group.visible = true;
    world.refs.intruder.face.set('neutral');
    if(lockOn()){
      intr.turnAway = true;
      addLog('🚪', '知らない人が ドアを ためしたが、かぎが かかっていて 入れなかった');
      say('i', '（かぎが かかってる…）');
      rec('intruder', { what:'blocked' });
      intr.hideT = setTimeout(() => { if(intr.turnAway) hideIntruder(); }, 3500);
      return;
    }
    intr.queue = pathTo(intr, '居間', { x:L.CHAPPY_AT.x + 1.7, z:L.CHAPPY_AT.z + 0.45 });   // チャッピーの 正面（座卓の 手前）。カメラに 全身が うつる
    addLog('🚨', '知らない人が 玄関から 入ってきた（かぎが あいていた）');
    say('i', '（だれも いないな…）');
    rec('intruder', { what:'enter' });
  }
  // ---------- チャッピーに 言われたら、おじいさんが 動く ----------
  // チャッピーが「しゃべる」・おじいさんの スマホに「メール」すると、その言葉で おじいさんが 動く
  //   用事（電気・薬・かぎ・水）：予定を いったん止めて 用事をし、すんだら いまの予定に もどる
  //   すごし方（ごはん・ねる・おきる）：言われたとおりにして、つぎの予定の時刻まで そのまま
  //   外にいるとき（メールだけ届く）：かぎ・電気は いったん 家に帰って 用事をし、また 出かける
  //   いろいろな プログラムに こたえる：カタカナ・ひらがなの ゆれ・部屋の 名前・1つの 文で 2つの たのみ・用事の とちゅうの たのみ（あとで する）・
  //   くりかえし（「さっき のんだよ」）・「〜しないで」（しない）・わからない ことば（「ん？」と 聞きかえす）
  const hira = s => String(s || '').replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
  const NEG = /ないで|なくて(いい|よい|も)|なくても|いらない|やめて|だめ|しなくて/;
  const ROOM_WORDS = [['居間', /居間|りびんぐ/], ['台所', /台所|だいどころ|きっちん/], ['寝室', /寝室|しんしつ|べっど/], ['玄関', /玄関|げんかん/]];
  const recent = (k, mins) => persona.did && persona.did[k] != null && vmin - persona.did[k] < mins;
  const nightNow = () => { const cur = currentEntry(entriesNow(), nowMin()); return !!cur && cur.act === 'sleep' && (nowMin() < 300 || nowMin() >= 1260); };
  const HEARS = [
    // ことばの ゆれ（照明・ライト・ロック・施錠・お茶 など）も わかる。部屋の 名前が あれば その部屋
    { k:'light', re:/(電気|でんき|明かり|あかり|灯り|照明|しょうめい|らいと|電灯|でんとう)[^。！!？?]*(つい|つけっぱなし|付けっぱなし|消|けし|けせ|おふ|切)|消し忘れ|消しわすれ|けしわすれ|つけっぱなし|付けっぱなし|ついたまま/, plan(here, viaMail, clause){
        const lit = L.ROOM_ORDER.filter(k => lights[k]);
        if(!lit.length) return { sayOnly:'「電気は もう 消えてるよ」' };
        const named = ROOM_WORDS.find(([r, re]) => re.test(clause) && lights[r]);
        const room = named ? named[0] : (lit.find(k => k !== here) || lit[0]);
        return { room, say:'「わかった、' + room + 'の電気を 消してくるよ」',
          done(){ setLight(room, false, 'person'); addLog('👴', 'おじいさんが ' + room + 'の電気を 消した'); } }; }, fromOutside:true },
    // かぎ：家の中 → 玄関で かける ／ 出かける とちゅう → 外に出たら かける ／ 外（メールだけ）→ 家の外から かけて また 出かける
    { k:'lock', re:/かぎ|鍵|ろっく|施錠|せじょう|戸締|戸じまり|とじまり/, plan(here, viaMail){
        if(lockOn() || persona.lockIn) return persona.away ? null : { sayOnly:'「かぎは もう かかってるよ」' };   // かかっている ／ 家に 入ったら すぐ かける ところ
        if(persona.outing){                              // 出かける とちゅう：声では 反応しない（メールなら 外に出てから かける）
          if(viaMail && !persona.lockOut){ persona.lockOut = true; say('g', '「おっと、外に出たら かぎを かけるよ」'); }
          return null;
        }
        return { room:'玄関', outside:true, say:'「おっと、かぎを かけなきゃ」',
          to:{ x:L.FRONT_DOOR.x, z:L.FRONT_DOOR.z - 0.5, pause:1.2, face:0, lockAnim:true },   // ドアの 内がわで ドアを 向いて かける
          done(){ setHouseLock(true); addLog('🔒', persona.away || L.roomAt(persona.x, persona.z) === '' ? 'おじいさんが 家の外から かぎを かけた' : 'おじいさんが 玄関の かぎを かけた'); } }; }, fromOutside:true },
    { k:'medicine', re:/薬|くすり|服薬/, plan(){
        if(recent('medicine', 120)) return { sayOnly:'「薬は さっき のんだよ」' };
        return { room:'台所', say:'「そうだった、薬を のまなきゃ」', done(){ addLog('👴', 'おじいさんが 台所で 薬を のんだ'); rec('gp', { what:'medicine' }); persona.did.medicine = vmin; pop(persona.x, 1.9, persona.z, '💊 ごくん'); } }; } },
    { k:'water', re:/水(?!曜)|みず|のみもの|飲み物|水分|お茶|おちゃ|熱中症|ねっちゅうしょう/, plan(){
        if(recent('water', 25)) return { sayOnly:'「水は さっき のんだよ」' };
        return { room:'台所', say:'「そうだね、水を のもう」', done(){ addLog('👴', 'おじいさんが 台所で 水を のんだ'); rec('gp', { what:'water' }); persona.did.water = vmin; pop(persona.x, 1.9, persona.z, '💧 ごくごく'); } }; } },
    { k:'eat', re:/ごはん|ご飯|食事|しょくじ|朝食|昼食|夕食|夕飯|晩ご飯|ばんごはん|おひる|お昼/, plan(){
        if(persona.pose === 'eat') return { sayOnly:'「いま 食べてるよ」' };
        if(recent('eat', 60)) return { sayOnly:'「さっき 食べた ばかりだよ」' };
        return { room:'台所', to:L.EAT_SEAT, stay:!nightNow(), say:'「ごはんに しようかね」', done(){ eatDown(); } }; } },   // 夜中なら 食べたら ベッドに もどる
    { k:'sleep', re:/おやすみ|お休み|寝る時間|ねる時間|寝ましょう|ねましょう|休みましょう|就寝|寝て(?!い)|ねて(?!い)/, plan(){ return persona.pose !== 'lie' && { room:'寝室', to:{ x:L.BED.x + 0.85, z:L.BED.z }, stay:true,
          say:'「そうだね、そろそろ ねようかね」', done(){ lieDown(); setExpr('sleepy'); } }; } },
    { k:'wake', re:/おはよう|起きて|おきて|朝ですよ|起床|起きる時間|おきる時間/, plan(){
        if(persona.pose !== 'lie') return persona.away ? null : { sayOnly:'「もう 起きてるよ」' };
        const night = nightNow() && nowMin() < 300;      // 夜中（5時まえ）に 起こされたら、また ねる
        return { room:'寝室', stay:!night, say:night ? '「まだ 夜じゃないか…」' : '「ふあぁ、おはよう」', done(){ setExpr(night ? 'sleepy' : 'smile'); } }; } },
  ];
  // ことばを「文」に 分けて、たのまれた ことを 出てきた じゅんに ならべる（「〜しないで」の 文は とばす）
  function parseHears(text){
    const out = [];
    out.negated = false;
    String(text).split(/[。！!？?\n]/).forEach((raw0, ci) => {
      const raw = raw0.replace(/[\s　]+/g, '');         // 「ねる 時間」のように ことばの あいだに 空白が あっても わかる
      if(!raw) return;
      const clause = raw + '／' + hira(raw);
      if(NEG.test(hira(raw))){ if(HEARS.some(h => h.re.test(clause))) out.negated = true; return; }   // 「消さないで」：しない（「わかった」と こたえる）
      HEARS.forEach(h => {
        const m = h.re.exec(clause);
        if(m && !out.some(o => o.h === h)) out.push({ h, clause, at:ci * 1000 + (m.index % (raw.length + 1)) });
      });
    });
    return out.sort((a, b) => a.at - b.at);
  }
  // わからない ことば・あいさつ（同じ ことばは しばらく くりかえさない）
  let chatSeen = {};
  function chatBack(text){
    if(persona.away || persona.pose === 'lie' || persona.reacting) return;
    if(chatSeen[text] != null && vmin - chatSeen[text] < 30) return;
    chatSeen[text] = vmin;
    const t = hira(text);
    if(/ありがと/.test(t)){ say('g', '「どういたしまして」'); return; }
    if(/こんにちは|こんばんは|元気|げんき|ただいま|やあ/.test(t)){ say('g', '「やあ、チャッピー」'); return; }
    say('g', '「ん？ なんだい？」');
    addLog('💡', 'おじいさんは 何を すれば いいか わからなかった（「電気」「かぎ」「薬」「水」「ごはん」「ねる」「おきる」の ことばで 動きます）');
  }
  function personaHears(text, viaMail){
    if(!text) return;
    if(persona.away && !viaMail){                       // 外にいると チャッピーの声は とどかない（メールは とどく）
      if(persona.farAt == null || vmin - persona.farAt > 120){ persona.farAt = vmin; addLog('🔇', 'おじいさんは 外に いるので、チャッピーの 声は とどかない（📧 おじいさんの スマホに メールなら とどく）'); }
      return;
    }
    const reqs = parseHears(text);
    if(!reqs.length && reqs.negated){ if(!persona.away && persona.pose !== 'lie') sayOnce('「わかった、そのままに しておくよ」'); return; }
    if(!reqs.length){
      if(viaMail) addLog('💡', 'おじいさんは メールを 読んだが、何を すれば いいか わからなかった');
      else chatBack(text);
      return;
    }
    reqs.forEach(r => {                                 // 用事の とちゅうでも 聞いておいて、あとで する（同じ たのみは 1つだけ。電気は 部屋ごと）
      const key = reqKey(r.h, r.clause);
      if(persona.hearCur === key || persona.hearQ.some(q => q.key === key) || persona.hearQ.length >= 4) return;
      persona.hearQ.push({ h:r.h, key, clause:r.clause, viaMail:!!viaMail });
    });
    pumpHear();
  }
  function pumpHear(){
    while(!persona.reacting && persona.hearQ.length){
      const q = persona.hearQ.shift();
      if(persona.away && (!q.viaMail || !q.h.fromOutside)) continue;
      const here = persona.away ? null : L.roomAt(persona.x, persona.z);
      const p = q.h.plan(here, q.viaMail, q.clause);
      if(!p) continue;
      if(p.sayOnly){ if(!persona.away) sayOnce(p.sayOnly); else addLog('👴', 'おじいさん（メールで）：' + p.sayOnly); continue; }
      persona.hearCur = q.key;
      reactTo(p);
    }
  }
  const reqKey = (h, clause) => h.k + ':' + (h.k === 'light' ? (ROOM_WORDS.find(([r, re]) => re.test(clause)) || [''])[0] : '');
  // 同じ 返事は しばらく くりかえさない（プログラムが 何回も 言っても、うるさく ならない ように）
  function sayOnce(text){
    if(chatSeen['say:' + text] != null && vmin - chatSeen['say:' + text] < 15) return;
    chatSeen['say:' + text] = vmin;
    say('g', text);
  }
  // 用事が すんだら、待っている たのみを する
  function hearDone(){ persona.hearCur = null; setTimeout(pumpHear, 300); }
  function reactTo(p){
    const wasAway = persona.away, wasLocked = lockOn();
    if(persona.pose === 'lie'){ rec('woken'); pop(persona.x, 1.4, persona.z, '😲 おこされた'); }   // ねていたのに 起こされた（しないでほしいこと の 判定）
    persona.reacting = true;
    if(wasAway && p.outside){                          // 家の外から：ドアの 前まで 来て 外から かけ、また 出かける（家には 入らない）
      placeWalker(persona, L.OUTSIDE); persona.away = false; persona.pose = 'stand'; persona.outsideTask = true;
      setExpr('smile'); say('g', p.say);
      addLog('👴', 'メールを見て、家の 前に もどる');
      persona.queue = [{ x:L.FRONT_DOOR.x, z:L.FRONT_DOOR.z + 0.5, pause:1.2, face:Math.PI, lockAnim:true, after:() => p.done() },   // ドアの 外がわで ドアを 向いて かける
                       { x:L.OUTSIDE.x, z:L.OUTSIDE.z }];
      persona.onDone = () => { persona.away = true; persona.outsideTask = false; persona.reacting = false; appliedKey = null; hearDone(); };
      return;
    }
    appearIfAway();                                   // 外なら 家の前へ、ねていたら おきる・すわっていたら 立つ
    setExpr('smile');
    say('g', p.say);
    addLog('👴', (wasAway ? 'メールを見て、家に もどって ' : 'チャッピーに 言われて ') + p.room + 'へ 行く');
    planEnter(p.room, p.to || null, () => {
      p.done();
      if(wasAway){                                    // 用事が すんだら、また 出かける（かかっていた かぎは かけ直す）
        planOut(wasLocked || lockOn());
        const left = persona.onDone;
        persona.onDone = () => { if(left) left(); persona.reacting = false; appliedKey = null; hearDone(); };
        return;
      }
      persona.reacting = false;
      if(p.stay){ const cur = currentEntry(entriesNow(), nowMin()); appliedKey = cur ? keyOf(cur) : null; }   // つぎの予定まで そのまま
      else { appliedKey = null; persona.resume = true; }   // いまの 予定に もどる（ねる時間なら ベッドへ。電気は つけなおさない）
      hearDone();
    });
  }
  function hideIntruder(){
    intr.active = false; intr.fleeing = false; intr.turnAway = false; intr.queue = []; intr.onDone = null;
    clearTimeout(intr.hideT);
    world.refs.intruder.group.visible = false;
  }
  function intruderLeave(reason, calm){
    if(!intr.active || intr.fleeing) return;
    intr.fleeing = true; intr.freeze = 1.0;           // びっくりして 1秒 かたまってから にげる（カメラに うつる）
    world.refs.intruder.face.set('surprised');
    intr.queue = pathOut(intr);
    intr.onDone = () => { hideIntruder(); addLog('🚪', '知らない人が 外へ にげていった'); };
    addLog('🚨', reason);
    pop(intr.x, 2.0, intr.z, calm ? '🚶 出ていった' : '💨 にげた！');
    say('i', calm ? '（そろそろ 行くか）' : '「うわっ！ にげろ！」');
    rec('intruder', { what: calm ? 'leave' : 'flee' });
  }
  // チャッピーが しゃべったときだけ、家の中の知らない人は にげる
  function intruderReact(kind){
    if(kind !== 'speech' || !intr.active || intr.fleeing || intr.turnAway) return;
    if(!L.roomAt(intr.x, intr.z)) return;
    intruderLeave('チャッピーが しゃべって、知らない人は おどろいて にげていった');
  }
  function intruderStep(dt){
    if(!intr.active || intr.turnAway) return;
    if(intr.freeze > 0){ intr.freeze -= dt; poseWalker(intr, world.refs.intruder, false, dt); return; }
    const moving = stepWalker(intr, dt, intr.fleeing ? 3.0 : 1.8);
    if(!intr.queue.length && !intr.fleeing){ intr.want = Math.atan2(L.CHAPPY_AT.x - intr.x, L.CHAPPY_AT.z - intr.z); turnTo(intr, dt); }
    poseWalker(intr, world.refs.intruder, moving, dt);
  }

  // ---------- 仮想の世界 → センサー ----------
  function nowParts(){ const m = nowMin(); return { hour: Math.floor(m / 60), minute: m % 60 }; }
  function isDaytime(){ const h = nowParts().hour; return h >= 6 && h < 18; }
  // 室温（1日の目安）：朝は 低く、12〜16時に 30℃を こえる。扇風機では 温度は 下がらない（エアコンではない）
  const TEMP_CURVE = [[0, 21], [6, 22], [9, 25], [12, 29], [14, 32], [16, 31], [18, 27], [20, 24], [24, 21]];
  function roomTemp(){ return roomTempAt(vmin); }
  function roomTempAt(m){
    const h = (m / 60) % 24;
    let t = TEMP_CURVE[TEMP_CURVE.length - 1][1];
    for(let i = 1; i < TEMP_CURVE.length; i++){
      const [h0, t0] = TEMP_CURVE[i - 1], [h1, t1] = TEMP_CURVE[i];
      if(h >= h0 && h < h1){ t = t0 + (t1 - t0) * (h - h0) / (h1 - h0); break; }
    }
    return Math.round(t * 10) / 10;
  }
  // おんど計と 画面の 温度
  function updateThermo(){
    const t = roomTemp();
    world.refs.setTemp(t);
    const hud = $('tempHud'), level = t >= 30 ? 'hot' : t >= 27 ? 'warm' : t < 20 ? 'cool' : 'mild';
    const text = '🌡 ' + t.toFixed(1) + '℃';
    if(hud && (hud.textContent !== text || hud.dataset.level !== level)){ hud.textContent = text; hud.dataset.level = level; }  }
  function peopleInside(){
    const arr = [];
    if(!persona.away) arr.push(persona);
    if(intr.active && !intr.turnAway) arr.push(intr);
    return arr;
  }
  function sensorValues(){
    const p = nowParts(), now = new Date();
    const people = peopleInside();
    // チャッピーは 家ぜんたいを 見ている：「人がいる」は 家の中の どこかに 人がいること
    const where = people.map(w => L.roomAt(w.x, w.z)).filter(Boolean);
    const dists = people.map(w => Math.hypot(w.x - L.CHAPPY_AT.x, w.z - L.CHAPPY_AT.z) * 100);
    const v = {
      distance: dists.length ? Math.round(Math.min(300, Math.min(...dists))) : 300,
      light: isDaytime() ? 600 : (lights['居間'] ? 350 : 60),     // 明るさは チャッピーのいる 居間（夜は 居間の電気で かわる）
      temp: roomTemp(),
      hour: p.hour, minute: p.minute,
      pir: where.length > 0,
      button_red: btn.red, button_blue: btn.blue, button_both: btn.red && btn.blue,
      month: now.getMonth() + 1, day: now.getDate(), weekday: now.getDay(),
      // 🧪 仮想だけ：部屋ごとの 人・電気・明るさ、玄関のドア・かぎ
      door_open: door.angle > 0.3, locked: lockOn(),
      // おじいさんか 知らない人かも わかる（家の中に いるときだけ「本当」。玄関の 外は 家の外）
      grandpa_in: !persona.away && !!L.roomAt(persona.x, persona.z),
      stranger_in: intr.active && !intr.turnAway && !!L.roomAt(intr.x, intr.z),
    };
    L.ROOM_ORDER.forEach(k => {
      v['pir_' + k] = where.includes(k); v['lit_' + k] = !!lights[k];
      v['light_' + k] = isDaytime() ? 600 : (lights[k] ? 350 : 60);   // 部屋の明るさ（昼 600／夜 電気つき 350・消え 60）
    });
    return v;
  }
  const sensors = () => sensorValues();
  function robotState(){ return runner ? runner.state : ChappySim.newState(); }

  function noteReaction(kind){ intruderReact(kind); }
  let toastT = null;
  function showToast(text){
    const t = $('toast'); t.textContent = text; t.style.display = 'block'; t.className = '';
    clearTimeout(toastT); toastT = setTimeout(() => { t.style.display = 'none'; }, 6000);
  }

  // プログラムを読んで、待ちがない「ずっと」や、2つの「ずっと」が同じ出力を取り合うのを見つける
  function hasWait(acts){
    return (acts || []).some(a => a && (a.type === 'wait' || a.type === 'until' || hasWait(a.actions) || hasWait(a.then) || hasWait(a.else) || hasWait(a.body)));
  }
  function checkStatic(){
    statics = [];
    if(prog){
      (prog.actions || []).forEach(a => { if(a && a.type === 'forever' && !hasWait(a.actions)) statics.push('「🔁 ずっと」の中に「⏱ 待つ」がありません。実機では、ほかの動きが止まって見えることがあります'); });
      (prog.threads || []).forEach(t => { if(!hasWait(t.actions)) statics.push('「🔁 ずっと」の中に「⏱ 待つ」がありません。実機では、ほかの動きが止まって見えることがあります'); });
      try {
        ChappySim.findConflicts(prog).forEach(name => statics.push('2つの「🔁 ずっと」が 同じ「' + name + '」を取り合っています。あとから動いた方だけ見えます'));
      } catch(e){}
    }
  }

  // ---------- 開発者：プログラムを動かす ----------
  function setupRunner(){
    runner = ChappySim.createRunner({
      sensors, paint:onPaint, speed:() => Math.max(1, rate * 60),   // 「⏱ 待つ」は 家の 時計の 秒（「待つ 60秒」＝ 家の 1分）
      onEnd(){ addLog('✔', 'プログラムが おわった（時計はそのまま進みます）'); },
    });
  }
  function onPaint(st){
    const cur = { face:st.face, speech:st.speech, led:st.led, fan:st.fan, camera:st.camera, lock:st.lock, rooms:Object.assign({}, st.rooms) };
    if(prevPaint){
      if(cur.led !== prevPaint.led) noteReaction('led');
      if(cur.fan !== prevPaint.fan){
        noteReaction('fan'); rec('fan', { on:!!cur.fan });
        if(cur.fan){ pop(L.CHAPPY_AT.x, 1.2, L.CHAPPY_AT.z, '🌀 ファン'); if(!persona.away && persona.pose !== 'lie' && L.roomAt(persona.x, persona.z) === '居間') say('g', '「ああ、すずしいねえ」'); }
      }
      if(cur.camera !== prevPaint.camera){
        noteReaction('camera'); rec('camera', { on:!!cur.camera });
        if(cur.camera) pop(L.CHAPPY_AT.x, 1.2, L.CHAPPY_AT.z, '📷 カメラ');
        if(cur.camera) openPhone(phone.owner, 'camera');            // カメラを つけると、スマホに 家の映像が とどく
      }
      if(cur.lock !== prevPaint.lock){ setHouseLock(cur.lock); noteReaction('lock'); }   // 前に作った「🔒 玄関のかぎ」ブロック
      L.ROOM_ORDER.forEach(k => {
        if(cur.rooms[k] === undefined) return;
        if(!!cur.rooms[k] !== !!prevPaint.rooms[k]) setLight(k, !!cur.rooms[k], 'block');
      });
      if(cur.speech && cur.speech !== prevPaint.speech){
        talkRepeat = cur.speech === lastTalk.text && vmin - lastTalk.at < 30; lastTalk = { text:cur.speech, at:vmin };
        addLog('🤖', 'チャッピー：「' + cur.speech + '」'); rec('speak', { text:cur.speech }); noteReaction('speech');
        if(!/^🤖/.test(cur.speech)) personaHears(cur.speech);   // 「🤖 AIとおはなし」は 実機だけ（おじいさんは 聞きながす）
      }
      if(cur.face !== prevPaint.face) addLog('😊', 'チャッピーの表情：' + cur.face);
    }
    prevPaint = cur;
    if(st.event && st.event.kind === 'mail' && st.event.n !== lastMailN){
      lastMailN = st.event.n;
      noteReaction('mail', 'メールを送った：「' + st.event.text + '」');
      gotMail(st.event.text, st.event.to);
    }
    ChappySim.drawFace($('faceBox').querySelector('svg'), st);
  }
  // 開発者のプログラムを、おじいさんの一日と いっしょに 動かす（依頼者が 送られてきたものを 再現する）
  function replay(p){
    setProgram(p);
    if(!prog || !((prog.actions && prog.actions.length) || (prog.threads && prog.threads.length))){
      showToast('プログラムが まだ ありません');
      return;
    }
    playDay();
    useMode('program');
    prevPaint = null;
    runner.start(prog); robotState().lock = houseLock;    // プログラムを はじめても 家の かぎは そのまま
    addLog('🧪', '開発者のプログラムを 再現します');
    setMode('program');
  }
  function run(){
    if(ROLE === 'request'){ plainDay(); return; }
    if(!prog || !((prog.actions && prog.actions.length) || (prog.threads && prog.threads.length))){
      showToast('プログラムが まだ 届いていません（ブロックを作ると、ここで動きます）');
      return;
    }
    if(vmin >= dayStart + DAY_MIN) setClockTo(DAY_START, true);
    useMode('program');
    running = true; prevPaint = null;
    runner.start(prog); robotState().lock = houseLock;    // プログラムを はじめても 家の かぎは そのまま
    addLog('▶', clockText(vmin) + ' から 動かしはじめた');
    setMode('program');
  }
  // いま 動かしている ボタンだけ 色を つける（'program'＝プログラムで ／ 'plain'＝はじめの状態 ／ null＝止まっている）
  function setMode(m){
    const progBtn = ROLE === 'request' ? 'replayBtn' : 'runBtn', plainBtn = ROLE === 'request' ? 'runBtn' : 'plainBtn';
    $(progBtn).classList.toggle('modeon', m === 'program');
    $(plainBtn).classList.toggle('modeon', m === 'plain');
  }
  // はじめの状態：チャッピーの プログラムは 動かさず、依頼者が 決めた 一日だけで 動かす（プログラムの前と くらべるため）
  function plainDay(){
    prevPaint = null; runner.stop(); runner.reset(); robotState().lock = houseLock; prevPaint = null;
    if(vmin >= dayStart + DAY_MIN) setClockTo(DAY_START, true);
    useMode('plain');
    playDay();
    setCaption('はじめの状態（プログラムなし）', 'チャッピーの プログラムは 動いていません。おじいさんの 一日だけです。');
    addLog('🌱', clockText(vmin) + ' から はじめの状態で 見ています');
    setMode('plain');
  }
  function stopAll(msg){
    running = false;
    runner.stop();
    setMode(null);
    if(msg) addLog('■', msg);
  }
  // 時刻を決めて、そこから（人の場所も、その時刻の予定どおりに）しなおす
  function setClockTo(mins, silent){
    stopAll('');
    prevPaint = null; runner.reset();
    if(demo && !silent) demo = null;
    vmin = mins; dayStart = mins; prevPaint = null; manual = false; appliedKey = null; persona.reacting = false; persona.leaveOff = null;
    persona.hearQ = []; persona.hearCur = null; persona.did = {}; persona.farAt = null; chatSeen = {};
    persona.lockIn = false; persona.lockOut = false; persona.resume = false; persona.intrAt = null; persona.arrivedKey = null; persona.outsideTask = false;
    persona.pauseT = 0; persona.lockAnim = false; persona.afterPause = null; persona.face = null;
    clearLog(); talk.g = talk.i = null; holdT = 0; talkBudget = 6;
    phone.open = false; $('phone').style.display = 'none';   // 前に 開いた スマホは とじる（新しい メールが 来たら また 開く）
    newTrace(null);                                       // 合格条件の たしかめ：ここから 記録しなおす（動かしはじめたときに はじめの状態／プログラムが きまる）
    houseLock = lockAt(mins % DAY_MIN); robotState().lock = houseLock;   // かぎ：最初は かかっている（予定の 出る／帰る と、それまでに 起きたこと で きまる）
    if(!demo) inboxAt(mins % DAY_MIN);                  // スマホ：この時刻までに 届いた メールだけ（前に 先まで 進めた ときの メールは 出さない）
    lastMailN = 0;
    hideIntruder();
    Object.keys(lights).forEach(k => { if(lights[k]) setLight(k, false, 'block'); });
    const list = entriesNow();
    const cur = currentEntry(list, mins % DAY_MIN);
    persona.queue = []; persona.onDone = null; persona.away = false; persona.pose = 'stand'; persona.outing = false;
    if(cur && cur.act === 'out'){ placeWalker(persona, L.OUTSIDE); persona.away = true; }
    else if(cur && cur.act === 'sleep'){ lieDown(); }
    else if(cur && cur.act === 'sit'){ placeWalker(persona, { x:L.SOFA_SEAT.x, z:3.0 }); sitDown(); }
    else if(cur && cur.act === 'eat'){ eatDown(); }
    else { placeWalker(persona, L.ROOMS[(cur && cur.room) || '寝室'].spot); }
    setExpr(cur && cur.act === 'sleep' ? 'sleepy' : 'smile');
    appliedKey = cur ? keyOf(cur) : null;
    if(!silent) addLog('🕐', clockText(mins) + ' に合わせました（「▶」で、ここから進みます）');
  }
  function endDay(){
    stopAll('');
    addLog('🌙', '1日がおわりました（時刻を合わせると、また見られます）');
  }
  function playDay(){
    if(demo){ demo = null; runner.reset(); setHouseLock(lockFromSchedule(nowMin())); }
    if(vmin >= dayStart + DAY_MIN) setClockTo(DAY_START, true);
    manual = false; appliedKey = null;                                        // 手で動かしていたら、予定に もどす
    running = true;
    setCaption(dayTitle(), '予定どおりに 動いています。');
    addLog('▶', clockText(vmin) + ' から 一日を 見ています');
  }

  // ---------- 見本（依頼者ページ）----------
  function playScenario(i){
    const sc = typeof i === 'object' ? i : TeamHomeDemo.list()[i];        // 番号（できること）か、台本そのもの（家の ルール）
    if(!sc) return;
    stopAll('');
    const st = robotState();                                                  // 前の見本の ファン・LED・しゃべりを 残さない
    st.fan = false; st.led = false; st.speech = ''; st.camera = false;
    demo = { sc, events: sc.events.map(e => Object.assign({ done:false }, e)), offs:[], ended:false, prevRate:null };
    resetLockLog(null);                                 // 見本は いつも 見本の 予定どおりの かぎから
    setClockTo(sc.start, true);
    if(sc.program && typeof sc.program === 'object'){ prevPaint = null; runner.start(sc.program); robotState().lock = houseLock; }   // 見本の プログラム（依頼者の「✨ 解決すると」。ブロックは 見せない）
    if(sc.rate){ demo.prevRate = rate; rate = sc.rate; $('rate').value = String(sc.rate); }   // 長い 見本は 速く（おわったら もどす）
    if(sc.pane){ const t = document.querySelector('.stab[data-pane="' + sc.pane + '"]'); if(t) t.click(); }
    running = true;
    setCaption(sc.title, sc.what);
    addLog('🎬', '見本：' + sc.title);
    document.querySelectorAll('.dcard').forEach((c, k) => c.classList.toggle('on', k === i));
    document.querySelectorAll('.rgo').forEach(b => b.classList.toggle('on', b.dataset.key === sc.key));
  }
  // 家の ルールの 見本（チームのページの「▶ 家で 見る」・📖 家のルール の ボタン）
  function playRule(key){ const sc = TeamHomeDemo.rule(key); if(sc) playScenario(sc); }
  function runDemo(){
    const sc = demo.sc;
    demo.events.forEach(ev => {
      if(ev.done || vmin < ev.m) return;
      if(ev.when === 'intruderInside' && !(intr.active && L.roomAt(intr.x, intr.z))) return;
      if(ev.when === 'intruderSeen' && !(intr.active && L.roomAt(intr.x, intr.z) === '居間')) return;   // 居間＝チャッピーの カメラに うつる
      if(ev.when === 'away' && !persona.away) return;
      ev.done = true;
      applyDemoEvent(ev);
    });
    demo.offs = demo.offs.filter(o => { if(vmin >= o.at){ o.fn(); return false; } return true; });
    if(vmin >= sc.end && !demo.ended){
      demo.ended = true;
      demo.offs.forEach(o => o.fn());
      demo.offs = [];
      if(demo.prevRate){ rate = demo.prevRate; $('rate').value = String(rate); demo.prevRate = null; }
      stopAll('');
      setCaption('見本は おわりました', sc.title + '。もう一度 見るときは、もう一度ボタンを押してください。');
    }
  }
  function applyDemoEvent(ev){
    const st = robotState();
    if(ev.narr) setCaption(demo.sc.title, ev.narr);
    if(ev.face) st.face = ev.face;
    if(ev.speech){
      st.speech = ev.speech;
      setTimeout(() => { if(st.speech === ev.speech) st.speech = ''; }, 3000);
      noteReaction('speech', '「' + ev.speech + '」としゃべった（見本）');
      if(ev.hear) personaHears(ev.speech);              // 家の ルールの 見本：おじいさんが 本当に 聞いて 動く（外なら とどかない）
    }
    if(ev.phone) openPhone(ev.phone, 'mail');
    if(ev.led){ st.led = true; demo.offs.push({ at:vmin + (ev.ledMin || 2), fn:() => { st.led = false; } }); }
    if(ev.fan){ st.fan = true; demo.offs.push({ at:vmin + (ev.fanMin || 60), fn:() => { st.fan = false; } }); }
    if(ev.lock !== undefined){ setHouseLock(ev.lock); addLog('🔒', '玄関のかぎを ' + (lockOn() ? 'かけた' : 'あけた') + '（見本）'); }
    if(ev.intruder === 'come') intruderCome();
    if(ev.intruder === 'leave') intruderLeave('知らない人が にげていった');
    if(ev.light) setLight(ev.light.room, !!ev.light.on, 'person');
    if(ev.mail) gotMail(ev.mail, ev.mailTo);
    if(ev.camera !== undefined){ st.camera = !!ev.camera; if(st.camera) openPhone(ev.mailTo || 'family', 'camera'); }
  }
  function renderDemoCards(){
    const box = $('demoList');
    if(!box) return;
    box.innerHTML = TeamHomeDemo.list().map((s, i) => '<div class="dcard" data-i="' + i + '"><span class="cap">' + esc(s.cap) + '</span><b>' + esc(s.title) + '</b><div>' + esc(s.what) + '</div><button class="dgo" data-i="' + i + '">▶ 見る</button></div>').join('');
    box.addEventListener('click', e => { if(e.target.classList.contains('dgo')) playScenario(Number(e.target.dataset.i)); });
  }
  function setCaption(title, text){
    const a = $('capTitle'), b = $('capText');
    if(a) a.textContent = title;
    if(b) b.textContent = text;
  }

  // ---------- 仮想のスマホ ----------
  let mailSeen = {};
  function gotMail(text, to){
    to = to === 'grandpa' ? 'grandpa' : 'family';
    // 同じ メールが 続けて 来たら 1通だけ（プログラムが くりかえし 送っても。10分（家の時計）か 3秒 あけば また 届く）
    const key = to + '|' + text, last = mailSeen[key], nowR = performance.now();
    mailSeen[key] = { v:vmin, r:nowR };
    if(last && (vmin - last.v < 10 || nowR - last.r < 3000)) return;
    phone.inbox[to].unshift({ t:clockText(vmin), text }); phone.inbox[to] = phone.inbox[to].slice(0, 30);
    rec('mail', { to, text });
    pop(L.CHAPPY_AT.x, 1.3, L.CHAPPY_AT.z, '📧 → ' + PHONE_NAME[to]);
    if(running && !demo){                              // 時刻つきで おぼえる（時刻を 合わせると、その時刻までに 届いた メールだけ スマホに のこる）
      const k = dayKey(nowMin());
      lockLog.mail = lockLog.mail.filter(x => x.k <= k);
      lockLog.mail.push({ k, to, t:clockText(vmin), text });
      if(lockLog.mail.length > 200) lockLog.mail.shift();
    }
    addLog('📧', PHONE_NAME[to] + 'に メールが とどいた：「' + text + '」');
    if(phone.open && phone.owner === to && phone.tab === 'camera' && robotState().camera) showToast('📧 ' + PHONE_NAME[to] + 'に メール：「' + text + '」');   // カメラを 見ているときは 映像の まま
    else openPhone(to, 'mail');                       // 新しいメールは、押さなくても そのスマホを開いて 見せる
    if(to === 'grandpa') personaHears(text, true);    // おじいさんは メールを読んで 動く（外にいても）
  }
  function openPhone(owner, tab){
    phone.owner = owner; phone.tab = tab || phone.tab; phone.open = true; phone.unread = 0;
    $('phone').style.display = 'flex';
    $('phoneTitle').textContent = '📱 ' + PHONE_NAME[owner];
    renderPhone();
  }
  function renderPhone(){
    if(!phone.open) return;
    const tab = phone.tab;
    document.querySelectorAll('#phone .tab').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
    const body = $('phoneBody');
    if(tab === 'mail'){
      const box = phone.inbox[phone.owner];
      body.innerHTML = box.length ? box.map(m => '<div class="msg"><small>' + m.t + ' チャッピーより</small>' + esc(m.text) + '</div>').join('') : '<div class="empty">まだ メールは ありません</div>';
    } else if(tab === 'camera'){
      body.innerHTML = '<canvas id="camCanvas" width="240" height="180"></canvas><div id="camNote" class="empty"></div>';
    }
  }
  const camRT = { rt:null, buf:null, cam:null, w:240, h:180 };
  function drawRobotCam(now){
    if(!phone.open || phone.tab !== 'camera' || now - phone.lastCam < 300) return;
    phone.lastCam = now;
    const cv = $('camCanvas'); if(!cv) return;
    const st = robotState(), note = $('camNote');
    if(!st.camera){ note.textContent = 'カメラは OFF です（チャッピーが「カメラ ON」にすると うつります）'; cv.style.opacity = 0.25; return; }
    note.textContent = ''; cv.style.opacity = 1;
    const R = world.refs.robot;
    if(!camRT.rt){
      camRT.rt = new T.WebGLRenderTarget(camRT.w, camRT.h);
      camRT.buf = new Uint8Array(camRT.w * camRT.h * 4);
      camRT.cam = new T.PerspectiveCamera(62, camRT.w / camRT.h, 0.05, 60);
    }
    const lens = new T.Vector3(0, 96, 62), dir = new T.Vector3(0, 0, 1);
    R.chappy.g.updateMatrixWorld(true);
    R.chappy.g.localToWorld(lens);
    dir.transformDirection(R.chappy.g.matrixWorld);
    camRT.cam.position.copy(lens); camRT.cam.lookAt(lens.clone().add(dir));
    const coneWas = R.cone.visible; R.cone.visible = false;
    const r = world.renderer;
    r.shadowMap.autoUpdate = false;
    r.setRenderTarget(camRT.rt); r.render(world.scene, camRT.cam);
    r.readRenderTargetPixels(camRT.rt, 0, 0, camRT.w, camRT.h, camRT.buf);
    r.setRenderTarget(null);
    r.shadowMap.autoUpdate = true;
    R.cone.visible = coneWas;
    const g = cv.getContext('2d'), img = g.createImageData(camRT.w, camRT.h);
    for(let y = 0; y < camRT.h; y++) img.data.set(camRT.buf.subarray((camRT.h - 1 - y) * camRT.w * 4, (camRT.h - y) * camRT.w * 4), y * camRT.w * 4);
    g.putImageData(img, 0, 0);
  }

  // ---------- ログ・きろく ----------
  // 「📜 できごと」：チャッピーの セリフ・おじいさんの ことば・メール・かぎ・知らない人 を 時刻つきで
  //  右の「一日」の 表の下に 出す（家の画面には かぶせない）。家の画面の 下の帯には いちばん新しい 1行
  const LOG_SKIP = { '🕐':1, '▶':1, '■':1, '✔':1, '🌙':1, '😊':1 };
  const evlog = [];
  let lastEv = null;
  function addLog(icon, text){
    if(LOG_SKIP[icon]) return;
    const line = clockText(vmin) + '　' + icon + ' ' + text;
    evlog.push(line);
    while(evlog.length > 60) evlog.shift();
    lastEv = { line, at: performance.now() };
    const box = $('evlog'); if(box){ box.innerHTML = evlog.map(t => '<div>' + esc(t) + '</div>').join(''); box.scrollTop = box.scrollHeight; }
    if(!demo){ const b = $('capText'); if(b) b.textContent = line; }
  }
  function clearLog(){
    evlog.length = 0; lastEv = null;
    const box = $('evlog'); if(box) box.innerHTML = '<div class="none">動かすと、ここに 時刻つきで 出ます</div>';
  }
  // おじいさん（g）・知らない人（i）の ことばを、頭の上の ふきだしに 4秒 出す
  const talk = { g:null, i:null };
  function say(who, text){
    talk[who] = { text, until: performance.now() + 4000 };
    addLog(who === 'g' ? '👴' : '🕵', (who === 'g' ? 'おじいさん：' : '知らない人：') + text);
  }

  // ---------- 明るさ・色・ドア・かぎの見た目 ----------
  const NIGHT = new T.Color('#1B2535'), DAY = new T.Color('#BFE6FF');
  function updateLight(){
    const h = nowMin() / 60;
    const k = smooth(5, 7, h) * (1 - smooth(17, 19, h));
    const W = world, R = W.refs, st = robotState();
    W.scene.background = NIGHT.clone().lerp(DAY, k);
    W.sun.intensity = 0.3 + 2.1 * k;
    W.hemi.intensity = 0.55 + 0.9 * k;
    R.windowMats.forEach(m => { m.emissiveIntensity = 0.25 + 0.9 * k; });
    L.ROOM_ORDER.forEach(room => { R.roomLights[room].intensity = lights[room] ? 2.4 : 0; R.setRoomLit[room](!!lights[room]); });
    const tvOn = !persona.away && persona.pose !== 'lie' && L.roomAt(persona.x, persona.z) === '居間' && h >= 20 && h < 22;
    R.tvMat.emissive.set(tvOn ? '#5FA8FF' : '#000000');
    R.tvMat.emissiveIntensity = tvOn ? 0.5 : 0;
    if(houseLock !== lastLock){
      lastLock = houseLock;
      R.setLock(houseLock);
      $('lockBtn').textContent = houseLock ? '🔓 かぎを あける' : '🔒 かぎを かける';
      if(houseLock && intr.active && !intr.fleeing && L.roomAt(intr.x, intr.z)) intruderLeave('玄関のかぎが かかって、知らない人は 外へ でていった');
    }
  }

  // ---------- チャッピーの体 ----------
  // 扇風機の風は、居間に いる おじいさんの方へ（いなければ ソファの方へ）
  const CHAPPY_YAW = Math.PI / 2;                     // チャッピーは 居間の入り口（玄関がわの ドア）を 向く。カメラで 入ってくる人が 見える
  function fanAim(){
    const inLiving = !persona.away && L.roomAt(persona.x, persona.z) === '居間';
    return inLiving ? { x:persona.x, z:persona.z } : { x:L.SOFA_SEAT.x, z:L.SOFA_SEAT.z };
  }
  function updateRobot(dt, now){
    const R = world.refs.robot, st = robotState();
    // チャッピーは、近くに いる人の方を 少しだけ向く（目線）
    let look = 0;
    const d = Math.hypot(persona.x - L.CHAPPY_AT.x, persona.z - L.CHAPPY_AT.z);
    if(!persona.away && d < 3){ look = clamp(wrapAngle(Math.atan2(persona.x - L.CHAPPY_AT.x, persona.z - L.CHAPPY_AT.z) - CHAPPY_YAW), -0.6, 0.6) * (1 - d / 3); }
    R.lookYaw = (R.lookYaw || 0) + (look - (R.lookYaw || 0)) * Math.min(1, dt * 2);
    R.root.rotation.y = CHAPPY_YAW - (st.pan - 90) * RAD * 0.6 + R.lookYaw;
    R.root.rotation.x = -(st.tilt - 15) * RAD * 0.2;
    R.ledMat.emissiveIntensity = st.led ? 1.6 : 0;
    R.led.visible = !!st.led;                         // LED は つけたときだけ 見せる（消えているときは 頭の上に 出さない）
    R.ledMat.color.set(st.led ? '#FFE27A' : '#F3EDE2');
    R.ledLight.intensity = st.led ? 1.2 : 0;
    world.refs.fan.update(!!st.fan, dt, fanAim());
    R.cone.visible = !!st.camera;
    R.cone.material.opacity = 0.12 + 0.05 * Math.sin(now / 300);
    // チャッピーの 3D の 体（まばたき・しっぽ・耳）と 画面の顔（表情）
    R.chappy.update(performance.now() / 1000, dt, { mood:CHAPPY_MOOD[st.face] || 'normal' });
  }
  // 見本・プログラムの 顔（st.face）を、3D のチャッピーの画面の 顔（normal / happy / ouch）に うつす
  const CHAPPY_MOOD = { neutral:'normal', smile:'happy', happy:'happy', worried:'ouch', sad:'ouch', surprised:'ouch', angry:'ouch', doubt:'ouch', sleepy:'normal' };
  function placeBubble(el, x, y, z, text){
    const v = new T.Vector3(x, y, z); v.project(camera);
    if(v.z > 1){ el.style.display = 'none'; return; }
    el.textContent = text;
    el.style.left = ((v.x + 1) / 2 * stageEl.clientWidth) + 'px';
    el.style.top = ((1 - v.y) / 2 * stageEl.clientHeight) + 'px';
    el.style.display = 'block';
  }
  function updateBubble(){
    const st = robotState(), now = performance.now();
    if(!st.speech) bubble.style.display = 'none';
    else placeBubble(bubble, L.CHAPPY_AT.x, 0.95, L.CHAPPY_AT.z, '🤖「' + st.speech + '」');
    const g = talk.g && now < talk.g.until && !persona.away && !mode3p ? talk.g : null;
    if(!g) $('bubbleG').style.display = 'none';
    else placeBubble($('bubbleG'), persona.x, persona.pose === 'lie' ? 1.0 : 1.75, persona.z, '👴' + g.text);
    const i = talk.i && now < talk.i.until && intr.active ? talk.i : null;
    if(!i) $('bubbleI').style.display = 'none';
    else placeBubble($('bubbleI'), intr.x, 1.8, intr.z, '🕵' + i.text);
  }

  // ---------- おじいさんの姿（歩く・すわる・ねる・目線）----------
  function setPersonaPose(Pp, dt){
    Pp.cane.visible = persona.pose !== 'eat' && persona.pose !== 'lie';     // ねるとき・食べるときは 杖を そばに立てる
    Pp.bowl.visible = persona.pose === 'eat';
    world.refs.restCane.bed.visible = persona.pose === 'lie';
    world.refs.restCane.table.visible = persona.pose === 'eat';
    if(persona.pose === 'lie'){
      Pp.group.rotation.order = 'YXZ';
      Pp.group.position.set(persona.x, L.BED.top + 0.12, persona.z);
      Pp.group.rotation.set(-Math.PI / 2, Math.PI / 2, 0);
      TeamHome.poseSit(Pp, false, 1);
      Pp.elbowL.rotation.x = 0; Pp.elbowR.rotation.x = 0;
      return false;
    }
    if(persona.pose === 'sit'){
      Pp.group.rotation.order = 'XYZ';
      Pp.group.position.set(persona.x, L.SOFA_SEAT.y - 0.9, persona.z);
      Pp.group.rotation.set(0, persona.rot, 0);
      TeamHome.poseSit(Pp, true, dt);
      Pp.shoulderL.rotation.x = 0.15; Pp.shoulderR.rotation.x = 0.15;
      Pp.elbowL.rotation.x = -0.5; Pp.elbowR.rotation.x = -0.5;
      return false;
    }
    if(persona.pose === 'eat'){
      Pp.group.rotation.order = 'XYZ';
      Pp.group.position.set(persona.x, L.SOFA_SEAT.y - 0.9, persona.z);
      Pp.group.rotation.set(0, persona.rot, 0);
      TeamHome.poseSit(Pp, true, dt);
      persona.eatT += dt;
      const c = (1 + Math.sin(persona.eatT * 2.6)) / 2;                // 0 ＝ 茶わんが さがった、1 ＝ 口の近く
      Pp.shoulderL.rotation.x = 0.15; Pp.elbowL.rotation.x = -0.5;
      Pp.shoulderR.rotation.x = -1.0 - 0.2 * c; Pp.elbowR.rotation.x = -1.2 - 1.0 * c;
      return false;
    }
    return true;
  }
  function personaStep(dt, now){
    const Pp = world.refs.persona;
    personaKeyCheck();
    persona.touching = false;
    let moving = false;
    if(setPersonaPose(Pp, dt)){
      const sp = personaSpeed();
      walkMul = sp / 1.4; persona.stepMul = Math.min(3, walkMul);
      moving = stepWalker(persona, dt, sp) || (mode3p && (keys.KeyW || keys.KeyS));
      poseWalker(persona, Pp, moving, dt);
      if(persona.lockAnim && persona.pauseT > 0){        // ドアに 手を のばして かぎを まわす
        const c = Math.sin(performance.now() / 90);
        Pp.shoulderR.rotation.x = -1.25 + 0.08 * c; Pp.elbowR.rotation.x = -0.45;
        Pp.shoulderL.rotation.x = 0.1; Pp.elbowL.rotation.x = 0;
      }
    }
    if(persona.leaveOff && (persona.away || L.roomAt(persona.x, persona.z) !== persona.leaveOff)){
      const r = persona.leaveOff; persona.leaveOff = null; setLight(r, false, 'person');
    }
    Pp.group.visible = !persona.away && !mode3p;
    // 頭の向き：近くの人（知らない人がいれば その人）を見る
    let want = 0;
    if(!persona.away && persona.pose === 'stand'){
      const tgt = intr.active && !intr.turnAway ? intr : (Math.hypot(persona.x - L.CHAPPY_AT.x, persona.z - L.CHAPPY_AT.z) < 2.8 ? { x:L.CHAPPY_AT.x, z:L.CHAPPY_AT.z } : null);
      if(tgt){ want = clamp(wrapAngle(Math.atan2(tgt.x - persona.x, tgt.z - persona.z) - persona.rot), -1.2, 1.2); }
    }
    persona.headYaw += (want - persona.headYaw) * Math.min(1, dt * 3);
    Pp.head.rotation.y = persona.headYaw;
    Pp.head.rotation.x = persona.pose === 'eat' ? 0.25 : 0.04;      // 食べるときは 少し うつむく
  }
  function updateSitMoves(){ /* ソファの ばしょは sitDown() で決める */ }

  // ---------- カメラ ----------
  function eyePoint(){
    const eyeY = persona.pose === 'sit' || persona.pose === 'eat' ? 1.12 : 1.45;
    return new T.Vector3(persona.x, eyeY, persona.z);
  }
  function lookDir(){
    const c = Math.cos(persona.pitch);
    return new T.Vector3(Math.sin(persona.rot) * c, Math.sin(persona.pitch), Math.cos(persona.rot) * c);
  }
  function updateCamera(){
    if(mode3p && !persona.away){
      const eye = eyePoint(), dir = lookDir();
      camera.position.copy(eye).addScaledVector(dir, 0.05);
      camera.lookAt(eye.clone().addScaledVector(dir, 5));
      return;
    }
    const o = orbit, s = Math.sin(o.phi);
    camera.position.set(o.target.x + o.r * s * Math.sin(o.theta), o.target.y + o.r * Math.cos(o.phi), o.target.z + o.r * s * Math.cos(o.theta));
    camera.lookAt(o.target);
  }
  // 🎥 おじいさんを 追う：いつも おじいさんの 近くを 見せる（外に いる ときは 玄関・るすに 知らない人が いれば その人）
  function followTarget(){
    if(intr.active && !intr.turnAway && (persona.away || intr.fleeing)) return { x:intr.x, z:intr.z, r:8.5 };
    if(persona.away) return { x:L.FRONT_DOOR.x, z:L.FRONT_DOOR.z + 0.4, r:10 };
    return { x:persona.x, z:persona.z, r:persona.pose === 'lie' ? 7.6 : 8.2 };
  }
  function updateFollow(dt){
    if(!follow || mode3p || tween || camDrag) return;
    const f = followTarget(), k = 1 - Math.exp(-dt * 2.6);
    orbit.target.x += (f.x - orbit.target.x) * k;
    orbit.target.z += (f.z - orbit.target.z) * k;
    orbit.target.y += (0.55 - orbit.target.y) * k;
    orbit.r += (f.r * followZoom - orbit.r) * k;
  }
  function setFollow(on){
    follow = !!on;
    const b = $('followBtn'); if(b){ b.classList.toggle('on', follow); b.title = follow ? 'カメラが おじいさんを 追っています（おすと とまる）' : 'おすと カメラが おじいさんを 追います'; }
  }
  // ポップ：家の中の できごとを、その場所に 小さく 出して 上へ きえる
  function pop(x, y, z, text){
    if(!stageEl || !camera) return;
    const el = document.createElement('div'); el.className = 'pop'; el.textContent = text;
    stageEl.appendChild(el);
    pops.push({ el, x, y, z, t0:performance.now() });
    if(pops.length > 8){ const o = pops.shift(); o.el.remove(); }
  }
  function updatePops(now){
    for(let i = pops.length - 1; i >= 0; i--){
      const p = pops[i], age = (now - p.t0) / 1000;
      if(age > 2.4){ p.el.remove(); pops.splice(i, 1); continue; }
      const v = new T.Vector3(p.x, p.y + age * 0.35, p.z); v.project(camera);
      if(v.z > 1){ p.el.style.display = 'none'; continue; }
      p.el.style.display = 'block';
      p.el.style.left = ((v.x + 1) / 2 * stageEl.clientWidth) + 'px';
      p.el.style.top = ((1 - v.y) / 2 * stageEl.clientHeight) + 'px';
      p.el.style.opacity = String(age < 1.6 ? 1 : Math.max(0, 1 - (age - 1.6) / 0.8));
    }
  }
  function setMini(on){ document.body.classList.toggle('mini', on); }
  const dayTitle = () => (personaName ? personaName + 'さん' : 'おじいさん') + 'の 一日';
  function setWho(n){
    personaName = String(n || '').slice(0, 30);
    const h = document.querySelector('header h1'); if(h) h.textContent = '🏠 ' + (personaName ? personaName + 'さんの 家' : 'チャッピーのいえ');
  }
  // 依頼者の 見本（親が つくった 台本を たしかめて 動かす）
  function playPeek(s){
    const num = v => (v === null || v === '' || !isFinite(Number(v))) ? null : Number(v);
    const start = num(s.start), end = num(s.end);
    if(start == null || end == null || end <= start) return;
    const sc = { key:'peek', cap:'見本', title:String(s.title || '見本').slice(0, 60), what:String(s.what || '').slice(0, 200),
      start, end, rate:[1, 10, 30].includes(Number(s.rate)) ? Number(s.rate) : 10,
      events:(Array.isArray(s.events) ? s.events : []).slice(0, 12).filter(e => e && num(e.m) != null)
        .map(e => ({ m:num(e.m), narr:e.narr ? String(e.narr).slice(0, 160) : undefined, intruder:e.intruder === 'come' ? 'come' : undefined })),
      program:s.program && typeof s.program === 'object' ? s.program : null };
    if(Array.isArray(s.day)) sc.day = P.clean(s.day);
    setFollow(true);
    playScenario(sc);
  }
  function stepTween(dt){
    tween.k = Math.min(1, tween.k + dt / 0.8);
    const e = smooth(0, 1, tween.k), a = tween.from, b = tween.to;
    orbit.theta = a.theta + (b.theta - a.theta) * e;
    orbit.phi = a.phi + (b.phi - a.phi) * e;
    orbit.r = a.r + (b.r - a.r) * e;
    orbit.target.lerpVectors(a.t, b.t, e);
    if(tween.k >= 1) tween = null;
  }
  // 壁は消さない。カメラから見て 目の前をふさぐ壁だけ すけて見せる
  const wallState = new Map();
  function updateWallFade(){
    const segs = world.refs.wallSegs;
    if(!segs || !segs.length) return;
    const c = camera.position;
    let lx, ly, lz;
    if(mode3p && !persona.away){ const e = eyePoint().addScaledVector(lookDir(), 5); lx = e.x; ly = e.y; lz = e.z; }
    else { lx = orbit.target.x; ly = orbit.target.y; lz = orbit.target.z; }
    segs.forEach(sg => {
      const on = segHit(c.x, c.z, lx, lz, sg.ax, sg.az, sg.bx, sg.bz, c.y, ly, L.WALL_H);
      if(wallState.get(sg.g) === on) return;
      wallState.set(sg.g, on);
      sg.mats.forEach(m => { m.transparent = true; m.opacity = on ? 0.3 : 1; m.depthWrite = !on; m.needsUpdate = true; });
    });
  }
  function segHit(x1, z1, x2, z2, ax, az, bx, bz, y1, y2, h){
    const d = (x2 - x1) * (bz - az) - (z2 - z1) * (bx - ax);
    if(Math.abs(d) < 1e-9) return false;
    const t = ((ax - x1) * (bz - az) - (az - z1) * (bx - ax)) / d;
    const u = ((ax - x1) * (z2 - z1) - (az - z1) * (x2 - x1)) / d;
    if(t <= 0.02 || t >= 0.98 || u < 0 || u > 1) return false;
    return (y1 + (y2 - y1) * t) < h;
  }

  // ---------- 毎フレーム ----------
  let lastFrame = performance.now(), lastClockTxt = '', pageVisible = true, viewVisible = true;
  function frame(now){
    requestAnimationFrame(frame);
    if(!pageVisible || !viewVisible){ lastFrame = now; return; }      // 見えていないときは 動かさない（学校のパソコンを軽く）
    const dt = Math.min(0.1, (now - lastFrame) / 1000); lastFrame = now;
    const held = running && holdClock(dt);
    if(running && !held){
      advanceClock(dt);
      if(vmin >= dayStart + DAY_MIN){ vmin = dayStart + DAY_MIN; endDay(); }
    }
    if(demo && running) runDemo();
    if(tween) stepTween(dt);
    updateFollow(dt);
    walkFirstPerson(dt);
    updateSchedule();
    autoIntruder();
    personaStep(dt, now);
    sampleStates();
    updateChecks();
    intruderStep(dt);
    updateDoor(dt);
    updateRobot(dt, now);
    updateLight();
    updateThermo();
    updateBubble();
    updatePops(now);
    const ct = clockText(vmin) + (held ? ' ⏸' : '');                 // ⏸ ＝ 動きが おわるまで 時計を 止めている
    if(ct !== lastClockTxt){ lastClockTxt = ct; $('clockTxt').textContent = ct; const mc = $('miniClock'); if(mc) mc.textContent = ct; $('clockTxt').title = held ? '動きが おわるまで 時計を 止めています' : ''; }
    $('intrBtn').disabled = !persona.away || intr.active;
    $('sitBtn').disabled = false;
    updateCamera();
    updateWallFade();
    world.renderer.render(world.scene, camera);
    drawRobotCam(now);
    if(demo === null && (ROLE === 'request' || running)) setCaptionIdle(now);
    markNowRow();
  }
  let idleT = 0;
  function setCaptionIdle(now){
    if(now - idleT < 1000) return;
    idleT = now;
    const cur = currentEntry(entriesNow(), nowMin());
    const recent = lastEv && now - lastEv.at < 8000;                      // 8秒 以内の できごとは 下の帯に のこす
    if(cur && !(demo)) setCaption(dayTitle() + '（いま ' + clockText(vmin) + '）', recent ? lastEv.line : P.describe(cur));
  }
  // 表の「いまの行」に 色を つける（見本を 見ているときは つけない）
  let nowRow = -1;
  function markNowRow(){
    const tb = $('planRows'); if(!tb) return;
    const cur = demo ? null : currentEntry(schedule, nowMin());
    const i = cur ? schedule.indexOf(cur) : -1;
    if(i === nowRow) return;
    nowRow = i;
    [...tb.children].forEach((tr, k) => tr.classList.toggle('now', k === i));
  }

  // センサーの表（文字は作りなおさず、かわった数字だけ入れかえる＝ゆれない）
  const SENS = [['distance','きょり','cm'],['light','明るさ',''],['temp','温度','℃'],['hour','時',''],['minute','分',''],
                ['pir','人がいる',''],['grandpa_in','おじいさんが 家にいる',''],['stranger_in','知らない人が 家にいる',''],
                ['_rooms','人がいる部屋',''],['_lit','電気がついている部屋',''],['_lock','玄関のかぎ',''],
                ['button_red','赤ボタン',''],['button_blue','青ボタン',''],['button_both','同時','']];
  let sensorCells = null;
  function drawSensors(){
    const s = sensorValues();
    // 部屋ごとの ようす（🧪 仮想だけの ブロックで わかること）も ならべて 見せる
    s._rooms = [...new Set(peopleInside().map(w => L.roomAt(w.x, w.z)).filter(Boolean))].join('・') || 'なし';
    s._lit = L.ROOM_ORDER.filter(k => lights[k]).join('・') || 'なし';
    s._lock = lockOn() ? 'かかっている' : 'あいている';
    if(!sensorCells){
      const box = $('sensors'); box.innerHTML = ''; sensorCells = {};
      SENS.forEach(([k, label]) => {
        const a = document.createElement('span'); a.textContent = label;
        const b = document.createElement('b'); b.className = 'v';
        box.appendChild(a); box.appendChild(b); sensorCells[k] = b;
      });
    }
    SENS.forEach(([k, , unit]) => {
      const raw = s[k];
      const v = typeof raw === 'boolean' ? (raw ? 'はい' : 'いいえ') : (String(raw) + unit);
      if(sensorCells[k].textContent !== v) sensorCells[k].textContent = v;
    });
  }

  // ---------- 表（予定）----------
  function markDirty(){
    dirty = true; const b = $('saveBtn'); if(b) b.classList.add('need');
    if(EMBED) window.parent.postMessage({ type:'teamhome-dirty', schedule }, location.origin);   // 依頼を送るとき、保存していない表も いっしょに 保存してもらう
  }
  function renderTable(){
    const tb = $('planRows'); if(!tb) return;
    tb.innerHTML = P.renderRows(schedule, ROLE === 'request' && tblEdit);
    nowRow = -1;
  }
  // 家の ルール（一日の 情報）：teamhome-check.js の RULES・TEMPS から
  function renderRules(){
    const box = $('rulesBox'); if(!box) return;
    const top = Math.max(...TeamCheck.TEMPS.map(t => t[1]));
    const temps = '<div class="temps">' + TeamCheck.TEMPS.map(([h, t]) =>
      '<div><i class="' + (t >= 30 ? 'hot' : '') + '" style="height:' + Math.round(48 * (t - 15) / (top - 15)) + 'px"></i>' + t + '℃<br>' + h + '時</div>').join('') + '</div>';
    box.innerHTML = '<p class="note" style="margin:0 0 7px">この家では、こう なります（依頼者も 開発者も 同じ）。「▶」で 家の中で 見られます。</p>' +
      TeamCheck.RULES.map(r => '<div class="rule"><b>' + r.icon + ' ' + esc(r.title) + '</b>' +
        '<ul>' + r.points.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>' + (r.temps ? temps : '') +
        '<div class="btns">' + r.demos.map(([k, label]) => '<button class="rgo" data-key="' + k + '">▶ ' + esc(label) + '</button>').join('') + '</div></div>').join('');
    box.addEventListener('click', e => { const b = e.target.closest('.rgo'); if(b) playRule(b.dataset.key); });
  }
  // 「一日まるごと ためす」：起きる 1時間前から 速く 動かして、合格条件を ぜんぶ たしかめる（起きる時間は チームで ちがう）
  function dayFrom(){
    const w = schedule.find(e => e.act === 'wake' && e.m >= 180 && e.m < 720);
    return w ? w.m - 60 : DAY_START;
  }
  function checkAll(mode, from){
    setClockTo(typeof from === 'number' && from >= 0 && from < 1440 ? Math.round(from) : dayFrom());
    rate = 30; $('rate').value = '30';
    if(mode === 'program'){ if(ROLE === 'request') replay(prog); else run(); }
    else plainDay();
    checkOpen = -1; updateChecks(true);
  }
  function applyScheduleChange(){
    appliedKey = null;
    resetLockLog(lockLog.mode);                         // 予定が かわったら、前の かぎの きろくは 使わない
    traces.plain = traces.program = null;               // 合格条件の たしかめも やりなおし
    if(trace && trace.mode) newTrace(trace.mode);
    checkDirty = true;
    if(!manual) updateSchedule();
  }
  function setupTable(){
    const tb = $('planRows'); if(!tb) return;
    $('editTblBtn').addEventListener('click', () => {
      tblEdit = !tblEdit;
      document.body.classList.toggle('tbl-edit', tblEdit);
      $('editTblBtn').classList.toggle('on', tblEdit);
      $('editTblBtn').textContent = tblEdit ? '✏ 直接 なおすのを やめる' : '✏ 表を 直接 なおす（発展）';
      renderTable();
    });
    tb.addEventListener('change', e => {
      if(ROLE !== 'request' || !tblEdit) return;
      const rows = P.readRows($('planTable'));
      const domM = [...tb.querySelectorAll('.ptime')].map(t => t.value);
      const reordered = domM.some((v, k) => k > 0 && v < domM[k - 1]);       // 時刻を かえて 順番が かわった
      const structural = e.target.classList.contains('pact') || e.target.classList.contains('proom') || reordered;   // 出た部屋の 名前も かわる
      schedule = rows; markDirty(); applyScheduleChange();
      if(structural) renderTable();
    });
    tb.addEventListener('click', e => {
      if(!e.target.classList.contains('pdel') || ROLE !== 'request' || !tblEdit) return;
      const i = Number(e.target.closest('tr').dataset.i);
      schedule = P.clean(P.readRows($('planTable')).filter((_, k) => k !== i));
      markDirty(); renderTable(); applyScheduleChange();
      addLog('🗑', '予定の行を消しました（まだ保存していません）');
    });
    $('addRowBtn').addEventListener('click', () => {
      const cur = P.readRows($('planTable')), last = cur[cur.length - 1];
      const m = last ? Math.min(last.m + 60, 1439) : 720;          // いちばん下の行の 1時間あと（23:59 まで）
      schedule = P.clean(cur.concat([{ m, act:'go', room:'居間', light:'keep', leave:'keep', text:'' }]));
      markDirty(); renderTable(); applyScheduleChange();
    });
    $('planReset').addEventListener('click', () => {
      if(!window.confirm('おじいさんの一日を、最初の一日にもどします。いまの表は消えます。よろしいですか？')) return;
      schedule = P.clean(null); markDirty(); renderTable(); applyScheduleChange();
    });
    $('saveBtn').addEventListener('click', () => {
      if(ROLE !== 'request') return;
      schedule = P.clean(P.readRows($('planTable')));
      if(EMBED){
        window.parent.postMessage({ type:'teamhome-save', schedule }, location.origin);
        $('statusTxt').textContent = '保存しています…';
      } else {
        $('statusTxt').textContent = 'ひとりで開いています（保存は チームのページから）';
        dirty = false; $('saveBtn').classList.remove('need');
      }
    });
  }

  // ---------- ボタン ----------
  function setupButtons(){
    const hold = (id, fn) => {
      const b = $(id); if(!b) return;
      b.addEventListener('pointerdown', e => { e.preventDefault(); fn(true); });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => b.addEventListener(ev, () => fn(false)));
    };
    hold('redBtn', on => { btn.red = on; });
    hold('blueBtn', on => { btn.blue = on; });
    hold('bothBtn', on => { btn.red = on; btn.blue = on; });
    $('rate').addEventListener('change', e => { rate = Number(e.target.value); });
    $('runBtn').addEventListener('click', run);
    $('runBtn').textContent = ROLE === 'request' ? '▶ はじめの状態で動かす' : '▶ プログラムで動かす';
    $('plainBtn').addEventListener('click', plainDay);
    // 合格条件：「▶ ためす」と、行を おすと 根拠を ひらく／とじる
    $('ckBox').addEventListener('click', e => {
      const a = e.target.closest('button[data-all]');
      if(a){ checkAll(a.dataset.all); return; }
      const b = e.target.closest('button[data-run]');
      if(b){ runCheck(+b.dataset.i, b.dataset.run); return; }
      const r = e.target.closest('.ck'); if(!r) return;
      checkOpen = checkOpen === +r.dataset.i ? -1 : +r.dataset.i; renderChecks();
    });
    renderChecks();
    $('replayBtn').addEventListener('click', () => replay(prog));
    $('followBtn').addEventListener('click', () => setFollow(!follow));
    $('miniStop').addEventListener('click', () => stopAll('とめた'));
    $('stopBtn').addEventListener('click', () => stopAll('とめた'));
    $('resetBtn').addEventListener('click', () => setClockTo(DAY_START));
    $('setTimeBtn').addEventListener('click', () => {
      const m = /^(\d{1,2}):(\d{2})$/.exec($('timeIn').value || '');
      if(!m || Number(m[1]) > 23 || Number(m[2]) > 59){ showToast('時刻は 「6:30」のように 入れてね'); return; }
      setClockTo(Number(m[1]) * 60 + Number(m[2]));
    });
    $('roomBtns').addEventListener('click', e => { const r = e.target.dataset.room; if(r) manualGo(r); });
    $('outBtn').addEventListener('click', manualOutside);
    $('inBtn').addEventListener('click', manualEnter);
    $('sitBtn').addEventListener('click', manualSit);
    $('eatBtn').addEventListener('click', manualEat);
    $('sleepBtn').addEventListener('click', manualSleep);
    $('wakeBtn').addEventListener('click', manualWake);
    $('lockBtn').addEventListener('click', () => { setHouseLock(!lockOn()); addLog('🔒', '玄関のかぎを ' + (lockOn() ? 'かけた' : 'あけた') + '（手で）'); });
    $('intrBtn').addEventListener('click', intruderCome);
    $('intrOutBtn').addEventListener('click', () => intruderLeave('知らない人を 外へ 追い出しました'));
    $('views').addEventListener('click', e => {
      const v = VIEWS[e.target.dataset.view]; if(!v) return;
      if(mode3p) $('p3Btn').click();
      setFollow(false);
      tween = { k:0, from:{ theta:orbit.theta, phi:orbit.phi, r:orbit.r, t:orbit.target.clone() }, to:{ theta:v.theta, phi:v.phi, r:v.r, t:new T.Vector3(v.x, v.y, v.z) } };
    });
    $('p3Btn').addEventListener('click', () => {
      mode3p = !mode3p;
      $('p3Btn').classList.toggle('on', mode3p);
      if(mode3p){ manualOn(); persona.queue = []; persona.onDone = null; appearIfAway(); persona.pitch = 0; }
      addLog('👁', mode3p ? '人目線（ドラッグで 見まわす・W・S で歩く・A・D で向きを変える）' : 'ふつうの見方にもどしました');
    });
    [['phoneBtn', 'family'], ['phoneBtn2', 'grandpa']].forEach(([id, owner]) => $(id).addEventListener('click', () => {
      if(phone.open && phone.owner === owner){ phone.open = false; $('phone').style.display = 'none'; return; }
      openPhone(owner);
    }));
    document.querySelectorAll('#phone .tab').forEach(b => b.addEventListener('click', () => { phone.tab = b.dataset.tab; renderPhone(); }));
    $('phoneClose').addEventListener('click', () => { phone.open = false; $('phone').style.display = 'none'; });
    document.querySelectorAll('.stab').forEach(b => b.addEventListener('click', () => {
      document.querySelectorAll('.stab').forEach(x => x.classList.toggle('on', x === b));
      document.querySelectorAll('.spane').forEach(p => { p.style.display = p.id === 'pane-' + b.dataset.pane ? 'block' : 'none'; });
    }));
  }

  // 3D の操作（ドラッグ・ホイール）。人目線では ドラッグで 見まわす
  function setupCamera(){
    const el = world.renderer.domElement; el.style.touchAction = 'none';
    let drag = null;
    el.addEventListener('pointerdown', e => { tween = null; camDrag = true; drag = { x:e.clientX, y:e.clientY }; el.setPointerCapture(e.pointerId); });
    el.addEventListener('pointermove', e => {
      if(!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if(mode3p && !persona.away){
        persona.rot -= dx * 0.006;
        persona.pitch = clamp(persona.pitch - dy * 0.004, -0.9, 0.6);
      } else {
        orbit.theta -= dx * 0.006;
        orbit.phi = clamp(orbit.phi - dy * 0.004, 0.3, 1.45);
      }
      drag = { x:e.clientX, y:e.clientY };
    });
    const end = () => { drag = null; camDrag = false; };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('wheel', e => {
      e.preventDefault(); if(mode3p) return;
      if(follow) followZoom = clamp(followZoom + e.deltaY * 0.0012, 0.55, 2.3); else orbit.r = clamp(orbit.r + e.deltaY * 0.01, 6, 26);
    }, { passive:false });
  }

  // キーボード：Z＝赤、X＝青（両方で同時）。人目線は W A S D。入力中（チャットなど）は 反応しない
  function setupKeys(){
    const typing = () => { const t = document.activeElement; return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable); };
    window.addEventListener('keydown', e => {
      if(typing()) return;
      keys[e.code] = true;
      if(e.code === 'KeyZ') btn.red = true;
      if(e.code === 'KeyX') btn.blue = true;
      if(mode3p && ['KeyW','KeyA','KeyS','KeyD'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', e => {
      keys[e.code] = false;
      if(e.code === 'KeyZ') btn.red = false;
      if(e.code === 'KeyX') btn.blue = false;
    });
    window.addEventListener('blur', () => { Object.keys(keys).forEach(k => { keys[k] = false; }); btn.red = false; btn.blue = false; });
  }

  // 親のページからの メッセージ（開発者：プログラム・依頼の一日 ／ 依頼者：保存の結果）
  function setupMessages(){
    window.addEventListener('message', e => {
      if(e.origin !== location.origin || !e.data || typeof e.data !== 'object') return;
      const d = e.data;
      if(d.type === 'teamhome-init' || d.type === 'teamhome-schedule'){
        if(Array.isArray(d.schedule)){
          schedule = P.clean(d.schedule); dirty = false; renderTable(); applyScheduleChange();
          if(!running && !demo) setHouseLock(lockFromSchedule(nowMin()));     // とどいた 予定で かぎを きめなおす
        }
        if(d.program && typeof d.program === 'object') setProgram(d.program);
        if(d.criteria && typeof d.criteria === 'object') setCriteria(d.criteria);
        if(d.type === 'teamhome-init' && d.note) showToast(d.note);
        if(typeof d.who === 'string') setWho(d.who);
        if(d.face && typeof d.face === 'object' && window.GrandpaFace) world.refs.persona.setLook(GrandpaFace.look(d.face));   // 依頼者が えらんだ 見た目
      }
      if(d.type === 'teamhome-criteria') setCriteria(d.criteria);         // 合格条件（依頼書）
      if(d.type === 'teamhome-checkall') checkAll(d.mode === 'program' ? 'program' : 'plain', d.from);   // チームのページの「④ ためす」
      if(d.type === 'teamhome-rule' && typeof d.key === 'string') playRule(d.key);              // チームのページの「① 家の ルール」
      if(d.type === 'teamhome-peek' && d.scene && typeof d.scene === 'object') playPeek(d.scene);   // 依頼者の「👀 困る ようす」「✨ 解決すると」
      if(d.type === 'teamhome-runcheck' && Number.isInteger(d.i)) runCheck(d.i, d.mode === 'program' ? 'program' : 'plain');   // 合格条件 1つだけ ためす
      if(d.type === 'teamhome-layout') setMini(!!d.mini);                                        // 横に 出した 小さい 家（家の 画面だけ）
      if(d.type === 'teamhome-program' && d.program && typeof d.program === 'object') setProgram(d.program);
      // チームのページの「🏠 家で再現する」：いつも 朝から 一日まるごと（開発者の「家で 一日 ためす」と 同じ）。
      // 前の ためしの 時計の つづき（夜中など）から 動くと、8:00 などの 場面が おきないまま おわって しまうため
      if(d.type === 'teamhome-replay' && ROLE === 'request' && d.program && typeof d.program === 'object'){ setProgram(d.program); checkAll('program', d.from); }
      if(d.type === 'teamhome-status'){
        const s = $('statusTxt'); if(s) s.textContent = d.msg || '';
        if(d.ok){ dirty = false; const b = $('saveBtn'); if(b) b.classList.remove('need'); }
      }
    });
  }
  // プログラムの「○時○分になったら」（毎日・毎週・日付）の 時刻。時計が その分を とびこさないように 少し 止める
  let calTargets = [], calHold = 0;
  function collectCal(p){
    const out = new Set();
    const walk = list => (list || []).forEach(a => {
      if(!a || typeof a !== 'object') return;
      if(a.type === 'if' && a.condition && a.condition.calendar){
        const v = k => { const x = (a.condition.all || []).find(y => y.sensor === k); return x ? Number(x.value) : null; };
        if(v('hour') != null && v('minute') != null) out.add(v('hour') * 60 + v('minute'));
      }
      walk(a.actions); walk(a.then); walk(a.else);
    });
    walk(p && p.actions); ((p && p.threads) || []).forEach(t => walk(t.actions));
    return [...out];
  }
  // つぎに すすむ 時刻（とちゅうに「○時○分」が あれば そこで 0.2秒 止まる）
  function advanceClock(dt){
    if(calHold > 0){ calHold -= dt; return; }
    const next = vmin + dt * rate, a = Math.floor(vmin), span = Math.floor(next) - a;
    talkBudget = Math.min(6, talkBudget + dt * rate * 0.2);
    if(prog && calTargets.length && span > 0 && !demo && lockLog.mode === 'program'){
      const d = calTargets.map(t => ((t - a) % 1440 + 1440) % 1440).filter(x => x >= 1 && x <= span).sort((x, y) => x - y)[0];
      if(d){ vmin = a + d + 0.001; calHold = 0.2; return; }
    }
    vmin = next;
  }
  function setProgram(p){
    calTargets = collectCal(p);
    if(JSON.stringify(p) !== JSON.stringify(prog)){
      resetLockLog(lockLog.mode);                       // プログラムが かわったら、前の かぎの きろくは 使わない
      if(trace && trace.mode === 'program') newTrace('program'); else traces.program = null;   // プログラムの たしかめも やりなおし
      checkDirty = true;
    }
    prog = p;
    checkStatic();
    const s = $('progTxt'); if(s) s.textContent = (p.actions && p.actions.length) || (p.threads && p.threads.length) ? '届いたプログラムで 動きます' : 'プログラムは まだ ありません';
  }

  // ---------- 始まり ----------
  function start(){
    document.body.dataset.role = ROLE;
    stageEl = $('view').parentElement;
    bubble = $('bubble');
    $('faceBox').innerHTML = ChappySim.FACE_SVG;
    const renderer = new T.WebGLRenderer({ antialias:true });
    renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;      // かげの ふちを やわらかく
    renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = T.SRGBColorSpace;
    $('view').appendChild(renderer.domElement);
    const scene = new T.Scene();
    camera = new T.PerspectiveCamera(34, 1, 0.1, 200);
    const hemi = new T.HemisphereLight('#F3F8FF', '#B9A88E', 1.2); scene.add(hemi);
    const sun = new T.DirectionalLight('#FFF4E2', 2.3);
    sun.position.set(-7, 13, 8); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left:-10, right:10, top:10, bottom:-10, near:1, far:60 });
    sun.shadow.camera.updateProjectionMatrix(); sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.03;
    scene.add(sun);
    const fill = new T.DirectionalLight('#E8F0FF', 0.5); fill.position.set(8, 6, -6); scene.add(fill);
    const refs = TeamHome.build(scene);
    world = { scene, renderer, sun, hemi, refs };
    setExpr('smile');
    setupCamera();
    const resize = () => {
      const w = stageEl.clientWidth, h = stageEl.clientHeight;
      if(!w || !h) return;
      renderer.setSize(w, h, false); renderer.domElement.style.width = w + 'px'; renderer.domElement.style.height = h + 'px';
      camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', resize);
    if(window.ResizeObserver) new ResizeObserver(resize).observe(stageEl);
    resize();
    if('IntersectionObserver' in window){
      new IntersectionObserver(es => { viewVisible = es[0].isIntersecting; }, { threshold:0 }).observe(stageEl);
    }
    document.addEventListener('visibilitychange', () => { pageVisible = document.visibilityState === 'visible'; });

    setupRunner();
    setupButtons();
    setupTable();
    setupKeys();
    setupMessages();
    if(ROLE === 'request') renderDemoCards();
    renderRules();
    renderTable();
    setClockTo(DAY_START, true);
    addLog('ℹ', ROLE === 'request' ? '「▶ はじめの状態で動かす」で おじいさんの一日を、「✨ できること」で チャッピーに できることを 見よう。' : '届いた依頼の一日を、チャッピーのプログラムで 動かしてみよう。');
    checkStatic();
    setInterval(drawSensors, 250);
    drawSensors();
    if(EMBED){ window.parent.postMessage({ type:'teamhome-ready', role:ROLE }, location.origin); }
    window.addEventListener('beforeunload', e => { if(dirty && ROLE === 'request'){ e.preventDefault(); e.returnValue = ''; } });
    requestAnimationFrame(frame);
  }

  // テスト用：いまの状態を読む（画面の動きには使わない）
  window.teamhomeState = () => ({
    role: ROLE, vmin: +vmin.toFixed(1), away: persona.away, pose: persona.pose, x: +persona.x.toFixed(2), z: +persona.z.toFixed(2),
    walk: +walkMul.toFixed(1), queue: persona.queue.length, locking: !!(persona.lockAnim && persona.pauseT > 0),
    room: L.roomAt(persona.x, persona.z), rot: +persona.rot.toFixed(2), pitch: +persona.pitch.toFixed(2), mode3p, temp: roomTemp(),
    caneRest: world.refs.restCane.bed.visible ? 'bed' : (world.refs.restCane.table.visible ? 'table' : null),
    intruder: intr.active, intrGroup: world.refs.intruder.group.position.toArray().map(v => +v.toFixed(2)),
    lights: Object.assign({}, lights), lock: lockOn(), door: +door.angle.toFixed(2),
    cam: camera && camera.position.toArray().map(v => +v.toFixed(2)), dirty, demo: demo ? demo.sc.title : null,
    rows: schedule.length, statics: statics.length, speech: robotState().speech, led: robotState().led, running, reacting: !!persona.reacting, sensors: sensorValues(), phone: phone.open ? phone.owner + ':' + phone.tab : null,
  });

  // テスト用：おじいさんの 顔の絵（えらんだ 目・口が 出ているか）
  window.teamhomeFaceImage = expr => { const im = world && world.refs.persona.face.image(expr || 'smile'); return im && im.toDataURL ? im.toDataURL() : null; };
  document.addEventListener('DOMContentLoaded', start);
})();
