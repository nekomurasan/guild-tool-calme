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
let contentData = { characters: [], equipmentLevels: [] };
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
}

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
  contentData.characters.push({
    id: uid(), charId, charName: c.name, attribute: c.attribute, skillName,
    recommendedCopies: Number(document.getElementById('charNewCopies').value) || 0,
    tearsOfGoddess: document.getElementById('charNewTears').value.trim(),
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

function renderCharTable() {
  const table = document.getElementById('charTable');
  const rows = contentData.characters || [];
  const showActions = isAdmin && editModeOn;
  if (!rows.length) { table.innerHTML = '<tr><td class="empty">まだ登録がありません。</td></tr>'; return; }
  let html = `<tr><th>キャラ名</th><th>コス名</th><th>推奨凸数</th><th>女神の涙</th><th>コメント</th>${showActions ? '<th style="width:150px;">操作</th>' : ''}</tr>`;
  rows.forEach((r, i) => {
    const grpClass = i % 2 === 0 ? 'grp-a' : 'grp-b';
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
      charCellHtml = `<td class="c-char" rowspan="${span}">${escapeHtml(attrCharName(r.charName, r.attribute))}</td>`;
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
}

// ==================================================================
// Priority Gear Sets
// ==================================================================
function blankGearRow() {
  return {
    id: uid(), targetChar: '', damageType: '物理',
    weapon: { grade: '', subopt: '' }, arm: { grade: '', subopt: '' },
    accessory: { grade: '', subopt: '' }, armor: { grade: '', subopt: '' }, head: { grade: '', subopt: '' },
    mergedEnabled: false, mergedComment: ''
  };
}

function renderGearLevels() {
  const area = document.getElementById('gearLevelsArea');
  const showActions = isAdmin && editModeOn;
  if (!contentData.equipmentLevels.length) { area.innerHTML = '<div class="empty">まだレベルがありません。</div>'; return; }
  area.innerHTML = contentData.equipmentLevels.map((lvl) => `
    <div class="gearLevel" data-level="${lvl.id}">
      <div class="levelHead">
        <h3 class="c-levelLabel">${escapeHtml(lvl.label)}</h3>
        ${showActions ? `<button class="small" data-action="rename-level" data-level="${lvl.id}">名前変更</button>
        <button class="small danger" data-action="del-level" data-level="${lvl.id}">レベルを削除</button>` : ''}
      </div>
      <div class="table-wrap"><table class="gearTable" data-level="${lvl.id}">${gearTableHtml(lvl, showActions)}</table></div>
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

function gearTableHtml(lvl, showActions) {
  let html = `<tr>
    <th>想定キャラ</th><th>物理/魔法</th>
    <th>武器等級</th><th>武器サブオプ</th>
    <th>腕等級</th><th>腕サブオプ</th>
    <th>装飾等級</th><th>装飾サブオプ</th>
    <th>鎧等級</th><th>鎧サブオプ</th>
    <th>頭等級</th><th>頭サブオプ</th>
    ${showActions ? '<th style="width:110px;">操作</th>' : ''}
  </tr>`;
  lvl.rows.forEach((r, i) => {
    const grpClass = i % 2 === 0 ? 'grp-a' : 'grp-b';
    html += `<tr class="${grpClass}">
      <td>${escapeHtml(r.targetChar)}</td><td>${escapeHtml(r.damageType)}</td>
      <td>${escapeHtml(r.weapon.grade)}</td><td>${escapeHtml(r.weapon.subopt)}</td>
      <td>${escapeHtml(r.arm.grade)}</td><td>${escapeHtml(r.arm.subopt)}</td>
      <td>${escapeHtml(r.accessory.grade)}</td><td>${escapeHtml(r.accessory.subopt)}</td>`;
    if (r.mergedEnabled) {
      html += `<td colspan="4" class="mergedCell">${escapeHtml(r.mergedComment)}</td>`;
    } else {
      html += `<td>${escapeHtml(r.armor.grade)}</td><td>${escapeHtml(r.armor.subopt)}</td>
        <td>${escapeHtml(r.head.grade)}</td><td>${escapeHtml(r.head.subopt)}</td>`;
    }
    if (showActions) {
      html += `<td>
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
  return `<div class="addRowBar" data-level="${levelId}">
    <input type="text" class="f-newTargetChar" placeholder="想定キャラ" style="max-width:130px;">
    <select class="f-newDamageType" style="max-width:90px;"><option value="物理">物理</option><option value="魔法">魔法</option></select>
    <input type="text" class="f-newWeaponGrade" placeholder="武器等級" style="max-width:90px;">
    <input type="text" class="f-newWeaponSubopt" placeholder="武器サブオプ" style="max-width:120px;">
    <input type="text" class="f-newArmGrade" placeholder="腕等級" style="max-width:90px;">
    <input type="text" class="f-newArmSubopt" placeholder="腕サブオプ" style="max-width:120px;">
    <input type="text" class="f-newAccessoryGrade" placeholder="装飾等級" style="max-width:90px;">
    <input type="text" class="f-newAccessorySubopt" placeholder="装飾サブオプ" style="max-width:120px;">
    <label class="checkLabel" style="display:flex; align-items:center; gap:4px;"><input type="checkbox" class="f-newMergedEnabled"> 鎧〜頭を結合</label>
    <input type="text" class="f-newArmorGrade" placeholder="鎧等級" style="max-width:90px;">
    <input type="text" class="f-newArmorSubopt" placeholder="鎧サブオプ" style="max-width:120px;">
    <input type="text" class="f-newHeadGrade" placeholder="頭等級" style="max-width:90px;">
    <input type="text" class="f-newHeadSubopt" placeholder="頭サブオプ" style="max-width:120px;">
    <input type="text" class="f-newMergedComment" placeholder="結合コメント(結合時のみ使用)" style="max-width:200px; display:none;">
    <button class="small" data-action="add-row" data-level="${levelId}">+ 行を追加</button>
  </div>`;
}

function bindGearLevelActions() {
  const area = document.getElementById('gearLevelsArea');

  // 結合チェックボックスで、通常項目/結合コメント欄を切り替える
  area.querySelectorAll('.addRowBar').forEach(bar => {
    const chk = bar.querySelector('.f-newMergedEnabled');
    if (!chk) return;
    const toggle = () => {
      bar.querySelector('.f-newArmorGrade').style.display = chk.checked ? 'none' : '';
      bar.querySelector('.f-newArmorSubopt').style.display = chk.checked ? 'none' : '';
      bar.querySelector('.f-newHeadGrade').style.display = chk.checked ? 'none' : '';
      bar.querySelector('.f-newHeadSubopt').style.display = chk.checked ? 'none' : '';
      bar.querySelector('.f-newMergedComment').style.display = chk.checked ? '' : 'none';
    };
    chk.addEventListener('change', toggle);
  });

  area.querySelectorAll('[data-action="add-row"]').forEach(btn => btn.addEventListener('click', async () => {
    const levelId = btn.dataset.level;
    const bar = area.querySelector(`.addRowBar[data-level="${levelId}"]`);
    const lvl = contentData.equipmentLevels.find(l => l.id === levelId);
    if (!lvl) return;
    const row = blankGearRow();
    row.targetChar = bar.querySelector('.f-newTargetChar').value.trim();
    row.damageType = bar.querySelector('.f-newDamageType').value;
    row.weapon = { grade: bar.querySelector('.f-newWeaponGrade').value.trim(), subopt: bar.querySelector('.f-newWeaponSubopt').value.trim() };
    row.arm = { grade: bar.querySelector('.f-newArmGrade').value.trim(), subopt: bar.querySelector('.f-newArmSubopt').value.trim() };
    row.accessory = { grade: bar.querySelector('.f-newAccessoryGrade').value.trim(), subopt: bar.querySelector('.f-newAccessorySubopt').value.trim() };
    row.mergedEnabled = bar.querySelector('.f-newMergedEnabled').checked;
    if (row.mergedEnabled) {
      row.mergedComment = bar.querySelector('.f-newMergedComment').value.trim();
    } else {
      row.armor = { grade: bar.querySelector('.f-newArmorGrade').value.trim(), subopt: bar.querySelector('.f-newArmorSubopt').value.trim() };
      row.head = { grade: bar.querySelector('.f-newHeadGrade').value.trim(), subopt: bar.querySelector('.f-newHeadSubopt').value.trim() };
    }
    lvl.rows.push(row);
    await saveContent();
    renderGearLevels();
  }));

  area.querySelectorAll('[data-action="del-row"]').forEach(btn => btn.addEventListener('click', async () => {
    if (!confirm('この行を削除しますか?')) return;
    const lvl = contentData.equipmentLevels.find(l => l.id === btn.dataset.level);
    if (!lvl) return;
    lvl.rows = lvl.rows.filter(r => r.id !== btn.dataset.row);
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
  area.querySelectorAll('[data-action="del-level"]').forEach(btn => btn.addEventListener('click', async () => {
    if (!confirm('このレベルを削除しますか?(中の行も全て削除されます)')) return;
    contentData.equipmentLevels = contentData.equipmentLevels.filter(l => l.id !== btn.dataset.level);
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
