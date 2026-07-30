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

const SESSION_KEY = 'calmeguild_sub_unlocked'; // ポータル・gold-farmingと共通のキー名(どこで解錠しても他ページに引き継がれる)

let route = null;        // 'main' | 'sub'
let isAdmin = false;
let operatorName = '';   // メインギルドの場合、userLinksから解決される表示名

// キャッシュ(キャラのみ。ボスは登録機能を廃止し、計算スロット内で都度入力する)
let charactersCache = []; // [{id, name, skills:[...]}]

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
    ? `メインギルドメンバーとしてログイン中(${operatorName}${isAdmin ? ' / 管理者' : ''})`
    : 'サブギルドメンバーとして利用中';
  document.getElementById('charAdminOnlyNote').style.display = isAdmin ? 'none' : 'block';
  document.getElementById('charImportCard').style.display = isAdmin ? 'block' : 'none';
  document.getElementById('deleteCharBtn').style.display = 'none';
  document.getElementById('saveCharBtn').disabled = !isAdmin;
  document.getElementById('addSkillBtn').disabled = !isAdmin;
  document.getElementById('connNote').textContent = '読み込み中...';
  await loadCharacters();
  document.getElementById('connNote').textContent = '';
  renderCharList();
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
  const trimmed = text.trim();
  if (!trimmed.includes(':')) {
    // コロンが無い場合は「ずっと同じ数値」として扱う
    return [{ from: 1, value: Number(trimmed) || 0 }];
  }
  const parts = trimmed.split(',').map(s => s.trim()).filter(Boolean);
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
    // 表示優先度(priority)が大きいキャラほど上に表示。同じ優先度なら名前順
    charactersCache.sort((a, b) => (b.priority || 0) - (a.priority || 0) || a.name.localeCompare(b.name, 'ja'));
  } catch (e) {
    charactersCache = [];
  }
}

function renderCharList() {
  const area = document.getElementById('charListArea');
  if (!charactersCache.length) { area.innerHTML = '<div class="empty">まだ登録がありません。</div>'; return; }
  let html = '<div class="table-wrap"><table><tr><th>キャラ名</th><th>属性</th><th>スキル数</th><th></th></tr>';
  charactersCache.forEach(c => {
    html += `<tr><td>${escapeHtml(c.name)}</td><td>${escapeHtml(c.attribute || '-')}</td><td>${(c.skills || []).length}</td>
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
    mainTargetSkillMultiplier: [{ from: 1, value: 0 }], // メインターゲット時、skillMultiplierの代わりにこちらを使う(0なら未設定扱い)
    enhance: [{ from: 1, value: 0 }],
    elementBoost: [{ from: 1, value: 0 }],
    chainDamageIncrease: [{ from: 1, value: 0 }],
    selfBuff: {
      attackBuffPercent: [{ from: 1, value: 0 }],
      critRateBuffPercent: [{ from: 1, value: 0 }],
      critDamageBuffPercent: [{ from: 1, value: 0 }],
      chainEnhance: 0,
      energyGuardBonus: 0
    },
    otherAdjustment: 0,
    allyBuff: {
      physicalAttackBuffPercent: [{ from: 1, value: 0 }], magicAttackBuffPercent: [{ from: 1, value: 0 }],
      critRateBuffPercent: [{ from: 1, value: 0 }], critDamageBuffPercent: [{ from: 1, value: 0 }],
      enhancePercent: [{ from: 1, value: 0 }], elementBoostPercent: [{ from: 1, value: 0 }],
      chainDamageIncreasePercent: [{ from: 1, value: 0 }], chainEnhance: 0, energyGuardBonus: 0, energyGuardPercent: 0
    }
  };
}
function blankBurst(burst) {
  return {
    burst, maxHitsAdd: 0,
    skillMultiplierAdd: [{ from: 1, value: 0 }], mainTargetSkillMultiplierAdd: [{ from: 1, value: 0 }],
    enhanceAdd: [{ from: 1, value: 0 }], elementBoostAdd: [{ from: 1, value: 0 }], chainDamageIncreaseAdd: [{ from: 1, value: 0 }],
    selfBuffAttackAdd: [{ from: 1, value: 0 }], selfBuffCritAdd: [{ from: 1, value: 0 }], selfCritDamageAdd: [{ from: 1, value: 0 }],
    selfChainEnhanceAdd: 0, selfEnergyGuardBonusAdd: 0,
    allyBuffAdd: {
      physicalAttackBuffPercent: [{ from: 1, value: 0 }], magicAttackBuffPercent: [{ from: 1, value: 0 }],
      critRateBuffPercent: [{ from: 1, value: 0 }], critDamageBuffPercent: [{ from: 1, value: 0 }],
      enhancePercent: [{ from: 1, value: 0 }], elementBoostPercent: [{ from: 1, value: 0 }], chainDamageIncreasePercent: [{ from: 1, value: 0 }],
      chainEnhance: 0, energyGuardBonus: 0, energyGuardPercent: 0
    }
  };
}
function blankPotential() {
  return {
    description: '', maxHitsAdd: 0,
    skillMultiplierAdd: [{ from: 1, value: 0 }], mainTargetSkillMultiplierAdd: [{ from: 1, value: 0 }],
    enhanceAdd: [{ from: 1, value: 0 }],
    elementBoostAdd: [{ from: 1, value: 0 }], chainDamageIncreaseAdd: [{ from: 1, value: 0 }],
    selfBuffAttackAdd: [{ from: 1, value: 0 }], selfBuffCritAdd: [{ from: 1, value: 0 }], selfCritDamageAdd: [{ from: 1, value: 0 }],
    selfChainEnhanceAdd: 0, selfEnergyGuardBonusAdd: 0,
    allyBuffAdd: {
      physicalAttackBuffPercent: [{ from: 1, value: 0 }], magicAttackBuffPercent: [{ from: 1, value: 0 }],
      critRateBuffPercent: [{ from: 1, value: 0 }], critDamageBuffPercent: [{ from: 1, value: 0 }],
      enhancePercent: [{ from: 1, value: 0 }], elementBoostPercent: [{ from: 1, value: 0 }], chainDamageIncreasePercent: [{ from: 1, value: 0 }],
      chainEnhance: 0, energyGuardBonus: 0, energyGuardPercent: 0
    }
  };
}
function blankSkill() {
  return {
    _uid: uid(),
    lock5Copies: false, // ONの間は0〜4凸を編集しても5凸は変更されない(保存され、次回読み込み時にも保持される)
    skillName: '新しいスキル',
    dealsDamage: true,
    grantsAllyBuff: false,
    damageType: 'physical',
    damageOutputType: 'general',
    referenceFormula: [{ stat: 'attack', cap: null, coefficient: 100 }],
    hasMainTargetOverride: false, // メインターゲット時、基本のスキル倍率の代わりにメインターゲット用倍率を使う
    allyEnergyGuardRefStat: '', // ''=無し / 'magicAttack' / 'selfMaxHP'
    isBuffRemovalAttack: false, // 1撃目はボスのバリア/防御力バフ/魔法抵抗バフが有効、2撃目以降は解除される(バリアのみ解除したい場合は他を0のままでOK)
    isDebuffApplyAttack: false, // このスキル自身がボスにデバフを付与する。2撃目以降だけ有効になる
    isSummonDamage: false, // 召喚獣ダメージ(召喚獣脆弱が有効になる)
    hitCountBonusPercent: 0, // 敵に当たる数(登録した部位数)1つあたりのダメージ増減%(マイナス指定で減少にも対応)
    buffCountBonusPercent: 0, // 自分にかかっているバフ数1つあたりのダメージ増加%(計算時に手動でバフ数を入力)
    spCostBonusPercent: 0, // 消費したSP1つあたりのダメージ増加%(計算時に手動で消費SPを入力)
    chainMultipleOf: 0, // 敵に適用されるチェインがこの倍数の時だけボーナスが乗る(0=無効)
    chainMultipleBonusPercent: 0, // 上記条件を満たした時のダメージ増加%
    selfStackBuffEnabled: false, // スタック型自己バフ(攻撃/チェインを溜める度に重複する自己バフ。加速など)
    selfStackPerStackAttackPercent: 0, // 1スタックあたりの自己攻撃バフ%
    selfStackMax: 0, // 最大スタック数
    selfStackThreshold: 0, // このスタック数以上で追加効果が発動(0=無効)
    selfStackThresholdChainIncreaseBonus: 0, // 閾値到達時に追加されるチェインダメ増加%
    // デバフ付与攻撃(isDebuffApplyAttack)の時のみ使用: このスキルが2撃目以降に付与する固定のデバフ量
    debuffVulnerability: 0, debuffPhysicalVulnerability: 0, debuffMagicVulnerability: 0,
    debuffDefenseReduction: 0, debuffMagicResistReduction: 0, debuffChainDamageIncrease: 0, debuffSummonVulnerability: 0,
    // 属性脆弱%付与(デバフ付与攻撃時、2撃目以降だけ有効。攻撃キャラの属性に対応するものだけが使われる)
    debuffFireVulnerability: 0, debuffWaterVulnerability: 0, debuffWindVulnerability: 0, debuffLightVulnerability: 0, debuffDarkVulnerability: 0,
    copiesLevels: [0, 1, 2, 3, 4, 5].map(blankLevel),
    burstBonus: [0, 1, 2, 3].map(blankBurst),
    potentials: [0, 1, 2].map(blankPotential)
  };
}

function loadCharIntoForm(charId) {
  const c = charactersCache.find(x => x.id === charId);
  if (!c) return;
  currentEditCharId = charId;
  document.getElementById('charEditTitle').textContent = `キャラクターを編集: ${c.name}`;
  document.getElementById('charName').value = c.name;
  document.getElementById('charAttribute').value = c.attribute || '火';
  document.getElementById('charPriority').value = c.priority || 0;
  skillDraftList = JSON.parse(JSON.stringify(c.skills || [])).map(s => ({ ...s, _uid: uid(), lock5Copies: s.lock5Copies || false }));
  renderSkillsArea();
  document.getElementById('deleteCharBtn').style.display = isAdmin ? 'inline-block' : 'none';
}

document.getElementById('newCharFormBtn').addEventListener('click', () => {
  currentEditCharId = null;
  document.getElementById('charEditTitle').textContent = 'キャラクターを新規登録';
  document.getElementById('charName').value = '';
  document.getElementById('charAttribute').value = '火';
  document.getElementById('charPriority').value = 0;
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
    ['energyGuard', 'エナジーガード(HPから自動算出)'], ['enemyTotalHP', '敵全体HP(5万上限)']
  ];
  return opts.map(([v, l]) => `<option value="${v}" ${selected === v ? 'selected' : ''}>${l}</option>`).join('');
}

function skillBlockHtml(s) {
  const damageOnlyDisplay = s.dealsDamage ? '' : 'style="display:none;"';
  const gridsDisplay = (s.dealsDamage || s.grantsAllyBuff) ? '' : 'style="display:none;"';
  return `
  <div class="skillBlock" data-skill="${s._uid}">
    <div class="skillHead">
      <input type="text" class="f-skillName" value="${escapeHtml(s.skillName)}" placeholder="スキル名">
      <label class="checkLabel"><input type="checkbox" class="f-dealsDamage" ${s.dealsDamage ? 'checked' : ''}> ダメージを与える</label>
      <label class="checkLabel"><input type="checkbox" class="f-grantsAllyBuff" ${s.grantsAllyBuff ? 'checked' : ''}> 味方にバフを配る</label>
      <button class="small f-moveSkillUp" type="button" title="上に移動">↑</button>
      <button class="small f-moveSkillDown" type="button" title="下に移動">↓</button>
      <button class="small danger f-removeSkill" type="button">スキルを削除</button>
    </div>

    <div class="damageOnlyFields" ${damageOnlyDisplay}>
      <div class="rowFields">
        <div class="formField"><label>ダメージ種別</label>
          <select class="f-damageType">
            <option value="physical" ${s.damageType === 'physical' ? 'selected' : ''}>物理</option>
            <option value="magic" ${s.damageType === 'magic' ? 'selected' : ''}>魔法</option>
          </select>
        </div>
        <div class="formField"><label class="checkLabel" style="margin-top:22px;"><input type="checkbox" class="f-hasMainTargetOverride" ${s.hasMainTargetOverride ? 'checked' : ''}> メインターゲット時は専用倍率を使う(基本のスキル倍率の代わりに置き換え)</label>
        </div>
        <div class="formField"><label>表示ダメージ種別</label>
          <select class="f-damageOutputType">
            <option value="general" ${(!s.damageOutputType || s.damageOutputType === 'general') ? 'selected' : ''}>一般</option>
            <option value="fixed" ${s.damageOutputType === 'fixed' ? 'selected' : ''}>固定</option>
            <option value="pure" ${s.damageOutputType === 'pure' ? 'selected' : ''}>純粋</option>
          </select>
        </div>
      </div>
      <label class="checkLabel"><input type="checkbox" class="f-isBuffRemoval" ${s.isBuffRemovalAttack ? 'checked' : ''}> バフ解除攻撃(1撃目はボスのバリア/防御力バフ/魔法抵抗バフが有効、2撃目以降は解除される。バリアのみ解除したい場合は他の欄を0のままでOK)</label>
      <label class="checkLabel"><input type="checkbox" class="f-isDebuffApply" ${s.isDebuffApplyAttack ? 'checked' : ''}> デバフ付与攻撃(このスキル自身がボスにデバフを付与。2撃目以降だけ有効になる)</label>
      <div class="rowFields">
        <div class="formField"><label>脆弱%付与(汎用)</label><input type="number" class="f-debuffVulnerability" value="${s.debuffVulnerability || 0}"></div>
        <div class="formField"><label>物理脆弱%付与</label><input type="number" class="f-debuffPhysicalVulnerability" value="${s.debuffPhysicalVulnerability || 0}"></div>
        <div class="formField"><label>魔法脆弱%付与</label><input type="number" class="f-debuffMagicVulnerability" value="${s.debuffMagicVulnerability || 0}"></div>
        <div class="formField"><label>防御軽減%付与</label><input type="number" class="f-debuffDefenseReduction" value="${s.debuffDefenseReduction || 0}"></div>
        <div class="formField"><label>魔法抵抗軽減%付与</label><input type="number" class="f-debuffMagicResistReduction" value="${s.debuffMagicResistReduction || 0}"></div>
        <div class="formField"><label>受けるチェインダメ増加%付与</label><input type="number" class="f-debuffChainDamageIncrease" value="${s.debuffChainDamageIncrease || 0}"></div>
        <div class="formField"><label>召喚獣脆弱%付与</label><input type="number" class="f-debuffSummonVulnerability" value="${s.debuffSummonVulnerability || 0}"></div>
        <div class="formField"><label>火脆弱%付与</label><input type="number" class="f-debuffFireVulnerability" value="${s.debuffFireVulnerability || 0}"></div>
        <div class="formField"><label>水脆弱%付与</label><input type="number" class="f-debuffWaterVulnerability" value="${s.debuffWaterVulnerability || 0}"></div>
        <div class="formField"><label>風脆弱%付与</label><input type="number" class="f-debuffWindVulnerability" value="${s.debuffWindVulnerability || 0}"></div>
        <div class="formField"><label>光脆弱%付与</label><input type="number" class="f-debuffLightVulnerability" value="${s.debuffLightVulnerability || 0}"></div>
        <div class="formField"><label>闇脆弱%付与</label><input type="number" class="f-debuffDarkVulnerability" value="${s.debuffDarkVulnerability || 0}"></div>
      </div>
      <label class="checkLabel"><input type="checkbox" class="f-isSummonDamage" ${s.isSummonDamage ? 'checked' : ''}> 召喚獣ダメージ(召喚獣脆弱が有効になる)</label>
      <div class="rowFields">
        <div class="formField"><label>命中数ボーナス%(部位数1つあたり。マイナスで減少)</label><input type="number" class="f-hitCountBonus" value="${s.hitCountBonusPercent || 0}"></div>
        <div class="formField"><label>自己バフ数ボーナス%(バフ1つあたり)</label><input type="number" class="f-buffCountBonus" value="${s.buffCountBonusPercent || 0}"></div>
        <div class="formField"><label>消費SPボーナス%(SP1あたり)</label><input type="number" class="f-spCostBonus" value="${s.spCostBonusPercent || 0}"></div>
        <div class="formField"><label>チェイン倍数条件(0=無効)</label><input type="number" class="f-chainMultipleOf" value="${s.chainMultipleOf || 0}" placeholder="例:3"></div>
        <div class="formField"><label>チェイン倍数達成時ボーナス%</label><input type="number" class="f-chainMultipleBonus" value="${s.chainMultipleBonusPercent || 0}"></div>
      </div>
      <label class="checkLabel"><input type="checkbox" class="f-selfStackEnabled" ${s.selfStackBuffEnabled ? 'checked' : ''}> スタック型自己バフ(攻撃/チェインの度に重複する自己攻撃バフ。加速など)</label>
      <div class="rowFields">
        <div class="formField"><label>1スタックあたり自己攻撃バフ%</label><input type="number" class="f-selfStackPerStack" value="${s.selfStackPerStackAttackPercent || 0}"></div>
        <div class="formField"><label>最大スタック数</label><input type="number" class="f-selfStackMax" value="${s.selfStackMax || 0}"></div>
        <div class="formField"><label>閾値スタック数(0=無効)</label><input type="number" class="f-selfStackThreshold" value="${s.selfStackThreshold || 0}"></div>
        <div class="formField"><label>閾値到達時チェインダメ増加%</label><input type="number" class="f-selfStackThresholdBonus" value="${s.selfStackThresholdChainIncreaseBonus || 0}"></div>
      </div>
      <label>参照ステータス(基準値の合成式)</label>
      <div class="formulaRows">${(s.referenceFormula || []).map((t, i) => formulaRowHtml(t, i)).join('')}</div>
      <button class="small f-addFormula" type="button">+ 参照項目を追加</button>
    </div>

    <div class="allyEgRefFields" ${s.grantsAllyBuff ? '' : 'style="display:none;"'}>
      <div class="formField" style="max-width:360px;">
        <label>エナガ付与%の参照ステータス(自分または対象のステータスからエナガを付与するタイプの場合のみ設定)</label>
        <select class="f-allyEgRefStat">
          <option value="" ${!s.allyEnergyGuardRefStat ? 'selected' : ''}>無し(固定値のエナガ付与のみ)</option>
          <option value="magicAttack" ${s.allyEnergyGuardRefStat === 'magicAttack' ? 'selected' : ''}>自分(バフをかけるキャラ)の魔法力を参照</option>
          <option value="selfMaxHP" ${s.allyEnergyGuardRefStat === 'selfMaxHP' ? 'selected' : ''}>自分(バフをかけるキャラ)の最大HPを参照</option>
          <option value="receiverMaxHP" ${s.allyEnergyGuardRefStat === 'receiverMaxHP' ? 'selected' : ''}>対象(バフを受け取り計算するキャラ)の最大HPを参照</option>
        </select>
        <div class="detail">「自分」を選ぶと、計算時にこのバフキャラの実数値を入力する欄が出ます。「対象」を選ぶと、計算しているキャラ自身の最大HP入力値がそのまま使われます(別途入力欄は出ません)。下のグリッドの「配布:エナガ%」に変換率(%)を入力してください。</div>
      </div>
    </div>

    <div class="gridsFields" ${gridsDisplay}>
      <h3>凸(0〜5)ごとの基本値
        <label class="checkLabel" style="display:inline-flex; margin-left:12px;"><input type="checkbox" class="f-lock5Copies" ${s.lock5Copies ? 'checked' : ''}> 5凸データを保護(インポート等で確定済みの5凸を、0〜4凸の編集から守る)</label>
      </h3>
      <div class="gridHint">
        スキル倍率・増強・属性強化・チェイン増加・自己バフ・配布バフの欄は「チェイン数:数値」という形式で入力します(攻撃回数ではなくチェイン数での判定です)。<br>
        例：「6:70」と入力すると「6チェイン以上貯まっている状態で行った攻撃から70%に変わる」という意味になります(自分の攻撃で新たに貯まる分は、その攻撃自体には反映されず、次の攻撃から反映されます)。複数の変化がある場合は「1:100,6:70」のようにカンマ(,)で区切って追加してください。<br>
        ずっと同じ数値でよい場合は、数値だけ(例: 100)を入力すればOKです(自動的に「1:100」として扱われます)。<br>
        ※魔法スキルの場合も「自己バフ:攻撃%」「配布:魔法攻撃%」の欄をそのまま使ってください(参照ステータス側の数値に掛かる値のため、実質的に魔法力バフとして機能します)。
        ※「ダメージを与える」がOFFの(バフ専用)スキルの場合、このグリッド内のダメージ関連の項目は無視されます。「配布:〜」の列だけ入力してください。
        ※「メインターゲット用倍率%」は、キャラ登録の「メインターゲット時は専用倍率を使う」にチェックが入っている場合のみ使われます(基本のスキル倍率の代わりにこちらが使われます)。
      </div>
      <div class="table-wrap">${copiesGridHtml(s)}</div>

      <h3>バースト(0〜3)ごとの加算値</h3>
      <div class="gridHint">凸の基本値に、ここで入力した数値がそのまま足し算されます(バーストで強化される分だけを入力してください)。</div>
      <div class="table-wrap">${burstGridHtml(s)}</div>

      <h3>潜在力(最大3枠・取得順は自由)</h3>
      <div class="gridHint">各潜在力は個別にON/OFFできます(計算時に自由に選択)。バーストと同じく、凸の基本値に足し算される数値を入力してください。ダメージに関係ない効果(例: 効果時間+1ターン)は「説明」欄にだけ書けばOKです。</div>
      <div class="table-wrap">${potentialsGridHtml(s)}</div>
    </div>
  </div>`;
}

function formulaRowHtml(t, i) {
  const isEG = t.stat === 'energyGuard';
  const egFields = isEG ? `
    <input type="number" class="f-formulaEgHpCap" placeholder="HP上限(無ければ空)" value="${t.egHpCap == null ? '' : t.egHpCap}">
    <input type="number" class="f-formulaEgRatio" placeholder="HP→EG変換率(%)" value="${t.ratioPercent || 0}">
    <input type="number" class="f-formulaEgFlat" placeholder="EG固定加算値" value="${t.flatBonus || 0}">` : '';
  return `<div class="formulaRow" data-formula-idx="${i}">
    <select class="f-formulaStat">${statOptionsHtml(t.stat)}</select>
    <input type="number" class="f-formulaCap" placeholder="上限(無ければ空)" value="${t.cap == null ? '' : t.cap}">
    <input type="number" class="f-formulaCoef" placeholder="係数(%)" value="${t.coefficient}">
    <button class="small danger f-removeFormula" type="button">×</button>
    ${egFields}
    ${isEG ? '<div class="detail">エナジーガードは手入力せず、自身の最大HP入力値から「HP→EG変換率%」「EG固定加算値」で自動算出されます(HP上限は5万キャップ等がある場合に指定)</div>' : ''}
  </div>`;
}

function copiesGridHtml(s) {
  let html = '<table class="gridTable"><tr><th>凸</th><th>攻撃回数</th><th>スキル倍率%</th><th>メインターゲット用倍率%</th><th>増強%</th><th>属性強化%</th><th>チェイン増加%</th>' +
    '<th>自己バフ:攻撃%</th><th>自己バフ:クリ率%</th><th>自己バフ:クリダメ%</th><th>自己バフ:チェイン強化</th><th>自己バフ:エナガ付与</th><th>その他補正%</th>' +
    '<th>配布:物理攻撃%</th><th>配布:魔法攻撃%</th><th>配布:クリ率%</th><th>配布:クリダメ%</th><th>配布:増強%</th><th>配布:属性強化%</th><th>配布:チェイン増加%</th><th>配布:チェイン強化</th><th>配布:エナガ付与</th><th>配布:エナガ%</th></tr>';
  s.copiesLevels.forEach((lv, i) => {
    html += `<tr data-copies-idx="${i}">
      <td>${lv.copies}凸</td>
      <td><input type="number" class="f-maxHits" value="${lv.maxHits}"></td>
      <td><input type="text" class="f-skillMultiplier" value="${serializeIntervals(lv.skillMultiplier)}"></td>
      <td><input type="text" class="f-mainTargetSkillMultiplier" value="${serializeIntervals(lv.mainTargetSkillMultiplier)}"></td>
      <td><input type="text" class="f-enhance" value="${serializeIntervals(lv.enhance)}"></td>
      <td><input type="text" class="f-elementBoost" value="${serializeIntervals(lv.elementBoost)}"></td>
      <td><input type="text" class="f-chainDamageIncrease" value="${serializeIntervals(lv.chainDamageIncrease)}"></td>
      <td><input type="text" class="f-selfBuffAttack" value="${serializeIntervals(lv.selfBuff.attackBuffPercent)}"></td>
      <td><input type="text" class="f-selfBuffCrit" value="${serializeIntervals(lv.selfBuff.critRateBuffPercent)}"></td>
      <td><input type="text" class="f-selfBuffCritDamage" value="${serializeIntervals(lv.selfBuff.critDamageBuffPercent)}"></td>
      <td><input type="number" class="f-selfChainEnhance" value="${lv.selfBuff.chainEnhance || 0}"></td>
      <td><input type="number" class="f-selfEnergyGuardBonus" value="${lv.selfBuff.energyGuardBonus || 0}"></td>
      <td><input type="number" class="f-otherAdjustment" value="${lv.otherAdjustment || 0}"></td>
      <td><input type="text" class="f-allyPhysicalAttack" value="${serializeIntervals(lv.allyBuff.physicalAttackBuffPercent)}"></td>
      <td><input type="text" class="f-allyMagicAttack" value="${serializeIntervals(lv.allyBuff.magicAttackBuffPercent)}"></td>
      <td><input type="text" class="f-allyCrit" value="${serializeIntervals(lv.allyBuff.critRateBuffPercent)}"></td>
      <td><input type="text" class="f-allyCritDamage" value="${serializeIntervals(lv.allyBuff.critDamageBuffPercent)}"></td>
      <td><input type="text" class="f-allyEnhance" value="${serializeIntervals(lv.allyBuff.enhancePercent)}"></td>
      <td><input type="text" class="f-allyElement" value="${serializeIntervals(lv.allyBuff.elementBoostPercent)}"></td>
      <td><input type="text" class="f-allyChain" value="${serializeIntervals(lv.allyBuff.chainDamageIncreasePercent)}"></td>
      <td><input type="number" class="f-allyChainEnhance" value="${lv.allyBuff.chainEnhance || 0}"></td>
      <td><input type="number" class="f-allyEnergyGuardBonus" value="${lv.allyBuff.energyGuardBonus || 0}"></td>
      <td><input type="number" class="f-allyEnergyGuardPercent" value="${lv.allyBuff.energyGuardPercent || 0}"></td>
    </tr>`;
  });
  return html + '</table>';
}

function burstGridHtml(s) {
  let html = '<table class="gridTable"><tr><th>バースト</th><th>攻撃回数+</th><th>スキル倍率+%</th><th>メインターゲット用倍率+%</th><th>増強+%</th><th>属性強化+%</th><th>チェイン増加+%</th>' +
    '<th>自己バフ:攻撃+%</th><th>自己バフ:クリ率+%</th><th>自己バフ:クリダメ+%</th><th>自己バフ:チェイン強化+</th><th>自己バフ:エナガ付与+</th>' +
    '<th>配布:物理攻撃+%</th><th>配布:魔法攻撃+%</th><th>配布:クリ率+%</th><th>配布:クリダメ+%</th><th>配布:増強+%</th><th>配布:属性強化+%</th><th>配布:チェイン増加+%</th><th>配布:チェイン強化+</th><th>配布:エナガ付与+</th><th>配布:エナガ%+</th></tr>';
  s.burstBonus.forEach((b, i) => {
    html += `<tr data-burst-idx="${i}">
      <td>バースト${b.burst}</td>
      <td><input type="number" class="f-maxHitsAdd" value="${b.maxHitsAdd || 0}"></td>
      <td><input type="text" class="f-skillMultiplierAdd" value="${serializeIntervals(b.skillMultiplierAdd)}"></td>
      <td><input type="text" class="f-mainTargetSkillMultiplierAdd" value="${serializeIntervals(b.mainTargetSkillMultiplierAdd)}"></td>
      <td><input type="text" class="f-enhanceAdd" value="${serializeIntervals(b.enhanceAdd)}"></td>
      <td><input type="text" class="f-elementBoostAdd" value="${serializeIntervals(b.elementBoostAdd)}"></td>
      <td><input type="text" class="f-chainDamageIncreaseAdd" value="${serializeIntervals(b.chainDamageIncreaseAdd)}"></td>
      <td><input type="text" class="f-selfBuffAttackAdd" value="${serializeIntervals(b.selfBuffAttackAdd)}"></td>
      <td><input type="text" class="f-selfBuffCritAdd" value="${serializeIntervals(b.selfBuffCritAdd)}"></td>
      <td><input type="text" class="f-selfCritDamageAdd" value="${serializeIntervals(b.selfCritDamageAdd)}"></td>
      <td><input type="number" class="f-selfChainEnhanceAdd" value="${b.selfChainEnhanceAdd || 0}"></td>
      <td><input type="number" class="f-selfEnergyGuardBonusAdd" value="${b.selfEnergyGuardBonusAdd || 0}"></td>
      <td><input type="text" class="f-allyPhysicalAttackAdd" value="${serializeIntervals(b.allyBuffAdd.physicalAttackBuffPercent)}"></td>
      <td><input type="text" class="f-allyMagicAttackAdd" value="${serializeIntervals(b.allyBuffAdd.magicAttackBuffPercent)}"></td>
      <td><input type="text" class="f-allyCritAdd" value="${serializeIntervals(b.allyBuffAdd.critRateBuffPercent)}"></td>
      <td><input type="text" class="f-allyCritDamageAdd" value="${serializeIntervals(b.allyBuffAdd.critDamageBuffPercent)}"></td>
      <td><input type="text" class="f-allyEnhanceAdd" value="${serializeIntervals(b.allyBuffAdd.enhancePercent)}"></td>
      <td><input type="text" class="f-allyElementAdd" value="${serializeIntervals(b.allyBuffAdd.elementBoostPercent)}"></td>
      <td><input type="text" class="f-allyChainAdd" value="${serializeIntervals(b.allyBuffAdd.chainDamageIncreasePercent)}"></td>
      <td><input type="number" class="f-allyChainEnhanceAdd" value="${b.allyBuffAdd.chainEnhance || 0}"></td>
      <td><input type="number" class="f-allyEnergyGuardBonusAdd" value="${b.allyBuffAdd.energyGuardBonus || 0}"></td>
      <td><input type="number" class="f-allyEnergyGuardPercentAdd" value="${b.allyBuffAdd.energyGuardPercent || 0}"></td>
    </tr>`;
  });
  return html + '</table>';
}

function potentialsGridHtml(s) {
  let html = '<table class="gridTable"><tr><th>潜在力</th><th>説明(自由記述)</th><th>攻撃回数+</th><th>スキル倍率+%</th><th>メインターゲット用倍率+%</th><th>増強+%</th><th>属性強化+%</th><th>チェイン増加+%</th>' +
    '<th>自己バフ:攻撃+%</th><th>自己バフ:クリ率+%</th><th>自己バフ:クリダメ+%</th><th>自己バフ:チェイン強化+</th><th>自己バフ:エナガ付与+</th>' +
    '<th>配布:物理攻撃+%</th><th>配布:魔法攻撃+%</th><th>配布:クリ率+%</th><th>配布:クリダメ+%</th><th>配布:増強+%</th><th>配布:属性強化+%</th><th>配布:チェイン増加+%</th><th>配布:チェイン強化+</th><th>配布:エナガ付与+</th><th>配布:エナガ%+</th></tr>';
  s.potentials.forEach((p, i) => {
    html += `<tr data-potential-idx="${i}">
      <td>潜在力${i + 1}</td>
      <td><input type="text" class="f-potentialDesc" value="${escapeHtml(p.description || '')}" placeholder="例: 効果時間+1ターン" style="width:140px;"></td>
      <td><input type="number" class="f-maxHitsAdd" value="${p.maxHitsAdd || 0}"></td>
      <td><input type="text" class="f-skillMultiplierAdd" value="${serializeIntervals(p.skillMultiplierAdd)}"></td>
      <td><input type="text" class="f-mainTargetSkillMultiplierAdd" value="${serializeIntervals(p.mainTargetSkillMultiplierAdd)}"></td>
      <td><input type="text" class="f-enhanceAdd" value="${serializeIntervals(p.enhanceAdd)}"></td>
      <td><input type="text" class="f-elementBoostAdd" value="${serializeIntervals(p.elementBoostAdd)}"></td>
      <td><input type="text" class="f-chainDamageIncreaseAdd" value="${serializeIntervals(p.chainDamageIncreaseAdd)}"></td>
      <td><input type="text" class="f-selfBuffAttackAdd" value="${serializeIntervals(p.selfBuffAttackAdd)}"></td>
      <td><input type="text" class="f-selfBuffCritAdd" value="${serializeIntervals(p.selfBuffCritAdd)}"></td>
      <td><input type="text" class="f-selfCritDamageAdd" value="${serializeIntervals(p.selfCritDamageAdd)}"></td>
      <td><input type="number" class="f-selfChainEnhanceAdd" value="${p.selfChainEnhanceAdd || 0}"></td>
      <td><input type="number" class="f-selfEnergyGuardBonusAdd" value="${p.selfEnergyGuardBonusAdd || 0}"></td>
      <td><input type="text" class="f-allyPhysicalAttackAdd" value="${serializeIntervals(p.allyBuffAdd.physicalAttackBuffPercent)}"></td>
      <td><input type="text" class="f-allyMagicAttackAdd" value="${serializeIntervals(p.allyBuffAdd.magicAttackBuffPercent)}"></td>
      <td><input type="text" class="f-allyCritAdd" value="${serializeIntervals(p.allyBuffAdd.critRateBuffPercent)}"></td>
      <td><input type="text" class="f-allyCritDamageAdd" value="${serializeIntervals(p.allyBuffAdd.critDamageBuffPercent)}"></td>
      <td><input type="text" class="f-allyEnhanceAdd" value="${serializeIntervals(p.allyBuffAdd.enhancePercent)}"></td>
      <td><input type="text" class="f-allyElementAdd" value="${serializeIntervals(p.allyBuffAdd.elementBoostPercent)}"></td>
      <td><input type="text" class="f-allyChainAdd" value="${serializeIntervals(p.allyBuffAdd.chainDamageIncreasePercent)}"></td>
      <td><input type="number" class="f-allyChainEnhanceAdd" value="${p.allyBuffAdd.chainEnhance || 0}"></td>
      <td><input type="number" class="f-allyEnergyGuardBonusAdd" value="${p.allyBuffAdd.energyGuardBonus || 0}"></td>
      <td><input type="number" class="f-allyEnergyGuardPercentAdd" value="${p.allyBuffAdd.energyGuardPercent || 0}"></td>
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
    block.querySelector('.damageOnlyFields').style.display = s.dealsDamage ? '' : 'none';
    block.querySelector('.gridsFields').style.display = (s.dealsDamage || s.grantsAllyBuff) ? '' : 'none';
  });
  block.querySelector('.f-grantsAllyBuff').addEventListener('change', e => {
    s.grantsAllyBuff = e.target.checked;
    block.querySelector('.gridsFields').style.display = (s.dealsDamage || s.grantsAllyBuff) ? '' : 'none';
    block.querySelector('.allyEgRefFields').style.display = s.grantsAllyBuff ? '' : 'none';
  });
  block.querySelector('.f-allyEgRefStat').addEventListener('change', e => s.allyEnergyGuardRefStat = e.target.value);
  block.querySelector('.f-moveSkillUp').addEventListener('click', () => {
    const idx = skillDraftList.findIndex(x => x._uid === s._uid);
    if (idx > 0) {
      [skillDraftList[idx - 1], skillDraftList[idx]] = [skillDraftList[idx], skillDraftList[idx - 1]];
      renderSkillsArea();
    }
  });
  block.querySelector('.f-moveSkillDown').addEventListener('click', () => {
    const idx = skillDraftList.findIndex(x => x._uid === s._uid);
    if (idx >= 0 && idx < skillDraftList.length - 1) {
      [skillDraftList[idx], skillDraftList[idx + 1]] = [skillDraftList[idx + 1], skillDraftList[idx]];
      renderSkillsArea();
    }
  });
  block.querySelector('.f-removeSkill').addEventListener('click', () => {
    skillDraftList = skillDraftList.filter(x => x._uid !== s._uid);
    renderSkillsArea();
  });
  block.querySelector('.f-damageType').addEventListener('change', e => s.damageType = e.target.value);
  block.querySelector('.f-hasMainTargetOverride').addEventListener('change', e => s.hasMainTargetOverride = e.target.checked);
  block.querySelector('.f-damageOutputType').addEventListener('change', e => s.damageOutputType = e.target.value);
  block.querySelector('.f-isBuffRemoval').addEventListener('change', e => s.isBuffRemovalAttack = e.target.checked);
  block.querySelector('.f-lock5Copies').addEventListener('change', e => s.lock5Copies = e.target.checked);
  block.querySelector('.f-isDebuffApply').addEventListener('change', e => s.isDebuffApplyAttack = e.target.checked);
  block.querySelector('.f-debuffVulnerability').addEventListener('input', e => s.debuffVulnerability = Number(e.target.value) || 0);
  block.querySelector('.f-debuffPhysicalVulnerability').addEventListener('input', e => s.debuffPhysicalVulnerability = Number(e.target.value) || 0);
  block.querySelector('.f-debuffMagicVulnerability').addEventListener('input', e => s.debuffMagicVulnerability = Number(e.target.value) || 0);
  block.querySelector('.f-debuffDefenseReduction').addEventListener('input', e => s.debuffDefenseReduction = Number(e.target.value) || 0);
  block.querySelector('.f-debuffMagicResistReduction').addEventListener('input', e => s.debuffMagicResistReduction = Number(e.target.value) || 0);
  block.querySelector('.f-debuffChainDamageIncrease').addEventListener('input', e => s.debuffChainDamageIncrease = Number(e.target.value) || 0);
  block.querySelector('.f-debuffSummonVulnerability').addEventListener('input', e => s.debuffSummonVulnerability = Number(e.target.value) || 0);
  block.querySelector('.f-debuffFireVulnerability').addEventListener('input', e => s.debuffFireVulnerability = Number(e.target.value) || 0);
  block.querySelector('.f-debuffWaterVulnerability').addEventListener('input', e => s.debuffWaterVulnerability = Number(e.target.value) || 0);
  block.querySelector('.f-debuffWindVulnerability').addEventListener('input', e => s.debuffWindVulnerability = Number(e.target.value) || 0);
  block.querySelector('.f-debuffLightVulnerability').addEventListener('input', e => s.debuffLightVulnerability = Number(e.target.value) || 0);
  block.querySelector('.f-debuffDarkVulnerability').addEventListener('input', e => s.debuffDarkVulnerability = Number(e.target.value) || 0);
  block.querySelector('.f-isSummonDamage').addEventListener('change', e => s.isSummonDamage = e.target.checked);
  block.querySelector('.f-hitCountBonus').addEventListener('input', e => s.hitCountBonusPercent = Number(e.target.value) || 0);
  block.querySelector('.f-buffCountBonus').addEventListener('input', e => s.buffCountBonusPercent = Number(e.target.value) || 0);
  block.querySelector('.f-spCostBonus').addEventListener('input', e => s.spCostBonusPercent = Number(e.target.value) || 0);
  block.querySelector('.f-chainMultipleOf').addEventListener('input', e => s.chainMultipleOf = Number(e.target.value) || 0);
  block.querySelector('.f-chainMultipleBonus').addEventListener('input', e => s.chainMultipleBonusPercent = Number(e.target.value) || 0);
  block.querySelector('.f-selfStackEnabled').addEventListener('change', e => s.selfStackBuffEnabled = e.target.checked);
  block.querySelector('.f-selfStackPerStack').addEventListener('input', e => s.selfStackPerStackAttackPercent = Number(e.target.value) || 0);
  block.querySelector('.f-selfStackMax').addEventListener('input', e => s.selfStackMax = Number(e.target.value) || 0);
  block.querySelector('.f-selfStackThreshold').addEventListener('input', e => s.selfStackThreshold = Number(e.target.value) || 0);
  block.querySelector('.f-selfStackThresholdBonus').addEventListener('input', e => s.selfStackThresholdChainIncreaseBonus = Number(e.target.value) || 0);

  block.querySelector('.f-addFormula').addEventListener('click', () => {
    s.referenceFormula.push({ stat: 'attack', cap: null, coefficient: 100 });
    renderSkillsArea();
  });
  block.querySelectorAll('.formulaRow').forEach(row => {
    const idx = Number(row.dataset.formulaIdx);
    row.querySelector('.f-formulaStat').addEventListener('change', e => {
      s.referenceFormula[idx].stat = e.target.value;
      renderSkillsArea(); // エナジーガード専用欄の表示/非表示を切り替えるため再描画
    });
    row.querySelector('.f-formulaCap').addEventListener('input', e => s.referenceFormula[idx].cap = e.target.value === '' ? null : Number(e.target.value));
    row.querySelector('.f-formulaCoef').addEventListener('input', e => s.referenceFormula[idx].coefficient = Number(e.target.value) || 0);
    const egHpCapInp = row.querySelector('.f-formulaEgHpCap');
    if (egHpCapInp) egHpCapInp.addEventListener('input', e => s.referenceFormula[idx].egHpCap = e.target.value === '' ? null : Number(e.target.value));
    const egRatioInp = row.querySelector('.f-formulaEgRatio');
    if (egRatioInp) egRatioInp.addEventListener('input', e => s.referenceFormula[idx].ratioPercent = Number(e.target.value) || 0);
    const egFlatInp = row.querySelector('.f-formulaEgFlat');
    if (egFlatInp) egFlatInp.addEventListener('input', e => s.referenceFormula[idx].flatBonus = Number(e.target.value) || 0);
    row.querySelector('.f-removeFormula').addEventListener('click', () => {
      s.referenceFormula.splice(idx, 1);
      renderSkillsArea();
    });
  });

  // 凸(copies)グリッド: 上位の凸レベルへ自動でカスケード(継承)する
  //   例: 0凸の値を変更すると1〜5凸にも同じ値が自動反映される。1凸を変更すればさらに2〜5凸に反映される。
  //   「5凸をロック」がONの間は、5凸(インポート等で確定した完凸データ)だけカスケードをスキップして保護する。
  const cascadeToHigherCopies = (idx, applyFn, syncDom) => {
    for (let j = idx + 1; j < s.copiesLevels.length; j++) {
      if (s.lock5Copies && s.copiesLevels[j].copies === 5) continue;
      applyFn(s.copiesLevels[j]);
      const targetRow = block.querySelector(`[data-copies-idx="${j}"]`);
      if (targetRow) syncDom(targetRow);
    }
  };

  block.querySelectorAll('[data-copies-idx]').forEach(row => {
    const idx = Number(row.dataset.copiesIdx);
    const lv = s.copiesLevels[idx];

    row.querySelector('.f-maxHits').addEventListener('input', e => {
      const v = Number(e.target.value) || 1;
      lv.maxHits = v;
      cascadeToHigherCopies(idx, t => t.maxHits = v, r => r.querySelector('.f-maxHits').value = v);
    });
    row.querySelector('.f-skillMultiplier').addEventListener('input', e => {
      const v = parseIntervals(e.target.value);
      lv.skillMultiplier = v;
      cascadeToHigherCopies(idx, t => t.skillMultiplier = JSON.parse(JSON.stringify(v)), r => r.querySelector('.f-skillMultiplier').value = serializeIntervals(v));
    });
    row.querySelector('.f-mainTargetSkillMultiplier').addEventListener('input', e => {
      const v = parseIntervals(e.target.value);
      lv.mainTargetSkillMultiplier = v;
      cascadeToHigherCopies(idx, t => t.mainTargetSkillMultiplier = JSON.parse(JSON.stringify(v)), r => r.querySelector('.f-mainTargetSkillMultiplier').value = serializeIntervals(v));
    });
    row.querySelector('.f-enhance').addEventListener('input', e => {
      const v = parseIntervals(e.target.value);
      lv.enhance = v;
      cascadeToHigherCopies(idx, t => t.enhance = JSON.parse(JSON.stringify(v)), r => r.querySelector('.f-enhance').value = serializeIntervals(v));
    });
    row.querySelector('.f-elementBoost').addEventListener('input', e => {
      const v = parseIntervals(e.target.value);
      lv.elementBoost = v;
      cascadeToHigherCopies(idx, t => t.elementBoost = JSON.parse(JSON.stringify(v)), r => r.querySelector('.f-elementBoost').value = serializeIntervals(v));
    });
    row.querySelector('.f-chainDamageIncrease').addEventListener('input', e => {
      const v = parseIntervals(e.target.value);
      lv.chainDamageIncrease = v;
      cascadeToHigherCopies(idx, t => t.chainDamageIncrease = JSON.parse(JSON.stringify(v)), r => r.querySelector('.f-chainDamageIncrease').value = serializeIntervals(v));
    });
    row.querySelector('.f-selfBuffAttack').addEventListener('input', e => {
      const v = parseIntervals(e.target.value);
      lv.selfBuff.attackBuffPercent = v;
      cascadeToHigherCopies(idx, t => t.selfBuff.attackBuffPercent = JSON.parse(JSON.stringify(v)), r => r.querySelector('.f-selfBuffAttack').value = serializeIntervals(v));
    });
    row.querySelector('.f-selfBuffCrit').addEventListener('input', e => {
      const v = parseIntervals(e.target.value);
      lv.selfBuff.critRateBuffPercent = v;
      cascadeToHigherCopies(idx, t => t.selfBuff.critRateBuffPercent = JSON.parse(JSON.stringify(v)), r => r.querySelector('.f-selfBuffCrit').value = serializeIntervals(v));
    });
    row.querySelector('.f-selfBuffCritDamage').addEventListener('input', e => {
      const v = parseIntervals(e.target.value);
      lv.selfBuff.critDamageBuffPercent = v;
      cascadeToHigherCopies(idx, t => t.selfBuff.critDamageBuffPercent = JSON.parse(JSON.stringify(v)), r => r.querySelector('.f-selfBuffCritDamage').value = serializeIntervals(v));
    });
    row.querySelector('.f-selfChainEnhance').addEventListener('input', e => {
      const v = Number(e.target.value) || 0;
      lv.selfBuff.chainEnhance = v;
      cascadeToHigherCopies(idx, t => t.selfBuff.chainEnhance = v, r => r.querySelector('.f-selfChainEnhance').value = v);
    });
    row.querySelector('.f-selfEnergyGuardBonus').addEventListener('input', e => {
      const v = Number(e.target.value) || 0;
      lv.selfBuff.energyGuardBonus = v;
      cascadeToHigherCopies(idx, t => t.selfBuff.energyGuardBonus = v, r => r.querySelector('.f-selfEnergyGuardBonus').value = v);
    });
    row.querySelector('.f-otherAdjustment').addEventListener('input', e => {
      const v = Number(e.target.value) || 0;
      lv.otherAdjustment = v;
      cascadeToHigherCopies(idx, t => t.otherAdjustment = v, r => r.querySelector('.f-otherAdjustment').value = v);
    });
    row.querySelector('.f-allyPhysicalAttack').addEventListener('input', e => {
      const v = parseIntervals(e.target.value);
      lv.allyBuff.physicalAttackBuffPercent = v;
      cascadeToHigherCopies(idx, t => t.allyBuff.physicalAttackBuffPercent = JSON.parse(JSON.stringify(v)), r => r.querySelector('.f-allyPhysicalAttack').value = serializeIntervals(v));
    });
    row.querySelector('.f-allyMagicAttack').addEventListener('input', e => {
      const v = parseIntervals(e.target.value);
      lv.allyBuff.magicAttackBuffPercent = v;
      cascadeToHigherCopies(idx, t => t.allyBuff.magicAttackBuffPercent = JSON.parse(JSON.stringify(v)), r => r.querySelector('.f-allyMagicAttack').value = serializeIntervals(v));
    });
    row.querySelector('.f-allyCrit').addEventListener('input', e => {
      const v = parseIntervals(e.target.value);
      lv.allyBuff.critRateBuffPercent = v;
      cascadeToHigherCopies(idx, t => t.allyBuff.critRateBuffPercent = JSON.parse(JSON.stringify(v)), r => r.querySelector('.f-allyCrit').value = serializeIntervals(v));
    });
    row.querySelector('.f-allyCritDamage').addEventListener('input', e => {
      const v = parseIntervals(e.target.value);
      lv.allyBuff.critDamageBuffPercent = v;
      cascadeToHigherCopies(idx, t => t.allyBuff.critDamageBuffPercent = JSON.parse(JSON.stringify(v)), r => r.querySelector('.f-allyCritDamage').value = serializeIntervals(v));
    });
    row.querySelector('.f-allyEnhance').addEventListener('input', e => {
      const v = parseIntervals(e.target.value);
      lv.allyBuff.enhancePercent = v;
      cascadeToHigherCopies(idx, t => t.allyBuff.enhancePercent = JSON.parse(JSON.stringify(v)), r => r.querySelector('.f-allyEnhance').value = serializeIntervals(v));
    });
    row.querySelector('.f-allyElement').addEventListener('input', e => {
      const v = parseIntervals(e.target.value);
      lv.allyBuff.elementBoostPercent = v;
      cascadeToHigherCopies(idx, t => t.allyBuff.elementBoostPercent = JSON.parse(JSON.stringify(v)), r => r.querySelector('.f-allyElement').value = serializeIntervals(v));
    });
    row.querySelector('.f-allyChain').addEventListener('input', e => {
      const v = parseIntervals(e.target.value);
      lv.allyBuff.chainDamageIncreasePercent = v;
      cascadeToHigherCopies(idx, t => t.allyBuff.chainDamageIncreasePercent = JSON.parse(JSON.stringify(v)), r => r.querySelector('.f-allyChain').value = serializeIntervals(v));
    });
    row.querySelector('.f-allyChainEnhance').addEventListener('input', e => {
      const v = Number(e.target.value) || 0;
      lv.allyBuff.chainEnhance = v;
      cascadeToHigherCopies(idx, t => t.allyBuff.chainEnhance = v, r => r.querySelector('.f-allyChainEnhance').value = v);
    });
    row.querySelector('.f-allyEnergyGuardBonus').addEventListener('input', e => {
      const v = Number(e.target.value) || 0;
      lv.allyBuff.energyGuardBonus = v;
      cascadeToHigherCopies(idx, t => t.allyBuff.energyGuardBonus = v, r => r.querySelector('.f-allyEnergyGuardBonus').value = v);
    });
    row.querySelector('.f-allyEnergyGuardPercent').addEventListener('input', e => {
      const v = Number(e.target.value) || 0;
      lv.allyBuff.energyGuardPercent = v;
      cascadeToHigherCopies(idx, t => t.allyBuff.energyGuardPercent = v, r => r.querySelector('.f-allyEnergyGuardPercent').value = v);
    });
  });

  block.querySelectorAll('[data-burst-idx]').forEach(row => {
    const idx = Number(row.dataset.burstIdx);
    const b = s.burstBonus[idx];
    row.querySelector('.f-maxHitsAdd').addEventListener('input', e => b.maxHitsAdd = Number(e.target.value) || 0);
    row.querySelector('.f-skillMultiplierAdd').addEventListener('input', e => b.skillMultiplierAdd = parseIntervals(e.target.value));
    row.querySelector('.f-mainTargetSkillMultiplierAdd').addEventListener('input', e => b.mainTargetSkillMultiplierAdd = parseIntervals(e.target.value));
    row.querySelector('.f-enhanceAdd').addEventListener('input', e => b.enhanceAdd = parseIntervals(e.target.value));
    row.querySelector('.f-elementBoostAdd').addEventListener('input', e => b.elementBoostAdd = parseIntervals(e.target.value));
    row.querySelector('.f-chainDamageIncreaseAdd').addEventListener('input', e => b.chainDamageIncreaseAdd = parseIntervals(e.target.value));
    row.querySelector('.f-selfBuffAttackAdd').addEventListener('input', e => b.selfBuffAttackAdd = parseIntervals(e.target.value));
    row.querySelector('.f-selfBuffCritAdd').addEventListener('input', e => b.selfBuffCritAdd = parseIntervals(e.target.value));
    row.querySelector('.f-selfCritDamageAdd').addEventListener('input', e => b.selfCritDamageAdd = parseIntervals(e.target.value));
    row.querySelector('.f-selfChainEnhanceAdd').addEventListener('input', e => b.selfChainEnhanceAdd = Number(e.target.value) || 0);
    row.querySelector('.f-selfEnergyGuardBonusAdd').addEventListener('input', e => b.selfEnergyGuardBonusAdd = Number(e.target.value) || 0);
    row.querySelector('.f-allyPhysicalAttackAdd').addEventListener('input', e => b.allyBuffAdd.physicalAttackBuffPercent = parseIntervals(e.target.value));
    row.querySelector('.f-allyMagicAttackAdd').addEventListener('input', e => b.allyBuffAdd.magicAttackBuffPercent = parseIntervals(e.target.value));
    row.querySelector('.f-allyCritAdd').addEventListener('input', e => b.allyBuffAdd.critRateBuffPercent = parseIntervals(e.target.value));
    row.querySelector('.f-allyCritDamageAdd').addEventListener('input', e => b.allyBuffAdd.critDamageBuffPercent = parseIntervals(e.target.value));
    row.querySelector('.f-allyEnhanceAdd').addEventListener('input', e => b.allyBuffAdd.enhancePercent = parseIntervals(e.target.value));
    row.querySelector('.f-allyElementAdd').addEventListener('input', e => b.allyBuffAdd.elementBoostPercent = parseIntervals(e.target.value));
    row.querySelector('.f-allyChainAdd').addEventListener('input', e => b.allyBuffAdd.chainDamageIncreasePercent = parseIntervals(e.target.value));
    row.querySelector('.f-allyChainEnhanceAdd').addEventListener('input', e => b.allyBuffAdd.chainEnhance = Number(e.target.value) || 0);
    row.querySelector('.f-allyEnergyGuardBonusAdd').addEventListener('input', e => b.allyBuffAdd.energyGuardBonus = Number(e.target.value) || 0);
    row.querySelector('.f-allyEnergyGuardPercentAdd').addEventListener('input', e => b.allyBuffAdd.energyGuardPercent = Number(e.target.value) || 0);
  });

  block.querySelectorAll('[data-potential-idx]').forEach(row => {
    const idx = Number(row.dataset.potentialIdx);
    const p = s.potentials[idx];
    row.querySelector('.f-potentialDesc').addEventListener('input', e => p.description = e.target.value);
    row.querySelector('.f-maxHitsAdd').addEventListener('input', e => p.maxHitsAdd = Number(e.target.value) || 0);
    row.querySelector('.f-skillMultiplierAdd').addEventListener('input', e => p.skillMultiplierAdd = parseIntervals(e.target.value));
    row.querySelector('.f-mainTargetSkillMultiplierAdd').addEventListener('input', e => p.mainTargetSkillMultiplierAdd = parseIntervals(e.target.value));
    row.querySelector('.f-enhanceAdd').addEventListener('input', e => p.enhanceAdd = parseIntervals(e.target.value));
    row.querySelector('.f-elementBoostAdd').addEventListener('input', e => p.elementBoostAdd = parseIntervals(e.target.value));
    row.querySelector('.f-chainDamageIncreaseAdd').addEventListener('input', e => p.chainDamageIncreaseAdd = parseIntervals(e.target.value));
    row.querySelector('.f-selfBuffAttackAdd').addEventListener('input', e => p.selfBuffAttackAdd = parseIntervals(e.target.value));
    row.querySelector('.f-selfBuffCritAdd').addEventListener('input', e => p.selfBuffCritAdd = parseIntervals(e.target.value));
    row.querySelector('.f-selfCritDamageAdd').addEventListener('input', e => p.selfCritDamageAdd = parseIntervals(e.target.value));
    row.querySelector('.f-selfChainEnhanceAdd').addEventListener('input', e => p.selfChainEnhanceAdd = Number(e.target.value) || 0);
    row.querySelector('.f-selfEnergyGuardBonusAdd').addEventListener('input', e => p.selfEnergyGuardBonusAdd = Number(e.target.value) || 0);
    row.querySelector('.f-allyPhysicalAttackAdd').addEventListener('input', e => p.allyBuffAdd.physicalAttackBuffPercent = parseIntervals(e.target.value));
    row.querySelector('.f-allyMagicAttackAdd').addEventListener('input', e => p.allyBuffAdd.magicAttackBuffPercent = parseIntervals(e.target.value));
    row.querySelector('.f-allyCritAdd').addEventListener('input', e => p.allyBuffAdd.critRateBuffPercent = parseIntervals(e.target.value));
    row.querySelector('.f-allyCritDamageAdd').addEventListener('input', e => p.allyBuffAdd.critDamageBuffPercent = parseIntervals(e.target.value));
    row.querySelector('.f-allyEnhanceAdd').addEventListener('input', e => p.allyBuffAdd.enhancePercent = parseIntervals(e.target.value));
    row.querySelector('.f-allyElementAdd').addEventListener('input', e => p.allyBuffAdd.elementBoostPercent = parseIntervals(e.target.value));
    row.querySelector('.f-allyChainAdd').addEventListener('input', e => p.allyBuffAdd.chainDamageIncreasePercent = parseIntervals(e.target.value));
    row.querySelector('.f-allyChainEnhanceAdd').addEventListener('input', e => p.allyBuffAdd.chainEnhance = Number(e.target.value) || 0);
    row.querySelector('.f-allyEnergyGuardBonusAdd').addEventListener('input', e => p.allyBuffAdd.energyGuardBonus = Number(e.target.value) || 0);
    row.querySelector('.f-allyEnergyGuardPercentAdd').addEventListener('input', e => p.allyBuffAdd.energyGuardPercent = Number(e.target.value) || 0);
  });
}

document.getElementById('saveCharBtn').addEventListener('click', async () => {
  const statusEl = document.getElementById('charSaveStatus');
  if (!isAdmin) { statusEl.className = 'status err'; statusEl.textContent = 'キャラ登録は管理者のみ行えます。'; return; }
  const name = document.getElementById('charName').value.trim();
  const attribute = document.getElementById('charAttribute').value;
  const priority = Number(document.getElementById('charPriority').value) || 0;
  if (!name) { statusEl.className = 'status err'; statusEl.textContent = 'キャラクター名を入力してください。'; return; }
  if (!skillDraftList.length) { statusEl.className = 'status err'; statusEl.textContent = 'スキルを最低1つ追加してください。'; return; }
  const cleanSkills = skillDraftList.map(({ _uid, ...rest }) => rest);
  const docId = currentEditCharId || name;
  try {
    await setDoc(doc(charactersCol, docId), {
      name, attribute, priority, skills: cleanSkills, registeredBy: operatorName, updatedAt: new Date().toISOString()
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
// キャラ一括インポート(「キャラデータ（仮）」シート形式)
// ==================================================================
// データ列(D列以降・0始まり)のインデックス定義。ヘッダーを除いたデータ行のうち、
// 列0=キャラ名, 列1=コスチューム名, 列2=属性, 列3以降がシートのD列(攻撃力)以降に対応する。
const IMPORT_COL = {
  attack: 3, magicAttack: 4, hitCount: 9,
  // 全体バフ(配布バフ) Q,R,S,T,U,V,W,X → index 16-23
  allyAtk1: 16, allyAtk2: 17, allyMag: 18, allyCrit: 19, allyCritDmg: 20, allyEnhance: 21, allyElement: 22, allyChainEnhance: 23,
  // 自己バフ Y,Z,AA,AB,AC,AD,AE,AF → index 24-31
  selfAtk1: 24, selfAtk2: 25, selfCrit: 26, selfCritDmg: 27, selfElement: 28, selfEnhance: 30, selfChainEnhance: 31,
  // 全体デバフ AG〜AU → index 32-46
  debuffDefense: 33, debuffPhysVuln: 34, debuffMagicResist: 36, debuffMagicVuln: 37, debuffVuln: 38,
  debuffChainInc: 42, debuffWindVuln: 44, debuffLightVuln: 45
};

function num(v) { const n = Number(String(v || '').trim()); return isNaN(n) ? 0 : n; }

function buildImportedSkill(cells, costumeName) {
  const attack = num(cells[IMPORT_COL.attack]);
  const magicAttack = num(cells[IMPORT_COL.magicAttack]);
  const isMagic = magicAttack > 0;
  const skillMult = isMagic ? magicAttack : attack;
  const hitCount = num(cells[IMPORT_COL.hitCount]) || 1;

  const allyAttackTotal = num(cells[IMPORT_COL.allyAtk1]) + num(cells[IMPORT_COL.allyAtk2]);
  const allyMag = num(cells[IMPORT_COL.allyMag]);
  const grantsAllyBuff = allyAttackTotal !== 0 || allyMag !== 0 || num(cells[IMPORT_COL.allyCrit]) !== 0 ||
    num(cells[IMPORT_COL.allyCritDmg]) !== 0 || num(cells[IMPORT_COL.allyEnhance]) !== 0 ||
    num(cells[IMPORT_COL.allyElement]) !== 0 || num(cells[IMPORT_COL.allyChainEnhance]) !== 0;

  const debuffValues = {
    debuffDefenseReduction: num(cells[IMPORT_COL.debuffDefense]),
    debuffPhysicalVulnerability: num(cells[IMPORT_COL.debuffPhysVuln]),
    debuffMagicResistReduction: num(cells[IMPORT_COL.debuffMagicResist]),
    debuffMagicVulnerability: num(cells[IMPORT_COL.debuffMagicVuln]),
    debuffVulnerability: num(cells[IMPORT_COL.debuffVuln]),
    debuffChainDamageIncrease: num(cells[IMPORT_COL.debuffChainInc]),
    debuffWindVulnerability: num(cells[IMPORT_COL.debuffWindVuln]),
    debuffLightVulnerability: num(cells[IMPORT_COL.debuffLightVuln])
  };
  const isDebuffApplyAttack = Object.values(debuffValues).some(v => v !== 0);

  const skill = blankSkill();
  skill.skillName = costumeName || '(コスチューム名未設定)';
  skill.dealsDamage = true;
  skill.grantsAllyBuff = grantsAllyBuff;
  skill.damageType = isMagic ? 'magic' : 'physical';
  skill.referenceFormula = [{ stat: isMagic ? 'magicAttack' : 'attack', cap: null, coefficient: 100 }];
  skill.isDebuffApplyAttack = isDebuffApplyAttack;
  if (isDebuffApplyAttack) Object.assign(skill, debuffValues);

  const level = blankLevel(0); // copiesは後で個別にセットする
  level.maxHits = hitCount;
  level.skillMultiplier = [{ from: 1, value: skillMult }];
  level.enhance = [{ from: 1, value: num(cells[IMPORT_COL.selfEnhance]) }];
  level.elementBoost = [{ from: 1, value: num(cells[IMPORT_COL.selfElement]) }];
  level.selfBuff.attackBuffPercent = [{ from: 1, value: num(cells[IMPORT_COL.selfAtk1]) + num(cells[IMPORT_COL.selfAtk2]) }];
  level.selfBuff.critRateBuffPercent = [{ from: 1, value: num(cells[IMPORT_COL.selfCrit]) }];
  level.selfBuff.critDamageBuffPercent = [{ from: 1, value: num(cells[IMPORT_COL.selfCritDmg]) }];
  level.selfBuff.chainEnhance = num(cells[IMPORT_COL.selfChainEnhance]);
  if (grantsAllyBuff) {
    level.allyBuff.physicalAttackBuffPercent = [{ from: 1, value: allyAttackTotal }];
    level.allyBuff.magicAttackBuffPercent = [{ from: 1, value: allyMag }];
    level.allyBuff.critRateBuffPercent = [{ from: 1, value: num(cells[IMPORT_COL.allyCrit]) }];
    level.allyBuff.critDamageBuffPercent = [{ from: 1, value: num(cells[IMPORT_COL.allyCritDmg]) }];
    level.allyBuff.enhancePercent = [{ from: 1, value: num(cells[IMPORT_COL.allyEnhance]) }];
    level.allyBuff.elementBoostPercent = [{ from: 1, value: num(cells[IMPORT_COL.allyElement]) }];
    level.allyBuff.chainEnhance = num(cells[IMPORT_COL.allyChainEnhance]);
  }

  // 0〜5凸すべてに同じ値をセットし、5凸ロックを自動でONにする(あとで0〜4凸だけ手動調整できるように)
  skill.copiesLevels = [0, 1, 2, 3, 4, 5].map(c => ({ ...JSON.parse(JSON.stringify(level)), copies: c }));
  skill.lock5Copies = true;
  return skill;
}

document.getElementById('charImportBtn').addEventListener('click', async () => {
  const statusEl = document.getElementById('charImportStatus');
  const logEl = document.getElementById('charImportLog');
  if (!isAdmin) { statusEl.className = 'status err'; statusEl.textContent = 'インポートは管理者のみ行えます。'; return; }
  const raw = document.getElementById('charImportInput').value;
  const lines = raw.split('\n').map(l => l.trim()).filter(l => l);
  if (!lines.length) { statusEl.className = 'status err'; statusEl.textContent = 'データを貼り付けてください。'; return; }

  statusEl.className = 'status'; statusEl.textContent = 'インポート中...';
  const logLines = [];
  // 同じキャラ名が複数行(コスチューム違い)ある場合、まとめて1キャラにする
  const byName = {};
  lines.forEach(line => {
    const cells = line.split('\t');
    const name = (cells[0] || '').trim();
    const costume = (cells[1] || '').trim();
    const attribute = (cells[2] || '').trim();
    if (!name) return;
    if (!byName[name]) byName[name] = { attribute, skills: [] };
    byName[name].skills.push(buildImportedSkill(cells, costume));
  });

  for (const name of Object.keys(byName)) {
    if (charactersCache.some(c => c.name === name)) {
      logLines.push(`⏭️ ${name}: 既に登録済みのためスキップしました`);
      continue;
    }
    try {
      const cleanSkills = byName[name].skills.map(({ _uid, ...rest }) => rest);
      await setDoc(doc(charactersCol, name), {
        name, attribute: byName[name].attribute || '火', priority: 0, skills: cleanSkills,
        registeredBy: operatorName, updatedAt: new Date().toISOString()
      });
      logWrite('characterImport', name);
      logLines.push(`✅ ${name}: ${byName[name].skills.length}件のスキルを登録しました`);
    } catch (e) {
      logLines.push(`❌ ${name}: 登録に失敗しました(${e.message})`);
    }
  }

  logEl.innerHTML = logLines.map(l => `<div class="detail">${escapeHtml(l)}</div>`).join('');
  statusEl.className = 'status ok'; statusEl.textContent = 'インポート処理が完了しました。';
  await loadCharacters();
  renderCharList();
});

// ==================================================================
// 5・7・8・9章: 計算エンジン
// ==================================================================
function getEffectiveLevel(skill, copies, burst, selectedPotentialIdxs) {
  const base = skill.copiesLevels.find(c => c.copies === copies);
  const bonus = skill.burstBonus.find(b => b.burst === burst);
  const potentials = (selectedPotentialIdxs || []).map(i => skill.potentials[i]).filter(Boolean);

  // 2つの区間配列を「チェイン数ごとの値を足し合わせた新しい区間配列」にマージする(バースト/潜在力の区間加算用)
  const mergeIntervals = (baseIntervals, addIntervals) => {
    if (!addIntervals || !addIntervals.length) return baseIntervals;
    const breakpoints = [...new Set([...(baseIntervals || []).map(iv => iv.from), ...addIntervals.map(iv => iv.from)])].sort((a, b) => a - b);
    return breakpoints.map(from => ({ from, value: getValue(baseIntervals, from) + getValue(addIntervals, from) }));
  };
  // バースト・潜在力とも「区間として正しくマージ」する(複数選択時は順に重ねる)
  const combineIntervalField = (baseIntervals, burstField, potentialField) => {
    let result = mergeIntervals(baseIntervals, bonus[burstField]);
    potentials.forEach(p => { result = mergeIntervals(result, p[potentialField]); });
    return result;
  };
  const combineAllyIntervalField = (baseIntervals, field) => {
    let result = mergeIntervals(baseIntervals, bonus.allyBuffAdd?.[field]);
    potentials.forEach(p => { result = mergeIntervals(result, p.allyBuffAdd?.[field]); });
    return result;
  };
  // チェイン強化・エナガ付与など「固定値」項目は今まで通りバースト+潜在力を単純合算する
  const sumFlatField = (field) => (bonus[field] || 0) + potentials.reduce((s, p) => s + (p[field] || 0), 0);
  const sumAllyFlatField = (field) => (bonus.allyBuffAdd?.[field] || 0) + potentials.reduce((s, p) => s + (p.allyBuffAdd?.[field] || 0), 0);

  return {
    maxHits: (base.maxHits || 1) + sumFlatField('maxHitsAdd'),
    skillMultiplier: combineIntervalField(base.skillMultiplier, 'skillMultiplierAdd', 'skillMultiplierAdd'),
    mainTargetSkillMultiplier: combineIntervalField(base.mainTargetSkillMultiplier, 'mainTargetSkillMultiplierAdd', 'mainTargetSkillMultiplierAdd'),
    enhance: combineIntervalField(base.enhance, 'enhanceAdd', 'enhanceAdd'),
    elementBoost: combineIntervalField(base.elementBoost, 'elementBoostAdd', 'elementBoostAdd'),
    chainDamageIncrease: combineIntervalField(base.chainDamageIncrease, 'chainDamageIncreaseAdd', 'chainDamageIncreaseAdd'),
    otherAdjustment: base.otherAdjustment || 0,
    selfBuff: {
      attackBuffPercent: combineIntervalField(base.selfBuff.attackBuffPercent, 'selfBuffAttackAdd', 'selfBuffAttackAdd'),
      critRateBuffPercent: combineIntervalField(base.selfBuff.critRateBuffPercent, 'selfBuffCritAdd', 'selfBuffCritAdd'),
      critDamageBuffPercent: combineIntervalField(base.selfBuff.critDamageBuffPercent, 'selfCritDamageAdd', 'selfCritDamageAdd')
    },
    selfChainEnhance: (base.selfBuff.chainEnhance || 0) + sumFlatField('selfChainEnhanceAdd'),
    selfEnergyGuardBonus: (base.selfBuff.energyGuardBonus || 0) + sumFlatField('selfEnergyGuardBonusAdd'),
    allyBuff: base.allyBuff ? {
      physicalAttackBuffPercent: combineAllyIntervalField(base.allyBuff.physicalAttackBuffPercent, 'physicalAttackBuffPercent'),
      magicAttackBuffPercent: combineAllyIntervalField(base.allyBuff.magicAttackBuffPercent, 'magicAttackBuffPercent'),
      critRateBuffPercent: combineAllyIntervalField(base.allyBuff.critRateBuffPercent, 'critRateBuffPercent'),
      critDamageBuffPercent: combineAllyIntervalField(base.allyBuff.critDamageBuffPercent, 'critDamageBuffPercent'),
      enhancePercent: combineAllyIntervalField(base.allyBuff.enhancePercent, 'enhancePercent'),
      elementBoostPercent: combineAllyIntervalField(base.allyBuff.elementBoostPercent, 'elementBoostPercent'),
      chainDamageIncreasePercent: combineAllyIntervalField(base.allyBuff.chainDamageIncreasePercent, 'chainDamageIncreasePercent'),
      chainEnhance: (base.allyBuff.chainEnhance || 0) + sumAllyFlatField('chainEnhance'),
      energyGuardBonus: (base.allyBuff.energyGuardBonus || 0) + sumAllyFlatField('energyGuardBonus'),
      energyGuardPercent: (base.allyBuff.energyGuardPercent || 0) + sumAllyFlatField('energyGuardPercent')
    } : null
  };
}

// このスキルの潜在力のうち、ダメージ計算に数値として影響するもの(=バフキャラ選択でチェック対象にすべきもの)かどうか
function potentialHasNumericEffect(p) {
  // 区間配列(例: skillMultiplierAdd)か固定値(例: selfChainEnhanceAdd)かを問わず、値が0以外かどうかを判定する
  const hasEffect = (v) => Array.isArray(v) ? v.some(iv => (iv.value || 0) !== 0) : (v || 0) !== 0;
  const numFields = ['maxHitsAdd','skillMultiplierAdd','enhanceAdd','elementBoostAdd','chainDamageIncreaseAdd',
    'selfBuffAttackAdd','selfBuffCritAdd','selfCritDamageAdd','selfChainEnhanceAdd','selfEnergyGuardBonusAdd'];
  if (numFields.some(f => hasEffect(p[f]))) return true;
  const allyFields = ['physicalAttackBuffPercent','magicAttackBuffPercent','critRateBuffPercent','critDamageBuffPercent','enhancePercent','elementBoostPercent','chainDamageIncreasePercent','chainEnhance','energyGuardBonus','energyGuardPercent'];
  return allyFields.some(f => hasEffect(p.allyBuffAdd?.[f]));
}

function getStatValue(term, inputStats, boss, egBonus) {
  if (term.stat === 'enemyTotalHP') return Math.min(boss ? (Number(boss.totalHP) || 0) : 0, 50000);
  if (term.stat === 'energyGuard') {
    // エナジーガードは手入力せず、自身の最大HP(バフ後入力値)から「HP→EG変換率%」「EG固定加算値」で自動算出する
    // (味方からの「エナガ付与」バフがあれば、算出後の値にそのまま加算する)
    const hp = Number(inputStats.selfMaxHP) || 0;
    const cappedHp = term.egHpCap != null ? Math.min(hp, term.egHpCap) : hp;
    return Math.floor(cappedHp * (term.ratioPercent || 0) / 100) + (term.flatBonus || 0) + (egBonus || 0);
  }
  return Number(inputStats[term.stat]) || 0;
}
function getBaseValue(referenceFormula, inputStats, boss, egBonus) {
  return referenceFormula.reduce((sum, term) => {
    const raw = getStatValue(term, inputStats, boss, egBonus);
    const capped = term.cap != null ? Math.min(raw, term.cap) : raw;
    return sum + Math.floor(capped * term.coefficient / 100);
  }, 0);
}
function roundDown(n) { return Math.floor(n); }

// selectedAllySources: 選択されたバフキャラの effectiveLevel.allyBuff (区間配列を含む) のリスト
// skill: バフを受け取る側のスキル(damageTypeでどちらの攻撃バフ列を見るか決まる)
function sumAllyBuffsAtChain(selectedAllySources, skill, chainCount) {
  const attackField = skill.damageType === 'magic' ? 'magicAttackBuffPercent' : 'physicalAttackBuffPercent';
  return selectedAllySources.reduce((acc, a) => {
    acc.attackBuffPercent += getValue(a[attackField], chainCount);
    acc.critRateBuffPercent += getValue(a.critRateBuffPercent, chainCount);
    acc.critDamageBuffPercent += getValue(a.critDamageBuffPercent, chainCount);
    acc.enhancePercent += getValue(a.enhancePercent, chainCount);
    acc.elementBoostPercent += getValue(a.elementBoostPercent, chainCount);
    acc.chainDamageIncreasePercent += getValue(a.chainDamageIncreasePercent, chainCount);
    acc.chainEnhance += a.chainEnhance || 0; // チェイン強化は固定値のためそのまま合算
    return acc;
  }, { attackBuffPercent: 0, critRateBuffPercent: 0, critDamageBuffPercent: 0, enhancePercent: 0, elementBoostPercent: 0, chainDamageIncreasePercent: 0, chainEnhance: 0 });
}

// skill: スキル本体, level: getEffectiveLevel()の結果, inputStats: 都度入力ステータス(elementDamage=属性ダメージ%含む)
// battleBuffs: { allySources: [...選択されたバフキャラのallyBuff(区間配列)], manual: {attack,critRate,critDamage,enhance,elementBoost,chainIncrease,chainEnhance,energyGuardBonus}(ボスから貰えるバフ・手動固定値) }
// boss: { totalHP } (計算スロット内で都度入力。enemyTotalHP参照スキルの時のみ使用)
// part: このスロットで都度入力する部位(defense等は{from,value}配列, startingChainCountも部位ごとに都度入力)
// elementMode: 'advantage'(有利属性) | 'neutral'(属性相性無) | 'disadvantage'(不利属性)
//
// ★しきい値判定について: skillMultiplier/enhance/elementBoost/chainDamageIncrease/自己バフ/配布バフの
//   「n:値」の n は「攻撃回数」ではなく「このヒットの時点で既に貯まっているチェイン数」で判定する。
//   (例: 6:70 と設定した場合、6チェイン以上貯まった状態で行った攻撃から70%になる。
//    このヒット自体が生み出すチェインの増加分は、このヒットの判定には含まれない)
function calcDamage(skill, level, inputStats, battleBuffs, boss, part, elementMode, attackerAttribute, targetCount) {
  // エナジーガード付与バフ(自己・配布・ボスから貰えるバフの手動値)を合算し、EG自動算出に上乗せする
  const allyEnergyGuardBonusTotal = battleBuffs.allySources.reduce((s, a) => s + (a.energyGuardBonus || 0), 0);
  const egBonus = (level.selfEnergyGuardBonus || 0) + allyEnergyGuardBonusTotal + (battleBuffs.manual.energyGuardBonus || 0);
  const base = getBaseValue(skill.referenceFormula, inputStats, boss, egBonus);
  const isMagic = skill.damageType === 'magic';
  const manual = battleBuffs.manual;
  const vulnField = ATTRIBUTE_VULN_FIELD[attackerAttribute]; // 攻撃キャラの属性に対応する脆弱フィールド名

  // チェイン強化: 1回の攻撃で本来+1のところ、+(1+チェイン強化)チェイン貯まるようになる
  const allyChainEnhanceTotal = battleBuffs.allySources.reduce((s, a) => s + (a.chainEnhance || 0), 0);
  const chainIncrementPerHit = 1 + (level.selfChainEnhance || 0) + allyChainEnhanceTotal + (manual.chainEnhance || 0);

  // 属性相性による補正
  const elementDamageStat = Number(inputStats.elementDamage) || 0;
  const resistanceMult = elementMode === 'disadvantage' ? 0.5 : 1; // 不利属性: 属性耐性により半減

  // 命中数(対象数)ボーナス: 登録した部位数を「敵に当たる数」とみなす
  const hitCountMult = 1 + (skill.hitCountBonusPercent || 0) * (targetCount || 1) / 100;
  // 自己バフ数・消費SP依存ボーナス(計算時の手動入力値を使用)
  const buffCountMult = 1 + (skill.buffCountBonusPercent || 0) * (Number(inputStats.buffCount) || 0) / 100;
  const spCostMult = 1 + (skill.spCostBonusPercent || 0) * (Number(inputStats.spCost) || 0) / 100;
  const conditionalMult = hitCountMult * buffCountMult * spCostMult;

  let general = 0, fixed = 0, pure = 0;
  let firstHitCritRate = 0;

  for (let hit = 1; hit <= level.maxHits; hit++) {
    // このヒット時点のチェイン数 = 開始チェイン数 + 「これまでの」ヒットで積み上がった分
    // (このヒット自体で貯まる分は、このヒットのバフには反映されない=次のヒットから反映)
    const chainCount = (part.startingChainCount || 0) + (hit - 1) * chainIncrementPerHit;

    // チェイン倍数条件ボーナス(例: チェインが3の倍数の時だけダメージ上昇)
    const chainMultipleMet = skill.chainMultipleOf > 0 && chainCount > 0 && Math.floor(chainCount) % skill.chainMultipleOf === 0;
    const chainMultipleMult = chainMultipleMet ? (1 + (skill.chainMultipleBonusPercent || 0) / 100) : 1;

    // スタック型自己バフ(加速など): 攻撃の度に+1スタック、最大値まで積み上がる
    let stackAttackBonus = 0, stackChainIncBonus = 0;
    if (skill.selfStackBuffEnabled) {
      const startStacks = Number(inputStats.startStacks) || 0;
      const currentStacks = skill.selfStackMax > 0 ? Math.min(skill.selfStackMax, startStacks + (hit - 1)) : (startStacks + (hit - 1));
      stackAttackBonus = (skill.selfStackPerStackAttackPercent || 0) * currentStacks;
      if (skill.selfStackThreshold > 0 && currentStacks >= skill.selfStackThreshold) {
        stackChainIncBonus = skill.selfStackThresholdChainIncreaseBonus || 0;
      }
    }

    const allySum = sumAllyBuffsAtChain(battleBuffs.allySources, skill, chainCount);

    const totalCritRate = (Number(inputStats.critRate) || 0) + manual.critRate + allySum.critRateBuffPercent + getValue(level.selfBuff?.critRateBuffPercent || [], chainCount);
    const overCap = Math.max(0, totalCritRate - 100);
    const critDmg = (Number(inputStats.critDamage) || 0) + overCap * 6 + manual.critDamage + allySum.critDamageBuffPercent + getValue(level.selfBuff?.critDamageBuffPercent || [], chainCount);
    if (hit === 1) firstHitCritRate = totalCritRate;

    const buff = manual.attack + allySum.attackBuffPercent + getValue(level.selfBuff?.attackBuffPercent || [], chainCount) + stackAttackBonus;
    // メインターゲット時は「専用倍率を使う」設定がONなら、基本のスキル倍率の代わりにメインターゲット用倍率を使う(加算ではなく置き換え)
    const useMainTargetMult = part.isMainTarget && skill.hasMainTargetOverride;
    const mult = useMainTargetMult ? getValue(level.mainTargetSkillMultiplier, chainCount) : getValue(level.skillMultiplier, chainCount);
    // バフ解除攻撃: ボスのバリア/防御力バフ/魔法抵抗バフは1撃目だけ有効(2撃目以降は解除された扱い)
    // デバフ付与攻撃: このスキル自身が付与するデバフは2撃目以降だけ有効
    const isFirstHit = hit === 1;
    const buffRemovalActive = skill.isBuffRemovalAttack && isFirstHit;
    const debuffApplyActive = skill.isDebuffApplyAttack && !isFirstHit;
    const rawDefenseBuff = buffRemovalActive ? (isMagic ? (part.magicResistBuffPercent || 0) : (part.defenseBuffPercent || 0)) : 0;
    const rawDefense = (isMagic ? getValue(part.magicResist, chainCount) : getValue(part.defense, chainCount)) + rawDefenseBuff;
    const defenseReductionDebuff = debuffApplyActive ? (isMagic ? (skill.debuffMagicResistReduction || 0) : (skill.debuffDefenseReduction || 0)) : 0;
    const baseDefenseReduction = isMagic ? getValue(part.magicResistReduction, chainCount) : getValue(part.defenseReduction, chainCount);
    const defenseReduction = Math.min(100, baseDefenseReduction + defenseReductionDebuff); // 防御/魔法抵抗軽減デバフ: それぞれ独立して削る(マイナスにはならない)
    const defense = rawDefense * (1 - defenseReduction / 100);
    const barrierBuff = buffRemovalActive ? (part.barrierBuffPercent || 0) : 0;
    const barrier = getValue(part.barrier, chainCount) + barrierBuff;
    const enhance = manual.enhance + allySum.enhancePercent + getValue(level.enhance, chainCount);
    const typeSpecificVuln = isMagic ? getValue(part.magicVulnerability, chainCount) : getValue(part.physicalVulnerability, chainCount);
    const typeSpecificVulnDebuff = debuffApplyActive ? (isMagic ? (skill.debuffMagicVulnerability || 0) : (skill.debuffPhysicalVulnerability || 0)) : 0;
    const genericVuln = getValue(part.vulnerability, chainCount) + (debuffApplyActive ? (skill.debuffVulnerability || 0) : 0); // 汎用脆弱: 物理/魔法どちらにも常時有効
    const summonVuln = skill.isSummonDamage ? (getValue(part.summonVulnerability, chainCount) + (debuffApplyActive ? (skill.debuffSummonVulnerability || 0) : 0)) : 0;
    const vulnerability = typeSpecificVuln + typeSpecificVulnDebuff + genericVuln + summonVuln;
    const debuffField = ATTRIBUTE_DEBUFF_FIELD[attackerAttribute];
    const elementVulnDebuff = (debuffApplyActive && debuffField) ? (skill[debuffField] || 0) : 0;
    const elementVuln = (vulnField ? getValue(part[vulnField], chainCount) : 0) + elementVulnDebuff; // 属性脆弱: 攻撃キャラの属性に対応するものが常に有効(+デバフ付与攻撃の2撃目以降分)
    const elementBoostRaw = manual.elementBoost + allySum.elementBoostPercent + getValue(level.elementBoost, chainCount);
    // 属性強化バフ・属性ダメージ%は「有利属性」の時だけ有効
    const elementBoost = elementMode === 'advantage' ? (elementBoostRaw + elementDamageStat) : 0;
    const receivedChainInc = getValue(part.receivedChainDamageIncrease, chainCount) + (debuffApplyActive ? (skill.debuffChainDamageIncrease || 0) : 0); // 受けるチェインダメージ増加: 常時有効
    const chainAdd = manual.chainIncrease + allySum.chainDamageIncreasePercent + getValue(level.chainDamageIncrease, chainCount) + receivedChainInc + stackChainIncBonus;
    const weakSpot = part.weakSpot;
    const otherMult = 1 + (level.otherAdjustment || 0) / 100;
    const hitMult = otherMult * resistanceMult * conditionalMult * chainMultipleMult;

    let step2 = roundDown(base * (1 + buff / 100));
    step2 = roundDown(step2 * mult / 100);

    let g = step2 * (1 + critDmg / 100);
    g = g * (1 - defense / 100);
    g = roundDown(g * (1 - barrier / 100) * (1 + (enhance + vulnerability + elementVuln) / 100));
    g = roundDown(g * (1 + elementBoost / 100));
    g = g * (1 + (10 + chainAdd) / 100 * chainCount);
    g = roundDown(g * weakSpot / 100 * hitMult);
    general += roundDown(g);

    let f = roundDown(step2 * (1 + enhance / 100));
    f = roundDown(f * (1 + elementBoost / 100));
    f = f * (1 + (10 + chainAdd) / 100 * chainCount);
    f = roundDown(f * weakSpot / 100 * hitMult);
    fixed += roundDown(f);

    let p2 = roundDown(step2 * (1 + (enhance + vulnerability + elementVuln) / 100));
    p2 = roundDown(p2 * (1 + elementBoost / 100));
    p2 = p2 * (1 + critDmg / 100);
    p2 = p2 * (1 + (10 + chainAdd) / 100 * chainCount);
    p2 = roundDown(p2 * weakSpot / 100 * hitMult);
    pure += roundDown(p2);
  }

  return { general, fixed, pure, maxHits: level.maxHits, totalCritRate: firstHitCritRate };
}

// 有利属性・属性相性無・不利属性の3パターンをまとめて計算する
function calcDamageAllModes(skill, level, inputStats, battleBuffs, boss, part, attackerAttribute, targetCount) {
  return {
    advantage: calcDamage(skill, level, inputStats, battleBuffs, boss, part, 'advantage', attackerAttribute, targetCount),
    neutral: calcDamage(skill, level, inputStats, battleBuffs, boss, part, 'neutral', attackerAttribute, targetCount),
    disadvantage: calcDamage(skill, level, inputStats, battleBuffs, boss, part, 'disadvantage', attackerAttribute, targetCount)
  };
}

// 属性相性表: キー(攻撃側属性) → 値(その属性が有利を取る相手の属性)
// 水は火に有利・火は風に有利・風は水に有利(三すくみ)。光と闇はお互いに有利(属性耐性0)。
const ELEMENT_ADVANTAGE_MAP = { '水': '火', '火': '風', '風': '水', '光': '闇', '闇': '光' };

// attackerAttr(攻撃側の属性) と bossAttr(ボスの属性) から、有利/相性無/不利を自動判定する
function getElementMode(attackerAttr, bossAttr) {
  if (!attackerAttr || !bossAttr) return null;
  if (ELEMENT_ADVANTAGE_MAP[attackerAttr] === bossAttr) return 'advantage';
  if (ELEMENT_ADVANTAGE_MAP[bossAttr] === attackerAttr) return 'disadvantage';
  return 'neutral';
}
const ELEMENT_MODE_LABEL = { advantage: '有利属性', neutral: '属性相性無', disadvantage: '不利属性' };

// ==================================================================
// 部位の都度入力(計算スロット内で共通利用)
// ==================================================================
function blankPart() {
  return {
    _uid: uid(), name: '新しい部位', weakSpot: 100, startingChainCount: 0,
    defense: [{ from: 1, value: 0 }], magicResist: [{ from: 1, value: 0 }],
    defenseReduction: [{ from: 1, value: 0 }],
    magicResistReduction: [{ from: 1, value: 0 }],
    physicalVulnerability: [{ from: 1, value: 0 }], magicVulnerability: [{ from: 1, value: 0 }],
    vulnerability: [{ from: 1, value: 0 }], // 汎用脆弱: 物理/魔法どちらのダメージにも常時有効
    summonVulnerability: [{ from: 1, value: 0 }], // 召喚獣脆弱: 召喚獣ダメージのスキルの時だけ有効
    receivedChainDamageIncrease: [{ from: 1, value: 0 }], // 受けるチェインダメージ増加: 常時有効
    barrier: [{ from: 1, value: 0 }],
    fireVulnerability: [{ from: 1, value: 0 }], waterVulnerability: [{ from: 1, value: 0 }],
    windVulnerability: [{ from: 1, value: 0 }], lightVulnerability: [{ from: 1, value: 0 }], darkVulnerability: [{ from: 1, value: 0 }],
    isMainTarget: false,
    barrierBuffPercent: 0, defenseBuffPercent: 0, magicResistBuffPercent: 0 // バフ解除攻撃の時のみ使用: 1撃目だけ有効、2撃目以降は解除される
  };
}

// キャラの属性(火/水/風/光/闇)から、ボス部位のどの属性脆弱フィールドを見るかを決める
const ATTRIBUTE_VULN_FIELD = { '火': 'fireVulnerability', '水': 'waterVulnerability', '風': 'windVulnerability', '光': 'lightVulnerability', '闇': 'darkVulnerability' };
// 属性ごとの絵文字(キャラ名の前に表示する)
const ATTRIBUTE_EMOJI = { '火': '🔥', '水': '💧', '風': '🍃', '光': '🌟', '闇': '🟣' };
function attrCharName(name, attribute) { return `${ATTRIBUTE_EMOJI[attribute] || ''}${name}`; }
// デバフ付与攻撃(2撃目以降)で属性脆弱を付与する場合、攻撃キャラの属性に応じてどのスキル項目を見るか
const ATTRIBUTE_DEBUFF_FIELD = { '火': 'debuffFireVulnerability', '水': 'debuffWaterVulnerability', '風': 'debuffWindVulnerability', '光': 'debuffLightVulnerability', '闇': 'debuffDarkVulnerability' };

function partBlockHtml(p, radioGroupName, showBuffRemovalFields) {
  return `
  <div class="partBlock" data-part="${p._uid}">
    <div class="partHead">
      <input type="text" class="f-partName" value="${escapeHtml(p.name)}" placeholder="部位名">
      <label>弱点倍率(100+WEAK%)</label>
      <input type="number" class="f-weakSpot" value="${p.weakSpot}" style="max-width:100px;">
      <label>開始チェイン数</label>
      <input type="number" class="f-startChain" value="${p.startingChainCount || 0}" style="max-width:80px;">
      <label class="checkLabel"><input type="radio" name="${radioGroupName}" class="f-isMainTarget" ${p.isMainTarget ? 'checked' : ''}> メインターゲット</label>
      <button class="small danger f-removePart" type="button">部位を削除</button>
    </div>
    <div class="gridHint">各項目は「6:70」形式で「チェイン数6以上貯まっている状態の攻撃から70%に変わる」を表現できます(バリアが途中で割れる等)</div>
    <div class="rowFields">
      <div class="formField"><label>物理防御%</label><input type="text" class="f-defense" value="${serializeIntervals(p.defense)}"></div>
      <div class="formField"><label>魔法抵抗%</label><input type="text" class="f-magicResist" value="${serializeIntervals(p.magicResist)}"></div>
      <div class="formField"><label>防御軽減デバフ%(防御力を削る)</label><input type="text" class="f-defenseReduction" value="${serializeIntervals(p.defenseReduction)}"></div>
      <div class="formField"><label>魔法抵抗軽減デバフ%(魔法抵抗を削る)</label><input type="text" class="f-magicResistReduction" value="${serializeIntervals(p.magicResistReduction)}"></div>
      <div class="formField"><label>脆弱%(汎用・物理魔法どちらにも有効)</label><input type="text" class="f-vulnerability" value="${serializeIntervals(p.vulnerability)}"></div>
      <div class="formField"><label>物理脆弱%</label><input type="text" class="f-physicalVulnerability" value="${serializeIntervals(p.physicalVulnerability)}"></div>
      <div class="formField"><label>魔法脆弱%</label><input type="text" class="f-magicVulnerability" value="${serializeIntervals(p.magicVulnerability)}"></div>
      <div class="formField"><label>召喚獣脆弱%(召喚獣ダメージのスキルの時だけ有効)</label><input type="text" class="f-summonVulnerability" value="${serializeIntervals(p.summonVulnerability)}"></div>
      <div class="formField"><label>受けるチェインダメージ増加%</label><input type="text" class="f-receivedChainDamageIncrease" value="${serializeIntervals(p.receivedChainDamageIncrease)}"></div>
      <div class="formField"><label>バリア%</label><input type="text" class="f-barrier" value="${serializeIntervals(p.barrier)}"></div>
    </div>
    <div class="detail">属性脆弱(攻撃キャラの属性に応じて、該当する1つだけが自動で適用されます)</div>
    <div class="rowFields">
      <div class="formField"><label>火脆弱%</label><input type="text" class="f-fireVulnerability" value="${serializeIntervals(p.fireVulnerability)}"></div>
      <div class="formField"><label>水脆弱%</label><input type="text" class="f-waterVulnerability" value="${serializeIntervals(p.waterVulnerability)}"></div>
      <div class="formField"><label>風脆弱%</label><input type="text" class="f-windVulnerability" value="${serializeIntervals(p.windVulnerability)}"></div>
      <div class="formField"><label>光脆弱%</label><input type="text" class="f-lightVulnerability" value="${serializeIntervals(p.lightVulnerability)}"></div>
      <div class="formField"><label>闇脆弱%</label><input type="text" class="f-darkVulnerability" value="${serializeIntervals(p.darkVulnerability)}"></div>
    </div>
    ${showBuffRemovalFields ? `
    <div class="detail">バフ解除攻撃選択中: 現在ボスにかかっているバフを入力してください(1撃目だけ有効、2撃目以降は解除された扱いになります)</div>
    <div class="rowFields">
      <div class="formField"><label>バリアバフ%(解除対象)</label><input type="number" class="f-barrierBuffPercent" value="${p.barrierBuffPercent || 0}"></div>
      <div class="formField"><label>防御力バフ%(解除対象)</label><input type="number" class="f-defenseBuffPercent" value="${p.defenseBuffPercent || 0}"></div>
      <div class="formField"><label>魔法抵抗バフ%(解除対象)</label><input type="number" class="f-magicResistBuffPercent" value="${p.magicResistBuffPercent || 0}"></div>
    </div>` : ''}
  </div>`;
}

function bindPartBlockEvents(p, partList, rerender) {
  const block = document.querySelector(`[data-part="${p._uid}"]`);
  if (!block) return;
  block.querySelector('.f-partName').addEventListener('input', e => p.name = e.target.value);
  block.querySelector('.f-weakSpot').addEventListener('input', e => p.weakSpot = Number(e.target.value) || 0);
  block.querySelector('.f-startChain').addEventListener('input', e => p.startingChainCount = Number(e.target.value) || 0);
  block.querySelector('.f-isMainTarget').addEventListener('change', () => {
    partList.forEach(x => x.isMainTarget = false);
    p.isMainTarget = true;
  });
  block.querySelector('.f-removePart').addEventListener('click', () => {
    const i = partList.findIndex(x => x._uid === p._uid);
    if (i >= 0) partList.splice(i, 1);
    rerender();
  });
  block.querySelector('.f-defense').addEventListener('input', e => p.defense = parseIntervals(e.target.value));
  block.querySelector('.f-magicResist').addEventListener('input', e => p.magicResist = parseIntervals(e.target.value));
  block.querySelector('.f-defenseReduction').addEventListener('input', e => p.defenseReduction = parseIntervals(e.target.value));
  block.querySelector('.f-magicResistReduction').addEventListener('input', e => p.magicResistReduction = parseIntervals(e.target.value));
  block.querySelector('.f-vulnerability').addEventListener('input', e => p.vulnerability = parseIntervals(e.target.value));
  block.querySelector('.f-physicalVulnerability').addEventListener('input', e => p.physicalVulnerability = parseIntervals(e.target.value));
  block.querySelector('.f-magicVulnerability').addEventListener('input', e => p.magicVulnerability = parseIntervals(e.target.value));
  block.querySelector('.f-summonVulnerability').addEventListener('input', e => p.summonVulnerability = parseIntervals(e.target.value));
  block.querySelector('.f-receivedChainDamageIncrease').addEventListener('input', e => p.receivedChainDamageIncrease = parseIntervals(e.target.value));
  block.querySelector('.f-barrier').addEventListener('input', e => p.barrier = parseIntervals(e.target.value));
  block.querySelector('.f-fireVulnerability').addEventListener('input', e => p.fireVulnerability = parseIntervals(e.target.value));
  block.querySelector('.f-waterVulnerability').addEventListener('input', e => p.waterVulnerability = parseIntervals(e.target.value));
  block.querySelector('.f-windVulnerability').addEventListener('input', e => p.windVulnerability = parseIntervals(e.target.value));
  block.querySelector('.f-lightVulnerability').addEventListener('input', e => p.lightVulnerability = parseIntervals(e.target.value));
  block.querySelector('.f-darkVulnerability').addEventListener('input', e => p.darkVulnerability = parseIntervals(e.target.value));
  const barrierBuffInp = block.querySelector('.f-barrierBuffPercent');
  if (barrierBuffInp) barrierBuffInp.addEventListener('input', e => p.barrierBuffPercent = Number(e.target.value) || 0);
  const defenseBuffInp = block.querySelector('.f-defenseBuffPercent');
  if (defenseBuffInp) defenseBuffInp.addEventListener('input', e => p.defenseBuffPercent = Number(e.target.value) || 0);
  const magicResistBuffInp = block.querySelector('.f-magicResistBuffPercent');
  if (magicResistBuffInp) magicResistBuffInp.addEventListener('input', e => p.magicResistBuffPercent = Number(e.target.value) || 0);
}

// ==================================================================
// 7.5章: 計算タブ(スロットUI)
// ==================================================================
let slotCounter = 0;

function statInputLabel(stat) {
  return {
    attack: '攻撃力', magicAttack: '魔法力', selfMaxHP: '自身最大HP', energyGuard: 'エナジーガード',
    specialConditionAttack: '特殊条件攻撃', specialConditionMagic: '特殊条件魔法'
  }[stat] || stat;
}

function addSlot(snapshot) {
  slotCounter++;
  const slotId = 'slot' + slotCounter;
  const el = document.createElement('div');
  el.className = 'calcSlot';
  el.id = slotId;
  el._parts = []; // このスロット固有の部位リスト(都度入力)
  el.innerHTML = `
    <div class="slotHead">
      <h3>計算スロット #${slotCounter}</h3>
      <button class="small danger f-removeSlot" type="button" style="margin-left:auto;">スロットを閉じる</button>
    </div>
    <div class="rowFields">
      <div class="formField"><label>属性で絞り込み</label><select class="f-slotAttrFilter">
        <option value="">すべて</option>
        <option value="火">🔥火</option><option value="水">💧水</option><option value="風">🍃風</option><option value="光">🌟光</option><option value="闇">🟣闇</option>
      </select></div>
      <div class="formField"><label>キャラクター</label><select class="f-slotChar"><option value="">選択してください</option></select></div>
      <div class="formField"><label>スキル</label><select class="f-slotSkill"><option value="">-</option></select></div>
      <div class="formField"><label>凸</label><select class="f-slotCopies">${[0,1,2,3,4,5].map(n=>`<option value="${n}">${n}凸</option>`).join('')}</select></div>
      <div class="formField"><label>バースト</label><select class="f-slotBurst">${[0,1,2,3].map(n=>`<option value="${n}">バースト${n}</option>`).join('')}</select></div>
    </div>
    <div class="formField"><label>潜在力(取得済みにチェック☑でダメ計に反映)</label><div class="f-potentialsArea buffList"></div></div>
    <div class="f-skillInfo resultCard" style="display:none;"></div>
    <div class="f-referenceInputs rowFields"></div>
    <div class="rowFields">
      <div class="formField"><label>クリ率(ステータス画面値・%)</label><input type="number" class="f-critRate" value="0"></div>
      <div class="formField"><label>クリダメ(ステータス画面値・%)</label><input type="number" class="f-critDamage" value="0"></div>
      <div class="formField"><label>属性ダメージ(ステータス画面値・%)</label><input type="number" class="f-elementDamage" value="0"></div>
    </div>
    <div class="f-conditionalInputs rowFields"></div>

    <h3>バフキャラ選択(対象スキルを打つ時にかかってるものだけ入力)</h3>
    <div class="f-buffList buffList"><div class="empty">配布バフを持つスキルがまだ登録されていません。</div></div>

    <h3>ボスから貰えるバフ＆外部バフ(対象スキルを打つ時にかかってるものだけ入力)</h3>
    <div class="rowFields">
      <div class="formField"><label>攻撃バフ%</label><input type="number" class="f-bossBuffAttack" value="0"></div>
      <div class="formField"><label>クリ率バフ%</label><input type="number" class="f-bossBuffCrit" value="0"></div>
      <div class="formField"><label>クリダメバフ%</label><input type="number" class="f-bossBuffCritDamage" value="0"></div>
      <div class="formField"><label>増強%</label><input type="number" class="f-bossBuffEnhance" value="0"></div>
      <div class="formField"><label>属性強化%</label><input type="number" class="f-bossBuffElement" value="0"></div>
      <div class="formField"><label>チェイン増加%</label><input type="number" class="f-bossBuffChain" value="0"></div>
      <div class="formField"><label>チェイン強化</label><input type="number" class="f-bossBuffChainEnhance" value="0"></div>
      <div class="formField"><label>エナガ付与(固定値)</label><input type="number" class="f-bossBuffEgBonus" value="0"></div>
    </div>

    <h3>対象ボス・部位(計算したいターンに対象スキルが当たる分の部位だけを追加)</h3>
    <div class="formField">
      <label>ボス属性(選ぶと有利/相性無/不利を自動判定します)</label>
      <select class="f-bossAttribute">
        <option value="">未設定(3パターンとも表示)</option>
        <option value="火">火</option><option value="水">水</option><option value="風">風</option><option value="光">光</option><option value="闇">闇</option>
      </select>
    </div>
    <div class="f-partsArea"></div>
    <button class="small f-addPart" type="button">+ 部位を追加</button>

    <div style="margin-top:10px;">
      <button class="primary f-calcBtn" type="button">計算する</button>
    </div>
    <div class="f-critWarning"></div>
    <div class="f-resultArea"></div>
    <div class="rowFields" style="margin-top:8px;">
      <div class="formField"><label>保存ラベル</label><input type="text" class="f-saveLabel" placeholder="例：火弱点モンチェ3ターン目"></div>
      <div class="formField" style="align-self:end;"><button class="f-saveResultBtn" type="button">この結果を保存する</button></div>
    </div>
    <div class="f-saveStatus status"></div>
  `;
  document.getElementById('slotsArea').appendChild(el);
  bindSlotEvents(el);
  populateSlotCharSelect(el);
  renderSlotBuffList(el);
  renderSlotParts(el);
  if (snapshot) applySnapshotToSlot(el, snapshot);
  return el;
}

document.getElementById('addSlotBtn').addEventListener('click', () => addSlot());
document.getElementById('duplicateSlotBtn').addEventListener('click', () => {
  const slots = document.querySelectorAll('#slotsArea .calcSlot');
  if (!slots.length) { addSlot(); return; }
  const lastSlot = slots[slots.length - 1];
  const cur = currentSlotSkill(lastSlot);
  if (!cur) { addSlot(); return; }
  const snapshot = buildSnapshot(lastSlot, cur);
  addSlot(snapshot);
});

function populateSlotCharSelect(el) {
  const sel = el.querySelector('.f-slotChar');
  const attrFilter = el.querySelector('.f-slotAttrFilter').value;
  const damageChars = charactersCache.filter(c =>
    (c.skills || []).some(s => s.dealsDamage) && (!attrFilter || c.attribute === attrFilter)
  );
  sel.innerHTML = '<option value="">選択してください</option>' +
    damageChars.map(c => `<option value="${c.id}">${escapeHtml(attrCharName(c.name, c.attribute))}</option>`).join('');
}

function renderSlotBuffList(el) {
  const wrap = el.querySelector('.f-buffList');
  const items = [];
  charactersCache.forEach(c => {
    (c.skills || []).forEach(s => {
      if (s.grantsAllyBuff) items.push({ charName: c.name, attribute: c.attribute, skill: s });
    });
  });
  if (!items.length) { wrap.innerHTML = '<div class="empty">配布バフを持つスキルがまだ登録されていません。</div>'; return; }
  wrap.innerHTML = items.map((it, i) => `
    <div class="buffItem" data-buff-idx="${i}">
      <label class="checkLabel"><input type="checkbox" class="f-buffCheck"> ${escapeHtml(attrCharName(it.charName, it.attribute))} - ${escapeHtml(it.skill.skillName)}</label>
      凸<select class="f-buffCopies">${[0,1,2,3,4,5].map(n=>`<option value="${n}">${n}</option>`).join('')}</select>
      バースト<select class="f-buffBurst">${[0,1,2,3].map(n=>`<option value="${n}">${n}</option>`).join('')}</select>
      ${(it.skill.potentials || []).map((p, pi) => potentialHasNumericEffect(p) ? `
        <label class="checkLabel"><input type="checkbox" class="f-buffPotential" data-idx="${pi}"> 潜在${pi + 1}${p.description ? '(' + escapeHtml(p.description) + ')' : ''}</label>
      ` : '').join('')}
      ${(it.skill.allyEnergyGuardRefStat && it.skill.allyEnergyGuardRefStat !== 'receiverMaxHP') ? `
        <label>${it.skill.allyEnergyGuardRefStat === 'magicAttack' ? 'このキャラの魔法力' : 'このキャラの最大HP'}
        <input type="number" class="f-buffEgRefValue" style="width:100px;" placeholder="実数値"></label>
      ` : ''}
      ${it.skill.allyEnergyGuardRefStat === 'receiverMaxHP' ? `<span class="detail">(計算しているキャラ自身の最大HP入力値を使用)</span>` : ''}
    </div>`).join('');
  wrap._buffItems = items;
  // 「対象の最大HPを参照」するバフが実際にチェックされた時だけ、自身最大HP欄を表示させるため
  wrap.querySelectorAll('.f-buffCheck').forEach(chk => chk.addEventListener('change', () => renderReferenceInputs(el)));
}

function renderSlotParts(el) {
  const wrap = el.querySelector('.f-partsArea');
  if (!el._parts.length) { wrap.innerHTML = '<div class="empty">部位を追加してください。</div>'; return; }
  const radioGroupName = 'mainTarget-' + el.id;
  const cur = currentSlotSkill(el);
  const showBuffRemovalFields = !!(cur && cur.skill.isBuffRemovalAttack);
  wrap.innerHTML = el._parts.map(p => partBlockHtml(p, radioGroupName, showBuffRemovalFields)).join('');
  el._parts.forEach(p => bindPartBlockEvents(p, el._parts, () => renderSlotParts(el)));
}

function bindSlotEvents(el) {
  el.querySelector('.f-removeSlot').addEventListener('click', () => el.remove());
  el.querySelector('.f-slotAttrFilter').addEventListener('change', () => populateSlotCharSelect(el));
  el.querySelector('.f-slotChar').addEventListener('change', () => populateSlotSkillSelect(el));
  el.querySelector('.f-slotSkill').addEventListener('change', () => {
    renderReferenceInputs(el);
    renderPotentialsArea(el);
    renderSkillInfo(el);
    renderSlotParts(el);
    renderConditionalInputs(el);
  });
  el.querySelector('.f-slotCopies').addEventListener('change', () => renderSkillInfo(el));
  el.querySelector('.f-slotBurst').addEventListener('change', () => renderSkillInfo(el));
  el.querySelector('.f-addPart').addEventListener('click', () => {
    el._parts.push(blankPart());
    renderSlotParts(el);
  });
  el.querySelector('.f-calcBtn').addEventListener('click', () => runSlotCalc(el));
  el.querySelector('.f-saveResultBtn').addEventListener('click', () => saveSlotResult(el));
}

function getSelectedPotentialIdxs(el) {
  const idxs = [];
  el.querySelectorAll('.f-potentialCheck').forEach(chk => {
    if (chk.checked) idxs.push(Number(chk.dataset.idx));
  });
  return idxs;
}

function renderPotentialsArea(el) {
  const wrap = el.querySelector('.f-potentialsArea');
  const cur = currentSlotSkill(el);
  if (!cur || !cur.skill.potentials) { wrap.innerHTML = ''; return; }
  wrap.innerHTML = cur.skill.potentials.map((p, i) => `
    <label class="checkLabel">
      <input type="checkbox" class="f-potentialCheck" data-idx="${i}">
      潜在力${i + 1}${p.description ? '：' + escapeHtml(p.description) : ''}
    </label>`).join('');
  wrap.querySelectorAll('.f-potentialCheck').forEach(chk => {
    chk.addEventListener('change', () => renderSkillInfo(el));
  });
}

function renderSkillInfo(el) {
  const box = el.querySelector('.f-skillInfo');
  const cur = currentSlotSkill(el);
  if (!cur) { box.style.display = 'none'; return; }
  const copies = Number(el.querySelector('.f-slotCopies').value);
  const burst = Number(el.querySelector('.f-slotBurst').value);
  const potentialIdxs = getSelectedPotentialIdxs(el);
  const level = getEffectiveLevel(cur.skill, copies, burst, potentialIdxs);

  const items = [
    { label: '攻撃回数', value: level.maxHits, unit: '回', alwaysShow: true },
    { label: 'スキル倍率(基本値)', value: getValue(level.skillMultiplier, 1), unit: '%', alwaysShow: true },
    { label: '増強', value: getValue(level.enhance, 1), unit: '%' },
    { label: '属性強化', value: getValue(level.elementBoost, 1), unit: '%' },
    { label: 'チェイン増加', value: getValue(level.chainDamageIncrease, 1), unit: '%' },
    { label: 'メインターゲット用倍率(基本値)', value: cur.skill.hasMainTargetOverride ? getValue(level.mainTargetSkillMultiplier, 1) : 0, unit: '%' },
    { label: 'その他補正', value: level.otherAdjustment || 0, unit: '%' },
    { label: '自己バフ:攻撃', value: getValue(level.selfBuff.attackBuffPercent, 1), unit: '%' },
    { label: '自己バフ:クリ率', value: getValue(level.selfBuff.critRateBuffPercent, 1), unit: '%' },
    { label: '自己バフ:クリダメ', value: getValue(level.selfBuff.critDamageBuffPercent, 1), unit: '%' },
    { label: '自己バフ:チェイン強化', value: level.selfChainEnhance || 0, unit: '' }
  ];
  const line = items.filter(it => it.alwaysShow || it.value !== 0)
    .map(it => `${it.label}: ${it.value}${it.unit}`).join(' / ');
  const chainNote = '<div class="detail">※数値はチェイン数1(貯まっていない状態)時点の基本値です。実際の変化タイミングはチェイン数基準で計算されます。</div>';

  const descs = potentialIdxs.map(i => cur.skill.potentials[i]?.description).filter(Boolean);
  box.style.display = 'block';
  box.innerHTML = `計算対象スキル：<strong>${escapeHtml(cur.skill.skillName)}</strong>(${copies}凸${burst}バースト${potentialIdxs.length ? '・潜在力' + potentialIdxs.map(i=>i+1).join(',') : ''})<br>
    ${line}
    ${descs.length ? `<div class="detail">潜在力の効果: ${descs.map(escapeHtml).join(' / ')}</div>` : ''}
    ${chainNote}`;
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
  if (!c) {
    sel.innerHTML = '<option value="">-</option>';
    renderReferenceInputs(el);
    renderPotentialsArea(el);
    renderSkillInfo(el);
    renderSlotParts(el);
    renderConditionalInputs(el);
    return;
  }
  sel.innerHTML = c.skills.map((s, i) => s.dealsDamage ? `<option value="${i}">${escapeHtml(s.skillName)}</option>` : '').join('');
  renderReferenceInputs(el);
  renderPotentialsArea(el);
  renderSkillInfo(el);
  renderSlotParts(el);
  renderConditionalInputs(el);
}

function renderReferenceInputs(el) {
  const wrap = el.querySelector('.f-referenceInputs');
  const cur = currentSlotSkill(el);
  if (!cur || !cur.skill.referenceFormula) { wrap.innerHTML = ''; return; }
  let stats = [...new Set(cur.skill.referenceFormula.map(t => t.stat))];
  // エナジーガードは自身の最大HPから自動算出するため、手入力欄は出さず、代わりに自身最大HP欄を必ず出す
  if (stats.includes('energyGuard') && !stats.includes('selfMaxHP')) stats.push('selfMaxHP');
  // 「対象の最大HPを参照」するエナガ付与バフが、実際にチェックされている場合だけ自身最大HP欄を出す
  const buffWrap = el.querySelector('.f-buffList');
  const anyReceiverHPBuff = buffWrap && buffWrap._buffItems ? [...buffWrap.querySelectorAll('.buffItem')].some(item => {
    const idx = Number(item.dataset.buffIdx);
    const checked = item.querySelector('.f-buffCheck')?.checked;
    return checked && buffWrap._buffItems[idx]?.skill.allyEnergyGuardRefStat === 'receiverMaxHP';
  }) : false;
  if (anyReceiverHPBuff && !stats.includes('selfMaxHP')) stats.push('selfMaxHP');
  stats = stats.filter(s => s !== 'energyGuard');

  // 再描画で入力値が消えないよう、今入っている値を先に保持しておく
  const prevValues = {};
  wrap.querySelectorAll('[class^="f-stat-"]').forEach(inp => {
    prevValues[inp.className.replace('f-stat-', '').split(' ')[0]] = inp.value;
  });
  const prevBossHP = wrap.querySelector('.f-bossHP')?.value;

  wrap.innerHTML = stats.map(s => {
    if (s === 'enemyTotalHP') {
      return `<div class="formField"><label>ボスHP(敵全体・5万上限)</label>
        <div style="display:flex; gap:6px;">
          <input type="number" class="f-bossHP" placeholder="例: 32000" value="${prevBossHP || ''}">
          <button class="small f-bossHpCap" type="button">5万超え</button>
        </div>
      </div>`;
    }
    const restored = prevValues[s] != null ? prevValues[s] : 0;
    return `<div class="formField"><label>${statInputLabel(s)}</label><input type="number" class="f-stat-${s}" value="${restored}"></div>`;
  }).join('');
  const capBtn = wrap.querySelector('.f-bossHpCap');
  if (capBtn) capBtn.addEventListener('click', () => { wrap.querySelector('.f-bossHP').value = 50000; });
}

// スキルの特殊条件(バフ数依存/消費SP依存/スタック型自己バフ)に応じて、必要な入力欄だけ表示する
function renderConditionalInputs(el) {
  const wrap = el.querySelector('.f-conditionalInputs');
  const cur = currentSlotSkill(el);
  if (!cur) { wrap.innerHTML = ''; return; }
  const s = cur.skill;
  let html = '';
  if (s.buffCountBonusPercent) {
    html += `<div class="formField"><label>自己バフ数(現在かかっているバフの数)</label><input type="number" class="f-buffCount" value="0"></div>`;
  }
  if (s.spCostBonusPercent) {
    html += `<div class="formField"><label>消費SP(このスキルの消費SP数)</label><input type="number" class="f-spCost" value="0"></div>`;
  }
  if (s.selfStackBuffEnabled) {
    html += `<div class="formField"><label>開始スタック数(攻撃前に既に貯まっている重複数)</label><input type="number" class="f-startStacks" value="0"></div>`;
  }
  wrap.innerHTML = html;
}

function runSlotCalc(el) {
  const cur = currentSlotSkill(el);
  const resultArea = el.querySelector('.f-resultArea');
  const warnArea = el.querySelector('.f-critWarning');
  if (!cur) { resultArea.innerHTML = '<div class="status err">キャラ・スキルを選択してください。</div>'; return; }
  if (!el._parts.length) { resultArea.innerHTML = '<div class="status err">対象部位を最低1つ追加してください。</div>'; return; }

  const copies = Number(el.querySelector('.f-slotCopies').value);
  const burst = Number(el.querySelector('.f-slotBurst').value);
  const potentialIdxs = getSelectedPotentialIdxs(el);
  const level = getEffectiveLevel(cur.skill, copies, burst, potentialIdxs);

  const inputStats = {};
  el.querySelectorAll('[class^="f-stat-"]').forEach(inp => {
    const statName = inp.className.replace('f-stat-', '').split(' ')[0];
    inputStats[statName] = Number(inp.value) || 0;
  });
  inputStats.critRate = Number(el.querySelector('.f-critRate').value) || 0;
  inputStats.critDamage = Number(el.querySelector('.f-critDamage').value) || 0;
  inputStats.elementDamage = Number(el.querySelector('.f-elementDamage').value) || 0;
  const buffCountInp = el.querySelector('.f-buffCount');
  inputStats.buffCount = buffCountInp ? Number(buffCountInp.value) || 0 : 0;
  const spCostInp = el.querySelector('.f-spCost');
  inputStats.spCost = spCostInp ? Number(spCostInp.value) || 0 : 0;
  const startStacksInp = el.querySelector('.f-startStacks');
  inputStats.startStacks = startStacksInp ? Number(startStacksInp.value) || 0 : 0;

  const bossHpInput = el.querySelector('.f-bossHP');
  const boss = { totalHP: bossHpInput ? Number(bossHpInput.value) || 0 : 0 };

  // バフキャラ選択(選ばれたものの effectiveLevel.allyBuff をリストとして保持。評価はcalcDamage内でチェイン数ごとに行う)
  const buffWrap = el.querySelector('.f-buffList');
  const allySources = [];
  buffWrap.querySelectorAll('.buffItem').forEach(item => {
    const idx = Number(item.dataset.buffIdx);
    const checked = item.querySelector('.f-buffCheck').checked;
    if (!checked) return;
    const bCopies = Number(item.querySelector('.f-buffCopies').value);
    const bBurst = Number(item.querySelector('.f-buffBurst').value);
    const bPotentialIdxs = [...item.querySelectorAll('.f-buffPotential')].filter(c => c.checked).map(c => Number(c.dataset.idx));
    const it = buffWrap._buffItems[idx];
    const effLevel = getEffectiveLevel(it.skill, bCopies, bBurst, bPotentialIdxs);
    if (effLevel.allyBuff) {
      // 自分(バフをかけるキャラ)/対象(受け取って計算しているキャラ)のステータスを参照してエナガを付与するタイプのバフ:
      // 参照ステータス実数値 × エナガ%を、固定のエナガ付与に加算する
      if (it.skill.allyEnergyGuardRefStat) {
        const refValue = it.skill.allyEnergyGuardRefStat === 'receiverMaxHP'
          ? (Number(inputStats.selfMaxHP) || 0)
          : (item.querySelector('.f-buffEgRefValue') ? Number(item.querySelector('.f-buffEgRefValue').value) || 0 : 0);
        const percentContribution = Math.floor(refValue * (effLevel.allyBuff.energyGuardPercent || 0) / 100);
        effLevel.allyBuff = { ...effLevel.allyBuff, energyGuardBonus: (effLevel.allyBuff.energyGuardBonus || 0) + percentContribution };
      }
      allySources.push(effLevel.allyBuff);
    }
  });
  const manual = {
    attack: Number(el.querySelector('.f-bossBuffAttack').value) || 0,
    critRate: Number(el.querySelector('.f-bossBuffCrit').value) || 0,
    critDamage: Number(el.querySelector('.f-bossBuffCritDamage').value) || 0,
    enhance: Number(el.querySelector('.f-bossBuffEnhance').value) || 0,
    elementBoost: Number(el.querySelector('.f-bossBuffElement').value) || 0,
    chainIncrease: Number(el.querySelector('.f-bossBuffChain').value) || 0,
    chainEnhance: Number(el.querySelector('.f-bossBuffChainEnhance').value) || 0,
    energyGuardBonus: Number(el.querySelector('.f-bossBuffEgBonus').value) || 0
  };
  const battleBuffs = { allySources, manual };

  const results = el._parts.map(part => {
    const modes = calcDamageAllModes(cur.skill, level, inputStats, battleBuffs, boss, part, cur.character.attribute, el._parts.length);
    return { partName: part.name, ...modes };
  });

  const totalCritRate = results.length ? results[0].advantage.totalCritRate : 0;
  if (totalCritRate < 100) {
    warnArea.innerHTML = `<div class="critWarning">⚠ クリ率${totalCritRate}%(100%未満のためダメージにブレが発生します。クリティカルマラソン推奨)</div>`;
  } else {
    warnArea.innerHTML = `<div class="critOk">クリ率${totalCritRate}%(100%到達済み)</div>`;
  }

  const bossAttribute = el.querySelector('.f-bossAttribute').value;
  const autoMode = getElementMode(cur.character.attribute, bossAttribute);
  const autoNote = autoMode
    ? `<div class="detail">自動判定: ${escapeHtml(cur.character.attribute)}(自分) × ${escapeHtml(bossAttribute)}(ボス) → <strong>${ELEMENT_MODE_LABEL[autoMode]}</strong>(該当列をハイライト)</div>`
    : `<div class="detail">ボス属性が未設定のため、3パターンとも表示しています。</div>`;
  const hl = (mode) => mode === autoMode ? ' class="hlCol"' : '';

  const dmgType = cur.skill.damageOutputType || 'general';
  const dmgTypeLabel = { general: '一般', fixed: '固定', pure: '純粋' }[dmgType];
  const val = (modeResult) => modeResult[dmgType];

  const totals = { advantage: 0, neutral: 0, disadvantage: 0 };
  results.forEach(r => {
    totals.advantage += val(r.advantage);
    totals.neutral += val(r.neutral);
    totals.disadvantage += val(r.disadvantage);
  });

  resultArea.innerHTML = `${autoNote}<div class="detail">攻撃回数: ${level.maxHits}回 / 表示ダメージ種別: ${dmgTypeLabel}(スキル登録時の設定)</div><div class="table-wrap"><table>
    <tr><th>部位</th><th${hl('advantage')}>有利属性</th><th${hl('neutral')}>属性相性無</th><th${hl('disadvantage')}>不利属性</th></tr>
    ${results.map(r => `<tr><td>${escapeHtml(r.partName)}</td>
      <td${hl('advantage')}>${val(r.advantage).toLocaleString()}</td>
      <td${hl('neutral')}>${val(r.neutral).toLocaleString()}</td>
      <td${hl('disadvantage')}>${val(r.disadvantage).toLocaleString()}</td>
    </tr>`).join('')}
    <tr class="totalRow"><td>スキル合計</td>
      <td${hl('advantage')}>${totals.advantage.toLocaleString()}</td>
      <td${hl('neutral')}>${totals.neutral.toLocaleString()}</td>
      <td${hl('disadvantage')}>${totals.disadvantage.toLocaleString()}</td>
    </tr>
  </table></div>`;

  el._lastResult = { results, level, totalCritRate, dmgType, totals };
}

async function saveSlotResult(el) {
  const statusEl = el.querySelector('.f-saveStatus');
  const cur = currentSlotSkill(el);
  if (!cur || !el._lastResult) {
    statusEl.className = 'status err'; statusEl.textContent = '先に「計算する」を実行してください。'; return;
  }
  const label = el.querySelector('.f-saveLabel').value.trim() || `${cur.character.name} - ${cur.skill.skillName}`;
  const inputSnapshot = buildSnapshot(el, cur);
  try {
    await addDoc(resultsCol, {
      label, characterName: cur.character.name, skillName: cur.skill.skillName,
      result: el._lastResult.results, dmgType: el._lastResult.dmgType, totals: el._lastResult.totals, inputSnapshot,
      savedBy: operatorName, savedAt: new Date().toISOString()
    });
    logWrite('resultSave', label);
    statusEl.className = 'status ok'; statusEl.textContent = '保存しました。';
    loadResults();
  } catch (e) {
    statusEl.className = 'status err'; statusEl.textContent = '保存に失敗しました: ' + e.message;
  }
}

function buildSnapshot(el, cur) {
  const inputStats = {};
  el.querySelectorAll('[class^="f-stat-"]').forEach(inp => {
    const statName = inp.className.replace('f-stat-', '').split(' ')[0];
    inputStats[statName] = Number(inp.value) || 0;
  });
  const bossHpInput = el.querySelector('.f-bossHP');
  const buffWrap = el.querySelector('.f-buffList');
  const selectedBuffs = [];
  buffWrap.querySelectorAll('.buffItem').forEach(item => {
    const idx = Number(item.dataset.buffIdx);
    const checked = item.querySelector('.f-buffCheck').checked;
    if (!checked) return;
    selectedBuffs.push({
      idx,
      copies: Number(item.querySelector('.f-buffCopies').value),
      burst: Number(item.querySelector('.f-buffBurst').value),
      potentialIdxs: [...item.querySelectorAll('.f-buffPotential')].filter(c => c.checked).map(c => Number(c.dataset.idx)),
      egRefValue: item.querySelector('.f-buffEgRefValue') ? Number(item.querySelector('.f-buffEgRefValue').value) || 0 : null
    });
  });
  return {
    charId: cur.character.id, skillIdx: cur.character.skills.indexOf(cur.skill),
    copies: Number(el.querySelector('.f-slotCopies').value),
    burst: Number(el.querySelector('.f-slotBurst').value),
    potentialIdxs: getSelectedPotentialIdxs(el),
    inputStats,
    bossHP: bossHpInput ? Number(bossHpInput.value) || 0 : null,
    bossAttribute: el.querySelector('.f-bossAttribute').value,
    critRate: Number(el.querySelector('.f-critRate').value) || 0,
    critDamage: Number(el.querySelector('.f-critDamage').value) || 0,
    elementDamage: Number(el.querySelector('.f-elementDamage').value) || 0,
    buffCount: el.querySelector('.f-buffCount') ? Number(el.querySelector('.f-buffCount').value) || 0 : null,
    spCost: el.querySelector('.f-spCost') ? Number(el.querySelector('.f-spCost').value) || 0 : null,
    startStacks: el.querySelector('.f-startStacks') ? Number(el.querySelector('.f-startStacks').value) || 0 : null,
    selectedBuffs,
    bossBuff: {
      attackBuffPercent: Number(el.querySelector('.f-bossBuffAttack').value) || 0,
      critRateBuffPercent: Number(el.querySelector('.f-bossBuffCrit').value) || 0,
      critDamageBuffPercent: Number(el.querySelector('.f-bossBuffCritDamage').value) || 0,
      enhancePercent: Number(el.querySelector('.f-bossBuffEnhance').value) || 0,
      elementBoostPercent: Number(el.querySelector('.f-bossBuffElement').value) || 0,
      chainDamageIncreasePercent: Number(el.querySelector('.f-bossBuffChain').value) || 0,
      chainEnhance: Number(el.querySelector('.f-bossBuffChainEnhance').value) || 0,
      energyGuardBonus: Number(el.querySelector('.f-bossBuffEgBonus').value) || 0
    },
    parts: el._parts.map(({ _uid, ...rest }) => rest)
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
  renderPotentialsArea(el);
  (snap.potentialIdxs || []).forEach(i => {
    const chk = el.querySelector(`.f-potentialCheck[data-idx="${i}"]`);
    if (chk) chk.checked = true;
  });
  renderSkillInfo(el);
  Object.entries(snap.inputStats || {}).forEach(([k, v]) => {
    const inp = el.querySelector(`.f-stat-${k}`);
    if (inp) inp.value = v;
  });
  const bossHpInput = el.querySelector('.f-bossHP');
  if (bossHpInput && snap.bossHP != null) bossHpInput.value = snap.bossHP;
  el.querySelector('.f-critRate').value = snap.critRate;
  el.querySelector('.f-critDamage').value = snap.critDamage;
  el.querySelector('.f-elementDamage').value = snap.elementDamage || 0;
  renderConditionalInputs(el);
  if (snap.buffCount != null) { const inp = el.querySelector('.f-buffCount'); if (inp) inp.value = snap.buffCount; }
  if (snap.spCost != null) { const inp = el.querySelector('.f-spCost'); if (inp) inp.value = snap.spCost; }
  if (snap.startStacks != null) { const inp = el.querySelector('.f-startStacks'); if (inp) inp.value = snap.startStacks; }
  el.querySelector('.f-bossBuffAttack').value = snap.bossBuff.attackBuffPercent;
  el.querySelector('.f-bossBuffCrit').value = snap.bossBuff.critRateBuffPercent;
  el.querySelector('.f-bossBuffCritDamage').value = snap.bossBuff.critDamageBuffPercent || 0;
  el.querySelector('.f-bossBuffEnhance').value = snap.bossBuff.enhancePercent;
  el.querySelector('.f-bossBuffElement').value = snap.bossBuff.elementBoostPercent;
  el.querySelector('.f-bossBuffChain').value = snap.bossBuff.chainDamageIncreasePercent;
  el.querySelector('.f-bossBuffChainEnhance').value = snap.bossBuff.chainEnhance || 0;
  el.querySelector('.f-bossBuffEgBonus').value = snap.bossBuff.energyGuardBonus || 0;
  el.querySelector('.f-bossAttribute').value = snap.bossAttribute || '';
  el._parts = (snap.parts || []).map(p => ({ ...p, _uid: uid() }));
  renderSlotParts(el);
  (snap.selectedBuffs || []).forEach(sb => {
    const item = el.querySelectorAll('.buffItem')[sb.idx];
    if (!item) return;
    item.querySelector('.f-buffCheck').checked = true;
    item.querySelector('.f-buffCopies').value = sb.copies;
    item.querySelector('.f-buffBurst').value = sb.burst;
    (sb.potentialIdxs || []).forEach(i => {
      const chk = item.querySelector(`.f-buffPotential[data-idx="${i}"]`);
      if (chk) chk.checked = true;
    });
    if (sb.egRefValue != null) {
      const refInput = item.querySelector('.f-buffEgRefValue');
      if (refInput) refInput.value = sb.egRefValue;
    }
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
  const labelFilter = document.getElementById('resultFilterBoss').value.trim();
  const charFilter = document.getElementById('resultFilterChar').value.trim();
  const filtered = list.filter(r =>
    (!labelFilter || r.label.includes(labelFilter)) &&
    (!charFilter || r.characterName.includes(charFilter))
  ).sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));

  const area = document.getElementById('resultsArea');
  if (!filtered.length) { area.innerHTML = '<div class="empty">保存された結果がありません。</div>'; return; }

  area.innerHTML = filtered.map(r => {
    const canDelete = (route === 'main' && r.savedBy === operatorName) || isAdmin;
    const dmgTypeLabel = { general: '一般', fixed: '固定', pure: '純粋' }[r.dmgType] || '一般';
    const totalsLine = r.totals
      ? `<div class="detail">スキル合計(${dmgTypeLabel})：有利属性 ${r.totals.advantage.toLocaleString()} / 属性相性無 ${r.totals.neutral.toLocaleString()} / 不利属性 ${r.totals.disadvantage.toLocaleString()}</div>`
      : '';
    const matchedChar = charactersCache.find(c => c.name === r.characterName);
    const displayName = matchedChar ? attrCharName(r.characterName, matchedChar.attribute) : r.characterName;
    return `<div class="resultCard">
      <div><strong>${escapeHtml(r.label)}</strong>　<span class="detail">${escapeHtml(displayName)} - ${escapeHtml(r.skillName)}</span></div>
      <div class="detail">保存者: ${escapeHtml(r.savedBy)} / ${new Date(r.savedAt).toLocaleString('ja-JP')}</div>
      ${totalsLine}
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
