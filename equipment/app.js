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
const WIDE_GRADE_SLOTS = ["鎧", "頭"]; // 21〜24等級を選べる部位
const ATTRIBUTES = ["💧水", "🔥火", "🍃風", "🌟光", "🟣闇"];
const ATTACK_TYPES = ["物理", "魔法"];
const DEFAULT_CHARACTERS = {
  "💧水": [{ name: "シェラザード", atkType: "" }],
  "🔥火": [],
  "🍃風": [],
  "🌟光": [{ name: "ユースティア", atkType: "" }, { name: "オリビエ", atkType: "" }],
  "🟣闇": [{ name: "ルベンシア", atkType: "" }, { name: "ルゥ", atkType: "" }]
};

// キャラ等級の選択肢(70〜72、100〜120)
const CHAR_GRADE_VALUES = [];
for (let i = 70; i <= 72; i++) CHAR_GRADE_VALUES.push(String(i));
for (let i = 100; i <= 120; i++) CHAR_GRADE_VALUES.push(String(i));

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

const SUB_OPTIONS = ["HP実数", "HP%", "攻撃力実数", "攻撃力%", "魔法力実数", "魔法力%", "クリ率", "クリダメ", "防御力", "魔法抵抗"];

let rosterMembers = [];
let rosterCharacters = {};
let pendingEx = [];
let pendingGen = [];
let currentUser = '';

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
function gradeBadge(grade) { return `<span class="grade-badge g${grade}">${grade}等級</span>`; }
function charGradeBadge(cg) { return cg ? `<span class="chargrade-badge">キャラ${cg}等級</span>` : ''; }
function fillSelect(sel, options, placeholder) {
  let html = placeholder !== undefined ? `<option value="">${escapeHtml(placeholder)}</option>` : '';
  html += options.map(o => `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`).join('');
  sel.innerHTML = html;
}
function genGradeOptionsFor(slot) {
  return WIDE_GRADE_SLOTS.includes(slot) ? ["24", "23", "22", "21"] : ["24", "23"];
}
function fillGradeSelect(sel, grades, currentValue) {
  sel.innerHTML = grades.map(g => `<option value="${g}">${g}等級</option>`).join('');
  if (currentValue && grades.includes(currentValue)) sel.value = currentValue;
}
function fillCharGradeSelect(sel, currentValue) {
  let html = `<option value="">未設定</option>`;
  html += CHAR_GRADE_VALUES.map(v => `<option value="${v}">${v}等級</option>`).join('');
  sel.innerHTML = html;
  if (currentValue) sel.value = currentValue;
}
const CHAR_GRADE_FILTER_OPTIONS = [
  { value: '70', label: '70等級' },
  { value: '71', label: '71等級' },
  { value: '72', label: '72等級' },
  { value: '100-110', label: '100~110等級' },
  { value: '111-120', label: '111~120等級' }
];
function fillCharGradeFilterSelect(sel) {
  let html = `<option value="">すべて</option>`;
  html += CHAR_GRADE_FILTER_OPTIONS.map(o => `<option value="${o.value}">${o.label}</option>`).join('');
  sel.innerHTML = html;
}
function matchesCharGradeFilter(charGrade, filterValue) {
  if (!filterValue) return true;
  if (!charGrade) return false;
  const num = parseInt(charGrade, 10);
  if (filterValue.includes('-')) {
    const [lo, hi] = filterValue.split('-').map(Number);
    return num >= lo && num <= hi;
  }
  return String(num) === filterValue;
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
  ['addExBtn', 'addGenBtn', 'saveBtn'].forEach(id => { document.getElementById(id).disabled = locked; });
}

document.getElementById('operatorSelect').addEventListener('change', async () => {
  currentUser = document.getElementById('operatorSelect').value;
  updateLockState();
  if (currentUser) {
    await loadMemberIfExists();
  } else {
    pendingEx = []; pendingGen = [];
    renderExTable(); renderGenTable();
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
function refreshGenItemOptions() {
  const slot = document.getElementById('genSlot').value;
  fillSelect(document.getElementById('genItem'), EQUIPMENT_BY_SLOT[slot] || []);
}
function refreshGenGradeOptions() {
  const slot = document.getElementById('genSlot').value;
  fillGradeSelect(document.getElementById('genGrade'), genGradeOptionsFor(slot));
}

async function init() {
  await initRoster();
  fillSelect(document.getElementById('exAbility2'), SUB_OPTIONS);
  fillSelect(document.getElementById('exSub1'), SUB_OPTIONS);
  fillSelect(document.getElementById('exSub2'), SUB_OPTIONS);
  fillSelect(document.getElementById('exSub3'), SUB_OPTIONS);
  fillSelect(document.getElementById('genSlot'), SLOTS);
  fillSelect(document.getElementById('genSub1'), SUB_OPTIONS);
  fillSelect(document.getElementById('genSub2'), SUB_OPTIONS);
  fillSelect(document.getElementById('genSub3'), SUB_OPTIONS);
  fillSelect(document.getElementById('exAttr'), ATTRIBUTES);
  fillSelect(document.getElementById('newCharAttr'), ATTRIBUTES);
  fillSelect(document.getElementById('filterAttr'), ATTRIBUTES, 'すべて');
  fillCharGradeSelect(document.getElementById('exCharGrade'), '');
  fillCharGradeFilterSelect(document.getElementById('filterCharGrade'));
  refreshMemberSelect();
  refreshExCharOptions();
  refreshGenItemOptions();
  refreshGenGradeOptions();
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
document.getElementById('genSlot').addEventListener('change', () => { refreshGenItemOptions(); refreshGenGradeOptions(); });

// ---------- 登録する ----------
async function loadMemberIfExists() {
  pendingEx = []; pendingGen = [];
  if (currentUser) {
    try {
      const snap = await getDoc(doc(membersCol, currentUser));
      if (snap.exists()) {
        const data = snap.data();
        pendingEx = data.exclusive || [];
        pendingGen = data.generic || [];
      }
    } catch (e) { console.error(e); }
  }
  renderExTable();
  renderGenTable();
}

function subOptionsText(arr) { return (arr || []).join(' / '); }

function renderExTable() {
  const table = document.getElementById('exTable');
  if (pendingEx.length === 0) { table.innerHTML = ''; return; }
  let html = '<tr><th>キャラ</th><th>基本能力2</th><th>サブオプション</th><th>専用等級</th><th>キャラ等級</th><th></th></tr>';
  pendingEx.forEach((item, i) => {
    html += `<tr><td>${escapeHtml(item.character)}</td><td>${escapeHtml(item.ability2)}</td><td>${escapeHtml(subOptionsText(item.subOptions))}</td><td>${gradeBadge(item.grade)}</td><td>${charGradeBadge(item.charGrade) || '<span class="detail">未設定</span>'}</td><td><button class="danger" data-i="${i}">削除</button></td></tr>`;
  });
  table.innerHTML = html;
  table.querySelectorAll('button.danger').forEach(btn => {
    btn.addEventListener('click', () => { pendingEx.splice(parseInt(btn.dataset.i), 1); renderExTable(); });
  });
}
function renderGenTable() {
  const table = document.getElementById('genTable');
  if (pendingGen.length === 0) { table.innerHTML = ''; return; }
  let html = '<tr><th>部位</th><th>装備名</th><th>サブオプション</th><th>汎用等級</th><th></th></tr>';
  pendingGen.forEach((item, i) => {
    html += `<tr><td>${escapeHtml(item.slot)}</td><td>${escapeHtml(item.itemName)}</td><td>${escapeHtml(subOptionsText(item.subOptions))}</td><td>${gradeBadge(item.grade)}</td><td><button class="danger" data-i="${i}">削除</button></td></tr>`;
  });
  table.innerHTML = html;
  table.querySelectorAll('button.danger').forEach(btn => {
    btn.addEventListener('click', () => { pendingGen.splice(parseInt(btn.dataset.i), 1); renderGenTable(); });
  });
}

document.getElementById('addExBtn').addEventListener('click', () => {
  const char = document.getElementById('exChar').value;
  if (!char) { alert('キャラクターを選択してください。'); return; }
  const ability2 = document.getElementById('exAbility2').value;
  const subOptions = [document.getElementById('exSub1').value, document.getElementById('exSub2').value, document.getElementById('exSub3').value];
  const grade = document.getElementById('exGrade').value;
  const charGrade = document.getElementById('exCharGrade').value;
  pendingEx.push({ character: char, ability2, subOptions, grade, charGrade });
  renderExTable();
});
document.getElementById('addGenBtn').addEventListener('click', () => {
  const slot = document.getElementById('genSlot').value;
  const itemName = document.getElementById('genItem').value;
  const subOptions = [document.getElementById('genSub1').value, document.getElementById('genSub2').value, document.getElementById('genSub3').value];
  const grade = document.getElementById('genGrade').value;
  pendingGen.push({ slot, itemName, subOptions, grade });
  renderGenTable();
});

document.getElementById('saveBtn').addEventListener('click', async () => {
  const statusEl = document.getElementById('saveStatus');
  if (!currentUser) { statusEl.className = 'status err'; statusEl.textContent = '操作者を選択してください。'; return; }
  const data = { name: currentUser, exclusive: pendingEx, generic: pendingGen, updatedAt: new Date().toISOString() };
  try {
    await setDoc(doc(membersCol, currentUser), data);
    statusEl.className = 'status ok';
    statusEl.textContent = `保存しました(${currentUser})。`;
    await addLog(`装備データを保存しました(専用${pendingEx.length}件 / 汎用${pendingGen.length}件)`);
  } catch (e) {
    statusEl.className = 'status err';
    statusEl.textContent = '保存に失敗しました: ' + e.message;
  }
});

// ---------- 一覧を見る ----------
let allMembersCache = [];
async function fetchAllMembers() {
  const snap = await getDocs(membersCol);
  const members = [];
  snap.forEach(d => members.push(d.data()));
  return members;
}
function sortByGradeDesc(a, b) { return parseInt(b.grade) - parseInt(a.grade); }
function sortExHolders(a, b) {
  const gd = parseInt(b.grade) - parseInt(a.grade);
  if (gd !== 0) return gd;
  const ca = a.charGrade ? parseInt(a.charGrade) : -1;
  const cb = b.charGrade ? parseInt(b.charGrade) : -1;
  return cb - ca;
}

function enterExEditMode(tr, memberName, idx, item) {
  tr.querySelector('.cell-grade').innerHTML = `<select class="e-grade">${EX_GRADE_VALUES.map(g => `<option value="${g}" ${g===item.grade?'selected':''}>${g}等級</option>`).join('')}</select>`;
  const chargradeSel = document.createElement('select');
  fillCharGradeSelect(chargradeSel, item.charGrade || '');
  chargradeSel.className = 'e-chargrade';
  const cgCell = tr.querySelector('.cell-chargrade');
  cgCell.innerHTML = '';
  cgCell.appendChild(chargradeSel);
  tr.querySelector('.cell-ability2').innerHTML = `<select class="e-ability2">${SUB_OPTIONS.map(o => `<option ${o===item.ability2?'selected':''}>${escapeHtml(o)}</option>`).join('')}</select>`;
  tr.querySelector('.cell-sub1').innerHTML = `<select class="e-sub1">${SUB_OPTIONS.map(o => `<option ${o===item.subOptions[0]?'selected':''}>${escapeHtml(o)}</option>`).join('')}</select>`;
  tr.querySelector('.cell-sub2').innerHTML = `<select class="e-sub2">${SUB_OPTIONS.map(o => `<option ${o===item.subOptions[1]?'selected':''}>${escapeHtml(o)}</option>`).join('')}</select>`;
  tr.querySelector('.cell-sub3').innerHTML = `<select class="e-sub3">${SUB_OPTIONS.map(o => `<option ${o===item.subOptions[2]?'selected':''}>${escapeHtml(o)}</option>`).join('')}</select>`;
  tr.querySelector('.cell-actions').innerHTML = `<button class="primary small e-save">保存</button><button class="small e-cancel">キャンセル</button>`;

  tr.querySelector('.e-cancel').addEventListener('click', () => loadList());
  tr.querySelector('.e-save').addEventListener('click', async () => {
    const newItem = {
      character: item.character,
      ability2: tr.querySelector('.e-ability2').value,
      subOptions: [tr.querySelector('.e-sub1').value, tr.querySelector('.e-sub2').value, tr.querySelector('.e-sub3').value],
      grade: tr.querySelector('.e-grade').value,
      charGrade: tr.querySelector('.e-chargrade').value
    };
    const mSnap = await getDoc(doc(membersCol, memberName));
    if (!mSnap.exists()) return;
    const mData = mSnap.data();
    mData.exclusive[idx] = newItem;
    await setDoc(doc(membersCol, memberName), mData);
    await addLog(`「${memberName}」の専用装備『${item.character}』を編集しました`);
    loadList();
  });
}
function enterGenEditMode(tr, memberName, idx, item) {
  const grades = genGradeOptionsFor(item.slot);
  tr.querySelector('.cell-grade').innerHTML = `<select class="e-grade">${grades.map(g => `<option value="${g}" ${g===item.grade?'selected':''}>${g}等級</option>`).join('')}</select>`;
  tr.querySelector('.cell-sub1').innerHTML = `<select class="e-sub1">${SUB_OPTIONS.map(o => `<option ${o===item.subOptions[0]?'selected':''}>${escapeHtml(o)}</option>`).join('')}</select>`;
  tr.querySelector('.cell-sub2').innerHTML = `<select class="e-sub2">${SUB_OPTIONS.map(o => `<option ${o===item.subOptions[1]?'selected':''}>${escapeHtml(o)}</option>`).join('')}</select>`;
  tr.querySelector('.cell-sub3').innerHTML = `<select class="e-sub3">${SUB_OPTIONS.map(o => `<option ${o===item.subOptions[2]?'selected':''}>${escapeHtml(o)}</option>`).join('')}</select>`;
  tr.querySelector('.cell-actions').innerHTML = `<button class="primary small e-save">保存</button><button class="small e-cancel">キャンセル</button>`;

  tr.querySelector('.e-cancel').addEventListener('click', () => loadList());
  tr.querySelector('.e-save').addEventListener('click', async () => {
    const newItem = {
      slot: item.slot,
      itemName: item.itemName,
      subOptions: [tr.querySelector('.e-sub1').value, tr.querySelector('.e-sub2').value, tr.querySelector('.e-sub3').value],
      grade: tr.querySelector('.e-grade').value
    };
    const mSnap = await getDoc(doc(membersCol, memberName));
    if (!mSnap.exists()) return;
    const mData = mSnap.data();
    mData.generic[idx] = newItem;
    await setDoc(doc(membersCol, memberName), mData);
    await addLog(`「${memberName}」の汎用装備『${item.slot} / ${item.itemName}』を編集しました`);
    loadList();
  });
}

function getFilters() {
  return {
    search: document.getElementById('searchBox').value.trim().toLowerCase(),
    member: document.getElementById('filterMember').value,
    attr: document.getElementById('filterAttr').value,
    atkType: document.getElementById('filterAtkType').value,
    charGrade: document.getElementById('filterCharGrade').value,
    g24Only: document.getElementById('filterG24Only').checked
  };
}

function renderExList(members, filters) {
  const map = {};
  members.forEach(m => {
    (m.exclusive || []).forEach((item, idx) => {
      if (filters.search && !item.character.toLowerCase().includes(filters.search)) return;
      if (filters.member && m.name !== filters.member) return;
      if (filters.g24Only && item.grade !== '24') return;
      if (filters.charGrade && !matchesCharGradeFilter(item.charGrade, filters.charGrade)) return;
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

  let html = '<table class="wide-table"><tr><th>キャラ</th><th>所持者</th><th>専用等級</th><th>キャラ等級</th><th>基本能力2</th><th>サブ1</th><th>サブ2</th><th>サブ3</th><th>操作</th></tr>';
  chars.forEach((charName, ci) => {
    const holders = map[charName].sort(sortExHolders);
    const info = charInfo(charName);
    const charCellHtml = `${escapeHtml(attrEmoji(info.attr))}${escapeHtml(charName)}<br>${atkTypeBadge(info.atkType)}`;
    const grpClass = (ci % 2 === 0) ? 'grp-a' : 'grp-b';
    holders.forEach((h, hi) => {
      const rowId = `ex-row-${ci}-${hi}`;
      const isOwner = h.memberName === currentUser;
      html += `<tr id="${rowId}" class="${grpClass}${hi>0?' cont':''}" data-member="${escapeHtml(h.memberName)}" data-idx="${h.idx}">`;
      if (hi === 0) html += `<td class="name-cell" rowspan="${holders.length}">${charCellHtml}</td>`;
      html += `<td>${escapeHtml(h.memberName)}</td>`;
      html += `<td class="cell-grade">${gradeBadge(h.grade)}</td>`;
      html += `<td class="cell-chargrade">${charGradeBadge(h.charGrade) || '<span class="detail">未設定</span>'}</td>`;
      html += `<td class="cell-ability2">${escapeHtml(h.ability2)}</td>`;
      html += `<td class="cell-sub1">${escapeHtml(h.subOptions[0])}</td>`;
      html += `<td class="cell-sub2">${escapeHtml(h.subOptions[1])}</td>`;
      html += `<td class="cell-sub3">${escapeHtml(h.subOptions[2])}</td>`;
      html += `<td class="cell-actions">${isOwner ? `<button class="small" data-action="edit-ex">編集</button><button class="small danger" data-action="del-ex">削除</button>` : ''}</td>`;
      html += `</tr>`;
    });
  });
  html += '</table>';
  area.innerHTML = `<div class="table-wrap">${html}</div>`;
  const exNameCells = area.querySelectorAll('.name-cell');
  if (exNameCells.length) exNameCells[exNameCells.length - 1].classList.add('last-name-cell');

  area.querySelectorAll('[data-action="edit-ex"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const tr = btn.closest('tr');
      const memberName = tr.dataset.member, idx = parseInt(tr.dataset.idx);
      const item = allMembersCache.find(m => m.name === memberName).exclusive[idx];
      enterExEditMode(tr, memberName, idx, item);
    });
  });
  area.querySelectorAll('[data-action="del-ex"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('この専用装備の登録を削除しますか?')) return;
      const tr = btn.closest('tr');
      const memberName = tr.dataset.member, idx = parseInt(tr.dataset.idx);
      const mSnap = await getDoc(doc(membersCol, memberName));
      if (!mSnap.exists()) return;
      const mData = mSnap.data();
      const removed = mData.exclusive[idx];
      mData.exclusive.splice(idx, 1);
      await setDoc(doc(membersCol, memberName), mData);
      await addLog(`「${memberName}」の専用装備『${removed.character}』を削除しました`);
      loadList();
    });
  });
}

function renderGenList(members, filters) {
  const map = {};
  members.forEach(m => {
    (m.generic || []).forEach((item, idx) => {
      const label = `${item.slot} / ${item.itemName}`;
      if (filters.search && !label.toLowerCase().includes(filters.search)) return;
      if (filters.member && m.name !== filters.member) return;
      if (filters.g24Only && item.grade !== '24') return;
      if (!map[label]) map[label] = [];
      map[label].push({ memberName: m.name, idx, ...item });
    });
  });
  const labels = [];
  SLOTS.forEach(slot => {
    (EQUIPMENT_BY_SLOT[slot] || []).forEach(itemName => {
      const label = `${slot} / ${itemName}`;
      if (map[label]) labels.push(label);
    });
  });
  const area = document.getElementById('genListArea');
  if (labels.length === 0) { area.innerHTML = '<div class="empty">該当する登録がありません。</div>'; return; }

  let html = '<table class="wide-table"><tr><th>部位 / 装備名</th><th>所持者</th><th>等級</th><th>サブ1</th><th>サブ2</th><th>サブ3</th><th>操作</th></tr>';
  labels.forEach((label, li) => {
    const holders = map[label].sort(sortByGradeDesc);
    const itemName = label.split(' / ')[1];
    const slot = label.split(' / ')[0];
    const info = EQUIPMENT_DATA[itemName];
    const abilityText = info ? info.abilities.map(a => `${a.name.replace(/%$/, '')} ${a.value}`).join(' / ') : '-';
    const labelCellHtml = `${escapeHtml(label)}<span class="detail">${escapeHtml(abilityText)}</span>`;
    const grpClass = (li % 2 === 0) ? 'grp-a' : 'grp-b';
    holders.forEach((h, hi) => {
      const rowId = `gen-row-${li}-${hi}`;
      const isOwner = h.memberName === currentUser;
      html += `<tr id="${rowId}" class="${grpClass}${hi>0?' cont':''}" data-member="${escapeHtml(h.memberName)}" data-idx="${h.idx}" data-slot="${escapeHtml(slot)}">`;
      if (hi === 0) html += `<td class="name-cell" rowspan="${holders.length}">${labelCellHtml}</td>`;
      html += `<td>${escapeHtml(h.memberName)}</td>`;
      html += `<td class="cell-grade">${gradeBadge(h.grade)}</td>`;
      html += `<td class="cell-sub1">${escapeHtml(h.subOptions[0])}</td>`;
      html += `<td class="cell-sub2">${escapeHtml(h.subOptions[1])}</td>`;
      html += `<td class="cell-sub3">${escapeHtml(h.subOptions[2])}</td>`;
      html += `<td class="cell-actions">${isOwner ? `<button class="small" data-action="edit-gen">編集</button><button class="small danger" data-action="del-gen">削除</button>` : ''}</td>`;
      html += `</tr>`;
    });
  });
  html += '</table>';
  area.innerHTML = `<div class="table-wrap">${html}</div>`;
  const genNameCells = area.querySelectorAll('.name-cell');
  if (genNameCells.length) genNameCells[genNameCells.length - 1].classList.add('last-name-cell');

  area.querySelectorAll('[data-action="edit-gen"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const tr = btn.closest('tr');
      const memberName = tr.dataset.member, idx = parseInt(tr.dataset.idx);
      const item = allMembersCache.find(m => m.name === memberName).generic[idx];
      enterGenEditMode(tr, memberName, idx, item);
    });
  });
  area.querySelectorAll('[data-action="del-gen"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('この汎用装備の登録を削除しますか?')) return;
      const tr = btn.closest('tr');
      const memberName = tr.dataset.member, idx = parseInt(tr.dataset.idx);
      const mSnap = await getDoc(doc(membersCol, memberName));
      if (!mSnap.exists()) return;
      const mData = mSnap.data();
      const removed = mData.generic[idx];
      mData.generic.splice(idx, 1);
      await setDoc(doc(membersCol, memberName), mData);
      await addLog(`「${memberName}」の汎用装備『${removed.slot} / ${removed.itemName}』を削除しました`);
      loadList();
    });
  });
}

async function loadList() {
  document.getElementById('exListArea').innerHTML = '<div class="empty">読み込み中...</div>';
  document.getElementById('genListArea').innerHTML = '<div class="empty">読み込み中...</div>';
  try {
    allMembersCache = await fetchAllMembers();
    applyFilterAndRender();
  } catch (e) {
    document.getElementById('exListArea').innerHTML = `<div class="empty">読み込みエラー: ${e.message}</div>`;
  }
}
function applyFilterAndRender() {
  const filters = getFilters();
  renderExList(allMembersCache, filters);
  renderGenList(allMembersCache, filters);
}
['searchBox', 'filterMember', 'filterAttr', 'filterAtkType', 'filterCharGrade', 'filterG24Only'].forEach(id => {
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
    let mHtml = '<table><tr><th>名前</th>' + (isAdmin ? '<th style="width:100px;">操作</th>' : '') + '</tr>';
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
    let cHtml = '<table><tr><th style="width:80px;">属性</th><th>キャラ名</th><th style="width:160px;">攻撃タイプ</th><th style="width:100px;">操作</th></tr>';
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
    let html = '<div class="table-wrap"><table><tr><th>ID</th><th>紐付け先メンバー</th><th style="width:100px;">操作</th></tr>';
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
    let html = '<div class="table-wrap"><table><tr><th>ID</th><th style="width:100px;">操作</th></tr>';
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
async function loadLogs() {
  const area = document.getElementById('logArea');
  area.innerHTML = '<div class="empty">読み込み中...</div>';
  try {
    const snap = await getDocs(logsCol);
    const logs = [];
    snap.forEach(d => logs.push(d.data()));
    logs.sort((a, b) => (b.ts || '').localeCompare(a.ts || ''));
    const top = logs.slice(0, 200);
    if (top.length === 0) { area.innerHTML = '<div class="empty">まだログがありません。</div>'; return; }
    let html = '<table><tr><th style="width:160px;">日時</th><th style="width:120px;">操作者</th><th>内容</th></tr>';
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
