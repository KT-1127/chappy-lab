/* チャッピーの3Dの体（仮想計測制御ラボの js/view3d.js から取り出したもの。見た目を同じにするため）
   ・makeChappy() で、白い頭・ネコ耳・洋なし形の体・りんごのしっぽのチャッピーを作る
   ・顔の画面（face.canvas）に描けば、チャッピーの画面の顔が変わる */
(function(global){
  'use strict';
  const T = THREE;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rnd = (a, b, k = 0) => { const s = Math.sin(a * 12.9898 + b * 78.233 + k * 37.719) * 43758.5453; return s - Math.floor(s); };
  function rrShape(w, h, r){
    const s = new T.Shape(), x = -w / 2, y = -h / 2;
    s.moveTo(x + r, y);
    s.lineTo(x + w - r, y); s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
    s.lineTo(x + w, y + h - r); s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
    s.lineTo(x + r, y + h); s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
    s.lineTo(x, y + r); s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
    return s;
  }
  // 角の丸い箱（幅 w・高さ h・奥行き d、中心が原点）
  function roundedBox(w, h, d, r){
    r = Math.min(r, w / 2, h / 2, d / 2) * 0.98;
    const b = r * 0.6;
    const geo = new T.ExtrudeGeometry(rrShape(w - 2 * b, d - 2 * b, Math.max(0.01, r - b)),
      { depth:Math.max(0.01, h - 2 * b), bevelEnabled:true, bevelThickness:b, bevelSize:b, bevelSegments:3, curveSegments:6 });
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, -(h - 2 * b) / 2, 0);
    return geo;
  }
  const std = (color, o) => new T.MeshStandardMaterial(Object.assign({ color, roughness:0.62 }, o));
  const toy = (color, o) => new T.MeshPhysicalMaterial(Object.assign({ color, roughness:0.42, clearcoat:0.6, clearcoatRoughness:0.3 }, o));
  function mesh(geo, material, x = 0, y = 0, z = 0, shadow = true){
    const m = new T.Mesh(geo, material); m.position.set(x, y, z);
    m.castShadow = shadow; m.receiveShadow = true; return m;
  }
  function group(x = 0, y = 0, z = 0){ const g = new T.Group(); g.position.set(x, y, z); return g; }
  const cyl = (rt, rb, h, seg = 20, axis) => {
    const g = new T.CylinderGeometry(rt, rb, h, seg);
    if(axis === 'x') g.rotateZ(Math.PI / 2); if(axis === 'z') g.rotateX(Math.PI / 2);
    return g;
  };
  function canvasTex(w, h, draw){
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4;
    t.redraw = (...a) => { draw(c.getContext('2d'), ...a); t.needsUpdate = true; };
    return t;
  }
  function roundRectPath(g, x, y, w, h, r){
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  const glowTex = canvasTex(128, 128, g => {
    const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,255,255,.55)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  });
  glowTex.redraw();
  const glowSprite = (color, size) => {
    const s = new T.Sprite(new T.SpriteMaterial({ map:glowTex, color, transparent:true, opacity:0,
                                                  blending:T.AdditiveBlending, depthWrite:false, toneMapped:false }));
    s.scale.set(size, size, 1); return s;
  };


  // ---------- チャッピー ----------
  // compass/src/components/chappy（Chappy.tsx とパーツ画像）の見た目を 3D にしたもの：
  // ネコ耳の白い頭・黒い画面の顔（水色の目と ω の口）・洋なし形の体・先にりんごがついたしっぽ
  const CP_TEAL = '#3AB7C2';
  const cpWhite = () => toy('#F1F9F7', { roughness:0.3, clearcoat:1, clearcoatRoughness:0.1, sheen:0.5, sheenColor:new T.Color('#D6F2F4') });

  // 顔の画面に貼る絵（mood: normal / blink / happy / ouch、look: 目を左右に動かす量）。
  // 目と口の位置・大きさは元のチャッピー（Chappy.tsx の EYES と口の線）を画面の大きさに合わせたもの
  function drawChappyFace(g, mood, look = 0){
    g.fillStyle = '#0B0F11'; g.fillRect(0, 0, 256, 176);
    const hl = g.createLinearGradient(0, 4, 0, 60);
    hl.addColorStop(0, 'rgba(255,255,255,.1)'); hl.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = hl; g.beginPath(); g.ellipse(84, 28, 64, 18, -0.1, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,.55)';                   // 左上の白い光（元の絵と同じ）
    g.beginPath(); g.ellipse(40, 28, 13, 7, -0.55, 0, Math.PI * 2); g.fill();
    g.strokeStyle = CP_TEAL; g.lineCap = 'round'; g.lineJoin = 'round';
    g.shadowColor = CP_TEAL; g.shadowBlur = 8;
    [[63, 82], [193, 84]].forEach(([x, y], i) => {
      x += look; g.beginPath();
      if(mood === 'happy'){ g.lineWidth = 9; g.moveTo(x - 17, y + 8); g.quadraticCurveTo(x, y - 24, x + 17, y + 8); g.stroke(); }
      else if(mood === 'blink'){ g.lineWidth = 8; g.moveTo(x - 15, y + 2); g.quadraticCurveTo(x, y + 13, x + 15, y + 2); g.stroke(); }
      else if(mood === 'ouch'){ const s = i ? -1 : 1; g.lineWidth = 9; g.moveTo(x - 13 * s, y - 15); g.lineTo(x + 12 * s, y); g.lineTo(x - 13 * s, y + 15); g.stroke(); }
      else {
        g.shadowBlur = 0;
        const gr = g.createLinearGradient(0, y - 26, 0, y + 26); gr.addColorStop(0, '#2FB0BF'); gr.addColorStop(1, '#168C9C');
        g.fillStyle = gr; g.ellipse(x, y, 15, 25, 0.06, 0, Math.PI * 2); g.fill();
        g.fillStyle = 'rgba(232,252,253,.85)';
        g.beginPath(); g.ellipse(x - 4.5, y - 13, 3.6, 4.8, -0.3, 0, Math.PI * 2); g.fill(); g.shadowBlur = 8;
      }
    });
    if(mood === 'happy'){                                   // ほっぺ
      g.shadowBlur = 0; g.fillStyle = 'rgba(255,125,160,.45)';
      [[44, 118], [212, 120]].forEach(([x, y]) => { g.beginPath(); g.ellipse(x + look, y, 14, 7, 0, 0, Math.PI * 2); g.fill(); });
      g.shadowBlur = 8;
    }
    const mx = 128 + look * 0.5, my = 121;                  // ω の口
    g.lineWidth = 7; g.beginPath();
    if(mood === 'ouch'){ g.moveTo(mx - 26, my + 8); for(let i = 1; i <= 6; i++) g.lineTo(mx - 26 + i * 9, my + 8 + (i % 2 ? -7 : 0)); }
    else {
      g.moveTo(mx - 28, my);
      g.bezierCurveTo(mx - 26, my + 12, mx - 18, my + 15, mx - 12, my + 14);
      g.bezierCurveTo(mx - 5, my + 13, mx - 1, my + 9, mx, my + 6);
      g.bezierCurveTo(mx + 3, my + 10, mx + 8, my + 15, mx + 15, my + 15);
      g.bezierCurveTo(mx + 22, my + 15, mx + 28, my + 11, mx + 30, my);
    }
    g.stroke(); g.shadowBlur = 0;
  }

  // 頭は「超楕円体」：|x/a|^n + |y/b|^n + |z/c|^n = 1。n=3 で全体がぷっくりした角の丸い四角になる。
  // 元の絵と同じく、下の方を少しだけ細くする（taper）
  const HEAD = { a:35, b:27, c:24.5, n:3, taper:0.07 };
  const headA = y => HEAD.a * (1 - HEAD.taper * Math.max(0, -y / HEAD.b));
  function superEllipsoid(){
    const geo = new T.SphereGeometry(1, 72, 54), p = geo.attributes.position, n = HEAD.n;
    for(let i = 0; i < p.count; i++){
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const k = Math.pow(Math.abs(x) ** n + Math.abs(y) ** n + Math.abs(z) ** n, 1 / n) || 1;
      const yy = y / k * HEAD.b;
      p.setXYZ(i, x / k * headA(yy), yy, z / k * HEAD.c);
    }
    geo.computeVertexNormals();
    return geo;
  }
  // 頭の前の曲面にぴったり沿う画面（形は角の丸い四角＝スーパー楕円、中心から輪を重ねて作る）
  function screenCap(sa, sb, oy){
    const R = 16, A = 96, pos = [], uv = [], idx = [];
    const zOn = (x, y) => HEAD.c * Math.pow(Math.max(0, 1 - Math.abs(x / headA(y)) ** HEAD.n - Math.abs(y / HEAD.b) ** HEAD.n), 1 / HEAD.n) + 0.25;
    pos.push(0, oy, zOn(0, oy)); uv.push(0.5, 0.5);
    for(let i = 1; i <= R; i++) for(let j = 0; j < A; j++){
      const t = j / A * Math.PI * 2, c = Math.cos(t), s = Math.sin(t), r = i / R;
      const x = sa * r * Math.sign(c) * Math.sqrt(Math.abs(c)), y = oy + sb * r * Math.sign(s) * Math.sqrt(Math.abs(s));
      pos.push(x, y, zOn(x, y)); uv.push(x / (2 * sa) + 0.5, (y - oy) / (2 * sb) + 0.5);
    }
    for(let j = 0; j < A; j++) idx.push(0, 1 + j, 1 + (j + 1) % A);
    for(let i = 1; i < R; i++) for(let j = 0; j < A; j++){
      const a0 = 1 + (i - 1) * A + j, a1 = 1 + (i - 1) * A + (j + 1) % A;
      idx.push(a0, a0 + A, a1 + A, a0, a1 + A, a1);
    }
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx); geo.computeVertexNormals();
    return geo;
  }
  // ネコ耳の形（compass の earL / earR と同じ）：内がわはゆるい坂、外がわはほぼまっすぐで、先は外寄りで丸い。
  // s = 1 が右耳、-1 が左耳（左右反対の形）
  function earPath(path, s, inner){
    const X = x => x * s * 1.45;
    if(inner){
      path.moveTo(X(-9.2), 3);
      path.bezierCurveTo(X(-6.6), 9, X(-2.6), 15.6, X(1.6), 21.4);
      path.quadraticCurveTo(X(3.6), 23.6, X(5.2), 21.2);
      path.bezierCurveTo(X(6.6), 15, X(7.2), 9, X(7), 2.6);
      path.quadraticCurveTo(X(-1), 1.2, X(-9.2), 3);
    } else {
      path.moveTo(X(-14), 0);
      path.bezierCurveTo(X(-10.5), 8, X(-4.5), 17.5, X(1.6), 25.6);
      path.quadraticCurveTo(X(4), 29.4, X(6.4), 25.8);
      path.bezierCurveTo(X(8.6), 19, X(10.2), 10, X(10), 0);
      path.quadraticCurveTo(X(-2), -3, X(-14), 0);
    }
    return path;
  }
  function chappyEar(s, white){
    const ear = group(s * 18.5, 13, -3); ear.rotation.set(-0.05, 0, -s * 0.12);
    // 耳の本体（うらがわは先に行くほどうすくなる）
    const body = new T.ExtrudeGeometry(earPath(new T.Shape(), s), { depth:5, bevelEnabled:true, bevelThickness:2, bevelSize:1.6, bevelSegments:4, curveSegments:14 });
    body.translate(0, 0, -4.5);
    const p = body.attributes.position;
    for(let i = 0; i < p.count; i++){ const z = p.getZ(i); if(z < 0) p.setZ(i, z * (1 - 0.5 * clamp(p.getY(i) / 28, 0, 1))); }
    body.computeVertexNormals();
    ear.add(mesh(body, white));
    // 白いふち（内がわの水色が少しへこんで見える）
    const rimShape = earPath(new T.Shape(), s); rimShape.holes.push(earPath(new T.Path(), s, true));
    const rim = new T.ExtrudeGeometry(rimShape, { depth:1.4, bevelEnabled:true, bevelThickness:0.5, bevelSize:0.35, bevelSegments:2, curveSegments:14 });
    ear.add(mesh(rim, white, 0, 0, 3, false));
    // 内がわの水色（上が明るく、下が少し濃い）
    const grad = canvasTex(4, 64, g => { const r = g.createLinearGradient(0, 0, 0, 64); r.addColorStop(0, '#86CCD8'); r.addColorStop(1, '#3F98AA'); g.fillStyle = r; g.fillRect(0, 0, 4, 64); });
    grad.redraw(); grad.repeat.set(1, 1 / 24);
    ear.add(mesh(new T.ShapeGeometry(earPath(new T.Shape(), s, true), 14), std('#FFFFFF', { map:grad, roughness:0.5 }), 0, 0, 2.6, false));
    return ear;
  }

  // 頭（幅70・高さ54・奥行き49、中心が原点、顔は +z 向き）
  function chappyHead(white){
    const g = new T.Group();
    g.add(mesh(superEllipsoid(), white));
    const face = canvasTex(256, 176, drawChappyFace); face.redraw('normal', 0);
    const screenMat = new T.MeshPhysicalMaterial({ map:face, emissiveMap:face, emissive:'#FFFFFF', emissiveIntensity:0.35,
                                                   roughness:0.18, clearcoat:1, clearcoatRoughness:0.05 });
    g.add(mesh(screenCap(27.3, 19.2, -1.5), screenMat, 0, 0, 0, false));
    const ears = [-1, 1].map(s => { const e = chappyEar(s, white); g.add(e); return e; });
    return { g, face, ears };
  }

  // しっぽの先のりんご
  function apple(r, mat){
    const g = new T.Group();
    const body = mesh(new T.SphereGeometry(r, 24, 18), mat); body.scale.set(1, 0.9, 1); g.add(body);
    g.add(mesh(cyl(r * 0.1, r * 0.12, r * 0.7, 6), std('#6B4423'), 0, r * 0.95, 0));
    const leaf = mesh(new T.SphereGeometry(r * 0.45, 12, 8), std('#4A9628', { roughness:0.5 }), r * 0.35, r * 1.05, 0, false);
    leaf.scale.set(1.5, 0.28, 0.75); leaf.rotation.z = 0.5; g.add(leaf);
    return g;
  }
  // しっぽ（先に行くほど少し細い）
  function tailTube(points, r0, r1, white){
    const curve = new T.CatmullRomCurve3(points.map(p => new T.Vector3(...p)));
    const seg = 56, rad = 10, geo = new T.TubeGeometry(curve, seg, r0, rad, false);
    const p = geo.attributes.position, c = new T.Vector3(), v = new T.Vector3();
    for(let i = 0; i <= seg; i++){
      curve.getPointAt(i / seg, c); const k = (r0 + (r1 - r0) * i / seg) / r0;
      for(let j = 0; j <= rad; j++){ const n = i * (rad + 1) + j; v.fromBufferAttribute(p, n).sub(c).multiplyScalar(k).add(c); p.setXYZ(n, v.x, v.y, v.z); }
    }
    geo.computeVertexNormals();
    return { mesh:mesh(geo, white), end:curve.getPointAt(1) };
  }

  // 立っているチャッピー（高さ約110、足もとが原点、顔は +z 向き）
  function makeChappy(){
    // 大きさは元の絵の比率どおり：頭の幅70 に対して胴の幅37、頭:首から下 ＝ 1.35:1
    const white = cpWhite(), g = new T.Group(), all = new T.Group(); g.add(all);
    const legs = [-1, 1].map(s => {
      const leg = group(s * 7.4, 14, 0);                   // 足のつけ根を中心に前後にふる
      leg.add(mesh(new T.CapsuleGeometry(7, 3, 8, 16), white, 0, -5.5, 0));
      const foot = mesh(new T.SphereGeometry(7.8, 24, 16), white, s * 0.6, -10.6, 1.8); foot.scale.set(1, 0.52, 1.25); leg.add(foot);
      all.add(leg); return leg;
    });
    // 胴（洋なし形：下がふっくら、上が細い）
    const prof = [[0.01, 0], [13, 0.6], [17.6, 4], [19.4, 11.5], [19, 20], [17, 27], [12.5, 32], [6.5, 34], [0.01, 34.5]]
      .map(([r, y]) => new T.Vector2(r, y));
    const torso = mesh(new T.LatheGeometry(prof, 48), white, 0, 9.5, 0); torso.scale.z = 0.86; all.add(torso);
    const arms = [-1, 1].map(s => {
      const a = group(s * 17, 38.5, 0.5); a.rotation.z = s * 0.26;
      a.add(mesh(new T.CapsuleGeometry(6.2, 11, 8, 14), white, 0, -9.5, 0.6)); all.add(a); return a;
    });
    // しっぽ：おしりから体の横へ回って、上へのびる。先に大きなりんご
    const tail = group(2, 20, -10); all.add(tail);
    const t = tailTube([[0, 0, 0], [8, -5, -9], [24, -6, -12], [38, 3, -9], [43, 24, -6], [41, 48, -4], [39, 62, -4]], 2.3, 1.75, white);
    tail.add(t.mesh);
    const ap = apple(10.5, toy('#E2432F', { roughness:0.28, clearcoat:0.8 })); ap.position.copy(t.end).add(new T.Vector3(0, 9, 0)); tail.add(ap);
    const head = chappyHead(white); head.g.position.set(0, 64, 0); all.add(head.g);
    // ぶつかったときに頭の上を回る星
    const star = new T.Shape();
    for(let i = 0; i < 10; i++){ const r = i % 2 ? 2.6 : 6, a = i / 10 * Math.PI * 2 + Math.PI / 2; i ? star.lineTo(Math.cos(a) * r, Math.sin(a) * r) : star.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
    const starGeo = new T.ExtrudeGeometry(star, { depth:1.8, bevelEnabled:false }); starGeo.center();
    const starMat = std('#FFD23F', { emissive:'#FFB800', emissiveIntensity:0.9 });
    const stars = group(0, 112, 0); stars.visible = false;
    for(let i = 0; i < 3; i++){ const a = i * Math.PI * 2 / 3; stars.add(mesh(starGeo, starMat, Math.cos(a) * 22, 0, Math.sin(a) * 22, false)); }
    all.add(stars);
    let blink = 2 + Math.random() * 2, key = '';
    // s: { mood, wave, jump, walk, hurt（ぶつかってからの残り秒数）}
    function update(time, dt, s){
      const hurt = s.hurt || 0, walk = s.walk ? 1 : 0, ph = time * 9;
      blink -= dt; if(blink < -0.14) blink = 2 + Math.random() * 2.5;
      const mood = hurt > 0 ? 'ouch' : s.mood !== 'normal' ? s.mood : blink < 0 ? 'blink' : 'normal';
      if(mood !== key){ key = mood; head.face.redraw(mood, 0); }
      // いたいアクション：のけぞって頭をおさえ、頭の上を星が回る
      const k = hurt > 0 ? Math.min(1, (2.4 - hurt) / 0.18, hurt / 0.5) : 0;
      all.position.set(0, (s.jump ? Math.abs(Math.sin(time * 7)) * 22 : 0) + walk * Math.abs(Math.sin(ph)) * 1.6, -8 * k);
      all.rotation.x = -0.42 * k;
      all.scale.y = 1 + Math.sin(time * 1.8) * 0.015;
      tail.rotation.y = Math.sin(time * (walk ? 6 : 1.8)) * 0.12;
      head.g.rotation.z = Math.sin(time * 0.9) * 0.05 + Math.sin(time * 28) * 0.16 * k;
      head.ears.forEach((e, i) => { e.rotation.x = -0.05 + (Math.sin(time * 3 + i) > 0.97 ? -0.25 : 0); });
      legs.forEach((l, i) => { l.rotation.x = walk * Math.sin(ph + i * Math.PI) * 0.55; });
      arms.forEach((a, i) => {
        let z = 0.26, x = walk * Math.sin(ph + (1 - i) * Math.PI) * 0.5;
        if(i === 1 && s.wave) z = 2.3 + Math.sin(time * 10) * 0.35;
        if(s.jump) z = 2.3 + Math.sin(time * 10 + i) * 0.3;
        if(k > 0){ z = 0.26 + 2.5 * k; x = -0.5 * k; }
        a.rotation.set(x, 0, (i ? 1 : -1) * z);
      });
      stars.visible = k > 0.05;
      if(stars.visible){ stars.rotation.y = time * 6; stars.scale.setScalar(0.5 + 0.5 * k); }
    }
    return { g, update, headTop:112, face:head.face };
  }

  global.Chappy3D = { makeChappy, roundedBox, std, toy, mesh, group, cyl, canvasTex };
})(window);
