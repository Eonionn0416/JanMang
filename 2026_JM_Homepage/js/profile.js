import { auth, db } from "./firebase-init.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
import {
  doc,
  getDoc,
  updateDoc,
  serverTimestamp,
  collection,
  getDocs,
  orderBy,
  query,
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";

function $(id) { return document.getElementById(id); }
function msg(t, isError = false) {
  const el = $("profileMsg");
  if (!el) return;
  el.textContent = t || "";
  el.style.color = isError ? "crimson" : "";
}
function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
function formatDate(ts) {
  if (!ts?.toDate) return "—";
  const d = ts.toDate();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
}
function roleLabel(role) {
  if (role === "developer") return "개발자";
  if (role === "admin") return "관리자";
  if (role === "finance") return "총무";
  return "일반";
}
function statusLabel(status, type) {
  if (!status) return type === "event" ? "Event" : "Request";
  if (status === "request") return "Request";
  if (status === "present") return "Present";
  if (status === "developing") return "Developing";
  if (status === "management") return "Management";
  return status;
}

const TIER_RULES = [
  { code: "QFN", label: "Sign in~6개월" },
  { code: "LGA", label: "7개월~12개월" },
  { code: "FCCSP", label: "13개월~18개월" },
  { code: "POP", label: "19개월~24개월" },
  { code: "MCM", label: "25개월~30개월" },
  { code: "2.5D", label: "31개월~" },
];
const BASE_SEASON_START = new Date(2026, 2, 1);

function startOfDay(dateLike) {
  const d = new Date(dateLike);
  d.setHours(0, 0, 0, 0);
  return d;
}

function calcSeasonIndex(dateLike = new Date()) {
  const d = startOfDay(dateLike);
  const y = d.getFullYear();
  const m = d.getMonth() + 1;

  let seasonYear = y;
  let seasonInYear = 1;

  if (m >= 3 && m <= 8) {
    seasonInYear = 1;
  } else {
    seasonInYear = 2;
    if (m === 1 || m === 2) seasonYear = y - 1;
  }

  return Math.max(1, ((seasonYear - 2026) * 2) + seasonInYear);
}

function getSeasonStartByIndex(seasonIndex) {
  const idx = Math.max(1, Number(seasonIndex) || 1);
  const start = new Date(BASE_SEASON_START);
  start.setMonth(start.getMonth() + ((idx - 1) * 6));
  return startOfDay(start);
}

function getSeasonEndByIndex(seasonIndex) {
  const start = getSeasonStartByIndex(seasonIndex);
  const end = new Date(start);
  end.setMonth(end.getMonth() + 6);
  return startOfDay(end);
}

function formatSeasonLabel(seasonIndex) {
  const idx = Math.max(1, Number(seasonIndex) || 1);
  const start = getSeasonStartByIndex(idx);
  const end = new Date(getSeasonEndByIndex(idx).getTime() - 86400000);
  return `시즌 ${idx} (${start.getFullYear()}.${String(start.getMonth() + 1).padStart(2, "0")}~${end.getFullYear()}.${String(end.getMonth() + 1).padStart(2, "0")})`;
}

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value?.toDate === "function") return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function renderTierSummary(currentTier = "QFN") {
  const tier = TIER_RULES.some((row) => row.code === currentTier) ? currentTier : "QFN";
  return `
    <div class="profile-tier-stack">
      <div class="profile-current-line">현재 등급: <strong>${escapeHtml(tier)}</strong></div>
      <div class="profile-tier-list">
        ${TIER_RULES.map((row) => `
          <div class="profile-tier-item ${row.code === tier ? "is-active" : ""}">
            <span>${escapeHtml(row.label)}</span>
            <span>${escapeHtml(row.code)}</span>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function renderSeasonSummary(user = {}) {
  const currentSeasonIndex = Math.max(1, Number(user.seasonIndex) || 1);
  const createdSeasonIndex = Math.max(1, Number(user.createdSeasonIndex) || calcSeasonIndex(toDate(user.createdAt) || new Date()));
  const seasonItems = [];
  for (let idx = createdSeasonIndex; idx <= currentSeasonIndex; idx += 1) seasonItems.push(idx);
  const totalSeasons = seasonItems.length || 1;

  return `
    <div class="profile-season-stack">
      <div class="profile-current-line">현재 시즌: <strong>${escapeHtml(formatSeasonLabel(currentSeasonIndex))}</strong></div>
      <div class="profile-subline">누적 시즌: ${totalSeasons}개</div>
      <div class="profile-season-chip-list">
        ${seasonItems.map((idx) => `
          <span class="profile-season-chip ${idx === currentSeasonIndex ? "is-active" : ""}">${escapeHtml(formatSeasonLabel(idx))}</span>
        `).join("")}
      </div>
    </div>
  `;
}

let currentUid = null;
let viewingUid = null;
let isReadonlyView = false;
const PROFILE_POST_PAGE_SIZE = 8;

function showPostsSkeleton(count = 4) {
  const grid = $("myPostsGrid");
  if (!grid) return;
  grid.innerHTML = Array.from({ length: count }, (_, index) => `
    <article class="card card-skeleton" aria-hidden="true" style="--enter-delay:${index * 45}ms">
      <div class="card-image skeleton-block"></div>
      <div class="skeleton-line skeleton-line-lg"></div>
      <div class="skeleton-line skeleton-line-sm"></div>
      <div class="skeleton-line skeleton-line-md"></div>
      <div class="skeleton-line skeleton-line-full"></div>
    </article>
  `).join("");
}

function wireCardImageMotion(card) {
  const wrap = card.querySelector(".card-image-wrap");
  const img = card.querySelector("img.card-image");
  if (!wrap || !img) return;

  const finish = () => wrap.classList.remove("is-loading");
  if (img.complete) {
    finish();
    return;
  }
  img.addEventListener("load", finish, { once: true });
  img.addEventListener("error", finish, { once: true });
}

function buildPostCard(item, index = 0) {
  const card = document.createElement("article");
  card.className = "card";
  card.style.setProperty("--enter-delay", `${index * 45}ms`);
  const title = escapeHtml(item.title || item.programName || "Untitled");
  const body = escapeHtml(item.body || item.description || "").replaceAll("\n", "<br/>");
  const uploaded = formatDate(item.createdAt || item.updatedAt);
  const badgeText = escapeHtml(statusLabel(item.status, item.type));
  const author = escapeHtml(item.createdByName || item.createdByEmail || "—");
  const imageUrl = item.imageUrl || item.attachmentUrl || "";
  const shouldPrioritizeImage = index < 2;
  card.innerHTML = `
    ${imageUrl
      ? `<div class="card-image-wrap is-loading"><img class="card-image" src="${escapeHtml(imageUrl)}" alt="${title}" loading="${shouldPrioritizeImage ? "eager" : "lazy"}" fetchpriority="${shouldPrioritizeImage ? "high" : "low"}" decoding="async"></div>`
      : `<div class="card-image placeholder">${escapeHtml((item.type || "post").toUpperCase())}</div>`}
    <div class="card-head">
      <div class="card-title">${title}</div>
      <span class="badge">${badgeText}</span>
    </div>
    <div class="card-meta">Upload: ${uploaded}</div>
    <div class="card-meta">Writer: ${author}</div>
    <div class="card-body">${body || "설명이 없습니다."}</div>
  `;
  wireCardImageMotion(card);
  card.addEventListener("click", () => {
    location.href = `./${item.type === "request" ? "post.request.html" : "post.html"}?id=${encodeURIComponent(item.id)}`;
  });
  return card;
}

function renderEmptyPosts(message) {
  const grid = $("myPostsGrid");
  if (!grid) return;
  grid.innerHTML = `<article class="card profile-empty-card" style="--enter-delay:0ms"><div class="card-title">${escapeHtml(message)}</div></article>`;
}

function setReadonlyState(readonly) {
  isReadonlyView = readonly;
  $("pDept").disabled = readonly;
  $("pName").disabled = readonly;
  $("pRank").disabled = readonly;
  $("saveProfileBtn").style.display = readonly ? "none" : "inline-flex";

  let badge = document.querySelector(".profile-viewing-badge");
  if (readonly) {
    if (!badge) {
      badge = document.createElement("div");
      badge.className = "badge profile-viewing-badge";
      document.querySelector(".profile-info-box")?.appendChild(badge);
    }
    badge.textContent = "다른 회원 프로필 조회 중";
    document.title = "Profile";
    document.querySelector(".brand-title").textContent = "Profile";
    $("profilePostsKicker").textContent = "Member posts";
    $("profilePostsTitle").textContent = "회원 게시물";
    $("profilePostsDesc").textContent = "해당 회원이 작성했거나 assign developer로 연결된 게시물을 보여줍니다.";
  } else {
    if (badge) badge.remove();
    document.title = "My Profile";
    document.querySelector(".brand-title").textContent = "My Profile";
    $("profilePostsKicker").textContent = "My posts";
    $("profilePostsTitle").textContent = "내 게시물";
    $("profilePostsDesc").textContent = "내가 작성한 게시물과 assign developer에 내 이름이 올라간 게시물을 보여줍니다.";
  }
}

async function loadPostsFor(uid) {
  const grid = $("myPostsGrid");
  if (!grid) return;
  showPostsSkeleton();
  try {
    const qs = await getDocs(query(collection(db, "posts"), orderBy("createdAt", "desc")));
    const rows = qs.docs.map((snap) => ({ id: snap.id, ...snap.data() }))
      .sort((a, b) => {
        const aMs = a?.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
        const bMs = b?.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
        return bMs - aMs;
      })
      .filter((item) => {
      const assigned = Array.isArray(item.assignedDeveloperUids) ? item.assignedDeveloperUids : [];
      return item.createdBy === uid || assigned.includes(uid);
    }).slice(0, PROFILE_POST_PAGE_SIZE);
    if (!rows.length) return renderEmptyPosts("표시할 게시물이 없습니다.");
    grid.innerHTML = "";

    let cursor = 0;
    const chunkSize = 2;
    const appendChunk = () => {
      const fragment = document.createDocumentFragment();
      rows.slice(cursor, cursor + chunkSize).forEach((item, offset) => {
        fragment.appendChild(buildPostCard(item, cursor + offset));
      });
      grid.appendChild(fragment);
      cursor += chunkSize;
      if (cursor < rows.length) requestAnimationFrame(appendChunk);
    };

    requestAnimationFrame(appendChunk);
  } catch (e) {
    console.error("loadPostsFor error:", e);
    renderEmptyPosts("게시물을 불러오지 못했습니다.");
  }
}

async function loadProfile(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) {
    msg("⚠️ 프로필 문서가 없습니다(users/{uid}).", true);
    return;
  }
  const u = snap.data();
  $("pSite").textContent = u.site || "—";
  $("pEmail").textContent = u.email || "—";
  $("pEmpId").textContent = u.empId || "—";
  $("pDept").value = u.dept || "";
  $("pName").value = u.name || "";
  $("pRank").value = u.rank || "";
  $("pRole").textContent = roleLabel(u.role || "member");
  $("pTier").innerHTML = renderTierSummary(u.tier || "QFN");
  $("pSeason").innerHTML = renderSeasonSummary(u);

  const adminBtn = $("adminBtn");
  if (adminBtn) {
    if (!isReadonlyView && (u.role || "member") === "admin") {
      adminBtn.style.display = "inline-flex";
      adminBtn.onclick = () => { location.href = "./admin.html"; };
    } else {
      adminBtn.style.display = "none";
    }
  }

  await loadPostsFor(uid);
}

async function saveProfile() {
  msg("");
  if (!currentUid || isReadonlyView) return;
  try {
    await updateDoc(doc(db, "users", currentUid), {
      dept: $("pDept").value.trim(),
      name: $("pName").value.trim(),
      rank: $("pRank").value.trim(),
      updatedAt: serverTimestamp(),
    });
    msg("✅ 저장 완료");
    await loadProfile(currentUid);
  } catch (e) {
    msg(`❌ 저장 실패: ${e.code || e.message}`, true);
  }
}

$("saveProfileBtn")?.addEventListener("click", saveProfile);
$("logoutBtn")?.addEventListener("click", async () => {
  await signOut(auth);
  location.href = "./index.html";
});

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    location.href = "./index.html";
    return;
  }
  document.body.classList.add("profile-is-loading");
  showPostsSkeleton();
  currentUid = user.uid;
  viewingUid = new URLSearchParams(location.search).get("uid") || user.uid;
  setReadonlyState(viewingUid !== currentUid);
  await loadProfile(viewingUid);
  document.body.classList.remove("profile-is-loading");
});
