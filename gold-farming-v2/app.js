import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import { getFirestore, doc, getDoc, collection } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
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

const LOGIN_ID_SUFFIX = '@calmeguild.local';
const idToEmail = (id) => id.trim().toLowerCase() + LOGIN_ID_SUFFIX;
const SESSION_KEY = 'calmeguild_sub_unlocked'; // ポータル・他ツールと共通

async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
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
    if (matched) { sessionStorage.setItem(SESSION_KEY, '1'); showMain(); }
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
onAuthStateChanged(auth, (user) => {
  if (user || sessionStorage.getItem(SESSION_KEY) === '1') showMain(); else showLogin();
});

/* =========================================================
   表示ヘルパー
   文字色マーク： <r>赤</r>  <p>紫</p>  <m>えんじ紫</m>  <b>太字</b>
   ========================================================= */
const ICONS = new Set(["アーモンド","エビ","オリーブ油","かいわれ菜","カプサイシン","キノコ","キャビア缶","コーヒー豆","サフラン","シナモン","ジャガイモ","チーズ","チェリー","チョコレート","チリソース","トウモロコシ","トマト","ニンジン","ニンニク","ハーブ","バター","ハチミツ","パプリカ","ブドウ","ホップ","マヨネーズ","みりん","メロン","リンゴ","ワサビ","塩","缶詰フルーツ","牛乳","玉ねぎ","鶏の胸肉パック","胡椒","砂糖","鮭","小麦","食パン","唐辛子","豆","麦","米","味付け海苔","卵"]);

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
function chip(name, { c = '', price = null, qty = null, mark = false, plain = false } = {}) {
  const has = ICONS.has(name);
  const body = `<span class="ing${has ? '' : ' noicon'}${c ? ' c-' + c : ''}${plain ? ' plain' : ''}">${icon(name)}<span class="nm">${esc(name)}</span>` +
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
  ['EC2：ナイトメア…', ...CC2],
  ['EC3：ビーチサイド…', ...CC3],
  ["EC5：Memory's…", ...CC2],
  ['EC7：スプラッシュ…', '<p>チョコレート(6)、</p>コーヒー豆(25)、缶詰フルーツ(66)、食パン(32)、\n牛乳(16)、<p>ツナ缶(6)、</p><r>キャビア缶(90)</r>', 'なし　<r>※鶏の胸肉パック(12)</r>']
];

const NOTICE_B = '※<r>赤文字</r>の食材はそのまま売ると赤字になってしまうため、料理に使いきれずに大量に余ってしまう場合には、余った分をそのまま売るのではなく買うのを中止してください。\n\n※<p>ツナ缶</p>は値下げ後買値も、120％売値も6Gなので、買っても買わなくても良いのですが、商店に関する業績の足しになることを考えると料理に使わずとも買った方が良いです。金欠で商店金策がギリギリなのであれば買わない事。\n\n※<p>チョコレート</p>に関しても買値6Gのものに関しては120％売値が6Gなのでツナ缶と同じ扱い。\nチョコ6Gの店はファイヤーチップ、ビューティー・インポッシブル、\nナイトメア・ウィンター、ビーチサイド・エンジェル、\nMemory\'s Edge、スプラッシュ・クイーンの6つ。\n\n※<b>才能の秘薬</b>はまずイベント商店で購入。\nそれでも足りない分に関しては、任意のカセットでウィークリークエストをクリアして街の評判を上げた後にその街の商店で秘薬を購入してください、1つあたり45Gで購入できます。（料理の利益はこの金額で計算しています）';
const NOTICE_C = '買わない食材リストの中でグレーのものは買った時点で赤字です。\n買わない食材リストの中で<g>緑色</g>のものに関しては、\n料理に使えば黒字ですがそのまま売ると赤字になってしまうもので、\n買う食材リストに記載の量とフィールドなどで手に入る量で料理に使う分を十分賄えている予定なので買わない食材リストに移したものです。\nもしこれらの食材が足りずに高利益料理が作れないのであれば買ってもOKです。\n<o>ただし売価21Gのキノコだけは「シャイニーガンバス」「ルーゴ高麗人参の串焼き」「屋台の焼き鳥」に使う分のみが黒字になるので注意してください。</o>';

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
      `<td class="rank">${esc(rank)}</td><td class="dish${purple ? ' c-p' : ''}">${esc(name)}</td>` +
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
const SELL_LEAD = '※原則120％で売れる日にだけ売りましょう！それ以外の日は売らずにとっておきます。';
const SELL_TOP = '作成した料理全て';
const SELL_TOP_NOTE = '上の料理するものリストは120％売却で利益計算をしていますので、120％の日以外に売ると大幅に赤字になる可能性があります';
const SELL_ITEMS = ['アーモンド', 'かいわれ菜', 'カプサイシン', 'コーヒー豆', 'チーズ', 'チョコレート', 'チリソース', 'ツナ缶', 'トウモロコシ', 'トマト', 'ニンジン', 'バター', 'ブドウ', 'みりん', 'メロン', 'リンゴ', '獣の肉', '牛乳', '砂糖', '鮭', '小麦', '麦', '唐辛子', '豆', '米', '味付け海苔', '卵'];
const SELL_MERGED_NOTE = 'これらの食材はそのまま売っても利益になるので、料理に使っても尚余った分のみを売ります。\n（ここに無い食材は料理に使わず売ると赤字になる or 貴重なものなので売りません）';
const SELL_OTHERS = [
  ['各種スカウト契約書', 'スカウト完了したプレイヤーに関しては少しの備蓄を残して売ってもOK'],
  ['スライム', '手持ちキャラ全カンストしたプレイヤーに関しては備蓄を残して売ってもOK\n※ただし強制的に手に入る数が少ないので売る必要はかなり低い'],
  ['パプリカ', '売る前に買わない食材リストの緑枠パプリカを購入していないかを必ず確認してください、緑枠パプリカを料理せず売ると赤字です'],
  ['料理に使わない特殊食材\n・元気粉\n・鱗甲目のうろっこ\n・ビタＢ濃縮溶液\n・元気ポーション\n・黄金バジル\n・魅惑の粉\n・鷲の羽根\n・元気キノコ\n・魂生クリーム', '既存の食材を使用したレシピ追加が無いとは明言されていないので<b>自己責任</b>で売却可']
];
const SELL_FOOT = '<r>ここに載っていないものを売るのは非推奨ですが、自己責任で売却可</r>';

function renderSell() {
  document.getElementById('sellLead').textContent = SELL_LEAD;
  let h = '<thead><tr><th>アイテム名</th><th>備考</th></tr></thead><tbody>';
  h += `<tr class="grp-a"><td class="item">${esc(SELL_TOP)}</td><td class="remark">${esc(SELL_TOP_NOTE)}</td></tr>`;
  SELL_ITEMS.forEach((n, i) => {
    h += `<tr class="${(i + 1) % 2 ? 'grp-b' : 'grp-a'}"><td class="item">${chip(n)}</td>` +
      (i === 0 ? `<td class="remark noteMerged" rowspan="${SELL_ITEMS.length}">${esc(SELL_MERGED_NOTE).replace(/\n/g, '<br>')}</td>` : '') + '</tr>';
  });
  SELL_OTHERS.forEach(([n, note], i) => {
    const long = n.length > 20;
    h += `<tr class="${(SELL_ITEMS.length + 1 + i) % 2 ? 'grp-b' : 'grp-a'}${n.startsWith('料理に使わない') ? ' dimRow' : ''}"><td class="item${long ? ' wrapItem' : ''}">${n === 'パプリカ' ? chip(n) : esc(n).replace(/\n/g, '<br>')}</td><td class="remark">${rich(note).replace(/\n/g, '<br>')}</td></tr>`;
  });
  h += `<tr class="grp-b"><td></td><td class="remark">${rich(SELL_FOOT)}</td></tr>`;
  document.getElementById('sellTable').innerHTML = h + '</tbody>';
}

renderShop();
renderCook();
renderSell();
