import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import { getFirestore, doc, getDoc, getDocs, addDoc, collection } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";

/* =========================================================
   アクセス制御（既存の gold-farming ページと同じ仕組み）
   ========================================================= */
const firebaseConfig = {
  apiKey: "AIzaSyAraB3PZJklrCxGYOYVF83yv3BIPkm6Ss4",
  authDomain: "guild-tool-calme.firebaseapp.com",
  projectId: "guild-tool-calme",
  storageBucket: "guild-tool-calme.firebasestorage.app",
  messagingSenderId: "727919106290",
  appId: "1:727919106290:web:b079d264db7a0c6197d86b"
};
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const goldFarmingCol = collection(db, "goldFarming");
const adminsCol = collection(db, "admins");
const accessLogsCol = collection(db, "goldFarmingAccessLogs"); // 旧ページと同じ記録場所（page:"v2" の印で区別）

const LOGIN_ID_SUFFIX = '@calmeguild.local';
const idToEmail = (id) => id.trim().toLowerCase() + LOGIN_ID_SUFFIX;
const SESSION_KEY = 'calmeguild_sub_unlocked'; // ポータル・他ツールと共通

async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}
/* ---------- アクセス記録（1セッション1回・日時と経路のみ。個人情報は記録しない） ---------- */
function logAccessOnce(method) {
  if (sessionStorage.getItem('gfg2_access_logged') === '1') return;
  sessionStorage.setItem('gfg2_access_logged', '1');
  addDoc(accessLogsCol, { ts: new Date().toISOString(), method, page: 'v2' }).catch(() => {});
}
const escHtml = (t) => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
/* ---------- アクセス状況（管理者のみ・ページ最下部） ---------- */
function renderAccessStats(logs) {
  const summaryEl = document.getElementById('accessStatsSummary');
  const table = document.getElementById('accessStatsTable');
  const now = new Date();
  const todayKey = now.toISOString().slice(0, 10);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  let todayMain = 0, todaySub = 0, weekMain = 0, weekSub = 0;
  const byDate = {};
  logs.forEach(l => {
    if (!l.ts) return;
    const key = l.ts.slice(0, 10);
    const isMain = l.method === 'メインギルド';
    byDate[key] = byDate[key] || { main: 0, sub: 0 };
    byDate[key][isMain ? 'main' : 'sub']++;
    if (key === todayKey) { if (isMain) todayMain++; else todaySub++; }
    if (new Date(l.ts) >= weekAgo) { if (isMain) weekMain++; else weekSub++; }
  });
  summaryEl.textContent = `本日: メインギルド ${todayMain}件 / サブギルド ${todaySub}件　|　直近7日間: メインギルド ${weekMain}件 / サブギルド ${weekSub}件`;
  const keys = Object.keys(byDate).sort().reverse().slice(0, 30);
  if (!keys.length) { table.innerHTML = '<tbody><tr><td>まだアクセス記録がありません。</td></tr></tbody>'; return; }
  table.innerHTML = '<thead><tr><th>日付</th><th>メインギルド</th><th>サブギルド</th></tr></thead><tbody>' +
    keys.map((k, i) => `<tr class="${i % 2 ? 'grp-b' : 'grp-a'}"><td>${escHtml(k)}</td><td>${byDate[k].main}件</td><td>${byDate[k].sub}件</td></tr>`).join('') + '</tbody>';
}
async function loadAccessStats() {
  const summaryEl = document.getElementById('accessStatsSummary');
  summaryEl.textContent = '読み込み中...';
  try {
    const snap = await getDocs(accessLogsCol);
    const logs = [];
    snap.forEach(d => { const v = d.data(); if (v.page === 'v2') logs.push(v); });
    renderAccessStats(logs);
  } catch (e) { summaryEl.textContent = '読み込みエラー: ' + e.message; }
}
const showMain = () => {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('mainContent').style.display = 'block';
};
const showLogin = () => {
  document.getElementById('loginScreen').style.display = 'block';
  document.getElementById('mainContent').style.display = 'none';
};

document.getElementById('gateBtn').addEventListener('click', async () => {
  const statusEl = document.getElementById('gateStatus');
  const input = document.getElementById('gatePassword').value;
  if (!input) { statusEl.className = 'status err'; statusEl.textContent = 'パスワードを入力してください。'; return; }
  try {
    const snap = await getDoc(doc(goldFarmingCol, "config"));
    const data = snap.exists() ? snap.data() : {};
    const inputHash = await sha256Hex(input);
    const matched = (data.passwordHash && inputHash === data.passwordHash) ||
                    (!data.passwordHash && data.password && input === data.password);
    if (matched) { sessionStorage.setItem(SESSION_KEY, '1'); logAccessOnce('サブギルド'); showMain(); }
    else { statusEl.className = 'status err'; statusEl.textContent = 'パスワードが違います。'; }
  } catch (e) {
    statusEl.className = 'status err';
    statusEl.textContent = '確認に失敗しました: ' + e.message;
  }
});
document.getElementById('loginBtn').addEventListener('click', async () => {
  const statusEl = document.getElementById('loginStatus');
  const id = document.getElementById('loginId').value.trim();
  const password = document.getElementById('loginPassword').value;
  if (!id || !password) { statusEl.className = 'status err'; statusEl.textContent = 'IDとパスワードを入力してください。'; return; }
  try { await signInWithEmailAndPassword(auth, idToEmail(id), password); }
  catch (e) { statusEl.className = 'status err'; statusEl.textContent = 'ログインに失敗しました。IDかパスワードが間違っています。'; }
});
document.getElementById('logoutBtn').addEventListener('click', async () => {
  sessionStorage.removeItem(SESSION_KEY);
  if (auth.currentUser) await signOut(auth);
  showLogin();
});
onAuthStateChanged(auth, async (user) => {
  const box = document.getElementById('accessStatsBox');
  if (box) box.style.display = 'none';
  if (user) {
    logAccessOnce('メインギルド');
    showMain();
    let isAdmin = false;
    try { isAdmin = (await getDoc(doc(adminsCol, (user.email || '').toLowerCase()))).exists(); } catch (e) { isAdmin = false; }
    if (isAdmin && box) { box.style.display = 'block'; loadAccessStats(); }
  } else if (sessionStorage.getItem(SESSION_KEY) === '1') {
    logAccessOnce('サブギルド');
    showMain();
  } else showLogin();
});

/* =========================================================
   表示ヘルパー
   文字色マーク： <r>赤</r>  <p>紫</p>  <m>えんじ紫</m>  <b>太字</b>
   ========================================================= */
const ICONS = new Set(["アーモンド","エビ","オリーブ油","かいわれ菜","カプサイシン","キノコ","キャビア缶","コーヒー豆","サフラン","シナモン","ジャガイモ","チーズ","チェリー","チョコレート","チリソース","トウモロコシ","トマト","ニンジン","ニンニク","ハーブ","バター","ハチミツ","パプリカ","ブドウ","ホップ","マヨネーズ","みりん","メロン","リンゴ","ワサビ","塩","缶詰フルーツ","牛乳","玉ねぎ","鶏の胸肉パック","胡椒","砂糖","鮭","小麦","食パン","唐辛子","豆","麦","米","味付け海苔","卵","カイラック薬材","ウコン","レーヴァテインハム","オイスター","トリュフオイル","ツナ缶","獣の肉","地獄火ソース","透明キノコ","光る粉","ルーゴ高麗人参","生命の炭","エターナルラブ","元気キノコ","元気ポーション","元気粉","ビタＢ濃縮溶液","魅惑の粉","魂生クリーム","黄金バジル","鱗甲目のうろっこ","鷲の羽根","各種スライム","各種スカウト契約書","サフラン花のポンチ","ペペロンチーノ","香ばしい棒天","黒ビールシチュー","キャビアオムレツ","シャイニーガンバス","屋台の焼き鳥","アイスキャンディ","ポテトポタージュ","ルーゴ高麗人参の串焼き","ショコラカクテル","黒焦げのクッキー","テレーゼ・パイ","フルーツスラッシュ","地獄炎キンパ","ハーブステーキ","サーモンワサビ寿司","ハニーバターアーモンド","透明化サラダ","チョコパン","サンドイッチ弁当"]);

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function segs(str) {
  const out = []; let last = 0; const re = /<(r|p|m|b|g|o)>([\s\S]*?)<\/\1>/g; let m;
  while ((m = re.exec(str))) {
    if (m.index > last) out.push({ c: '', t: str.slice(last, m.index) });
    out.push({ c: m[1], t: m[2] }); last = re.lastIndex;
  }
  if (last < str.length) out.push({ c: '', t: str.slice(last) });
  return out;
}
/* 文章（備考など）：色マークを反映 */
function rich(str) {
  return segs(str).map(s => {
    const t = esc(s.t);
    if (s.c === 'b') return `<b class="strong">${t}</b>`;
    return s.c ? `<span class="c-${s.c}">${t}</span>` : t;
  }).join('');
}
function icon(name) {
  return ICONS.has(name) ? `<img src="icons/${encodeURIComponent(name)}.png" alt="">` : '';
}
function chip(name, { c = '', price = null, qty = null, mark = false, plain = false, x = '' } = {}) {
  const has = ICONS.has(name);
  const body = `<span class="ing${has ? '' : ' noicon'}${c ? ' c-' + c : ''}${plain ? ' plain' : ''}${x ? ' ' + x : ''}">${icon(name)}<span class="nm">${esc(name)}</span>` +
    `${qty != null ? `<span class="qty">×${esc(qty)}</span>` : ''}</span>`;
  return mark ? `<span class="mkw"><span class="mk">‼️</span>${body}</span>` : body;
}
/* 「名前(価格)、名前(価格)…」形式のリスト（色マーク対応） */
function ingList(str, { noBuy = false } = {}) {
  const html = [];
  segs(str).forEach(seg => {
    const s = { c: noBuy && seg.c === 'r' ? 'g' : seg.c, t: seg.t };
    let firstMark = true;
    s.t.split(/([、\n])/).forEach(piece => {
      if (piece === '、') return;
      if (piece === '\n') { html.push('<span class="lb"></span>'); return; }
      let t = piece.replace(/^[\s　]+|[\s　]+$/g, '');
      if (!t) return;
      let mark = false;
      if (t.startsWith('※')) { mark = firstMark && !noBuy; t = t.slice(1).trim(); firstMark = false; }
      if (t === 'なし' || t === '全て') { html.push(chip(t, { plain: true, c: s.c })); return; }
      const m = t.match(/^(.+?)\((\d[\d,]*)\)$/);   // 価格(括弧内)は表示しない
      html.push(chip(m ? m[1] : t, { c: s.c, mark }));
    });
  });
  return `<div class="ings">${html.join('')}</div>`;
}
/* 「名前×個数、…」形式 */
function matList(str) {
  return `<div class="ings">${str.split('、').map(p => {
    const m = p.match(/^(.+?)×(\d+)$/);
    return m ? chip(m[1], { qty: m[2] }) : chip(p);
  }).join('')}</div>`;
}

/* =========================================================
   ① 商店ごとの購入食材（シート「ギルマス手動まとめ①」）
   ========================================================= */
const CC1 = ['チョコレート(3)、<p>ツナ缶(6)、</p>食パン(32)、\n牛乳(16)、バター(24)、卵(9)', 'なし　<r>※鶏の胸肉パック(12)</r>'];
const CC2 = ['缶詰フルーツ(66)、唐辛子(21)、砂糖(9)、\n<p>チョコレート(6)、</p>カプサイシン(64)、砂糖(9)、牛乳(16)', 'レーヴァテインハム(192)'];
const EC25 = ['缶詰フルーツ(66)、唐辛子(21)、砂糖(9)、\n<p>チョコレート(6)、</p>カプサイシン(64)、牛乳(16)', 'レーヴァテインハム(192)'];
const CC3 = ['<p>チョコレート(6)、</p><r>キャビア缶(90)、</r>砂糖(9)、\n牛乳(16)、卵(9)、バター(24)、<r>塩(7)、\n</r>チーズ(14)', 'ジャガイモ(18)、トリュフオイル(216)'];
const CC56 = ['リンゴ(21)、ブドウ(21)、<r>ハチミツ(144)、\n</r>砂糖(9)、\n<r>ハーブ(51)、</r>バター(24)', 'ジャガイモ(18)、トマト(49)　<r>※エビ(66)、キノコ(21)、オリーブ油(96)</r>'];
const SHOPS = [
  ['1：鮮血の騎士', 'キノコ(10)、ニンジン(14)、小麦(6)、米(6)、\nチリソース(54)、<r>チェリー(120)</r>', 'なし　<r>※パプリカ(45)</r>'],
  ['2：蒼の魔女', '麦(12)、バター(24)、ホップ(12)、\n牛乳(16)、砂糖(9)、小麦(6)、卵(9)', 'ジャガイモ(9)'],
  ['3：霧の名射手', 'リンゴ(21)、ブドウ(21)、<r>エビ(66)、ハチミツ(144)、\n</r>砂糖(9)、<r>ハーブ(51)、\n</r>バター(24)、<r>オリーブ油(96)</r>', 'ジャガイモ(18)、トマト(49)　<r>※キノコ(21)</r>'],
  ['4：ネコとメガネ', 'コーヒー豆(25)、鮭(33)、\n牛乳(16)、<r>オリーブ油(96)、</r>ハーブ(26)、<r>玉ねぎ(45)、\n</r>米(6)、小麦(6)', 'トマト(49)、豆(34)、チリソース(108)、カイラック薬材(105)<r>　　※パプリカ(45)</r>'],
  ['5：砂漠の華', 'メロン(22)、砂糖(9)、\n<r>ハーブ(51)、塩(7)、</r>サフラン(30)', 'リンゴ(42)、ブドウ(42)、ウコン(134)'],
  ['6：異教の塔', '玉ねぎ(22)、米(6)、パプリカ(22)、チーズ(14)、\n<r>ハーブ(51)、</r>卵(9)、小麦(6)', 'サフラン(60)　<r>※オリーブ油(96)</r>'],
  ['7：憤怒の天使', '鮭(33)、小麦(6)、トマト(24)、ワサビ(84)、\n米(6)、チーズ(14)、かいわれ菜(24)', '食パン(64)、レーヴァテインハム(192)'],
  ['8：鮮血の狂詩曲', 'トウモロコシ(23)、豆(17)、\nチーズ(14)、小麦(6)、<r>玉ねぎ(45)、</r>みりん(90)、\n<r>ニンニク(72)</r>', 'ジャガイモ(18)、鮭(66)、ニンジン(28)、かいわれ菜(48)　<r>※オリーブ油(96)、パプリカ(45)</r>'],
  ['9：鉄仮面', 'なし', '全て'],
  ['10：ホムンクルス', 'アーモンド(60)、<r>鶏の胸肉パック(12)、\nハーブ(51)、</r>バター(24)、<r>塩(7)、\n</r>砂糖(9)、<r>シナモン(50)</r>', 'ブドウ(42)、ハチミツ(288)、カイラック薬材(105)　<r>※キノコ(21)</r>'],
  ['11：虚言遊戯', '玉ねぎ(15)、米(4)、パプリカ(15)、チーズ(9)、\nハーブ(17)、卵(6)、小麦(4)、オリーブ油(32)、\n<r>チェリー(120)</r>', 'サフラン(60)'],
  ['12：黒き羽根', 'コーヒー豆(25)、鮭(33)、\n牛乳(16)、ハーブ(26)、<r>玉ねぎ(45)、\n</r>米(6)、小麦(6)、<r>ニンニク(72)、胡椒(50)</r>', 'トマト(49)、豆(34)、チリソース(108)、カイラック薬材(105)　<r>※オリーブ油(96)、パプリカ(45)</r>'],
  ['13：雪の唄', 'リンゴ(21)、ブドウ(21)、<r>エビ(66)、ハチミツ(144)、\n</r>砂糖(9)、<r>ハーブ(51)、\n</r>バター(24)', 'ジャガイモ(18)、トマト(49)<r>　※オリーブ油(96)、キノコ(21)</r>'],
  ['14：神聖裁判', 'アーモンド(60)、<r>鶏の胸肉パック(12)、\nハーブ(51)、</r>バター(24)、<r>塩(7)、\n</r>砂糖(9)', 'ブドウ(42)、ハチミツ(288)、カイラック薬材(105)、オイスター　<r>※キノコ(21)</r>'],
  ['15：復讐の誓い', 'ニンジン(9)、リンゴ(14)、ハーブ(17)、\n玉ねぎ(15)、トマト(16)、ワサビ(56)', 'チリソース(108)　<r>※パプリカ(45)、キノコ(21)</r>'],
  ['16：三ヵ国同盟', '<r>エビ(66)、</r>鮭(22)、塩(4)、みりん(60)、\nチーズ(9)、コーヒー豆(16)、砂糖(9)', 'サフラン(60)、ウコン(134)、オイスター(100)'],
  ['17：試練の道', 'アーモンド(60)、ホップ(12)、塩(4)、\n砂糖(9)、小麦(6)、米(6)', '豆(34)、カイラック薬材(105)'],
  ['18：救済', 'トウモロコシ(23)、リンゴ(14)、卵(6)、\n小麦(6)、米(6)、麦(12)、牛乳(16)', 'ジャガイモ(18)、食パン(64)'],
  ['19：忘却されし戦争', '塩(4)、コーヒー豆(16)、バター(24)、\n砂糖(9)、チーズ(9)、ハーブ(17)', 'サフラン(60)、ブドウ(42)'],
  ['CC1：ジェイデンズ…', ...CC1],
  ['CC2：ファイヤーチ…', ...CC2],
  ['CC3：ビューティ…', ...CC3],
  ['CC4：大脱出', '米(4)、鶏の胸肉パック(4)、味付け海苔(40)、パプリカ(15)、\n唐辛子(14)、マヨネーズ(48)、小麦(4)、カプサイシン(51)', 'なし'],
  ['CC5：ルゥの迷路', ...CC56],
  ['CC6：御剣伝', ...CC56],
  ['CC7：契約戦争', ...CC1],
  ['EC1：サマーナイト', ...CC1],
  ['EC2：ナイトメア…', ...EC25],
  ['EC3：ビーチサイド…', ...CC3],
  ["EC5：Memory's…", ...EC25],
  ['EC7：スプラッシュ…', '<p>チョコレート(6)、</p>コーヒー豆(25)、缶詰フルーツ(66)、食パン(32)、\n牛乳(16)、<p>ツナ缶(6)、</p><r>キャビア缶(90)</r>', 'なし　<r>※鶏の胸肉パック(12)</r>']
];

const NOTICE_B = '※<r>赤文字</r>の食材はそのまま売ると赤字になってしまうため、料理に使いきれずに大量に余ってしまう場合には、余った分をそのまま売るのではなく買うのを中止してください。\n\n※<p>ツナ缶</p>は値下げ後買値も、120％売値も6Gなので、買っても買わなくても良いのですが、商店に関する業績の足しになることを考えると料理に使わずとも買った方が良いです。金欠で商店金策がギリギリなのであれば買わない事。\n\n※<p>チョコレート</p>に関しても買値6Gのものに関しては120％売値が6Gなのでツナ缶と同じ扱い。\nチョコ6Gの店はファイヤーチップ、ビューティー・インポッシブル、\nナイトメア・ウィンター、ビーチサイド・エンジェル、\nMemory\'s Edge、スプラッシュ・クイーンの6つ。\n\n※<b>才能の秘薬</b>はまずイベント商店で購入。\nそれでも足りない分に関しては、任意のカセットでウィークリークエストをクリアして街の評判を上げた後にその街の商店で秘薬を購入してください、1つあたり45Gで購入できます。（料理の利益はこの金額で計算しています）';
const NOTICE_C = '買わない食材リストの中でグレーのものは買った時点で赤字です。\n\n買わない食材リストの中で<g>緑色</g>のものに関しては、\n料理に使えば黒字ですがそのまま売ると赤字になってしまうもので、\n買う食材リストに記載の量とフィールドなどで手に入る量で料理に使う分を十分賄えている予定なので買わない食材リストに移したものです。\nもしこれらの食材が足りずに高利益料理が作れないのであれば買ってもOKです。\n\n<o>ただし売価21Gのキノコだけは「シャイニーガンバス」「ルーゴ高麗人参の串焼き」「屋台の焼き鳥」に使う分のみが黒字になるので注意してください。</o>';

const SUMMARY = [
  ['買う食材リストを全て購入', '合計　205　品　1,080,800Ｇ', '損しない範囲で最大限購入した場合'],
  ['買う食材リストの白文字のみ購入', '合計　159　品　801,900Ｇ', '用途にかかわらず必ず得するものだけ購入した場合'],
  ['買う食材リストの白＋赤文字のみ購入', '合計　195　品　1,056,800Ｇ', '損しない範囲で最大限購入した場合（業績不要）']
];
const SUMMARY_NOTE = '※サキさんの金策リスト197個 1,073,600Gと、「白＋赤文字」で2品16,800Gの差があるのは、\n「21Gで買えるキノコを2枠分買う予定にしているかどうかの違い」です。\n私の方で買わない予定にしているのはキノコが余った際に「間違えて低利益のキノコ料理を作って損しないようにしている」ためなので、\nキノコが不足して高利益の料理が作れなくなったら購入してください。';

function renderShop() {
  let h = '<thead><tr><th>商店</th><th>買う食材</th><th class="thNoBuy">買わない食材</th></tr></thead><tbody>';
  SHOPS.forEach(([name, buy, nobuy], i) => {
    h += `<tr class="${i % 2 ? 'grp-b' : 'grp-a'}"><td class="shopName">${esc(name)}</td><td>${ingList(buy)}</td><td class="noBuy">${ingList(nobuy, { noBuy: true })}</td></tr>`;
  });
  document.getElementById('shopTable').innerHTML = h + '</tbody>';

  document.getElementById('noticeTable').innerHTML =
    `<tbody><tr class="grp-a"><td>${rich(NOTICE_B).replace(/\n/g, '<br>')}</td><td class="noBuy">${rich(NOTICE_C).replace(/\n/g, '<br>')}</td></tr></tbody>`;

  let s = '<thead><tr><th>購入品</th><th>合計</th><th>想定</th></tr></thead><tbody>';
  SUMMARY.forEach((r, i) => { s += `<tr class="${i % 2 ? 'grp-b' : 'grp-a'}">${r.map(x => `<td>${esc(x)}</td>`).join('')}</tr>`; });
  document.getElementById('summaryTable').innerHTML = s + '</tbody>';
  document.getElementById('summaryNote').textContent = SUMMARY_NOTE;
}

/* =========================================================
   ② 料理の利益ランキング（シート「ギルマス手動まとめ②」）
   cls: '' 通常 / 'gray' グレーアウト(作らない) / 'lgray' 薄いグレー
   ========================================================= */
const COOK_LEAD = '買うものリストに従って購入後、上から作れるだけ作っていれば間違いありません！　<r>※取り消し線のかかってる料理は作らないでください</r>';
const KINOKO = '<m>※キノコ不足で作れない時は21Gで売ってるキノコ追加購入</m>';
const OVERLAP = '<r>上位と貴重素材被り</r>';
// [順位, 料理, 売値(120%), 材料費, 秘薬消費量, 秘薬費用, 総コスト, 利益(1品), 材料, 備考, cls, 料理名を紫に]
const COOK = [
  ['1', '地獄炎キンパ', '7,868', '4,911', '10', '450', '5,361', '2,507', '米×3、唐辛子×3、味付け海苔×2、カプサイシン×2、地獄火ソース×2', '特殊素材：地獄火ソース', ''],
  ['2', '透明化サラダ', '7,724', '4,800', '10', '450', '5,250', '2,474', '豆×3、玉ねぎ×2、パプリカ×3、オリーブ油×2、透明キノコ×2', '特殊素材：透明キノコ', ''],
  ['3', 'シャイニーガンバス', '7,753', '4,833', '10', '450', '5,283', '2,470', 'エビ×3、キノコ×3、トマト×2、オリーブ油×2、光る粉×2', '特殊素材：光る粉\n' + KINOKO, ''],
  ['4', 'ルーゴ高麗人参の串焼き', '7,533', '4,698', '10', '450', '5,148', '2,385', '獣の肉×4、キノコ×3、パプリカ×3、チリソース×1、ルーゴ高麗人参×2', '特殊素材：ルーゴ高麗人参\n' + KINOKO, ''],
  ['5', '黒焦げのクッキー', '7,456', '4,659', '10', '450', '5,109', '2,347', 'バター×3、砂糖×2、小麦×3、卵×2、生命の炭×2', '特殊素材：生命の炭', ''],
  ['6', 'ハーブステーキ', '4,032', '1,580', '10', '450', '2,030', '2,002', '獣の肉×25、ハーブ×20、塩×20、バター×20、胡椒×1', '', ''],
  ['7', 'ペペロンチーノ', '4,416', '2,430', '10', '450', '2,880', '1,536', '小麦×25、オリーブ油×15、エビ×15、ニンニク×10、胡椒×1', '', ''],
  ['8', 'オイスター・ロックフェラー', '4,152', '2,390', '10', '450', '2,840', '1,312', 'オイスター×8、ニンニク×5、ハーブ×20、オリーブ油×10、胡椒×1', OVERLAP, 'gray'],
  ['9', 'サンドイッチ弁当', '4,656', '3,200', '10', '450', '3,650', '1,006', '食パン×20、卵×40、トマト×20、マヨネーズ×15、胡椒×1', '', ''],
  ['10', '屋台の焼き鳥', '2,640', '1,190', '10', '450', '1,640', '1,000', '鶏の胸肉パック×20、玉ねぎ×20、パプリカ×15、キノコ×15、胡椒×1', '<r>必ず利益上位の料理で使いきれなかった胡椒で作る事</r>\n' + KINOKO, ''],
  ['11', 'アイスキャンディ', '2,292', '1,130', '10', '450', '1,580', '712', 'チェリー×5、チョコレート×30、砂糖×30、シナモン×1', '', ''],
  ['12', 'テレーゼ・パイ', '2,484', '1,495', '10', '450', '1,945', '539', '小麦×35、バター×20、砂糖×20、牛乳×20、シナモン×1', '<r>必ずアイスキャンディで使いきれなかったシナモンで作る事</r>', ''],
  ['13', 'ハンバーグ弁当', '1,908', '935', '10', '450', '1,385', '523', '獣の肉×20、玉ねぎ×20、米×15、ニンジン×10、胡椒×1', OVERLAP, 'gray'],
  ['14', 'スイート・マカロン', '2,328', '1,370', '10', '450', '1,820', '508', '卵×25、砂糖×25、バター×15、牛乳×15、シナモン×1', OVERLAP, 'gray'],
  ['15', '手作りケーキ', '2,064', '1,155', '10', '450', '1,605', '459', '小麦×25、卵×20、砂糖×20、バター×15、シナモン×1', OVERLAP, 'gray'],
  ['16', 'カツ丼', '1,872', '995', '10', '450', '1,445', '427', '獣の肉×30、玉ねぎ×20、卵×15、米×15、胡椒×1', OVERLAP, 'gray'],
  ['17', 'ハニーバターアーモンド', '912', '336', '5', '225', '561', '351', 'アーモンド×2、ハチミツ×2、バター×2', '', ''],
  ['18', 'ベイクドハニーアップル', '258', '84', '1', '45', '129', '129', 'リンゴ×1、ハチミツ×1', OVERLAP, 'gray'],
  ['19', '香ばしい棒天', '729', '390', '5', '225', '615', '114', '唐辛子×2、レーヴァテインハム×2、カプサイシン×2', '', ''],
  ['20', 'キャビアオムレツ', '494', '228', '5', '225', '453', '41', 'キャビア缶×2、卵×2、バター×2', '', ''],
  ['21', 'ショコラカクテル', '330', '222', '2', '90', '312', '18', 'チョコレート×3、エターナルラブ×2', '特殊素材：エターナルラブ', ''],
  ['22', 'ツナマヨおにぎり', '580', '340', '5', '225', '565', '15', '米×4、味付け海苔×2、マヨネーズ×2', OVERLAP, 'gray'],
  ['23', 'サーモンカツ弁当', '241', '139', '2', '90', '229', '12', '鮭×2、オリーブ油×1、米×1', OVERLAP, 'gray'],
  ['24', '黒ビールシチュー', '294', '64', '5', '225', '289', '5', '麦×2、ホップ×2、獣の肉×2', 'これ以下の料理は11/19の更新で売値が上昇してますが利益が少ないです。必ず上位の料理を作ってから余った食材を使用してください', ''],
  ['25', 'サフラン花のポンチ', '546', '228', '7', '315', '543', '3', 'リンゴ×2、ブドウ×2、メロン×2、サフラン×2', '', ''],
  ['25', 'カイラック養生スープ', '534', '216', '7', '315', '531', '3', '鶏の胸肉パック×2、キノコ×2、塩×2、カイラック薬材×2', OVERLAP, 'gray'],
  ['25', 'ベジタブルサンドイッチ', '360', '132', '5', '225', '357', '3', 'トマト×2、食パン×2', '<r>※業績的にはチョコパン優先を推奨します</r>', 'gray', true],
  ['25', 'ツナチキンサンドイッチ', '324', '96', '5', '225', '321', '3', 'ツナ缶×2、鶏の胸肉パック×2、食パン×2', '<r>※業績的にはチョコパン優先を推奨します</r>', 'gray', true],
  ['25', 'キノコすき焼き鍋', '312', '84', '5', '225', '309', '3', 'キノコ×2、獣の肉×4、ニンジン×2', OVERLAP, 'gray'],
  ['25', 'フルーツスラッシュ', '168', '120', '1', '45', '165', '3', '缶詰フルーツ×1、砂糖×1', '', ''],
  ['25', 'チョコパン', '90', '42', '1', '45', '87', '3', 'チョコレート×1、食パン×1', '', '', true],
  ['25', 'キノコ炒め', '78', '30', '1', '45', '75', '3', 'キノコ×1、ニンジン×1', OVERLAP, 'gray'],
  ['25', 'ポテトポタージュ', '72', '24', '1', '45', '69', '3', 'ジャガイモ×1、牛乳×1', '', ''],
  ['34', 'ダレフ黒ビール', '144', '52', '2', '90', '142', '2', '麦×2、ホップ×2', OVERLAP, 'gray'],
  ['34', 'マッシュルームスープ', '66', '19', '1', '45', '64', '2', 'キノコ×1、小麦×1', OVERLAP, 'gray'],
  ['36', 'サーモンワサビ寿司', '714', '398', '7', '315', '713', '1', '鮭×3、ワサビ×2、米×2、かいわれ菜×2', '', ''],
  ['36', '薬草サンドイッチ', '588', '272', '7', '315', '587', '1', 'トマト×2、ハーブ×2、小麦×2、チリソース×2', OVERLAP, 'gray'],
  ['36', 'チキンロール', '570', '254', '7', '315', '569', '1', '鶏の胸肉パック×2、パプリカ×2、マヨネーズ×2、小麦×2', OVERLAP, 'gray']
];
const COOK_FOOT = '<p>※食パンを使う低利益料理3種類に関してはどれも同じ利益なので、業績を考えると作れる数が多くなるチョコパンを優先するのがおすすめです。</p>';

const cookState = { showNums: false, showGray: false };
const NUM_TH = ['売値(120%)', '材料費', '秘薬消費量', '秘薬費用', '総コスト', '利益(1品)'];
const GRAY_DESC_HIDDEN = '利益上位の料理と素材が重なり、作る必要のないレシピは非表示にしています。';
const GRAY_DESC_SHOWN = '取り消し線のレシピは、利益上位の料理と素材が重なるため作る必要がありません。';

function renderCook() {
  document.getElementById('cookLead').innerHTML = rich(COOK_LEAD);
  const setText = (id, t) => { const el = document.getElementById(id); if (el) el.textContent = t; };
  setText('toggleNums', cookState.showNums ? '売値〜利益の数値を隠す' : '売値〜利益の数値を表示');
  setText('toggleGray', cookState.showGray ? '作らない料理を隠す' : '作らない料理を表示');
  setText('grayDesc', cookState.showGray ? GRAY_DESC_SHOWN : GRAY_DESC_HIDDEN);
  const table = document.getElementById('cookTable');
  table.classList.toggle('hideNums', !cookState.showNums);
  const numStyle = cookState.showNums ? '' : ' style="display:none"';   // CSSの読み込み状況に左右されないよう直接指定
  let h = '<thead><tr><th class="rankTh">順位</th><th>料理</th>' + NUM_TH.map(t => `<th class="numcol"${numStyle}>${t}</th>`).join('') + '<th>材料(個数)</th><th>備考</th></tr></thead><tbody>';
  let vis = 0;
  COOK.forEach((r) => {
    const [rank, name, price, cost, eUse, eCost, total, profit, mats, note, cls, purple] = r;
    if (cls === 'gray' && !cookState.showGray) return;
    const zebra = vis++ % 2 ? 'grp-b' : 'grp-a';
    h += `<tr class="${zebra} ${cls || ''}">` +
      `<td class="rank">${esc(rank)}</td><td class="dish${purple ? ' c-p' : ''}"><span class="dishWrap">${icon(name)}<span>${esc(name)}</span></span></td>` +
      `<td class="num numcol c-b"${numStyle}>${price}</td><td class="num numcol c-b"${numStyle}>${cost}</td><td class="num numcol c-b"${numStyle}>${eUse}</td>` +
      `<td class="num numcol"${numStyle}>${eCost}</td><td class="num numcol"${numStyle}>${total}</td><td class="num numcol profit"${numStyle}>${profit}</td>` +
      `<td class="mat">${matList(mats)}</td><td class="remark">${rich(note || '').replace(/\n/g, '<br>')}</td></tr>`;
  });
  table.innerHTML = h + '</tbody>';
  document.getElementById('cookFoot').innerHTML = rich(COOK_FOOT);
}
document.getElementById('toggleNums')?.addEventListener('click', () => { cookState.showNums = !cookState.showNums; renderCook(); });
document.getElementById('toggleGray')?.addEventListener('click', () => { cookState.showGray = !cookState.showGray; renderCook(); });

/* =========================================================
   ③ 商店で売っていいもの（シート「ギルマス手動まとめ③」）
   ========================================================= */
const SELL_LEAD = '※原則120％で売れる日にだけ売りましょう！それ以外の日は売らずにとっておきます。日付は毎月固定です（1日〜28日）。';
const SELL_NOTE = '※この表に記載されているパプリカ以外の食材はそのまま売っても利益になるので、料理に使っても尚余った分のみを売ります。\n（ここに無い食材は料理に使わず売ると赤字になる or 貴重なものなので売りません）\n\n※料理するものリストは120％売却で利益計算をしていますので、120％の日以外に売ると大幅に赤字になる可能性があります。\n\n※破線の枠は「料理に使わない特殊食材」で、入手手段が限られているレアものです。\n既存の特殊食材を使用したレシピ追加が無いとは明言されていないので、金欠の場合には自己責任で売却可能です。';
const SELL_FOOT = '<r>ここに載っていないものを売るのは非推奨ですが、自己責任で売却可能です。\nまた、料理は②で掲載した利益の出る料理のみに絞っていますので、\nもし業績目的などでこれ以外の料理を作っている場合には120％で売れる日に売ってください。</r>';
/* 備考(各アイテムごと) */
const N_CONTRACT = 'スカウト完了したプレイヤーに関しては少しの備蓄を残して売ってもOK';
const N_SLIME = '手持ちキャラ全カンストしたプレイヤーに関しては備蓄を残して売ってもOK\n※ただし強制的に手に入る数が少ないので売る必要はかなり低い';
const N_PAPRIKA = '売る前に買わない食材リストの緑枠パプリカを購入していないかを必ず確認してください、緑枠パプリカを料理せず売ると赤字です';
const N_SPECIAL = '料理に使わない特殊食材のため<b>自己責任</b>で売却可（理由は表の下に記載）';
const ITEM_NOTES = { '各種スカウト契約書': N_CONTRACT, '各種スライム': N_SLIME, 'パプリカ': N_PAPRIKA };
['元気キノコ','元気ポーション','元気粉','ビタＢ濃縮溶液','魅惑の粉','魂生クリーム','黄金バジル','鱗甲目のうろっこ','鷲の羽根'].forEach(n => { ITEM_NOTES[n] = N_SPECIAL; });
/* 日付 → [食材, 料理(②で作るもの), その他(契約書・スライム・特殊食材), 備考]
   120％最高値の日付: https://browndust2-db.souseha.com/ja/market-data （毎月固定） */
const SELL_DAYS = [
  [1, [], [], ['各種スカウト契約書'], [N_CONTRACT]],
  [2, [], ['サフラン花のポンチ'], [], []],
  [3, [], ['ペペロンチーノ', '香ばしい棒天', '黒ビールシチュー'], ['元気キノコ'], [N_SPECIAL]],
  [4, ['麦', 'トマト'], [], [], []],
  [5, ['パプリカ'], ['キャビアオムレツ'], [], [N_PAPRIKA]],
  [6, [], ['シャイニーガンバス'], ['元気ポーション'], [N_SPECIAL]],
  [7, ['コーヒー豆'], ['屋台の焼き鳥'], [], []],
  [8, ['獣の肉', '味付け海苔', 'カプサイシン'], [], [], []],
  [9, [], [], ['元気粉'], [N_SPECIAL]],
  [10, ['トウモロコシ'], ['アイスキャンディ'], ['各種スライム'], [N_SLIME]],
  [11, ['牛乳'], ['ポテトポタージュ'], [], []],
  [12, ['チョコレート'], ['ルーゴ高麗人参の串焼き'], [], []],
  [13, ['鮭'], ['ショコラカクテル'], [], []],
  [14, ['ニンジン'], [], [], []],
  [15, ['ブドウ', 'チーズ'], [], [], []],
  [16, ['砂糖'], ['黒焦げのクッキー'], ['ビタＢ濃縮溶液'], [N_SPECIAL]],
  [17, ['米'], ['テレーゼ・パイ', 'フルーツスラッシュ'], [], []],
  [18, ['かいわれ菜', 'バター', 'チリソース'], [], ['魅惑の粉'], [N_SPECIAL]],
  [19, ['メロン', 'アーモンド'], [], [], []],
  [20, [], [], ['魂生クリーム'], [N_SPECIAL]],
  [21, ['小麦', '豆'], ['地獄炎キンパ', 'ハーブステーキ'], [], []],
  [22, ['みりん'], ['サーモンワサビ寿司'], [], []],
  [23, [], ['ハニーバターアーモンド'], [], []],
  [24, ['唐辛子'], [], [], []],
  [25, ['卵'], ['透明化サラダ', 'チョコパン'], [], []],
  [26, ['ツナ缶'], ['サンドイッチ弁当'], ['黄金バジル'], [N_SPECIAL]],
  [27, ['リンゴ'], [], ['鱗甲目のうろっこ'], [N_SPECIAL]],
  [28, [], [], ['鷲の羽根'], [N_SPECIAL]],
];

const SELL_SHOP = {'元気ポーション':'S18','魂生クリーム':'S19','みりん':'C5','各種スカウト契約書':'S1','ニンジン':'S7','獣の肉':'S3','ツナ缶':'S12','黄金バジル':'S6','鷲の羽根':'S9','魅惑の粉':'S6','元気粉':'S11','ポテトポタージュ':'S8','ハニーバターアーモンド':'S14','サンドイッチ弁当':'C7','テレーゼ・パイ':'C1','ショコラカクテル':'C5','黒ビールシチュー':'C6','香ばしい棒天':'S17','フルーツスラッシュ':'S5','卵':'C1','鱗甲目のうろっこ':'S16','小麦':'C2','鮭':'S7','チーズ':'S19','砂糖':'S2','味付け海苔':'S13','カプサイシン':'C3','アイスキャンディ':'S1','屋台の焼き鳥':'S5','ハーブステーキ':'C2','キャビアオムレツ':'C7','ペペロンチーノ':'S18','コーヒー豆':'S1','バター':'S2','牛乳':'S7','トマト':'S1','各種スライム':'S3','唐辛子':'C4','かいわれ菜':'C3','チョコレート':'S4','パプリカ':'S11','チョコパン':'E1','ブドウ':'S3','麦':'S18','ルーゴ高麗人参の串焼き':'S14','サフラン花のポンチ':'S19','トウモロコシ':'S12','リンゴ':'S6','米':'S5','豆':'S12','メロン':'C6','アーモンド':'C1','透明化サラダ':'E1','黒焦げのクッキー':'C7','ビタＢ濃縮溶液':'E1','チリソース':'S10','サーモンワサビ寿司':'S5','地獄炎キンパ':'C5','元気キノコ':'S1','シャイニーガンバス':'S5'};
function shopLabel(code) {
  const key = code[0] === 'S' ? code.slice(1) : (code[0] === 'C' ? 'CC' : 'EC') + code.slice(1);
  const r = SHOPS.find(x => x[0].split('：')[0] === key);
  return r ? r[0] : code;
}
function renderSell() {
  const lead = document.getElementById('sellLead'); if (lead) lead.textContent = SELL_LEAD;
  const note = document.getElementById('sellNote');
  if (note) note.innerHTML = esc(SELL_NOTE).replace(/\n/g, '<br>');
  let h = '<thead><tr><th class="dayCol">日付</th><th>120％で売れるアイテム／商店</th><th>備考</th></tr></thead><tbody>';
  SELL_DAYS.forEach(([d, ings, dishes, others], i) => {
    const items = [
      ...ings.map(n => [n, chip(n)]),
      ...dishes.map(n => [n, chip(n, { x: 'dish' })]),
      ...others.map(n => [n, chip(n, { x: (n === '各種スカウト契約書' || n === '各種スライム') ? '' : 'other' })]),
    ];
    const cls = i % 2 ? 'grp-b' : 'grp-a';
    items.forEach(([n, c], k) => {
      h += `<tr class="${cls}${k === 0 ? ' dayFirst' : ''}">` +
        (k === 0 ? `<td class="dayCol" rowspan="${items.length}">${d}日</td>` : '') +
        `<td class="sellItem">${c}${SELL_SHOP[n] ? `<span class="shopTag">${esc(shopLabel(SELL_SHOP[n]))}</span>` : ''}</td><td class="remark">${ITEM_NOTES[n] ? rich(ITEM_NOTES[n]).replace(/\n/g, '<br>') : ''}</td></tr>`;
    });
  });
  h += `<tr class="grp-b"><td></td><td colspan="2" class="remark">${rich(SELL_FOOT).replace(/\n/g, '<br>')}</td></tr>`;
  document.getElementById('sellTable').innerHTML = h + '</tbody>';
}

renderShop();
renderCook();
renderSell();
