import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import {
  getFirestore, doc, setDoc, getDoc, getDocs, collection, addDoc, deleteDoc
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
const LOGIN_ID_SUFFIX = '@calmeguild.local';
function idToEmail(id) { return id.trim().toLowerCase() + LOGIN_ID_SUFFIX; }
function emailToId(email) { return email.endsWith(LOGIN_ID_SUFFIX) ? email.slice(0, -LOGIN_ID_SUFFIX.length) : email; }
const membersCol = collection(db, "members");
const rosterCol = collection(db, "roster");
const logsCol = collection(db, "logs");
const userLinksCol = collection(db, "userLinks");
const adminsCol = collection(db, "admins");
let isAdmin = false;

const SLOTS = ["武器", "鎧", "頭", "装飾", "腕"];
const ATTRIBUTES = ["💧水", "🔥火", "🍃風", "🌟光", "🟣闇"];
const ATTACK_TYPES = ["物理", "魔法"];
const DEFAULT_CHARACTERS = {
  "💧水": [{ name: "シェラザード", atkType: "" }],
  "🔥火": [],
  "🍃風": [],
  "🌟光": [{ name: "ユースティア", atkType: "" }, { name: "オリビエ", atkType: "" }],
  "🟣闇": [{ name: "ルベンシア", atkType: "" }, { name: "ルゥ", atkType: "" }]
};

const EX_GRADE_VALUES = ["24", "23", "22", "21", "20", "19", "18"];
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
const EQUIPMENT_BY_SLOT = { "武器": [], "鎧": [], "頭": [], "装飾": [], "腕": [] };
Object.keys(EQUIPMENT_DATA).forEach(name => EQUIPMENT_BY_SLOT[EQUIPMENT_DATA[name].slot].push(name));
// 各部位の選択肢(汎用装備名 + 専用装備)
const SLOT_ITEM_OPTIONS = {};
SLOTS.forEach(slot => { SLOT_ITEM_OPTIONS[slot] = [...(EQUIPMENT_BY_SLOT[slot] || []), "専用装備"]; });
// 関連キャラのグループ(キー: このキャラの行にボタンを出す / 値: 表示する関連キャラ一覧)
const RELATED_CHAR_GROUPS = {
  "グランヒルト": ["グランヒルト", "ディアナ", "ルゥ"]
};

let rosterMembers = [];
let rosterCharacters = {};
let pendingEx = [];
let currentUser = '';

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
function gradeNumBadge(grade) {
  if (!grade) return '';
  return `<span class="grade-badge g${grade}">${grade}</span>`;
}
function slotCellHtml(slotObj) {
  if (!slotObj || !slotObj.item) return '<span class="detail">-</span>';
  const itemText = slotObj.item === '専用装備'
    ? `<span class="exclusive-tag">専用装備</span>`
    : escapeHtml(slotObj.item);
  return `${itemText}${slotObj.grade ? '<br>' + gradeNumBadge(slotObj.grade) : ''}`;
}
function fillSelect(sel, options, placeholder) {
  let html = placeholder !== undefined ? `<option value="">${escapeHtml(placeholder)}</option>` : '';
  html += options.map(o => `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`).join('');
  sel.innerHTML = html;
}
function fillSlotGradeSelect(sel) {
  sel.innerHTML = '<option value="">-</option>' + EX_GRADE_VALUES.map(g => `<option value="${g}">${g}等級</option>`).join('');
}
async function addLog(detail) {
  try { await addDoc(logsCol, { ts: new Date().toISOString(), member: currentUser || '(未選択)', detail }); }
  catch (e) { console.error('log error', e); }
}
function charNames(attr) { return (rosterCharacters[attr] || []).map(c => c.name); }
function charInfo(name) {
  for (const attr of ATTRIBUTES) {
    const found = (rosterCharacters[attr] || []).find(c => c.name === name);
    if (found) return { attr, atkType: found.atkType || '' };
  }
  return { attr: null, atkType: '' };
}
function attrEmoji(attr) { return attr ? Array.from(attr)[0] : ''; }
function atkTypeBadge(atkType) {
  if (atkType === '物理') return '<span class="atktype-badge">⚔️物理</span>';
  if (atkType === '魔法') return '<span class="atktype-badge">🔮魔法</span>';
  return '';
}

// ---------- 操作者ロック制御 ----------
function updateLockState() {
  const locked = !currentUser;
  document.querySelectorAll('.tab').forEach(tab => {
    if (tab.dataset.tab === 'register' && document.querySelector('.tab.active').dataset.tab === 'register') return;
    tab.classList.toggle('locked', locked);
  });
  document.getElementById('opWarn').style.display = locked ? 'inline' : 'none';
  ['addExBtn', 'saveBtn'].forEach(id => { document.getElementById(id).disabled = locked; });
}

document.getElementById('operatorSelect').addEventListener('change', async () => {
  currentUser = document.getElementById('operatorSelect').value;
  updateLockState();
  if (currentUser) {
    await loadMemberIfExists();
  } else {
    pendingEx = [];
    renderExTable();
  }
  const activeTab = document.querySelector('.tab.active');
  if (activeTab && activeTab.dataset.tab === 'list') loadList();
});

document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    if (!currentUser) { alert('先に操作者(名前)を選択してください。'); return; }
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    ['register', 'list', 'roster', 'log'].forEach(id => {
      document.getElementById(id).style.display = (tab.dataset.tab === id) ? 'block' : 'none';
    });
    if (tab.dataset.tab === 'list') loadList();
    if (tab.dataset.tab === 'roster') renderRosterUI();
    if (tab.dataset.tab === 'log') loadLogs();
  });
});

// ---------- 初期化 ----------
async function initRoster() {
  const memberSnap = await getDoc(doc(rosterCol, "members"));
  if (memberSnap.exists()) rosterMembers = memberSnap.data().names || [];
  else { rosterMembers = []; await setDoc(doc(rosterCol, "members"), { names: [] }); }

  const charSnap = await getDoc(doc(rosterCol, "characters"));
  if (charSnap.exists()) {
    const raw = charSnap.data();
    let needsMigration = false;
    ATTRIBUTES.forEach(attr => {
      const arr = raw[attr] || [];
      raw[attr] = arr.map(c => {
        if (typeof c === 'string') { needsMigration = true; return { name: c, atkType: '' }; }
        return c;
      });
    });
    rosterCharacters = raw;
    if (needsMigration) await setDoc(doc(rosterCol, "characters"), rosterCharacters);
  } else {
    rosterCharacters = DEFAULT_CHARACTERS;
    await setDoc(doc(rosterCol, "characters"), DEFAULT_CHARACTERS);
  }
}

function refreshMemberSelect() {
  fillSelect(document.getElementById('operatorSelect'), rosterMembers, '選択してください');
  fillSelect(document.getElementById('filterMember'), rosterMembers, 'すべて');
}
function refreshExCharOptions() {
  const attr = document.getElementById('exAttr').value;
  const chars = charNames(attr);
  fillSelect(document.getElementById('exChar'), chars);
}

function buildSlotInputs() {
  const container = document.getElementById('slotInputsArea');
  container.innerHTML = SLOTS.map(slot => `
    <div class="slotRow">
      <div class="slotLabel">${escapeHtml(slot)}</div>
      <select id="slotItem_${slot}"></select>
      <select id="slotGrade_${slot}"></select>
    </div>
  `).join('');
  SLOTS.forEach(slot => {
    fillSelect(document.getElementById(`slotItem_${slot}`), SLOT_ITEM_OPTIONS[slot], '選択してください');
    fillSlotGradeSelect(document.getElementById(`slotGrade_${slot}`));
  });
}

async function init() {
  await initRoster();
  fillSelect(document.getElementById('exAttr'), ATTRIBUTES);
  fillSelect(document.getElementById('newCharAttr'), ATTRIBUTES);
  fillSelect(document.getElementById('filterAttr'), ATTRIBUTES, 'すべて');
  buildSlotInputs();
  refreshMemberSelect();
  refreshExCharOptions();
  updateLockState();
  document.getElementById('connNote').textContent = 'Firebaseに接続しました。';
}
onAuthStateChanged(auth, async (user) => {
  if (user) {
    document.getElementById('loginStatus').className = 'status';
    document.getElementById('loginStatus').textContent = '読み込み中...';
    document.getElementById('loginBtn').disabled = true;
    await init();
    await applyUserLinkIfAny(user);
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('mainApp').style.display = 'block';
    // 一覧・ログのデータはバックグラウンドで先読み(失敗しても各タブを開いた時に通常通り再取得される)
    getMembersData().catch(() => {});
    getLogsData().catch(() => {});
  } else {
    document.getElementById('loginScreen').style.display = 'block';
    document.getElementById('mainApp').style.display = 'none';
    document.getElementById('loginBtn').disabled = false;
    document.getElementById('loginStatus').textContent = '';
  }
});

async function applyUserLinkIfAny(user) {
  const email = (user.email || '').toLowerCase();
  if (!email) return;
  try {
    const adminSnap = await getDoc(doc(adminsCol, email));
    isAdmin = adminSnap.exists();
    document.getElementById('adminOnlyArea').style.display = isAdmin ? 'block' : 'none';
  } catch (e) {
    isAdmin = false;
    document.getElementById('adminOnlyArea').style.display = 'none';
  }
  try {
    const linkSnap = await getDoc(doc(userLinksCol, email));
    if (linkSnap.exists()) {
      const memberName = linkSnap.data().memberName;
      if (rosterMembers.includes(memberName)) {
        currentUser = memberName;
        document.getElementById('operatorSelect').style.display = 'none';
        document.getElementById('operatorFixedName').style.display = 'inline';
        document.getElementById('operatorFixedName').textContent = memberName;
        document.getElementById('opWarn').style.display = 'none';
        updateLockState();
        await loadMemberIfExists();
      }
    }
  } catch (e) {
    console.error('user link check error', e);
  }
}

document.getElementById('loginBtn').addEventListener('click', async () => {
  const statusEl = document.getElementById('loginStatus');
  const id = document.getElementById('loginEmail').value.trim();
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
  await signOut(auth);
  currentUser = '';
  document.getElementById('operatorSelect').style.display = '';
  document.getElementById('operatorSelect').value = '';
  document.getElementById('operatorFixedName').style.display = 'none';
  document.getElementById('opWarn').style.display = '';
});

document.getElementById('exAttr').addEventListener('change', refreshExCharOptions);

// ---------- 登録する ----------
async function loadMemberIfExists() {
  pendingEx = [];
  if (currentUser) {
    try {
      const snap = await getDoc(doc(membersCol, currentUser));
      if (snap.exists()) {
        const data = snap.data();
        pendingEx = data.exclusive || [];
      }
    } catch (e) { console.error(e); }
  }
  renderExTable();
}

function pendingRowSlotText(slotObj) {
  if (!slotObj || !slotObj.item) return '-';
  return slotObj.grade ? `${slotObj.item}(${slotObj.grade})` : slotObj.item;
}

function renderExTable() {
  const table = document.getElementById('exTable');
  if (pendingEx.length === 0) { table.innerHTML = ''; return; }
  let html = '<tr><th>キャラ</th><th>武器</th><th>鎧</th><th>頭</th><th>装飾</th><th>腕</th><th>備考</th><th></th></tr>';
  pendingEx.forEach((item, i) => {
    const slots = item.slots || {};
    html += `<tr id="pending-row-${i}"><td>${escapeHtml(item.character)}</td>`;
    SLOTS.forEach(slot => { html += `<td class="p-cell-${slot}">${escapeHtml(pendingRowSlotText(slots[slot]))}</td>`; });
    html += `<td class="p-cell-note">${escapeHtml(item.note || '')}</td>`;
    html += `<td class="p-cell-actions"><button class="small" data-action="edit-pending" data-i="${i}">編集</button><button class="small danger" data-action="del-pending" data-i="${i}">削除</button></td></tr>`;
  });
  table.innerHTML = html;
  table.querySelectorAll('[data-action="del-pending"]').forEach(btn => {
    btn.addEventListener('click', () => { pendingEx.splice(parseInt(btn.dataset.i), 1); renderExTable(); });
  });
  table.querySelectorAll('[data-action="edit-pending"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = parseInt(btn.dataset.i);
      enterPendingEditMode(document.getElementById(`pending-row-${i}`), i);
    });
  });
}

function enterPendingEditMode(tr, i) {
  const item = pendingEx[i];
  const slots = item.slots || {};
  SLOTS.forEach(slot => {
    const cell = tr.querySelector(`.p-cell-${slot}`);
    const itemSel = document.createElement('select');
    fillSelect(itemSel, SLOT_ITEM_OPTIONS[slot], '選択してください');
    if (slots[slot] && slots[slot].item) itemSel.value = slots[slot].item;
    itemSel.className = `pe-item-${slot}`;
    const gradeSel = document.createElement('select');
    fillSlotGradeSelect(gradeSel);
    if (slots[slot] && slots[slot].grade) gradeSel.value = slots[slot].grade;
    gradeSel.className = `pe-grade-${slot}`;
    cell.innerHTML = '';
    cell.appendChild(itemSel);
    cell.appendChild(gradeSel);
  });
  const noteCell = tr.querySelector('.p-cell-note');
  noteCell.innerHTML = `<textarea class="pe-note" maxlength="20" rows="3" style="width:100%;min-width:150px;box-sizing:border-box;padding:6px;border:1px solid var(--border);border-radius:6px;font-size:13px;background:var(--input-bg);color:var(--input-text);resize:vertical;">${escapeHtml(item.note || '')}</textarea>`;
  tr.querySelector('.p-cell-actions').innerHTML = `<button class="primary small pe-save">保存</button><button class="small pe-cancel">キャンセル</button>`;

  tr.querySelector('.pe-cancel').addEventListener('click', () => renderExTable());
  tr.querySelector('.pe-save').addEventListener('click', () => {
    const newSlots = {};
    let anyFilled = false;
    SLOTS.forEach(slot => {
      const itemVal = tr.querySelector(`.pe-item-${slot}`).value;
      const gradeVal = tr.querySelector(`.pe-grade-${slot}`).value;
      newSlots[slot] = { item: itemVal, grade: itemVal ? gradeVal : '' };
      if (itemVal) anyFilled = true;
    });
    if (!anyFilled) { alert('武器・鎧・頭・装飾・腕のうち、少なくとも1つは選択してください。'); return; }
    const newNote = tr.querySelector('.pe-note').value.trim().slice(0, 20);
    pendingEx[i] = { character: item.character, slots: newSlots, note: newNote };
    renderExTable();
  });
}

document.getElementById('addExBtn').addEventListener('click', () => {
  const char = document.getElementById('exChar').value;
  if (!char) { alert('キャラクターを選択してください。'); return; }
  const slots = {};
  let anyFilled = false;
  SLOTS.forEach(slot => {
    const itemSel = document.getElementById(`slotItem_${slot}`);
    const gradeSel = document.getElementById(`slotGrade_${slot}`);
    const itemVal = itemSel.value;
    const gradeVal = gradeSel.value;
    slots[slot] = { item: itemVal, grade: itemVal ? gradeVal : '' };
    if (itemVal) anyFilled = true;
  });
  if (!anyFilled) { alert('武器・鎧・頭・装飾・腕のうち、少なくとも1つは選択してください。'); return; }
  const note = document.getElementById('exNote').value.trim().slice(0, 20);
  pendingEx.push({ character: char, slots, note });
  renderExTable();
});

document.getElementById('saveBtn').addEventListener('click', async () => {
  const statusEl = document.getElementById('saveStatus');
  if (!currentUser) { statusEl.className = 'status err'; statusEl.textContent = '操作者を選択してください。'; return; }
  const data = { name: currentUser, exclusive: pendingEx, updatedAt: new Date().toISOString() };
  try {
    await setDoc(doc(membersCol, currentUser), data);
    statusEl.className = 'status ok';
    statusEl.textContent = `保存しました(${currentUser})。`;
    await addLog(`キャラクターデータを保存しました(${pendingEx.length}件)`);
  } catch (e) {
    statusEl.className = 'status err';
    statusEl.textContent = '保存に失敗しました: ' + e.message;
  }
});

// ---------- 一覧を見る ----------
let allMembersCache = [];
let membersPrefetchPromise = null;
async function fetchAllMembers() {
  const snap = await getDocs(membersCol);
  const members = [];
  snap.forEach(d => members.push(d.data()));
  return members;
}
function maxGradeOf(item) {
  let max = -1;
  const slots = item.slots || {};
  SLOTS.forEach(slot => {
    const g = slots[slot] && slots[slot].grade;
    if (g) max = Math.max(max, parseInt(g));
  });
  return max;
}
function hasGrade24(item) {
  const slots = item.slots || {};
  return SLOTS.some(slot => slots[slot] && slots[slot].grade === '24');
}
function sortExHolders(a, b) { return maxGradeOf(b) - maxGradeOf(a); }

function getFilters() {
  return {
    search: document.getElementById('searchBox').value.trim().toLowerCase(),
    member: document.getElementById('filterMember').value,
    attr: document.getElementById('filterAttr').value,
    atkType: document.getElementById('filterAtkType').value,
    g24Only: document.getElementById('filterG24Only').checked
  };
}

function renderExList(members, filters) {
  const map = {};
  members.forEach(m => {
    (m.exclusive || []).forEach((item, idx) => {
      if (filters.search && !item.character.toLowerCase().includes(filters.search)) return;
      if (filters.member && m.name !== filters.member) return;
      if (filters.g24Only && !hasGrade24(item)) return;
      if (!map[item.character]) map[item.character] = [];
      map[item.character].push({ memberName: m.name, idx, ...item });
    });
  });
  let chars = Object.keys(map);
  chars = chars.filter(charName => {
    const info = charInfo(charName);
    if (filters.attr && info.attr !== filters.attr) return false;
    if (filters.atkType && info.atkType !== filters.atkType) return false;
    return true;
  });
  function atkTypeSortValue(t) { return t === '物理' ? 0 : (t === '魔法' ? 1 : 2); }
  chars.sort((a, b) => {
    const ia = charInfo(a), ib = charInfo(b);
    const aiA = ATTRIBUTES.indexOf(ia.attr), aiB = ATTRIBUTES.indexOf(ib.attr);
    const na = aiA === -1 ? 999 : aiA, nb = aiB === -1 ? 999 : aiB;
    if (na !== nb) return na - nb;
    const ta = atkTypeSortValue(ia.atkType), tb = atkTypeSortValue(ib.atkType);
    if (ta !== tb) return ta - tb;
    return a.localeCompare(b, 'ja');
  });

  const area = document.getElementById('exListArea');
  if (chars.length === 0) { area.innerHTML = '<div class="empty">該当する登録がありません。</div>'; return; }

  let html = '<table class="wide-table"><tr><th>キャラ</th><th>所持者</th><th>武器</th><th>鎧</th><th>頭</th><th>装飾</th><th>腕</th><th>備考</th></tr>';
  chars.forEach((charName, ci) => {
    const holders = map[charName].sort(sortExHolders);
    const info = charInfo(charName);
    const charCellHtml = `${escapeHtml(attrEmoji(info.attr))}${escapeHtml(charName)}<br>${atkTypeBadge(info.atkType)}`;
    const grpClass = (ci % 2 === 0) ? 'grp-a' : 'grp-b';
    holders.forEach((h, hi) => {
      const rowId = `ex-row-${ci}-${hi}`;
      const slots = h.slots || {};
      html += `<tr id="${rowId}" class="${grpClass}${hi>0?' cont':''}" data-member="${escapeHtml(h.memberName)}" data-idx="${h.idx}">`;
      if (hi === 0) html += `<td class="name-cell" rowspan="${holders.length}">${charCellHtml}</td>`;
      const relatedBtn = RELATED_CHAR_GROUPS[charName]
        ? ` <button class="small" data-action="related" data-member="${escapeHtml(h.memberName)}" data-group="${escapeHtml(charName)}">関連キャラ</button>`
        : '';
      html += `<td>${escapeHtml(h.memberName)}${relatedBtn}</td>`;
      SLOTS.forEach(slot => { html += `<td class="cell-${slot}">${slotCellHtml(slots[slot])}</td>`; });
      html += `<td class="cell-note">${escapeHtml(h.note || '')}</td>`;
      html += `</tr>`;
    });
  });
  html += '</table>';
  area.innerHTML = `<div class="table-wrap">${html}</div>`;
  const exNameCells = area.querySelectorAll('.name-cell');
  if (exNameCells.length) exNameCells[exNameCells.length - 1].classList.add('last-name-cell');

  area.querySelectorAll('[data-action="related"]').forEach(btn => {
    btn.addEventListener('click', () => {
      showRelatedModal(btn.dataset.member, RELATED_CHAR_GROUPS[btn.dataset.group]);
    });
  });
}

function showRelatedModal(memberName, relatedChars) {
  const member = allMembersCache.find(m => m.name === memberName);
  const content = document.getElementById('relatedModalContent');
  let html = `<div class="detail" style="margin-bottom:10px;">所持者: ${escapeHtml(memberName)}</div>`;
  relatedChars.forEach(charName => {
    const entry = member && (member.exclusive || []).find(e => e.character === charName);
    html += `<div class="relatedCharBlock"><div class="relatedCharName">${escapeHtml(charName)}</div>`;
    if (!entry) {
      html += `<div class="detail">未登録</div>`;
    } else {
      const slots = entry.slots || {};
      html += `<div class="relatedSlots">`;
      SLOTS.forEach(slot => {
        html += `<div class="relatedSlotItem"><span class="slotLabel">${escapeHtml(slot)}</span>${slotCellHtml(slots[slot])}</div>`;
      });
      html += `</div>`;
      if (entry.note) html += `<div class="detail">備考: ${escapeHtml(entry.note)}</div>`;
    }
    html += `</div>`;
  });
  content.innerHTML = html;
  document.getElementById('relatedModal').style.display = 'flex';
}
document.getElementById('relatedModalClose').addEventListener('click', () => {
  document.getElementById('relatedModal').style.display = 'none';
});
document.getElementById('relatedModal').addEventListener('click', (e) => {
  if (e.target.id === 'relatedModal') document.getElementById('relatedModal').style.display = 'none';
});

function getMembersData() {
  if (!membersPrefetchPromise) {
    membersPrefetchPromise = fetchAllMembers()
      .then(data => { allMembersCache = data; membersPrefetchPromise = null; return data; })
      .catch(err => { membersPrefetchPromise = null; throw err; });
  }
  return membersPrefetchPromise;
}

async function loadList() {
  document.getElementById('exListArea').innerHTML = '<div class="empty">読み込み中...</div>';
  try {
    await getMembersData();
    applyFilterAndRender();
  } catch (e) {
    document.getElementById('exListArea').innerHTML = `<div class="empty">読み込みエラー: ${e.message}</div>`;
  }
}
function applyFilterAndRender() {
  const filters = getFilters();
  renderExList(allMembersCache, filters);
}
['searchBox', 'filterMember', 'filterAttr', 'filterAtkType', 'filterG24Only'].forEach(id => {
  document.getElementById(id).addEventListener('input', applyFilterAndRender);
  document.getElementById(id).addEventListener('change', applyFilterAndRender);
});

// ---------- 名簿管理 ----------
function renderRosterUI() {
  fillSelect(document.getElementById('newLinkMember'), rosterMembers);
  renderUserLinksUI();
  if (isAdmin) renderAdminsUI();
  const memberArea = document.getElementById('memberRosterArea');
  if (rosterMembers.length === 0) {
    memberArea.innerHTML = '<div class="empty">まだメンバーが登録されていません。</div>';
  } else {
    let mHtml = '<table class="scroll-table"><tr><th>名前</th>' + (isAdmin ? '<th style="width:100px;">操作</th>' : '') + '</tr>';
    rosterMembers.forEach(name => {
      const delBtn = isAdmin ? `<td><button class="small danger del-member" data-name="${escapeHtml(name)}">削除</button></td>` : '';
      mHtml += `<tr><td>${escapeHtml(name)}</td>${delBtn}</tr>`;
    });
    mHtml += '</table>';
    memberArea.innerHTML = `<div class="table-wrap">${mHtml}</div>`;
    memberArea.querySelectorAll('.del-member').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm(`「${btn.dataset.name}」を名簿から削除しますか?(装備データ自体は残ります)`)) return;
        rosterMembers = rosterMembers.filter(n => n !== btn.dataset.name);
        await setDoc(doc(rosterCol, "members"), { names: rosterMembers });
        await addLog(`名簿からメンバー「${btn.dataset.name}」を削除しました`);
        refreshMemberSelect();
        renderRosterUI();
      });
    });
  }

  const charArea = document.getElementById('charRosterArea');
  const rows = [];
  ATTRIBUTES.forEach(attr => {
    (rosterCharacters[attr] || []).forEach(c => rows.push({ attr, ...c }));
  });
  if (rows.length === 0) {
    charArea.innerHTML = '<div class="empty">まだキャラクターが登録されていません。</div>';
  } else {
    let cHtml = '<table class="scroll-table"><tr><th style="width:80px;">属性</th><th>キャラ名</th><th style="width:160px;">攻撃タイプ</th><th style="width:100px;">操作</th></tr>';
    rows.forEach(r => {
      cHtml += `<tr>
        <td>${r.attr}</td>
        <td>${escapeHtml(r.name)}</td>
        <td>
          <select class="atkTypeSel" data-attr="${r.attr}" data-name="${escapeHtml(r.name)}">
            <option value="" ${!r.atkType?'selected':''}>未設定</option>
            <option value="物理" ${r.atkType==='物理'?'selected':''}>物理</option>
            <option value="魔法" ${r.atkType==='魔法'?'selected':''}>魔法</option>
          </select>
        </td>
        <td><button class="small danger del-char" data-attr="${r.attr}" data-char="${escapeHtml(r.name)}">削除</button></td>
      </tr>`;
    });
    cHtml += '</table>';
    charArea.innerHTML = `<div class="table-wrap">${cHtml}</div>`;
  }

  charArea.querySelectorAll('.atkTypeSel').forEach(sel => {
    sel.addEventListener('change', async () => {
      const attr = sel.dataset.attr, name = sel.dataset.name;
      const entry = (rosterCharacters[attr] || []).find(c => c.name === name);
      if (entry) entry.atkType = sel.value;
      await setDoc(doc(rosterCol, "characters"), rosterCharacters);
      await addLog(`${attr}「${name}」の攻撃タイプを${sel.value || '未設定'}に変更しました`);
    });
  });
  charArea.querySelectorAll('.del-char').forEach(btn => {
    btn.addEventListener('click', async () => {
      const attr = btn.dataset.attr, charName = btn.dataset.char;
      if (!confirm(`${attr}の「${charName}」を名簿から削除しますか?`)) return;
      rosterCharacters[attr] = (rosterCharacters[attr] || []).filter(c => c.name !== charName);
      await setDoc(doc(rosterCol, "characters"), rosterCharacters);
      await addLog(`キャラ名簿から${attr}「${charName}」を削除しました`);
      refreshExCharOptions();
      renderRosterUI();
    });
  });
}

document.getElementById('addMemberBtn').addEventListener('click', async () => {
  const input = document.getElementById('newMemberName');
  const name = input.value.trim();
  if (!name) return;
  if (rosterMembers.includes(name)) { alert('すでに登録されています。'); return; }
  rosterMembers.push(name);
  await setDoc(doc(rosterCol, "members"), { names: rosterMembers });
  await addLog(`名簿にメンバー「${name}」を追加しました`);
  input.value = '';
  refreshMemberSelect();
  renderRosterUI();
});
document.getElementById('addCharBtn').addEventListener('click', async () => {
  const attr = document.getElementById('newCharAttr').value;
  const input = document.getElementById('newCharName');
  const name = input.value.trim();
  const atkType = document.getElementById('newCharAtkType').value;
  if (!name) return;
  if (!rosterCharacters[attr]) rosterCharacters[attr] = [];
  if (rosterCharacters[attr].some(c => c.name === name)) { alert('すでに登録されています。'); return; }
  rosterCharacters[attr].push({ name, atkType });
  await setDoc(doc(rosterCol, "characters"), rosterCharacters);
  await addLog(`キャラ名簿に${attr}「${name}」(${atkType || '未設定'})を追加しました`);
  input.value = '';
  refreshExCharOptions();
  renderRosterUI();
});

async function renderUserLinksUI() {
  const area = document.getElementById('userLinksArea');
  area.innerHTML = '<div class="empty">読み込み中...</div>';
  try {
    const snap = await getDocs(userLinksCol);
    const links = [];
    snap.forEach(d => links.push({ email: d.id, memberName: d.data().memberName }));
    if (links.length === 0) {
      area.innerHTML = '<div class="empty">まだ紐付けがありません。</div>';
      return;
    }
    let html = '<div class="table-wrap"><table class="scroll-table"><tr><th>ID</th><th>紐付け先メンバー</th><th style="width:100px;">操作</th></tr>';
    links.forEach(l => {
      html += `<tr><td>${escapeHtml(emailToId(l.email))}</td><td>${escapeHtml(l.memberName)}</td><td><button class="small danger del-link" data-email="${escapeHtml(l.email)}">削除</button></td></tr>`;
    });
    html += '</table></div>';
    area.innerHTML = html;
    area.querySelectorAll('.del-link').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm(`「${emailToId(btn.dataset.email)}」の紐付けを削除しますか?`)) return;
        await deleteDoc(doc(userLinksCol, btn.dataset.email));
        await addLog(`ログインID「${emailToId(btn.dataset.email)}」の紐付けを削除しました`);
        renderUserLinksUI();
      });
    });
  } catch (e) {
    area.innerHTML = `<div class="empty">読み込みエラー: ${e.message}</div>`;
  }
}

document.getElementById('addLinkBtn').addEventListener('click', async () => {
  const idVal = document.getElementById('newLinkEmail').value.trim();
  const email = idToEmail(idVal);
  const memberName = document.getElementById('newLinkMember').value;
  if (!idVal || !memberName) { alert('IDとメンバーを両方指定してください。'); return; }
  try {
    await setDoc(doc(userLinksCol, email), { memberName });
    await addLog(`ログインID「${idVal}」を「${memberName}」に紐付けました`);
    document.getElementById('newLinkEmail').value = '';
    renderUserLinksUI();
  } catch (e) {
    alert('紐付けに失敗しました(権限がない可能性があります): ' + e.message);
  }
});

async function renderAdminsUI() {
  const area = document.getElementById('adminsArea');
  area.innerHTML = '<div class="empty">読み込み中...</div>';
  try {
    const snap = await getDocs(adminsCol);
    const admins = [];
    snap.forEach(d => admins.push(d.id));
    if (admins.length === 0) {
      area.innerHTML = '<div class="empty">管理者が登録されていません。</div>';
      return;
    }
    let html = '<div class="table-wrap"><table class="scroll-table"><tr><th>ID</th><th style="width:100px;">操作</th></tr>';
    admins.forEach(email => {
      html += `<tr><td>${escapeHtml(emailToId(email))}</td><td><button class="small danger del-admin" data-email="${escapeHtml(email)}">削除</button></td></tr>`;
    });
    html += '</table></div>';
    area.innerHTML = html;
    area.querySelectorAll('.del-admin').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm(`「${emailToId(btn.dataset.email)}」を管理者から外しますか?`)) return;
        try {
          await deleteDoc(doc(adminsCol, btn.dataset.email));
          await addLog(`管理者「${emailToId(btn.dataset.email)}」を削除しました`);
          renderAdminsUI();
        } catch (e) {
          alert('削除に失敗しました(権限がない可能性があります): ' + e.message);
        }
      });
    });
  } catch (e) {
    area.innerHTML = `<div class="empty">読み込みエラー: ${e.message}</div>`;
  }
}

document.getElementById('addAdminBtn').addEventListener('click', async () => {
  const idVal = document.getElementById('newAdminEmail').value.trim();
  if (!idVal) return;
  const email = idToEmail(idVal);
  try {
    await setDoc(doc(adminsCol, email), { addedAt: new Date().toISOString() });
    await addLog(`管理者「${idVal}」を追加しました`);
    document.getElementById('newAdminEmail').value = '';
    renderAdminsUI();
  } catch (e) {
    alert('追加に失敗しました(権限がない可能性があります): ' + e.message);
  }
});

document.getElementById('bulkImportBtn').addEventListener('click', async () => {
  const statusEl = document.getElementById('bulkImportStatus');
  const raw = document.getElementById('bulkCharInput').value;
  const lines = raw.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  let added = 0, skipped = 0, invalid = 0;
  lines.forEach(line => {
    let cols = line.split('\t');
    if (cols.length < 3) cols = line.split(/\s{2,}/);
    if (cols.length < 3) { invalid++; return; }
    const name = cols[0].trim();
    const attr = cols[1].trim();
    const atkRaw = cols[2].trim();
    if (name === 'キャラクター' || attr === '属性') return; // ヘッダー行はスキップ
    if (!ATTRIBUTES.includes(attr)) { invalid++; return; }
    const atkType = atkRaw.includes('魔法') ? '魔法' : (atkRaw.includes('物理') ? '物理' : '');
    if (!rosterCharacters[attr]) rosterCharacters[attr] = [];
    if (rosterCharacters[attr].some(c => c.name === name)) { skipped++; return; }
    rosterCharacters[attr].push({ name, atkType });
    added++;
  });
  try {
    await setDoc(doc(rosterCol, "characters"), rosterCharacters);
    await addLog(`キャラ名簿を一括登録しました(追加${added}件 / 重複スキップ${skipped}件 / 無効行${invalid}件)`);
    statusEl.className = 'status ok';
    statusEl.textContent = `完了: ${added}件追加、${skipped}件は重複のためスキップ、${invalid}件は形式不正のためスキップしました。`;
    refreshExCharOptions();
    renderRosterUI();
  } catch (e) {
    statusEl.className = 'status err';
    statusEl.textContent = '一括登録に失敗しました: ' + e.message;
  }
});

// ---------- 編集ログ ----------
let logsFetchPromise = null;
function getLogsData() {
  if (!logsFetchPromise) {
    logsFetchPromise = getDocs(logsCol)
      .then(snap => { logsFetchPromise = null; return snap; })
      .catch(err => { logsFetchPromise = null; throw err; });
  }
  return logsFetchPromise;
}

async function loadLogs() {
  const area = document.getElementById('logArea');
  area.innerHTML = '<div class="empty">読み込み中...</div>';
  try {
    const snap = await getLogsData();
    const logs = [];
    snap.forEach(d => logs.push(d.data()));
    logs.sort((a, b) => (b.ts || '').localeCompare(a.ts || ''));
    const top = logs.slice(0, 200);
    if (top.length === 0) { area.innerHTML = '<div class="empty">まだログがありません。</div>'; return; }
    let html = '<table class="scroll-table"><tr><th style="width:160px;">日時</th><th style="width:120px;">操作者</th><th>内容</th></tr>';
    top.forEach(l => {
      const dt = l.ts ? new Date(l.ts).toLocaleString('ja-JP') : '-';
      html += `<tr><td>${escapeHtml(dt)}</td><td>${escapeHtml(l.member || '-')}</td><td>${escapeHtml(l.detail || '')}</td></tr>`;
    });
    html += '</table>';
    area.innerHTML = `<div class="table-wrap">${html}</div>`;
  } catch (e) {
    area.innerHTML = `<div class="empty">読み込みエラー: ${e.message}</div>`;
  }
}

// ---------- データバックアップ(全データJSONエクスポート) ----------
document.getElementById('exportDataBtn').addEventListener('click', async () => {
  const statusEl = document.getElementById('exportStatus');
  statusEl.className = 'status';
  statusEl.textContent = '書き出し中...';
  try {
    const backup = { exportedAt: new Date().toISOString(), members: [], roster: {}, logs: [], userLinks: [], admins: [] };

    const membersSnap = await getDocs(membersCol);
    membersSnap.forEach(d => backup.members.push(d.data()));

    const rosterMembersSnap = await getDoc(doc(rosterCol, "members"));
    if (rosterMembersSnap.exists()) backup.roster.members = rosterMembersSnap.data();
    const rosterCharsSnap = await getDoc(doc(rosterCol, "characters"));
    if (rosterCharsSnap.exists()) backup.roster.characters = rosterCharsSnap.data();

    const logsSnap = await getDocs(logsCol);
    logsSnap.forEach(d => backup.logs.push(d.data()));

    const linksSnap = await getDocs(userLinksCol);
    linksSnap.forEach(d => backup.userLinks.push({ id: d.id, ...d.data() }));

    const adminsSnap = await getDocs(adminsCol);
    adminsSnap.forEach(d => backup.admins.push(d.id));

    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    a.href = url;
    a.download = `guild_tool_backup_${ts}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    statusEl.className = 'status ok';
    statusEl.textContent = 'ダウンロードしました。';
  } catch (e) {
    statusEl.className = 'status err';
    statusEl.textContent = '書き出しに失敗しました: ' + e.message;
  }
});
