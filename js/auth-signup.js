// auth-signup.js
import { auth, db } from "./firebase-init.js";
import {
  createUserWithEmailAndPassword,
  signOut, // ✅ 추가
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";

import { doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";

function $(id){ return document.getElementById(id); }
function msg(t){ $("signupMsg").textContent = t || ""; }

function togglePw(inputId){
  const el = $(inputId);
  el.type = (el.type === "password") ? "text" : "password";
}

$("togglePw")?.addEventListener("click", () => togglePw("pw"));
$("togglePw2")?.addEventListener("click", () => togglePw("pw2"));

$("signupBtn")?.addEventListener("click", async () => {
  msg("");

  const site = $("site").value.trim();
  const dept = $("dept").value.trim();
  const email = $("email").value.trim().toLowerCase();
  const name = $("name").value.trim();
  const rank = $("rank").value.trim();
  const empId = $("empId").value.trim(); // 프로필로만 저장(로그인에 안 씀)
  const pw = $("pw").value;
  const pw2 = $("pw2").value;

  if (!site || !dept || !email || !name || !rank || !empId || !pw || !pw2) return msg("⚠️ 전부 입력해줘");
  if (!email.includes("@")) return msg("⚠️ 이메일 형식이 아님");
  if (pw !== pw2) return msg("⚠️ 비밀번호 확인이 안 맞음");
  if (pw.length < 6) return msg("⚠️ 비밀번호는 6자 이상");

  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pw);
    const uid = cred.user.uid;
    const pickedRole = $("signupRole")?.value || "member";
    const role = (email === "seungeon.kim@statschippac.com") ? "admin" : pickedRole;

    await setDoc(doc(db, "users", uid), {
      uid,
      email,
      empId,
      site,
      dept,
      name,
      rank,

      role,                 // ✅ 추가 (admin 자동 부여 포함)
      tier: "QFN",          // (초기값) 나중에 login 시 자동 업데이트 로직에서 갱신
      seasonIndex: 0,       // (초기값)
      lastLoginAt: serverTimestamp(),

      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    // ✅ 핵심: 가입 직후 자동 로그인 상태를 끊는다
    await signOut(auth);

    msg("✅ 회원가입 성공! 로그인 페이지로 이동");
    location.href = "./login.html";
  } catch (e) {
    msg(`❌ 가입 실패: ${e.code || e.message}`);
  }
});