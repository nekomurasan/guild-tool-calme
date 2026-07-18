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

const PRIORITY_LEVELS = ["★", "★★", "★★★", "★★★★", "★★★★★", "★★★★★★"];
const SESSION_KEY = 'gfg_pw_unlocked';

let isAdmin = false;
let editModeOn = false;
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

// ---------- アクセス(2経路) ----------
function showMainContent() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('mainContent').style.display = 'block';
}
function showLoginScreen() {
  document.getElementById('loginScreen').style.display = 'block';
  document.getElementById('mainContent').style.display = 'none';
}

// サブギルド: 共通パスワード
document.getElementById('gateBtn').addEventListener('click', async () => {
  const statusEl = document.getElementById('gateStatus');
  const input = document.getElementById('gatePassword').value;
  if (!input) { statusEl.className = 'status err'; statusEl.textContent = 'パスワードを入力してください。'; return; }
  try {
    const snap = await getDoc(doc(goldFarmingCol, "config"));
    const correct = snap.exists() ? (snap.data().password || '') : '';
    if (correct && input === correct) {
      sessionStorage.setItem(SESSION_KEY, '1');
      showMainContent();
      document.getElementById('connNote').textContent = '読み込み中...';
      await loadContent();
      document.getElementById('connNote').textContent = '';
    } else {
      statusEl.className = 'status err';
      statusEl.textContent = 'パスワードが違います。';
    }
  } catch (e) {
    statusEl.className = 'status err';
    statusEl.textContent = '確認に失敗しました: ' + e.message;
  }
});

// メインギルド: Firebaseログイン
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
  isAdmin = false;
  editModeOn = false;
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
    } catch (e) {
      isAdmin = false;
    }
    document.getElementById('manageBtn').style.display = isAdmin ? '' : 'none';
    if (!isAdmin) editModeOn = false;
    await loadContent();
    document.getElementById('connNote').textContent = '';
  } else {
    isAdmin = false;
    document.getElementById('manageBtn').style.display = 'none';
    if (sessionStorage.getItem(SESSION_KEY) === '1') {
      showMainContent();
      await loadContent();
    } else {
      showLoginScreen();
    }
  }
});

document.getElementById('manageBtn').addEventListener('click', () => {
  editModeOn = !editModeOn;
  document.getElementById('manageBtn').textContent = editModeOn ? '管理者用:編集を終了' : '管理者用:リスト管理';
  updateEditVisibility();
});

function updateEditVisibility() {
  const show = isAdmin && editModeOn;
  document.getElementById('shopDescEdit').style.display = show ? 'block' : 'none';
  document.getElementById('cookDescEdit').style.display = show ? 'block' : 'none';
  document.getElementById('noSellDescEdit').style.display = show ? 'block' : 'none';
  document.getElementById('shopAddRow').style.display = show ? 'flex' : 'none';
  document.getElementById('cookAddRow').style.display = show ? 'flex' : 'none';
  document.getElementById('noSellAddRow').style.display = show ? 'flex' : 'none';
  renderShopTable();
  renderCookTable();
  renderNoSellTable();
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
  fillSelect(document.getElementById('cookNewPriority'), PRIORITY_LEVELS);
  renderAll();
}

function fillSelect(sel, options) {
  sel.innerHTML = options.map(o => `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`).join('');
}

function renderAll() {
  renderDescription('shopDesc', contentData.shopList.description);
  renderDescription('cookDesc', contentData.cookingList.description);
  renderDescription('noSellDesc', contentData.noSellList.description);
  document.getElementById('shopDescInput').value = contentData.shopList.description || '';
  document.getElementById('cookDescInput').value = contentData.cookingList.description || '';
  document.getElementById('noSellDescInput').value = contentData.noSellList.description || '';
  updateEditVisibility();
}

function renderDescription(elId, text) {
  document.getElementById(elId).textContent = text || '';
}

async function saveContent() {
  await setDoc(doc(goldFarmingCol, "content"), contentData);
}

// ---------- 商店購入推奨リスト(カセットごとにバッジでまとめ表示) ----------
function ingredientBadgeHtml(name, showRemove, cassette) {
  const safe = escapeHtml(name);
  const isNoPurchase = name === '購入なし';
  const src = `icons/${encodeURIComponent(name)}.png`;
  const removeBtn = showRemove
    ? `<button class="badgeX" data-action="del-ingredient" data-cassette="${escapeHtml(cassette)}" data-name="${escapeHtml(name)}">×</button>`
    : '';
  const img = isNoPurchase ? '' : `<img src="${src}" alt="" onerror="this.style.display='none'">`;
  return `<span class="ingredientBadge${isNoPurchase ? ' noPurchase' : ''}">${img}${safe}${removeBtn}</span>`;
}

function groupShopRows() {
  const rows = contentData.shopList.rows || [];
  const groups = [];
  const indexByCassette = {};
  rows.forEach((r) => {
    const key = r.cassette || '';
    if (!(key in indexByCassette)) {
      indexByCassette[key] = groups.length;
      groups.push({ cassette: key, ingredients: [] });
    }
    groups[indexByCassette[key]].ingredients.push(r.ingredient);
  });
  return groups;
}

function flattenShopGroups(groups) {
  const rows = [];
  groups.forEach(g => {
    g.ingredients.forEach(ingredient => rows.push({ cassette: g.cassette, ingredient }));
  });
  return rows;
}

function renderShopTable() {
  const table = document.getElementById('shopTable');
  const groups = groupShopRows();
  const showActions = isAdmin && editModeOn;
  let html = `<tr><th style="width:110px;">カセット名</th><th class="wideCol">食材</th>${showActions ? '<th style="width:150px;">操作</th>' : ''}</tr>`;
  groups.forEach((g, gi) => {
    const grpClass = gi % 2 === 0 ? 'grp-a' : 'grp-b';
    const hasNoPurchase = g.ingredients.includes('購入なし');
    const badges = g.ingredients.map(name => ingredientBadgeHtml(name, showActions, g.cassette)).join('');
    html += `<tr class="${grpClass}" data-cassette="${escapeHtml(g.cassette)}">`;
    html += `<td class="c-cassette${hasNoPurchase ? ' cassette-nopurchase' : ''}">${escapeHtml(g.cassette)}</td>`;
    html += `<td class="c-ingredients"><div class="badgeWrap">${badges}</div></td>`;
    if (showActions) {
      html += `<td class="c-actions">
        <button class="small" data-action="edit-cassette" data-cassette="${escapeHtml(g.cassette)}">名前変更</button><br>
        <button class="small" data-action="up-cassette" data-i="${gi}" ${gi===0?'disabled':''}>↑</button>
        <button class="small" data-action="down-cassette" data-i="${gi}" ${gi===groups.length-1?'disabled':''}>↓</button>
      </td>`;
    }
    html += `</tr>`;
  });
  table.innerHTML = html;
  bindShopRowActions();
  refreshShopCassetteSelect();
}
function bindShopRowActions() {
  const table = document.getElementById('shopTable');
  table.querySelectorAll('[data-action="del-ingredient"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const cassette = btn.dataset.cassette, name = btn.dataset.name;
      const rows = contentData.shopList.rows;
      const idx = rows.findIndex(r => r.cassette === cassette && r.ingredient === name);
      if (idx === -1) return;
      if (!confirm(`「${name}」を削除しますか?`)) return;
      rows.splice(idx, 1);
      await saveContent();
      renderShopTable();
    });
  });
  table.querySelectorAll('[data-action="edit-cassette"]').forEach(btn => {
    btn.addEventListener('click', () => enterCassetteRenameMode(btn.dataset.cassette));
  });
  table.querySelectorAll('[data-action="up-cassette"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const i = parseInt(btn.dataset.i);
      if (i <= 0) return;
      const groups = groupShopRows();
      [groups[i - 1], groups[i]] = [groups[i], groups[i - 1]];
      contentData.shopList.rows = flattenShopGroups(groups);
      await saveContent();
      renderShopTable();
    });
  });
  table.querySelectorAll('[data-action="down-cassette"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const i = parseInt(btn.dataset.i);
      const groups = groupShopRows();
      if (i >= groups.length - 1) return;
      [groups[i + 1], groups[i]] = [groups[i], groups[i + 1]];
      contentData.shopList.rows = flattenShopGroups(groups);
      await saveContent();
      renderShopTable();
    });
  });
}
function enterCassetteRenameMode(cassette) {
  const tr = document.getElementById('shopTable').querySelector(`tr[data-cassette="${CSS.escape(cassette)}"]`);
  tr.querySelector('.c-cassette').innerHTML = `<input type="text" class="e-cassette" value="${escapeHtml(cassette)}">`;
  tr.querySelector('.c-actions').innerHTML = `<button class="primary small e-save">保存</button><button class="small e-cancel">キャンセル</button>`;
  tr.querySelector('.e-cancel').addEventListener('click', () => renderShopTable());
  tr.querySelector('.e-save').addEventListener('click', async () => {
    const newName = tr.querySelector('.e-cassette').value.trim();
    if (!newName) { alert('カセット名を入力してください。'); return; }
    contentData.shopList.rows.forEach(r => { if (r.cassette === cassette) r.cassette = newName; });
    await saveContent();
    renderShopTable();
  });
}
function refreshShopCassetteSelect() {
  const sel = document.getElementById('shopCassetteSelect');
  const names = groupShopRows().map(g => g.cassette).filter(n => n);
  let html = names.map(n => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');
  html += `<option value="__NEW__">+ 新しいカセットを追加</option>`;
  sel.innerHTML = html;
}
document.getElementById('shopCassetteSelect').addEventListener('change', () => {
  const isNew = document.getElementById('shopCassetteSelect').value === '__NEW__';
  document.getElementById('shopNewCassetteText').style.display = isNew ? '' : 'none';
});
document.getElementById('shopAddBtn').addEventListener('click', async () => {
  const sel = document.getElementById('shopCassetteSelect');
  let cassette = sel.value;
  if (cassette === '__NEW__') {
    cassette = document.getElementById('shopNewCassetteText').value.trim();
  }
  const ingredient = document.getElementById('shopNewIngredient').value.trim();
  if (!cassette || !ingredient) { alert('カセット名と食材名を両方入力してください。'); return; }
  contentData.shopList.rows.push({ cassette, ingredient });
  document.getElementById('shopNewCassetteText').value = '';
  document.getElementById('shopNewIngredient').value = '';
  await saveContent();
  renderShopTable();
});
document.getElementById('shopDescSaveBtn').addEventListener('click', async () => {
  contentData.shopList.description = document.getElementById('shopDescInput').value.trim().slice(0, 200);
  await saveContent();
  renderDescription('shopDesc', contentData.shopList.description);
});

// ---------- 料理推奨リスト(優先度select・並び替え対応) ----------
function renderCookTable() {
  const table = document.getElementById('cookTable');
  const rows = contentData.cookingList.rows || [];
  const showActions = isAdmin && editModeOn;
  let html = `<tr><th style="width:110px;">優先度</th><th>料理</th>${showActions ? '<th style="width:150px;">操作</th>' : ''}</tr>`;
  rows.forEach((r, i) => {
    const grpClass = i % 2 === 0 ? 'grp-a' : 'grp-b';
    html += `<tr class="${grpClass}" data-i="${i}"><td class="c-priority">${escapeHtml(r.priority)}</td><td class="c-dish">${escapeHtml(r.dish)}</td>`;
    if (showActions) {
      html += `<td class="c-actions">
        <button class="small" data-action="edit-cook" data-i="${i}">編集</button>
        <button class="small danger" data-action="del-cook" data-i="${i}">削除</button>
        <button class="small" data-action="up-cook" data-i="${i}" ${i===0?'disabled':''}>↑</button>
        <button class="small" data-action="down-cook" data-i="${i}" ${i===rows.length-1?'disabled':''}>↓</button>
      </td>`;
    }
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
  table.querySelectorAll('[data-action="up-cook"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const i = parseInt(btn.dataset.i);
      if (i <= 0) return;
      const rows = contentData.cookingList.rows;
      [rows[i - 1], rows[i]] = [rows[i], rows[i - 1]];
      await saveContent();
      renderCookTable();
    });
  });
  table.querySelectorAll('[data-action="down-cook"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const i = parseInt(btn.dataset.i);
      const rows = contentData.cookingList.rows;
      if (i >= rows.length - 1) return;
      [rows[i + 1], rows[i]] = [rows[i], rows[i + 1]];
      await saveContent();
      renderCookTable();
    });
  });
}
function enterCookEditMode(i) {
  const tr = document.getElementById('cookTable').querySelector(`tr[data-i="${i}"]`);
  const row = contentData.cookingList.rows[i];
  const prioritySel = document.createElement('select');
  fillSelect(prioritySel, PRIORITY_LEVELS);
  if (PRIORITY_LEVELS.includes(row.priority)) prioritySel.value = row.priority;
  prioritySel.className = 'e-priority';
  const priorityCell = tr.querySelector('.c-priority');
  priorityCell.innerHTML = '';
  priorityCell.appendChild(prioritySel);
  tr.querySelector('.c-dish').innerHTML = `<input type="text" class="e-dish" value="${escapeHtml(row.dish)}">`;
  tr.querySelector('.c-actions').innerHTML = `<button class="primary small e-save">保存</button><button class="small e-cancel">キャンセル</button>`;
  tr.querySelector('.e-cancel').addEventListener('click', () => renderCookTable());
  tr.querySelector('.e-save').addEventListener('click', async () => {
    const priority = tr.querySelector('.e-priority').value;
    const dish = tr.querySelector('.e-dish').value.trim();
    contentData.cookingList.rows[i] = { priority, dish };
    await saveContent();
    renderCookTable();
  });
}
document.getElementById('cookAddBtn').addEventListener('click', async () => {
  const priority = document.getElementById('cookNewPriority').value;
  const dish = document.getElementById('cookNewDish').value.trim();
  if (!dish) { alert('料理名を入力してください。'); return; }
  contentData.cookingList.rows.push({ priority, dish });
  document.getElementById('cookNewDish').value = '';
  await saveContent();
  renderCookTable();
});
document.getElementById('cookDescSaveBtn').addEventListener('click', async () => {
  contentData.cookingList.description = document.getElementById('cookDescInput').value.trim().slice(0, 200);
  await saveContent();
  renderDescription('cookDesc', contentData.cookingList.description);
});

// ---------- 売却してはいけないNGリスト(並び替え対応) ----------
function renderNoSellTable() {
  const table = document.getElementById('noSellTable');
  const rows = contentData.noSellList.rows || [];
  const showActions = isAdmin && editModeOn;
  let html = `<tr><th>アイテム</th><th>備考</th>${showActions ? '<th style="width:150px;">操作</th>' : ''}</tr>`;
  rows.forEach((r, i) => {
    const grpClass = i % 2 === 0 ? 'grp-a' : 'grp-b';
    html += `<tr class="${grpClass}" data-i="${i}"><td class="c-item">${escapeHtml(r.item)}</td><td class="c-note noSellNote">${escapeHtml(r.note)}</td>`;
    if (showActions) {
      html += `<td class="c-actions">
        <button class="small" data-action="edit-nosell" data-i="${i}">編集</button>
        <button class="small danger" data-action="del-nosell" data-i="${i}">削除</button>
        <button class="small" data-action="up-nosell" data-i="${i}" ${i===0?'disabled':''}>↑</button>
        <button class="small" data-action="down-nosell" data-i="${i}" ${i===rows.length-1?'disabled':''}>↓</button>
      </td>`;
    }
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
  table.querySelectorAll('[data-action="up-nosell"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const i = parseInt(btn.dataset.i);
      if (i <= 0) return;
      const rows = contentData.noSellList.rows;
      [rows[i - 1], rows[i]] = [rows[i], rows[i - 1]];
      await saveContent();
      renderNoSellTable();
    });
  });
  table.querySelectorAll('[data-action="down-nosell"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const i = parseInt(btn.dataset.i);
      const rows = contentData.noSellList.rows;
      if (i >= rows.length - 1) return;
      [rows[i + 1], rows[i]] = [rows[i], rows[i + 1]];
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
  if (!item) { alert('アイテム名を入力してください。'); return; }
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
