import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import {
  getFirestore, doc, getDoc, setDoc, collection
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
const goldFarmingCol = collection(db, "goldFarming");
const adminsCol = collection(db, "admins");

const LOGIN_ID_SUFFIX = '@calmeguild.local';
function idToEmail(id) { return id.trim().toLowerCase() + LOGIN_ID_SUFFIX; }

const SESSION_KEY = 'gfg_unlocked';

let isAdmin = false;
let explicitLoginAttempt = false;
let contentData = {
  shopList: { description: '', rows: [] },
  cookingList: { description: '', rows: [] },
  noSellList: { description: '', rows: [] }
};

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : str;
  return div.innerHTML;
}

// ---------- パスワードゲート ----------
async function checkGatePassword(input) {
  const snap = await getDoc(doc(goldFarmingCol, "config"));
  const correct = snap.exists() ? (snap.data().password || '') : '';
  return correct !== '' && input === correct;
}

async function tryUnlock() {
  const statusEl = document.getElementById('gateStatus');
  const input = document.getElementById('gatePassword').value;
  if (!input) { statusEl.className = 'status err'; statusEl.textContent = 'パスワードを入力してください。'; return; }
  try {
    const ok = await checkGatePassword(input);
    if (ok) {
      sessionStorage.setItem(SESSION_KEY, '1');
      showMainContent();
    } else {
      statusEl.className = 'status err';
      statusEl.textContent = 'パスワードが違います。';
    }
  } catch (e) {
    statusEl.className = 'status err';
    statusEl.textContent = '確認に失敗しました: ' + e.message;
  }
}
document.getElementById('gateBtn').addEventListener('click', tryUnlock);
document.getElementById('gatePassword').addEventListener('keydown', (e) => { if (e.key === 'Enter') tryUnlock(); });

async function showMainContent() {
  document.getElementById('gateScreen').style.display = 'none';
  document.getElementById('mainContent').style.display = 'block';
  document.getElementById('connNote').textContent = '読み込み中...';
  await loadContent();
  document.getElementById('connNote').textContent = '';
}

if (sessionStorage.getItem(SESSION_KEY) === '1') {
  showMainContent();
}

// ---------- コンテンツ読み込み ----------
async function loadContent() {
  try {
    const snap = await getDoc(doc(goldFarmingCol, "content"));
    if (snap.exists()) {
      const data = snap.data();
      contentData.shopList = data.shopList || { description: '', rows: [] };
      contentData.cookingList = data.cookingList || { description: '', rows: [] };
      contentData.noSellList = data.noSellList || { description: '', rows: [] };
    }
  } catch (e) {
    console.error('content load error', e);
  }
  renderAll();
}

function renderAll() {
  renderDescription('shopDesc', contentData.shopList.description);
  renderDescription('cookDesc', contentData.cookingList.description);
  renderDescription('noSellDesc', contentData.noSellList.description);
  document.getElementById('shopDescInput').value = contentData.shopList.description || '';
  document.getElementById('cookDescInput').value = contentData.cookingList.description || '';
  document.getElementById('noSellDescInput').value = contentData.noSellList.description || '';
  renderShopTable();
  renderCookTable();
  renderNoSellTable();
}

function renderDescription(elId, text) {
  document.getElementById(elId).textContent = text || '';
}

async function saveContent() {
  await setDoc(doc(goldFarmingCol, "content"), contentData);
}

// ---------- 商店購入推奨リスト ----------
function ingredientCellHtml(name) {
  if (!name) return '';
  const safe = escapeHtml(name);
  const src = `icons/${encodeURIComponent(name)}.png`;
  return `<span class="ingredientCell"><img src="${src}" alt="" onerror="this.style.display='none'">${safe}</span>`;
}

function renderShopTable() {
  const table = document.getElementById('shopTable');
  const rows = contentData.shopList.rows || [];
  let html = `<tr><th>カセット名</th><th>食材</th>${isAdmin ? '<th style="width:110px;">操作</th>' : ''}</tr>`;
  rows.forEach((r, i) => {
    html += `<tr data-i="${i}"><td class="c-cassette">${escapeHtml(r.cassette)}</td><td class="c-ingredient">${ingredientCellHtml(r.ingredient)}</td>`;
    if (isAdmin) html += `<td class="c-actions"><button class="small" data-action="edit-shop" data-i="${i}">編集</button><button class="small danger" data-action="del-shop" data-i="${i}">削除</button></td>`;
    html += `</tr>`;
  });
  table.innerHTML = html;
  bindShopRowActions();
}
function bindShopRowActions() {
  const table = document.getElementById('shopTable');
  table.querySelectorAll('[data-action="edit-shop"]').forEach(btn => {
    btn.addEventListener('click', () => enterShopEditMode(parseInt(btn.dataset.i)));
  });
  table.querySelectorAll('[data-action="del-shop"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('この行を削除しますか?')) return;
      contentData.shopList.rows.splice(parseInt(btn.dataset.i), 1);
      await saveContent();
      renderShopTable();
    });
  });
}
function enterShopEditMode(i) {
  const tr = document.getElementById('shopTable').querySelector(`tr[data-i="${i}"]`);
  const row = contentData.shopList.rows[i];
  tr.querySelector('.c-cassette').innerHTML = `<input type="text" class="e-cassette" value="${escapeHtml(row.cassette)}">`;
  tr.querySelector('.c-ingredient').innerHTML = `<input type="text" class="e-ingredient" value="${escapeHtml(row.ingredient)}">`;
  tr.querySelector('.c-actions').innerHTML = `<button class="primary small e-save">保存</button><button class="small e-cancel">キャンセル</button>`;
  tr.querySelector('.e-cancel').addEventListener('click', () => renderShopTable());
  tr.querySelector('.e-save').addEventListener('click', async () => {
    const cassette = tr.querySelector('.e-cassette').value.trim();
    const ingredient = tr.querySelector('.e-ingredient').value.trim();
    contentData.shopList.rows[i] = { cassette, ingredient };
    await saveContent();
    renderShopTable();
  });
}
document.getElementById('shopAddBtn').addEventListener('click', async () => {
  const cassette = document.getElementById('shopNewCassette').value.trim();
  const ingredient = document.getElementById('shopNewIngredient').value.trim();
  if (!cassette && !ingredient) return;
  contentData.shopList.rows.push({ cassette, ingredient });
  document.getElementById('shopNewCassette').value = '';
  document.getElementById('shopNewIngredient').value = '';
  await saveContent();
  renderShopTable();
});
document.getElementById('shopDescSaveBtn').addEventListener('click', async () => {
  contentData.shopList.description = document.getElementById('shopDescInput').value.trim().slice(0, 200);
  await saveContent();
  renderDescription('shopDesc', contentData.shopList.description);
});

// ---------- 料理推奨リスト ----------
function renderCookTable() {
  const table = document.getElementById('cookTable');
  const rows = contentData.cookingList.rows || [];
  let html = `<tr><th style="width:100px;">優先度</th><th>料理</th>${isAdmin ? '<th style="width:110px;">操作</th>' : ''}</tr>`;
  rows.forEach((r, i) => {
    html += `<tr data-i="${i}"><td class="c-priority">${escapeHtml(r.priority)}</td><td class="c-dish">${escapeHtml(r.dish)}</td>`;
    if (isAdmin) html += `<td class="c-actions"><button class="small" data-action="edit-cook" data-i="${i}">編集</button><button class="small danger" data-action="del-cook" data-i="${i}">削除</button></td>`;
    html += `</tr>`;
  });
  table.innerHTML = html;
  bindCookRowActions();
}
function bindCookRowActions() {
  const table = document.getElementById('cookTable');
  table.querySelectorAll('[data-action="edit-cook"]').forEach(btn => {
    btn.addEventListener('click', () => enterCookEditMode(parseInt(btn.dataset.i)));
  });
  table.querySelectorAll('[data-action="del-cook"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('この行を削除しますか?')) return;
      contentData.cookingList.rows.splice(parseInt(btn.dataset.i), 1);
      await saveContent();
      renderCookTable();
    });
  });
}
function enterCookEditMode(i) {
  const tr = document.getElementById('cookTable').querySelector(`tr[data-i="${i}"]`);
  const row = contentData.cookingList.rows[i];
  tr.querySelector('.c-priority').innerHTML = `<input type="text" class="e-priority" value="${escapeHtml(row.priority)}">`;
  tr.querySelector('.c-dish').innerHTML = `<input type="text" class="e-dish" value="${escapeHtml(row.dish)}">`;
  tr.querySelector('.c-actions').innerHTML = `<button class="primary small e-save">保存</button><button class="small e-cancel">キャンセル</button>`;
  tr.querySelector('.e-cancel').addEventListener('click', () => renderCookTable());
  tr.querySelector('.e-save').addEventListener('click', async () => {
    const priority = tr.querySelector('.e-priority').value.trim();
    const dish = tr.querySelector('.e-dish').value.trim();
    contentData.cookingList.rows[i] = { priority, dish };
    await saveContent();
    renderCookTable();
  });
}
document.getElementById('cookAddBtn').addEventListener('click', async () => {
  const priority = document.getElementById('cookNewPriority').value.trim();
  const dish = document.getElementById('cookNewDish').value.trim();
  if (!priority && !dish) return;
  contentData.cookingList.rows.push({ priority, dish });
  document.getElementById('cookNewPriority').value = '';
  document.getElementById('cookNewDish').value = '';
  await saveContent();
  renderCookTable();
});
document.getElementById('cookDescSaveBtn').addEventListener('click', async () => {
  contentData.cookingList.description = document.getElementById('cookDescInput').value.trim().slice(0, 200);
  await saveContent();
  renderDescription('cookDesc', contentData.cookingList.description);
});

// ---------- 売却してはいけないリスト ----------
function renderNoSellTable() {
  const table = document.getElementById('noSellTable');
  const rows = contentData.noSellList.rows || [];
  let html = `<tr><th>アイテム</th><th>備考</th>${isAdmin ? '<th style="width:110px;">操作</th>' : ''}</tr>`;
  rows.forEach((r, i) => {
    html += `<tr data-i="${i}"><td class="c-item">${escapeHtml(r.item)}</td><td class="c-note noSellNote">${escapeHtml(r.note)}</td>`;
    if (isAdmin) html += `<td class="c-actions"><button class="small" data-action="edit-nosell" data-i="${i}">編集</button><button class="small danger" data-action="del-nosell" data-i="${i}">削除</button></td>`;
    html += `</tr>`;
  });
  table.innerHTML = html;
  bindNoSellRowActions();
}
function bindNoSellRowActions() {
  const table = document.getElementById('noSellTable');
  table.querySelectorAll('[data-action="edit-nosell"]').forEach(btn => {
    btn.addEventListener('click', () => enterNoSellEditMode(parseInt(btn.dataset.i)));
  });
  table.querySelectorAll('[data-action="del-nosell"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('この行を削除しますか?')) return;
      contentData.noSellList.rows.splice(parseInt(btn.dataset.i), 1);
      await saveContent();
      renderNoSellTable();
    });
  });
}
function enterNoSellEditMode(i) {
  const tr = document.getElementById('noSellTable').querySelector(`tr[data-i="${i}"]`);
  const row = contentData.noSellList.rows[i];
  tr.querySelector('.c-item').innerHTML = `<input type="text" class="e-item" value="${escapeHtml(row.item)}">`;
  tr.querySelector('.c-note').innerHTML = `<textarea class="e-note" rows="2">${escapeHtml(row.note)}</textarea>`;
  tr.querySelector('.c-actions').innerHTML = `<button class="primary small e-save">保存</button><button class="small e-cancel">キャンセル</button>`;
  tr.querySelector('.e-cancel').addEventListener('click', () => renderNoSellTable());
  tr.querySelector('.e-save').addEventListener('click', async () => {
    const item = tr.querySelector('.e-item').value.trim();
    const note = tr.querySelector('.e-note').value.trim();
    contentData.noSellList.rows[i] = { item, note };
    await saveContent();
    renderNoSellTable();
  });
}
document.getElementById('noSellAddBtn').addEventListener('click', async () => {
  const item = document.getElementById('noSellNewItem').value.trim();
  const note = document.getElementById('noSellNewNote').value.trim();
  if (!item && !note) return;
  contentData.noSellList.rows.push({ item, note });
  document.getElementById('noSellNewItem').value = '';
  document.getElementById('noSellNewNote').value = '';
  await saveContent();
  renderNoSellTable();
});
document.getElementById('noSellDescSaveBtn').addEventListener('click', async () => {
  contentData.noSellList.description = document.getElementById('noSellDescInput').value.trim().slice(0, 200);
  await saveContent();
  renderDescription('noSellDesc', contentData.noSellList.description);
});

// ---------- 管理者ログイン ----------
document.getElementById('manageBtn').addEventListener('click', () => {
  if (isAdmin) return;
  document.getElementById('adminLoginBox').style.display = 'block';
});
document.getElementById('adminLoginCancelBtn').addEventListener('click', () => {
  document.getElementById('adminLoginBox').style.display = 'none';
  document.getElementById('adminLoginStatus').textContent = '';
});
document.getElementById('adminLoginBtn').addEventListener('click', async () => {
  const statusEl = document.getElementById('adminLoginStatus');
  const id = document.getElementById('adminId').value.trim();
  const password = document.getElementById('adminPassword').value;
  if (!id || !password) { statusEl.className = 'status err'; statusEl.textContent = 'IDとパスワードを入力してください。'; return; }
  explicitLoginAttempt = true;
  try {
    await signInWithEmailAndPassword(auth, idToEmail(id), password);
  } catch (e) {
    statusEl.className = 'status err';
    statusEl.textContent = 'ログインに失敗しました。IDかパスワードが間違っています。';
    explicitLoginAttempt = false;
  }
});
document.getElementById('adminLogoutBtn').addEventListener('click', async () => {
  await signOut(auth);
});

onAuthStateChanged(auth, async (user) => {
  const statusEl = document.getElementById('adminLoginStatus');
  if (!user) {
    isAdmin = false;
    document.getElementById('adminBadge').style.display = 'none';
    document.getElementById('adminLogoutBtn').style.display = 'none';
    document.getElementById('manageBtn').style.display = '';
    updateEditVisibility();
    return;
  }
  try {
    const email = (user.email || '').toLowerCase();
    const adminSnap = await getDoc(doc(adminsCol, email));
    isAdmin = adminSnap.exists();
  } catch (e) {
    isAdmin = false;
  }
  if (isAdmin) {
    document.getElementById('adminLoginBox').style.display = 'none';
    document.getElementById('adminBadge').style.display = 'inline';
    document.getElementById('adminLogoutBtn').style.display = '';
    document.getElementById('manageBtn').style.display = 'none';
    if (statusEl) { statusEl.className = 'status ok'; statusEl.textContent = ''; }
  } else if (explicitLoginAttempt) {
    statusEl.className = 'status err';
    statusEl.textContent = '管理者権限がありません。';
    await signOut(auth);
  }
  explicitLoginAttempt = false;
  updateEditVisibility();
});

function updateEditVisibility() {
  document.getElementById('shopDescEdit').style.display = isAdmin ? 'block' : 'none';
  document.getElementById('cookDescEdit').style.display = isAdmin ? 'block' : 'none';
  document.getElementById('noSellDescEdit').style.display = isAdmin ? 'block' : 'none';
  document.getElementById('shopAddRow').style.display = isAdmin ? 'flex' : 'none';
  document.getElementById('cookAddRow').style.display = isAdmin ? 'flex' : 'none';
  document.getElementById('noSellAddRow').style.display = isAdmin ? 'flex' : 'none';
  document.getElementById('passwordChangeBox').style.display = isAdmin ? 'block' : 'none';
  if (document.getElementById('mainContent').style.display !== 'none') {
    renderShopTable();
    renderCookTable();
    renderNoSellTable();
  }
}

// ---------- 閲覧パスワードの変更(管理者限定) ----------
document.getElementById('changePasswordBtn').addEventListener('click', async () => {
  const statusEl = document.getElementById('passwordChangeStatus');
  const newPass = document.getElementById('newGatePassword').value.trim();
  if (!newPass) { statusEl.className = 'status err'; statusEl.textContent = '新しいパスワードを入力してください。'; return; }
  try {
    await setDoc(doc(goldFarmingCol, "config"), { password: newPass });
    statusEl.className = 'status ok';
    statusEl.textContent = '変更しました。ギルドメンバーに新しいパスワードを共有してください。';
    document.getElementById('newGatePassword').value = '';
  } catch (e) {
    statusEl.className = 'status err';
    statusEl.textContent = '変更に失敗しました(権限がない可能性があります): ' + e.message;
  }
});
