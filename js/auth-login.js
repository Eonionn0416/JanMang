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

const BASE_SEASON_START = new Date(2026, 2, 1); // 2026-03-01
const SIX_MONTHS = 6;
const REMEMBER_EMAIL_KEY = "jmRememberedEmail";

function loadRememberedEmail() {
  const savedEmail = localStorage.getItem(REMEMBER_EMAIL_KEY) || "";
  const loginIdEl = $("loginId");
  const rememberEmailEl = $("rememberEmail");
  if (savedEmail && loginIdEl) loginIdEl.value = savedEmail;
  if (rememberEmailEl) rememberEmailEl.checked = !!savedEmail;
}

function persistRememberedEmail(email) {
  const remember = $("rememberEmail")?.checked;
  if (remember && email) {
    localStorage.setItem(REMEMBER_EMAIL_KEY, email);
    return;
  }
  localStorage.removeItem(REMEMBER_EMAIL_KEY);
}


loadRememberedEmail();

$("rememberEmail")?.addEventListener("change", () => {
  const email = $("loginId")?.value.trim().toLowerCase() || "";
  persistRememberedEmail(email);
});

$("loginId")?.addEventListener("input", () => {
  if (!$("rememberEmail")?.checked) return;
  const email = $("loginId")?.value.trim().toLowerCase() || "";
  persistRememberedEmail(email);
});

// 이미 로그인 상태면 바로 이동(선택)
onAuthStateChanged(auth, (user) => {
  if (user) location.href = "./index.html";
});

$("toggleLoginPw")?.addEventListener("click", () => {
  const el = $("loginPw");
  el.type = (el.type === "password") ? "text" : "password";
});

function startOfDay(dateLike) {
  const d = new Date(dateLike);
  d.setHours(0, 0, 0, 0);
  return d;
}

// 시즌 인덱스: 2026-03-01 ~ 2026-08-31 => 1, 2026-09-01 ~ 2027-02-28 => 2, 2027-03-01 ~ => 3 ...
function calcSeasonIndex(dateLike = new Date()) {
  const d = startOfDay(dateLike);
  const y = d.getFullYear();
  const m = d.getMonth() + 1;

  let seasonYear = y;
  let seasonInYear = 1; // 1=3/1~8/31, 2=9/1~다음해 2/말

  if (m >= 3 && m <= 8) {
    seasonInYear = 1;
  } else {
    seasonInYear = 2;
    if (m === 1 || m === 2) seasonYear = y - 1;
  }

  const idx = ((seasonYear - 2026) * 2) + seasonInYear;
  return Math.max(1, idx);
}

function getSeasonStartByIndex(seasonIndex) {
  const idx = Math.max(1, Number(seasonIndex) || 1);
  const zeroBased = idx - 1;
  const start = new Date(BASE_SEASON_START);
  start.setMonth(start.getMonth() + (zeroBased * 6));
  return startOfDay(start);
}

function getSeasonRangeByIndex(seasonIndex) {
  const start = getSeasonStartByIndex(seasonIndex);
  const end = new Date(start);
  end.setMonth(end.getMonth() + 6);
  return {
    start,
    end: startOfDay(end),
  };
}

function formatDateKR(dateLike) {
  const d = startOfDay(dateLike);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function tierFromMonths(months) {
  if (months < 6) return "QFN";
  if (months < 12) return "LGA";
  if (months < 18) return "FCCSP";
  if (months < 24) return "POP";
  if (months < 30) return "MCM";
  return "2.5D";
}

function buildSeasonPopupText({ oldTier, newTier, oldSeasonIndex, newSeasonIndex }) {
  const { start, end } = getSeasonRangeByIndex(newSeasonIndex);
  const tierLine = oldTier === newTier
    ? `등급 ${newTier}`
    : `등급 ${oldTier} -> ${newTier}`;
  const seasonLine = oldSeasonIndex === newSeasonIndex
    ? `시즌 ${newSeasonIndex}`
    : `시즌 ${oldSeasonIndex} -> ${newSeasonIndex}`;

  return [
    "기본 정보가 갱신되었습니다.",
    tierLine,
    `${formatDateKR(start)} ~ ${formatDateKR(end)} 시즌 ${newSeasonIndex}`,
    seasonLine,
  ].join("\n");
}

async function postLoginUpdate(uid) {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;

  const u = snap.data();
  const now = new Date();
  const currentSeasonIndex = calcSeasonIndex(now);

  const storedSeasonIndex = Math.max(1, Number(u.seasonIndex) || 1);
  const storedProgressMonths = Math.max(0, Number(u.tierProgressMonths) || 0);
  const storedTier = u.tier || tierFromMonths(storedProgressMonths);

  let nextSeasonIndex = storedSeasonIndex;
  let nextProgressMonths = storedProgressMonths;

  // 시즌이 넘어간 뒤 로그인했으면, 몇 시즌을 건너뛰었더라도 등급 카운트는 1회(6개월)만 진행.
  if (currentSeasonIndex > storedSeasonIndex) {
    nextSeasonIndex = currentSeasonIndex;
    nextProgressMonths = storedProgressMonths + SIX_MONTHS;
  }

  // 기존에 seasonIndex가 0이던 계정 정리용
  if (!u.seasonIndex || Number(u.seasonIndex) < 1) {
    nextSeasonIndex = Math.max(1, nextSeasonIndex);
  }

  const nextTier = tierFromMonths(nextProgressMonths);

  await updateDoc(ref, {
    seasonIndex: nextSeasonIndex,
    tier: nextTier,
    tierProgressMonths: nextProgressMonths,
    lastLoginAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return {
    oldTier: storedTier,
    newTier: nextTier,
    oldSeasonIndex: storedSeasonIndex,
    newSeasonIndex: nextSeasonIndex,
  };
}

$("loginBtn")?.addEventListener("click", async () => {
  msg("");

  const email = $("loginId").value.trim().toLowerCase();
  const pw = $("loginPw").value;

  if (!email || !pw) return msg("⚠️ 이메일 + 비밀번호 입력해줘");
  if (!email.includes("@")) return msg("⚠️ 이메일 형식이 아님");

  try {
    persistRememberedEmail(email);
    const cred = await signInWithEmailAndPassword(auth, email, pw);

    const updated = await postLoginUpdate(cred.user.uid);
    if (updated) {
      window.alert(buildSeasonPopupText(updated));
    }

    msg("✅ 로그인 성공! feed로 이동");
    location.href = "./index.html";
  } catch (e) {
    msg(`❌ 로그인 실패: ${e.code || e.message}`);
  }
});
