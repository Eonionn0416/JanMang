// auth-login.js
import { auth, db } from "./firebase-init.js";
import {
  signInWithEmailAndPassword,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";

import {
  doc, getDoc, updateDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";

function $(id){ return document.getElementById(id); }
function msg(t){ $("loginMsg").textContent = t || ""; }

// 이미 로그인 상태면 바로 이동(선택)
onAuthStateChanged(auth, (user) => {
  if (user) location.href = "./index.html";
});

$("toggleLoginPw")?.addEventListener("click", () => {
  const el = $("loginPw");
  el.type = (el.type === "password") ? "text" : "password";
});

// ✅ 시즌 인덱스 계산: 2026-03 = 1, 2026-07 = 2, 2027-03 = 3 ...
function calcSeasonIndex(d = new Date()) {
  const y = d.getFullYear();
  const m = d.getMonth() + 1; // 1~12
  // 시즌 시작: 3/1, 7/1
  // (y,3) ~ (y,6) => 상반기 시즌(odd), (y,7) ~ (y,12)+ (y+1,1~2) => 하반기 시즌(even)
  // 기준을 2026년 시즌1부터로 맞춤
  const baseYear = 2026;
  let seasonInYear = (m >= 3 && m <= 6) ? 1 : 2; // 1=3~6, 2=7~2
  // 1~2월은 이전 해 하반기 시즌
  let seasonYear = y;
  if (m === 1 || m === 2) seasonYear = y - 1;

  // 2026년: seasonYear=2026, seasonInYear=1 => 1 / seasonInYear=2 => 2
  const yearOffset = (seasonYear - baseYear) * 2;
  const idx = yearOffset + seasonInYear;
  return Math.max(0, idx);
}

// ✅ 가입일로부터 개월수 계산
function monthsSince(dateObj, now = new Date()) {
  const y = now.getFullYear() - dateObj.getFullYear();
  const m = now.getMonth() - dateObj.getMonth();
  let months = y * 12 + m;
  // 날짜(일) 기준으로 “아직 그 달이 안 지났으면 -1”
  if (now.getDate() < dateObj.getDate()) months -= 1;
  return Math.max(0, months);
}

// ✅ 등급 테이블
function tierFromMonths(months) {
  if (months <= 6) return "QFN";
  if (months <= 12) return "LGA";
  if (months <= 18) return "FCCSP";
  if (months <= 24) return "POP";
  if (months <= 30) return "MCM";
  return "2.5D";
}

async function postLoginUpdate(uid) {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const u = snap.data();
  const now = new Date();

  // Firestore Timestamp -> JS Date
  const createdAt = u.createdAt?.toDate ? u.createdAt.toDate() : null;
  if (!createdAt) return;

  const seasonIndexNow = calcSeasonIndex(now);
  const months = monthsSince(createdAt, now);
  const tierNow = tierFromMonths(months);

  await updateDoc(ref, {
    seasonIndex: seasonIndexNow,
    tier: tierNow,
    lastLoginAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

$("loginBtn")?.addEventListener("click", async () => {
  msg("");

  const email = $("loginId").value.trim().toLowerCase();
  const pw = $("loginPw").value;

  if (!email || !pw) return msg("⚠️ 이메일 + 비밀번호 입력해줘");
  if (!email.includes("@")) return msg("⚠️ 이메일 형식이 아님");

  try {
    const cred = await signInWithEmailAndPassword(auth, email, pw);

    // ✅ 로그인할 때 자동 시즌+티어 업데이트
    await postLoginUpdate(cred.user.uid);

    msg("✅ 로그인 성공! feed로 이동");
    location.href = "./index.html";
  } catch (e) {
    msg(`❌ 로그인 실패: ${e.code || e.message}`);
  }
});