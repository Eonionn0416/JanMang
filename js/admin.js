// js/admin.js
import { auth, db } from "./firebase-init.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
import {
  collection, getDocs, doc, getDoc, updateDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";

function msg(t){ const el=document.getElementById("adminMsg"); if(el) el.textContent=t||""; }

function formatDate(ts){
  if (!ts?.toDate) return "—";
  const d = ts.toDate();
  const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,"0"), da=String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${da}`;
}

function roleLabel(v){
  return v==="member"?"일반":v==="developer"?"개발자":v==="finance"?"총무":v==="admin"?"관리자":v;
}

async function ensureAdmin(user){
  // 1) 비번 1111
  const pw = prompt("관리자 비밀번호 입력");
  if (pw !== "1111") {
    alert("비밀번호가 틀렸습니다.");
    location.href = "./index.html";
    return false;
  }

  // 2) Firestore role=admin 확인 (진짜 권한 체크)
  const snap = await getDoc(doc(db, "users", user.uid));
  const role = snap.exists() ? snap.data().role : null;
  if (role !== "admin") {
    alert("관리자 권한이 없습니다.");
    location.href = "./index.html";
    return false;
  }
  return true;
}

async function loadUsers(){
  msg("불러오는 중...");
  const tbody = document.querySelector("#usersTable tbody");
  tbody.innerHTML = "";

  const qs = await getDocs(collection(db, "users"));
  qs.forEach((s) => {
    const u = s.data();
    const tr = document.createElement("tr");

    const roleSel = document.createElement("select");
    ["member","developer","finance","admin"].forEach(v=>{
      const o=document.createElement("option");
      o.value=v; o.textContent=roleLabel(v);
      if ((u.role||"member")===v) o.selected=true;
      roleSel.appendChild(o);
    });

    const tierSel = document.createElement("select");
    ["QFN","LGA","FCCSP","POP","MCM","2.5D"].forEach(v=>{
      const o=document.createElement("option");
      o.value=v; o.textContent=v;
      if ((u.tier||"QFN")===v) o.selected=true;
      tierSel.appendChild(o);
    });

    tr.innerHTML = `
      <td>${u.email || "—"}</td>
      <td>${formatDate(u.createdAt)}</td>
      <td></td>
      <td></td>
      <td>${(u.seasonIndex ?? 0)}</td>
      <td></td>
    `;

    tr.children[2].appendChild(roleSel);
    tr.children[3].appendChild(tierSel);

    const saveBtn = document.createElement("button");
    saveBtn.className = "btn";
    saveBtn.textContent = "저장";
    saveBtn.addEventListener("click", async () => {
      await updateDoc(doc(db, "users", s.id), {
        role: roleSel.value,
        tier: tierSel.value,
        updatedAt: serverTimestamp(),
      });
      alert("저장 완료");
    });
    tr.children[5].appendChild(saveBtn);

    tbody.appendChild(tr);
  });

  msg(`총 ${qs.size}명`);
}

onAuthStateChanged(auth, async (user) => {
  if (!user) return location.href = "./index.html";
  const ok = await ensureAdmin(user);
  if (!ok) return;
  await loadUsers();
});