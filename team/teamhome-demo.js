/* チャッピーのいえ（試作）：依頼者ページの「チャッピーができること」（ボタンを押すと 家の中で 見せる）
   ・プログラムは使わない。「おじいさんの動き」と「それに応じたチャッピーの反応」を、見せるための台本
   ・台本の中の反応（しゃべる・顔・LED・ファン・メール）は 見本として決まった動き。本物の反応は 開発者が プログラムで決める
   ・おじいさん・知らない人・カギ・電気・おんど計は、家の中の本物のルール（同じ仕組み）で動く
   ・cap：チャッピーが できること の 名前（ボタンの 上に 出す）
   ・event の書き方：
     m：時刻（分。例 480 ＝ 8:00）
     narr：画面の下に出す説明（おじいさんの 言葉も ここに 書く）
     speech / face / led（ledMin 分つける）/ fan（fanMin 分まわす）：チャッピーの反応（見本）
     mail：家族の スマホに メールを 送る（見本の 文）
     lock：true ＝ 玄関のかぎを かける ／ false ＝ あける
     intruder：'come' ＝ 知らない人が 来る ／ 'leave' ＝ 外へ出て いく
     light：{ room, on }：おじいさんが 部屋の電気を つける・消す
     when：'intruderInside' ＝ 知らない人が 家の中に入るまで、待ってから 出す */
(function(global){
  'use strict';
  const T = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

  const SCENES = [
    {
      cap:'話す',
      title:'決めた言葉を 話す',
      what:'チャッピーが、決めた言葉を 話す。（おじいさんに あいさつする）',
      start:600, end:640,
      day:[
        { m:600, act:'go', room:'居間', light:'keep', text:'居間にいる' },
      ],
      events:[
        { m:610, narr:'チャッピーが あいさつする。', speech:'こんにちは。今日も 元気ですか？', face:'happy' },
      ],
    },
    {
      cap:'会話',
      title:'おじいさんと 話す（AIの やりとり）',
      what:'おじいさんの 話に、チャッピーが 答える。（AIの 答えは 見本の 例）',
      start:600, end:650,
      day:[
        { m:600, act:'go', room:'居間', light:'keep', text:'居間にいる' },
      ],
      events:[
        { m:610, narr:'おじいさん：「今日は 暑いねえ」', speech:'本当ですね。お水を 飲みましょうか？', face:'smile' },
        { m:625, narr:'おじいさん：「そうしようかね」' },
        { m:630, narr:'チャッピー：「ゆっくり 休んでくださいね」', speech:'ゆっくり 休んでくださいね', face:'smile' },
      ],
    },
    {
      cap:'動く',
      title:'首を ふって 風を 送る（サーボ）',
      what:'チャッピーの 頭が 左右に 動いて、ファンで おじいさんの方へ 風を 送る。（サーボモーターで 動く）',
      start:830, end:900,
      day:[
        { m:830, act:'go', room:'居間', light:'keep', text:'居間で 休む' },
      ],
      events:[
        { m:840, narr:'チャッピーが 首を ふって 風を 送る。', speech:'風を 送りますね', face:'smile', fan:true, fanMin:40 },
      ],
    },
    {
      cap:'人を検知',
      title:'朝の あいさつ（人を 見つけて 話す）',
      what:'おじいさんが 朝6時に おきる。チャッピーが あいさつすると、おじいさんは 返事をして チャッピーの ところへ行き、そのあと 台所へ行く。',
      start:350, end:440,
      day:[
        { m:0, act:'sleep', room:'寝室', light:'keep', text:'ねている' },
        { m:360, act:'wake', room:'寝室', light:'keep', text:'おきる' },
        { m:368, act:'go', room:'居間', light:'keep', text:'チャッピーの ところへ' },
        { m:410, act:'go', room:'台所', light:'keep', text:'朝ごはんの 準備' },
      ],
      events:[
        { m:362, narr:'6時。おじいさんが ベッドから おきる。' },
        { m:376, narr:'チャッピーが 人を 見つけて、あいさつする。', face:'happy', speech:'おはようございます！', led:true, ledMin:3 },
        { m:392, narr:'おじいさん：「おはよう。今日も 元気だよ」' },
      ],
    },
    {
      cap:'人を検知',
      title:'知らない人が 来る（留守番）',
      what:'おじいさんが 外出中に、知らない人が 玄関に来る。チャッピーが しゃべると、知らない人は にげていく。',
      start:500, end:840,
      day:[
        { m:500, act:'go', room:'居間', light:'keep', text:'居間にいる' },
        { m:540, act:'out', lock:'open', text:'おでかけ' },
      ],
      events:[
        { m:540, narr:'おじいさんが 外へ出る。家には チャッピーだけ。' },
        { m:610, narr:'知らない人が 玄関に 来た。', intruder:'come', when:'away' },
        { m:600, narr:'チャッピーが 家の中の人に気づき、しゃべる。', when:'intruderInside', speech:'だれですか？', face:'surprised' },
        { m:665, narr:'知らない人は びっくりして、外へ にげていく。' },
      ],
    },
    {
      cap:'かぎ',
      title:'カギを かけると 入れない',
      what:'おじいさんが 出かけるとき、玄関のかぎを かける。知らない人は、かぎが かかっていると 入れない。',
      start:500, end:660,
      day:[
        { m:500, act:'go', room:'居間', light:'keep', text:'居間にいる' },
        { m:540, act:'out', lock:'lock', text:'おでかけ（かぎを かける）' },
      ],
      events:[
        { m:545, narr:'おじいさんが 外に出て、玄関のかぎを かけた。' },
        { m:610, narr:'知らない人が 玄関に 来た。', intruder:'come', when:'away' },
      ],
    },
    {
      cap:'電気',
      title:'電気の消し忘れを 知らせる',
      what:'おじいさんが 居間の電気を つけたまま 寝室で ねる。チャッピーが 知らせると、おじいさんは 居間にもどって 電気を 消す。',
      start:1220, end:1440,
      day:[
        { m:1230, act:'go', room:'居間', light:'keep', text:'居間で テレビを見る' },
        { m:1300, act:'sleep', room:'寝室', light:'keep', text:'ねる' },
        { m:1380, act:'go', room:'居間', light:'off', text:'居間の電気を 消す' },
      ],
      events:[
        { m:1285, narr:'おじいさんが 居間の電気を つける。', light:{ room:'居間', on:true } },
        { m:1300, narr:'おじいさんは 寝室で ねむる。居間の電気は つけたまま。' },
        { m:1365, narr:'電気を 消し忘れたまま。チャッピーが 知らせる。', speech:'居間の電気が ついていますよ', face:'worried', led:true, ledMin:3 },
        { m:1380, narr:'おじいさんが 居間にもどって、電気を 消す。' },
      ],
    },
    {
      cap:'時間',
      title:'薬の時間を 知らせる',
      what:'8時に、チャッピーが 薬の時間を 知らせる。おじいさんが のんだら、チャッピーも 気づく。',
      start:470, end:540,
      day:[
        { m:470, act:'go', room:'台所', light:'keep', text:'台所へ' },
        { m:490, act:'go', room:'居間', light:'keep', text:'居間へ' },
      ],
      events:[
        { m:480, narr:'8時。チャッピーが 薬の時間を 知らせる。', speech:'お薬の時間ですよ', face:'happy', led:true, ledMin:2 },
        { m:520, narr:'おじいさんが 薬を のんだ。チャッピーも 気づく。', speech:'お薬をのみましたね', face:'happy' },
      ],
    },
    {
      cap:'時間',
      title:'曜日で 知らせる（ごみの日）',
      what:'決めた 曜日の 朝に、チャッピーが 知らせる。（見本は 水曜日の 朝）',
      start:480, end:520,
      day:[
        { m:480, act:'go', room:'台所', light:'keep', text:'台所にいる' },
      ],
      events:[
        { m:490, narr:'水曜日の 朝。チャッピーが ごみの日を 知らせる。', speech:'今日は ごみを 出す日ですよ', face:'smile' },
      ],
    },
    {
      cap:'温度',
      title:'暑さを 知らせる（おんど計）',
      what:'おんど計が 30℃を こえたら、チャッピーが 知らせて ファンを まわし続ける。（扇風機では 部屋の温度は 下がらない）',
      start:700, end:960,
      day:[
        { m:700, act:'go', room:'居間', light:'keep', text:'居間にいる' },
      ],
      events:[
        { m:760, narr:'おんど計が だんだん 上がってきた。' },
        { m:800, narr:'30℃を こえた。チャッピーが 知らせて、ファンを まわし続ける。', speech:'暑いですね。ファンを まわしますね', face:'worried', fan:true, fanMin:160 },
      ],
    },
    {
      cap:'メール',
      title:'家族に メールを 送る（いつでも）',
      what:'チャッピーは いつでも 家族の スマホに メールを 送れます。（見本は 8時に 居間の人感センサが 反応しないとき）',
      start:420, end:500,
      day:[
        { m:0, act:'sleep', room:'寝室', light:'keep', text:'ベッドで ねている' },
      ],
      events:[
        { m:440, narr:'おじいさんは ベッドで ねたまま。' },
        { m:480, narr:'8時。居間の人感センサに 反応がない。チャッピーが 家族に メールを 送る。', mail:'8時になっても 居間に 人の動きが ありません' },
      ],
    },
    {
      cap:'防犯',
      title:'出かけるときは 見はり（ボタン・カメラ・しゃべる）',
      what:'おじいさんが 出かけるときに 赤ボタンを押すと、チャッピーが カメラを つけて おじいさんのスマホに 家の映像を 送る。人が来たら「侵入者発見！」と しゃべる。',
      start:520, end:700,
      day:[
        { m:520, act:'go', room:'居間', light:'keep', text:'居間にいる' },
        { m:540, act:'out', lock:'open', text:'おでかけ（赤ボタンを押す）' },
      ],
      events:[
        { m:540, narr:'おじいさんが 赤ボタンを 押して 出かける。チャッピーが カメラを つけて、おじいさんのスマホに 映像を 送る。', camera:true, mailTo:'grandpa', speech:'見はりを はじめます' },
        { m:610, narr:'知らない人が 玄関から 入ってきた。', intruder:'come', when:'away' },
        { m:600, narr:'知らない人が 居間に 入り、チャッピーの カメラに うつった。チャッピーが しゃべり、おじいさんのスマホにも 知らせる。', when:'intruderSeen', speech:'侵入者発見！', face:'surprised', mail:'家の中に 知らない人が います（カメラを 見てください）', mailTo:'grandpa' },
      ],
    },
    {
      cap:'かぎ',
      title:'かぎの かけ忘れを おじいさんの スマホに 知らせる',
      what:'家に だれもいないのに 玄関のかぎが あいていたら、おじいさんの スマホに メール。おじいさんは もどって かぎを かけ、また 出かける。',
      start:520, end:700,
      day:[
        { m:520, act:'go', room:'居間', light:'keep', text:'居間にいる' },
        { m:540, act:'out', lock:'open', text:'おでかけ（かぎを かけ忘れる）' },
      ],
      events:[
        { m:570, narr:'家に だれもいない。でも 玄関の かぎが あいている。チャッピーが おじいさんの スマホに 知らせる。', when:'away', mail:'玄関の かぎが あいたままです', mailTo:'grandpa' },
      ],
    },
  ];

  // 家の ルール（📖）の 見本。key で よぶ（teamhome-check.js の RULES の demos）。できること の 見本も key で 使える
  //   hear：しゃべった ことばを おじいさんが 本当に 聞く（聞いて 動く） ／ phone：スマホを ひらく
  //   rate：この 見本だけ 速く ／ pane：右の タブを きりかえる
  SCENES.find(s => s.title === '知らない人が 来る（留守番）').key = 'intr_speak';
  SCENES.find(s => s.title === 'カギを かけると 入れない').key = 'intr_lock';
  const RULE_SCENES = [
    {
      key:'intr_open', cap:'ルール', title:'かぎが あいていると、知らない人が 入ってくる',
      what:'おじいさんが かぎを かけずに 出かける。しばらくすると 知らない人が 来て、家に 入ってくる。',
      start:530, end:640,
      day:[
        { m:500, act:'go', room:'居間', light:'keep', text:'居間にいる' },
        { m:540, act:'out', lock:'open', text:'おでかけ（かぎを かけない）' },
      ],
      events:[
        { m:542, narr:'おじいさんが かぎを かけずに 出かけた。🔓 あいたまま。', when:'away' },
        { m:575, narr:'知らない人が 玄関に 来た。', intruder:'come', when:'away' },
        { m:576, narr:'かぎが あいているので 入ってきた。このまま 居間に 45分 いる。', when:'intruderInside' },
      ],
    },
    {
      key:'temp_day', cap:'ルール', title:'一日の 温度',
      what:'朝から 夜まで、温度が どう かわるか 見よう（右上の 🌡）。',
      start:360, end:1140, rate:30,
      day:[
        { m:0, act:'sleep', room:'寝室', light:'keep', text:'ねている' },
        { m:360, act:'wake', room:'寝室', light:'keep', text:'おきる' },
        { m:390, act:'sit', room:'居間', light:'keep', text:'ソファで すごす' },
      ],
      events:[
        { m:362, narr:'朝6時：22℃。すずしい。' },
        { m:540, narr:'9時：25℃。' },
        { m:720, narr:'12時：29℃。だんだん 暑く なる。' },
        { m:760, narr:'12時40分ごろ：30℃を こえた！ 🔥' },
        { m:840, narr:'14時：32℃。いちばん 暑い。' },
        { m:990, narr:'16時半ごろ：30℃より 下がった。' },
        { m:1080, narr:'18時：27℃。外が 暗く なる。' },
      ],
    },
    {
      key:'light_stay', cap:'ルール', title:'部屋を 出ても、電気は ついたまま',
      what:'夜、居間で 電気を つけて すごした おじいさんが 寝室へ 行く。居間の 電気は ひとりでには 消えない。',
      start:1190, end:1330,
      day:[
        { m:1180, act:'sit', room:'居間', light:'keep', text:'テレビを 見る' },
        { m:1260, act:'sleep', room:'寝室', light:'off', text:'ねる' },
      ],
      events:[
        { m:1192, narr:'夜。おじいさんが 居間の 電気を つけて テレビを 見ている。', light:{ room:'居間', on:true } },
        { m:1262, narr:'寝室へ 行って ねる。居間の 電気は… ついたまま！' },
      ],
    },
    {
      key:'light_tell', cap:'ルール', title:'チャッピーが 知らせると、おじいさんが 消しに 来る',
      what:'チャッピーは 電気を 消せない。居間の 電気が ついていると 知らせると、おじいさんが 居間に 来て 消す。',
      start:1190, end:1360,
      day:[
        { m:1180, act:'sit', room:'居間', light:'keep', text:'テレビを 見る' },
        { m:1260, act:'sleep', room:'寝室', light:'off', text:'ねる' },
      ],
      events:[
        { m:1192, narr:'夜。おじいさんが 居間の 電気を つけて テレビを 見ている。', light:{ room:'居間', on:true } },
        { m:1262, narr:'寝室へ 行って ねる。居間の 電気は ついたまま。' },
        { m:1290, narr:'チャッピーが 知らせる → おじいさんが 居間に 来て、電気を 消す。', speech:'居間の 電気が ついていますよ', face:'worried', hear:true },
      ],
    },
    {
      key:'voice_in', cap:'ルール', title:'家の中なら、チャッピーの 声が とどく',
      what:'チャッピーが「お薬の 時間ですよ」と 言うと、おじいさんは 台所へ 行って 薬を のみ、また ソファに もどる。',
      start:470, end:530,
      day:[
        { m:460, act:'sit', room:'居間', light:'keep', text:'ソファで すごす' },
      ],
      events:[
        { m:480, narr:'8時。チャッピーが 声で 知らせる → おじいさんに とどいた。', speech:'お薬の 時間ですよ', face:'happy', hear:true },
      ],
    },
    {
      key:'mail_out', cap:'ルール', title:'外には 声は とどかない。メールなら とどく',
      what:'出かけている おじいさんには、声は とどかない。おじいさんの スマホに メールすると、もどって 外から かぎを かける。',
      start:530, end:640,
      day:[
        { m:500, act:'go', room:'居間', light:'keep', text:'居間にいる' },
        { m:540, act:'out', lock:'open', text:'おでかけ（かぎを かけ忘れる）' },
      ],
      events:[
        { m:555, narr:'チャッピーが 声で 言っても… 外の おじいさんには とどかない。', speech:'かぎが あいていますよ', face:'worried', hear:true, when:'away' },
        { m:580, narr:'こんどは おじいさんの スマホに 📧 メール → もどって かぎを かける。', mail:'玄関の かぎが あいていますよ', mailTo:'grandpa', phone:'grandpa', when:'away' },
      ],
    },
    // おじいさんが できること（チームのページの「👴 おじいさんが できること」）。チャッピーが 言うと、おじいさんが 本当に 聞いて 動く
    {
      key:'able_lock', cap:'できること', title:'言われると、かぎを かける',
      what:'玄関の かぎが あいている。チャッピーが「かぎ」と 言うと、おじいさんが 玄関へ 行って かける。',
      start:535, end:590,
      day:[ { m:520, act:'go', room:'居間', light:'keep', text:'居間に いる' } ],
      events:[
        { m:536, narr:'玄関の かぎが あいている…', lock:false },
        { m:545, narr:'チャッピーが 知らせる → おじいさんが 玄関で かぎを かける。', speech:'かぎが あいていますよ', face:'worried', hear:true },
      ],
    },
    {
      key:'able_water', cap:'できること', title:'言われると、水を のむ',
      what:'暑い 昼。チャッピーが「水を のんでね」と 言うと、おじいさんが 台所で 水を のみ、ソファに もどる。',
      start:775, end:830,
      day:[ { m:760, act:'sit', room:'居間', light:'keep', text:'ソファで 休む' } ],
      events:[
        { m:776, narr:'暑い 昼。おじいさんは ソファで 休んでいる。' },
        { m:785, narr:'チャッピーが「水を のんでね」→ 台所で 水を のむ。', speech:'暑いので 水を のんでね', face:'happy', hear:true },
      ],
    },
    {
      key:'able_eat', cap:'できること', title:'言われると、ごはんを 食べる',
      what:'お昼。チャッピーが「ごはんですよ」と 言うと、おじいさんが 台所で ごはんを 食べる。',
      start:705, end:760,
      day:[ { m:690, act:'sit', room:'居間', light:'keep', text:'ソファで すごす' } ],
      events:[
        { m:706, narr:'お昼。おじいさんは ごはんを わすれて いる…' },
        { m:720, narr:'チャッピーが「ごはんですよ」→ 台所で 食べる。', speech:'お昼ごはんの 時間ですよ', face:'happy', hear:true },
      ],
    },
    {
      key:'able_sleep', cap:'できること', title:'言われると、ねる',
      what:'夜。テレビに 夢中の おじいさん。チャッピーが「ねる 時間ですよ」と 言うと、ベッドで ねる。',
      start:1255, end:1310,
      day:[ { m:1240, act:'sit', room:'居間', light:'keep', text:'テレビを 見る' } ],
      events:[
        { m:1256, narr:'夜。おじいさんは テレビに 夢中…', light:{ room:'居間', on:true } },
        { m:1270, narr:'チャッピーが「ねる 時間ですよ」→ ベッドで ねる。', speech:'そろそろ ねる 時間ですよ', face:'happy', hear:true },
      ],
    },
    {
      key:'able_wake', cap:'できること', title:'言われると、おきる',
      what:'朝。まだ ねている おじいさんに、チャッピーが「おはよう」と 言うと、おきる。',
      start:415, end:455,
      day:[ { m:0, act:'sleep', room:'寝室', light:'keep', text:'ねている' } ],
      events:[
        { m:416, narr:'朝。おじいさんは まだ ねている…' },
        { m:425, narr:'チャッピーが「おはよう」→ おじいさんが おきる。', speech:'おはようございます。起きる 時間ですよ', face:'happy', hear:true },
      ],
    },
    {
      key:'sense', cap:'ルール', title:'チャッピーに わかること（センサー）',
      what:'おじいさんが 部屋を 動くと、チャッピーの センサーが かわる。右の 表を 見よう。',
      start:1075, end:1220, pane:'chappy',
      day:[
        { m:1070, act:'sit', room:'居間', light:'keep', text:'ソファ' },
        { m:1090, act:'go', room:'台所', light:'on', text:'台所へ' },
        { m:1140, act:'go', room:'寝室', light:'on', leave:'off', text:'寝室へ' },
        { m:1190, act:'go', room:'居間', light:'on', leave:'off', text:'居間へ' },
      ],
      events:[
        { m:1078, narr:'居間に いる →「人がいる部屋：居間」。' },
        { m:1092, narr:'台所へ 行って 電気を つけた →「人がいる部屋：台所」「電気がついている部屋：台所」。' },
        { m:1142, narr:'寝室へ。台所の 電気を 消した。' },
        { m:1192, narr:'温度・時刻・かぎも いつでも わかる。おじいさんか 知らない人かも わかる（「おじいさんが 家にいる」）。' },
      ],
    },
  ];
  const rule = key => RULE_SCENES.find(s => s.key === key) || SCENES.find(s => s.key === key) || null;

  global.TeamHomeDemo = { list: () => SCENES, rule, T };
})(window);
