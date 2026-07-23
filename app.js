import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import {
  getFirestore, doc, getDoc, collection
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import {
  getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";

// ------------------------------------------------------------------
// Firebase設定(equipment / gold-farming / damage-calc と共通のプロジェクト)
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
const goldFarmingCol = collection(db, "goldFarming");

const LOGIN_ID_SUFFIX = '@calmeguild.local';
function idToEmail(id) { return id.trim().toLowerCase() + LOGIN_ID_SUFFIX; }

// サブギルド共通パスワードの解錠フラグ。gold-farming/damage-calc とキー名を揃えることで、
// ここで解錠すれば他のツールページでも自動的に解錠済みとして扱われる。
const SESSION_KEY = 'calmeguild_sub_unlocked';

async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function showMainContent(route) {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('mainContent').style.display = 'block';
  document.getElementById('routeNote').textContent = route === 'main'
    ? 'メインギルドメンバーとしてログイン中'
    : 'サブギルドメンバーとして利用中';
  // サブギルドはAce Characters Databaseの利用権限が無いため非表示にする
  document.getElementById('cardEquipment').style.display = route === 'main' ? '' : 'none';
}
function showLoginScreen() {
  document.getElementById('loginScreen').style.display = 'block';
  document.getElementById('mainContent').style.display = 'none';
}

// サブギルド: 共通パスワード(ハッシュ化して比較。gold-farming/config を流用)
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
      showMainContent('sub');
    } else {
      statusEl.className = 'status err';
      statusEl.textContent = 'パスワードが違います。';
    }
  } catch (e) {
    statusEl.className = 'status err';
    statusEl.textContent = '確認に失敗しました: ' + e.message;
  }
});

// メインギルド: Firebaseログイン(以降equipment/gold-farming/damage-calcでもログイン状態が維持される)
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
  showLoginScreen();
});

onAuthStateChanged(auth, (user) => {
  if (user) {
    showMainContent('main');
  } else if (sessionStorage.getItem(SESSION_KEY) === '1') {
    showMainContent('sub');
  } else {
    showLoginScreen();
  }
});
