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
    '全体': { x:-0.6, y:0.3, z:0.6, r:19.5, theta:0.72, phi:0.74 },
    '寝室トイレ': { x:-4.2, y:0.4, z:-2.2, r:10.5, theta:0.62, phi:0.8 },   // 夜中の トイレ（ベッドから トイレまで）
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
  let paused = null, lastRunMode = null, lastRunProg = null, outMute = false, lastPk = '';   // ⏸ 一時停止（つづきから 動かせる）
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
  const lights = { 寝室:false, 台所:false, 居間:false, 玄関:false, トイレ:false };
  // 足元ライト（チャッピーの プログラムで つける）と 夜中の トイレ（その あいだは 時計を 本当の 速さに する）
  let foot = false, trip = null;
  function setFoot(on){
    on = !!on; if(foot === on) return;
    foot = on;
    if(world && world.refs.setFoot) world.refs.setFoot(on);
    rec('foot', { on });
    if(running) pop(-4.2, 0.9, -1.5, on ? '🦶 足元ライトが ついた' : '🦶 足元ライトが 消えた');
    noteReaction('foot', '足元ライトを ' + (on ? 'つけた' : '消した'));
  }
  // おじいさんが 歩いている（寝室〜トイレ）：足元ライトの センサー
  const footWalk = () => !persona.away && persona.pose !== 'lie' && persona.pose !== 'sit' && ['寝室', 'トイレ'].includes(L.roomAt(persona.x, persona.z));
  // 時計の 速さ（夜中の トイレの あいだと、もどって 15秒は 1秒＝1秒。「10秒 待つ」が 本当の 10秒に 見える）
  function effRate(){
    if(trip && performance.now() > trip.slowUntil) trip = null;
    return trip ? 1 / 60 : rate;
  }
  function toiletTrip(){
    appearIfAway();
    finishPause(persona); persona.pose = 'stand';
    trip = { slowUntil:Infinity };
    rec('gp', { what:'toilet' });
    addLog('🚽', 'おじいさんが 夜中に トイレへ 行く（足元が まっくら）');
    const D = { x:-5.0, z:-1.75 };
    persona.queue = [{ x:-2.0, z:-1.75 }, { x:-4.6, z:-1.75 }, D, { x:-6.0, z:-2.6, pause:4, face:Math.PI,
      after:() => { addLog('🚽', 'トイレが すんだ。ベッドへ もどる'); persona.queue = [D, { x:-4.6, z:-1.75 }, { x:-2.0, z:-1.75 }, { x:L.BED.x + 0.85, z:L.BED.z }]; } }];
    persona.onDone = () => {
      if(persona.queue.length) return;
      lieDown(); if(trip) trip.slowUntil = performance.now() + 15000;
      addLog('🛏️', 'おじいさんが ベッドに もどった');
    };
  }
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
  function personaSpeed(){ return UX.dark ? 1.0 : 2.2; }   // くらい ときは ゆっくり（足元が 見えない）
  // 時計を 止める：おじいさん・知らない人が 動いている あいだ（予定の 時刻ぴったりに 動きが おわる。動きが まざらない）
  let holdT = 0;
  // チャッピーが しゃべって いる あいだも 時計を 止める（「しゃべる」を 2つ つづけても、2つめが 何十分も おくれない ように）。
  // ずっと しゃべりつづける プログラムでも 一日が 止まらない ように、止められるのは 家の 5分ごとに 1秒（たまるのは 6秒まで）
  let talkBudget = 6, talkRepeat = false, lastTalk = { text:'', at:-999 }, resumeAt = -1e9;
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
  let turbo = 1;                                      // チュートリアル（おまかせ）：歩く・立ちどまる 動きも 速く（時計は 歩きおわるまで 止まるため）
  function stepWalker(w, dt, speed){
    dt *= turbo;
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
        if(persona.pose === 'lie' && !persona.away){ onArrive(); break; }   // もう ねている（0時の「ねている」など）：起こさない
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
        if(roomOf(e) === 'トイレ'){                       // 夜中の トイレ：行って もどって ねる
          const late = ((nowMin() - e.m) % 1440 + 1440) % 1440;
          if(late < 30) toiletTrip();                       // 一日の はじめ（朝5時）に 2時の 予定を「いまから 行く」と しない（2回 数えない）
          break;
        }
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
    if(type === 'gp' && data && data.what === 'medicine'){                                          // 薬を 飲んだ（赤い 札を けす）
      UX.medTaken = vmin;
      const a = UX.alerts.med;                                     // 困りごとに なる 前に チャッピーの おかげで 飲めた → 安心（困りごとの あとなら「おかげで」の +10 が つく）
      if(!demo && running && !(a && a.trouble) && UX.helpBy.medicine != null && vmin - UX.helpBy.medicine < 30) meterNote('anshin', +10, '薬を 忘れずに 飲めた（チャッピーの おかげ）');
    }
    if((type === 'camera' || type === 'fan' || type === 'foot') && data && data.on){ UX.lastHelp = vmin;   // チャッピーが 何か した
      if(type === 'camera') UX.helpBy.intruder = vmin; if(type === 'foot') UX.helpBy.toilet = vmin; if(type === 'fan') UX.helpBy.heat = vmin; }
    if(demo && running){                               // 見本：「解決すると」の 説明を できごとに 合わせて 出す
      const d = data || {};
      demo.seen = demo.seen || {};
      demo.seen[type] = true;
      if(d.what) demo.seen[type + ':' + d.what] = true;
      if(d.to) demo.seen[type + ':' + d.to] = true;
      if(d.on !== undefined) demo.seen[type + ':' + (d.on ? 'on' : 'off')] = true;
    }
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
    if(k === 'foot_empty') return foot && !footWalk();
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
    { el.innerHTML = ''; el.style.display = 'none'; return; }   // 家の 上の ✔ の 小さな 表示は 出さない（依頼者と 同じ。開発者は ページの「家で 確かめる こと」で 見る）   // 依頼者：プログラムの よい・わるいは 家が 決めない（自分の 目で 見て レビューする）
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
      // ✔ に なっても「クリア」とは 言わない（開発者が「これで 完成」と 思いこまない。依頼者の レビューで 決まる）
      // 「困りごと はっけん！」も 出さない（何が 困りごとかは 生徒が 見て 考える・依頼者と 開発者で 同じ 見せ方）
    });
    const all = !!r.list.length && r.list.every(x => x.status === 'ok') && !(r.donts || []).some(x => x.status === 'ng');
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
    criteria = { list:(ok(cr) && Array.isArray(cr.list) ? cr.list : []).filter(ok).slice(0, 8),   // ② の 一日は 困りごとが いくつも（6つ）ある
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
  // 知らない人の メールを 見た おじいさんが 急いで 帰ってくる → 家の中の 知らない人は あわてて にげる
  let clockGen = 0;
  function rushHome(){
    if(!persona.away || persona.rushing) return;
    persona.rushing = true;
    const gen = clockGen;
    setTimeout(() => {
      persona.rushing = false;
      if(gen !== clockGen || !persona.away) return;            // 時計を 合わせなおした あとは しない
      placeWalker(persona, L.OUTSIDE); persona.away = false; persona.pose = 'stand'; persona.outing = false;
      rec('gp', { what:'home' });
      addLog('🏃', 'おじいさんが 急いで 帰ってきた');
      say('g', '「だれだ！ わしの 家で 何を して いる！」');
      if(intr.active && !intr.fleeing && !intr.turnAway && L.roomAt(intr.x, intr.z)) intruderLeave('おじいさんが 急いで 帰ってきて、知らない人は あわてて 出ていった');
      planEnter('玄関', null, null);
    }, 1800);
  }
  // カメラが ついていて、外の おじいさんが スマホの 映像で 知らない人を 見つけたら 急いで 帰ってくる
  function camWatch(){
    if(!running || persona.camSaw || !persona.away || !robotState().camera) return;
    if(!(intr.active && !intr.fleeing && !intr.turnAway && L.roomAt(intr.x, intr.z))) return;
    persona.camSaw = true;
    addLog('📷', 'おじいさんが スマホの 映像で 知らない人を 見つけた：「なんだって！ 急いで 帰ろう」');
    UX.helpBy.intruder = vmin;                          // チャッピーの カメラの おかげで 気づけた
    rushHome();
  }
  // ======================================================================
  // わかりやすさ：画面を 見るだけで「何が おきているか」「おじいさんは どんな 気持ちか」が わかる ように する
  //   ・おじいさんの 頭の 上に「いま している こと」の 札（😊 テレビを 見ている など）
  //   ・困りの 原因に 赤い 札（💡 だれも いないのに 電気が ついている など）。部屋の 床も 赤く 光る
  //   ・困りごとが おきたら 少し 止めて、カメラを よせる（1日に 1回ずつ）・一日の 帯に ⚠（おすと その 場面へ）
  //   ・気持ちメーター：へった・ふえた 理由を その場で 出す
  // ======================================================================
  // ---------- 気持ちメーター：4つとも 100 から はじまり、いやな ことが あると へる（よい・わるいは 決めない）----------
  const METERS = [['anshin', '😊', '安心'], ['shizuka', '🤫', '静か'], ['privacy', '🙈', 'プライバシー'], ['setsuden', '🌱', '節電']];
  const METER0 = 80;                                  // はじめの 気持ち（よい ことが あると 上がる ので 100 では ない）
  const meter = { anshin:METER0, shizuka:METER0, privacy:METER0, setsuden:METER0 };
  let mstat = { talk:0, night:0, rep:0, mail:0, trouble:0, help:0, drainMin:{} }, meterV = null, meterShown = '', annoySaid = 0, lastHeard = { t:'', at:-999 }, drains = {};
  function meterReset(){
    Object.assign(meter, { anshin:METER0, shizuka:METER0, privacy:METER0, setsuden:METER0 });
    mstat = { talk:0, night:0, rep:0, mail:0, trouble:0, help:0, drainMin:{} };
    meterV = null; annoySaid = 0; lastHeard = { t:'', at:-999 }; drains = {}; lossBy = {};
    const f = $('meterWhy'); if(f) f.innerHTML = '';
    meterShown = ''; drawMeters();
  }
  const mIcon = k => (METERS.find(x => x[0] === k) || [])[1] || '';
  // メーターが かわった 理由（メーターの 下に 小さく 出して、6秒で きえる）
  let lossBy = {}, traitsNow = '', likesNow = '', issuesNow = null;   // issuesNow：いま 家で おこす 困りごと（② の 一日・依頼した もの）。null ＝ 性格の カードで きめる   // likesNow：おじいさんの 好きな こと（AIとおはなしの『せいかく』と くらべる）
  const LOSS_MAX = 60;   // 同じ 理由で 1日に 下がるのは 60まで（話しかけすぎを つづけると 20まで 下がる）
  function meterNote(k, d, why, quote, issue){
    if(d < 0){
      const lk = k + '|' + why, used = lossBy[lk] || 0;
      if(used >= LOSS_MAX) return;                       // もう 1日の 上限まで 下がった（同じ ことで これ以上 下げない）
      d = -Math.min(-d, LOSS_MAX - used); lossBy[lk] = used - d;
    }
    const before = meter[k];
    meter[k] = Math.max(0, Math.min(150, meter[k] + d));   // 100を こえる ことも ある（とくべつに うれしい：金色で 見せる）。150まで
    const real = meter[k] - before;                      // 本当に かわった 分（100 や 0 で 止まった ときは 0）
    const f = $('meterWhy');
    if(f){
      const el = document.createElement('div'); el.className = 'mw' + (d > 0 ? ' up' : '');
      el.appendChild(document.createTextNode(mIcon(k) + ' ' + (d ? (d > 0 ? '＋' : '－') + Math.abs(Math.round(d)) + '　' : '↓ ') + why));
      f.prepend(el); while(f.children.length > 3) f.lastChild.remove();
      setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 600); }, quote ? 8000 : 6000);
    }
    meterFlash(k, real);
    if(real !== 0 && (Math.abs(real) >= 8 || issue)) addMark(k, real, issue || null, why);   // メーターが かわった ときだけ 帯に 印     // 小さな 変化は 印に しない
    if(EMBED) try{ window.parent.postMessage({ type:'teamhome-meter-why', k, d, why, quote:quote || '', t:vmin, time:clockText(vmin) }, location.origin); }catch(e){}
    drawMeters();
  }
  // かわった 行を 光らせて、数を とびださせる（へった＝赤・ふえた＝緑）。おじいさんの 顔も はねる
  function meterFlash(k, d){
    const box = $('meterHud'); if(!box || !d) return;
    const row = box.querySelector('[data-m="' + k + '"]'); if(!row) return;
    row.classList.remove('hit', 'gain'); void row.offsetWidth; row.classList.add(d < 0 ? 'hit' : 'gain');
    const n = document.createElement('span'); n.className = 'mdelta' + (d > 0 ? ' up' : ''); n.textContent = (d > 0 ? '+' : '−') + Math.abs(Math.round(d));
    row.appendChild(n); setTimeout(() => n.remove(), 1700);
    if(d < 0){ const fc = $('mhFace'); if(fc){ fc.classList.remove('pop'); void fc.offsetWidth; fc.classList.add('pop'); } }
  }
  const FEEL_WORD = { '😊':'ごきげん', '😴':'ねて いる', '😨':'こわい！', '🤔':'なにか へん…', '😟':'しんぱい', '😣':'いやだなあ', '😩':'もったいない…', '😮':'びっくり', '🙂':'ほっと した', '🥵':'あつい…', '😵':'ふらふら…', '🥺':'さみしい…', '😞':'元気が ない', '😄':'たのしい！', '🥰':'とても しあわせ！' };
  let mhShown = '';
  function drawFeel(){
    const f = feelFace(); if(f === mhShown) return; mhShown = f;
    const a = $('mhFace'), b = $('mhWord'); if(a) a.textContent = f; if(b) b.textContent = FEEL_WORD[f] || '';
  }
  // おじいさんの 反応（顔・ことば・ポップ）と、気持ちメーターを いっしょに（ことばが メーターの 理由に なる）
  function react(face, words, k, d, why, issue){
    UX.feel = face; UX.feelUntil = performance.now() + 6000;
    if(face === '😨' || face === '😟' || face === '😮') setExpr('worried');
    if(words) say('g', '「' + words + '」');
    if(k) meterNote(k, d, why, words ? '「' + words + '」' : '', issue);
  }
  // 気持ちメーターが 下がった：一日の 帯に 印（😊↓）を 残す。ページは「なぜ 下がった？」を 出す（依頼者）
  function addDrop(k, issue, why){ addMark(k, -1, issue, why); }
  function addMark(k, d, issue, why){
    if(!QMODE || demo || !running) return;
    const kind = d > 0 ? 'up' : 'drop';
    if(UX.marks.some(m => m.k === k && m.kind === kind && m.issue === issue && Math.abs(m.t - vmin) < (issue ? 120 : 60) && (issue || m.text === why))) return;   // 同じ 困りごとは 2時間に 1つ・同じ わけは 1時間に 1つ
    UX.marks.push({ t:vmin, kind, k, issue, text:why }); uxDrawMarks();
    if(kind === 'up') return;
    if(EMBED && issue) try{ window.parent.postMessage({ type:'teamhome-drop', t:vmin, time:clockText(vmin), k, issue, why }, location.origin); }catch(e){}
    if(issue && !UX.spot['drop:' + issue]){
      UX.spot['drop:' + issue] = true;
      const M = METERS.find(x => x[0] === k) || [];
      spotlight(persona.x, persona.z, persona.x, persona.z, 3200, M[1] + ' ' + M[2] + 'が 下がった！', 'なぜ だろう？ おじいさんの 様子を よく 見よう');
    }
  }
  function drawMeters(){
    const box = $('meterHud'); if(!box) return;
    drawFeel();
    const key = METERS.map(m => Math.round(meter[m[0]])).join(',');
    if(key === meterShown) return;
    meterShown = key;
    METERS.forEach(([k]) => {
      const row = box.querySelector('[data-m="' + k + '"]'); if(!row) return;
      const v = Math.round(meter[k]);
      row.querySelector('em').style.width = Math.min(100, v) + '%';
      const n = row.querySelector('small'); if(n) n.textContent = v > 100 ? v + '✨' : v;
      row.classList.toggle('low', v < 50);
      row.classList.toggle('over', v > 100);
    });
    if(EMBED) try{ window.parent.postMessage({ type:'teamhome-meters', live:true, meter:Object.assign({}, meter) }, location.origin); }catch(e){}
  }
  const isNight = () => { const h = (nowMin() % 1440) / 60; return h >= 22 || h < 6; };
  function annoyReact(){
    if(meter.shizuka <= 20 && annoySaid < 2){ annoySaid = 2; setExpr('worried'); say('g', '「もう やめてくれ…」'); pop(persona.x, 1.7, persona.z, '😣 うるさい！'); }
    else if(meter.shizuka <= 50 && annoySaid < 1){ annoySaid = 1; setExpr('worried'); say('g', '「うるさいなあ…」'); pop(persona.x, 1.7, persona.z, '😣'); }
    if(annoySaid){ UX.feel = '😣'; UX.feelUntil = performance.now() + 5000; }
  }
  // チャッピーの ことば・メールが どの 困りごとに 合って いるか（「おはよう」などは どれでも ない）
  const HELP_WORDS = [['medicine', /薬|くすり|クスリ/], ['light', /電気|でんき|明かり|あかり|消/], ['toilet', /足元|あしもと|トイレ|ころば|転ば|気をつけ/],
                      ['heat', /水(?!曜)|みず|水分|のみもの|飲み物|お茶|おちゃ|暑|熱中症|ねっちゅう|涼|すずし/],
                      ['intruder', /知らない人|だれか|誰か|だれですか|誰ですか|警察|けいさつ|どろぼう|泥棒|不審|ふしん|かぎ|鍵/]];
  function helpFor(text, t){ HELP_WORDS.forEach(([k, re]) => { if(re.test(String(text || ''))) UX.helpBy[k] = t == null ? vmin : t; }); }
  function meterSpeech(text){                         // チャッピーが しゃべった（家に いる おじいさんに 聞こえる）
    UX.lastHelp = vmin; helpFor(text);
    if(persona.away || /^🤖/.test(String(text))) return;
    mstat.talk++;
    const rep = text === lastHeard.t && vmin - lastHeard.at < 30; lastHeard = { t:text, at:vmin };
    if(rep) mstat.rep++;
    const herePlace = persona.away ? '' : L.roomAt(persona.x, persona.z);
    const relevantNow = k => k === 'light' ? L.ROOM_ORDER.some(r => lights[r] && r !== herePlace)
      : k === 'medicine' ? medTimes().some(t => { const occ = Math.floor((vmin - t) / 1440) * 1440 + t; return vmin - occ >= 0 && vmin - occ < 240 && UX.medTaken < occ; })
      : k === 'toilet' ? !!trip : k === 'intruder' ? !!intr.active : k === 'heat' ? roomTemp() >= 30 : false;
    if(!rep && persona.pose !== 'lie' && HELP_WORDS.some(([k, re]) => re.test(String(text || '')) && relevantNow(k))) return;   // 困って いる ことを 知らせて くれた（うるさくない）
    const lonely = /(^|,)lonely(,|$)/.test(traitsNow);
    if(lonely && !isNight() && !rep && persona.pose !== 'lie'){       // さみしがり：話しかけて もらえると うれしい（くり返しは やっぱり うるさい）
      meterNote('anshin', +2, '話しかけて もらえて うれしい（さみしがり）'); annoyReact(); return;
    }
    if(isNight()){
      mstat.night++;
      if(persona.pose === 'lie'){ meterNote('shizuka', -14, 'ねて いるのに 話しかけられた'); pop(persona.x, 1.4, persona.z, '😣 ねむれない'); }
      else meterNote('shizuka', -7, '夜に 話しかけられた');
    } else if(rep) meterNote('shizuka', -5, '同じ ことを 何回も 言われた');
    else meterNote('shizuka', -3, '話しかけられた');
    annoyReact();
  }
  // ---------- 🤖 AIとおはなし（会話）：さみしがりの おじいさんは うれしい。好きな ことが『せいかく』に 入って いれば もっと 楽しい ----------
  const patNow = () => vmin < UX.patUntil || performance.now() < UX.patUntilR;
  const LIKE_READ = { '将棋':'しょうぎ', '囲碁':'いご', '釣り':'つり', '写真':'しゃしん', '孫':'まご', '野球':'やきゅう', '相撲':'すもう', '散歩':'さんぽ', '料理':'りょうり',
    '園芸':'えんげい', '盆栽':'ぼんさい', '歌':'うた', '俳句':'はいく', '映画':'えいが', '読書':'どくしょ', '本':'ほん', '畑':'はたけ', '花':'はな', '犬':'いぬ', '猫':'ねこ', '旅行':'りょこう',
    '時代劇':'じだいげき', '演歌':'えんか', '落語':'らくご', '書道':'しょどう', '絵':'え', '庭':'にわ', '体操':'たいそう', '昔話':'むかしばなし', '新聞':'しんぶん', '大工':'だいく' };
  const kanaH = t => String(t || '').replace(/[\u30a1-\u30f6]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60)).replace(/[\s　]/g, '');
  function likesHit(prompt){                          // 好きな ことの ことばが『せいかく』に 入って いるか（ひらがな・カタカナは 同じ。よく ある 好きな ことは 読みでも）
    const P = kanaH(prompt); if(!P) return null;
    const words = String(likesNow || '').split(/[・、，,\/／\s　]+/).map(w => w.replace(/(が|を|すること|する こと|が 好き|が好き)$/, '').trim()).filter(Boolean);
    for(const w of words){
      const vs = [kanaH(w)];
      Object.keys(LIKE_READ).forEach(k => { if(w.includes(k)){ vs.push(kanaH(k), LIKE_READ[k]); } });
      if(vs.some(v => v && P.includes(v))) return w;
    }
    return null;
  }
  function aiPrompt(){                                // いまの プログラムの「AIとおはなし」の『せいかく』（いくつか あれば 好きな ことが 入って いる ものを）
    const out = [], walk = a => (a || []).forEach(x => { if(!x) return; if(x.type === 'ai') out.push(String(x.value || x.prompt || '')); walk(x.actions); walk(x.then); walk(x.else); walk(x.body); });
    const pg = lastRunProg || prog; if(pg){ walk(pg.actions); (pg.threads || []).forEach(t => walk(t.actions)); }
    return out.find(t => likesHit(t)) || out[0] || '';
  }
  function aiTalk(){
    if(demo) return;
    if(vmin - UX.lastAi < 5) return;                  // 同じ おはなしの つづき（ボタンを おした あいだに 何回も 動いても 1回）
    const since = vmin - UX.lastAi; UX.lastAi = vmin;
    const pr = aiPrompt();
    addLog('🤖', 'チャッピーが AIで おはなし' + (pr ? '（せいかく：' + pr.slice(0, 24) + '）' : ''));
    rec('speak', { text:'🤖 AIとおはなし' }); noteReaction('speech');
    if(persona.away){ addLog('🔇', 'おじいさんは 外に いるので、おはなし できない'); return; }
    if(persona.pose === 'lie'){ mstat.night++; meterNote('shizuka', -14, 'ねて いるのに 話しかけられた'); pop(persona.x, 1.4, persona.z, '😣 ねむれない'); return; }
    if(isNight()){ mstat.night++; meterNote('shizuka', -7, '夜に 話しかけられた'); return; }
    mstat.talk++;
    if(since < 60){ mstat.rep++; UX.alone = 0; UX.patCycle = false; UX.helpBy.lonely = vmin;   // 話は して いる（さみしくは ない）が、話しかけすぎ
      meterNote('shizuka', -5, 'さっき 話したのに、また 話しかけられた'); say('g', '「さっき 話した ばかりじゃよ」'); return; }
    if(!/(^|,)lonely(,|$)/.test(traitsNow)){ meterNote('shizuka', -3, '話しかけられた'); say('g', '「おお、なんじゃ？」'); return; }
    const hit = likesHit(pr), a = UX.alerts.lonely, inTrouble = !!(a && a.trouble);
    UX.alone = 0; UX.patCycle = false; UX.helpBy.lonely = vmin;
    const words = hit ? 'おお、' + hit + 'の 話か！ それがのう…（楽しそうに 話して いる）' : 'おお、話し相手に なって くれるのか。うれしいのう';
    const why = hit ? '好きな「' + hit + '」の 話が できて 楽しかった' : 'おしゃべり できて うれしい';
    if(inTrouble){                                    // 困りごとの とちゅう：解決の ＋10 は 困りごとが おわった ときに（好きな 話なら ＋5 おまけ）
      if(hit) react('😄', words, 'anshin', +5, why, 'lonely'); else { say('g', '「' + words + '」'); pop(persona.x, 2.3, persona.z, '🙂 うれしい'); }
    } else react(hit ? '😄' : '🙂', words, 'anshin', hit ? +10 : +5, why, 'lonely');
  }
  function meterMail(to, text){
    UX.lastHelp = vmin; helpFor(text);
    if(to !== 'grandpa') return;
    mstat.mail++;
    if(mstat.mail > 3) meterNote('shizuka', -8, 'メールが 多すぎる'); else meterNote('shizuka', -2, 'メールが とどいた');
    if(persona.away && mstat.mail <= 3 && HELP_WORDS.some(([, re]) => re.test(String(text || '')))) meterNote('anshin', +4, '外に いても 家の ようすが わかって 安心');   // 家の ようすや 困りごとを 知らせる メールだけ（多すぎると うるさい）
    annoyReact();
  }
  // ずっと つづく もの（電気・カメラ など）：はじまった ときに 理由を 出し、つづく あいだ 少しずつ へる
  function drainOn(key, k, why, on){                 // 5分 以上 つづいたら「へって いく」と 出す（すぐ 消えた ものは ほとんど 使って いない）
    if(!on){ if(drains[key]) drains[key] = false; return; }
    if(!drains[key]) drains[key] = { s:vmin, noted:false };
    if(!drains[key].noted && vmin - drains[key].s >= 5){ drains[key].noted = true; meterNote(k, 0, why + '（へって いく）'); }
  }
  function meterTick(){
    if(meterV == null){ meterV = vmin; return; }
    const dm = vmin - meterV; meterV = vmin;
    if(!(dm > 0) || dm > 120) return;
    const st = robotState(), home = !persona.away, here = home ? L.roomAt(persona.x, persona.z) : '';
    const camHome = !!st.camera && home;
    drainOn('cam', 'privacy', '家に いるのに カメラで 見られて いる', camHome);
    if(camHome) meter.privacy = Math.max(0, meter.privacy - dm * 0.2);   // 少しの 間なら がまん できる・一日中は いや
    const camAway = !!st.camera && !home;                // 留守の 間の カメラ：家の ようすが わかって 安心（家に いる ときは プライバシーが 下がる）
    if(camAway && !drains.camAway){ drains.camAway = true; meterNote('anshin', 0, '留守の 間も カメラで 家を 見守って くれて 安心（上がって いく）'); }
    else if(!camAway) drains.camAway = false;
    if(camAway && meter.anshin < 100) meter.anshin = Math.min(100, meter.anshin + dm * 0.1);   // 見守りで 上がるのは 100まで
    const empty = L.ROOM_ORDER.filter(r => lights[r] && here !== r);
    L.ROOM_ORDER.forEach(r => drainOn('lit:' + r, 'setsuden', 'だれも いない ' + r + 'の 電気が ついている', empty.includes(r)));
    drainOn('foot', 'setsuden', '足元ライトが ついている', foot);
    drainOn('fan', 'setsuden', 'ファンが まわって いる', !!st.fan);
    drainOn('led', 'setsuden', 'LEDが ついている', !!st.led);
    meter.setsuden = Math.max(0, meter.setsuden - dm * (empty.length * 0.12 + (foot ? 0.1 : 0) + (st.fan ? 0.1 : 0) + (st.camera ? 0.05 : 0) + (st.led ? 0.05 : 0)));
    Object.keys(drains).forEach(k => { if(drains[k]) mstat.drainMin[k] = (mstat.drainMin[k] || 0) + dm; });
    // 下がった 気持ちは 時間が たっても もどらない（何が あったか、一日の 終わりまで 数に のこる）
    if(meter.shizuka > 65) annoySaid = 0;
    meterShown = ''; drawMeters();
  }
  function meterSummary(){                            // 一日の ふり返り（数と 理由だけ。よい・わるいは 書かない）
    const R = k => Math.round(meter[k]), dmin = k => Math.round(mstat.drainMin[k] || 0);
    const lit = L.ROOM_ORDER.filter(r => dmin('lit:' + r)).map(r => r + ' ' + dmin('lit:' + r) + '分');
    const sv = [lit.length ? 'だれも いない 部屋の 電気：' + lit.join('・') : '', dmin('foot') ? '足元ライト ' + dmin('foot') + '分' : '', dmin('fan') ? 'ファン ' + dmin('fan') + '分' : ''].filter(Boolean);
    return '😊 安心 ' + R('anshin') + '（困りごと ' + mstat.trouble + '回' + (mstat.help ? '・チャッピーが 助けた ' + mstat.help + '回' : '') + '）' +
      '　🤫 静か ' + R('shizuka') + '（話しかけ ' + mstat.talk + '回' + (mstat.night ? '・夜 ' + mstat.night + '回' : '') + (mstat.rep ? '・同じ ことば ' + mstat.rep + '回' : '') + (mstat.mail ? '・メール ' + mstat.mail + '通' : '') + '）' +
      '　🙈 プライバシー ' + R('privacy') + (dmin('cam') ? '（家で カメラ ' + dmin('cam') + '分）' : '') +
      '　🌱 節電 ' + R('setsuden') + (sv.length ? '（' + sv.join('・') + '）' : '');
  }

  // ---------- おじいさんの「いま」の 札・困りの 赤い 札・困る 場面で 止まる・一日の 帯 ----------
  const QMODE = true;                                // 依頼者・開発者 どちらも 同じ 見せ方（答えの 札は 出さない・帯は 気持ちメーターの 印）                   // 依頼者：困りの 札は ❓ だけ（何が 困ったかは 生徒が 考える）
  const UX = { helpBy:{}, alerts:{}, spot:{}, marks:[], tlStart:DAY_START, medTaken:-99999, lastHelp:-99999, dark:false, said:{}, jumping:false, away:{}, wasAway:false, feel:'', feelUntil:0,
               alone:0, aloneV:null, nextPat:-1e9, patUntil:-1e9, patUntilR:0, lastAi:-1e9, patAt:-1e9, patCycle:false };   // alone：だれとも 話して いない 分（さみしがり）・pat：おじいさんが ボタンを おした
  const TROUBLE_ISSUE = { light:'light', door:'intruder', intr:'intruder', med:'medicine', dark:'toilet', heat:'heat', lonely:'lonely' };
  const jtime = m => { m = ((Math.round(m) % 1440) + 1440) % 1440; const h = Math.floor(m / 60), mm = m % 60; return h + '時' + (mm ? mm + '分' : ''); };
  function uxReset(){
    Object.keys(UX.alerts).forEach(k => uxOff(k, true));
    UX.alerts = {}; UX.spot = {}; UX.medTaken = -99999; UX.lastHelp = -99999; UX.helpBy = {}; UX.dark = false; UX.said = {}; UX.away = {}; UX.wasAway = false; UX.feel = ''; UX.feelUntil = 0;
    UX.alone = 0; UX.aloneV = null; UX.nextPat = -1e9; UX.patUntil = -1e9; UX.patUntilR = 0; UX.lastAi = -1e9; UX.patAt = -1e9; UX.patCycle = false;
    if(!UX.jumping){ UX.marks = []; UX.tlStart = nowMin(); }
    uxDrawMarks();
  }
  // 薬の 時刻（合格条件の「○時に なったら 薬を 飲む」から）
  const medTimes = () => ((criteria && criteria.list) || []).filter(c => c.trig === 'time' && c.res === 'medicine').map(c => TeamCheck.toMin(c.from)).filter(m => m != null);
  // 困りの ようすを 毎フレーム しらべる。きまった 時間 つづいたら「困りごと」（赤い 札・メーター・帯・見どころ）
  function uxTick(){
    if(!running) return;
    const list = [], home = !persona.away, here = home ? L.roomAt(persona.x, persona.z) : '';
    L.ROOM_ORDER.forEach(r => {
      if(!lights[r] || here === r) return;
      const R = L.ROOMS[r];
      list.push({ key:'light:' + r, kind:'light', room:r, after:0.5, x:(R.x0 + R.x1) / 2, y:1.7, z:(R.z0 + R.z1) / 2,
                  text:'💡 だれも いないのに 電気が ついている', say:r + 'の 電気が つけっぱなし', done:r + 'の 電気が 消えた' });
    });
    // かぎを かけない ことは 困りごとに しない（留守中に 知らない人が 入った ときだけ）
    if(intr.active && !intr.turnAway && !intr.fleeing && L.roomAt(intr.x, intr.z)) list.push({ key:'intr', kind:'intr', after:0, follow:'intr',
      text:'🚨 知らない人が 家の 中に いる！', say:'留守の 家に、知らない人が 入って きた', done:'知らない人が いなくなった' });
    if(UX.wasAway && home && !demo) arriveReact();
    UX.wasAway = !!persona.away;
    medTimes().forEach(t => {
      const occ = Math.floor((vmin - t) / 1440) * 1440 + t;
      if(home && !demo && vmin - occ >= 30 && vmin - occ < 90 && UX.medTaken < occ && !UX.said['med2' + occ] && persona.pose !== 'lie' && performance.now() >= UX.feelUntil){   // 朝の うちに 気づく（夕方には 言わない）   // ほかの 反応と かさならない ように
        UX.said['med2' + occ] = 1;
        react('😟', 'あっ！ 薬を 飲んで いなかった…', 'anshin', -10, '薬を 飲み忘れて いたと、あとで 気づいた', 'medicine');
      }
      if(vmin - occ >= 1 && vmin - occ < 240 && UX.medTaken < occ) list.push({ key:'med', kind:'med', after:0, follow:'persona', occ,
        text:'💊 薬を 飲んで いない', say:jtime(t) + 'は 薬の 時間。でも、薬を 飲み忘れて いる', done:'薬を 飲んだ' });
    });
    UX.dark = !!trip && home && persona.pose === 'stand' && !foot && !lights[here];
    if(!!trip && home && persona.pose === 'stand' && (foot || lights[here]) && !UX.alerts.dark && !UX.said.footok && !demo){   // 明るい 中を 歩けた
      UX.said.footok = 1; meterNote('anshin', +5, '足元が 明るくて 安心して 歩けた');
    }
    if(UX.dark) list.push({ key:'dark', kind:'dark', after:0, afterMs:1200, follow:'persona',   // 3秒くらい 暗い まま 歩いたら 困りごと（すぐ 明るく なれば だいじょうぶ）
      text:'⚠ くらくて 足元が 見えない！', say:'夜中、まっくらな 中を トイレへ 歩いて いる', done:'足元が 明るく なった' });
    // 熱中症（💪 我慢づよい）：30℃ 以上なのに、水も 飲まず 涼しくも しない まま 家で 過ごす
    //   解決：水を 飲む（90分 もつ）／ 居間で チャッピーの ファンの 風に あたる
    const hotOn = issuesNow ? issuesNow.includes('heat') : (/(^|,)patient(,|$)/.test(traitsNow) || ((criteria && criteria.list) || []).some(c => c.trig === 'hot'));   // 選んだ 困りごとに ある ときだけ
    if(hotOn && home && persona.pose !== 'lie' && !demo){
      const tNow = roomTemp(), cool = !!robotState().fan && here === '居間', drank = recent('water', 90);
      if(tNow >= 30 && cool) UX.helpBy.heat = vmin;                    // ファンの 風で 涼しい（つけっぱなしでも チャッピーの おかげ）
      if(tNow >= 30 && !cool && !drank) list.push({ key:'heat', kind:'heat', after:30, follow:'persona',
        text:'🥵 暑いのに 我慢して いる', say:'暑いのに、水も 飲まず 涼しくも しないで 我慢して いる', done:'体が 楽に なった' });
      else if(tNow >= 30 && !UX.alerts.heat && !UX.said.heatok && UX.helpBy.heat != null && vmin - UX.helpBy.heat < 90){
        UX.said.heatok = 1; meterNote('anshin', +5, '暑い 日も 楽に すごせた（チャッピーの おかげ）', '', 'heat');   // 困りごとに なる 前に 助けて もらえた
      }
      const ha = UX.alerts.heat;
      if(ha && ha.trouble && vmin - ha.since >= 100 && !UX.said.heat2 && performance.now() >= UX.feelUntil){
        UX.said.heat2 = 1; react('😵', 'ふう… 頭が ぼーっと する…', 'anshin', -10, '暑い まま 我慢して、ふらふらに なった', 'heat');
      }
    }
    // さみしがり（🥺）：昼（8〜20時）に 家で 起きて いる あいだ、AIで おはなし しない 時間を 数える
    //   2時間 → チャッピーの ボタンを おしに 行く（話したい 合図）／ 2時間半 → 困りごと ／ AIとおはなし で 0に もどる
    if((issuesNow ? issuesNow.includes('lonely') : /(^|,)lonely(,|$)/.test(traitsNow)) && !demo){
      const dA = UX.aloneV == null ? 0 : Math.max(0, Math.min(30, vmin - UX.aloneV)); UX.aloneV = vmin;
      const dayM = ((vmin % 1440) + 1440) % 1440, dayTime = dayM >= 480 && dayM < 1200;
      if(!home){ UX.alone = 0; UX.patCycle = false; }               // 出かけて いる ＝ 外で 人と 会って いる（帰ったら 数えなおし）
      else if(persona.pose !== 'lie' && dayTime) UX.alone += dA;
      const free = home && !persona.queue.length && !persona.reacting && !persona.hearCur && persona.pose !== 'eat' && persona.pose !== 'lie';
      if(UX.alone >= 120 && dayTime && free && vmin >= UX.nextPat){
        UX.nextPat = vmin + 60;
        const pat = () => { UX.patUntil = vmin + 1.5; UX.patUntilR = performance.now() + 250; if(!UX.patCycle) UX.patAt = vmin; UX.patCycle = true;   // さいしょに おした 時刻から 30分（解決するまで 困りごとは 1回） pop(L.CHAPPY_AT.x, 1.3, L.CHAPPY_AT.z, '👆 ポン');   // おした 合図は 短く（1回 おした ＝ 1回 反応）
                            addLog('👆', 'おじいさんが チャッピーの ボタンを おした（だれかと 話したい）'); rec('gp', { what:'pat' }); };
        say('g', '「だれか 話し相手が ほしいのう…」');
        if(here === '居間') pat(); else planEnter('居間', null, pat);
      }
      if(UX.alone >= 150 && UX.patCycle && vmin - UX.patAt >= 30) list.push({ key:'lonely', kind:'lonely', after:0, follow:'persona',   // ボタンを おしたのに 30分 だれも 話して くれない
        text:'🥺 だれとも 話して いない', say:'長い 間 だれとも 話して いなくて、さみしい', done:'さみしく なくなった' });
      const la = UX.alerts.lonely;
      if(la && la.trouble && vmin - la.since >= 120 && !UX.said.lonely2 && performance.now() >= UX.feelUntil){
        UX.said.lonely2 = 1; react('😞', 'ずっと 一人で、なんだか 元気が 出んのう…', 'anshin', -10, 'ずっと 一人で、元気が なくなった', 'lonely');
      }
    }
    const keys = new Set(list.map(x => x.key));
    Object.keys(UX.alerts).forEach(k => { if(!keys.has(k)) uxOff(k); });
    list.forEach(uxOn);
  }
  // 外から 帰って きた：留守の 間の ことに 気づく
  function arriveReact(){
    const A = UX.away; UX.away = {};
    if(A.intr && (intr.active || persona.rushing)){
      react('😨', 'だれだ！ わしの 家で 何を して いる！', 'anshin', -15, '帰ったら、家に 知らない人が いて こわかった', 'intruder');
    } else if(A.intr){
      if(A.helped) react('🙂', 'だれか 来て いたのか… チャッピーが 追いはらって くれた。たのもしいなあ', 'anshin', +5, '留守の 間も チャッピーが 家を 守って くれた');   // 守って もらえた ＝ 安心は 上がる
      else react('😨', 'ん？ 物が 動いてる… だれか 入ったのか！？', 'anshin', -25, '留守の 間に、知らない人が 家に 入って いた', 'intruder');
    } else if(A.door) react('😟', 'あっ、かぎを かけ忘れて 出かけて いた！', 'anshin', -8, 'かぎを かけずに 出かけて いたと 気づいた');
  }
  function uxOn(x){
    let a = UX.alerts[x.key];
    if(!a) a = UX.alerts[x.key] = { since:vmin, sinceR:performance.now(), trouble:false, el:null };
    a.x = x;
    if(a.trouble || vmin - a.since < x.after || (x.afterMs && performance.now() - a.sinceR < x.afterMs)) return;
    a.trouble = true;
    if(!QMODE){ a.el = document.createElement('div'); a.el.className = 'alert'; stageEl.appendChild(a.el); }
    if(x.room && world.refs.setRoomAlert) world.refs.setRoomAlert[x.room](true);
    const feel = !demo;                                // 見本では メーターは うごかさない（台本で 見せる）
    if(x.kind === 'med' && !UX.said['med' + x.occ]){ UX.said['med' + x.occ] = 1;
      if(feel) react('🤔', 'あれ？ 何か 忘れて いる ような…', 'anshin', -5, '何か 忘れて いる 気が して、落ち着かない', 'medicine');
      else { setExpr('worried'); say('g', '「あれ？ 何か 忘れて いる ような…」'); } }
    if(x.kind === 'lonely' && !UX.said.lonely){ UX.said.lonely = 1;
      if(feel) react('🥺', 'だれも 話して くれんのう… さみしいなあ', 'anshin', -10, '長い 間 だれとも 話して いなくて さみしい', 'lonely');
      else say('g', '「だれも 話して くれんのう…」'); }
    if(x.kind === 'heat' && !UX.said.heat){ UX.said.heat = 1; UX.said.heatok = 1;   // 困りごとに なった 日は「前に 助けて もらえた」の ＋5 は 出さない
      if(feel) react('🥵', 'あつい… でも まだ がまん できる', 'anshin', -10, '暑いのに 我慢して、体が つらい', 'heat');
      else say('g', '「あつい… でも がまん がまん」'); }
    if(x.kind === 'dark' && !UX.said.dark){ UX.said.dark = 1;
      if(feel) react('😨', 'くらくて 足元が 見えない… こわいなあ', 'anshin', -15, 'まっくらで、ころびそうに なった', 'toilet');
      else say('g', '「くらくて 足元が 見えない…」'); }
    if((x.kind === 'door' || x.kind === 'intr') && persona.away) UX.away[x.kind] = true;   // 外に いるので まだ 気づかない（帰ってから 気づく）
    if(demo) return;                                   // 見本では 帯・メーター・見どころは なし（台本で 見せる）
    mstat.trouble++;
    if((x.kind === 'door' || x.kind === 'intr') && !persona.away) meterNote('anshin', -15, x.say);
    if(QMODE){ if(x.kind === 'light') meterNote('setsuden', -5, 'だれも いない ' + x.room + 'の 電気が ついて いる', '', 'light'); }   // その 時点で 節電を 下げてから 印
    else { if(!UX.marks.some(m => m.kind === x.kind && Math.abs(m.t - vmin) < 6)){ UX.marks.push({ t:vmin, kind:x.kind, text:x.say }); uxDrawMarks(); } uxSpot(x); }
    if(EMBED) try{ window.parent.postMessage({ type:'teamhome-trouble', kind:x.kind, issue:TROUBLE_ISSUE[x.kind], text:x.say, t:vmin, time:clockText(vmin) }, location.origin); }catch(e){}
  }
  function uxOff(k, quiet){
    const a = UX.alerts[k]; if(!a) return;
    delete UX.alerts[k];
    if(a.el) a.el.remove();
    const x = a.x || {};
    if(x.room && world.refs.setRoomAlert) world.refs.setRoomAlert[x.room](false);
    if(quiet || !a.trouble || demo || (!running && !paused)) return;   // 見どころで 止まった 同じ しゅんかんに 解決した ときも 数える
    if(x.kind === 'dark' && !foot) return;             // ベッドに もどった だけ（明るく なったのでは ない）
    const helped = vmin - (UX.helpBy[TROUBLE_ISSUE[x.kind]] == null ? -99999 : UX.helpBy[TROUBLE_ISSUE[x.kind]]) < 30;   // その 困りごとに 合った 動きを した ときだけ「チャッピーの おかげ」
    if(x.kind === 'light' && !helped && !persona.away && lights[x.room] && L.roomAt(persona.x, persona.z) === x.room && vmin - a.since >= 30){
      react('😩', 'あれ、電気が つけっぱなし だった… もったいない', 'anshin', -3, x.room + 'の 電気を つけっぱなしに して いたと 気づいた', 'light');
      return;
    }
    const p = uxPos(x); pop(p.x, p.y, p.z, '✔ ' + x.done);
    if(x.kind === 'intr' && persona.away) UX.away.helped = helped;
    if(helped){ mstat.help++; meterNote('anshin', +10, 'チャッピーの おかげで ' + x.done); }
    // 家で 困りごとが 解決した（アニメーションで 見えた とおり）。helped ＝ チャッピーの 動きで
    if(EMBED) try{ window.parent.postMessage({ type:'teamhome-solved', kind:x.kind, issue:TROUBLE_ISSUE[x.kind], helped, t:vmin, time:clockText(vmin) }, location.origin); }catch(e){}
  }
  function uxSpot(x){
    if(UX.spot[x.kind]) return;
    UX.spot[x.kind] = true;
    const p = uxPos(x);
    if(QMODE) spotlight(p.x, p.z, p.x, p.z, 3200, '❓ 何か 困って いる みたい', 'おじいさんの 様子と 気持ちメーターを よく 見よう');
    else spotlight(p.x, p.z, p.x, p.z, 3200, '⚠ 困りごと', x.say);
  }
  function uxPos(x){
    if(x.follow === 'intr') return { x:intr.x, y:2.25, z:intr.z };
    if(x.follow === 'persona') return { x:persona.x, y:persona.pose === 'lie' ? 1.4 : 2.7, z:persona.z };
    return { x:x.x, y:x.y || 1.7, z:x.z };
  }
  // おじいさんの きもちの 顔
  function feelFace(){
    if(UX.feel && performance.now() < UX.feelUntil) return UX.feel;
    if(persona.pose === 'lie') return '😴';
    if(UX.dark) return '😨';
    if(UX.alerts.med && UX.alerts.med.trouble) return '🤔';
    if(meter.shizuka <= 50 || meter.privacy <= 50) return '😣';
    if(meter.anshin <= 60) return '😟';
    if(meter.anshin > 100) return '🥰';                  // 100を こえて うれしい
    return '😊';
  }
  // おじいさんが いま している こと（短い ことば）
  function statusText(){
    const f = feelFace();
    if(persona.pose === 'lie') return f + ' ねて いる';
    if(persona.pose === 'sit') return f + ' ' + (nowMin() >= 1080 || nowMin() < 300 ? 'テレビを 見て いる' : 'ソファで ひとやすみ');
    if(persona.pose === 'eat') return f + ' ごはんを 食べて いる';
    if(trip) return f + ' トイレへ 歩いて いる';
    if(persona.queue.length){
      const q = persona.queue[persona.queue.length - 1], d = L.roomAt(q.x, q.z);
      return f + ' ' + (d ? d + 'へ 歩いて いる' : '出かける ところ');
    }
    const r = L.roomAt(persona.x, persona.z);
    return f + (r ? ' ' + r + 'に いる' : '');
  }
  // 札・赤い 札を 画面の 上の 場所に おく（毎フレーム）
  function uxPlace(){
    const tg = $('tagG');
    if(tg){
      if(mode3p) tg.style.display = 'none';
      else if(persona.away) placeBubble(tg, L.OUTSIDE.x, 1.3, L.OUTSIDE.z - 0.5, '🚶 おでかけ中（家に いない）');
      else placeBubble(tg, persona.x, persona.pose === 'lie' ? 1.45 : persona.pose === 'stand' ? 2.3 : 1.85, persona.z, statusText());
      const bg = $('bubbleG');                           // おじいさんの ことばが 出て いる ときは、状態の 札は かくす（ことばを 見て ほしい）
      if(tg.style.display === 'block' && bg && bg.style.display === 'block' && !persona.away) tg.style.display = 'none';
    }
    const bgv = $('bubbleG'), top = tg && tg.style.display === 'block' ? tg : (bgv && bgv.style.display === 'block' ? bgv : null);
    const ti = $('tagI');
    if(ti){ if(intr.active && !UX.alerts.intr) placeBubble(ti, intr.x, 2.2, intr.z, '🕵 知らない人'); else ti.style.display = 'none'; }
    Object.keys(UX.alerts).forEach(k => {
      const a = UX.alerts[k]; if(!a.el) return;
      const p = uxPos(a.x); placeBubble(a.el, p.x, p.y, p.z, QMODE ? '❓' : a.x.text);
      if(a.x.follow === 'persona' && top && !persona.away){ a.el.style.left = top.style.left; a.el.style.top = (parseFloat(top.style.top) - top.offsetHeight - 12) + 'px'; }   // おじいさんの 札（ことば）の 上
    });
    if(world.refs.alertMat) world.refs.alertMat.opacity = 0.42 + 0.33 * Math.sin(performance.now() / 260);
    const n = $('tlNow'); if(n) n.style.left = tlPos(vmin) + '%';
  }
  // 一日の 帯（下）：時刻・予定の 絵・困りごとの ⚠（おすと その 場面へ）
  const TL_ICON = { wake:'🌅', sleep:'🛏️', eat:'🍚', sit:'🛋️', out:'🚶', home:'🏠', go:'🚪' };
  const tlPos = t => ((((t - UX.tlStart) % 1440) + 1440) % 1440) / 1440 * 100;
  function uxDrawMarks(){
    const bar = $('tlBar'); if(!bar) return;
    const key = document.querySelector('.tl-key'); if(key) key.textContent = QMODE ? '😊↓ 下がった・😊↑ 上がった（おすと その 場面へ）' : '⚠＝困りごと（おすと その 場面へ）・帯を おすと その 時間へ';
    let h = '';
    for(let i = 0; i < 8; i++){ const m = (UX.tlStart + i * 180) % 1440; h += '<span class="tl-h" style="left:' + (i * 12.5) + '%">' + Math.floor(m / 60) + '時</span>'; }
    (entriesNow() || []).forEach(e => {
      if(e.text === 'ねている') return;
      h += '<span class="tl-ev" style="left:' + tlPos(e.m) + '%" title="' + esc(clockText(e.m) + ' ' + P.describe(e)) + '">' + (e.room === 'トイレ' ? '🚽' : TL_ICON[e.act] || '•') + '</span>';
    });
    const used = [];
    UX.marks.forEach((k, i) => {
      const M = METERS.find(x => x[0] === k.k) || [];
      let left = tlPos(k.t); while(used.some(u => Math.abs(u - left) < 3.2)) left += 3.4;   // 近い 印は ずらして ならべる
      used.push(left);
      const mk = k.kind === 'drop' || k.kind === 'up';
      h += '<button type="button" class="tl-mk' + (mk ? ' drop' : '') + (k.kind === 'up' ? ' up' : '') + '" data-i="' + i + '" style="left:' + left + '%" title="' + esc(clockText(k.t) + ' ' + (mk ? M[2] + (k.kind === 'up' ? 'が 上がった：' : 'が 下がった：') + k.text : k.text)) + '（おすと その 場面へ）">' + (mk ? M[1] + (k.kind === 'up' ? '↑' : '↓') : '⚠') + '</button>';
    });
    bar.innerHTML = h + '<i class="tl-now" id="tlNow"></i>';
  }
  // ---------- 控え：一日を 動かして いる あいだ 2分ごとに、気持ちメーターと 反応の 記録を とっておく ----------
  //   タイムラインで もどった ときは、その 時刻の 控えから つづける（メーターが はじめに もどったり、さっき おきた 反応が おきなく なったり しない）
  let snaps = [];
  const cpy = o => JSON.parse(JSON.stringify(o || {}));
  function snapTake(){
    if(!running || demo || UX.jumping) return;
    const key = Math.floor(vmin / 2), last = snaps[snaps.length - 1];
    if(last && (last.key === key || vmin < last.t)) return;
    snaps.push({ key, t:vmin, meter:Object.assign({}, meter), mstat:cpy(mstat), lossBy:Object.assign({}, lossBy), drains:cpy(drains), annoySaid, lastHeard:Object.assign({}, lastHeard),
                 ux:{ alone:UX.alone, nextPat:UX.nextPat, patAt:UX.patAt, patCycle:UX.patCycle, lastAi:UX.lastAi, said:Object.assign({}, UX.said), helpBy:Object.assign({}, UX.helpBy),
                      medTaken:UX.medTaken, lastHelp:UX.lastHelp, away:Object.assign({}, UX.away), wasAway:UX.wasAway,
                      alerts:Object.keys(UX.alerts).reduce((o, k) => { const a = UX.alerts[k]; o[k] = { since:a.since, trouble:!!a.trouble }; return o; }, {}) },   // 困りごとが はじまった 時刻も
                 did:Object.assign({}, persona.did), lastTalk:Object.assign({}, lastTalk) });
    if(snaps.length > 1200) snaps.shift();
  }
  function snapRestore(m){
    snaps = snaps.filter(x => x.t <= m + 0.01);
    const sp = snaps[snaps.length - 1]; if(!sp) return false;
    Object.assign(meter, sp.meter); mstat = cpy(sp.mstat); lossBy = Object.assign({}, sp.lossBy); drains = cpy(sp.drains);
    annoySaid = sp.annoySaid; lastHeard = Object.assign({}, sp.lastHeard);
    Object.assign(UX, { alone:sp.ux.alone, aloneV:null, nextPat:sp.ux.nextPat, patAt:sp.ux.patAt, patCycle:sp.ux.patCycle, lastAi:sp.ux.lastAi,
                        said:Object.assign({}, sp.ux.said), helpBy:Object.assign({}, sp.ux.helpBy), medTaken:sp.ux.medTaken, lastHelp:sp.ux.lastHelp });
    persona.did = Object.assign({}, sp.did);
    UX.away = Object.assign({}, sp.ux.away || {}); UX.wasAway = !!sp.ux.wasAway;
    UX.alerts = {}; Object.keys(sp.ux.alerts || {}).forEach(k => { const a = sp.ux.alerts[k]; UX.alerts[k] = { since:a.since, sinceR:performance.now() - 1e6, trouble:a.trouble, el:null }; });   // おきて いた 困りごとは つづきから（2回 数えない）
    lastTalk = Object.assign({ text:'', at:-999 }, sp.lastTalk || {}); resumeAt = -1e9;   // チャッピーが さいごに しゃべった 時刻も その 時の もの（先の 時刻が のこって いると、しゃべっても 数えない）
    meterV = null; meterShown = ''; drawMeters();
    return true;
  }
  // その 時刻の 少し 前から 見なおす（さっきと 同じ 動かし方で）
  function uxJump(t){
    const ds = dayStart, mode = lastRunMode === 'program' && progHas() ? 'program' : 'plain';
    let m = ((Math.round(t) - 4) % 1440 + 1440) % 1440;
    if(m < ds) m += 1440;                                // 一日の はじまりより 前の 時刻（夜中）は 翌日の ぶん
    UX.jumping = true; setClockTo(m); UX.jumping = false;
    dayStart = ds;                                       // 一日の はじまりは もとの まま（もどった 時刻から 24時間 動かない。いつもの 一日の おわりで 止まる）
    snapRestore(m);                                      // その 時刻の 気持ち・記録から つづける
    if(EMBED) try{ window.parent.postMessage({ type:'teamhome-jumped', t:m, time:clockText(m) }, location.origin); }catch(e){}
    rate = 10; $('rate').value = '10'; updRate();
    if(mode === 'program'){ if(ROLE === 'request') replay(prog); else run(); } else plainDay();
  }
  // 速さ（🐢 ゆっくり ／ 🚶 ふつう ／ 🐇 はやい）
  function updRate(){ const b = $('miniRate'); if(b) b.textContent = rate <= 1 ? '🐢 ゆっくり' : rate <= 10 ? '🚶 ふつう' : '🐇 はやい'; }
  function intruderOnReturn(){
    if(intr.active && !intr.fleeing && !intr.turnAway && L.roomAt(intr.x, intr.z)) intruderLeave('おじいさんが 帰ってきて、知らない人は にげていった');
  }
  function intruderCome(){
    if(!persona.away){ showToast('知らない人は、おじいさんが 外に出ているときだけ 来ます'); return; }
    if(intr.active){ addLog('🕵', 'もう 知らない人が 来ています'); return; }
    intr.active = true; intr.fleeing = false; intr.turnAway = false; intr.freeze = 0; intr.stayFrom = null; intr.inT = 0;
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
        if(room === here && !persona.away && persona.pose !== 'lie' && !persona.queue.length && !nightNow()) return { sayOnly:'「わしは まだ ここに いるから、つけて おくよ」' };   // いる 部屋の 電気は 消さない
        return { room, say:'「わかった、' + room + 'の電気を 消してくるよ」',
          done(){ setLight(room, false, 'person'); addLog('👴', 'おじいさんが ' + room + 'の電気を 消した');
            const a = UX.alerts['light:' + room];              // 困りごとに なる 前に 消せた → 安心（困りごとの あとなら「おかげで」の +10）
            if(!demo && running && !(a && a.trouble) && UX.helpBy.light != null && vmin - UX.helpBy.light < 30) meterNote('anshin', +5, '電気の 消し忘れに 気づけた（チャッピーの おかげ）'); } }; }, fromOutside:true },
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
        if(recent('medicine', 900)) return { sayOnly:'「薬は もう 飲んだよ」' };   // 薬は 1日 1回（何回 言われても 2回は 飲まない）
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
    // 家に いる おじいさんに「だれですか！」「警察を よびますよ」と 言うと びっくりする（知らない人と まちがえた）
    const strangerHere = intr.active && !intr.turnAway && !!L.roomAt(intr.x, intr.z);
    if(!viaMail && !strangerHere && /だれですか|誰ですか|だれだ|誰だ|警察|けいさつ|出ていけ|でていけ|どろぼう|泥棒/.test(hira(text).replace(/\s/g, ''))){
      rec('scare', { text });
      if(chatSeen.scare == null || vmin - chatSeen.scare >= 15){
        chatSeen.scare = vmin;
        pop(persona.x, 1.4, persona.z, '😣 びっくり');
        say('g', persona.pose === 'lie' ? '「うわっ！ ねていたのに…。わしじゃよ」' : '「わしじゃよ！ びっくりしたなあ…」');
        UX.feel = '😮'; UX.feelUntil = performance.now() + 6000;
        meterNote('anshin', -8, '知らない人と まちがえられて びっくり', persona.pose === 'lie' ? '「ねて いたのに…。わしじゃよ」' : '「わしじゃよ！」');
        // 見どころ：すぐ 流れて しまうと 気づけないので、時計を 少し 止めて チャッピーと おじいさんを うつす
        if(!chatSeen.scareSpot) chatSeen.scareSpot = true, spotlight(L.CHAPPY_AT.x, L.CHAPPY_AT.z, persona.x, persona.z, 3200,   // 見どころは 1回目だけ（何回も 止まらない）
          '⚠ チャッピーが、家に いる おじいさんに「' + String(text).slice(0, 16) + '」と 言った', '😣 おじいさんは 知らない人と まちがえられて、びっくり。これで いいのかな？');
      }
      return;
    }
    const reqs = parseHears(text);
    if(!reqs.length && reqs.negated){ if(!persona.away && persona.pose !== 'lie') sayOnce('「わかった、そのままに しておくよ」'); return; }
    if(!reqs.length && viaMail && /知らない|不審|ふしん|どろぼう|泥棒|だれか|誰か|侵入/.test(hira(text))){
      addLog('👴', 'おじいさんが 外で メールを 見て、家に 知らない人が いると 気づいた：「なんだって！ 急いで 帰ろう」');
      rushHome();
      return;
    }
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
    UX.helpBy.intruder = vmin;                          // 声で にげた（何を 言っても にげる）
    intruderLeave('チャッピーが しゃべって、知らない人は おどろいて にげていった');
    spotlight(L.CHAPPY_AT.x, L.CHAPPY_AT.z, intr.x, intr.z, 3000,
      '🗣️ チャッピーが しゃべった！', '🏃 知らない人は チャッピーの 声に おどろいて、にげていった');
  }
  function intruderStep(dt){
    if(!intr.active || intr.turnAway) return;
    if(L.roomAt(intr.x, intr.z)) intr.inT = (intr.inT || 0) + dt;   // 家の 中に いる 時間（家が 動いて いる ときだけ）
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
    if(intrSeen()) arr.push(intr);
    return arr;
  }
  // チャッピーが 知らない人に 気づくのは、居間（チャッピーの 部屋）に 入った とき か、家の 中を 3秒 歩いた とき
  //   （一歩 入った ところで すぐ にげると、入って きた ことが わからない）
  function intrSeen(){
    if(!intr.active || intr.turnAway || !L.roomAt(intr.x, intr.z)) return false;
    if(intr.fleeing) return true;
    return L.roomAt(intr.x, intr.z) === '居間' || (intr.inT || 0) > 3.0;   // 家の 中を 3秒 歩いたら（止まって いる 間は 数えない）
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
      button_red: btn.red || patNow(), button_blue: btn.blue || patNow(), button_both: (btn.red && btn.blue) || patNow(),   // さみしい おじいさんが ボタンを おした（赤・青 どちらの ブロックでも）
      month: now.getMonth() + 1, day: now.getDate(), weekday: now.getDay(),
      // 🧪 仮想だけ：部屋ごとの 人・電気・明るさ、玄関のドア・かぎ
      door_open: door.angle > 0.3, locked: lockOn(),
      // おじいさんか 知らない人かも わかる（家の中に いるときだけ「本当」。玄関の 外は 家の外）
      grandpa_in: !persona.away && !!L.roomAt(persona.x, persona.z),
      stranger_in: intrSeen(),
      foot_pir: footWalk(), foot_lit: foot,                    // 🦶 歩いている（寝室〜トイレ）・足元ライトが ついている
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
      sensors, paint:onPaint, speed:() => Math.max(1, effRate() * 60),   // 「⏱ 待つ」は 家の 時計の 秒（「待つ 60秒」＝ 家の 1分）
      onEnd(){ addLog('✔', 'プログラムが おわった（時計はそのまま進みます）'); },
    });
    const start0 = runner.start;
    runner.start = p => { lastRunProg = p; return start0(p); };   // 一時停止から もどる ときに 同じ プログラムを 動かす
  }
  function onPaint(st){
    if(outMute) return;
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
        if(cur.camera) openPhone('grandpa', 'camera');             // カメラを つけると、おじいさんの スマホに 家の映像が とどく
      }
      if(cur.lock !== prevPaint.lock){ setHouseLock(cur.lock); noteReaction('lock'); }
      if(cur.rooms['足元'] !== undefined && !!cur.rooms['足元'] !== !!prevPaint.rooms['足元']) setFoot(!!cur.rooms['足元']);   // 🦶 足元ライト   // 前に作った「🔒 玄関のかぎ」ブロック
      L.ROOM_ORDER.forEach(k => {
        if(cur.rooms[k] === undefined) return;
        if(!!cur.rooms[k] !== !!prevPaint.rooms[k]) setLight(k, !!cur.rooms[k], 'block');
      });
      // 同じ ことばを 数えない とき：①⏸ → ▶ で プログラムが はじめから 動きなおした（止める 前に もう 言って いる）
      //   ②家の 時計が 止まって いる あいだ（おじいさんが 歩く など）に「待つ」が おわって、家の 時刻では すぐ また 言った（本物なら もっと あとで 言う）
      const reRun = !!cur.speech && cur.speech === lastTalk.text && (vmin - lastTalk.at < 1.5 || (vmin - resumeAt < 3 && vmin - lastTalk.at < 60));
      if(cur.speech && cur.speech !== prevPaint.speech && /^🤖/.test(cur.speech)){ lastTalk = { text:cur.speech, at:vmin }; aiTalk(); }
      else if(cur.speech && cur.speech !== prevPaint.speech && !reRun){
        talkRepeat = cur.speech === lastTalk.text && vmin - lastTalk.at < 30; lastTalk = { text:cur.speech, at:vmin };
        addLog('🤖', 'チャッピー：「' + cur.speech + '」'); rec('speak', { text:cur.speech }); voice('c', cur.speech); noteReaction('speech'); meterSpeech(cur.speech);
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
    running = true; paused = null; prevPaint = null;
    runner.start(prog); robotState().lock = houseLock;    // プログラムを はじめても 家の かぎは そのまま
    addLog('▶', clockText(vmin) + ' から 動かしはじめた');
    setMode('program');
  }
  // いま 動かしている ボタンだけ 色を つける（'program'＝プログラムで ／ 'plain'＝はじめの状態 ／ null＝止まっている）
  function setMode(m){
    if(m) lastRunMode = m;          // paused は ここで 消さない（動かしはじめの 見どころで 止めた ものを 消して しまう）
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
    running = false; paused = null;
    runner.stop();
    setMode(null);
    if(msg) addLog('■', msg);
  }
  // ---------- ⏸ 一時停止 ／ ▶ つづきから ----------
  // 止めている あいだは 時計も 人も チャッピーも 動かない。▶ で 止めた ところから つづける
  const OUT_KEYS = ['face', 'color', 'pan', 'tilt', 'led', 'fan', 'camera', 'rooms', 'lock', 'event'];
  function pauseSim(quiet){
    if(!running || paused) return;
    const st = robotState(), saved = {};
    OUT_KEYS.forEach(k => { saved[k] = st[k] && typeof st[k] === 'object' ? JSON.parse(JSON.stringify(st[k])) : st[k]; });
    paused = { prog:runner.isRunning() ? lastRunProg : null, saved };
    runner.stop();
    running = false;
    if(!quiet) addLog('⏸', clockText(vmin) + ' で 一時停止（▶ で つづきから）');
  }
  function resumeSim(quiet){
    if(!paused) return;
    const p = paused; paused = null;
    if(p.prog){
      resumeAt = vmin;
      // プログラムは はじめから 動かしなおすが、LED・ファン などの ようすは 止めた ときの まま
      outMute = true;
      try{
        runner.reset();
        const def = JSON.stringify(OUT_KEYS.map(k => runner.state[k]));
        const defs = JSON.parse(def);
        runner.start(p.prog);
        const st = runner.state;
        OUT_KEYS.forEach((k, i) => { if(JSON.stringify(st[k]) === JSON.stringify(defs[i])) st[k] = p.saved[k]; });
        st.lock = houseLock;
      } finally { outMute = false; }
    }
    running = true;
    if(p.prog) try{ onPaint(runner.state); }catch(e){}   // 顔の 絵などで エラーが 出ても、つづきは 止めない（ふだんの paint と 同じ）
    if(!quiet) addLog('▶', clockText(vmin) + ' から つづき');
  }
  // 止まっている ときの ▶：前に 動かしていた やりかたで もう一度
  function playAgain(){
    if(lastRunMode === 'plain') plainDay();
    else if(lastRunMode === 'program') (ROLE === 'request' ? replay(prog) : run());
    else (ROLE === 'request' ? plainDay() : run());
  }
  function togglePlay(){ if(paused) resumeSim(); else if(running) pauseSim(); else playAgain(); }
  function cycleRate(){ rate = rate <= 1 ? 10 : rate <= 10 ? 30 : 1; $('rate').value = String(rate); updRate(); }
  function pauseUI(){
    const sp = !!(paused && paused.spot), ms = $('miniStop'), sb = $('stopBtn'), play = (!!paused && !sp) || (!running && !paused);   // 見どころで 止まっている ときは ⏸ の まま
    if(ms){ ms.textContent = play ? '▶' : '⏸'; ms.title = paused ? 'つづきから 動かす' : running ? '一時停止' : '動かす'; ms.classList.toggle('go', play); }
    if(sb){ sb.textContent = paused ? '▶ つづきから' : '⏸ 一時停止'; sb.disabled = !running && !paused; sb.classList.toggle('go', !!paused); }
  }
  // 時刻を決めて、そこから（人の場所も、その時刻の予定どおりに）しなおす
  function setClockTo(mins, silent){
    stopAll('');
    prevPaint = null; runner.reset();
    if(demo && !silent) demo = null;
    vmin = mins; dayStart = mins; prevPaint = null; manual = false; appliedKey = null; persona.reacting = false; persona.leaveOff = null;
    clockGen++; persona.rushing = false; persona.camSaw = false; meterReset(); uxReset();
    if(!UX.jumping) snaps = [];                          // はじめから 動かす ときは 控えも はじめから
    lastTalk = { text:'', at:-999 }; resumeAt = -1e9; talkRepeat = false;   // 前に 動かした ときの「さいごに しゃべった」は 消す
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
    foot = true; setFoot(false); trip = null;
    const list = entriesNow();
    const cur = currentEntry(list, mins % DAY_MIN);
    persona.queue = []; persona.onDone = null; persona.away = false; persona.pose = 'stand'; persona.outing = false;
    if(cur && cur.act === 'out'){ placeWalker(persona, L.OUTSIDE); persona.away = true; }
    else if(cur && (cur.act === 'sleep' || cur.room === 'トイレ')){ lieDown(); }   // 夜中の トイレの あとは ねている
    else if(cur && cur.act === 'sit'){ placeWalker(persona, { x:L.SOFA_SEAT.x, z:3.0 }); sitDown(); }
    else if(cur && cur.act === 'eat'){ eatDown(); }
    else { placeWalker(persona, L.ROOMS[(cur && cur.room) || '寝室'].spot); }
    setExpr(cur && cur.act === 'sleep' ? 'sleepy' : 'smile');
    appliedKey = cur ? keyOf(cur) : null;
    if(demo) lightsFromDay(list, mins % DAY_MIN);         // 見本：その 時刻までの 予定どおりに 電気を つけておく（21時の 場面なら 居間は ついている）
    if(!silent) addLog('🕐', clockText(mins) + ' に合わせました（「▶」で、ここから進みます）');
  }
  // 予定を 1日 たどって、いま（m）の 電気を きめる（つける・消すと 決めた ときだけ かわる。暗いのは 18時〜6時）
  function lightsFromDay(list, m){
    if(!Array.isArray(list) || !list.length) return;
    const lit = {}, dark = t => { const h = t / 60; return h < 6 || h >= 18; };
    const order = list.slice().sort((a, b) => ((a.m - m - 1 + 2880) % 1440) - ((b.m - m - 1 + 2880) % 1440));   // m の すぐ あとから 1日まわって m まで
    let prev = null;
    order.forEach(e => {
      const room = e.act === 'out' ? null : e.room;
      if(e.leave === 'off' && prev && prev.act !== 'out' && e.act !== 'home' && prev.room !== room) lit[prev.room] = false;
      if(room && (e.light === 'on' || (e.light === 'auto' && dark(e.m)))) lit[room] = true;
      if(room && e.light === 'off') lit[room] = false;
      prev = e;
    });
    Object.keys(lit).forEach(r => { if(r in lights && lit[r]) setLight(r, true, 'person'); });
  }
  function endDay(){
    stopAll('');
    addLog('🌙', '1日がおわりました（時刻を合わせると、また見られます）');
    const sum = meterSummary();
    addLog('📊', '今日の 一日：' + sum);
    setCaption('📊 今日の 一日（おじいさんの 気持ち）', sum);
    if(EMBED) window.parent.postMessage({ type:'teamhome-meters', meter:Object.assign({}, meter), stat:JSON.parse(JSON.stringify(mstat)), text:sum, start:METER0 }, location.origin);
  }
  function playDay(){
    if(demo){ demo = null; runner.reset(); setHouseLock(lockFromSchedule(nowMin())); }
    if(vmin >= dayStart + DAY_MIN) setClockTo(DAY_START, true);
    manual = false; appliedKey = null;                                        // 手で動かしていたら、予定に もどす
    running = true; paused = null;
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
    if(sc.program && typeof sc.program === 'object' && sc.progAt == null){ prevPaint = null; runner.start(sc.program); robotState().lock = houseLock; }   // progAt：その 時刻から 動かす（はじめに 様子を 見る）   // 見本の プログラム（依頼者の「✨ 解決すると」。ブロックは 見せない）
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
    const sc = demo.sc, tnow = performance.now(), vb = voiceBusy(), vOn = !!(VOICE() && VOICE().on());
    if(sc.program && sc.progAt != null && !demo.progOn && vmin >= sc.progAt && !(demo.holdUntil && tnow < demo.holdUntil) && !vb){   // 様子を 見おわってから チャッピーが 動く
      demo.progOn = true; prevPaint = null; runner.start(sc.program); robotState().lock = houseLock;
    }
    // 声が 話している あいだは、時計も つぎの できごとも まつ（ナレーションと せりふが 前後しない）
    // ナレーションの あいだは 時計を 止める（4.5秒まで。長く 止まりつづけない）。チャッピー・おじいさんの せりふでは 止めない（動きと いっしょに 聞こえる）
    const vn = VOICE() && VOICE().busyNarr ? VOICE().busyNarr() : vb;
    if(vn){ if(!demo.narrAt) demo.narrAt = tnow; if(tnow - demo.narrAt < 4500) demo.holdUntil = Math.max(demo.holdUntil || 0, tnow + 200); }
    else demo.narrAt = 0;
    if(vb) demo.quietAt = tnow;
    demo.events.forEach((ev, i) => {
      if(ev.done || vmin < ev.m || vb) return;
      if(ev.wait != null){                               // 1つ前の できごとから ev.wait 秒 たってから（声が ある ときは 声が おわってから 少し）
        const pv = demo.events[i - 1];
        if(pv && !pv.done) return;
        const ref = Math.max(demo.lastAt || 0, demo.quietAt || 0), need = (vOn ? Math.min(ev.wait, 0.9) : ev.wait) * 1000;
        if(tnow - ref < need) return;
      }
      if(ev.when === 'intruderInside' && !(intr.active && L.roomAt(intr.x, intr.z))) return;
      if(ev.when === 'intruderSeen' && !(intr.active && L.roomAt(intr.x, intr.z) === '居間')) return;   // 居間＝チャッピーの カメラに うつる
      if(ev.when === 'away' && !persona.away) return;
      if(ev.on && !(demo.seen && demo.seen[ev.on])) return;   // できごと（例：'gp:medicine'）が おきてから
      if(ev.on && ev.narr) demo.slowUntil = vmin + 2.5;
      ev.done = true; demo.lastAt = performance.now();
      if(ev.hold) demo.holdUntil = demo.lastAt + ev.hold * 1000;     // 時計を 止めて、見て・読める ように
      if(ev.focus) demo.focusUntil = demo.lastAt + ev.focus * 1000;  // カメラを チャッピーと 知らない人に よせる
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
    if(ev.narr) setCaption(demo.sc.title, ev.narr);      // ナレーションの 声は さいごに（動き・せりふ → ナレーション の じゅん）
    if(ev.face) st.face = ev.face;
    if(ev.speech){
      st.speech = ev.speech;
      setTimeout(() => { if(st.speech === ev.speech) st.speech = ''; }, ev.speechMs || 3000);
      voice('c', ev.speech);
      if(ev.noReact){ addLog('🤖', 'チャッピー：「' + ev.speech + '」'); pop(L.CHAPPY_AT.x, 1.3, L.CHAPPY_AT.z, '🗣️ 大きな 声'); }   // 見本：にげるのは つぎの できごとで（すぐ にげると 見えない）
      else noteReaction('speech', '「' + ev.speech + '」としゃべった（見本）');
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
    if(ev.camera !== undefined){ st.camera = !!ev.camera; if(st.camera) openPhone(ev.mailTo || 'grandpa', 'camera'); }
    if(ev.narr) voice('n', ev.narr);
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
    meterMail(to, text);
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
    initPhoneDrag();
    placePhone();
  }
  // スマホの 上の 帯を つかんで、家の 画面の 中で 動かせる（一度 動かしたら その 場所の まま）
  let phoneDrag = null, phoneMoved = false, phoneDragOn = false;
  function initPhoneDrag(){
    if(phoneDragOn) return;
    const p = $('phone'), bar = p && p.querySelector('.top'); if(!bar) return;
    phoneDragOn = true;
    bar.style.cursor = 'grab'; bar.style.touchAction = 'none'; bar.style.userSelect = 'none'; bar.title = 'ここを つかんで うごかせます';
    bar.addEventListener('pointerdown', e => {
      if(e.target.closest('button') || !p.offsetParent) return;
      const r = p.getBoundingClientRect();
      phoneDrag = { dx:e.clientX - r.left, dy:e.clientY - r.top };
      try{ bar.setPointerCapture(e.pointerId); }catch(er){}
      bar.style.cursor = 'grabbing'; e.preventDefault();
    });
    bar.addEventListener('pointermove', e => {
      if(!phoneDrag || !p.offsetParent) return;
      const st = p.offsetParent.getBoundingClientRect(), r = p.getBoundingClientRect();
      const offX = (r.left - st.left) - p.offsetLeft, offY = (r.top - st.top) - p.offsetTop;   // 小さい 画面で 縮めて いる ぶんの ずれ
      const L = clamp(e.clientX - st.left - phoneDrag.dx, 0, Math.max(0, st.width - r.width)), T = clamp(e.clientY - st.top - phoneDrag.dy, 0, Math.max(0, st.height - r.height));
      p.style.left = Math.round(L - offX) + 'px'; p.style.top = Math.round(T - offY) + 'px'; p.style.right = 'auto';
      phoneMoved = true;
    });
    const end = () => { if(!phoneDrag) return; phoneDrag = null; bar.style.cursor = 'grab'; };
    bar.addEventListener('pointerup', end); bar.addEventListener('pointercancel', end);
  }
  // スマホは 気持ちメーターに 重ねない：メーターの 下に 入れば 下、入らなければ メーターの 左（一日の 帯にも 重ねない）
  function placePhone(){
    const p = $('phone'), m = $('meterHud'), tl = $('tline');
    if(!p || p.style.display === 'none' || !p.offsetParent || phoneMoved) return;   // 自分で 動かした あとは その 場所の まま
    const st = p.offsetParent.getBoundingClientRect();
    const sc = document.body.classList.contains('mini') ? 0.78 : 1;
    const mr = m && m.offsetParent ? m.getBoundingClientRect() : null;
    const tr = tl && tl.offsetParent ? tl.getBoundingClientRect() : null;
    const tk = tl && tl.querySelector('.tl-key'), kr = tk && tk.offsetParent ? tk.getBoundingClientRect() : null;   // 帯の 上の 説明も よける
    const floor = Math.min(tr && tr.height ? tr.top : st.bottom, kr && kr.height ? kr.top : st.bottom) - st.top - 8;          // ここより 下には 出さない
    const FULL = 380, MIN = 190;
    let top = 10, right = 10, h = FULL;
    if(mr && mr.height){
      const mTop = mr.top - st.top, mBot = mr.bottom - st.top, mLeft = st.right - mr.left;
      const below = (floor - (mBot + 8)) / sc;
      if(mTop < 40 + FULL * sc && below >= MIN){ top = mBot + 8; h = Math.min(FULL, below); }      // メーターの 下
      else if(mTop >= 40 + FULL * sc){ top = 10; h = Math.min(FULL, (mTop - 18) / sc); }           // メーターが 下に ある（小さい 画面）：上に
      else { top = 52; right = mLeft + 8; h = Math.min(FULL, (floor - 52) / sc); }                  // 左に ならべる（上の 時計・ボタンの 下）
    } else h = Math.min(FULL, (floor - 10) / sc);
    p.style.top = Math.round(top) + 'px'; p.style.right = Math.round(right) + 'px'; p.style.height = Math.round(Math.max(180, h)) + 'px';
  }
  setInterval(() => { if(phone.open) placePhone(); }, 600);                   // メーターの 高さが かわっても（わけの 文が 出た とき など）
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
  // 🔊 声（読み上げ）：チャッピー・おじいさん・知らない人・ナレーションで ちがう 声（chappy-voice.js）。はじめは オフ
  //   チームの ページに うめこまれて いる ときは、ページの 声を つかう（1つの 列で じゅんばんに 話す ため）
  const VOICE = () => { try{ if(EMBED && window.parent !== window && window.parent.ChappyVoice) return window.parent.ChappyVoice; }catch(e){} return window.ChappyVoice || null; };
  let voiceOn = !!(window.ChappyVoice && ChappyVoice.on());
  function voice(who, text){
    const V = VOICE();
    if(!V || !V.on() || /^🤖/.test(String(text || ''))) return;   // 「🤖 AIとおはなし」は 読まない
    V.speak(who, text);
  }
  function voiceButtons(){
    voiceOn = !!(window.ChappyVoice && ChappyVoice.on());
    ['voiceBtn', 'miniVoice'].forEach(id => { const b = $(id); if(b){ b.textContent = (voiceOn ? '🔊' : '🔇') + (id === 'voiceBtn' ? (voiceOn ? ' 声 あり' : ' 声 なし') : ''); b.classList.toggle('on', voiceOn); b.title = voiceOn ? '声を 消す' : 'チャッピー・おじいさん・知らない人・ナレーションの 声を 出す'; } });
  }
  function setVoice(on, greet){
    if(window.ChappyVoice) ChappyVoice.set(on);
    voiceButtons();
    if(on && greet) voice('c', 'こんにちは。チャッピーです');
  }
  window.addEventListener('storage', e => { if(e.key === 'chappy_voice') voiceButtons(); });   // チームの ページで 切りかえた とき
  function say(who, text){
    talk[who] = { text, until: performance.now() + 4000 };
    voice(who, text);
    addLog(who === 'g' ? '👴' : '🕵', (who === 'g' ? 'おじいさん：' : '知らない人：') + text);
  }

  // ---------- 明るさ・色・ドア・かぎの見た目 ----------
  const NIGHT = new T.Color('#1B2535'), DAY = new T.Color('#BFE6FF');
  function updateLight(){
    const h = nowMin() / 60;
    const k = smooth(5, 7, h) * (1 - smooth(17, 19, h));
    const W = world, R = W.refs, st = robotState();
    W.scene.background = NIGHT.clone().lerp(DAY, k);
    W.sun.intensity = 0.1 + 2.3 * k;                     // 夜は くらく（電気を けすと 本当に くらい ＝ 足元ライトの 意味が わかる）
    W.hemi.intensity = 0.2 + 1.25 * k;
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
    const W = stageEl.clientWidth, half = Math.min(W / 2, (el.offsetWidth || 0) / 2 + 4);   // ふきだしが 画面の 外に はみ出さない ように
    el.style.left = clamp((v.x + 1) / 2 * W, half, W - half) + 'px';
    el.style.top = ((1 - v.y) / 2 * stageEl.clientHeight) + 'px';
    el.style.display = 'block';
  }
  let lastSp = null;
  function updateBubble(){
    const st = robotState(), now = performance.now();
    if(st.speech && (!lastSp || lastSp.text !== st.speech || now > lastSp.until - 2500)) lastSp = { text:st.speech, until:now + 3000 };   // 速く 進んで いても 3秒は 見える
    const sp = st.speech || (lastSp && (now < lastSp.until || (paused && paused.spot)) ? lastSp.text : '');
    if(!sp || mode3p) bubble.style.display = 'none';
    else placeBubble(bubble, L.CHAPPY_AT.x, 0.95, L.CHAPPY_AT.z, /^🤖/.test(sp) ? '🤖 チャッピー：AIで おはなし中…' : '🤖 チャッピー「' + sp + '」');
    const keep = !!(paused && paused.spot);                                   // 見どころで 止まっている あいだは ふきだしを のこす
    const g = talk.g && (now < talk.g.until || keep) && !persona.away && !mode3p ? talk.g : null;
    if(!g) $('bubbleG').style.display = 'none';
    else placeBubble($('bubbleG'), persona.x, persona.pose === 'lie' ? 1.0 : 1.75, persona.z, '👴' + g.text);
    const i = talk.i && (now < talk.i.until || keep) && intr.active ? talk.i : null;
    if(!i) $('bubbleI').style.display = 'none';
    else placeBubble($('bubbleI'), intr.x, 1.8, intr.z, '🕵' + i.text);
    uxPlace();
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
  // 見どころ（プログラムで 動かしている とき）：時計を 少し 止めて、その場所を うつし、何が おきたか 説明を 出す
  let spot = null;
  function spotlight(ax, az, bx, bz, ms, title, text){     // a＝チャッピー・b＝相手。2人とも 入る ように 引いて うつす
    if(demo || !running || mode3p) return;
    const d = Math.hypot(ax - bx, az - bz);
    spot = { x:(ax + bx) / 2, z:(az + bz) / 2, r:clamp(6.5 + d * 1.1, 7, 13), until:performance.now() + ms, capUntil:performance.now() + ms + 3000 };
    setCaption(title, text);
    voice('n', title + '。' + text);                    // せりふ（チャッピー → おじいさん）の あとに ナレーション
    pauseSim(true); if(paused) paused.spot = true;       // 家ぜんぶを 止める（時計・人・チャッピー）。声が おわったら つづける
  }
  const spotOn = () => !!(spot && (performance.now() < spot.until || (paused && paused.spot)));
  // 声が 話している／まっている（家は その あいだ 先へ すすまない ＝ 動きと 声が ずれない）
  const voiceBusy = () => { const V = VOICE(); return !!(V && V.on() && V.busy && V.busy()); };
  function followTarget(){
    if(spotOn()) return { x:spot.x, z:spot.z, r:spot.r };
    if(demo && demo.focusUntil && performance.now() < demo.focusUntil && intr.active)      // 見本：チャッピーが 言う ところを 2人とも うつす
      return { x:(L.CHAPPY_AT.x + intr.x) / 2, z:(L.CHAPPY_AT.z + intr.z) / 2, r:6.2 };
    if(intr.active && !intr.turnAway && (persona.away || intr.fleeing)){   // 知らない人と チャッピーを 2人とも うつす（チャッピーが 何を するか 見える）
      const d = Math.hypot(intr.x - L.CHAPPY_AT.x, intr.z - L.CHAPPY_AT.z);
      return { x:(intr.x + L.CHAPPY_AT.x) / 2, z:(intr.z + L.CHAPPY_AT.z) / 2, r:clamp(6.5 + d * 1.1, 7.5, 13) };
    }
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
        .map(e => {
          const sec = (v, mx) => num(v) != null && num(v) > 0 ? Math.min(mx, num(v)) : undefined;
          return { m:num(e.m), narr:e.narr ? String(e.narr).slice(0, 160) : undefined, intruder:e.intruder === 'come' || e.intruder === 'leave' ? e.intruder : undefined,
                   on:/^[a-z_]+(:[a-z_]+)?$/.test(String(e.on || '')) ? String(e.on) : undefined,
                   // じゅんばんに 見せる 見本（声で にげる）：いつ・何秒 止めるか・チャッピーの ことば
                   when:['intruderInside', 'intruderSeen', 'away'].includes(e.when) ? e.when : undefined,
                   wait:sec(e.wait, 10), hold:sec(e.hold, 15), focus:sec(e.focus, 8),
                   speech:e.speech ? String(e.speech).slice(0, 40) : undefined, speechMs:sec(e.speechMs, 8000), noReact:!!e.noReact };
        }),
      program:s.program && typeof s.program === 'object' ? s.program : null, progAt:num(s.progAt) };
    if(Array.isArray(s.day)) sc.day = P.clean(s.day);
    const v = VIEWS[s.view];                             // view：カメラを 部屋・家全体に 向ける（電気の 消しわすれは 家全体で 見る）。ない ときは おじいさんを 追う
    if(v){ if(mode3p) $('p3Btn').click(); setFollow(false); tween = { k:0, from:{ theta:orbit.theta, phi:orbit.phi, r:orbit.r, t:orbit.target.clone() }, to:{ theta:v.theta, phi:v.phi, r:v.r, t:new T.Vector3(v.x, v.y, v.z) } }; }
    else setFollow(true);
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
    const pk = paused ? (paused.spot ? 'q' : 'p') : running ? 'r' : 's';
    if(pk !== lastPk){ lastPk = pk; pauseUI(); }
    if(paused){                                                        // ⏸ 一時停止：カメラだけ 動かせる
      if(tween) stepTween(dt);
      updateFollow(dt);
      walkFirstPerson(dt);
      if(paused.spot && now > spot.until && (!voiceBusy() || now > spot.until + 15000)){ resumeSim(true); spot.capUntil = now + 3000; return; }   // 見どころ：声が おわったら つづき
      updateBubble(); updatePops(now);
      const pt = clockText(vmin) + (paused.spot ? ' 👀' : ' 一時停止');
      if(pt !== lastClockTxt){ lastClockTxt = pt; $('clockTxt').textContent = pt; const mc = $('miniClock'); if(mc) mc.textContent = pt; }
      updateCamera();
      updateWallFade();
      world.renderer.render(world.scene, camera);
      drawRobotCam(now);
      return;
    }
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
    camWatch();
    if(running) meterTick();
    autoIntruder();
    personaStep(dt, now);
    sampleStates();
    updateChecks();
    intruderStep(dt);
    updateDoor(dt);
    updateRobot(dt, now);
    updateLight();
    updateThermo();
    uxTick();
    snapTake();
    updateBubble();
    updatePops(now);
    const ct = clockText(vmin) + (held ? ' ⏳' : '');                 // ⏳ ＝ 動きが おわるまで 時計を 止めている（⏸ は 一時停止ボタン）
    if(ct !== lastClockTxt){ lastClockTxt = ct; $('clockTxt').textContent = ct; const mc = $('miniClock'); if(mc) mc.textContent = ct; $('clockTxt').title = held ? '動きが おわるまで 時計を 止めています' : ''; }
    $('intrBtn').disabled = !persona.away || intr.active;
    $('sitBtn').disabled = false;
    updateCamera();
    updateWallFade();
    world.renderer.render(world.scene, camera);
    drawRobotCam(now);
    if(demo === null && !(spot && now < spot.capUntil)) setCaptionIdle(now);   // 依頼者・開発者 同じ（止まって いても いまの 予定を 出す）   // 見どころの 説明は 少し のこす
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
    setTimeout(uxDrawMarks, 0);                          // 一日の 帯の 予定の 絵
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
    $('planReset').addEventListener('click', async () => {
      if(!(await uiAsk('おじいさんの一日を、最初の一日にもどします。いまの表は消えます。よろしいですか？'))) return;
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
    $('miniStop').addEventListener('click', togglePlay);
    ['voiceBtn', 'miniVoice'].forEach(id => { const b = $(id); if(b) b.addEventListener('click', () => setVoice(!voiceOn, true)); });
    // ⛶ 全画面：家を 画面いっぱいに（もう一度 おすか Esc で もどる）
    const fb = $('miniFull');
    if(fb){
      const isFull = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
      fb.addEventListener('click', () => {
        const el = document.documentElement;
        if(isFull()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
        else { const r = (el.requestFullscreen || el.webkitRequestFullscreen); if(r) { const p = r.call(el); if(p && p.catch) p.catch(() => showToast('このページでは 全画面に できません')); } }
      });
      const upd = () => { fb.textContent = isFull() ? '✕ もどす' : '⛶ 全画面'; fb.classList.toggle('on', isFull()); setTimeout(() => window.dispatchEvent(new Event('resize')), 60); };
      document.addEventListener('fullscreenchange', upd); document.addEventListener('webkitfullscreenchange', upd);
    }
    setVoice(voiceOn);
    $('stopBtn').addEventListener('click', () => { if(paused) resumeSim(); else pauseSim(); });
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
        if(typeof d.traits === 'string') traitsNow = d.traits;
        if(Array.isArray(d.issues)) issuesNow = d.issues.slice();
        if(typeof d.likes === 'string') likesNow = d.likes;          // おじいさんの 性格（メーターの 動き方が かわる）
        if(d.face && typeof d.face === 'object' && window.GrandpaFace) world.refs.persona.setLook(GrandpaFace.look(d.face));   // 依頼者が えらんだ 見た目
      }
      if(d.type === 'teamhome-criteria') setCriteria(d.criteria);         // 合格条件（依頼書）
      if(d.type === 'teamhome-checkall') checkAll(d.mode === 'program' ? 'program' : 'plain', d.from);   // チームのページの「④ ためす」
      if(d.type === 'teamhome-rule' && typeof d.key === 'string') playRule(d.key);              // チームのページの「① 家の ルール」
      if(d.type === 'teamhome-peek' && d.scene && typeof d.scene === 'object') playPeek(d.scene);   // 依頼者の「👀 困る ようす」「✨ 解決すると」
      if(d.type === 'teamhome-runcheck' && Number.isInteger(d.i)) runCheck(d.i, d.mode === 'program' ? 'program' : 'plain');   // 合格条件 1つだけ ためす
      if(d.type === 'teamhome-jump' && typeof d.t === 'number') uxJump(d.t);                 // その 場面の 少し 前から 見なおす
      if(d.type === 'teamhome-layout'){ setMini(!!d.mini); if(d.noside !== undefined) document.body.classList.toggle('noside', !!d.noside); }   // noside：下の 表を かくす（依頼者）                                        // 横に 出した 小さい 家（家の 画面だけ）
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
    if(demo && demo.holdUntil && performance.now() < demo.holdUntil) return;   // 見本：できごとを 見せている あいだは 時計を 止める
    if(spotOn()) return;                                                        // 見どころ：少し 止める
    const r = trip ? effRate() : demo && demo.slowUntil != null && vmin < demo.slowUntil ? 0.6 : rate;   // 夜中の トイレは 本当の 速さ   // 見本の 説明が 出たら しばらく ゆっくり（読める ように）
    const next = vmin + dt * r, a = Math.floor(vmin), span = Math.floor(next) - a;
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
      prog = p;
      // 一日の とちゅうで ブロックを かえたら、いまの 時刻から 新しい プログラムで つづける（前の プログラムが しゃべりつづけない）
      if(paused && paused.prog) paused.prog = p;
      else if(running && !demo && lastRunMode === 'program' && runner){
        pauseSim(true); if(paused){ paused.prog = p; resumeSim(true); }
        addLog('🔁', clockText(vmin) + ' から 新しい プログラムで 動かします');
      }
    }
    prog = p;
    checkStatic();
    const s = $('progTxt'); if(s) s.textContent = (p.actions && p.actions.length) || (p.threads && p.threads.length) ? '届いたプログラムで 動きます' : 'プログラムは まだ ありません';
    updReplay();
  }
  // 依頼者：プログラムが 届くまでは「送られた プログラムで 再現」は おせない（灰色）
  function updReplay(){
    const b = $('replayBtn'); if(!b || ROLE !== 'request') return;
    b.disabled = !progHas();
    b.title = b.disabled ? '開発チームから プログラムが 届くと おせます' : '届いた プログラムで、おじいさんの 一日を 動かします';
  }

  // ---------- 始まり ----------
  function start(){
    document.body.dataset.role = ROLE;
    if(EMBED) document.body.classList.add('embed');      // チームの ページの 中：家だけ（ボタンは 少なく）
    if(ROLE === 'dev') setTimeout(() => { const v = document.querySelector('#views [data-view="全体"]'); if(v) v.click(); }, 600);   // 開発者：はじめは 家全体（ブロックの 横の 小さい 家でも 全体が 見える）
    setTimeout(() => {
      updRate(); uxDrawMarks();
      const mr = $('miniRate'); if(mr) mr.addEventListener('click', cycleRate);
      const bar = $('tlBar');
      if(bar) bar.addEventListener('click', e => {
        const mk = e.target.closest('.tl-mk');
        if(mk){ const k = UX.marks[+mk.dataset.i]; if(k){ uxJump(k.t); if(EMBED && k.kind === 'drop') try{ window.parent.postMessage({ type:'teamhome-ask', t:k.t, k:k.k, issue:k.issue }, location.origin); }catch(e){} } return; }
        const r = bar.getBoundingClientRect(); uxJump(UX.tlStart + (e.clientX - r.left) / r.width * 1440 + 4);   // 帯の その 時刻へ
      });
    }, 0);
    setTimeout(updReplay, 0);
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

  // チュートリアル用：いま 動いているか（再現の 1日が おわったら、つぎの やることを 出す）
  window.teamhomePlay = () => ({ running, paused:!!paused, demo:!!demo, demoEnded:!!(demo && demo.ended), vmin:+vmin.toFixed(1) });
  window.teamhomePause = on => { if(on) pauseSim(); else resumeSim(); };
  window.teamhomeRate = r => { if(r == null) return rate; rate = Math.max(1, Math.min(120, Number(r) || 10)); turbo = rate > 30 ? 4 : 1; updRate(); return rate; };   // チュートリアル（おまかせ）：何も おきない ところは 速く
  window.teamhomeStop = () => { if(running || paused) stopAll(''); };   // チュートリアル（おまかせ）：見おわった 場面を おわりに する   // チュートリアル（おまかせ）から 止める／つづける
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
