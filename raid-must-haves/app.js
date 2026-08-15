import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import {
  getFirestore, doc, getDoc, getDocs, setDoc, collection
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import {
  getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";

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
const raidMustHavesCol = collection(db, "raidMustHaves");
const adminsCol = collection(db, "admins");
const damageCalcCharactersCol = collection(db, "damageCalcCharacters");

const LOGIN_ID_SUFFIX = '@calmeguild.local';
function idToEmail(id) { return id.trim().toLowerCase() + LOGIN_ID_SUFFIX; }
const SESSION_KEY = 'calmeguild_sub_unlocked'; // ポータル・他ツールと共通のキー名

let isAdmin = false;
let editModeOn = false;
let contentData = { characters: [], charactersAnnotation: '', equipmentLevels: [] };
let damageCalcCharsCache = []; // ダメージ計算ツールのキャラデータ(閲覧専用で流用)
let uidCounter = 0;
function uid() { uidCounter++; return 'u' + Date.now() + '_' + uidCounter; }

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : str;
  return div.innerHTML;
}
async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}
const ATTRIBUTE_EMOJI = { '火': '🔥', '水': '💧', '風': '🍃', '光': '🌟', '闇': '🟣' };
function attrCharName(name, attribute) { return `${ATTRIBUTE_EMOJI[attribute] || ''}${name || ''}`; }
const PRIORITY_STARS = ['☆☆☆☆☆', '★☆☆☆☆', '★★☆☆☆', '★★★☆☆', '★★★★☆', '★★★★★'];
// 優先度(0〜5)ごとの固定カラーパレット(青系→黄金系のグラデーション)
const PRIORITY_COLORS = ['#29E7FF', '#29F0DC', '#4DF0B5', '#ACFF96', '#F9FF84', '#FFF079'];
function priorityColor(n) {
  return PRIORITY_COLORS[Math.max(0, Math.min(5, Number(n) || 0))];
}

// Ace Characters Databaseと同じ汎用装備名データ(スロット別の選択肢に利用)
const EQUIPMENT_DATA = {
  "邪龍の魔剣": { slot: "武器", rank: "UR4", abilities: [{ name: "攻撃力", value: "37" }, { name: "クリダメ", value: "50%" }] },
  "雷槌": { slot: "武器", rank: "UR4", abilities: [{ name: "攻撃力", value: "37" }, { name: "攻撃力%", value: "25%" }] },
  "必中の投槍": { slot: "武器", rank: "UR4", abilities: [{ name: "攻撃力", value: "37" }, { name: "攻撃力", value: "37" }] },
  "旅神の友": { slot: "武器", rank: "UR4", abilities: [{ name: "魔法力", value: "37" }, { name: "クリダメ", value: "50%" }] },
  "破壊者の目": { slot: "武器", rank: "UR4", abilities: [{ name: "魔法力", value: "37" }, { name: "魔法力%", value: "25%" }] },
  "魔王の禁書": { slot: "武器", rank: "UR4", abilities: [{ name: "魔法力", value: "37" }, { name: "魔法力", value: "37" }] },
  "不屈の鎧": { slot: "鎧", rank: "UR4", abilities: [{ name: "防御力%", value: "9%" }, { name: "防御力%", value: "9%" }] },
  "海神の鱗": { slot: "鎧", rank: "UR4", abilities: [{ name: "防御力%", value: "9%" }, { name: "HP実数", value: "270" }] },
  "不死の黄甲": { slot: "鎧", rank: "UR4", abilities: [{ name: "防御力%", value: "9%" }, { name: "HP%", value: "30%" }] },
  "魔手の加護": { slot: "鎧", rank: "UR4", abilities: [{ name: "魔法抵抗", value: "9%" }, { name: "魔法抵抗", value: "9%" }] },
  "死神の寿衣": { slot: "鎧", rank: "UR4", abilities: [{ name: "魔法抵抗", value: "9%" }, { name: "HP実数", value: "270" }] },
  "業火のローブ": { slot: "鎧", rank: "UR4", abilities: [{ name: "魔法抵抗", value: "9%" }, { name: "HP%", value: "30%" }] },
  "殺戮の兜": { slot: "頭", rank: "UR4", abilities: [{ name: "防御力%", value: "9%" }, { name: "防御力%", value: "9%" }] },
  "不敗の栄光": { slot: "頭", rank: "UR4", abilities: [{ name: "防御力%", value: "9%" }, { name: "HP実数", value: "270" }] },
  "死の兜": { slot: "頭", rank: "UR4", abilities: [{ name: "防御力%", value: "9%" }, { name: "HP%", value: "30%" }] },
  "知恵の光輝": { slot: "頭", rank: "UR4", abilities: [{ name: "魔法抵抗", value: "9%" }, { name: "魔法抵抗", value: "9%" }] },
  "太陽の威光": { slot: "頭", rank: "UR4", abilities: [{ name: "魔法抵抗", value: "9%" }, { name: "HP実数", value: "270" }] },
  "銀河の王冠": { slot: "頭", rank: "UR4", abilities: [{ name: "魔法抵抗", value: "9%" }, { name: "HP%", value: "30%" }] },
  "毒蛇の手": { slot: "装飾", rank: "UR4", abilities: [{ name: "クリダメ", value: "50%" }, { name: "クリダメ", value: "50%" }] },
  "湖の指輪": { slot: "装飾", rank: "UR4", abilities: [{ name: "クリダメ", value: "50%" }, { name: "HP実数", value: "270" }] },
  "魅惑のまなざし": { slot: "装飾", rank: "UR4", abilities: [{ name: "クリダメ", value: "50%" }, { name: "HP%", value: "30%" }] },
  "火鉢のぬくもり": { slot: "装飾", rank: "UR4", abilities: [{ name: "クリ率", value: "8.33%" }, { name: "クリ率", value: "8.33%" }] },
  "美学の極み": { slot: "装飾", rank: "UR4", abilities: [{ name: "クリ率", value: "8.33%" }, { name: "HP実数", value: "270" }] },
  "調和の約束": { slot: "装飾", rank: "UR4", abilities: [{ name: "クリ率", value: "8.33%" }, { name: "HP%", value: "30%" }] },
  "反逆の決意": { slot: "腕", rank: "UR4", abilities: [{ name: "攻撃力%", value: "25%" }, { name: "クリ率", value: "8.33%" }] },
  "神王の銀腕": { slot: "腕", rank: "UR4", abilities: [{ name: "攻撃力%", value: "25%" }, { name: "攻撃力%", value: "25%" }] },
  "主神の威厳": { slot: "腕", rank: "UR4", abilities: [{ name: "攻撃力%", value: "25%" }, { name: "攻撃力", value: "37" }] },
  "怒りの輪": { slot: "腕", rank: "UR4", abilities: [{ name: "魔法力%", value: "25%" }, { name: "クリ率", value: "8.33%" }] },
  "裏切りの束縛": { slot: "腕", rank: "UR4", abilities: [{ name: "魔法力%", value: "25%" }, { name: "魔法力%", value: "25%" }] },
  "守護の龍鱗": { slot: "腕", rank: "UR4", abilities: [{ name: "魔法力%", value: "25%" }, { name: "魔法力", value: "37" }] }
};
// 装備名一覧(スロット問わず全て。表示用にスロット名を付記する)
function equipmentNameOptionsHtml() {
  return Object.keys(EQUIPMENT_DATA).map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}(${escapeHtml(EQUIPMENT_DATA[name].slot)})</option>`).join('');
}
// 装備部位の自動入力時に付ける絵文字
const PART_EMOJI = { '武器': '⚔️', '鎧': '🛡️', '頭': '🪖', '装飾': '💍', '腕': '🦾' };
function partEmojiLabel(slot) {
  return slot ? `${PART_EMOJI[slot] || ''}${slot}` : '';
}

// ---------- アクセス(2経路) ----------
function showMainContent() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('mainContent').style.display = 'block';
}
function showLoginScreen() {
  document.getElementById('loginScreen').style.display = 'block';
  document.getElementById('mainContent').style.display = 'none';
}

document.getElementById('gateBtn').addEventListener('click', async () => {
  const statusEl = document.getElementById('gateStatus');
  const input = document.getElementById('gatePassword').value;
  if (!input) { statusEl.className = 'status err'; statusEl.textContent = 'パスワードを入力してください。'; return; }
  try {
    const snap = await getDoc(doc(collection(db, "goldFarming"), "config"));
    const data = snap.exists() ? snap.data() : {};
    const inputHash = await sha256Hex(input);
    const matched = (data.passwordHash && inputHash === data.passwordHash) ||
                    (!data.passwordHash && data.password && input === data.password);
    if (matched) {
      sessionStorage.setItem(SESSION_KEY, '1');
      showMainContent();
      await bootstrapAndLoad();
    } else {
      statusEl.className = 'status err';
      statusEl.textContent = 'パスワードが違います。';
    }
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
  try {
    await signInWithEmailAndPassword(auth, idToEmail(id), password);
  } catch (e) {
    statusEl.className = 'status err';
    statusEl.textContent = 'ログインに失敗しました。IDかパスワードが間違っています。';
  }
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
  sessionStorage.removeItem(SESSION_KEY);
  if (auth.currentUser) await signOut(auth);
  isAdmin = false; editModeOn = false;
  showLoginScreen();
});

onAuthStateChanged(auth, async (user) => {
  if (user) {
    showMainContent();
    document.getElementById('connNote').textContent = '読み込み中...';
    try {
      const email = (user.email || '').toLowerCase();
      const adminSnap = await getDoc(doc(adminsCol, email));
      isAdmin = adminSnap.exists();
    } catch (e) { isAdmin = false; }
    document.getElementById('manageBtn').style.display = isAdmin ? '' : 'none';
    if (!isAdmin) editModeOn = false;
    await bootstrapAndLoad();
    document.getElementById('connNote').textContent = '';
  } else {
    isAdmin = false;
    document.getElementById('manageBtn').style.display = 'none';
    if (sessionStorage.getItem(SESSION_KEY) === '1') {
      showMainContent();
      await bootstrapAndLoad();
    } else {
      showLoginScreen();
    }
  }
});

document.getElementById('manageBtn').addEventListener('click', () => {
  editModeOn = !editModeOn;
  document.getElementById('manageBtn').textContent = editModeOn ? '管理者用:編集を終了' : '管理者用:編集を開始';
  renderAll();
});

// ---------- 読み込み ----------
async function bootstrapAndLoad() {
  await loadDamageCalcChars();
  await loadContent();
}

async function loadDamageCalcChars() {
  try {
    const snap = await getDocs(damageCalcCharactersCol);
    damageCalcCharsCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    damageCalcCharsCache.sort((a, b) => (b.priority || 0) - (a.priority || 0) || a.name.localeCompare(b.name, 'ja'));
  } catch (e) {
    damageCalcCharsCache = [];
  }
}

async function loadContent() {
  try {
    const snap = await getDoc(doc(raidMustHavesCol, "content"));
    if (snap.exists()) {
      const data = snap.data();
      contentData.characters = data.characters || [];
      contentData.charactersAnnotation = data.charactersAnnotation || '';
      contentData.equipmentLevels = data.equipmentLevels || [];
    }
  } catch (e) {
    console.error('load error', e);
  }
  if (!contentData.equipmentLevels.length) {
    contentData.equipmentLevels = [0, 1, 2, 3, 4].map(n => ({ id: uid(), label: `レベル${n}`, rows: [], annotation: '' }));
  }
  renderAll();
}

async function saveContent() {
  await setDoc(doc(raidMustHavesCol, "content"), contentData);
}

function renderAll() {
  renderCharSelects();
  renderCharTable();
  renderGearLevels();
  document.getElementById('charAddRow').style.display = (isAdmin && editModeOn) ? 'flex' : 'none';
  document.getElementById('addLevelBtn').style.display = (isAdmin && editModeOn) ? '' : 'none';
  document.getElementById('charAnnotationBox').innerHTML = contentData.charactersAnnotation || '';
  document.getElementById('charAnnotationInput').value = contentData.charactersAnnotation || '';
  document.getElementById('charAnnotationEdit').style.display = (isAdmin && editModeOn) ? 'block' : 'none';
}

document.getElementById('charAnnotationSaveBtn').addEventListener('click', async () => {
  contentData.charactersAnnotation = document.getElementById('charAnnotationInput').value;
  await saveContent();
  document.getElementById('charAnnotationBox').innerHTML = contentData.charactersAnnotation || '';
});

// ==================================================================
// Essential Characters
// ==================================================================
function renderCharSelects() {
  const charSel = document.getElementById('charNewCharSelect');
  charSel.innerHTML = '<option value="">キャラを選択</option>' +
    damageCalcCharsCache.map(c => `<option value="${c.id}">${escapeHtml(attrCharName(c.name, c.attribute))}</option>`).join('');
  updateSkillSelect();
}
function updateSkillSelect() {
  const charId = document.getElementById('charNewCharSelect').value;
  const c = damageCalcCharsCache.find(x => x.id === charId);
  const skillSel = document.getElementById('charNewSkillSelect');
  if (!c) { skillSel.innerHTML = '<option value="">コスを選択(参考用)</option>'; return; }
  skillSel.innerHTML = '<option value="">コスを選択(参考用)</option>' +
    (c.skills || []).map((s, i) => `<option value="${i}">${escapeHtml(s.skillName)}</option>`).join('');
}
document.getElementById('charNewCharSelect').addEventListener('change', updateSkillSelect);
document.getElementById('charNewSkillSelect').addEventListener('change', () => {
  const charId = document.getElementById('charNewCharSelect').value;
  const c = damageCalcCharsCache.find(x => x.id === charId);
  const skillIdx = document.getElementById('charNewSkillSelect').value;
  if (!c || skillIdx === '') return;
  document.getElementById('charNewSkillText').value = (c.skills || [])[Number(skillIdx)]?.skillName || '';
});

document.getElementById('charAddBtn').addEventListener('click', async () => {
  const charId = document.getElementById('charNewCharSelect').value;
  const c = damageCalcCharsCache.find(x => x.id === charId);
  const skillName = document.getElementById('charNewSkillText').value.trim();
  if (!c || !skillName) { alert('キャラを選択し、コス名を入力してください。'); return; }
  // 同じキャラが既に登録されていれば、その優先度を引き継ぐ(優先度はキャラ単位のため)
  const existing = contentData.characters.find(x => x.charName === c.name);
  contentData.characters.push({
    id: uid(), charId, charName: c.name, attribute: c.attribute, skillName,
    recommendedCopies: Number(document.getElementById('charNewCopies').value) || 0,
    tearsOfGoddess: document.getElementById('charNewTears').value.trim(),
    priority: existing ? (existing.priority || 0) : 0,
    comment: document.getElementById('charNewComment').value.trim()
  });
  document.getElementById('charNewSkillSelect').value = '';
  document.getElementById('charNewSkillText').value = '';
  document.getElementById('charNewTears').value = '';
  document.getElementById('charNewComment').value = '';
  await saveContent();
  renderCharTable();
});

let editingCharRowIndex = null;
let editingPriorityGroupIndex = null; // 星評価を編集中のグループの先頭行インデックス
let editingGearRow = null; // { levelId, rowId } 装備一覧で編集中の行

function renderCharTable() {
  const table = document.getElementById('charTable');
  const rows = contentData.characters || [];
  const showActions = isAdmin && editModeOn;
  if (!rows.length) { table.innerHTML = '<tr><td class="empty">まだ登録がありません。</td></tr>'; return; }
  let html = `<tr><th>キャラ名</th><th>コス名</th><th>推奨凸数</th><th>女神の涙</th><th>コメント</th>${showActions ? '<th style="width:150px;">操作</th>' : ''}</tr>`;
  let groupIndex = -1;
  rows.forEach((r, i) => {
    // 同じキャラ名が続く間は同じグループとみなし、グループ単位で背景色を交互にする(結合セルとの見た目のズレを防ぐため)
    if (i === 0 || rows[i - 1].charName !== r.charName) groupIndex++;
    const grpClass = groupIndex % 2 === 0 ? 'grp-a' : 'grp-b';
    const isEditing = editingCharRowIndex === i;
    // 編集中の行がある間は、テーブル全体のセル結合を一時的に解除する(結合セルの中身は編集できないため)
    const mergeDisabled = editingCharRowIndex != null;
    const sameAsPrev = !mergeDisabled && i > 0 && rows[i - 1].charName === r.charName;
    let charCellHtml = '';
    if (isEditing) {
      const charOptions = damageCalcCharsCache.map(c => `<option value="${c.id}" ${c.id === r.charId ? 'selected' : ''}>${escapeHtml(attrCharName(c.name, c.attribute))}</option>`).join('');
      charCellHtml = `<td class="c-char"><select class="e-char">${charOptions}</select></td>`;
    } else if (!sameAsPrev) {
      let span = 1;
      while (!mergeDisabled && i + span < rows.length && rows[i + span].charName === r.charName) span++;
      const isFirstGroup = i === 0;
      const isLastGroup = i + span >= rows.length;
      const moveBtns = (showActions && !mergeDisabled) ? `
        <div class="charGroupMove">
          <button class="small" data-action="up-chargroup" data-i="${i}" ${isFirstGroup ? 'disabled' : ''} title="キャラ単位で上に移動">キャラ↑</button>
          <button class="small" data-action="down-chargroup" data-i="${i}" ${isLastGroup ? 'disabled' : ''} title="キャラ単位で下に移動">キャラ↓</button>
        </div>` : '';
      const isEditingPriority = editingPriorityGroupIndex === i;
      let priorityHtml;
      if (isEditingPriority) {
        priorityHtml = `<div class="charPriorityEdit">
          <select class="e-groupPriority" style="color:${priorityColor(r.priority || 0)}; font-weight:700;">${PRIORITY_STARS.map((s, n) => `<option value="${n}" ${n===(r.priority||0)?'selected':''}>${s}</option>`).join('')}</select>
          <button class="small primary" data-action="save-priority" data-i="${i}">保存</button>
        </div>`;
      } else {
        priorityHtml = `<div class="charPriorityDisplay" style="color:${priorityColor(r.priority || 0)};">${PRIORITY_STARS[r.priority || 0]}${(showActions && !mergeDisabled) ? ` <button class="small" data-action="edit-priority" data-i="${i}" title="星評価を変更">★変更</button>` : ''}</div>`;
      }
      charCellHtml = `<td class="c-char" rowspan="${span}">${priorityHtml}${escapeHtml(attrCharName(r.charName, r.attribute))}${moveBtns}</td>`;
    }
    html += `<tr class="${grpClass}" data-i="${i}">
      ${charCellHtml}`;
    if (isEditing) {
      html += `<td class="c-skill"><input type="text" class="e-skill" value="${escapeHtml(r.skillName)}"></td>
        <td class="c-copies"><select class="e-copies">${[0,1,2,3,4,5].map(n => `<option value="${n}" ${n===r.recommendedCopies?'selected':''}>${n}凸</option>`).join('')}</select></td>
        <td class="c-tears"><input type="text" class="e-tears" value="${escapeHtml(r.tearsOfGoddess)}"></td>
        <td class="c-comment"><input type="text" class="e-comment" value="${escapeHtml(r.comment)}"></td>`;
    } else {
      html += `<td class="c-skill">${escapeHtml(r.skillName)}</td>
        <td class="c-copies">${r.recommendedCopies}凸</td>
        <td class="c-tears">${escapeHtml(r.tearsOfGoddess)}</td>
        <td class="c-comment">${escapeHtml(r.comment)}</td>`;
    }
    if (showActions) {
      if (isEditing) {
        html += `<td class="c-actions">
          <button class="small primary" data-action="save-char" data-i="${i}">保存</button>
          <button class="small" data-action="cancel-char" data-i="${i}">キャンセル</button>
        </td>`;
      } else {
        html += `<td class="c-actions">
          <button class="small" data-action="edit-char" data-i="${i}">編集</button>
          <button class="small danger" data-action="del-char" data-i="${i}">削除</button>
          <button class="small" data-action="up-char" data-i="${i}" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button class="small" data-action="down-char" data-i="${i}" ${i === rows.length - 1 ? 'disabled' : ''}>↓</button>
        </td>`;
      }
    }
    html += `</tr>`;
  });
  table.innerHTML = html;
  table.querySelectorAll('[data-action="edit-char"]').forEach(btn => btn.addEventListener('click', () => {
    editingCharRowIndex = Number(btn.dataset.i);
    renderCharTable();
  }));
  table.querySelectorAll('[data-action="cancel-char"]').forEach(btn => btn.addEventListener('click', () => {
    editingCharRowIndex = null;
    renderCharTable();
  }));
  table.querySelectorAll('[data-action="save-char"]').forEach(btn => btn.addEventListener('click', async () => {
    const i = Number(btn.dataset.i);
    const tr = table.querySelector(`tr[data-i="${i}"]`);
    const r = contentData.characters[i];
    const charSel = tr.querySelector('.e-char');
    if (charSel) {
      const c = damageCalcCharsCache.find(x => x.id === charSel.value);
      if (c) { r.charId = c.id; r.charName = c.name; r.attribute = c.attribute; }
    }
    r.skillName = tr.querySelector('.e-skill').value.trim();
    r.recommendedCopies = Number(tr.querySelector('.e-copies').value) || 0;
    r.tearsOfGoddess = tr.querySelector('.e-tears').value.trim();
    r.comment = tr.querySelector('.e-comment').value.trim();
    editingCharRowIndex = null;
    await saveContent();
    renderCharTable();
  }));
  table.querySelectorAll('[data-action="edit-priority"]').forEach(btn => btn.addEventListener('click', () => {
    editingPriorityGroupIndex = Number(btn.dataset.i);
    renderCharTable();
  }));
  table.querySelectorAll('[data-action="save-priority"]').forEach(btn => btn.addEventListener('click', async () => {
    const i = Number(btn.dataset.i);
    const tr = table.querySelector(`tr[data-i="${i}"]`);
    const newPriority = Number(tr.querySelector('.e-groupPriority').value) || 0;
    const charName = contentData.characters[i].charName;
    // 優先度はキャラ単位のため、同じキャラ名の行すべてに同じ値を反映する
    contentData.characters.forEach(r => { if (r.charName === charName) r.priority = newPriority; });
    editingPriorityGroupIndex = null;
    await saveContent();
    renderCharTable();
  }));
  table.querySelectorAll('[data-action="del-char"]').forEach(btn => btn.addEventListener('click', async () => {
    if (!confirm('この行を削除しますか?')) return;
    contentData.characters.splice(Number(btn.dataset.i), 1);
    await saveContent(); renderCharTable();
  }));
  table.querySelectorAll('[data-action="up-char"]').forEach(btn => btn.addEventListener('click', async () => {
    const i = Number(btn.dataset.i);
    [contentData.characters[i - 1], contentData.characters[i]] = [contentData.characters[i], contentData.characters[i - 1]];
    await saveContent(); renderCharTable();
  }));
  table.querySelectorAll('[data-action="down-char"]').forEach(btn => btn.addEventListener('click', async () => {
    const i = Number(btn.dataset.i);
    [contentData.characters[i + 1], contentData.characters[i]] = [contentData.characters[i], contentData.characters[i + 1]];
    await saveContent(); renderCharTable();
  }));
  table.querySelectorAll('[data-action="up-chargroup"]').forEach(btn => btn.addEventListener('click', async () => {
    moveCharGroup(Number(btn.dataset.i), -1);
    await saveContent(); renderCharTable();
  }));
  table.querySelectorAll('[data-action="down-chargroup"]').forEach(btn => btn.addEventListener('click', async () => {
    moveCharGroup(Number(btn.dataset.i), 1);
    await saveContent(); renderCharTable();
  }));
}

// headIndex(そのキャラグループの先頭行のインデックス)を、隣接するキャラグループとまとめて入れ替える
function moveCharGroup(headIndex, direction) {
  const rows = contentData.characters;
  const groups = [];
  let idx = 0;
  while (idx < rows.length) {
    let len = 1;
    while (idx + len < rows.length && rows[idx + len].charName === rows[idx].charName) len++;
    groups.push({ start: idx, len });
    idx += len;
  }
  const gi = groups.findIndex(g => g.start === headIndex);
  if (gi === -1) return;
  const targetGi = gi + direction;
  if (targetGi < 0 || targetGi >= groups.length) return;
  const [earlier, later] = direction === -1 ? [groups[targetGi], groups[gi]] : [groups[gi], groups[targetGi]];
  contentData.characters = [
    ...rows.slice(0, earlier.start),
    ...rows.slice(later.start, later.start + later.len),
    ...rows.slice(earlier.start, earlier.start + earlier.len),
    ...rows.slice(later.start + later.len)
  ];
}

// ==================================================================
// Priority Gear Sets
// ==================================================================
function blankGearRow() {
  return { id: uid(), part: '', name: '', quality: '伝説', grade: '', subopt: '', comment: '' };
}

function renderGearLevels() {
  const area = document.getElementById('gearLevelsArea');
  const showActions = isAdmin && editModeOn;
  if (!contentData.equipmentLevels.length) { area.innerHTML = '<div class="empty">まだレベルがありません。</div>'; return; }
  area.innerHTML = contentData.equipmentLevels.map((lvl, li) => `
    <div class="gearLevel" data-level="${lvl.id}">
      <div class="levelHead">
        <h3 class="c-levelLabel">${escapeHtml(lvl.label)}</h3>
        ${showActions ? `<button class="small" data-action="rename-level" data-level="${lvl.id}">名前変更</button>
        <button class="small" data-action="duplicate-level" data-level="${lvl.id}">複製</button>
        <button class="small" data-action="up-level" data-level="${lvl.id}" ${li === 0 ? 'disabled' : ''} title="上に移動">↑</button>
        <button class="small" data-action="down-level" data-level="${lvl.id}" ${li === contentData.equipmentLevels.length - 1 ? 'disabled' : ''} title="下に移動">↓</button>
        <button class="small danger" data-action="del-level" data-level="${lvl.id}">レベルを削除</button>` : ''}
      </div>
      <div class="table-wrap gearTableWrap"><table class="gearTable" data-level="${lvl.id}">${gearTableHtml(lvl, showActions)}</table></div>
      ${showActions ? gearAddRowHtml(lvl.id) : ''}
      <div class="c-annotationBox annotationBox" data-level="${lvl.id}">${lvl.annotation || ''}</div>
      ${showActions ? `<div class="annotationEdit">
        <textarea class="c-annotationInput" data-level="${lvl.id}" rows="2" placeholder="注釈(HTMLタグで文字色指定可。例: &lt;span style=&quot;color:#ff8080&quot;&gt;注意&lt;/span&gt;)">${escapeHtml(lvl.annotation || '')}</textarea>
        <button class="small primary" data-action="save-annotation" data-level="${lvl.id}" style="margin-top:4px;">注釈を保存</button>
      </div>` : ''}
    </div>
  `).join('');
  bindGearLevelActions();
}

// 改行を含む可能性がある表示用セルHTML(white-space:pre-wrapで改行をそのまま反映)
function multilineCellHtml(value, extraClass, extraAttrs) {
  return `<td class="multilineCell${extraClass ? ' ' + extraClass : ''}"${extraAttrs || ''}>${escapeHtml(value)}</td>`;
}

// 装備名セル: icons/フォルダに「装備名.png」と同名の画像があれば、名前の左にアイコンを表示する
// (画像が見つからない場合はonerrorで非表示にする。装備名が空の時はアイコンも出さない)
function nameCellHtml(value) {
  const trimmed = (value || '').trim();
  const iconHtml = trimmed ? `<img src="icons/${encodeURIComponent(trimmed)}.png" class="gearIcon" alt="" onerror="this.style.display='none'">` : '';
  return `<td class="multilineCell nameCell">${iconHtml}${escapeHtml(value)}</td>`;
}

function gearTableHtml(lvl, showActions) {
  let html = `<tr>
    <th>装備名</th><th>装備部位</th><th>品質</th><th>等級</th><th>サブオプション</th><th>コメント</th>
    ${showActions ? '<th style="width:110px;">操作</th>' : ''}
  </tr>`;
  lvl.rows.forEach((r, i) => {
    const grpClass = i % 2 === 0 ? 'grp-a' : 'grp-b';
    const isKensenFuyou = r.subopt === '厳選不要';
    html += `<tr class="${grpClass}">
      ${nameCellHtml(r.name)}
      ${multilineCellHtml(r.part)}
      ${multilineCellHtml(r.quality)}
      ${multilineCellHtml(r.grade)}
      <td class="multilineCell suboptCell${isKensenFuyou ? ' kensenFuyou' : ''}">${escapeHtml(r.subopt)}</td>
      ${multilineCellHtml(r.comment)}`;
    if (showActions) {
      html += `<td>
        <button class="small" data-action="edit-row" data-level="${lvl.id}" data-row="${r.id}">編集</button>
        <button class="small" data-action="duplicate-row" data-level="${lvl.id}" data-row="${r.id}">複製</button>
        <button class="small danger" data-action="del-row" data-level="${lvl.id}" data-row="${r.id}">削除</button>
        <button class="small" data-action="up-row" data-level="${lvl.id}" data-row="${r.id}" ${i === 0 ? 'disabled' : ''}>↑</button>
        <button class="small" data-action="down-row" data-level="${lvl.id}" data-row="${r.id}" ${i === lvl.rows.length - 1 ? 'disabled' : ''}>↓</button>
      </td>`;
    }
    html += `</tr>`;
  });
  return html;
}

function gearAddRowHtml(levelId) {
  const isEditingThisLevel = editingGearRow && editingGearRow.levelId === levelId;
  const lvl = contentData.equipmentLevels.find(l => l.id === levelId);
  const editRow = isEditingThisLevel ? lvl.rows.find(r => r.id === editingGearRow.rowId) : null;
  const v = (field) => editRow ? escapeHtml(editRow[field] || '') : '';
  const qualityValue = editRow ? escapeHtml(editRow.quality || '伝説') : '伝説';
  return `<div class="addRowBar" data-level="${levelId}">
    <textarea class="f-newPart" rows="2" placeholder="装備部位(改行OK。装備名選択で自動入力)" style="max-width:110px;">${v('part')}</textarea>
    <select class="f-newNameSelect" style="max-width:150px;">
      <option value="">装備名を選択(参考用)</option>
      <option value="専用装備">専用装備</option>
      ${equipmentNameOptionsHtml()}
    </select>
    <textarea class="f-newName" rows="2" placeholder="装備名(自由入力可・改行OK)" style="max-width:150px;">${v('name')}</textarea>
    <input type="text" class="f-newQuality" placeholder="品質" style="max-width:90px;" value="${qualityValue}">
    <textarea class="f-newGrade" rows="2" placeholder="等級(改行OK)" style="max-width:100px;">${v('grade')}</textarea>
    <textarea class="f-newSubopt" rows="2" placeholder="サブオプション(改行OK)" style="max-width:150px;">${v('subopt')}</textarea>
    <textarea class="f-newComment" rows="2" placeholder="コメント(改行OK)" style="max-width:200px;">${v('comment')}</textarea>
    <button class="small primary" data-action="add-row" data-level="${levelId}">${editRow ? '変更を保存' : '+ 行を追加'}</button>
    ${editRow ? `<button class="small" data-action="cancel-edit-row" data-level="${levelId}">編集をキャンセル</button>` : ''}
  </div>`;
}

function bindGearLevelActions() {
  const area = document.getElementById('gearLevelsArea');

  // 装備名を選択すると、自由入力欄(名前・部位)に自動で入力する。専用装備の場合は部位を空のままにする
  area.querySelectorAll('.addRowBar').forEach(bar => {
    const sel = bar.querySelector('.f-newNameSelect');
    const txt = bar.querySelector('.f-newName');
    const partTxt = bar.querySelector('.f-newPart');
    if (sel && txt) sel.addEventListener('change', () => {
      if (!sel.value) return;
      txt.value = sel.value;
      if (partTxt) partTxt.value = EQUIPMENT_DATA[sel.value] ? partEmojiLabel(EQUIPMENT_DATA[sel.value].slot) : '';
    });
  });

  area.querySelectorAll('[data-action="add-row"]').forEach(btn => btn.addEventListener('click', async () => {
    const levelId = btn.dataset.level;
    const bar = area.querySelector(`.addRowBar[data-level="${levelId}"]`);
    const lvl = contentData.equipmentLevels.find(l => l.id === levelId);
    if (!lvl) return;
    const isEditing = editingGearRow && editingGearRow.levelId === levelId;
    const row = isEditing ? lvl.rows.find(r => r.id === editingGearRow.rowId) : blankGearRow();
    if (!row) return;
    row.part = bar.querySelector('.f-newPart').value.trim();
    row.name = bar.querySelector('.f-newName').value.trim();
    row.quality = bar.querySelector('.f-newQuality').value.trim();
    row.grade = bar.querySelector('.f-newGrade').value.trim();
    row.subopt = bar.querySelector('.f-newSubopt').value.trim();
    row.comment = bar.querySelector('.f-newComment').value.trim();
    if (!isEditing) lvl.rows.push(row);
    editingGearRow = null;
    await saveContent();
    renderGearLevels();
  }));

  area.querySelectorAll('[data-action="edit-row"]').forEach(btn => btn.addEventListener('click', () => {
    editingGearRow = { levelId: btn.dataset.level, rowId: btn.dataset.row };
    renderGearLevels();
  }));
  area.querySelectorAll('[data-action="cancel-edit-row"]').forEach(btn => btn.addEventListener('click', () => {
    editingGearRow = null;
    renderGearLevels();
  }));
  area.querySelectorAll('[data-action="duplicate-row"]').forEach(btn => btn.addEventListener('click', async () => {
    const lvl = contentData.equipmentLevels.find(l => l.id === btn.dataset.level);
    if (!lvl) return;
    const i = lvl.rows.findIndex(r => r.id === btn.dataset.row);
    if (i === -1) return;
    const copy = { ...lvl.rows[i], id: uid() };
    lvl.rows.splice(i + 1, 0, copy); // その装備の真下に挿入
    await saveContent();
    renderGearLevels();
  }));

  area.querySelectorAll('[data-action="del-row"]').forEach(btn => btn.addEventListener('click', async () => {
    if (!confirm('この行を削除しますか?')) return;
    const lvl = contentData.equipmentLevels.find(l => l.id === btn.dataset.level);
    if (!lvl) return;
    lvl.rows = lvl.rows.filter(r => r.id !== btn.dataset.row);
    if (editingGearRow && editingGearRow.rowId === btn.dataset.row) editingGearRow = null;
    await saveContent(); renderGearLevels();
  }));
  area.querySelectorAll('[data-action="up-row"]').forEach(btn => btn.addEventListener('click', async () => {
    const lvl = contentData.equipmentLevels.find(l => l.id === btn.dataset.level);
    if (!lvl) return;
    const i = lvl.rows.findIndex(r => r.id === btn.dataset.row);
    if (i <= 0) return;
    [lvl.rows[i - 1], lvl.rows[i]] = [lvl.rows[i], lvl.rows[i - 1]];
    await saveContent(); renderGearLevels();
  }));
  area.querySelectorAll('[data-action="down-row"]').forEach(btn => btn.addEventListener('click', async () => {
    const lvl = contentData.equipmentLevels.find(l => l.id === btn.dataset.level);
    if (!lvl) return;
    const i = lvl.rows.findIndex(r => r.id === btn.dataset.row);
    if (i === -1 || i >= lvl.rows.length - 1) return;
    [lvl.rows[i + 1], lvl.rows[i]] = [lvl.rows[i], lvl.rows[i + 1]];
    await saveContent(); renderGearLevels();
  }));

  area.querySelectorAll('[data-action="rename-level"]').forEach(btn => btn.addEventListener('click', () => {
    const wrap = area.querySelector(`.gearLevel[data-level="${btn.dataset.level}"] .c-levelLabel`);
    const lvl = contentData.equipmentLevels.find(l => l.id === btn.dataset.level);
    wrap.innerHTML = `<input type="text" class="e-levelLabel" value="${escapeHtml(lvl.label)}" style="max-width:200px; display:inline-block;">
      <button class="small primary e-save">保存</button>`;
    wrap.querySelector('.e-save').addEventListener('click', async () => {
      lvl.label = wrap.querySelector('.e-levelLabel').value.trim() || lvl.label;
      await saveContent(); renderGearLevels();
    });
  }));
  area.querySelectorAll('[data-action="duplicate-level"]').forEach(btn => btn.addEventListener('click', async () => {
    const levels = contentData.equipmentLevels;
    const i = levels.findIndex(l => l.id === btn.dataset.level);
    if (i === -1) return;
    const original = levels[i];
    const copy = {
      id: uid(),
      label: `${original.label}(コピー)`,
      annotation: original.annotation || '',
      rows: (original.rows || []).map(r => ({ ...r, id: uid() }))
    };
    levels.splice(i + 1, 0, copy); // 元のレベルのすぐ下に挿入
    await saveContent(); renderGearLevels();
  }));
  area.querySelectorAll('[data-action="del-level"]').forEach(btn => btn.addEventListener('click', async () => {
    if (!confirm('このレベルを削除しますか?(中の行も全て削除されます)')) return;
    contentData.equipmentLevels = contentData.equipmentLevels.filter(l => l.id !== btn.dataset.level);
    await saveContent(); renderGearLevels();
  }));
  area.querySelectorAll('[data-action="up-level"]').forEach(btn => btn.addEventListener('click', async () => {
    const levels = contentData.equipmentLevels;
    const i = levels.findIndex(l => l.id === btn.dataset.level);
    if (i <= 0) return;
    [levels[i - 1], levels[i]] = [levels[i], levels[i - 1]];
    await saveContent(); renderGearLevels();
  }));
  area.querySelectorAll('[data-action="down-level"]').forEach(btn => btn.addEventListener('click', async () => {
    const levels = contentData.equipmentLevels;
    const i = levels.findIndex(l => l.id === btn.dataset.level);
    if (i === -1 || i >= levels.length - 1) return;
    [levels[i + 1], levels[i]] = [levels[i], levels[i + 1]];
    await saveContent(); renderGearLevels();
  }));
  area.querySelectorAll('[data-action="save-annotation"]').forEach(btn => btn.addEventListener('click', async () => {
    const lvl = contentData.equipmentLevels.find(l => l.id === btn.dataset.level);
    if (!lvl) return;
    const textarea = area.querySelector(`.c-annotationInput[data-level="${btn.dataset.level}"]`);
    lvl.annotation = textarea.value;
    await saveContent(); renderGearLevels();
  }));
}

document.getElementById('addLevelBtn').addEventListener('click', async () => {
  contentData.equipmentLevels.push({ id: uid(), label: `レベル${contentData.equipmentLevels.length}`, rows: [], annotation: '' });
  await saveContent();
  renderGearLevels();
});
