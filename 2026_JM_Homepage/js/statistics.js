import { db } from "./firebase-init.js";
import { whenAuthReady } from "./auth-state.js";
import {
  collection,
  getDocs,
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";

const BASE_SEASON_START = new Date(2026, 2, 1);
const TIER_ORDER = ["QFN", "LGA", "FCCSP", "POP", "MCM", "2.5D"];

const seasonFilter = document.getElementById("seasonFilter");
const memberFilter = document.getElementById("memberFilter");
const refreshBtn = document.getElementById("refreshBtn");
const statsMessage = document.getElementById("statsMessage");
const statsSummary = document.getElementById("statsSummary");
const requestChartMeta = document.getElementById("requestChartMeta");
const eventChartMeta = document.getElementById("eventChartMeta");
const statsGrid = document.querySelector(".stats-grid");

const chartEls = {
  requestMonthlyChart: document.getElementById("requestMonthlyChart"),
  eventMonthlyChart: document.getElementById("eventMonthlyChart"),
  posterLikesChart: document.getElementById("posterLikesChart"),
  posterCommentsChart: document.getElementById("posterCommentsChart"),
  developerLikesChart: document.getElementById("developerLikesChart"),
  developerCommentsChart: document.getElementById("developerCommentsChart"),
  currentTierChart: document.getElementById("currentTierChart"),
  memberSeasonCountChart: document.getElementById("memberSeasonCountChart"),
  seasonSignupChart: document.getElementById("seasonSignupChart"),
};


function setStatsLoading(isLoading) {
  if (!statsGrid) return;
  statsGrid.classList.toggle("is-loading", isLoading);
}

const state = {
  currentUser: null,
  users: [],
  posts: [],
  maxSeasonIndex: 1,
};

function toDate(value) {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function startOfDay(value = new Date()) {
  const d = new Date(value);
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

function formatMonthKey(dateLike) {
  const d = toDate(dateLike);
  if (!d) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function formatSeasonLabel(seasonIndex) {
  const idx = Number(seasonIndex) || 1;
  const start = getSeasonStartByIndex(idx);
  const end = new Date(getSeasonEndByIndex(idx).getTime() - 86400000);
  return `시즌 ${idx} (${start.getFullYear()}.${String(start.getMonth() + 1).padStart(2, "0")}~${end.getFullYear()}.${String(end.getMonth() + 1).padStart(2, "0")})`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getUserName(user) {
  return user?.name || user?.email || "회원";
}

function getMemberMap() {
  return new Map(state.users.map((user) => [user.uid, user]));
}

function getCurrentSeasonCount(user) {
  return 1 + Math.max(0, Math.floor((Number(user?.tierProgressMonths) || 0) / 6));
}

function seasonMatches(dateLike, seasonValue) {
  if (seasonValue === "all") return true;
  const d = toDate(dateLike);
  if (!d) return false;
  return calcSeasonIndex(d) === Number(seasonValue);
}

function buildMonthRange(posts) {
  const seasonValue = seasonFilter.value || "all";
  const scopedDates = posts
    .map((post) => toDate(post.createdAt))
    .filter((date) => seasonMatches(date, seasonValue))
    .sort((a, b) => a - b);

  if (seasonValue !== "all") {
    const idx = Number(seasonValue);
    const start = getSeasonStartByIndex(idx);
    const end = getSeasonEndByIndex(idx);
    const result = [];
    const cursor = new Date(start);
    while (cursor < end) {
      result.push(formatMonthKey(cursor));
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return result;
  }

  if (!scopedDates.length) return [];

  const start = new Date(scopedDates[0].getFullYear(), scopedDates[0].getMonth(), 1);
  const end = new Date(scopedDates[scopedDates.length - 1].getFullYear(), scopedDates[scopedDates.length - 1].getMonth(), 1);
  const result = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    result.push(formatMonthKey(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return result;
}

function filterPostsByControls(type) {
  const seasonValue = seasonFilter.value || "all";
  const memberValue = memberFilter.value || "all";
  return state.posts.filter((post) => {
    if (type && post.type !== type) return false;
    if (!seasonMatches(post.createdAt, seasonValue)) return false;
    if (memberValue !== "all" && post.createdBy !== memberValue) return false;
    return true;
  });
}

function filterUsersBySeason(users) {
  const seasonValue = seasonFilter.value || "all";
  if (seasonValue === "all") return [...users];
  return users.filter((user) => seasonMatches(user.createdAt, seasonValue) || Number(user.seasonIndex) >= Number(seasonValue));
}

function renderEmpty(el, text) {
  if (!el) return;
  el.innerHTML = `<div class="empty-state">${escapeHtml(text)}</div>`;
}

function renderBarList(el, rows, valueSuffix = "") {
  if (!el) return;
  if (!rows.length) {
    renderEmpty(el, "표시할 데이터가 없습니다.");
    return;
  }
  const max = Math.max(...rows.map((row) => row.value), 1);
  el.innerHTML = `
    <div class="bar-list">
      ${rows.map((row) => `
        <div class="bar-row">
          <div class="bar-label">${escapeHtml(row.label)}</div>
          <div class="bar-track"><span class="bar-fill" style="width:${Math.max(4, (row.value / max) * 100)}%"></span></div>
          <div class="bar-value">${escapeHtml(`${row.value}${valueSuffix}`)}</div>
        </div>
      `).join("")}
    </div>
  `;
}

function renderMonthlyChart(el, type) {
  if (!el) return;
  const posts = filterPostsByControls(type);
  const monthKeys = buildMonthRange(state.posts.filter((post) => post.type === type));
  const countMap = new Map(monthKeys.map((key) => [key, 0]));
  posts.forEach((post) => {
    const key = formatMonthKey(post.createdAt);
    if (!key) return;
    countMap.set(key, (countMap.get(key) || 0) + 1);
  });
  const rows = [...countMap.entries()].map(([label, value]) => ({ label, value }));
  const max = Math.max(...rows.map((row) => row.value), 1);

  if (!rows.length) {
    renderEmpty(el, "표시할 월별 데이터가 없습니다.");
    return;
  }

  el.innerHTML = `
    <div class="legend-inline">
      <span class="legend-chip"><span class="legend-dot"></span>${type === "request" ? "Request" : "Event"} 게시물 수</span>
    </div>
    <div class="month-list">
      ${rows.map((row) => `
        <div class="month-row">
          <div class="month-label">${escapeHtml(row.label)}</div>
          <div class="month-track"><span class="month-fill" style="width:${Math.max(4, (row.value / max) * 100)}%"></span></div>
          <div class="month-value">${row.value}건</div>
        </div>
      `).join("")}
    </div>
  `;
}

function aggregatePosterMetrics(metricKey) {
  const seasonValue = seasonFilter.value || "all";
  const memberMap = getMemberMap();
  const totals = new Map();
  state.posts.forEach((post) => {
    if (!seasonMatches(post.createdAt, seasonValue)) return;
    const uid = post.createdBy;
    const value = metricKey === "likes"
      ? (Array.isArray(post.likedByUids) ? post.likedByUids.length : Number(post.likesCount) || 0)
      : (Array.isArray(post.comments) ? post.comments.length : Number(post.commentsCount) || 0);
    totals.set(uid, (totals.get(uid) || 0) + value);
  });
  return [...totals.entries()]
    .map(([uid, value]) => ({ label: getUserName(memberMap.get(uid)), value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, "ko"));
}

function aggregateDeveloperMetrics(metricKey) {
  const seasonValue = seasonFilter.value || "all";
  const memberMap = getMemberMap();
  const totals = new Map();
  state.posts.forEach((post) => {
    if (!seasonMatches(post.createdAt, seasonValue)) return;
    const devUids = Array.isArray(post.assignedDeveloperUids) ? post.assignedDeveloperUids : [];
    if (!devUids.length) return;
    const value = metricKey === "likes"
      ? (Array.isArray(post.likedByUids) ? post.likedByUids.length : Number(post.likesCount) || 0)
      : (Array.isArray(post.comments) ? post.comments.length : Number(post.commentsCount) || 0);
    devUids.forEach((uid) => {
      totals.set(uid, (totals.get(uid) || 0) + value);
    });
  });
  return [...totals.entries()]
    .map(([uid, value]) => ({ label: getUserName(memberMap.get(uid)), value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, "ko"));
}

function renderTierChart() {
  const el = chartEls.currentTierChart;
  const rows = filterUsersBySeason(state.users)
    .map((user) => ({
      label: getUserName(user),
      value: Math.max(1, TIER_ORDER.indexOf(user.tier || "QFN") + 1),
      tier: user.tier || "QFN",
    }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, "ko"));

  if (!rows.length) {
    renderEmpty(el, "회원 데이터가 없습니다.");
    return;
  }

  const max = TIER_ORDER.length;
  el.innerHTML = `
    <div class="note-text">QFN → LGA → FCCSP → POP → MCM → 2.5D 순서로 표시됩니다.</div>
    <div class="tier-list">
      ${rows.map((row) => `
        <div class="tier-row">
          <div class="tier-label">${escapeHtml(row.label)}</div>
          <div class="tier-track"><span class="tier-fill" style="width:${(row.value / max) * 100}%"></span></div>
          <div class="tier-value">${escapeHtml(row.tier)}</div>
        </div>
      `).join("")}
    </div>
  `;
}

function renderSeasonCountChart() {
  const el = chartEls.memberSeasonCountChart;
  const rows = filterUsersBySeason(state.users)
    .map((user) => ({ label: getUserName(user), value: getCurrentSeasonCount(user) }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, "ko"));
  if (!rows.length) {
    renderEmpty(el, "회원 데이터가 없습니다.");
    return;
  }
  const max = Math.max(...rows.map((row) => row.value), 1);
  el.innerHTML = `
    <div class="note-text">누적 시즌 수는 현재 데이터 구조상 <strong>1 + tierProgressMonths / 6</strong> 기준으로 계산했습니다.</div>
    <div class="bar-list">
      ${rows.map((row) => `
        <div class="bar-row">
          <div class="bar-label">${escapeHtml(row.label)}</div>
          <div class="bar-track"><span class="bar-fill" style="width:${Math.max(4, (row.value / max) * 100)}%"></span></div>
          <div class="bar-value">${row.value}회</div>
        </div>
      `).join("")}
    </div>
  `;
}

function renderSeasonSignupChart() {
  const el = chartEls.seasonSignupChart;
  const seasonValue = seasonFilter.value || "all";
  const totals = new Map();
  state.users.forEach((user) => {
    const seasonIndex = user.createdSeasonIndex || 1;
    if (seasonValue !== "all" && seasonIndex !== Number(seasonValue)) return;
    totals.set(seasonIndex, (totals.get(seasonIndex) || 0) + 1);
  });
  const rows = [...totals.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([seasonIndex, value]) => ({ label: `시즌 ${seasonIndex}`, value, full: formatSeasonLabel(seasonIndex) }));

  if (!rows.length) {
    renderEmpty(el, "회원 가입 데이터가 없습니다.");
    return;
  }

  const max = Math.max(...rows.map((row) => row.value), 1);
  el.innerHTML = `
    <div class="note-text">회원 createdAt 기준으로 시즌을 계산했습니다.</div>
    <div class="bar-list">
      ${rows.map((row) => `
        <div class="bar-row">
          <div class="bar-label">${escapeHtml(row.full)}</div>
          <div class="bar-track"><span class="bar-fill" style="width:${Math.max(4, (row.value / max) * 100)}%"></span></div>
          <div class="bar-value">${row.value}명</div>
        </div>
      `).join("")}
    </div>
  `;
}

function updateSummary() {
  const seasonValue = seasonFilter.value || "all";
  const memberValue = memberFilter.value || "all";
  const seasonText = seasonValue === "all" ? "전체 시즌" : formatSeasonLabel(seasonValue);
  const member = memberValue === "all" ? null : state.users.find((user) => user.uid === memberValue);
  const memberText = member ? getUserName(member) : "전체 회원";
  const scopedPosts = state.posts.filter((post) => seasonMatches(post.createdAt, seasonValue));
  const requestCount = scopedPosts.filter((post) => post.type === "request").length;
  const eventCount = scopedPosts.filter((post) => post.type === "event").length;
  statsSummary.textContent = `${seasonText}\n대상 회원: ${memberText}\nRequest ${requestCount}건 · Event ${eventCount}건`;
  requestChartMeta.textContent = `${seasonText} · ${memberText}`;
  eventChartMeta.textContent = `${seasonText} · ${memberText}`;
}

function renderAll() {
  updateSummary();
  renderMonthlyChart(chartEls.requestMonthlyChart, "request");
  renderMonthlyChart(chartEls.eventMonthlyChart, "event");
  renderBarList(chartEls.posterLikesChart, aggregatePosterMetrics("likes"), "개");
  renderBarList(chartEls.posterCommentsChart, aggregatePosterMetrics("comments"), "개");
  renderBarList(chartEls.developerLikesChart, aggregateDeveloperMetrics("likes"), "개");
  renderBarList(chartEls.developerCommentsChart, aggregateDeveloperMetrics("comments"), "개");
  renderTierChart();
  renderSeasonCountChart();
  renderSeasonSignupChart();
}

function populateFilters() {
  const maxSeason = Math.max(state.maxSeasonIndex, ...state.users.map((user) => Number(user.seasonIndex) || 1), ...state.users.map((user) => Number(user.createdSeasonIndex) || 1), 1);
  seasonFilter.innerHTML = `<option value="all">전체 시즌</option>${Array.from({ length: maxSeason }, (_, idx) => idx + 1).map((seasonIndex) => `<option value="${seasonIndex}">${escapeHtml(formatSeasonLabel(seasonIndex))}</option>`).join("")}`;
  memberFilter.innerHTML = `<option value="all">전체 회원</option>${state.users
    .slice()
    .sort((a, b) => getUserName(a).localeCompare(getUserName(b), "ko"))
    .map((user) => `<option value="${escapeHtml(user.uid)}">${escapeHtml(getUserName(user))}</option>`)
    .join("")}`;
}

async function loadData() {
  statsMessage.textContent = "데이터를 불러오는 중...";
  setStatsLoading(true);
  const [usersSnap, postsSnap] = await Promise.all([
    getDocs(collection(db, "users")),
    getDocs(collection(db, "posts")),
  ]);

  state.users = usersSnap.docs.map((snap) => {
    const data = snap.data();
    const createdAt = toDate(data.createdAt);
    return {
      ...data,
      uid: data.uid || snap.id,
      createdAt,
      createdSeasonIndex: createdAt ? calcSeasonIndex(createdAt) : Math.max(1, Number(data.seasonIndex) || 1),
    };
  });

  state.posts = postsSnap.docs.map((snap) => {
    const data = snap.data();
    return {
      id: snap.id,
      ...data,
      createdAt: toDate(data.createdAt),
    };
  });

  state.maxSeasonIndex = Math.max(
    1,
    ...state.posts.map((post) => post.createdAt ? calcSeasonIndex(post.createdAt) : 1),
    ...state.users.map((user) => Number(user.seasonIndex) || 1),
    ...state.users.map((user) => Number(user.createdSeasonIndex) || 1),
  );

  populateFilters();
  renderAll();
  statsMessage.textContent = `총 회원 ${state.users.length}명 / 총 게시물 ${state.posts.length}건을 기준으로 집계했습니다.`;
  window.setTimeout(() => setStatsLoading(false), 140);
}

async function init() {
  const user = await whenAuthReady();
  state.currentUser = user || null;
  await loadData();

  seasonFilter.addEventListener("change", renderAll);
  memberFilter.addEventListener("change", renderAll);
  refreshBtn.addEventListener("click", loadData);
}

init().catch((error) => {
  console.error(error);
  statsMessage.textContent = `통계 페이지 로딩 실패: ${error.message || error}`;
  setStatsLoading(false);
  Object.values(chartEls).forEach((el) => renderEmpty(el, "데이터를 불러오지 못했습니다."));
});
