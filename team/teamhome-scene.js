/* チャッピーのいえ：3D の世界（見た目だけ）
   ・間取り（LAYOUT）・家・庭・おじいさん・知らない人・扇風機・チャッピーをつくる
   ・動き（時刻・歩き方・電気・ドア・センサー）は teamhome-engine.js が、ここの部品を動かす
   ・形は すべて コードで組み立てている（外部の3Dファイルは使わない）。チャッピーの体は chappy3d.js
   ・材料は なるべく 共有して、学校のパソコンでも 軽く動くようにしている */
(function(global){
  'use strict';
  const T = THREE, C3 = Chappy3D;

  // ---------- 間取り（1 ＝ 1m）----------
  // 上：寝室・台所 ／ 下：居間・玄関。玄関のドアは 南側の x 1〜2
  const ROOMS = {
    寝室: { x0:-5, x1:0, z0:-4, z1:0, floor:'wood', wall:'#F3E4F2', spot:{x:-1.3, z:-2.0}, spot2:{x:-1.3, z:-0.6}, bed:{x:-3.3, z:-3.0} },
    台所: { x0:0,  x1:5, z0:-4, z1:0, floor:'tile', wall:'#FFF4DF', spot:{x:2.5,  z:-2.2}, spot2:{x:1.5, z:-2.5} },
    居間: { x0:-5, x1:0, z0:0,  z1:4, floor:'wood', wall:'#EAF5E8', spot:{x:-1.6, z:2.6}, spot2:{x:-3.0, z:2.8} },
    玄関: { x0:0,  x1:5, z0:0,  z1:4, floor:'tile', wall:'#E6EFF9', spot:{x:2.5,  z:2.2}, spot2:{x:1.5, z:1.4} },
    トイレ: { x0:-7, x1:-5, z0:-4, z1:-1.2, floor:'tile', wall:'#E4F3F2', spot:{x:-6.0, z:-2.6}, spot2:{x:-6.2, z:-3.0} },   // 寝室の 西がわ（夜中の トイレ）
  };
  const DOORS = [
    { a:'寝室', b:'居間', x:-2.7, z:0 }, { a:'台所', b:'玄関', x:2.7, z:0 },
    { a:'寝室', b:'台所', x:0, z:-2 },   { a:'居間', b:'玄関', x:0, z:2 },
    { a:'寝室', b:'トイレ', x:-5, z:-1.75 },
  ];
  // 足元ライト（ベッドから トイレまでの 床）。チャッピーの プログラムで つける・消す（🧪 仮想だけ）
  const FOOT_AT = [[-2.2, -1.45], [-3.2, -1.45], [-4.2, -1.5], [-5.6, -1.5], [-6.5, -2.2]];
  const FRONT_DOOR = { x:1.5, z:4 };          // 玄関のドア（外とつながる）
  const DOOR_HINGE = { x:1.0, z:4.0 };        // ドアの ちょうつがい（左のはし）
  const OUTSIDE = { x:1.5, z:6.5 };           // 家の外
  const CHAPPY_AT = { x:-4.0, z:2.0 };        // チャッピーは居間のまるいラグの上
  const FAN_AT = { x:-4.0, z:3.1 };           // 扇風機（チャッピーの となり。カメラの 視界に 入らない 南がわ）
  const SOFA_SEAT = { x:-2.3, z:3.55, y:0.46 };  // ソファの座る場所（おじいさんが すわる）
  const BED = { x:-3.3, z:-3.0, top:0.66 };      // ベッド（ねる場所）
  const EAT_SEAT = { x:2.38, z:-1.2, rot:Math.PI / 2 };  // 台所のいす（テーブルの左がわ。テーブルの方を向いて すわる）
  const CHAPPY_S = 0.0075;                    // 体の大きさ（実物 約0.7m）
  const WALL_H = 1.5, WALL_T = 0.22;
  const ROOM_ORDER = ['寝室', '台所', '居間', '玄関', 'トイレ'];
  function roomAt(x, z){
    return Object.keys(ROOMS).find(k => { const r = ROOMS[k]; return x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1; }) || '';
  }

  // ---------- 材料と形（同じ色・形は 使いまわす）----------
  const MATS = new Map(), GEOS = new Map();
  function MAT(color, o){
    const key = color + '|' + JSON.stringify(o || {});
    let m = MATS.get(key);
    // チャッピーと同じ 「つやのある おもちゃ」の質感（うすい クリアコートで、かたい 色あせた感じを なくす）
    if(!m){ m = new T.MeshPhysicalMaterial(Object.assign({ color, roughness:0.72, clearcoat:0.2, clearcoatRoughness:0.4 }, o || {})); MATS.set(key, m); }
    return m;
  }
  function GEO(kind, a, b, c, d){
    const key = kind + ':' + [a, b, c, d].join(',');
    let g = GEOS.get(key);
    if(!g){
      if(kind === 'rb') g = C3.roundedBox(a, b, c, d);
      else if(kind === 'cy') g = new T.CylinderGeometry(a, b, c, d);
      else if(kind === 'sp') g = new T.SphereGeometry(a, 28, 20);
      else if(kind === 'cap') g = new T.CapsuleGeometry(a, b, 6, 12);
      GEOS.set(key, g);
    }
    return g;
  }
  function tex(w, h, draw, repeat){
    const t = C3.canvasTex(w, h, draw);
    t.redraw(w, h);
    if(repeat){ t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
    return t;
  }
  const WOOD = () => tex(256, 256, (g, w, h) => {
    g.fillStyle = '#E4BC8C'; g.fillRect(0, 0, w, h);
    for(let i = 0; i < 8; i++){
      g.fillStyle = i % 2 ? 'rgba(150,95,45,.10)' : 'rgba(255,240,220,.12)'; g.fillRect(0, i * 32, w, 32);
      g.strokeStyle = 'rgba(120,70,30,.28)'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, i * 32); g.lineTo(w, i * 32); g.stroke();
    }
    for(let i = 0; i < 40; i++){ g.fillStyle = 'rgba(120,70,30,.10)'; g.fillRect(Math.random() * w, Math.random() * h, 18 + Math.random() * 30, 1.5); }
  }, [3, 3]);
  const TILE = () => tex(256, 256, (g, w, h) => {
    g.fillStyle = '#F5F8FB'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#C5D1DE'; g.lineWidth = 3;
    for(let i = 0; i <= 4; i++){ g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, h); g.stroke(); g.beginPath(); g.moveTo(0, i * 64); g.lineTo(w, i * 64); g.stroke(); }
  }, [2, 2]);
  const CARPET = () => tex(128, 128, (g, w, h) => {
    g.fillStyle = '#F2E3D5'; g.fillRect(0, 0, w, h);
    for(let i = 0; i < 1200; i++){ g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,.28)' : 'rgba(170,120,90,.08)'; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
  }, [2, 2]);
  const GRASS = () => tex(256, 256, (g, w, h) => {
    g.fillStyle = '#B9DE9E'; g.fillRect(0, 0, w, h);
    for(let i = 0; i < 2500; i++){ g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,.10)' : 'rgba(60,120,50,.12)'; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
  }, [14, 14]);

  // ---------- 組み立ての小さな道具 ----------
  function mat(color, o){ return typeof color === 'string' ? MAT(color, o) : color; }
  function B(parent, w, h, d, color, x, y, z, r, shadow, o){
    const m = new T.Mesh(GEO('rb', w, h, d, r || 0.05), mat(color, o));
    m.position.set(x || 0, y || 0, z || 0); m.castShadow = shadow !== false; m.receiveShadow = true;
    parent.add(m); return m;
  }
  function S(parent, rad, color, x, y, z, sx, sy, sz, o){
    const m = new T.Mesh(GEO('sp', rad), mat(color, o));
    m.position.set(x || 0, y || 0, z || 0); if(sx) m.scale.set(sx, sy || 1, sz || 1);
    m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
  }
  function Cy(parent, rt, rb, h, color, x, y, z, seg, rx, rz, o){
    const m = new T.Mesh(GEO('cy', rt, rb, h, seg || 24), mat(color, o));
    m.position.set(x || 0, y || 0, z || 0); if(rx) m.rotation.x = rx; if(rz) m.rotation.z = rz;
    m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
  }
  // 手足の ふくらみ（つけ根が 太く、先が 細い。上（y＝0）から 下へ len のびる）
  function limb(parent, rTop, rBot, len, color, x, y, z, o){
    const pts = [[0, 0], [rTop, 0], [rTop * 1.06, -len * 0.16], [(rTop + rBot) / 2 * 1.08, -len * 0.5], [rBot, -len * 0.9], [0, -len]];
    return lathe(parent, pts, color, x, y, z, Object.assign({ roughness:0.85 }, o));
  }
  function Cap(parent, r, len, color, x, y, z, o){
    const m = new T.Mesh(GEO('cap', r, len), mat(color, o));
    m.position.set(x || 0, y || 0, z || 0); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
  }
  function G(parent, x, y, z){ const g = new T.Group(); g.position.set(x || 0, y || 0, z || 0); parent.add(g); return g; }
  // 家具の下の うすい影（接地感）
  let BLOB_MAT = null;
  function blob(parent, w, d, x, z){
    const m = new T.Mesh(new T.PlaneGeometry(w, d), BLOB_MAT);
    m.rotation.x = -Math.PI / 2; m.position.set(x, 0.035, z); parent.add(m); return m;
  }
  // 絵（額のなか）。draw(g, w, h) で中身を描く
  function picture(parent, w, h, x, y, z, rotY, draw, frameColor){
    const g = G(parent, x, y, z); g.rotation.y = rotY || 0;
    B(g, w + 0.06, h + 0.06, 0.03, frameColor || '#8E6B49', 0, 0, 0, 0.01, false);
    const t = tex(256, Math.round(256 * h / w), draw);
    const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshStandardMaterial({ map:t, roughness:0.8 }));
    m.position.set(0, 0, 0.018); g.add(m);
    return g;
  }

  // かぎの表示（ドアの よこ。かかっている・あいている を 大きく見せる）
  function lockBadgeTex(locked){
    return tex(128, 128, (g, w, h) => {
      g.fillStyle = locked ? '#3ED67A' : '#E8603C'; g.beginPath(); g.roundRect(6, 6, w - 12, h - 12, 26); g.fill();
      g.strokeStyle = '#FFFFFF'; g.lineWidth = 12; g.lineCap = 'round';
      const ly = locked ? 52 : 38;
      g.beginPath(); g.arc(w / 2, ly, 24, Math.PI, 0);
      g.moveTo(w / 2 + 24, ly); g.lineTo(w / 2 + 24, 62);
      if(locked){ g.moveTo(w / 2 - 24, ly); g.lineTo(w / 2 - 24, 62); }
      g.stroke();
      g.fillStyle = '#FFFFFF'; g.beginPath(); g.roundRect(w / 2 - 34, 62, 68, 50, 10); g.fill();
      g.fillStyle = locked ? '#3ED67A' : '#E8603C'; g.beginPath(); g.arc(w / 2, 82, 7, 0, Math.PI * 2); g.fill();
    });
  }
  function lockLabelTex(locked){
    return tex(256, 80, (g, w, h) => {
      g.fillStyle = locked ? '#2E9E5B' : '#E8603C';   // かかっている＝みどり（安心）／ あいている＝オレンジ（注意）
      g.beginPath(); g.roundRect(4, 4, w - 8, h - 8, 22); g.fill();
      g.fillStyle = '#FFFFFF'; g.font = '700 38px "Yu Gothic UI",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(locked ? '🔒 かかっている' : '🔓 あいている', w / 2, h / 2 + 2);
    });
  }

  // ---------- 壁（すけて見せるため、壁ごとに材料を持つ）----------
  function wall(scene, refs, ax, az, bx, bz, color){
    const len = Math.hypot(bx - ax, bz - az);
    const g = new T.Group(); g.position.set((ax + bx) / 2, 0, (az + bz) / 2);
    if(Math.abs(bz - az) > Math.abs(bx - ax)) g.rotation.y = Math.PI / 2;
    scene.add(g);
    const wm = new T.MeshStandardMaterial({ color:color || '#FFF7EC', roughness:0.8 });
    const body = new T.Mesh(GEO('rb', len + WALL_T, WALL_H, WALL_T, 0.06), wm);
    body.position.set(0, WALL_H / 2, 0); body.castShadow = true; body.receiveShadow = true; g.add(body);
    const cap = new T.Mesh(GEO('rb', len + WALL_T + 0.04, 0.06, WALL_T + 0.04, 0.03), MAT('#F2C48D'));
    cap.position.set(0, WALL_H + 0.02, 0); cap.castShadow = true; g.add(cap);
    const skirt1 = new T.Mesh(GEO('rb', len + 0.02, 0.1, 0.03, 0.02), MAT('#E6D6C3'));
    skirt1.position.set(0, 0.05, WALL_T / 2 + 0.01); g.add(skirt1);
    const skirt2 = skirt1.clone(); skirt2.position.z = -WALL_T / 2 - 0.01; g.add(skirt2);
    refs.walls.push(g);
    refs.wallSegs.push({ g, ax, az, bx, bz, mats:[wm] });
    return g;
  }

  // ---------- 家 ----------
  function buildHouse(scene, refs){
    const grassMat = new T.MeshStandardMaterial({ map:GRASS(), roughness:1 });
    const ground = new T.Mesh(new T.CircleGeometry(40, 56), grassMat);
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.2; ground.receiveShadow = true; scene.add(ground);
    B(scene, 11.4, 0.4, 9.4, '#D9C8B2', 0, -0.22, 0, 0.12);
    B(scene, 2.6, 0.4, 3.2, '#D9C8B2', -6.1, -0.22, -2.6, 0.12);   // トイレの 土台
    // 玄関前の石だたみ・花だん・ポスト・ポーチ
    for(let i = 0; i < 5; i++) B(scene, 0.9, 0.03, 0.5, '#EEE9DF', 1.5, 0.02, 4.6 + i * 0.6, 0.04);
    const flowerCols = ['#FF8FB1', '#FFD166', '#FFFFFF', '#C3A6FF'];
    [[-2.4, 5.2], [-2.0, 5.6], [-1.6, 5.2], [-2.2, 4.8], [-1.8, 4.7]].forEach(([x, z], i) => {
      const fl = G(scene, x, 0, z);
      S(fl, 0.09, '#6CB96C', 0, 0.1, 0, 1, 0.7, 1);
      S(fl, 0.07, flowerCols[i % 4], 0.07, 0.2, 0.04);
      S(fl, 0.07, flowerCols[(i + 2) % 4], -0.06, 0.18, -0.05);
    });
    B(scene, 0.8, 0.12, 0.7, '#A7876A', -2.0, 0.06, 5.4, 0.04);
    // ポスト（青い箱）
    const post = G(scene, 3.4, 0, 5.2);
    Cy(post, 0.035, 0.035, 1.0, '#7A5C43', 0, 0.5, 0, 10);
    B(post, 0.36, 0.22, 0.3, '#3F6FB5', 0, 1.05, 0, 0.06);
    B(post, 0.3, 0.02, 0.22, '#2F5A9A', 0, 0.94, 0, 0.01);
    // 門の柵（低い木の柵）
    for(let i = 0; i < 9; i++) B(scene, 0.12, 0.5, 0.04, '#F7EFE3', 6.2, 0.25, -4.4 + i * 0.3, 0.02);
    B(scene, 0.04, 0.05, 2.9, '#F7EFE3', 6.2, 0.45, -2.9, 0.01);
    B(scene, 0.04, 0.05, 2.9, '#F7EFE3', 6.2, 0.22, -2.9, 0.01);

    // 床
    const woodMat = new T.MeshStandardMaterial({ map:WOOD(), roughness:0.7 });
    const tileMat = new T.MeshStandardMaterial({ map:TILE(), roughness:0.3 });
    Object.keys(ROOMS).forEach(k => {
      const r = ROOMS[k];
      const f = new T.Mesh(new T.PlaneGeometry(r.x1 - r.x0, r.z1 - r.z0), r.floor === 'wood' ? woodMat : tileMat);
      f.rotation.x = -Math.PI / 2; f.position.set((r.x0 + r.x1) / 2, 0.02, (r.z0 + r.z1) / 2); f.receiveShadow = true; scene.add(f);
    });
    BLOB_MAT = new T.MeshBasicMaterial({ color:'#3B2A1A', transparent:true, opacity:0.18, depthWrite:false });
    // じゅうたん（居間の まるいラグ・寝室のマット）
    const carpet = new T.Mesh(new T.CircleGeometry(1.3, 48), new T.MeshStandardMaterial({ map:CARPET(), roughness:1 }));
    carpet.rotation.x = -Math.PI / 2; carpet.position.set(CHAPPY_AT.x, 0.03, CHAPPY_AT.z); carpet.receiveShadow = true; scene.add(carpet);
    const rug2 = new T.Mesh(new T.RingGeometry(0.9, 0.95, 48), MAT('#E9B98C', { roughness:1 }));
    rug2.rotation.x = -Math.PI / 2; rug2.position.set(CHAPPY_AT.x, 0.04, CHAPPY_AT.z); scene.add(rug2);
    const bedRug = new T.Mesh(new T.PlaneGeometry(1.2, 0.8), MAT('#C9E4D0', { roughness:1 }));
    bedRug.rotation.x = -Math.PI / 2; bedRug.position.set(-1.6, 0.03, -2.5); bedRug.receiveShadow = true; scene.add(bedRug);

    // 壁（ドア・よこ のすき間をあける）
    wall(scene, refs, -5, -4, 5, -4, '#F3E4F2');
    wall(scene, refs, -5, 4, 1, 4, '#E6F0F7');
    wall(scene, refs, 2, 4, 5, 4, '#E6F0F7');
    wall(scene, refs, -5, -4, -5, -2.15, '#FFF7EC');            // 寝室と トイレの あいだ（ドアの すき間を あける）
    wall(scene, refs, -5, -1.35, -5, 4, '#FFF7EC');
    wall(scene, refs, -7, -4, -5, -4, '#E4F3F2');               // トイレ
    wall(scene, refs, -7, -4, -7, -1.2, '#E4F3F2');
    wall(scene, refs, -7, -1.2, -5, -1.2, '#E4F3F2');
    wall(scene, refs, 5, -4, 5, 4, '#FFF7EC');
    wall(scene, refs, -5, 0, -3.2, 0, ROOMS['寝室'].wall);
    wall(scene, refs, -2.2, 0, 2.2, 0, '#FFF7EC');
    wall(scene, refs, 3.2, 0, 5, 0, ROOMS['台所'].wall);
    wall(scene, refs, 0, -4, 0, -2.5, '#FFF7EC');
    wall(scene, refs, 0, -1.5, 0, 0, '#FFF7EC');
    wall(scene, refs, 0, 0, 0, 1.5, '#FFF7EC');
    wall(scene, refs, 0, 2.5, 0, 4, '#FFF7EC');

    // 玄関のドア（ちょうつがいで 開く。かぎがかかっていると 閉じたまま）
    [0.95, 2.05].forEach(x => B(scene, 0.1, 1.62, 0.16, '#F2E6D8', x, 0.81, 4.0, 0.03));
    B(scene, 1.2, 0.08, 0.16, '#F2E6D8', 1.5, 1.58, 4.0, 0.03);
    const hinge = G(scene, DOOR_HINGE.x, 0, DOOR_HINGE.z);
    hinge.rotation.y = 0;                                     // 0 ＝ 閉まっている
    B(hinge, 1.0, 1.5, 0.06, '#B98A5E', 0.5, 0.75, 0, 0.03);
    // 小さなガラスのまど（ドアの上）
    B(hinge, 0.5, 0.42, 0.02, '#CFEFFF', 0.5, 1.12, 0.035, 0.05, false, { roughness:0.2, emissive:'#2A4A66', emissiveIntensity:0.2 });
    S(hinge, 0.04, '#F5D26B', 0.9, 0.75, 0.06);
    refs.door = hinge;
    // かぎの表示（ドアの よこ。表と裏）
    const badgeTex = { on:lockBadgeTex(true), off:lockBadgeTex(false) };
    const labelTex = { on:lockLabelTex(true), off:lockLabelTex(false) };
    const badgeMats = [4.13, 3.87].map(z => {
      const m = new T.MeshBasicMaterial({ map:badgeTex.off, transparent:true, toneMapped:false });
      const b = new T.Mesh(new T.PlaneGeometry(0.34, 0.34), m); b.position.set(2.2, 1.05, z);
      if(z < 4) b.rotation.y = Math.PI;
      scene.add(b); return m;
    });
    const labelMat = new T.SpriteMaterial({ map:labelTex.off, depthTest:false, toneMapped:false });
    const label = new T.Sprite(labelMat); label.scale.set(1.05, 0.33, 1); label.position.set(1.5, 1.95, 4.1); scene.add(label);
    refs.setLock = locked => {
      const k = locked ? 'on' : 'off';
      badgeMats.forEach(m => { m.map = badgeTex[k]; });
      labelMat.map = labelTex[k];
    };

    // 窓（明るさは時刻で変わる）
    refs.windowMats = [];
    [[-5.04, 1.35, 2.0, 'x', 1.4], [4.0, 1.35, -4.04, 'z', 1.3], [-3.2, 1.35, -4.04, 'z', 1.3]].forEach(([x, y, z, axis, w]) => {
      const g = G(scene, x, y, z);
      const wm = new T.MeshStandardMaterial({ color:'#BFE6FF', emissive:'#BFE6FF', emissiveIntensity:1, roughness:0.1 });
      refs.windowMats.push(wm);
      const pw = axis === 'x' ? [0.05, 0.85, w] : [w, 0.85, 0.05];
      g.add(new T.Mesh(new T.BoxGeometry(pw[0], pw[1], pw[2]), wm));
      const fr = axis === 'x' ? [0.08, 0.98, w + 0.1] : [w + 0.1, 0.98, 0.08];
      const frame = B(g, fr[0], fr[1], fr[2], '#FFFFFF', 0, 0, 0, 0.02, false);
      if(axis === 'x') frame.position.x = -0.02; else frame.position.z = -0.02;
      const bar = axis === 'x' ? [0.05, 0.02, w] : [w, 0.02, 0.05];
      B(g, bar[0], bar[1], bar[2], '#FFFFFF', 0, 0, 0, 0.005, false);
      // カーテン（ひだのある布）
      const cc = axis === 'x' ? '#FFB3A7' : '#B9D7F2';
      [-1, 1].forEach(s => {
        const cx = axis === 'x' ? 0.02 : s * (w / 2 + 0.08), cz = axis === 'x' ? s * (w / 2 + 0.1) : 0.02;
        B(g, axis === 'x' ? 0.06 : 0.22, 1.2, axis === 'x' ? 0.22 : 0.06, cc, cx, 0.2, cz, 0.03);
        Cy(g, 0.03, 0.03, 1.1, cc, axis === 'x' ? 0.05 : cx + (s > 0 ? -0.04 : 0.04), 0.2, axis === 'x' ? cz + 0.1 * s : 0.05, 8);
      });
    });

    // ---- 寝室 ----
    const bed = G(scene, BED.x, 0, BED.z);
    B(bed, 2.1, 0.3, 1.5, '#A87A4E', 0, 0.15, 0, 0.1);              // ベッドのわく（まるい かど）
    B(bed, 0.14, 0.86, 1.56, '#8E6640', -1.08, 0.43, 0, 0.07);       // 頭板（ふかい、まるい）
    B(bed, 0.14, 0.44, 1.56, '#8E6640', 1.08, 0.22, 0, 0.07);        // 足板
    B(bed, 1.92, 0.22, 1.36, '#FFFFFF', 0, 0.41, 0, 0.11);           // マットレス
    B(bed, 1.5, 0.12, 1.3, '#8FB8E8', 0.25, 0.55, 0, 0.1);           // かけ布団（ふかふか）
    B(bed, 1.52, 0.04, 0.32, '#F4D27A', 0.25, 0.6, -0.5, 0.02);       // 布団の おりかえし
    S(bed, 0.2, '#FFFFFF', -0.68, 0.6, -0.32, 1.35, 0.5, 0.95);       // まくら（頭がわ・ふっくら）
    S(bed, 0.2, '#FFF4E8', -0.68, 0.6, 0.32, 1.35, 0.5, 0.95);
    S(bed, 0.12, '#E9B8A8', -0.9, 0.72, -0.02, 1.2, 0.8, 1.5);         // ぬいぐるみ（ねこ）
    blob(scene, 2.5, 1.9, BED.x, BED.z);
    const nt = G(scene, -1.0, 0, -3.5);
    B(nt, 0.55, 0.5, 0.5, '#B98A5E', 0, 0.25, 0, 0.05);
    B(nt, 0.1, 0.1, 0.1, '#8E6B49', 0.22, 0.52, 0.1, 0.02);            // とって
    Cy(nt, 0.02, 0.02, 0.2, '#777777', 0, 0.6, 0, 8);
    Cy(nt, 0.12, 0.09, 0.2, '#FFF2D6', 0, 0.8, 0, 16);                  // 電気のかさ（台の上）
    S(nt, 0.035, '#8E6B49', 0.15, 0.56, -0.12);                          // めがね入れ
    const wardrobe = G(scene, -4.3, 0, -0.4);
    B(wardrobe, 0.7, 1.3, 1.1, '#E6CDB0', 0, 0.65, 0, 0.06);
    for(const dz of [-0.27, 0.27]) B(wardrobe, 0.02, 0.9, 0.46, '#D9BC98', 0.37, 0.7, dz, 0.02, false);
    S(wardrobe, 0.03, '#8E6B49', 0.4, 0.7, -0.1);
    blob(scene, 0.9, 1.3, -4.3, -0.4);
    picture(scene, 0.5, 0.4, -4.86, 1.25, -3.2, Math.PI / 2, (g, w, h) => {      // 寝室のえ（花びん）
      g.fillStyle = '#F4EFE6'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#A8D8A0'; g.fillRect(0, h * 0.7, w, h * 0.3);
      g.fillStyle = '#E36B57'; for(let i = 0; i < 7; i++){ g.beginPath(); g.arc(w * (0.3 + i * 0.07), h * (0.35 + (i % 3) * 0.07), 14, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = '#7FC8F8'; g.fillRect(w * 0.42, h * 0.6, w * 0.16, h * 0.14);
    });
    // スリッパ（ベッドの よこ）
    B(scene, 0.22, 0.05, 0.1, '#F4C58A', -1.5, 0.03, -1.6, 0.02);
    B(scene, 0.22, 0.05, 0.1, '#F4C58A', -1.35, 0.03, -1.62, 0.02);

    // ---- 台所 ----
    const counter = G(scene, 2.9, 0, -3.6);
    B(counter, 4.4, 0.86, 0.66, '#F3EEE6', 0, 0.43, 0, 0.05);
    B(counter, 4.5, 0.05, 0.72, '#A9B4C2', 0, 0.88, 0, 0.02, true, { metalness:0.3, roughness:0.4 });
    for(const dx of [-1.5, -0.5, 0.5, 1.5]) B(counter, 0.9, 0.01, 0.01, '#C9D2DC', dx, 0.6, 0.34, 0.002, false);
    // コンロ（やかん・なべ）
    Cy(counter, 0.14, 0.14, 0.02, '#3B4149', -0.9, 0.9, -0.05, 24);
    Cy(counter, 0.14, 0.14, 0.02, '#3B4149', -0.2, 0.9, -0.05, 24);
    B(counter, 0.7, 0.02, 0.5, '#2F353D', -0.55, 0.9, -0.05, 0.02);
    potWithLid(counter, -0.9, 0.9, -0.05);                            // なべ（ふた つき）
    kettle(counter, -0.2, 0.9, -0.12);                                // やかん
    B(counter, 0.6, 0.04, 0.4, '#C7CED8', 1.1, 0.9, -0.05, 0.05);     // シンク
    S(counter, 0.04, '#B5BEC9', 1.1, 1.05, -0.2);                     // 蛇口
    B(counter, 0.12, 0.03, 0.02, '#B5BEC9', 1.1, 1.09, -0.12, 0.01, false);
    B(counter, 0.36, 0.02, 0.26, '#D9B38C', 1.7, 0.92, -0.1, 0.01);    // まないた
    vegetables(counter, 1.7, 0.92, -0.1);                             // まないたの 野菜
    const fridge = G(scene, 4.8, 0, -3.45);
    B(fridge, 0.7, 1.85, 0.7, '#F5F8FB', 0, 0.93, 0, 0.08);
    B(fridge, 0.66, 0.01, 0.02, '#D1DAE4', 0, 1.28, 0.36, 0.005, false);
    B(fridge, 0.03, 0.4, 0.04, '#9AA6B4', 0.28, 1.5, 0.37, 0.01, false);
    B(fridge, 0.4, 0.2, 0.02, '#FFFFFF', -0.05, 1.15, 0.36, 0.01, false);     // マグネット付きの紙
    blob(scene, 0.8, 0.8, 4.8, -3.45);
    picture(scene, 0.6, 0.45, 2.5, 1.35, -3.86, 0, (g, w, h) => {              // かけカレンダー（台所）
      g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#E36B57'; g.fillRect(0, 0, w, h * 0.22);
      g.fillStyle = '#3B4149'; g.font = '700 30px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('11月', w / 2, h * 0.11);
      for(let r = 0; r < 4; r++) for(let c = 0; c < 6; c++){ g.fillStyle = '#7A8899'; g.font = '20px sans-serif'; g.fillText(String(r * 6 + c + 1), 40 + c * 42, h * 0.36 + r * 0.14 * h); }
    }, '#FFFFFF');
    const kt = G(scene, 3.4, 0, -1.2);
    B(kt, 0.95, 0.74, 0.7, '#FFFFFF', 0, 0.37, 0, 0.1);
    B(kt, 1.0, 0.05, 0.75, '#E7D2B3', 0, 0.76, 0, 0.05);
    fruitBowl(kt, 0.3, 0.785, -0.1);                                   // フルーツのはち
    mealSet(kt);                                                       // おじいさんの 食事
    [-1, 1].forEach(s => {                                                       // いす（背もたれつき。すわる人が テーブルの方を向く）
      const ch = G(kt, s * 1.1, 0, 0.0);
      B(ch, 0.42, 0.06, 0.42, '#E36B57', 0, 0.42, 0, 0.04);
      B(ch, 0.05, 0.36, 0.42, '#E36B57', s * 0.2, 0.66, 0, 0.03);
      for(const [lx, lz] of [[-0.17, -0.17], [0.17, -0.17], [-0.17, 0.17], [0.17, 0.17]]) Cy(ch, 0.025, 0.025, 0.4, '#8E6B49', lx, 0.2, lz, 8);
    });
    blob(scene, 1.4, 1.1, 3.4, -1.2);
    const shelf = G(scene, 0.2, 0, -0.8);
    B(shelf, 0.35, 0.9, 0.9, '#E8D5BD', 0, 0.45, 0, 0.05);
    [0.2, 0.45, 0.7].forEach((y, i) => { for(let k = 0; k < 4; k++) B(shelf, 0.14, 0.18, 0.12, ['#FF8FB1', '#7FC8F8', '#FFD166', '#9AE6B4'][(k + i) % 4], 0.0, y, -0.28 + k * 0.19, 0.03); });

    // ---- 居間 ----
    const sofa = G(scene, -2.3, 0, 3.5);
    B(sofa, 2.6, 0.26, 1.0, '#E3785A', 0, 0.2, 0, 0.12);              // 下のだい（まるい かど）
    B(sofa, 0.34, 0.6, 1.0, '#D66B4D', -1.27, 0.4, 0, 0.17);           // ひじかけ（ふくらみ）
    B(sofa, 0.34, 0.6, 1.0, '#D66B4D', 1.27, 0.4, 0, 0.17);
    B(sofa, 2.6, 0.7, 0.3, '#E8806A', 0, 0.6, 0.36, 0.16);             // せもたれ
    B(sofa, 1.18, 0.16, 0.86, '#F09A82', -0.66, 0.38, 0.05, 0.08);     // 座面のクッション（左）
    B(sofa, 1.18, 0.16, 0.86, '#F09A82', 0.66, 0.38, 0.05, 0.08);      // 座面のクッション（右）
    B(sofa, 1.1, 0.46, 0.2, '#F6A48E', -0.66, 0.62, 0.2, 0.09);        // せもたれのクッション
    B(sofa, 1.1, 0.46, 0.2, '#F6A48E', 0.66, 0.62, 0.2, 0.09);
    S(sofa, 0.18, '#FFD27A', -0.78, 0.6, 0.34, 1.2, 1.1, 0.5);         // まるいクッション
    S(sofa, 0.17, '#9AD8C9', 0.8, 0.6, 0.34, 1.2, 1.1, 0.5);
    B(sofa, 0.5, 0.05, 0.6, '#B98A5E', -0.2, 0.5, 0.0, 0.02);          // ひざかけ（あみもの）
    blob(scene, 2.9, 1.3, -2.3, 3.5);
    const tv = G(scene, -4.0, 0, 0.5);
    B(tv, 1.6, 0.46, 0.6, '#8E6B49', 0, 0.23, 0, 0.05);
    B(tv, 1.56, 0.05, 0.62, '#A77F57', 0, 0.48, 0, 0.02);
    B(tv, 1.5, 0.92, 0.1, '#23292F', 0, 0.99, -0.18, 0.05);
    refs.tvMat = new T.MeshStandardMaterial({ color:'#2B3440', emissive:'#000000', roughness:0.2 });
    const tvScreen = new T.Mesh(GEO('rb', 1.38, 0.8, 0.02, 0.03), refs.tvMat); tvScreen.position.set(0, 0.99, -0.12); tv.add(tvScreen);
    Cy(tv, 0.05, 0.05, 0.02, '#333333', 0.5, 0.5, 0.1, 12);            // リモコン
    picture(scene, 0.7, 0.45, -4.0, 1.9, 0.14, 0, (g, w, h) => {       // テレビの上の えはがき
      g.fillStyle = '#CFEFFF'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#7CC8A0'; g.beginPath(); g.moveTo(0, h); g.lineTo(w * 0.4, h * 0.35); g.lineTo(w * 0.8, h); g.fill();
      g.fillStyle = '#FFD166'; g.beginPath(); g.arc(w * 0.78, h * 0.25, h * 0.14, 0, Math.PI * 2); g.fill();
    });
    const lowT = G(scene, -1.0, 0, 0.7);
    B(lowT, 0.8, 0.9, 0.44, '#E8E0D2', 0, 0.45, 0, 0.05);
    for(let k = 0; k < 5; k++) B(lowT, 0.12, 0.22, 0.3, ['#FF8FB1', '#7FC8F8', '#FFD166', '#9AE6B4', '#C3A6FF'][k], -0.3 + k * 0.15, 0.28, 0, 0.02);
    B(lowT, 0.22, 0.04, 0.3, '#A7876A', 0.1, 0.9, 0.0, 0.01);          // 雑誌
    const ctable = G(scene, -2.3, 0, 1.6);                              // 座卓（湯のみ・新聞）
    B(ctable, 1.0, 0.05, 0.6, '#FFFFFF', 0, 0.4, 0, 0.04);
    for(const [x, z] of [[-0.42, -0.22], [0.42, -0.22], [-0.42, 0.22], [0.42, 0.22]]) Cy(ctable, 0.025, 0.025, 0.38, '#B98A5E', x, 0.2, z, 8);
    Cy(ctable, 0.05, 0.04, 0.09, '#FFFFFF', 0.25, 0.46, 0.05, 16);
    B(ctable, 0.3, 0.02, 0.22, '#E8E0D2', -0.2, 0.43, -0.05, 0.01);
    blob(scene, 1.2, 0.8, -2.3, 1.6);
    // フロアスタンド（ソファの よこ）
    Cy(scene, 0.16, 0.16, 0.02, '#8E6B49', -4.55, 0.01, 2.7, 24);
    Cy(scene, 0.02, 0.02, 1.4, '#8E6B49', -4.55, 0.7, 2.7, 8);
    lathe(scene, [[0.13, 0], [0.19, 0.12], [0.22, 0.26], [0.17, 0.3], [0.1, 0.3]], '#FFF2D6', -4.55, 1.22, 2.7, { emissive:'#FFE7B0', emissiveIntensity:0.25, roughness:0.9 });   // あかりの かさ（ふくらみ）
    potPlant(scene, -0.7, 3.6, 1.1, 0); potPlant(scene, -4.6, 3.6, 1.2, 1); potPlant(scene, 4.4, 3.6, 0.9, 2);

    // 部屋の名前（天井の近くに ふわっと浮かせる）。電気が ついている部屋は 黄色の札に 💡
    const nameTex = (k, lit) => tex(256, 96, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.fillStyle = lit ? 'rgba(255,214,79,0.97)' : 'rgba(255,255,255,0.92)'; g.beginPath(); g.roundRect(8, 14, w - 16, h - 28, 22); g.fill();
      if(lit){ g.strokeStyle = '#E0A100'; g.lineWidth = 4; g.stroke(); }
      g.fillStyle = '#5B4636'; g.font = '700 42px "Yu Gothic UI","Segoe UI Emoji",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(lit ? '💡' + k : k, w / 2, h / 2 + 2);
    });
    // 床の あかり（昼でも 電気が ついているのが わかる、うすい 黄色の 光の輪）
    const glowTex = tex(256, 256, (g, w, h) => {
      const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      gr.addColorStop(0, 'rgba(255,214,90,0.75)'); gr.addColorStop(0.6, 'rgba(255,214,90,0.35)'); gr.addColorStop(1, 'rgba(255,214,90,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    });
    refs.roomLights = {};
    refs.setRoomLit = {};
    refs.setRoomAlert = {};
    // 困りの しるし：床の まわりを 赤い 点線で 光らせる（engine が ちかちか させる）
    const alertTex = tex(256, 256, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.strokeStyle = 'rgba(229,72,61,1)'; g.lineWidth = 18; g.setLineDash([34, 20]);
      g.strokeRect(12, 12, w - 24, h - 24);
      g.fillStyle = 'rgba(229,72,61,0.16)'; g.fillRect(12, 12, w - 24, h - 24);
    });
    refs.alertMat = new T.MeshBasicMaterial({ map:alertTex, transparent:true, depthWrite:false, toneMapped:false, opacity:0.6, polygonOffset:true, polygonOffsetFactor:-3 });
    ROOM_ORDER.forEach(k => {
      const r = ROOMS[k], cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
      const texs = { off:nameTex(k, false), on:nameTex(k, true) };
      const sm = new T.SpriteMaterial({ map:texs.off, depthTest:false });
      const sp = new T.Sprite(sm);
      sp.scale.set(1.35, 0.5, 1); sp.position.set(cx, 2.25, cz); scene.add(sp);
      const glow = new T.Mesh(new T.PlaneGeometry(r.x1 - r.x0 - 0.3, r.z1 - r.z0 - 0.3),
        new T.MeshBasicMaterial({ map:glowTex, transparent:true, depthWrite:false, toneMapped:false, polygonOffset:true, polygonOffsetFactor:-2 }));
      glow.rotation.x = -Math.PI / 2; glow.position.set(cx, 0.06, cz); glow.visible = false; scene.add(glow);
      const pl = new T.PointLight('#FFD9A0', 0, 7, 1.6); pl.position.set(cx, 1.3, cz); scene.add(pl);   // 電気の 光（かさは 天井のない家のため 置かない）
      refs.roomLights[k] = pl;
      const al = new T.Mesh(new T.PlaneGeometry(r.x1 - r.x0 - 0.15, r.z1 - r.z0 - 0.15), refs.alertMat);
      al.rotation.x = -Math.PI / 2; al.position.set(cx, 0.09, cz); al.visible = false; scene.add(al);
      refs.setRoomAlert[k] = on => { al.visible = !!on; };
      let was = null;
      refs.setRoomLit[k] = on => { if(on === was) return; was = on; sm.map = on ? texs.on : texs.off; glow.visible = on; };
    });

    // ---- トイレ（便器と タンク）・足元ライト ----
    const wc = G(scene, -6.35, 0, -3.45);
    B(wc, 0.44, 0.4, 0.56, '#FFFFFF', 0, 0.2, 0.06, 0.14);
    B(wc, 0.46, 0.04, 0.5, '#E8EEF4', 0, 0.42, 0.08, 0.1);
    B(wc, 0.52, 0.5, 0.2, '#F4F4F4', 0, 0.62, -0.3, 0.05);
    const footOff = MAT('#CFC7B8'), footOn = new T.MeshBasicMaterial({ color:'#FFE49A', toneMapped:false });
    const footGlow = new T.MeshBasicMaterial({ map:glowTex, transparent:true, depthWrite:false, toneMapped:false, polygonOffset:true, polygonOffsetFactor:-2 });
    const feet = FOOT_AT.map(([x, z]) => {
      const m = new T.Mesh(GEO('rb', 0.24, 0.06, 0.12, 0.02), footOff); m.position.set(x, 0.05, z); scene.add(m);
      const gl = new T.Mesh(new T.PlaneGeometry(1.1, 1.1), footGlow); gl.rotation.x = -Math.PI / 2; gl.position.set(x, 0.07, z); gl.visible = false; scene.add(gl);
      return { m, gl };
    });
    const footLight = new T.PointLight('#FFE0A0', 0, 4, 1.6); footLight.position.set(-4.4, 0.45, -1.7); scene.add(footLight);
    refs.setFoot = on => { feet.forEach(f => { f.m.material = on ? footOn : footOff; f.gl.visible = on; }); footLight.intensity = on ? 2.2 : 0; };

    // ---- 玄関 ----
    const shoes = G(scene, 4.1, 0, 3.5);
    B(shoes, 1.4, 0.6, 0.42, '#A7876A', 0, 0.3, 0, 0.05);
    for(const [x, c] of [[-0.4, '#E36B57'], [-0.1, '#5B8DEF'], [0.2, '#FFFFFF'], [0.45, '#3ED67A']]) B(shoes, 0.22, 0.09, 0.3, c, x, 0.67, 0, 0.04, false);
    blob(scene, 1.6, 0.8, 4.1, 3.5);
    const hooks = G(scene, 4.8, 0, 2.1);
    B(hooks, 0.06, 0.08, 0.6, '#F6F0E6', 0, 1.6, 0, 0.02, false);
    S(hooks, 0.12, '#F2A7C3', -0.04, 1.3, -0.2, 1, 1.3, 0.6);
    // かさたて（傘が 2本）
    const um = G(scene, 4.5, 0, 0.5);
    Cy(um, 0.14, 0.14, 0.45, '#A7876A', 0, 0.22, 0, 20);
    Cy(um, 0.012, 0.012, 0.8, '#3B4149', -0.05, 0.6, 0.02, 6, 0.1, 0);
    Cy(um, 0.012, 0.012, 0.8, '#3B4149', 0.07, 0.6, -0.02, 6, -0.08, 0);
    // 鏡（玄関の かべ・東がわ）
    B(scene, 0.04, 0.8, 0.5, '#8E6B49', 4.865, 1.25, 1.0, 0.02, false);
    B(scene, 0.02, 0.7, 0.42, '#D8ECF8', 4.85, 1.25, 1.0, 0.01, false, { metalness:0.6, roughness:0.1 });
    B(scene, 0.9, 0.02, 0.5, '#8E6B49', 1.5, 0.01, 3.2, 0.02);       // 玄関マット
    picture(scene, 0.44, 0.34, 3.9, 1.55, 0.14, 0, (g, w, h) => {     // 玄関の えはがき（富士山）
      g.fillStyle = '#BEE7FF'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#5B7DB1'; g.beginPath(); g.moveTo(0, h * 0.8); g.lineTo(w * 0.5, h * 0.2); g.lineTo(w, h * 0.8); g.fill();
      g.fillStyle = '#FFFFFF'; g.beginPath(); g.moveTo(w * 0.42, h * 0.3); g.lineTo(w * 0.5, h * 0.2); g.lineTo(w * 0.58, h * 0.3); g.fill();
    });
  }

  // 植木ばち（葉の かたまり）
  function potPlant(parent, x, z, s, kind){
    const g = G(parent, x, 0, z); g.scale.setScalar(s);
    // 植木ばち（ろくろの まるい かたち）と、やわらかい葉のかたまり（大きさ・色を すこしずつ変える）
    lathe(g, [[0, 0], [0.15, 0.02], [0.22, 0.2], [0.23, 0.36], [0.24, 0.42], [0.22, 0.44]], '#E38B5C', 0, 0, 0, { roughness:0.6 });
    lathe(g, [[0, 0.42], [0.22, 0.42], [0.2, 0.46], [0, 0.46]], '#5A3A24', 0, 0, 0, { roughness:0.9 });   // 土
    const greens = kind % 2 ? ['#5DBB63', '#4CAF6A', '#79C96B'] : ['#4CAF6A', '#3E9E5B', '#6BBF6E'];
    [[0, 0.8, 0, 0.36, 1.0], [0.17, 0.95, 0.06, 0.25, 1.1], [-0.15, 1.0, -0.05, 0.27, 0.9], [0.05, 1.12, 0.14, 0.22, 1.2], [-0.06, 1.18, -0.1, 0.19, 1.0]].forEach(([a, b, c, r, k], i) => {
      const leaf = MAT(greens[i % 3], { roughness:0.75 });
      const m = new T.Mesh(new T.IcosahedronGeometry(r, 3), leaf);
      m.position.set(a, b, c); m.scale.set(1, 0.85 * k, 1); m.castShadow = true; g.add(m);
    });
    return g;
  }
  // 本だな（居間の かど）
  function bookShelf(parent, x, z, rotY){
    const g = G(parent, x, 0, z); g.rotation.y = rotY;
    B(g, 0.9, 1.6, 0.34, '#D8BFA2', 0, 0.8, 0, 0.04);
    [0.35, 0.8, 1.25].forEach((y, row) => {
      for(let k = 0; k < 6; k++){
        const cols = ['#FF8FB1', '#7FC8F8', '#FFD166', '#9AE6B4', '#C3A6FF', '#F4A261'];
        B(g, 0.1 + (k % 3) * 0.02, 0.3, 0.2, cols[(k + row) % 6], -0.36 + k * 0.14, y + 0.1, 0.02, 0.01, false);
      }
    });
    return g;
  }
  function tree(scene, x, z, s, seed){
    const g = G(scene, x, 0, z); g.scale.setScalar(s); g.rotation.y = seed * 6;
    const greens = ['#5DBB63', '#4CAF6A', '#7CCB5B'];
    lathe(g, [[0, 0], [0.2, 0.02], [0.2, 0.2], [0.17, 0.9], [0.13, 1.3], [0, 1.4]], '#8B5E3C', 0, 0, 0, { roughness:0.9 });   // 幹（まるく 細くなる）
    [[0, 1.9, 0, 1.1], [0.3, 2.7, -0.2, 0.75], [-0.4, 2.4, 0.2, 0.8], [0.05, 2.9, 0.3, 0.6]].forEach(([x, y, z, r], i) => {
      const m = new T.Mesh(new T.IcosahedronGeometry(r, 3), MAT(greens[(i + Math.floor(seed * 3)) % 3], { roughness:0.85 }));
      m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; g.add(m);
    });
    return g;
  }

  // ---------- チャッピー（仮想計測制御ラボの体） ----------
  function buildRobot(scene, refs){
    const c = ChappyModel.makeChappy();                    // 仮想プログラミングの チャッピーと 同じ形（chappy-model.js）
    const root = new T.Group();
    root.add(c.g); c.g.scale.setScalar(CHAPPY_S);
    root.position.set(CHAPPY_AT.x, 0, CHAPPY_AT.z);
    scene.add(root);
    // LED：頭の てっぺん（前がわ）。消えているときも 白く見える
    const ledMat = new T.MeshStandardMaterial({ color:'#F3EDE2', emissive:'#FFD23F', emissiveIntensity:0, roughness:0.4 });
    const led = new T.Mesh(new T.SphereGeometry(3.6, 18, 12), ledMat); led.position.set(0, 90, 6); led.scale.set(1, 0.7, 1); c.g.add(led);
    const ledLight = new T.PointLight('#FFD23F', 0, 1.2, 1.5); ledLight.position.set(0, 90, 30); c.g.add(ledLight);
    // カメラの見える範囲（カメラ ON のときだけ）
    const cone = new T.Mesh(new T.ConeGeometry(70, 240, 28, 1, true), new T.MeshBasicMaterial({ color:'#7CFFB2', transparent:true, opacity:0.16, depthWrite:false }));
    cone.rotation.x = -Math.PI / 2; cone.position.set(0, 96, 160); cone.visible = false; c.g.add(cone);
    refs.robot = { root, chappy:c, led, ledMat, ledLight, cone, faceTex:c.face, faceCanvas:c.face.image };
    refs.fan = makeFan(scene, FAN_AT.x, FAN_AT.z);
  }

  // せん風機（仮想計測制御ラボの扇風機と同じ形。首ふりで チャッピーの方を向く）
  function makeFan(scene, x, z){
    const g = G(scene, x, 0, z); g.scale.setScalar(CHAPPY_S);
    const fanW = MAT('#F4F6FA'), fanGray = MAT('#AEB8C4', { metalness:0.3, roughness:0.4 });
    const bladeMat = MAT('#7CC8F2', { transparent:true, opacity:0.9 });
    g.add(C3.mesh(new T.CylinderGeometry(22, 24, 5, 28), fanW, 0, 2.5, 0));
    g.add(C3.mesh(new T.CylinderGeometry(3, 3, 82, 12), fanGray, 0, 45, 0));
    const yawBase = Math.atan2(-(CHAPPY_AT.z - z), CHAPPY_AT.x - x);
    const head = G(g, 0, 92, 0);
    head.rotation.y = yawBase;
    head.add(C3.mesh(C3.roundedBox(18, 18, 18, 7), fanW, -9, 0, 0));
    const blades = G(head, 4, 0, 0);
    for(let i = 0; i < 3; i++){ const arm = new T.Group(); arm.rotation.x = i * Math.PI * 2 / 3; arm.add(C3.mesh(C3.roundedBox(2, 21, 11, 4), bladeMat, 0, 12, 0)); blades.add(arm); }
    blades.add(C3.mesh(new T.CylinderGeometry(4.5, 4.5, 4, 16), fanW));
    const cage = new T.TorusGeometry(26, 1.1, 8, 48); cage.rotateY(Math.PI / 2);
    head.add(C3.mesh(cage, fanGray, 5, 0, 0), C3.mesh(new T.BoxGeometry(1, 52, 1.2), fanGray, 9, 0, 0), C3.mesh(new T.BoxGeometry(1, 1.2, 52), fanGray, 9, 0, 0));
    head.add(blades);
    g.add(head);
    let speed = 0, swing = 0, aimYaw = yawBase;
    return { update(on, dt, aim){
      speed += ((on ? 24 : 0) - speed) * Math.min(1, dt * 2);
      blades.rotation.x -= speed * dt;
      if(on) swing += dt;
      // 風の向き：aim（おじいさんの いる ところ）の方へ 向ける
      const want = Math.atan2(-(aim.z - z), aim.x - x), diff = Math.atan2(Math.sin(want - aimYaw), Math.cos(want - aimYaw));
      aimYaw += diff * Math.min(1, dt * 2);
      head.rotation.y = aimYaw + Math.sin(swing * 0.9) * (on ? 0.45 : 0);
    } };
  }

  // ---------- おじいさん・知らない人 ----------
  // 顔は、頭の前に はりつく絵（目・まゆ・口・しわ・めがね）。表情（expr）ごとに 絵を かえる
  const FACE_KINDS = { grandpa:['smile','neutral','sleepy','surprised','worried'], stranger:['neutral','surprised'] };
  const HEAD_R = 0.125;
  // o：依頼者が えらんだ 顔（eye：目の形・mouth：口の形・brow：まゆの色・hair：ひげの色）
  function faceTexture(kind, expr, o){
    o = o || {};
    const R = HEAD_R, K = 256 / (1.6 * R);
    return tex(256, 256, (g) => {
      g.clearRect(0, 0, 256, 256);
      const X = m => 128 + m * K, Y = m => 128 - m * K;
      const grand = kind === 'grandpa';
      const dark = grand ? '#3B2A20' : '#1E1E1E';
      g.lineCap = 'round'; g.lineJoin = 'round';
      // ほほ（ピンク）
      if(grand){ g.fillStyle = 'rgba(240,120,110,0.4)'; [[0.09, -0.03], [-0.09, -0.03]].forEach(([x, y]) => { g.beginPath(); g.ellipse(X(x), Y(y), 26, 17, 0, 0, Math.PI * 2); g.fill(); }); }
      // しわ（おじいさんだけ）：ほうれい線・目じり・おでこ
      if(grand){
        g.strokeStyle = 'rgba(110,70,50,0.42)'; g.lineWidth = 2.5;
        [1, -1].forEach(s => { g.beginPath(); g.moveTo(X(s * 0.03), Y(-0.02)); g.quadraticCurveTo(X(s * 0.05), Y(-0.04), X(s * 0.07), Y(-0.085)); g.stroke(); });
        [1, -1].forEach(s => [0, 0.01].forEach(d => { g.beginPath(); g.moveTo(X(s * (0.1 + d)), Y(0.035 + d)); g.lineTo(X(s * (0.116 + d)), Y(0.04 + d)); g.stroke(); }));
        g.strokeStyle = 'rgba(110,70,50,0.28)';
        [0.11, 0.124].forEach(y => { g.beginPath(); g.moveTo(X(-0.05), Y(y)); g.quadraticCurveTo(X(0), Y(y + 0.005), X(0.05), Y(y)); g.stroke(); });
      }
      // まゆ（表情で かたちが かわる）
      g.strokeStyle = grand ? (o.brow || '#D9D9D9') : '#2A2A2A'; g.lineWidth = grand ? 7 : 6;
      const by = expr === 'surprised' ? 0.112 : expr === 'worried' ? 0.1 : 0.08;
      const inner = expr === 'worried' ? 0.02 : (grand ? 0.0 : -0.012);
      [1, -1].forEach(s => {
        g.beginPath(); g.moveTo(X(s * 0.095), Y(by)); g.quadraticCurveTo(X(s * 0.06), Y(by + 0.012), X(s * 0.03), Y(by + inner)); g.stroke();
      });
      // 目（ねむい は 閉じた線、びっくり は 大きく）
      [-0.06, 0.06].forEach(x => {
        if(expr === 'sleepy'){
          g.strokeStyle = dark; g.lineWidth = 4.5;
          g.beginPath(); g.arc(X(x), Y(0.02) - 5, 18, Math.PI * 0.15, Math.PI * 0.85); g.stroke();
          return;
        }
        if(grand && o.eye && o.eye !== 'round' && o.eye !== 'big' && expr !== 'surprised'){   // えらんだ 目の形（にっこり・ほそめ・てん）
          g.strokeStyle = dark; g.fillStyle = dark; g.lineWidth = 5;
          if(o.eye === 'happy'){ g.beginPath(); g.arc(X(x), Y(0.02) + 9, 18, Math.PI * 1.15, Math.PI * 1.85); g.stroke(); return; }
          if(o.eye === 'thin'){ g.beginPath(); g.moveTo(X(x) - 20, Y(0.02)); g.lineTo(X(x) + 20, Y(0.02)); g.stroke(); g.beginPath(); g.arc(X(x), Y(0.02), 6, 0, Math.PI * 2); g.fill(); return; }
          g.beginPath(); g.arc(X(x), Y(0.02), 9, 0, Math.PI * 2); g.fill(); return;
        }
        const big = grand && o.eye === 'big';
        const rx = grand ? (big ? 32 : 27) : 19, ry = expr === 'surprised' ? 23 : (grand ? (big ? 22 : 17) : 9);
        g.fillStyle = '#FFFFFF'; g.beginPath(); g.ellipse(X(x), Y(0.02), rx, ry, 0, 0, Math.PI * 2); g.fill();
        const ir = expr === 'surprised' ? 13 : (grand ? (big ? 16 : 13) : 9);
        g.fillStyle = dark; g.beginPath(); g.arc(X(x), Y(0.02), ir, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#FFFFFF'; g.beginPath(); g.arc(X(x) + 4, Y(0.02) - 4, 3.6, 0, Math.PI * 2); g.fill();
        g.strokeStyle = grand ? '#8A6A58' : '#2A2A2A'; g.lineWidth = 3.5;
        g.beginPath(); g.ellipse(X(x), Y(0.02), rx + 2, ry + 2, 0, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
      });
      // はな（かげ）
      g.strokeStyle = 'rgba(150,100,80,0.6)'; g.lineWidth = 3.5;
      g.beginPath(); g.moveTo(X(-0.018), Y(-0.01)); g.quadraticCurveTo(X(-0.022), Y(-0.03), X(0), Y(-0.035)); g.quadraticCurveTo(X(0.022), Y(-0.03), X(0.018), Y(-0.01)); g.stroke();
      // くち（表情で かわる。ふだんの 顔は えらんだ 口の形：大わらい・むすっ）
      const mk = grand && (expr === 'smile' || expr === 'neutral') ? o.mouth : null;
      if(mk === 'laugh'){
        g.fillStyle = '#8A3A30'; g.beginPath(); g.moveTo(X(-0.06), Y(-0.06)); g.quadraticCurveTo(X(0), Y(-0.13), X(0.06), Y(-0.06)); g.closePath(); g.fill();
      } else if(mk === 'grump'){
        g.strokeStyle = '#7A3B33'; g.lineWidth = 5.5;
        g.beginPath(); g.moveTo(X(-0.05), Y(-0.085)); g.quadraticCurveTo(X(0), Y(-0.06), X(0.05), Y(-0.085)); g.stroke();
      } else if(expr === 'smile'){
        g.strokeStyle = '#A4483C'; g.lineWidth = 6;
        g.beginPath(); g.moveTo(X(-0.06), Y(-0.06)); g.quadraticCurveTo(X(0), Y(-0.1), X(0.06), Y(-0.06)); g.stroke();
      } else if(expr === 'sleepy'){
        g.strokeStyle = '#A4483C'; g.lineWidth = 4.5;
        g.beginPath(); g.moveTo(X(-0.04), Y(-0.07)); g.quadraticCurveTo(X(0), Y(-0.08), X(0.04), Y(-0.07)); g.stroke();
      } else if(expr === 'surprised'){
        g.fillStyle = '#7A2B25'; g.beginPath(); g.ellipse(X(0), Y(-0.08), 12, 16, 0, 0, Math.PI * 2); g.fill();
      } else if(expr === 'worried'){
        g.strokeStyle = '#7A3B33'; g.lineWidth = 4.5;
        g.beginPath(); g.moveTo(X(-0.05), Y(-0.07)); g.quadraticCurveTo(X(-0.025), Y(-0.085), X(0), Y(-0.07)); g.quadraticCurveTo(X(0.025), Y(-0.055), X(0.05), Y(-0.07)); g.stroke();
      } else {
        g.strokeStyle = grand ? '#7A3B33' : '#2A2A2A'; g.lineWidth = 5;
        g.beginPath(); g.moveTo(X(-0.04), Y(-0.07)); g.lineTo(X(0.04), Y(-0.07)); g.stroke();
      }
      if(grand && o.mouth === 'beard'){                     // ひげ（口の 上）
        g.fillStyle = o.hair || '#F4F4F4'; g.strokeStyle = 'rgba(120,100,90,0.35)'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(X(-0.075), Y(-0.05)); g.quadraticCurveTo(X(-0.04), Y(-0.02), X(0), Y(-0.04));
        g.quadraticCurveTo(X(0.04), Y(-0.02), X(0.075), Y(-0.05)); g.quadraticCurveTo(X(0.04), Y(-0.07), X(0), Y(-0.058));
        g.quadraticCurveTo(X(-0.04), Y(-0.07), X(-0.075), Y(-0.05)); g.fill(); g.stroke();
      }
    });
  }
  // 顔の絵を のせる（頭の前がわの 一部だけ。まわりは 肌のまま）
  function faceMesh(kind){
    const R = HEAD_R;
    const geo = new T.SphereGeometry(R + 0.003, 40, 28, Math.PI / 2 - 0.95, 1.9, Math.PI / 2 - 0.75, 1.5);
    const p = geo.attributes.position, uv = geo.attributes.uv;
    for(let i = 0; i < p.count; i++) uv.setXY(i, 0.5 + p.getX(i) / (1.6 * R), 0.5 + p.getY(i) / (1.6 * R));
    const faces = {};
    FACE_KINDS[kind].forEach(e => { faces[e] = faceTexture(kind, e); });
    const m = new T.Mesh(geo, new T.MeshStandardMaterial({ map:faces[FACE_KINDS[kind][0]], transparent:true, roughness:0.6, depthWrite:false }));
    m.renderOrder = 2;
    let cur = FACE_KINDS[kind][0];
    return { mesh:m, set(expr){ if(faces[expr]){ cur = expr; if(m.material.map !== faces[expr]){ m.material.map = faces[expr]; m.material.needsUpdate = true; } } },
             rebuild(o){ FACE_KINDS[kind].forEach(e => { const old = faces[e]; faces[e] = faceTexture(kind, e, o); if(old && old.dispose) old.dispose(); });   // えらんだ 顔で かきなおす
                         m.material.map = faces[cur]; m.material.needsUpdate = true; },
             image(expr){ return faces[expr] ? faces[expr].image : null; } };
  }

  function buildPerson(scene, kind){
    const stranger = kind === 'stranger';
    const g = G(scene, 0, 0, 0);
    const cardigan = stranger ? '#3A4157' : '#8FB3D9';
    const trousers = stranger ? '#2A2F3A' : null;   // おじいさんは LM.pants（下で きめる）
    const shoe = stranger ? '#1E1E1E' : '#6B5239';
    // おじいさんは 色を あとから かえられる ように、自分だけの 材質に する（依頼者が えらんだ 見た目：setLook）
    const own = c => new T.MeshPhysicalMaterial({ color:c, roughness:0.72, clearcoat:0.2, clearcoatRoughness:0.4 });
    const LM = stranger ? null : { skin:own('#F0C29C'), skinDark:own('#E2AE86'), hair:own('#F4F4F4'), scarf:own('#E36B57'), pants:own('#4E5A6B'),
                                   cardigan:new T.MeshPhysicalMaterial({ color:'#8FB3D9', roughness:0.85, clearcoat:0.2, clearcoatRoughness:0.4 }),
                                   sleeve:new T.MeshPhysicalMaterial({ color:'#8FB3D9', roughness:0.85, clearcoat:0.2, clearcoatRoughness:0.4 }) };   // そで（ベストの ときは シャツの 色）
    const skin = LM ? LM.skin : '#F0C29C', skinDark = LM ? LM.skinDark : '#E2AE86';
    const pantsM = LM ? LM.pants : trousers;                                     // ズボン（えらべる 色）
    const hair = stranger ? '#2A2A2A' : LM.hair;
    const coat = LM ? LM.cardigan : cardigan;
    const P = { kind, group:g, torso:null, head:null, neck:null, hipL:null, hipR:null, shinL:null, shinR:null,
                shoulderL:null, shoulderR:null, elbowL:null, elbowR:null, cane:null, bowl:null, face:null, sitting:false, lying:false, look:0,
                hairTop:[], hairSide:[], glasses:[], scarf:[], buttons:[], hats:{}, coatParts:{ sweater:[], jersey:[] } };
    // ---- 足（もも・すね・スリッパ）----
    [-1, 1].forEach((s, i) => {
      const hip = G(g, s * 0.11, 0.9, 0); if(i) P.hipR = hip; else P.hipL = hip;
      limb(hip, 0.085, 0.072, 0.44, pantsM, 0, 0, 0);
      const shin = G(hip, 0, -0.47, 0); if(i) P.shinR = shin; else P.shinL = shin;
      limb(shin, 0.07, 0.052, 0.4, pantsM, 0, 0, 0);
      S(shin, 0.085, shoe, 0, -0.47, 0.06, 1, 0.5, 1.5);                 // くつ（まるい スリッパ）
    });
    // ---- からだ（ふっくらした 上半身。少し前かがみ）----
    const torso = G(g, 0, 0.9, 0); P.torso = torso;
    const prof = [[0.0, 0], [0.15, 0.0], [0.175, 0.07], [0.19, 0.2], [0.2, 0.33], [0.195, 0.45], [0.18, 0.55], [0.13, 0.61], [0.0, 0.63]]
      .map(([r, y]) => new T.Vector2(r, y));
    const bodyGeo = new T.LatheGeometry(prof, 36);
    const bodyMesh = new T.Mesh(bodyGeo, LM ? LM.cardigan : MAT(cardigan, { roughness:0.85 }));
    bodyMesh.scale.set(1, 1, 0.74); bodyMesh.castShadow = true; bodyMesh.receiveShadow = true; torso.add(bodyMesh);
    Cy(torso, 0.15, 0.17, 0.12, pantsM, 0, 0.03, 0, 24);             // こしの まわり（ズボン）
    // シャツ（えり・まえの ボタン）
    if(!stranger){
      for(const y of [0.46, 0.36, 0.26]) P.buttons.push(S(torso, 0.014, '#FFFFFF', 0, y, 0.155, 1, 1, 0.6));
      P.coatParts.sweater.push(Cy(torso, 0.2, 0.2, 0.05, LM.cardigan, 0, 0.04, 0, 28));                      // セーターの すそ
      P.coatParts.jersey.push(B(torso, 0.012, 0.42, 0.012, '#FFFFFF', 0.196, 0.3, 0, 0.004, false));          // ジャージの 白い 線
      P.coatParts.jersey.push(B(torso, 0.012, 0.42, 0.012, '#FFFFFF', -0.196, 0.3, 0, 0.004, false));
      P.coatParts.jersey.push(B(torso, 0.008, 0.4, 0.006, '#DDDDDD', 0, 0.33, 0.148, 0.002, false));           // ファスナー
    } else {
      B(torso, 0.2, 0.25, 0.03, '#1F2430', 0, 0.36, 0.135, 0.04, false);   // パーカーのポケット
    }
    // くび・頭（頭の まんなかは 首の上）
    Cy(torso, 0.05, 0.06, 0.1, skin, 0, 0.64, 0, 16);
    if(!stranger){
      P.scarf.push(Cy(torso, 0.142, 0.146, 0.05, LM.scarf, 0, 0.6, 0, 24));                 // まきマフラー（赤み）
      P.scarf.push(B(torso, 0.05, 0.15, 0.03, LM.scarf, 0.04, 0.5, 0.15, 0.01, false));      // マフラーの はし
    }
    const head = G(torso, 0, 0.7, 0.0); P.head = head;
    if(!stranger) head.scale.setScalar(1.22);                                    // 頭を 大きめに（かわいい体つき）
    S(head, HEAD_R, skin, 0, 0.1, 0, 0.94, 1.06, 0.96);
    S(head, 0.028, skin, -0.122, 0.09, 0, 0.55, 1, 0.8);               // みみ
    S(head, 0.028, skin, 0.122, 0.09, 0, 0.55, 1, 0.8);
    S(head, 0.02, skinDark, 0, 0.06, 0.122, 0.8, 1.2, 1.1);            // はな
    if(stranger){
      S(head, HEAD_R + 0.012, '#222B3D', 0, 0.16, -0.005, 1.0, 0.5, 1.03);    // ぼうし
      B(head, 0.22, 0.02, 0.12, '#222B3D', 0, 0.2, 0.13, 0.01);              // ひさし
    } else {
      P.hairTop.push(S(head, HEAD_R + 0.008, hair, 0, 0.17, -0.008, 1.0, 0.52, 1.02));       // かみ（うえ）
      P.hairSide.push(S(head, 0.07, hair, -0.105, 0.12, -0.03, 0.6, 1, 0.9));                 // かみ（よこ）
      P.hairSide.push(S(head, 0.07, hair, 0.105, 0.12, -0.03, 0.6, 1, 0.9));
      P.hairSide.push(S(head, 0.09, hair, 0, 0.02, -0.095, 1, 0.9, 0.6));                     // かみ（うしろ）
      // 帽子（えらんだ ものだけ 見える）
      const hunt = G(head, 0, 0, 0); S(hunt, HEAD_R + 0.016, '#8B7355', 0, 0.185, -0.01, 1.0, 0.44, 1.05); B(hunt, 0.16, 0.014, 0.085, '#6F5B43', 0, 0.19, 0.125, 0.01);
      const knit = G(head, 0, 0, 0); S(knit, HEAD_R + 0.02, '#C94A3C', 0, 0.19, -0.005, 1.0, 0.78, 1.0); Cy(knit, HEAD_R + 0.024, HEAD_R + 0.024, 0.04, '#A8382C', 0, 0.16, 0, 28); S(knit, 0.032, '#FFFFFF', 0, 0.31, 0);
      const straw = G(head, 0, 0, 0); Cy(straw, 0.24, 0.24, 0.012, '#E2C46E', 0, 0.205, 0, 36); Cy(straw, 0.105, 0.118, 0.09, '#EBCF7F', 0, 0.25, 0, 28); Cy(straw, 0.12, 0.12, 0.022, '#C0392B', 0, 0.225, 0, 28);
      P.hats = { hunting:hunt, knit, straw };
      Object.values(P.hats).forEach(h => { h.visible = false; });
    }
    // めがね（細い金のふち）
    if(!stranger){
      [-0.052, 0.052].forEach(x => {
        const ring = new T.Mesh(new T.TorusGeometry(0.031, 0.0035, 6, 18), MAT('#B7A074', { metalness:0.6, roughness:0.35 }));
        ring.position.set(x, 0.12, 0.122); head.add(ring); P.glasses.push(ring);
      });
      P.glasses.push(B(head, 0.04, 0.005, 0.005, '#B7A074', 0, 0.125, 0.123, 0.001, false, { metalness:0.6, roughness:0.35 }));
    }
    P.face = faceMesh(kind);
    head.add(P.face.mesh); P.face.mesh.position.set(0, 0.1, 0);     // 顔の絵は 頭の まんなか（少し上）に
    P.face.set(FACE_KINDS[kind][0]);
    // ---- うで（ひじ・手）----
    [-1, 1].forEach((s, i) => {
      const sh = G(torso, s * 0.24, 0.5, 0); if(i) P.shoulderR = sh; else P.shoulderL = sh;
      limb(sh, 0.07, 0.058, 0.28, LM ? LM.sleeve : coat, 0, 0, 0, { roughness:0.85 });
      const el = G(sh, 0, -0.28, 0); if(i) P.elbowR = el; else P.elbowL = el;
      limb(el, 0.06, 0.05, 0.24, LM ? LM.sleeve : coat, 0, 0, 0, { roughness:0.85 });
      S(el, 0.058, skin, 0, -0.27, 0.01, 0.9, 1.1, 1);                    // 手（ふっくら）
      if(i === 1 && !stranger){
        // 杖（右手の 中から 床まで。かぎ型の とって が 手に のる）
        P.cane = caneMesh(el); P.cane.position.set(0, -0.27, 0.035);
        // 茶わん（ごはんを食べるときだけ 見える）
        P.bowl = G(el, 0, -0.2, 0.07);
        riceBowl(P.bowl, 0, -0.04, 0);
        P.bowl.visible = false;
      }
    });
    // 依頼者が えらんだ 見た目（GrandpaFace.look の 形）：髪の形・髪の色・肌・めがね・服・マフラー
    P.setLook = L => {
      if(!LM || !L) return;
      LM.skin.color.set(L.skin); LM.skinDark.color.set(L.skinDark); LM.hair.color.set(L.hair); LM.cardigan.color.set(L.cardigan);
      LM.sleeve.color.set(L.coat === 'vest' ? '#F2EFE8' : L.cardigan);                    // ベストは そでが シャツ
      if(L.pants) LM.pants.color.set(L.pants);
      P.buttons.forEach(m => { m.visible = L.coat !== 'sweater' && L.coat !== 'jersey'; });
      P.coatParts.sweater.forEach(m => { m.visible = L.coat === 'sweater'; });
      P.coatParts.jersey.forEach(m => { m.visible = L.coat === 'jersey'; });
      Object.keys(P.hats).forEach(k => { P.hats[k].visible = L.hat === k; });
      if(L.scarf) LM.scarf.color.set(L.scarf);
      P.scarf.forEach(m => { m.visible = !!L.scarf; });
      const hs = L.hairStyle;
      [...P.hairTop, ...P.hairSide].forEach(m => { if(!m.userData.base) m.userData.base = { s:m.scale.clone(), p:m.position.clone() }; m.scale.copy(m.userData.base.s); m.position.copy(m.userData.base.p); });
      P.hairTop.forEach(m => { m.visible = (hs === 'full' || hs === 'long' || hs === 'short' || hs === 'buzz' || hs === 'curly') && !L.hat; if(hs === 'short') m.scale.y *= 0.78; if(hs === 'buzz') m.scale.y *= 0.42; if(hs === 'curly') m.scale.multiplyScalar(1.12); });
      P.hairSide.forEach((m, i) => {
        m.visible = hs !== 'none';
        if(hs === 'short' || hs === 'buzz') m.scale.multiplyScalar(hs === 'buzz' ? 0.62 : 0.78);
        if(hs === 'curly') m.scale.multiplyScalar(1.35);
        if(hs === 'long'){ if(i === 2){ m.scale.set(m.scale.x * 1.15, m.scale.y * 1.7, m.scale.z * 1.2); m.position.y -= 0.05; } else { m.scale.y *= 1.45; m.position.y -= 0.02; } }
      });
      P.glasses.forEach(m => { m.visible = L.glasses !== false; });
      if(P.face && P.face.rebuild) P.face.rebuild({ eye:L.eye, mouth:L.mouthKind, brow:L.brow, hair:L.hair });
    };
    g.visible = false;
    return P;
  }

  // ---------- 台所のもの（ろくろで ひいたような まるい うつわ・ごはん・野菜）----------
  // pts は [半径, 高さ] の 外がわの線（まるく 回して 作る）
  function lathe(parent, pts, color, x, y, z, o){
    const m = new T.Mesh(new T.LatheGeometry(pts.map(([r, h]) => new T.Vector2(r, h)), 32), mat(color, Object.assign({ side:T.DoubleSide }, o)));
    m.position.set(x || 0, y || 0, z || 0); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
  }
  function plate(parent, x, y, z, r){
    lathe(parent, [[0, 0], [r * 0.6, 0.004], [r, 0.02], [r * 0.96, 0.026]], '#FFFFFF', x, y, z, { roughness:0.3 });
  }
  function riceBowl(parent, x, y, z){
    lathe(parent, [[0, 0], [0.034, 0], [0.05, 0.035], [0.062, 0.08], [0.066, 0.09]], '#FFFFFF', x, y, z, { roughness:0.35 });
    lathe(parent, [[0, 0.07], [0.05, 0.075], [0.058, 0.09], [0.04, 0.13], [0, 0.145]], '#FFFDF7', x, y, z, { roughness:0.8 });   // ごはん（もりあがり）
  }
  function soupBowl(parent, x, y, z){
    lathe(parent, [[0, 0], [0.04, 0], [0.058, 0.04], [0.07, 0.085], [0.074, 0.095]], '#B3261E', x, y, z, { roughness:0.3 });
    Cy(parent, 0.066, 0.066, 0.004, '#8A4B2A', x, y + 0.083, z, 24);               // みそしる
  }
  function fish(parent, x, y, z){
    S(parent, 0.035, '#D9913F', x, y + 0.02, z, 2.6, 0.55, 1.0, { roughness:0.6 });   // 焼き魚のからだ
    Cy(parent, 0.0, 0.03, 0.03, '#C8772E', x - 0.1, y + 0.02, z, 4, 0, Math.PI / 2);  // しっぽ
    S(parent, 0.02, '#9BD27F', x + 0.05, y + 0.02, z + 0.07, 1.4, 0.7, 1.1);           // 青菜のつけあわせ
  }
  function chopsticks(parent, x, y, z, ry){
    const m = B(parent, 0.2, 0.008, 0.012, '#A0522D', x, y, z, 0.003); m.rotation.y = ry;
  }
  function potWithLid(parent, x, y, z){
    lathe(parent, [[0, 0], [0.09, 0], [0.1, 0.05], [0.1, 0.12], [0.095, 0.13]], '#C7CED8', x, y, z, { metalness:0.4, roughness:0.35 });
    lathe(parent, [[0, 0.13], [0.09, 0.13], [0.1, 0.138], [0.05, 0.155], [0.02, 0.16], [0, 0.163]], '#9AA6B4', x, y, z, { metalness:0.4, roughness:0.35 });
    S(parent, 0.012, '#333333', x, y + 0.168, z);                                      // ふたのつまみ
    [-1, 1].forEach(s => B(parent, 0.06, 0.02, 0.02, '#333333', x + s * 0.13, y + 0.1, z, 0.008));   // 取っ手
  }
  function kettle(parent, x, y, z){
    lathe(parent, [[0, 0], [0.07, 0], [0.078, 0.06], [0.07, 0.12], [0.04, 0.14], [0, 0.145]], '#F2F5F8', x, y, z, { metalness:0.3, roughness:0.3 });
    Cy(parent, 0.012, 0.03, 0.12, '#F2F5F8', x + 0.1, y + 0.08, z, 12, 0, -0.8);     // 注ぎ口
    const hd = new T.Mesh(new T.TorusGeometry(0.05, 0.008, 8, 16, Math.PI), MAT('#F2F5F8'));
    hd.position.set(x - 0.075, y + 0.07, z); hd.rotation.z = Math.PI / 2; parent.add(hd);   // 取っ手
  }
  // まないたの 上の 野菜（にんじん・キャベツ・ほうちょう）
  function vegetables(parent, x, y, z){
    Cy(parent, 0.004, 0.03, 0.16, '#F28C28', x - 0.05, y + 0.03, z, 10, 0, Math.PI / 2);   // にんじん
    S(parent, 0.05, '#9BD27F', x + 0.08, y + 0.05, z + 0.02, 1.2, 0.85, 1.2);             // キャベツ
    S(parent, 0.03, '#C9EBA8', x + 0.08, y + 0.075, z + 0.02, 1.1, 0.6, 1.1);             // キャベツの 芯がわ
    B(parent, 0.14, 0.006, 0.03, '#C7CED8', x - 0.02, y + 0.012, z + 0.1, 0.002, false, { metalness:0.5, roughness:0.3 });   // ほうちょう
  }
  function fruitBowl(parent, x, y, z){
    lathe(parent, [[0, 0], [0.05, 0.005], [0.1, 0.05], [0.115, 0.06]], '#7CC8F2', x, y, z, { roughness:0.4 });
    S(parent, 0.03, '#FF6B5B', x - 0.03, y + 0.07, z + 0.02); S(parent, 0.03, '#FFC857', x + 0.03, y + 0.075, z - 0.02); S(parent, 0.028, '#8BD17C', x, y + 0.1, z + 0.01);   // りんご・レモン・青いかき
  }
  // おじいさんの 食事（いすの 前の テーブルの 上。ごはん・みそしる・焼き魚）
  function mealSet(parent){
    plate(parent, -0.12, 0.785, 0.02, 0.1);
    fish(parent, -0.12, 0.8, 0.02);
    riceBowl(parent, -0.36, 0.785, -0.16);
    soupBowl(parent, -0.38, 0.785, 0.2);
    chopsticks(parent, -0.2, 0.79, -0.2, 0.3);
  }

  // 杖（取っ手が 上。棒は 下へ 0.85m。手に持つときも、そばに立てるときも 同じ形）
  function caneMesh(parent){
    const c = G(parent, 0, 0, 0);
    Cy(c, 0.011, 0.011, 0.85, '#8E6B49', 0, -0.425, 0, 8);
    const hook = new T.Mesh(new T.TorusGeometry(0.035, 0.009, 8, 16, Math.PI), MAT('#8E6B49'));
    hook.position.set(0.035, 0, 0); c.add(hook);
    return c;
  }
  // 杖を そばに立てておく場所（ねるとき：ベッドの よこ ／ 食べるとき：いすの よこ）
  function buildRestCanes(scene, refs){
    refs.restCane = { bed:caneMesh(scene), table:caneMesh(scene) };
    refs.restCane.bed.position.set(BED.x + 0.2, 0.85, BED.z + 0.95);
    refs.restCane.table.position.set(EAT_SEAT.x + 0.24, 0.85, EAT_SEAT.z + 0.7);      // いすの 前の かど（すわる人の よこ）
    refs.restCane.bed.visible = false; refs.restCane.table.visible = false;
  }
  // おんど計（居間の西の壁）。refs.setTemp(℃) で 水銀の高さと 数字が かわる
  function buildThermo(scene, refs){
    const W = 256, H = 420;
    const yOf = c => 340 - (c - 10) / 30 * 280;                  // 10℃ ＝ 下、40℃ ＝ 上
    const t = tex(W, H, (g, c) => {
      g.clearRect(0, 0, W, H);
      g.fillStyle = '#FFFFFF'; g.beginPath(); g.roundRect(6, 6, W - 12, H - 12, 22); g.fill();
      g.fillStyle = '#5B6B7B'; g.font = '700 26px "Yu Gothic UI",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('おんど計', W / 2, 30);
      g.strokeStyle = '#B9C4D0'; g.lineWidth = 6; g.beginPath(); g.roundRect(100, 50, 20, 300, 10); g.stroke();
      g.beginPath(); g.arc(110, 360, 26, 0, Math.PI * 2); g.stroke();
      g.fillStyle = c >= 30 ? '#E0443E' : '#F28B7F';
      g.fillRect(106, yOf(c), 8, 340 - yOf(c)); g.beginPath(); g.arc(110, 360, 20, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#7A8899'; g.font = '20px "Yu Gothic UI",sans-serif'; g.textAlign = 'left';
      for(const v of [10, 20, 30, 40]){ g.fillRect(126, yOf(v), 14, 2); g.fillText(v + '', 146, yOf(v)); }
      g.fillStyle = c >= 30 ? '#D7261E' : '#33475B'; g.font = '700 44px "Yu Gothic UI",sans-serif'; g.textAlign = 'center';
      g.fillText(c.toFixed(1) + '℃', W / 2, 400);
    });
    const g = G(scene, -4.9, 1.5, 2.2); g.rotation.y = Math.PI / 2;      // 壁に向けて かける（+x の向き）
    B(g, 0.52, 0.86, 0.03, '#8E6B49', 0, 0, 0, 0.01, false);
    const m = new T.Mesh(new T.PlaneGeometry(0.46, 0.76), new T.MeshStandardMaterial({ map:t, roughness:0.6 }));
    m.position.set(0, 0, 0.018); g.add(m);
    let shown = null;
    refs.setTemp = c => { if(c === shown) return; shown = c; t.redraw(c); };
    refs.setTemp(22);
  }

  // ---------- 全部つくる ----------
  function build(scene){
    const refs = { walls:[], wallSegs:[], windowMats:[], tvMat:null, roomLights:{}, setLock:null, robot:null, fan:null,
                   persona:null, intruder:null, door:null, lockLamp:null };
    scene.background = new T.Color('#BFE6FF');
    buildHouse(scene, refs);
    tree(scene, -7.2, -3.2, 1.3, 0.2); tree(scene, -7.6, 1.8, 1.1, 0.6); tree(scene, 7.0, -2.6, 1.4, 0.9);
    tree(scene, 7.4, 3.2, 1.2, 0.35); tree(scene, -2.5, 7.4, 1.0, 0.7); tree(scene, 6.4, 7.0, 0.9, 0.15); tree(scene, -6.5, 7.0, 1.2, 0.5);
    buildRobot(scene, refs);
    buildThermo(scene, refs);
    buildRestCanes(scene, refs);
    refs.persona = buildPerson(scene, 'grandpa');
    refs.intruder = buildPerson(scene, 'stranger');
    scene.add(refs.persona.group, refs.intruder.group);
    return refs;
  }
  // おじいさんを すわらせる／ねかせる／立たせる（関節の向きを きめる）
  function poseSit(P, sitting, dt){
    const k = Math.min(1, dt * 6);
    const target = sitting ? -Math.PI / 2 : 0;
    P.hipL.rotation.x += (target - P.hipL.rotation.x) * k;
    P.hipR.rotation.x += (target - P.hipR.rotation.x) * k;
    const kn = sitting ? Math.PI / 2 : 0;
    P.shinL.rotation.x += (kn - P.shinL.rotation.x) * k;
    P.shinR.rotation.x += (kn - P.shinR.rotation.x) * k;
  }

  global.TeamHome = {
    LAYOUT:{ ROOMS, DOORS, FOOT_AT, FRONT_DOOR, DOOR_HINGE, OUTSIDE, CHAPPY_AT, FAN_AT, SOFA_SEAT, EAT_SEAT, BED, CHAPPY_S, WALL_H, WALL_T, ROOM_ORDER, roomAt },
    build, poseSit, HEAD_R,
  };
})(window);
