import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import {
  getFirestore, doc, getDoc, getDocs, setDoc, addDoc, deleteDoc, collection
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import {
  getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";

// ------------------------------------------------------------------
// Firebase設定(既存の equipment / gold-farming と共通のプロジェクト)
// ------------------------------------------------------------------
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

const charactersCol = collection(db, "damageCalcCharacters");
const bossesCol = collection(db, "damageCalcBosses");
const resultsCol = collection(db, "damageCalcResults");
const writeLogsCol = collection(db, "damageCalcWriteLogs");
const adminsCol = collection(db, "admins");
const userLinksCol = collection(db, "userLinks");
const goldFarmingCol = collection(db, "goldFarming");

const LOGIN_ID_SUFFIX = '@calmeguild.local';
function idToEmail(id) { return id.trim().toLowerCase() + LOGIN_ID_SUFFIX; }

async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : str;
  return div.innerHTML;
}
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

const SESSION_KEY = 'dmgc_pw_unlocked';

let route = null;        // 'main' | 'sub'
let isAdmin = false;
let operatorName = '';   // メインギルドの場合、userLinksから解決される表示名

// キャッシュ
let charactersCache = []; // [{id, name, skills:[...]}]
let bossesCache = [];     // [{id, name, totalHP, parts:[...]}]

// ------------------------------------------------------------------
// 書き込みログ(14章)
// ------------------------------------------------------------------
function logWrite(action, targetName) {
  addDoc(writeLogsCol, {
    route: route || 'unknown',
    action,
    targetName: targetName || '',
    timestamp: new Date().toISOString()
  }).catch(() => {});
}

// ------------------------------------------------------------------
// ログイン・ログアウト(13章: メイン/サブ2経路)
// ------------------------------------------------------------------
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
    const snap = await getDoc(doc(goldFarmingCol, "config"));
    const data = snap.exists() ? snap.data() : {};
    const inputHash = await sha256Hex(input);
    const matched = (data.passwordHash && inputHash === data.passwordHash) ||
                    (!data.passwordHash && data.password && input === data.password);
    if (matched) {
      sessionStorage.setItem(SESSION_KEY, '1');
      route = 'sub';
      isAdmin = false;
      operatorName = 'サブギルドメンバー';
      await enterApp();
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
  route = null; isAdmin = false; operatorName = '';
  showLoginScreen();
});

onAuthStateChanged(auth, async (user) => {
  if (user) {
    route = 'main';
    try {
      const email = (user.email || '').toLowerCase();
      const adminSnap = await getDoc(doc(adminsCol, email));
      isAdmin = adminSnap.exists();
      const linkSnap = await getDoc(doc(userLinksCol, email));
      operatorName = linkSnap.exists() ? (linkSnap.data().memberName || email) : email;
    } catch (e) {
      isAdmin = false; operatorName = (user.email || '').toLowerCase();
    }
    await enterApp();
  } else {
    if (sessionStorage.getItem(SESSION_KEY) === '1') {
      route = 'sub'; isAdmin = false; operatorName = 'サブギルドメンバー';
      await enterApp();
    } else {
      showLoginScreen();
    }
  }
});

async function enterApp() {
  showMainContent();
  document.getElementById('routeNote').textContent = route === 'main'
    ? `メインギルドとしてログイン中(${operatorName}${isAdmin ? ' / 管理者' : ''})`
    : 'サブギルドとして利用中';
  document.getElementById('charAdminOnlyNote').style.display = isAdmin ? 'none' : 'block';
  document.getElementById('deleteCharBtn').style.display = 'none';
  document.getElementById('saveCharBtn').disabled = !isAdmin;
  document.getElementById('addSkillBtn').disabled = !isAdmin;
  document.getElementById('connNote').textContent = '読み込み中...';
  await Promise.all([loadCharacters(), loadBosses()]);
  document.getElementById('connNote').textContent = '';
  renderCharList();
  renderBossList();
  if (document.getElementById('slotsArea').children.length === 0) addSlot();
  loadResults();
}

// ------------------------------------------------------------------
// タブ切り替え
// ------------------------------------------------------------------
document.querySelectorAll('.tab').forEach(tabEl => {
  tabEl.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tabEl.classList.add('active');
    document.querySelectorAll('.tabPanel').forEach(p => p.style.display = 'none');
    document.getElementById(tabEl.dataset.tab).style.display = 'block';
    if (tabEl.dataset.tab === 'results') loadResults();
  });
});

// ------------------------------------------------------------------
// {from,value} 配列の簡易記法パーサー/シリアライザ
//   "1:100,4:70" <-> [{from:1,value:100},{from:4,value:70}]
// ------------------------------------------------------------------
function parseIntervals(text) {
  if (!text) return [{ from: 1, value: 0 }];
  const parts = text.split(',').map(s => s.trim()).filter(Boolean);
  const result = parts.map(p => {
    const [f, v] = p.split(':').map(s => s.trim());
    return { from: Number(f) || 1, value: Number(v) || 0 };
  });
  return result.length ? result : [{ from: 1, value: 0 }];
}
function serializeIntervals(arr) {
  if (!arr || !arr.length) return '1:0';
  return arr.map(iv => `${iv.from}:${iv.value}`).join(',');
}
function getValue(intervals, hitNumber) {
  const applicable = (intervals || [])
    .filter(iv => iv.from <= hitNumber)
    .sort((a, b) => b.from - a.from);
  return applicable.length ? applicable[0].value : 0;
}

// ==================================================================
// 4章: キャラクター・スキルデータ / キャラ登録タブ
// ==================================================================
async function loadCharacters() {
  try {
    const snap = await getDocs(charactersCol);
    charactersCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    charactersCache = [];
  }
}

function renderCharList() {
  const area = document.getElementById('charListArea');
  if (!charactersCache.length) { area.innerHTML = '<div class="empty">まだ登録がありません。</div>'; return; }
  let html = '<div class="table-wrap"><table><tr><th>キャラ名</th><th>スキル数</th><th></th></tr>';
  charactersCache.forEach(c => {
    html += `<tr><td>${escapeHtml(c.name)}</td><td>${(c.skills || []).length}</td>
      <td><button class="small" data-edit-char="${c.id}" ${isAdmin ? '' : 'disabled'}>編集する</button></td></tr>`;
  });
  html += '</table></div>';
  area.innerHTML = html;
  area.querySelectorAll('[data-edit-char]').forEach(btn => {
    btn.addEventListener('click', () => loadCharIntoForm(btn.dataset.editChar));
  });
}

let currentEditCharId = null;
let skillDraftList = []; // 編集中のスキル配列(フォームの作業用状態)

function blankLevel(copies) {
  return {
    copies, maxHits: 1,
    skillMultiplier: [{ from: 1, value: 100 }],
    enhance: [{ from: 1, value: 0 }],
    elementBoost: [{ from: 1, value: 0 }],
    chainDamageIncrease: [{ from: 1, value: 0 }],
    selfBuff: { attackBuffPercent: [{ from: 1, value: 0 }], critRateBuffPercent: [{ from: 1, value: 0 }] },
    otherAdjustment: 0,
    allyBuff: { attackBuffPercent: 0, critRateBuffPercent: 0, enhancePercent: 0, elementBoostPercent: 0, chainDamageIncreasePercent: 0 }
  };
}
function blankBurst(burst) {
  return {
    burst, maxHitsAdd: 0, skillMultiplierAdd: 0, enhanceAdd: 0, elementBoostAdd: 0, chainDamageIncreaseAdd: 0,
    allyBuffAdd: { attackBuffPercent: 0, critRateBuffPercent: 0, enhancePercent: 0, elementBoostPercent: 0, chainDamageIncreasePercent: 0 }
  };
}
function blankSkill() {
  return {
    _uid: uid(),
    skillName: '新しいスキル',
    dealsDamage: true,
    grantsAllyBuff: false,
    damageType: 'physical',
    referenceFormula: [{ stat: 'attack', cap: null, coefficient: 100 }],
    mainTargetBonus: 0,
    copiesLevels: [0, 1, 2, 3, 4, 5].map(blankLevel),
    burstBonus: [0, 1, 2, 3].map(blankBurst)
  };
}

function loadCharIntoForm(charId) {
  const c = charactersCache.find(x => x.id === charId);
  if (!c) return;
  currentEditCharId = charId;
  document.getElementById('charEditTitle').textContent = `キャラクターを編集: ${c.name}`;
  document.getElementById('charName').value = c.name;
  skillDraftList = JSON.parse(JSON.stringify(c.skills || [])).map(s => ({ ...s, _uid: uid() }));
  renderSkillsArea();
  document.getElementById('deleteCharBtn').style.display = isAdmin ? 'inline-block' : 'none';
}

document.getElementById('newCharFormBtn').addEventListener('click', () => {
  currentEditCharId = null;
  document.getElementById('charEditTitle').textContent = 'キャラクターを新規登録';
  document.getElementById('charName').value = '';
  skillDraftList = [];
  renderSkillsArea();
  document.getElementById('deleteCharBtn').style.display = 'none';
  document.getElementById('charSaveStatus').textContent = '';
});

document.getElementById('addSkillBtn').addEventListener('click', () => {
  skillDraftList.push(blankSkill());
  renderSkillsArea();
});

function renderSkillsArea() {
  const area = document.getElementById('skillsArea');
  if (!skillDraftList.length) { area.innerHTML = '<div class="empty">スキルを追加してください。</div>'; return; }
  area.innerHTML = skillDraftList.map(s => skillBlockHtml(s)).join('');
  skillDraftList.forEach(s => bindSkillBlockEvents(s));
}

function statOptionsHtml(selected) {
  const opts = [
    ['attack', '攻撃力'], ['magicAttack', '魔法力'], ['selfMaxHP', '自身最大HP'],
    ['energyGuard', 'エナジーガード'], ['enemyTotalHP', '敵全体HP(5万上限)']
  ];
  return opts.map(([v, l]) => `<option value="${v}" ${selected === v ? 'selected' : ''}>${l}</option>`).join('');
}

function skillBlockHtml(s) {
  const damageFieldsDisplay = s.dealsDamage ? '' : 'style="display:none;"';
  const allyFieldsDisplay = s.grantsAllyBuff ? '' : 'style="display:none;"';
  return `
  <div class="skillBlock" data-skill="${s._uid}">
    <div class="skillHead">
      <input type="text" class="f-skillName" value="${escapeHtml(s.skillName)}" placeholder="スキル名">
      <label class="checkLabel"><input type="checkbox" class="f-dealsDamage" ${s.dealsDamage ? 'checked' : ''}> ダメージを与える</label>
      <label class="checkLabel"><input type="checkbox" class="f-grantsAllyBuff" ${s.grantsAllyBuff ? 'checked' : ''}> 味方にバフを配る</label>
      <button class="small danger f-removeSkill" type="button">スキルを削除</button>
    </div>

    <div class="damageFields" ${damageFieldsDisplay}>
      <div class="rowFields">
        <div class="formField"><label>ダメージ種別</label>
          <select class="f-damageType">
            <option value="physical" ${s.damageType === 'physical' ? 'selected' : ''}>物理</option>
            <option value="magic" ${s.damageType === 'magic' ? 'selected' : ''}>魔法</option>
          </select>
        </div>
        <div class="formField"><label>メインターゲット倍率(%)</label>
          <input type="number" class="f-mainTargetBonus" value="${s.mainTargetBonus || 0}">
        </div>
      </div>
      <label>参照ステータス(基準値の合成式)</label>
      <div class="formulaRows">${(s.referenceFormula || []).map((t, i) => formulaRowHtml(t, i)).join('')}</div>
      <button class="small f-addFormula" type="button">+ 参照項目を追加</button>

      <h3>凸(0〜5)ごとの基本値</h3>
      <div class="gridHint">スキル倍率・増強・属性強化・チェインダメ増加は「1:100,4:70」形式で「n回目の攻撃から値が変わる」を表現できます(変わらない場合は単一の値でOK)</div>
      <div class="table-wrap">${copiesGridHtml(s)}</div>

      <h3>バースト(0〜3)ごとの加算値</h3>
      <div class="table-wrap">${burstGridHtml(s)}</div>
    </div>

    <div class="allyFields" ${allyFieldsDisplay}>
      <div class="detail">味方への配布バフ数値も、凸/バーストのグリッド内(バフ列)にまとめて入力してください。</div>
    </div>
  </div>`;
}

function formulaRowHtml(t, i) {
  return `<div class="formulaRow" data-formula-idx="${i}">
    <select class="f-formulaStat">${statOptionsHtml(t.stat)}</select>
    <input type="number" class="f-formulaCap" placeholder="上限(無ければ空)" value="${t.cap == null ? '' : t.cap}">
    <input type="number" class="f-formulaCoef" placeholder="係数(%)" value="${t.coefficient}">
    <button class="small danger f-removeFormula" type="button">×</button>
  </div>`;
}

function copiesGridHtml(s) {
  let html = '<table class="gridTable"><tr><th>凸</th><th>攻撃回数</th><th>スキル倍率%</th><th>増強%</th><th>属性強化%</th><th>チェイン増加%</th>' +
    '<th>自己バフ:攻撃%</th><th>自己バフ:クリ率%</th><th>その他補正%</th>' +
    '<th>配布:攻撃%</th><th>配布:クリ率%</th><th>配布:増強%</th><th>配布:属性強化%</th><th>配布:チェイン増加%</th></tr>';
  s.copiesLevels.forEach((lv, i) => {
    html += `<tr data-copies-idx="${i}">
      <td>${lv.copies}凸</td>
      <td><input type="number" class="f-maxHits" value="${lv.maxHits}"></td>
      <td><input type="text" class="f-skillMultiplier" value="${serializeIntervals(lv.skillMultiplier)}"></td>
      <td><input type="text" class="f-enhance" value="${serializeIntervals(lv.enhance)}"></td>
      <td><input type="text" class="f-elementBoost" value="${serializeIntervals(lv.elementBoost)}"></td>
      <td><input type="text" class="f-chainDamageIncrease" value="${serializeIntervals(lv.chainDamageIncrease)}"></td>
      <td><input type="text" class="f-selfBuffAttack" value="${serializeIntervals(lv.selfBuff.attackBuffPercent)}"></td>
      <td><input type="text" class="f-selfBuffCrit" value="${serializeIntervals(lv.selfBuff.critRateBuffPercent)}"></td>
      <td><input type="number" class="f-otherAdjustment" value="${lv.otherAdjustment || 0}"></td>
      <td><input type="number" class="f-allyAttack" value="${lv.allyBuff.attackBuffPercent || 0}"></td>
      <td><input type="number" class="f-allyCrit" value="${lv.allyBuff.critRateBuffPercent || 0}"></td>
      <td><input type="number" class="f-allyEnhance" value="${lv.allyBuff.enhancePercent || 0}"></td>
      <td><input type="number" class="f-allyElement" value="${lv.allyBuff.elementBoostPercent || 0}"></td>
      <td><input type="number" class="f-allyChain" value="${lv.allyBuff.chainDamageIncreasePercent || 0}"></td>
    </tr>`;
  });
  return html + '</table>';
}

function burstGridHtml(s) {
  let html = '<table class="gridTable"><tr><th>バースト</th><th>攻撃回数+</th><th>スキル倍率+%</th><th>増強+%</th><th>属性強化+%</th><th>チェイン増加+%</th>' +
    '<th>配布:攻撃+%</th><th>配布:クリ率+%</th><th>配布:増強+%</th><th>配布:属性強化+%</th><th>配布:チェイン増加+%</th></tr>';
  s.burstBonus.forEach((b, i) => {
    html += `<tr data-burst-idx="${i}">
      <td>バースト${b.burst}</td>
      <td><input type="number" class="f-maxHitsAdd" value="${b.maxHitsAdd || 0}"></td>
      <td><input type="number" class="f-skillMultiplierAdd" value="${b.skillMultiplierAdd || 0}"></td>
      <td><input type="number" class="f-enhanceAdd" value="${b.enhanceAdd || 0}"></td>
      <td><input type="number" class="f-elementBoostAdd" value="${b.elementBoostAdd || 0}"></td>
      <td><input type="number" class="f-chainDamageIncreaseAdd" value="${b.chainDamageIncreaseAdd || 0}"></td>
      <td><input type="number" class="f-allyAttackAdd" value="${b.allyBuffAdd.attackBuffPercent || 0}"></td>
      <td><input type="number" class="f-allyCritAdd" value="${b.allyBuffAdd.critRateBuffPercent || 0}"></td>
      <td><input type="number" class="f-allyEnhanceAdd" value="${b.allyBuffAdd.enhancePercent || 0}"></td>
      <td><input type="number" class="f-allyElementAdd" value="${b.allyBuffAdd.elementBoostPercent || 0}"></td>
      <td><input type="number" class="f-allyChainAdd" value="${b.allyBuffAdd.chainDamageIncreasePercent || 0}"></td>
    </tr>`;
  });
  return html + '</table>';
}

function bindSkillBlockEvents(s) {
  const block = document.querySelector(`[data-skill="${s._uid}"]`);
  if (!block) return;
  block.querySelector('.f-skillName').addEventListener('input', e => s.skillName = e.target.value);
  block.querySelector('.f-dealsDamage').addEventListener('change', e => {
    s.dealsDamage = e.target.checked;
    block.querySelector('.damageFields').style.display = s.dealsDamage ? '' : 'none';
  });
  block.querySelector('.f-grantsAllyBuff').addEventListener('change', e => {
    s.grantsAllyBuff = e.target.checked;
    block.querySelector('.allyFields').style.display = s.grantsAllyBuff ? '' : 'none';
  });
  block.querySelector('.f-removeSkill').addEventListener('click', () => {
    skillDraftList = skillDraftList.filter(x => x._uid !== s._uid);
    renderSkillsArea();
  });
  block.querySelector('.f-damageType').addEventListener('change', e => s.damageType = e.target.value);
  block.querySelector('.f-mainTargetBonus').addEventListener('input', e => s.mainTargetBonus = Number(e.target.value) || 0);

  block.querySelector('.f-addFormula').addEventListener('click', () => {
    s.referenceFormula.push({ stat: 'attack', cap: null, coefficient: 100 });
    renderSkillsArea();
  });
  block.querySelectorAll('.formulaRow').forEach(row => {
    const idx = Number(row.dataset.formulaIdx);
    row.querySelector('.f-formulaStat').addEventListener('change', e => s.referenceFormula[idx].stat = e.target.value);
    row.querySelector('.f-formulaCap').addEventListener('input', e => s.referenceFormula[idx].cap = e.target.value === '' ? null : Number(e.target.value));
    row.querySelector('.f-formulaCoef').addEventListener('input', e => s.referenceFormula[idx].coefficient = Number(e.target.value) || 0);
    row.querySelector('.f-removeFormula').addEventListener('click', () => {
      s.referenceFormula.splice(idx, 1);
      renderSkillsArea();
    });
  });

  block.querySelectorAll('[data-copies-idx]').forEach(row => {
    const idx = Number(row.dataset.copiesIdx);
    const lv = s.copiesLevels[idx];
    row.querySelector('.f-maxHits').addEventListener('input', e => lv.maxHits = Number(e.target.value) || 1);
    row.querySelector('.f-skillMultiplier').addEventListener('input', e => lv.skillMultiplier = parseIntervals(e.target.value));
    row.querySelector('.f-enhance').addEventListener('input', e => lv.enhance = parseIntervals(e.target.value));
    row.querySelector('.f-elementBoost').addEventListener('input', e => lv.elementBoost = parseIntervals(e.target.value));
    row.querySelector('.f-chainDamageIncrease').addEventListener('input', e => lv.chainDamageIncrease = parseIntervals(e.target.value));
    row.querySelector('.f-selfBuffAttack').addEventListener('input', e => lv.selfBuff.attackBuffPercent = parseIntervals(e.target.value));
    row.querySelector('.f-selfBuffCrit').addEventListener('input', e => lv.selfBuff.critRateBuffPercent = parseIntervals(e.target.value));
    row.querySelector('.f-otherAdjustment').addEventListener('input', e => lv.otherAdjustment = Number(e.target.value) || 0);
    row.querySelector('.f-allyAttack').addEventListener('input', e => lv.allyBuff.attackBuffPercent = Number(e.target.value) || 0);
    row.querySelector('.f-allyCrit').addEventListener('input', e => lv.allyBuff.critRateBuffPercent = Number(e.target.value) || 0);
    row.querySelector('.f-allyEnhance').addEventListener('input', e => lv.allyBuff.enhancePercent = Number(e.target.value) || 0);
    row.querySelector('.f-allyElement').addEventListener('input', e => lv.allyBuff.elementBoostPercent = Number(e.target.value) || 0);
    row.querySelector('.f-allyChain').addEventListener('input', e => lv.allyBuff.chainDamageIncreasePercent = Number(e.target.value) || 0);
  });

  block.querySelectorAll('[data-burst-idx]').forEach(row => {
    const idx = Number(row.dataset.burstIdx);
    const b = s.burstBonus[idx];
    row.querySelector('.f-maxHitsAdd').addEventListener('input', e => b.maxHitsAdd = Number(e.target.value) || 0);
    row.querySelector('.f-skillMultiplierAdd').addEventListener('input', e => b.skillMultiplierAdd = Number(e.target.value) || 0);
    row.querySelector('.f-enhanceAdd').addEventListener('input', e => b.enhanceAdd = Number(e.target.value) || 0);
    row.querySelector('.f-elementBoostAdd').addEventListener('input', e => b.elementBoostAdd = Number(e.target.value) || 0);
    row.querySelector('.f-chainDamageIncreaseAdd').addEventListener('input', e => b.chainDamageIncreaseAdd = Number(e.target.value) || 0);
    row.querySelector('.f-allyAttackAdd').addEventListener('input', e => b.allyBuffAdd.attackBuffPercent = Number(e.target.value) || 0);
    row.querySelector('.f-allyCritAdd').addEventListener('input', e => b.allyBuffAdd.critRateBuffPercent = Number(e.target.value) || 0);
    row.querySelector('.f-allyEnhanceAdd').addEventListener('input', e => b.allyBuffAdd.enhancePercent = Number(e.target.value) || 0);
    row.querySelector('.f-allyElementAdd').addEventListener('input', e => b.allyBuffAdd.elementBoostPercent = Number(e.target.value) || 0);
    row.querySelector('.f-allyChainAdd').addEventListener('input', e => b.allyBuffAdd.chainDamageIncreasePercent = Number(e.target.value) || 0);
  });
}

document.getElementById('saveCharBtn').addEventListener('click', async () => {
  const statusEl = document.getElementById('charSaveStatus');
  if (!isAdmin) { statusEl.className = 'status err'; statusEl.textContent = 'キャラ登録は管理者のみ行えます。'; return; }
  const name = document.getElementById('charName').value.trim();
  if (!name) { statusEl.className = 'status err'; statusEl.textContent = 'キャラクター名を入力してください。'; return; }
  if (!skillDraftList.length) { statusEl.className = 'status err'; statusEl.textContent = 'スキルを最低1つ追加してください。'; return; }
  const cleanSkills = skillDraftList.map(({ _uid, ...rest }) => rest);
  const docId = currentEditCharId || name;
  try {
    await setDoc(doc(charactersCol, docId), {
      name, skills: cleanSkills, registeredBy: operatorName, updatedAt: new Date().toISOString()
    });
    logWrite('characterSave', name);
    statusEl.className = 'status ok'; statusEl.textContent = '保存しました。';
    currentEditCharId = docId;
    await loadCharacters();
    renderCharList();
  } catch (e) {
    statusEl.className = 'status err'; statusEl.textContent = '保存に失敗しました: ' + e.message;
  }
});

document.getElementById('deleteCharBtn').addEventListener('click', async () => {
  if (!currentEditCharId || !isAdmin) return;
  if (!confirm('このキャラクターを削除しますか？この操作は取り消せません。')) return;
  try {
    await deleteDoc(doc(charactersCol, currentEditCharId));
    logWrite('characterDelete', document.getElementById('charName').value);
    document.getElementById('newCharFormBtn').click();
    await loadCharacters();
    renderCharList();
  } catch (e) {
    alert('削除に失敗しました: ' + e.message);
  }
});

// ==================================================================
// 6章: ボスデータ / ボス登録タブ
// ==================================================================
async function loadBosses() {
  try {
    const snap = await getDocs(bossesCol);
    bossesCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    bossesCache = [];
  }
}

function renderBossList() {
  const area = document.getElementById('bossListArea');
  if (!bossesCache.length) { area.innerHTML = '<div class="empty">まだ登録がありません。</div>'; return; }
  let html = '<div class="table-wrap"><table><tr><th>ボス名</th><th>全体HP</th><th>部位数</th><th></th></tr>';
  bossesCache.forEach(b => {
    html += `<tr><td>${escapeHtml(b.name)}</td><td>${b.totalHP}</td><td>${(b.parts || []).length}</td>
      <td><button class="small" data-edit-boss="${b.id}">編集する</button></td></tr>`;
  });
  html += '</table></div>';
  area.innerHTML = html;
  area.querySelectorAll('[data-edit-boss]').forEach(btn => {
    btn.addEventListener('click', () => loadBossIntoForm(btn.dataset.editBoss));
  });
}

let currentEditBossId = null;
let partDraftList = [];

function blankPart() {
  return {
    _uid: uid(), name: '新しい部位', weakSpot: 100,
    defense: [{ from: 1, value: 0 }], magicResist: [{ from: 1, value: 0 }],
    vulnerability: [{ from: 1, value: 0 }], barrier: [{ from: 1, value: 0 }],
    elementVulnerability: [{ from: 1, value: 0 }], isMainTarget: false
  };
}

function loadBossIntoForm(bossId) {
  const b = bossesCache.find(x => x.id === bossId);
  if (!b) return;
  currentEditBossId = bossId;
  document.getElementById('bossEditTitle').textContent = `ボスを編集: ${b.name}`;
  document.getElementById('bossName').value = b.name;
  document.getElementById('bossTotalHP').value = b.totalHP;
  partDraftList = JSON.parse(JSON.stringify(b.parts || [])).map(p => ({ ...p, _uid: uid() }));
  renderPartsArea();
  document.getElementById('deleteBossBtn').style.display = 'inline-block';
}

document.getElementById('newBossFormBtn').addEventListener('click', () => {
  currentEditBossId = null;
  document.getElementById('bossEditTitle').textContent = 'ボスを新規登録';
  document.getElementById('bossName').value = '';
  document.getElementById('bossTotalHP').value = '';
  partDraftList = [];
  renderPartsArea();
  document.getElementById('deleteBossBtn').style.display = 'none';
  document.getElementById('bossSaveStatus').textContent = '';
});

document.getElementById('bossHpCapBtn').addEventListener('click', () => {
  document.getElementById('bossTotalHP').value = 50000;
});

document.getElementById('addPartBtn').addEventListener('click', () => {
  partDraftList.push(blankPart());
  renderPartsArea();
});

function renderPartsArea() {
  const area = document.getElementById('partsArea');
  if (!partDraftList.length) { area.innerHTML = '<div class="empty">部位を追加してください。</div>'; return; }
  area.innerHTML = partDraftList.map(p => partBlockHtml(p)).join('');
  partDraftList.forEach(p => bindPartBlockEvents(p));
}

function partBlockHtml(p) {
  return `
  <div class="partBlock" data-part="${p._uid}">
    <div class="partHead">
      <input type="text" class="f-partName" value="${escapeHtml(p.name)}" placeholder="部位名">
      <label>弱点倍率(100+WEAK%)</label>
      <input type="number" class="f-weakSpot" value="${p.weakSpot}" style="max-width:100px;">
      <label class="checkLabel"><input type="radio" name="mainTargetRadio" class="f-isMainTarget" ${p.isMainTarget ? 'checked' : ''}> メインターゲット</label>
      <button class="small danger f-removePart" type="button">部位を削除</button>
    </div>
    <div class="gridHint">各項目は「1:30,4:0」形式で「n回目の攻撃から値が変わる」を表現できます(バリアが途中で割れる等)</div>
    <div class="rowFields">
      <div class="formField"><label>物理防御%</label><input type="text" class="f-defense" value="${serializeIntervals(p.defense)}"></div>
      <div class="formField"><label>魔法抵抗%</label><input type="text" class="f-magicResist" value="${serializeIntervals(p.magicResist)}"></div>
      <div class="formField"><label>脆弱%</label><input type="text" class="f-vulnerability" value="${serializeIntervals(p.vulnerability)}"></div>
      <div class="formField"><label>バリア%</label><input type="text" class="f-barrier" value="${serializeIntervals(p.barrier)}"></div>
      <div class="formField"><label>属性脆弱%</label><input type="text" class="f-elementVulnerability" value="${serializeIntervals(p.elementVulnerability)}"></div>
    </div>
  </div>`;
}

function bindPartBlockEvents(p) {
  const block = document.querySelector(`[data-part="${p._uid}"]`);
  if (!block) return;
  block.querySelector('.f-partName').addEventListener('input', e => p.name = e.target.value);
  block.querySelector('.f-weakSpot').addEventListener('input', e => p.weakSpot = Number(e.target.value) || 0);
  block.querySelector('.f-isMainTarget').addEventListener('change', () => {
    partDraftList.forEach(x => x.isMainTarget = false);
    p.isMainTarget = true;
  });
  block.querySelector('.f-removePart').addEventListener('click', () => {
    partDraftList = partDraftList.filter(x => x._uid !== p._uid);
    renderPartsArea();
  });
  block.querySelector('.f-defense').addEventListener('input', e => p.defense = parseIntervals(e.target.value));
  block.querySelector('.f-magicResist').addEventListener('input', e => p.magicResist = parseIntervals(e.target.value));
  block.querySelector('.f-vulnerability').addEventListener('input', e => p.vulnerability = parseIntervals(e.target.value));
  block.querySelector('.f-barrier').addEventListener('input', e => p.barrier = parseIntervals(e.target.value));
  block.querySelector('.f-elementVulnerability').addEventListener('input', e => p.elementVulnerability = parseIntervals(e.target.value));
}

document.getElementById('saveBossBtn').addEventListener('click', async () => {
  const statusEl = document.getElementById('bossSaveStatus');
  const name = document.getElementById('bossName').value.trim();
  const totalHP = Number(document.getElementById('bossTotalHP').value) || 0;
  if (!name) { statusEl.className = 'status err'; statusEl.textContent = 'ボス名を入力してください。'; return; }
  if (!partDraftList.length) { statusEl.className = 'status err'; statusEl.textContent = '部位を最低1つ追加してください。'; return; }
  const cleanParts = partDraftList.map(({ _uid, ...rest }) => rest);
  const docId = currentEditBossId || name;
  try {
    await setDoc(doc(bossesCol, docId), {
      name, totalHP, parts: cleanParts, updatedAt: new Date().toISOString()
    });
    logWrite('bossSave', name);
    statusEl.className = 'status ok'; statusEl.textContent = '保存しました。';
    currentEditBossId = docId;
    await loadBosses();
    renderBossList();
  } catch (e) {
    statusEl.className = 'status err'; statusEl.textContent = '保存に失敗しました: ' + e.message;
  }
});

document.getElementById('deleteBossBtn').addEventListener('click', async () => {
  if (!currentEditBossId) return;
  if (!confirm('このボスを削除しますか？この操作は取り消せません。')) return;
  try {
    await deleteDoc(doc(bossesCol, currentEditBossId));
    logWrite('bossDelete', document.getElementById('bossName').value);
    document.getElementById('newBossFormBtn').click();
    await loadBosses();
    renderBossList();
  } catch (e) {
    alert('削除に失敗しました: ' + e.message);
  }
});

// ==================================================================
// 5・7・8・9章: 計算エンジン
// ==================================================================
function getEffectiveLevel(skill, copies, burst) {
  const base = skill.copiesLevels.find(c => c.copies === copies);
  const bonus = skill.burstBonus.find(b => b.burst === burst);
  const addBonus = (intervals, add) => (intervals || []).map(iv => ({ ...iv, value: iv.value + add }));
  return {
    maxHits: (base.maxHits || 1) + (bonus.maxHitsAdd || 0),
    skillMultiplier: addBonus(base.skillMultiplier, bonus.skillMultiplierAdd),
    enhance: addBonus(base.enhance, bonus.enhanceAdd),
    elementBoost: addBonus(base.elementBoost, bonus.elementBoostAdd),
    chainDamageIncrease: addBonus(base.chainDamageIncrease, bonus.chainDamageIncreaseAdd),
    selfBuff: base.selfBuff,
    otherAdjustment: base.otherAdjustment || 0,
    allyBuff: base.allyBuff ? {
      attackBuffPercent: (base.allyBuff.attackBuffPercent || 0) + (bonus.allyBuffAdd?.attackBuffPercent || 0),
      critRateBuffPercent: (base.allyBuff.critRateBuffPercent || 0) + (bonus.allyBuffAdd?.critRateBuffPercent || 0),
      enhancePercent: (base.allyBuff.enhancePercent || 0) + (bonus.allyBuffAdd?.enhancePercent || 0),
      elementBoostPercent: (base.allyBuff.elementBoostPercent || 0) + (bonus.allyBuffAdd?.elementBoostPercent || 0),
      chainDamageIncreasePercent: (base.allyBuff.chainDamageIncreasePercent || 0) + (bonus.allyBuffAdd?.chainDamageIncreasePercent || 0)
    } : null
  };
}

function getStatValue(stat, inputStats, boss) {
  if (stat === 'enemyTotalHP') return Math.min(boss ? boss.totalHP : 0, 50000);
  return Number(inputStats[stat]) || 0;
}
function getBaseValue(referenceFormula, inputStats, boss) {
  return referenceFormula.reduce((sum, term) => {
    const raw = getStatValue(term.stat, inputStats, boss);
    const capped = term.cap != null ? Math.min(raw, term.cap) : raw;
    return sum + Math.floor(capped * term.coefficient / 100);
  }, 0);
}
function roundDown(n) { return Math.floor(n); }

function sumAllyBuffs(list) {
  return list.reduce((acc, b) => {
    acc.attackBuffPercent += b.attackBuffPercent || 0;
    acc.critRateBuffPercent += b.critRateBuffPercent || 0;
    acc.enhancePercent += b.enhancePercent || 0;
    acc.elementBoostPercent += b.elementBoostPercent || 0;
    acc.chainDamageIncreasePercent += b.chainDamageIncreasePercent || 0;
    return acc;
  }, { attackBuffPercent: 0, critRateBuffPercent: 0, enhancePercent: 0, elementBoostPercent: 0, chainDamageIncreasePercent: 0 });
}

// skill: スキル本体, level: getEffectiveLevel()の結果, inputStats: 都度入力ステータス
// battleBuffs: selfBuff以外(バフキャラ合算＋ボスから貰えるバフ)を合算したオブジェクト
// part: ボスの部位(defense等は{from,value}配列, startingChainCountは呼び出し側で都度入力)
function calcDamage(skill, level, inputStats, battleBuffs, boss, part) {
  const base = getBaseValue(skill.referenceFormula, inputStats, boss);
  const isMagic = skill.damageType === 'magic';

  const totalCritRate = (Number(inputStats.critRate) || 0) + battleBuffs.critRateBuffPercent;
  const overCap = Math.max(0, totalCritRate - 100);
  const critDmg = (Number(inputStats.critDamage) || 0) + overCap * 6;

  let general = 0, fixed = 0, pure = 0;

  for (let hit = 1; hit <= level.maxHits; hit++) {
    const buff = battleBuffs.attackBuffPercent + getValue(level.selfBuff?.attackBuffPercent || [], hit);
    const mult = getValue(level.skillMultiplier, hit);
    const defense = isMagic ? getValue(part.magicResist, hit) : getValue(part.defense, hit);
    const barrier = getValue(part.barrier, hit);
    const enhance = battleBuffs.enhancePercent + getValue(level.enhance, hit);
    const vulnerability = getValue(part.vulnerability, hit);
    const elementVuln = getValue(part.elementVulnerability, hit);
    const elementBoost = battleBuffs.elementBoostPercent + getValue(level.elementBoost, hit);
    const chainAdd = battleBuffs.chainDamageIncreasePercent + getValue(level.chainDamageIncrease, hit);
    const chainCount = (part.startingChainCount || 0) + hit;
    const weakSpot = part.weakSpot;
    const mainTargetMult = part.isMainTarget ? (1 + (skill.mainTargetBonus || 0) / 100) : 1;
    const otherMult = 1 + (level.otherAdjustment || 0) / 100;

    let step2 = roundDown(base * (1 + buff / 100));
    step2 = roundDown(step2 * mult / 100);

    let g = step2 * (1 + critDmg / 100);
    g = g * (1 - defense / 100);
    g = roundDown(g * (1 - barrier / 100) * (1 + (enhance + vulnerability + elementVuln) / 100));
    g = roundDown(g * (1 + elementBoost / 100));
    g = g * (1 + (10 + chainAdd) / 100 * chainCount);
    g = roundDown(g * weakSpot / 100 * mainTargetMult * otherMult);
    general += roundDown(g);

    let f = roundDown(step2 * (1 + enhance / 100));
    f = roundDown(f * (1 + elementBoost / 100));
    f = f * (1 + (10 + chainAdd) / 100 * chainCount);
    f = roundDown(f * weakSpot / 100 * mainTargetMult * otherMult);
    fixed += roundDown(f);

    let p2 = roundDown(step2 * (1 + (enhance + vulnerability + elementVuln) / 100));
    p2 = roundDown(p2 * (1 + elementBoost / 100));
    p2 = p2 * (1 + critDmg / 100);
    p2 = p2 * (1 + (10 + chainAdd) / 100 * chainCount);
    p2 = roundDown(p2 * weakSpot / 100 * mainTargetMult * otherMult);
    pure += roundDown(p2);
  }

  return { general, fixed, pure, maxHits: level.maxHits, totalCritRate };
}

// ==================================================================
// 7.5章: 計算タブ(スロットUI)
// ==================================================================
let slotCounter = 0;

function statInputLabel(stat) {
  return { attack: '攻撃力', magicAttack: '魔法力', selfMaxHP: '自身最大HP', energyGuard: 'エナジーガード', enemyTotalHP: '敵全体HP(ボスから自動取得)' }[stat] || stat;
}

function addSlot(snapshot) {
  slotCounter++;
  const slotId = 'slot' + slotCounter;
  const el = document.createElement('div');
  el.className = 'calcSlot';
  el.id = slotId;
  el.innerHTML = `
    <div class="slotHead">
      <h3>計算スロット #${slotCounter}</h3>
      <button class="small danger f-removeSlot" type="button" style="margin-left:auto;">スロットを閉じる</button>
    </div>
    <div class="rowFields">
      <div class="formField"><label>キャラクター</label><select class="f-slotChar"><option value="">選択してください</option></select></div>
      <div class="formField"><label>スキル</label><select class="f-slotSkill"><option value="">-</option></select></div>
      <div class="formField"><label>凸</label><select class="f-slotCopies">${[0,1,2,3,4,5].map(n=>`<option value="${n}">${n}凸</option>`).join('')}</select></div>
      <div class="formField"><label>バースト</label><select class="f-slotBurst">${[0,1,2,3].map(n=>`<option value="${n}">バースト${n}</option>`).join('')}</select></div>
    </div>
    <div class="f-referenceInputs rowFields"></div>
    <div class="rowFields">
      <div class="formField"><label>クリ率(ステータス画面値・%)</label><input type="number" class="f-critRate" value="0"></div>
      <div class="formField"><label>クリダメ(ステータス画面値・%)</label><input type="number" class="f-critDamage" value="0"></div>
    </div>

    <h3>バフキャラ選択</h3>
    <div class="f-buffList buffList"><div class="empty">配布バフを持つスキルがまだ登録されていません。</div></div>

    <h3>ボスから貰えるバフ(手動加算)</h3>
    <div class="rowFields">
      <div class="formField"><label>攻撃バフ%</label><input type="number" class="f-bossBuffAttack" value="0"></div>
      <div class="formField"><label>クリ率バフ%</label><input type="number" class="f-bossBuffCrit" value="0"></div>
      <div class="formField"><label>増強%</label><input type="number" class="f-bossBuffEnhance" value="0"></div>
      <div class="formField"><label>属性強化%</label><input type="number" class="f-bossBuffElement" value="0"></div>
      <div class="formField"><label>チェイン増加%</label><input type="number" class="f-bossBuffChain" value="0"></div>
    </div>

    <h3>対象ボス</h3>
    <div class="formField"><label>ボス</label><select class="f-slotBoss"><option value="">選択してください</option></select></div>
    <div class="f-partsTable"></div>

    <div style="margin-top:10px;">
      <button class="primary f-calcBtn" type="button">計算する</button>
    </div>
    <div class="f-critWarning"></div>
    <div class="f-resultArea"></div>
    <div class="rowFields" style="margin-top:8px;">
      <div class="formField"><label>保存ラベル</label><input type="text" class="f-saveLabel" placeholder="例: ○○ボス 頭狙い編成"></div>
      <div class="formField" style="align-self:end;"><button class="f-saveResultBtn" type="button">この結果を保存する</button></div>
    </div>
    <div class="f-saveStatus status"></div>
  `;
  document.getElementById('slotsArea').appendChild(el);
  bindSlotEvents(el);
  populateSlotCharSelect(el);
  populateSlotBossSelect(el);
  renderSlotBuffList(el);
  if (snapshot) applySnapshotToSlot(el, snapshot);
  return el;
}

document.getElementById('addSlotBtn').addEventListener('click', () => addSlot());

function populateSlotCharSelect(el) {
  const sel = el.querySelector('.f-slotChar');
  const damageChars = charactersCache.filter(c => (c.skills || []).some(s => s.dealsDamage));
  sel.innerHTML = '<option value="">選択してください</option>' +
    damageChars.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
}
function populateSlotBossSelect(el) {
  const sel = el.querySelector('.f-slotBoss');
  sel.innerHTML = '<option value="">選択してください</option>' +
    bossesCache.map(b => `<option value="${b.id}">${escapeHtml(b.name)}</option>`).join('');
}

function renderSlotBuffList(el) {
  const wrap = el.querySelector('.f-buffList');
  const items = [];
  charactersCache.forEach(c => {
    (c.skills || []).forEach(s => {
      if (s.grantsAllyBuff) items.push({ charName: c.name, skill: s });
    });
  });
  if (!items.length) { wrap.innerHTML = '<div class="empty">配布バフを持つスキルがまだ登録されていません。</div>'; return; }
  wrap.innerHTML = items.map((it, i) => `
    <div class="buffItem" data-buff-idx="${i}">
      <label class="checkLabel"><input type="checkbox" class="f-buffCheck"> ${escapeHtml(it.charName)} - ${escapeHtml(it.skill.skillName)}</label>
      凸<select class="f-buffCopies">${[0,1,2,3,4,5].map(n=>`<option value="${n}">${n}</option>`).join('')}</select>
      バースト<select class="f-buffBurst">${[0,1,2,3].map(n=>`<option value="${n}">${n}</option>`).join('')}</select>
    </div>`).join('');
  wrap._buffItems = items;
}

function bindSlotEvents(el) {
  el.querySelector('.f-removeSlot').addEventListener('click', () => el.remove());
  el.querySelector('.f-slotChar').addEventListener('change', () => populateSlotSkillSelect(el));
  el.querySelector('.f-slotSkill').addEventListener('change', () => renderReferenceInputs(el));
  el.querySelector('.f-slotBoss').addEventListener('change', () => renderPartsTable(el));
  el.querySelector('.f-calcBtn').addEventListener('click', () => runSlotCalc(el));
  el.querySelector('.f-saveResultBtn').addEventListener('click', () => saveSlotResult(el));
}

function currentSlotSkill(el) {
  const charId = el.querySelector('.f-slotChar').value;
  const skillIdx = el.querySelector('.f-slotSkill').value;
  const c = charactersCache.find(x => x.id === charId);
  if (!c || skillIdx === '') return null;
  return { character: c, skill: c.skills[Number(skillIdx)] };
}

function populateSlotSkillSelect(el) {
  const charId = el.querySelector('.f-slotChar').value;
  const c = charactersCache.find(x => x.id === charId);
  const sel = el.querySelector('.f-slotSkill');
  if (!c) { sel.innerHTML = '<option value="">-</option>'; renderReferenceInputs(el); return; }
  sel.innerHTML = c.skills.map((s, i) => s.dealsDamage ? `<option value="${i}">${escapeHtml(s.skillName)}</option>` : '').join('');
  renderReferenceInputs(el);
}

function renderReferenceInputs(el) {
  const wrap = el.querySelector('.f-referenceInputs');
  const cur = currentSlotSkill(el);
  if (!cur || !cur.skill.referenceFormula) { wrap.innerHTML = ''; return; }
  const stats = [...new Set(cur.skill.referenceFormula.map(t => t.stat))].filter(s => s !== 'enemyTotalHP');
  wrap.innerHTML = stats.map(s => `
    <div class="formField"><label>${statInputLabel(s)}</label><input type="number" class="f-stat-${s}" value="0"></div>
  `).join('');
}

function renderPartsTable(el) {
  const bossId = el.querySelector('.f-slotBoss').value;
  const boss = bossesCache.find(x => x.id === bossId);
  const wrap = el.querySelector('.f-partsTable');
  if (!boss) { wrap.innerHTML = ''; return; }
  wrap.innerHTML = `<div class="table-wrap"><table><tr><th>部位</th><th>メインターゲット</th><th>開始チェイン数</th></tr>
    ${boss.parts.map((p, i) => `<tr><td>${escapeHtml(p.name)}</td><td>${p.isMainTarget ? '★' : ''}</td>
      <td><input type="number" class="f-startChain" data-part-idx="${i}" value="0" style="width:80px;"></td></tr>`).join('')}
  </table></div>`;
}

function runSlotCalc(el) {
  const cur = currentSlotSkill(el);
  const resultArea = el.querySelector('.f-resultArea');
  const warnArea = el.querySelector('.f-critWarning');
  if (!cur) { resultArea.innerHTML = '<div class="status err">キャラ・スキルを選択してください。</div>'; return; }
  const bossId = el.querySelector('.f-slotBoss').value;
  const boss = bossesCache.find(x => x.id === bossId);
  if (!boss) { resultArea.innerHTML = '<div class="status err">対象ボスを選択してください。</div>'; return; }

  const copies = Number(el.querySelector('.f-slotCopies').value);
  const burst = Number(el.querySelector('.f-slotBurst').value);
  const level = getEffectiveLevel(cur.skill, copies, burst);

  const inputStats = {};
  el.querySelectorAll('[class^="f-stat-"]').forEach(inp => {
    const statName = inp.className.replace('f-stat-', '').split(' ')[0];
    inputStats[statName] = Number(inp.value) || 0;
  });
  inputStats.critRate = Number(el.querySelector('.f-critRate').value) || 0;
  inputStats.critDamage = Number(el.querySelector('.f-critDamage').value) || 0;

  // バフキャラ合算
  const buffWrap = el.querySelector('.f-buffList');
  const selectedAllyBuffs = [];
  buffWrap.querySelectorAll('.buffItem').forEach(item => {
    const idx = Number(item.dataset.buffIdx);
    const checked = item.querySelector('.f-buffCheck').checked;
    if (!checked) return;
    const bCopies = Number(item.querySelector('.f-buffCopies').value);
    const bBurst = Number(item.querySelector('.f-buffBurst').value);
    const it = buffWrap._buffItems[idx];
    const effLevel = getEffectiveLevel(it.skill, bCopies, bBurst);
    if (effLevel.allyBuff) selectedAllyBuffs.push(effLevel.allyBuff);
  });
  const buffSum = sumAllyBuffs(selectedAllyBuffs);
  const bossBuff = {
    attackBuffPercent: Number(el.querySelector('.f-bossBuffAttack').value) || 0,
    critRateBuffPercent: Number(el.querySelector('.f-bossBuffCrit').value) || 0,
    enhancePercent: Number(el.querySelector('.f-bossBuffEnhance').value) || 0,
    elementBoostPercent: Number(el.querySelector('.f-bossBuffElement').value) || 0,
    chainDamageIncreasePercent: Number(el.querySelector('.f-bossBuffChain').value) || 0
  };
  const battleBuffs = {
    attackBuffPercent: buffSum.attackBuffPercent + bossBuff.attackBuffPercent,
    critRateBuffPercent: buffSum.critRateBuffPercent + bossBuff.critRateBuffPercent,
    enhancePercent: buffSum.enhancePercent + bossBuff.enhancePercent,
    elementBoostPercent: buffSum.elementBoostPercent + bossBuff.elementBoostPercent,
    chainDamageIncreasePercent: buffSum.chainDamageIncreasePercent + bossBuff.chainDamageIncreasePercent
  };

  const startChainInputs = el.querySelectorAll('.f-startChain');
  const results = boss.parts.map((part, i) => {
    const partWithChain = { ...part, startingChainCount: Number(startChainInputs[i]?.value) || 0 };
    const r = calcDamage(cur.skill, level, inputStats, battleBuffs, boss, partWithChain);
    return { partName: part.name, ...r };
  });

  const totalCritRate = results.length ? results[0].totalCritRate : 0;
  if (totalCritRate < 100) {
    warnArea.innerHTML = `<div class="critWarning">⚠ クリ率${totalCritRate}%(100%未満のためダメージにブレが発生します。クリティカルマラソン推奨)</div>`;
  } else {
    warnArea.innerHTML = `<div class="critOk">クリ率${totalCritRate}%(100%到達済み)</div>`;
  }

  resultArea.innerHTML = `<div class="detail">攻撃回数: ${level.maxHits}回</div><div class="table-wrap"><table>
    <tr><th>部位</th><th>一般ダメージ</th><th>固定ダメージ</th><th>純粋ダメージ</th></tr>
    ${results.map(r => `<tr><td>${escapeHtml(r.partName)}</td><td>${r.general.toLocaleString()}</td><td>${r.fixed.toLocaleString()}</td><td>${r.pure.toLocaleString()}</td></tr>`).join('')}
  </table></div>`;

  el._lastResult = { results, level, totalCritRate };
}

async function saveSlotResult(el) {
  const statusEl = el.querySelector('.f-saveStatus');
  const cur = currentSlotSkill(el);
  const bossId = el.querySelector('.f-slotBoss').value;
  const boss = bossesCache.find(x => x.id === bossId);
  if (!cur || !boss || !el._lastResult) {
    statusEl.className = 'status err'; statusEl.textContent = '先に「計算する」を実行してください。'; return;
  }
  const label = el.querySelector('.f-saveLabel').value.trim() || `${cur.character.name} - ${cur.skill.skillName}`;
  const inputSnapshot = buildSnapshot(el, cur, boss);
  try {
    await addDoc(resultsCol, {
      label, bossName: boss.name, characterName: cur.character.name, skillName: cur.skill.skillName,
      result: el._lastResult.results, inputSnapshot,
      savedBy: operatorName, savedAt: new Date().toISOString()
    });
    logWrite('resultSave', label);
    statusEl.className = 'status ok'; statusEl.textContent = '保存しました。';
    loadResults();
  } catch (e) {
    statusEl.className = 'status err'; statusEl.textContent = '保存に失敗しました: ' + e.message;
  }
}

function buildSnapshot(el, cur, boss) {
  const inputStats = {};
  el.querySelectorAll('[class^="f-stat-"]').forEach(inp => {
    const statName = inp.className.replace('f-stat-', '').split(' ')[0];
    inputStats[statName] = Number(inp.value) || 0;
  });
  const buffWrap = el.querySelector('.f-buffList');
  const selectedBuffs = [];
  buffWrap.querySelectorAll('.buffItem').forEach(item => {
    const idx = Number(item.dataset.buffIdx);
    const checked = item.querySelector('.f-buffCheck').checked;
    if (!checked) return;
    selectedBuffs.push({
      idx,
      copies: Number(item.querySelector('.f-buffCopies').value),
      burst: Number(item.querySelector('.f-buffBurst').value)
    });
  });
  const startChainInputs = [...el.querySelectorAll('.f-startChain')].map(inp => Number(inp.value) || 0);
  return {
    charId: cur.character.id, skillIdx: cur.character.skills.indexOf(cur.skill),
    copies: Number(el.querySelector('.f-slotCopies').value),
    burst: Number(el.querySelector('.f-slotBurst').value),
    inputStats,
    critRate: Number(el.querySelector('.f-critRate').value) || 0,
    critDamage: Number(el.querySelector('.f-critDamage').value) || 0,
    selectedBuffs,
    bossBuff: {
      attackBuffPercent: Number(el.querySelector('.f-bossBuffAttack').value) || 0,
      critRateBuffPercent: Number(el.querySelector('.f-bossBuffCrit').value) || 0,
      enhancePercent: Number(el.querySelector('.f-bossBuffEnhance').value) || 0,
      elementBoostPercent: Number(el.querySelector('.f-bossBuffElement').value) || 0,
      chainDamageIncreasePercent: Number(el.querySelector('.f-bossBuffChain').value) || 0
    },
    bossId: boss.id,
    startingChainCounts: startChainInputs
  };
}

function applySnapshotToSlot(el, snap) {
  const c = charactersCache.find(x => x.id === snap.charId);
  if (!c) return;
  el.querySelector('.f-slotChar').value = snap.charId;
  populateSlotSkillSelect(el);
  el.querySelector('.f-slotSkill').value = snap.skillIdx;
  renderReferenceInputs(el);
  el.querySelector('.f-slotCopies').value = snap.copies;
  el.querySelector('.f-slotBurst').value = snap.burst;
  Object.entries(snap.inputStats || {}).forEach(([k, v]) => {
    const inp = el.querySelector(`.f-stat-${k}`);
    if (inp) inp.value = v;
  });
  el.querySelector('.f-critRate').value = snap.critRate;
  el.querySelector('.f-critDamage').value = snap.critDamage;
  el.querySelector('.f-bossBuffAttack').value = snap.bossBuff.attackBuffPercent;
  el.querySelector('.f-bossBuffCrit').value = snap.bossBuff.critRateBuffPercent;
  el.querySelector('.f-bossBuffEnhance').value = snap.bossBuff.enhancePercent;
  el.querySelector('.f-bossBuffElement').value = snap.bossBuff.elementBoostPercent;
  el.querySelector('.f-bossBuffChain').value = snap.bossBuff.chainDamageIncreasePercent;
  el.querySelector('.f-slotBoss').value = snap.bossId;
  renderPartsTable(el);
  (snap.startingChainCounts || []).forEach((v, i) => {
    const inp = el.querySelectorAll('.f-startChain')[i];
    if (inp) inp.value = v;
  });
  (snap.selectedBuffs || []).forEach(sb => {
    const item = el.querySelectorAll('.buffItem')[sb.idx];
    if (!item) return;
    item.querySelector('.f-buffCheck').checked = true;
    item.querySelector('.f-buffCopies').value = sb.copies;
    item.querySelector('.f-buffBurst').value = sb.burst;
  });
}

// ==================================================================
// 保存済み結果タブ(15日期限・絞り込み・削除権限・下書き利用)
// ==================================================================
const RESULT_EXPIRY_DAYS = 15;

async function loadResults() {
  const area = document.getElementById('resultsArea');
  area.innerHTML = '<div class="empty">読み込み中...</div>';
  try {
    const snap = await getDocs(resultsCol);
    const now = Date.now();
    const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const valid = [];
    const expired = [];
    all.forEach(r => {
      const age = now - new Date(r.savedAt).getTime();
      if (age > RESULT_EXPIRY_DAYS * 24 * 60 * 60 * 1000) expired.push(r); else valid.push(r);
    });
    // 期限切れをlazy削除(失敗しても無視)
    expired.forEach(r => deleteDoc(doc(resultsCol, r.id)).catch(() => {}));
    renderResults(valid);
  } catch (e) {
    area.innerHTML = `<div class="status err">読み込みに失敗しました: ${e.message}</div>`;
  }
}

function renderResults(list) {
  const bossFilter = document.getElementById('resultFilterBoss').value.trim();
  const charFilter = document.getElementById('resultFilterChar').value.trim();
  const filtered = list.filter(r =>
    (!bossFilter || r.bossName.includes(bossFilter)) &&
    (!charFilter || r.characterName.includes(charFilter))
  ).sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));

  const area = document.getElementById('resultsArea');
  if (!filtered.length) { area.innerHTML = '<div class="empty">保存された結果がありません。</div>'; return; }

  area.innerHTML = filtered.map(r => {
    const canDelete = (route === 'main' && r.savedBy === operatorName) || isAdmin;
    const best = (r.result || []).reduce((max, cur) => cur.general > (max?.general || 0) ? cur : max, null);
    return `<div class="resultCard">
      <div><strong>${escapeHtml(r.label)}</strong>　<span class="detail">${escapeHtml(r.bossName)} / ${escapeHtml(r.characterName)} - ${escapeHtml(r.skillName)}</span></div>
      <div class="detail">保存者: ${escapeHtml(r.savedBy)} / ${new Date(r.savedAt).toLocaleString('ja-JP')}</div>
      ${best ? `<div class="detail">最大一般ダメージ部位: ${escapeHtml(best.partName)} (${best.general.toLocaleString()})</div>` : ''}
      <div style="margin-top:6px;">
        <button class="small f-loadResult" data-result-id="${r.id}">これを元に計算する</button>
        ${canDelete ? `<button class="small danger f-deleteResult" data-result-id="${r.id}">削除</button>` : ''}
      </div>
    </div>`;
  }).join('');

  area.querySelectorAll('.f-loadResult').forEach(btn => {
    btn.addEventListener('click', () => {
      const r = filtered.find(x => x.id === btn.dataset.resultId);
      if (!r) return;
      const el = addSlot(r.inputSnapshot);
      document.querySelector('.tab[data-tab="calc"]').click();
      el.scrollIntoView({ behavior: 'smooth' });
    });
  });
  area.querySelectorAll('.f-deleteResult').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('この結果を削除しますか？')) return;
      try {
        await deleteDoc(doc(resultsCol, btn.dataset.resultId));
        logWrite('resultDelete', btn.dataset.resultId);
        loadResults();
      } catch (e) {
        alert('削除に失敗しました: ' + e.message);
      }
    });
  });
}

document.getElementById('resultFilterBoss').addEventListener('input', () => loadResults());
document.getElementById('resultFilterChar').addEventListener('input', () => loadResults());
