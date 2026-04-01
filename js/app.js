import { db } from "./firebase-init.js";
import { whenAuthReady } from "./auth-state.js";
import {
  collection,
  getDocs,
  orderBy,
  query,
  where,
  doc,
  getDoc,
  updateDoc,
  addDoc,
  deleteDoc,
  serverTimestamp,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";

const cardsGrid = document.getElementById("cardsGrid");
const sentinel = document.getElementById("sentinel");
const filterSelect = document.getElementById("filterSelect");
const filterDropdown = document.getElementById("filterDropdown");
const filterDropdownBtn = document.getElementById("filterDropdownBtn");
const filterDropdownLabel = document.getElementById("filterDropdownLabel");
const filterDropdownPanel = document.getElementById("filterDropdownPanel");
const searchInput = document.getElementById("searchInput");
const applyFilterBtn = document.getElementById("applyFilterBtn");
const memberSearchPanel = document.getElementById("memberSearchPanel");
const memberSearchList = document.getElementById("memberSearchList");
const notificationBtn = document.getElementById("notificationBtn");
const notificationDot = document.getElementById("notificationDot");
const notificationModal = document.getElementById("notificationModal");
const closeNotificationBtn = document.getElementById("closeNotificationBtn");
const notificationList = document.getElementById("notificationList");
const markAllNotificationsReadBtn = document.getElementById("markAllNotificationsReadBtn");
const deleteAllNotificationsBtn = document.getElementById("deleteAllNotificationsBtn");
const directMessageBtn = document.getElementById("directMessageBtn");
const directMessageDot = document.getElementById("directMessageDot");
const directMessageModal = document.getElementById("directMessageModal");
const closeDirectMessageBtn = document.getElementById("closeDirectMessageBtn");
const newDmBtn = document.getElementById("newDmBtn");
const directThreadList = document.getElementById("directThreadList");
const directMessageEmpty = document.getElementById("directMessageEmpty");
const directMessagePanel = document.getElementById("directMessagePanel");
const directMessageHeader = document.getElementById("directMessageHeader");
const directMessageHistory = document.getElementById("directMessageHistory");
const directMessageInput = document.getElementById("directMessageInput");
const sendDirectMessageBtn = document.getElementById("sendDirectMessageBtn");
const memberPickerModal = document.getElementById("memberPickerModal");
const closeMemberPickerBtn = document.getElementById("closeMemberPickerBtn");
const memberPickerTitle = document.getElementById("memberPickerTitle");
const memberPickerSearchInput = document.getElementById("memberPickerSearchInput");
const memberPickerList = document.getElementById("memberPickerList");
const likesModal = document.getElementById("likesModal");
const closeLikesModalBtn = document.getElementById("closeLikesModalBtn");
const likesModalList = document.getElementById("likesModalList");
const reactionsModalTitle = document.getElementById("reactionsModalTitle");
const reactionsCommentList = document.getElementById("reactionsCommentList");
const reactionsCommentInput = document.getElementById("reactionsCommentInput");
const reactionsCommentSubmitBtn = document.getElementById("reactionsCommentSubmitBtn");
const reactionsCommentCancelBtn = document.getElementById("reactionsCommentCancelBtn");
const eventDayModal = document.getElementById("eventDayModal");
const eventDayModalTitle = document.getElementById("eventDayModalTitle");
const eventDayModalList = document.getElementById("eventDayModalList");
const miniCalendar = document.getElementById("miniCalendar");
let memberSearchPanelOpen = false;
let miniCalendarTimerId = null;
const guideModal = document.getElementById("guideModal");
const guideConfirmBtn = document.getElementById("guideConfirmBtn");

let allItems = [];
let allUsers = [];
let currentUser = null;
let currentProfile = null;
let renderedCount = 0;
let directThreads = [];
let activeThreadId = "";
let memberPickerMode = "chat";
let pendingForwardItem = null;
let currentThreadMessages = [];
let activeReactionPostId = "";
let activeReactionEditCommentId = "";
const PAGE_SIZE = 9;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function typeLabel(type) {
  if (type === "request") return "Request";
  if (type === "event") return "Event";
  if (type === "notice") return "Notice";
  return type || "Post";
}

function statusLabel(status, type) {
  if (!status) return typeLabel(type);
  if (status === "request") return "Request";
  if (status === "present") return "Present";
  if (status === "developing") return "Developing";
  if (status === "management") return "Management";
  return status;
}

function formatDate(ts) {
  if (!ts) return "—";
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  if (Number.isNaN(d.getTime())) return "—";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
}

function formatDateTime(ts) {
  if (!ts) return "—";
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("ko-KR");
}

function getProfileName() {
  return currentProfile?.name || currentUser?.email || "회원";
}

function getUserLabel(user) {
  return user?.name || user?.email || "회원";
}

function getUserByUid(uid) {
  return allUsers.find((user) => user.uid === uid) || null;
}

function getFavoritesKey() {
  return `favorite_members_${currentUser?.uid || "guest"}`;
}

function getFavoriteMembers() {
  try {
    return JSON.parse(localStorage.getItem(getFavoritesKey()) || "[]");
  } catch {
    return [];
  }
}

function setFavoriteMembers(values) {
  localStorage.setItem(getFavoritesKey(), JSON.stringify(values));
}

function isFavoriteMember(uid) {
  return getFavoriteMembers().includes(uid);
}

function toggleFavoriteMember(uid) {
  const next = new Set(getFavoriteMembers());
  if (next.has(uid)) next.delete(uid); else next.add(uid);
  setFavoriteMembers([...next]);
  renderMemberSearchResults();
}


function syncFilterDropdownUI() {
  const value = filterSelect?.value || "all";
  const activeOption = filterDropdownPanel?.querySelector(`[data-filter-value="${value}"]`);
  if (filterDropdownLabel) {
    filterDropdownLabel.textContent = activeOption?.textContent?.trim() || filterSelect?.selectedOptions?.[0]?.textContent || "전체";
  }
  filterDropdownPanel?.querySelectorAll(".filter-option").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.filterValue === value);
  });
}

function openFilterDropdown() {
  if (!filterDropdown || !filterDropdownPanel) return;
  filterDropdownPanel.hidden = false;
  requestAnimationFrame(() => {
    filterDropdown.classList.add("is-open");
    filterDropdownPanel.classList.add("is-open");
    filterDropdownPanel.classList.remove("is-closing");
    filterDropdownBtn?.setAttribute("aria-expanded", "true");
  });
}

function closeFilterDropdown() {
  if (!filterDropdown || !filterDropdownPanel || filterDropdownPanel.hidden) return;
  filterDropdown.classList.remove("is-open");
  filterDropdownPanel.classList.remove("is-open");
  filterDropdownPanel.classList.add("is-closing");
  filterDropdownBtn?.setAttribute("aria-expanded", "false");
  window.setTimeout(() => {
    filterDropdownPanel.hidden = true;
    filterDropdownPanel.classList.remove("is-closing");
  }, 180);
}

function toggleFilterDropdown() {
  if (filterDropdownPanel?.hidden) openFilterDropdown();
  else closeFilterDropdown();
}

function getFilteredItems() {
  const sel = filterSelect?.value || "all";
  const q = (searchInput?.value || "").trim().toLowerCase();
  return allItems.filter((item) => {
    const okType = sel === "all" ? true : item.type === sel;
    const target = [item.title, item.body, item.programName, item.description, item.createdByName, item.status].join(" ").toLowerCase();
    const okQuery = q.length === 0 ? true : target.includes(q);
    return okType && okQuery;
  });
}

function clearGrid() {
  cardsGrid.innerHTML = "";
  renderedCount = 0;
}

function renderLoadingSkeleton(count = PAGE_SIZE) {
  if (!cardsGrid) return;
  cardsGrid.innerHTML = Array.from({ length: count }, () => `
    <article class="card card-skeleton" aria-hidden="true">
      <div class="card-image skeleton-block"></div>
      <div class="skeleton-line skeleton-line-lg"></div>
      <div class="skeleton-line skeleton-line-sm"></div>
      <div class="skeleton-line skeleton-line-md"></div>
      <div class="skeleton-line skeleton-line-full"></div>
    </article>
  `).join("");
  renderedCount = 0;
}

function getMemberSearchRows() {
  const q = (searchInput?.value || "").trim().toLowerCase();
  const favorites = getFavoriteMembers();
  const rows = allUsers.filter((user) => {
    if (!q) return true;
    const target = [user.name, user.email, user.dept, user.rank, user.empId].join(" ").toLowerCase();
    return target.includes(q);
  });
  rows.sort((a, b) => {
    const af = favorites.includes(a.uid) ? 1 : 0;
    const bf = favorites.includes(b.uid) ? 1 : 0;
    if (af !== bf) return bf - af;
    return String(a.name || a.email || "").localeCompare(String(b.name || b.email || ""), "ko");
  });
  return rows;
}

function formatCalendarKey(value) {
  const d = value ? new Date(value) : new Date();
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function scheduleMiniCalendarRefresh() {
  if (miniCalendarTimerId) {
    clearTimeout(miniCalendarTimerId);
    miniCalendarTimerId = null;
  }
  const now = new Date();
  const nextRefreshAt = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 1, 0, 0);
  const delay = Math.max(60 * 1000, nextRefreshAt.getTime() - now.getTime());
  miniCalendarTimerId = window.setTimeout(() => {
    renderMiniCalendar();
    scheduleMiniCalendarRefresh();
  }, delay);
}

function renderMiniCalendar() {
  if (!miniCalendar) return;
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDate = new Date(year, month + 1, 0).getDate();
  const startWeekday = firstDay.getDay();
  const todayKey = formatCalendarKey(now);
  const eventDays = new Set(allItems.filter((item) => item.type === "event" && item.eventDate).map((item) => formatCalendarKey(item.eventDate)).filter(Boolean));
  const labels = ["일", "월", "화", "수", "목", "금", "토"];
  const cells = [];
  for (let i = 0; i < startWeekday; i += 1) cells.push(`<div class="mini-calendar-cell is-empty"></div>`);
  for (let day = 1; day <= lastDate; day += 1) {
    const dateKey = formatCalendarKey(new Date(year, month, day));
    cells.push(`<button class="mini-calendar-cell ${dateKey === todayKey ? "is-today" : ""} ${eventDays.has(dateKey) ? "has-event" : ""}" type="button" data-calendar-date="${dateKey}" ${eventDays.has(dateKey) ? "" : "disabled"}>${day}</button>`);
  }
  miniCalendar.innerHTML = `
    <div class="mini-calendar-head">${year}.${String(month + 1).padStart(2, "0")}</div>
    <div class="mini-calendar-weekdays">${labels.map((label) => `<div>${label}</div>`).join("")}</div>
    <div class="mini-calendar-grid">${cells.join("")}</div>
    <div class="card-meta">빨간 점 클릭 = 해당 날짜 event 목록</div>
  `;
}

function openEventDayModal(dateKey) {
  if (!eventDayModal || !eventDayModalList || !dateKey) return;
  const items = allItems
    .filter((item) => item.type === "event" && formatCalendarKey(item.eventDate) === dateKey)
    .sort((a, b) => new Date(a.eventDate || 0) - new Date(b.eventDate || 0));
  if (eventDayModalTitle) eventDayModalTitle.textContent = `${dateKey} Event List`;
  eventDayModalList.innerHTML = items.length ? `<div class="event-day-list">${items.map((item) => `
    <a class="event-day-link" href="${routeForPost(item)}">
      <div class="member-picker-name">${escapeHtml(item.title || "Untitled")}</div>
      <div class="member-picker-sub">${escapeHtml(item.createdByName || item.createdByEmail || "")}</div>
      <div class="card-meta">${escapeHtml(item.eventDate || "")}</div>
    </a>
  `).join("")}</div>` : `<div class="notification-empty">등록된 event가 없습니다.</div>`;
  openAnimatedModal(eventDayModal);
}

function closeEventDayModal() {
  closeAnimatedModal(eventDayModal);
}

function showMemberSearchPanel() {
  if (!memberSearchPanel) return;
  memberSearchPanelOpen = true;
  memberSearchPanel.hidden = false;
  memberSearchPanel.classList.remove("is-closing");
  requestAnimationFrame(() => memberSearchPanel.classList.add("is-open"));
}

function hideMemberSearchPanel() {
  if (!memberSearchPanel) return;
  memberSearchPanelOpen = false;
  memberSearchPanel.classList.remove("is-open");
  memberSearchPanel.classList.add("is-closing");
  window.setTimeout(() => {
    if (!memberSearchPanelOpen) {
      memberSearchPanel.hidden = true;
      memberSearchPanel.classList.remove("is-closing");
    }
  }, 180);
}

function renderMemberSearchResults() {
  if (!memberSearchPanel || !memberSearchList) return;
  if (!allUsers.length) {
    hideMemberSearchPanel();
    return;
  }
  const rows = getMemberSearchRows();
  if (memberSearchPanelOpen) showMemberSearchPanel(); else memberSearchPanel.hidden = true;
  if (!rows.length) {
    memberSearchList.innerHTML = `<div class="member-search-item"><div class="member-main"><div class="member-name">검색 결과 없음</div><div class="member-sub">회원이 없습니다.</div></div></div>`;
    return;
  }
  memberSearchList.innerHTML = rows.map((user) => `
    <div class="member-search-item" data-uid="${escapeHtml(user.uid)}">
      <button class="member-star ${isFavoriteMember(user.uid) ? "is-favorite" : ""}" type="button" data-star-uid="${escapeHtml(user.uid)}">★</button>
      <div class="member-main">
        <div class="member-name">${escapeHtml(user.name || user.email || "회원")}</div>
        <div class="member-sub">${escapeHtml(user.email || "")}${user.dept ? ` · ${escapeHtml(user.dept)}` : ""}${user.rank ? ` · ${escapeHtml(user.rank)}` : ""}</div>
      </div>
      <div class="member-role-badge">${escapeHtml(user.role || "member")}</div>
    </div>
  `).join("");
}

function buildLikesListHtml(item) {
  const rows = (Array.isArray(item?.likedByUids) ? item.likedByUids : [])
    .map((uid) => getUserByUid(uid))
    .filter(Boolean);

  return rows.length
    ? rows.map((user) => `
      <a class="member-picker-row" href="./profile.html?uid=${encodeURIComponent(user.uid || "")}">
        <div class="member-picker-name">${escapeHtml(getUserLabel(user))}</div>
        <div class="member-picker-sub">${escapeHtml(user.email || "")}</div>
      </a>
    `).join("")
    : `<div class="notification-empty">아직 좋아요를 누른 사람이 없습니다.</div>`;
}

function buildReactionCommentsHtml(item) {
  const comments = Array.isArray(item?.comments) ? item.comments : [];
  const rows = comments.slice().sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  return rows.length
    ? rows.map((comment) => {
      const mine = Boolean(currentUser?.uid && comment.uid === currentUser.uid);
      const editedLabel = comment.updatedAt ? ' · 수정됨' : '';
      return `
      <div class="comment-item ${mine ? "is-mine" : ""}">
        <div class="comment-meta">${escapeHtml(comment.name || "회원")} · ${escapeHtml(formatDateTime(comment.updatedAt || comment.createdAt))}${editedLabel}</div>
        <div class="comment-text">${escapeHtml(comment.text || "").replaceAll("\n", "<br>")}</div>
        ${mine ? `
        <div class="comment-actions">
          <button class="btn ghost-btn comment-action-btn" type="button" data-edit-comment="${escapeHtml(comment.id || "")}">수정</button>
          <button class="btn danger-btn comment-action-btn" type="button" data-delete-comment="${escapeHtml(comment.id || "")}">삭제</button>
        </div>` : ""}
      </div>`;
    }).join("")
    : `<div class="comment-item">아직 댓글이 없습니다.</div>`;
}

function resetReactionCommentComposer() {
  activeReactionEditCommentId = "";
  if (reactionsCommentInput) {
    reactionsCommentInput.value = "";
    reactionsCommentInput.placeholder = "댓글 입력";
  }
  if (reactionsCommentSubmitBtn) {
    reactionsCommentSubmitBtn.textContent = "등록";
  }
  if (reactionsCommentCancelBtn) {
    reactionsCommentCancelBtn.hidden = true;
  }
}

function renderReactionsModal(postId) {
  const item = allItems.find((row) => row.id === postId);
  if (!item || !likesModal || !likesModalList || !reactionsCommentList) return;
  activeReactionPostId = postId;
  if (reactionsModalTitle) {
    reactionsModalTitle.textContent = `${item.title || item.programName || "Untitled"} · 좋아요 / 댓글`;
  }
  likesModalList.innerHTML = buildLikesListHtml(item);
  reactionsCommentList.innerHTML = buildReactionCommentsHtml(item);
  if (reactionsCommentInput) {
    reactionsCommentInput.dataset.commentInput = postId;
  }
  if (reactionsCommentSubmitBtn) {
    reactionsCommentSubmitBtn.dataset.commentPost = postId;
  }
  if (!activeReactionEditCommentId) {
    resetReactionCommentComposer();
    if (reactionsCommentInput) reactionsCommentInput.dataset.commentInput = postId;
    if (reactionsCommentSubmitBtn) reactionsCommentSubmitBtn.dataset.commentPost = postId;
  }
}

function openLikesModal(postId) {
  renderReactionsModal(postId);
  openAnimatedModal(likesModal);
}

function closeLikesModal() {
  activeReactionPostId = "";
  resetReactionCommentComposer();
  if (reactionsCommentInput) {
    delete reactionsCommentInput.dataset.commentInput;
  }
  if (reactionsCommentSubmitBtn) {
    delete reactionsCommentSubmitBtn.dataset.commentPost;
  }
  closeAnimatedModal(likesModal);
}

function routeForPost(item) {
  return `./${item.type === "request" ? "post.request.html" : "post.html"}?id=${encodeURIComponent(item.id)}`;
}

function normalizeForwardPost(post = {}) {
  const normalized = {
    id: post.id || "",
    type: post.type || "post",
    title: post.title || post.programName || "Untitled",
    programName: post.programName || post.title || "",
    body: post.body || post.description || "",
    description: post.description || post.body || "",
  };
  normalized.route = post.route || (normalized.id ? routeForPost(normalized) : "");
  return normalized;
}

function getEventReadKey(uid = "guest") {
  return `read_event_posts_${uid}`;
}

function getEventReadState() {
  try {
    return JSON.parse(localStorage.getItem(getEventReadKey(currentUser?.uid || "guest")) || "{}");
  } catch {
    return {};
  }
}

function isEventUnread(item) {
  if (!currentUser || item.type !== "event") return false;
  return !getEventReadState()[item.id];
}

function getThreadReadKey() {
  return `read_dm_threads_${currentUser?.uid || "guest"}`;
}

function getThreadReadState() {
  try {
    return JSON.parse(localStorage.getItem(getThreadReadKey()) || "{}");
  } catch {
    return {};
  }
}

function setThreadReadState(state) {
  localStorage.setItem(getThreadReadKey(), JSON.stringify(state));
}

function markThreadRead(threadId) {
  const state = getThreadReadState();
  state[threadId] = new Date().toISOString();
  setThreadReadState(state);
}

function isThreadUnread(thread) {
  if (!thread?.id || !currentUser) return false;
  if ((thread.lastSenderUid || "") === currentUser.uid) return false;
  const lastAt = thread.lastMessageAt?.toDate ? thread.lastMessageAt.toDate() : new Date(thread.lastMessageAt || 0);
  if (Number.isNaN(lastAt.getTime())) return false;
  const readAt = new Date(getThreadReadState()[thread.id] || 0);
  return lastAt > readAt;
}


function buildCard(item) {
  const card = document.createElement("article");
  card.className = "card";
  card.dataset.type = item.type || "post";
  card.dataset.postId = item.id;

  const title = escapeHtml(item.title || item.programName || "Untitled");
  const body = escapeHtml(item.body || item.description || "").replaceAll("\n", "<br/>");
  const uploaded = formatDate(item.createdAt || item.updatedAt);
  const badgeText = escapeHtml(statusLabel(item.status, item.type));
  const author = escapeHtml(item.createdByName || item.createdByEmail || "—");
  const imageUrl = item.imageUrl || item.createdByProfileImageUrl || "";
  const liked = currentUser ? (Array.isArray(item.likedByUids) && item.likedByUids.includes(currentUser.uid)) : false;
  const commentsCount = Array.isArray(item.comments) ? item.comments.length : (item.commentsCount || 0);
  const likesCount = Array.isArray(item.likedByUids) ? item.likedByUids.length : (item.likesCount || 0);

  const shouldPrioritizeImage = renderedCount < 3;

  card.innerHTML = `
    ${imageUrl ? `
      <div class="card-image-wrap is-loading">
        <img
          class="card-image"
          src="${escapeHtml(imageUrl)}"
          alt="${title}"
          loading="${shouldPrioritizeImage ? "eager" : "lazy"}"
          fetchpriority="${shouldPrioritizeImage ? "high" : "low"}"
          decoding="async"
        >
      </div>
    ` : `<div class="card-image placeholder">No Image</div>`}
    <div class="card-head">
      <div class="card-head-title"><div class="card-title">${title}</div>${isEventUnread(item) ? `<span class="event-unread-dot" title="unread"></span>` : ""}</div>
      <span class="badge">${badgeText}</span>
    </div>
    <div class="card-meta">Upload: ${uploaded}</div>
    <div class="card-meta">Writer: ${author}</div>
    <div class="card-body">${body || "설명이 없습니다."}</div>
    <div class="card-actions">
      <div class="reaction-bar">
        <button class="icon-btn like-btn ${liked ? "is-liked" : ""}" type="button" data-like-post="${escapeHtml(item.id)}">❤ ${likesCount}</button>
        <button class="icon-btn reaction-summary-btn" type="button" data-show-reactions="${escapeHtml(item.id)}">❤ ${likesCount} · 댓글 ${commentsCount}</button>
        <button class="icon-btn forward-btn" type="button" data-forward-post="${escapeHtml(item.id)}">Forward</button>
      </div>
      <div class="comment-toggle">상세 보기</div>
    </div>
  `;

  const imageWrap = card.querySelector(".card-image-wrap");
  const imageEl = card.querySelector(".card-image-wrap .card-image");
  if (imageWrap && imageEl) {
    const markLoaded = () => imageWrap.classList.remove("is-loading");
    if (imageEl.complete) {
      requestAnimationFrame(markLoaded);
    } else {
      imageEl.addEventListener("load", markLoaded, { once: true });
      imageEl.addEventListener("error", () => {
        imageWrap.outerHTML = `<div class="card-image placeholder">No Image</div>`;
      }, { once: true });
    }
  }

  card.addEventListener("click", (event) => {
    if (event.target.closest("button") || event.target.closest("textarea")) return;
    location.href = routeForPost(item);
  });

  return card;
}

function renderEmpty(message) {
  cardsGrid.innerHTML = `<article class="card"><div class="card-title">${escapeHtml(message)}</div></article>`;
}

function renderNextPage() {
  const filtered = getFilteredItems();
  if (!filtered.length && renderedCount === 0) {
    renderEmpty("표시할 게시물이 없습니다.");
    return;
  }

  const next = filtered.slice(renderedCount, renderedCount + PAGE_SIZE);
  if (!next.length) return;

  const startIndex = renderedCount;
  renderedCount += next.length;

  let chunkIndex = 0;
  const CHUNK_SIZE = 3;

  function appendChunk() {
    const fragment = document.createDocumentFragment();
    const slice = next.slice(chunkIndex, chunkIndex + CHUNK_SIZE);
    slice.forEach((item, offset) => {
      const card = buildCard(item);
      card.style.setProperty("--enter-delay", `${(startIndex + chunkIndex + offset) * 40}ms`);
      fragment.appendChild(card);
    });
    cardsGrid.appendChild(fragment);
    chunkIndex += CHUNK_SIZE;
    if (chunkIndex < next.length) {
      requestAnimationFrame(appendChunk);
    }
  }

  requestAnimationFrame(appendChunk);
}



function openAnimatedModal(modal) {
  if (!modal) return;
  modal.hidden = false;
  modal.classList.remove("is-closing");
  requestAnimationFrame(() => modal.classList.add("is-visible"));
  document.body.classList.add("modal-open");
}

function closeAnimatedModal(modal) {
  if (!modal) return;
  modal.classList.remove("is-visible");
  modal.classList.add("is-closing");
  window.setTimeout(() => {
    modal.hidden = true;
    modal.classList.remove("is-closing");
  }, 220);
  document.body.classList.remove("modal-open");
}

function shouldOpenGuideModal() {
  return Boolean(currentUser && currentProfile && !currentProfile.guideSeen);
}

function openGuideModal() {
  openAnimatedModal(guideModal);
}

function closeGuideModal() {
  closeAnimatedModal(guideModal);
}

async function confirmGuideModal() {
  if (!currentUser) {
    closeGuideModal();
    return;
  }
  try {
    await updateDoc(doc(db, "users", currentUser.uid), {
      guideSeen: true,
      guideSeenAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    if (currentProfile) {
      currentProfile.guideSeen = true;
    }
    closeGuideModal();
  } catch (e) {
    console.error("guide confirm error:", e);
    alert("가이드 확인 저장에 실패했습니다. 다시 시도해 주세요.");
  }
}

async function loadCurrentProfile() {
  if (!currentUser) return;
  try {
    const snap = await getDoc(doc(db, "users", currentUser.uid));
    currentProfile = snap.exists() ? snap.data() : null;
  } catch (e) {
    console.error("loadCurrentProfile error:", e);
  }
}

async function loadPosts() {
  try {
    const qs = await getDocs(query(collection(db, "posts"), orderBy("createdAt", "desc")));
    allItems = qs.docs.map((docSnap) => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        type: data.type || "request",
        status: data.status || data.type || "post",
        title: data.title || data.programName || "Untitled",
        body: data.body || data.description || "",
        description: data.description || "",
        programName: data.programName || data.title || "",
        createdBy: data.createdBy || "",
        createdByName: data.createdByName || "",
        createdByEmail: data.createdByEmail || "",
        assignedDeveloperUids: Array.isArray(data.assignedDeveloperUids) ? data.assignedDeveloperUids : [],
        imageUrl: data.imageUrl || data.attachmentUrl || "",
        comments: Array.isArray(data.comments) ? data.comments : [],
        likedByUids: Array.isArray(data.likedByUids) ? data.likedByUids : [],
        createdAt: data.createdAt || null,
        updatedAt: data.updatedAt || data.createdAt || null,
        eventDate: data.eventDate || "",
      };
    }).sort((a, b) => {
      const aTime = a.createdAt?.toMillis?.() || new Date(a.createdAt || 0).getTime() || 0;
      const bTime = b.createdAt?.toMillis?.() || new Date(b.createdAt || 0).getTime() || 0;
      return bTime - aTime;
    });
  } catch (e) {
    console.error("loadPosts error:", e);
    allItems = [];
    renderEmpty("게시물을 불러올 수 없습니다. Firestore rules를 확인해 주세요.");
  }
  renderMiniCalendar();
  scheduleMiniCalendarRefresh();
}

async function loadUsersForSearch() {
  if (!currentUser) {
    allUsers = [];
    renderMemberSearchResults();
    renderMemberPicker();
    return;
  }

  try {
    const qs = await getDocs(collection(db, "users"));
    allUsers = qs.docs.map((snap) => ({ uid: snap.id, ...snap.data() }));
  } catch (e) {
    if (e?.code === "permission-denied" || String(e?.message || "").includes("insufficient permissions")) {
      console.warn("users collection read denied by Firestore rules.");
    } else {
      console.error("loadUsersForSearch error:", e);
    }
    allUsers = [];
  }

  renderMemberSearchResults();
  renderMemberPicker();
}

function refreshNotificationDotFromDom() {
  const unreadRows = notificationList?.querySelectorAll(".notification-item[data-read='false']") || [];
  if (notificationDot) notificationDot.hidden = unreadRows.length === 0;
}

function notificationRoute(item) {
  return `./${item.postType === "event" ? "post.html" : "post.request.html"}?id=${encodeURIComponent(item.postId)}`;
}

async function markNotificationRead(notificationId) {
  if (!notificationId) return;
  await updateDoc(doc(db, "notifications", notificationId), {
    read: true,
    updatedAt: serverTimestamp(),
  });
}

async function deleteNotificationItem(notificationId) {
  if (!notificationId) return;
  await deleteDoc(doc(db, "notifications", notificationId));
}

async function markAllNotificationsRead() {
  if (!currentUser) return;
  const qs = await getDocs(query(collection(db, "notifications"), where("toUid", "==", currentUser.uid)));
  const unreadDocs = qs.docs.filter((snap) => !snap.data()?.read);
  if (!unreadDocs.length) return;
  for (let i = 0; i < unreadDocs.length; i += 500) {
    const batch = writeBatch(db);
    unreadDocs.slice(i, i + 500).forEach((snap) => {
      batch.update(snap.ref, { read: true, updatedAt: serverTimestamp() });
    });
    await batch.commit();
  }
}

async function deleteAllNotifications() {
  if (!currentUser) return;
  const qs = await getDocs(query(collection(db, "notifications"), where("toUid", "==", currentUser.uid)));
  if (!qs.docs.length) return;
  for (let i = 0; i < qs.docs.length; i += 500) {
    const batch = writeBatch(db);
    qs.docs.slice(i, i + 500).forEach((snap) => batch.delete(snap.ref));
    await batch.commit();
  }
}

async function loadNotifications() {
  if (!currentUser) {
    notificationDot.hidden = true;
    notificationList.innerHTML = `<div class="notification-empty">로그인 후 알림을 확인할 수 있습니다.</div>`;
    return;
  }

  try {
    const qs = await getDocs(query(collection(db, "notifications"), where("toUid", "==", currentUser.uid)));
    const rawItems = qs.docs.map((snap) => ({ id: snap.id, ...snap.data() }))
      .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));

    const postIds = [...new Set(rawItems.filter((item) => item.kind !== "dm" && item.postId).map((item) => item.postId))];
    const postExistsMap = new Map();
    await Promise.all(postIds.map(async (postId) => {
      try {
        const postSnap = await getDoc(doc(db, "posts", postId));
        postExistsMap.set(postId, postSnap.exists());
      } catch (error) {
        console.warn("notification post existence check failed:", postId, error);
        postExistsMap.set(postId, true);
      }
    }));

    const items = rawItems.filter((item) => item.kind === "dm" || !item.postId || postExistsMap.get(item.postId) !== false);
    notificationDot.hidden = items.filter((x) => !x.read).length === 0;

    if (!items.length) {
      notificationList.innerHTML = `<div class="notification-empty">알림이 없습니다.</div>`;
      return;
    }

    notificationList.innerHTML = "";
    items.forEach((item) => {
      const row = document.createElement("div");
      row.className = "notification-item";
      row.dataset.read = item.read ? "true" : "false";
      row.innerHTML = `
        <button class="notification-main-btn" type="button">
          <div class="notification-item-head">
            <strong>${escapeHtml(item.title || "알림")}</strong>
            ${item.read ? "" : `<span class="notif-dot item-dot"></span>`}
          </div>
          <div class="notification-item-body">${escapeHtml(item.body || "")}</div>
          <div class="notification-item-meta">${escapeHtml(formatDateTime(item.createdAt))}</div>
        </button>
        <div class="notification-item-actions">
          <button class="btn notification-delete-btn" type="button">삭제</button>
        </div>
      `;
      const mainBtn = row.querySelector(".notification-main-btn");
      const deleteBtn = row.querySelector(".notification-delete-btn");
      mainBtn?.addEventListener("click", async () => {
        try {
          if (!item.read) {
            await markNotificationRead(item.id);
            item.read = true;
            row.dataset.read = "true";
            row.querySelector(".item-dot")?.remove();
            refreshNotificationDotFromDom();
          }
        } catch (e) {
          console.error("notification read error:", e);
        }
        if (item.kind === "dm") {
          closeAnimatedModal(notificationModal);
          await openDirectMessageCenter(item.fromUid || item.threadPeerUid || "");
          return;
        }
        if (item.postId && postExistsMap.get(item.postId) === false) {
          row.remove();
          refreshNotificationDotFromDom();
          return;
        }
        location.href = notificationRoute(item);
      });
      deleteBtn?.addEventListener("click", async (event) => {
        event.stopPropagation();
        if (!confirm("이 알림을 삭제할까요?")) return;
        try {
          await deleteNotificationItem(item.id);
          row.remove();
          refreshNotificationDotFromDom();
          if (!notificationList.children.length) {
            notificationList.innerHTML = `<div class="notification-empty">알림이 없습니다.</div>`;
            if (notificationDot) notificationDot.hidden = true;
          }
        } catch (e) {
          console.error("notification delete error:", e);
          alert("알림 삭제에 실패했습니다.");
        }
      });
      notificationList.appendChild(row);
    });

    refreshNotificationDotFromDom();
  } catch (e) {
    console.error("loadNotifications error:", e);
    notificationList.innerHTML = `<div class="notification-empty">알림을 불러오지 못했습니다.</div>`;
  }
}

async function createNotification(toUid, postId, postType, title, body, extra = {}) {
  if (!toUid) return;
  await addDoc(collection(db, "notifications"), {
    toUid,
    postId: postId || "",
    postType: postType || "request",
    title,
    body,
    read: false,
    createdAt: serverTimestamp(),
    postOwnerUid: extra.postOwnerUid || "",
    ...extra,
  });
}

async function notifyPostRecipients(item, title, body) {
  const recipients = [item.createdBy, ...(Array.isArray(item.assignedDeveloperUids) ? item.assignedDeveloperUids : [])]
    .filter(Boolean)
    .filter((uid, index, arr) => arr.indexOf(uid) === index)
    .filter((uid) => uid !== currentUser?.uid);
  for (const uid of recipients) {
    await createNotification(uid, item.id, item.type || "request", title, body, {
      postOwnerUid: item.createdBy || "",
    });
  }
}

async function toggleLike(postId) {
  if (!currentUser) {
    location.href = "./login.html";
    return;
  }
  const item = allItems.find((row) => row.id === postId);
  if (!item) return;
  const likedBy = Array.isArray(item.likedByUids) ? [...item.likedByUids] : [];
  const liked = likedBy.includes(currentUser.uid);
  const nextLikedBy = liked ? likedBy.filter((uid) => uid !== currentUser.uid) : [...likedBy, currentUser.uid];
  await updateDoc(doc(db, "posts", postId), {
    likedByUids: nextLikedBy,
    likesCount: nextLikedBy.length,
    updatedAt: serverTimestamp(),
  });
  item.likedByUids = nextLikedBy;
  if (!liked) {
    await notifyPostRecipients(item, "좋아요 알림", `${getProfileName()}님이 게시물(${item.title || item.programName || "Untitled"})에 좋아요를 눌렀습니다.`);
  }
  clearGrid();
  renderNextPage();
  if (activeReactionPostId === postId) renderReactionsModal(postId);
}

async function addComment(postId) {
  if (!currentUser) {
    location.href = "./login.html";
    return;
  }
  const input = document.querySelector(`[data-comment-input="${postId}"]`);
  const commentText = input?.value.trim() || "";
  if (!commentText) return alert("댓글을 입력해 주세요.");

  const item = allItems.find((row) => row.id === postId);
  if (!item) return;
  const comments = Array.isArray(item.comments) ? [...item.comments] : [];
  const editId = activeReactionEditCommentId;
  const nowIso = new Date().toISOString();

  if (editId) {
    const target = comments.find((comment) => comment.id === editId);
    if (!target) {
      resetReactionCommentComposer();
      return alert("수정할 댓글을 찾지 못했습니다.");
    }
    if (target.uid !== currentUser.uid) return alert("본인 댓글만 수정할 수 있습니다.");
    target.text = commentText;
    target.updatedAt = nowIso;
  } else {
    comments.push({
      id: `${Date.now()}`,
      uid: currentUser.uid,
      name: getProfileName(),
      text: commentText,
      createdAt: nowIso,
    });
  }

  try {
    await updateDoc(doc(db, "posts", postId), {
      comments,
      commentsCount: comments.length,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error("comment save error:", error);
    if (error?.code === "permission-denied") {
      alert("관리자 외 회원 댓글 권한이 Firestore Rules 에서 막혀 있습니다. rules 수정이 필요합니다.");
      return;
    }
    alert(error?.message || "댓글 저장에 실패했습니다.");
    return;
  }

  item.comments = comments;
  const title = item.title || item.programName || "Untitled";
  if (editId) {
    resetReactionCommentComposer();
  } else {
    await notifyPostRecipients(item, "댓글 알림", `${getProfileName()}님이 게시물(${title})에 댓글을 남겼습니다.`);
  }
  clearGrid();
  renderNextPage();
  if (activeReactionPostId === postId) {
    renderReactionsModal(postId);
    openAnimatedModal(likesModal);
  }
}

function startEditComment(commentId) {
  if (!activeReactionPostId || !currentUser) return;
  const item = allItems.find((row) => row.id === activeReactionPostId);
  const comment = item?.comments?.find((row) => row.id === commentId);
  if (!comment) return alert("댓글을 찾지 못했습니다.");
  if (comment.uid !== currentUser.uid) return alert("본인 댓글만 수정할 수 있습니다.");
  activeReactionEditCommentId = commentId;
  if (reactionsCommentInput) {
    reactionsCommentInput.value = comment.text || "";
    reactionsCommentInput.placeholder = "댓글 수정";
    reactionsCommentInput.focus();
  }
  if (reactionsCommentSubmitBtn) {
    reactionsCommentSubmitBtn.textContent = "수정";
  }
  if (reactionsCommentCancelBtn) {
    reactionsCommentCancelBtn.hidden = false;
  }
}

async function deleteComment(postId, commentId) {
  if (!currentUser) {
    location.href = "./login.html";
    return;
  }
  const item = allItems.find((row) => row.id === postId);
  if (!item) return;
  const comments = Array.isArray(item.comments) ? [...item.comments] : [];
  const target = comments.find((comment) => comment.id === commentId);
  if (!target) return alert("삭제할 댓글을 찾지 못했습니다.");
  if (target.uid !== currentUser.uid) return alert("본인 댓글만 삭제할 수 있습니다.");
  if (!confirm("이 댓글을 삭제할까요?")) return;
  const nextComments = comments.filter((comment) => comment.id !== commentId);
  await updateDoc(doc(db, "posts", postId), {
    comments: nextComments,
    commentsCount: nextComments.length,
    updatedAt: serverTimestamp(),
  });
  item.comments = nextComments;
  if (activeReactionEditCommentId === commentId) {
    resetReactionCommentComposer();
  }
  clearGrid();
  renderNextPage();
  if (activeReactionPostId === postId) {
    renderReactionsModal(postId);
    openAnimatedModal(likesModal);
  }
}

function createParticipantKey(a, b) {
  return [a, b].filter(Boolean).sort().join("__");
}

async function ensureDirectThread(peerUid) {
  if (!currentUser?.uid || !peerUid || peerUid === currentUser.uid) return null;
  const participantKey = createParticipantKey(currentUser.uid, peerUid);
  const existing = directThreads.find((thread) => thread.participantKey === participantKey);
  if (existing) return existing;

  const created = await addDoc(collection(db, "directThreads"), {
    participantKey,
    participantUids: [currentUser.uid, peerUid].sort(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastMessage: "",
    lastMessageAt: serverTimestamp(),
    lastMessageType: "text",
    lastSenderUid: currentUser.uid,
  });

  const thread = {
    id: created.id,
    participantKey,
    participantUids: [currentUser.uid, peerUid].sort(),
    lastMessage: "",
    lastMessageType: "text",
    lastSenderUid: currentUser.uid,
    lastMessageAt: new Date().toISOString(),
  };
  directThreads.unshift(thread);
  return thread;
}

function getThreadPeerUid(thread) {
  const participants = Array.isArray(thread?.participantUids) ? thread.participantUids : [];
  return participants.find((uid) => uid !== currentUser?.uid) || "";
}

function getThreadPeer(thread) {
  return getUserByUid(getThreadPeerUid(thread));
}

function threadPreview(thread) {
  if ((thread?.lastMessageType || "") === "forward") return "게시물 전달";
  return thread?.lastMessage || "대화를 시작해 보세요.";
}

async function loadDirectThreads() {
  if (!currentUser) {
    directThreads = [];
    renderDirectThreads();
    refreshDirectMessageDot();
    return;
  }

  try {
    const qs = await getDocs(query(
      collection(db, "directThreads"),
      where("participantUids", "array-contains", currentUser.uid)
    ));
    directThreads = qs.docs
      .map((snap) => ({ id: snap.id, ...snap.data() }))
      .sort((a, b) => (b.lastMessageAt?.toMillis?.() || new Date(b.lastMessageAt || 0).getTime() || 0) - (a.lastMessageAt?.toMillis?.() || new Date(a.lastMessageAt || 0).getTime() || 0));
  } catch (e) {
    console.error("loadDirectThreads error:", e);
    directThreads = [];
  }
  renderDirectThreads();
  refreshDirectMessageDot();
}

function refreshDirectMessageDot() {
  if (!directMessageDot) return;
  directMessageDot.hidden = !directThreads.some((thread) => isThreadUnread(thread));
}

function renderDirectThreads() {
  if (!directThreadList) return;
  if (!currentUser) {
    directThreadList.innerHTML = `<div class="notification-empty">로그인 후 DM을 사용할 수 있습니다.</div>`;
    return;
  }
  if (!directThreads.length) {
    directThreadList.innerHTML = `<div class="notification-empty">아직 대화가 없습니다.</div>`;
    return;
  }
  directThreadList.innerHTML = directThreads.map((thread) => {
    const peer = getThreadPeer(thread);
    const unreadDot = isThreadUnread(thread) ? `<span class="notif-dot item-dot"></span>` : "";
    return `
      <button class="direct-thread-item ${thread.id === activeThreadId ? "is-active" : ""}" type="button" data-thread-id="${escapeHtml(thread.id)}">
        <div class="thread-top">
          <div class="thread-name">${escapeHtml(getUserLabel(peer))}</div>
          ${unreadDot}
        </div>
        <div class="thread-preview">${escapeHtml(threadPreview(thread))}</div>
        <div class="thread-meta">${escapeHtml(formatDateTime(thread.lastMessageAt))}</div>
      </button>
    `;
  }).join("");
}

async function loadDirectMessages(threadId) {
  if (!threadId) return [];
  try {
    const qs = await getDocs(query(collection(db, "directThreads", threadId, "messages"), orderBy("createdAt", "asc")));
    return qs.docs.map((snap) => ({ id: snap.id, ...snap.data() }));
  } catch (e) {
    console.error("loadDirectMessages error:", e);
    return [];
  }
}

function renderForwardBubbleContent(message) {
  const post = normalizeForwardPost(message.forwardPost || {});
  const title = post.title || post.programName || "Untitled";
  const body = post.body || post.description || "";
  const canOpen = Boolean(post.route);
  return `
    <div>${escapeHtml(message.text || "게시물을 전달했습니다.")}</div>
    <div class="forward-card">
      <div class="forward-label">Forwarded Post</div>
      <div><strong>${escapeHtml(title)}</strong></div>
      <div class="thread-preview">${escapeHtml(typeLabel(post.type || "post"))}</div>
      <div style="margin-top:6px; line-height:1.5;">${escapeHtml(body).slice(0, 180)}${body.length > 180 ? "..." : ""}</div>
      <div class="card-actions" style="margin-top:10px;">
        <button class="icon-btn" type="button" data-open-forward-post="${escapeHtml(message.id || "")}" ${canOpen ? "" : "disabled"}>게시물 보기</button>
        <button class="icon-btn forward-btn" type="button" data-reforward-message="${escapeHtml(message.id || "")}">다른 회원에게 Forward</button>
      </div>
    </div>
  `;
}

async function openThread(threadId) {
  activeThreadId = threadId;
  renderDirectThreads();
  const thread = directThreads.find((row) => row.id === threadId);
  const peer = getThreadPeer(thread);
  directMessageEmpty.hidden = true;
  directMessagePanel.hidden = false;
  directMessageHeader.innerHTML = `${escapeHtml(getUserLabel(peer))}`;
  const messages = await loadDirectMessages(threadId);
  currentThreadMessages = messages;
  if (!messages.length) {
    directMessageHistory.innerHTML = `<div class="notification-empty">아직 메시지가 없습니다.</div>`;
  } else {
    directMessageHistory.innerHTML = messages.map((message) => {
      const mine = message.fromUid === currentUser?.uid;
      return `
        <div class="dm-bubble ${mine ? "mine" : ""} ${message.type === "forward" ? "forward" : ""}">
          <div>${message.type === "forward" ? renderForwardBubbleContent(message) : escapeHtml(message.text || "").replaceAll("\n", "<br>")}</div>
          <div class="dm-meta">${escapeHtml(message.fromName || "회원")} · ${escapeHtml(formatDateTime(message.createdAt))}</div>
        </div>
      `;
    }).join("");
  }
  directMessageHistory.scrollTop = directMessageHistory.scrollHeight;
  markThreadRead(threadId);
  refreshDirectMessageDot();
  renderDirectThreads();
}

async function sendDirectMessage({ threadId, peerUid, text, type = "text", forwardPost = null }) {
  if (!currentUser) {
    location.href = "./login.html";
    return;
  }
  const safeText = (text || "").trim();
  if (!threadId || !peerUid) return;
  if (!safeText && type === "text") {
    alert("메시지를 입력해 주세요.");
    return;
  }

  const payload = {
    type,
    text: safeText,
    fromUid: currentUser.uid,
    fromName: getProfileName(),
    toUid: peerUid,
    createdAt: serverTimestamp(),
  };
  if (forwardPost) payload.forwardPost = normalizeForwardPost(forwardPost);

  await addDoc(collection(db, "directThreads", threadId, "messages"), payload);
  await updateDoc(doc(db, "directThreads", threadId), {
    lastMessage: type === "forward" ? `게시물 전달: ${forwardPost?.title || forwardPost?.programName || "Untitled"}` : safeText,
    lastMessageType: type,
    lastSenderUid: currentUser.uid,
    lastMessageAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await createNotification(
    peerUid,
    forwardPost?.id || "",
    forwardPost?.type || "request",
    type === "forward" ? "Direct Message 전달" : "Direct Message 알림",
    type === "forward"
      ? `${getProfileName()}님이 게시물(${forwardPost?.title || forwardPost?.programName || "Untitled"})을 전달했습니다.`
      : `${getProfileName()}님이 메시지를 보냈습니다.`,
    {
      kind: "dm",
      fromUid: currentUser.uid,
      threadId,
      threadPeerUid: currentUser.uid,
    }
  );

  await loadDirectThreads();
  await openThread(threadId);
}

function getPickerCandidates() {
  const q = (memberPickerSearchInput?.value || "").trim().toLowerCase();
  return allUsers
    .filter((user) => user.uid !== currentUser?.uid)
    .filter((user) => {
      if (!q) return true;
      const target = [user.name, user.email, user.dept, user.rank].join(" ").toLowerCase();
      return target.includes(q);
    })
    .sort((a, b) => String(a.name || a.email || "").localeCompare(String(b.name || b.email || ""), "ko"));
}

function renderMemberPicker() {
  if (!memberPickerList) return;
  const rows = getPickerCandidates();
  if (!rows.length) {
    memberPickerList.innerHTML = `<div class="notification-empty">선택 가능한 회원이 없습니다.</div>`;
    return;
  }
  memberPickerList.innerHTML = rows.map((user) => `
    <button class="member-picker-row" type="button" data-picker-uid="${escapeHtml(user.uid)}">
      <div class="member-picker-name">${escapeHtml(getUserLabel(user))}</div>
      <div class="member-picker-sub">${escapeHtml(user.email || "")}${user.dept ? ` · ${escapeHtml(user.dept)}` : ""}${user.rank ? ` · ${escapeHtml(user.rank)}` : ""}</div>
    </button>
  `).join("");
}

function openMemberPicker(mode, item = null) {
  if (!currentUser) {
    location.href = "./login.html";
    return;
  }
  memberPickerMode = mode;
  pendingForwardItem = item;
  memberPickerTitle.textContent = mode === "forward" ? "Forward 받을 회원 선택" : "대화할 회원 선택";
  memberPickerSearchInput.value = "";
  renderMemberPicker();
  openAnimatedModal(memberPickerModal);
  memberPickerSearchInput.focus();
}

function closeMemberPicker() {
  closeAnimatedModal(memberPickerModal);
}

async function handleMemberPicked(uid) {
  const thread = await ensureDirectThread(uid);
  closeMemberPicker();
  if (!thread) return;
  await openDirectMessageCenter(uid);
  if (memberPickerMode === "forward" && pendingForwardItem) {
    const forwardPost = normalizeForwardPost(pendingForwardItem);
    await sendDirectMessage({
      threadId: thread.id,
      peerUid: uid,
      text: `${getProfileName()}님이 게시물을 전달했습니다.`,
      type: "forward",
      forwardPost,
    });
  }
  pendingForwardItem = null;
}

function getForwardPostFromMessageId(messageId) {
  const message = currentThreadMessages.find((row) => row.id === messageId);
  if (!message || message.type !== "forward" || !message.forwardPost) return null;
  return normalizeForwardPost(message.forwardPost);
}

function openForwardedPostByMessage(messageId) {
  const forwardPost = getForwardPostFromMessageId(messageId);
  if (!forwardPost?.route) {
    alert("이동할 게시물 정보를 찾지 못했습니다.");
    return;
  }
  location.href = forwardPost.route;
}

function reforwardMessagePost(messageId) {
  const forwardPost = getForwardPostFromMessageId(messageId);
  if (!forwardPost) {
    alert("전달할 게시물 정보를 찾지 못했습니다.");
    return;
  }
  openMemberPicker("forward", forwardPost);
}

async function openDirectMessageCenter(peerUid = "") {
  if (!currentUser) {
    location.href = "./login.html";
    return;
  }
  await loadDirectThreads();
  openAnimatedModal(directMessageModal);
  if (peerUid) {
    const thread = await ensureDirectThread(peerUid);
    if (thread) await openThread(thread.id);
    return;
  }
  if (activeThreadId && directThreads.some((row) => row.id === activeThreadId)) {
    await openThread(activeThreadId);
    return;
  }
  const first = directThreads[0];
  if (first) {
    await openThread(first.id);
  } else {
    directMessageEmpty.hidden = false;
    directMessagePanel.hidden = true;
  }
}

function setupInfiniteScroll() {
  if (!sentinel) return;
  const io = new IntersectionObserver((entries) => {
    if (entries[0]?.isIntersecting) renderNextPage();
  }, { root: null, rootMargin: "600px", threshold: 0 });
  io.observe(sentinel);
}

function applyFilter() {
  hideMemberSearchPanel();
  cardsGrid?.classList.add("is-filtering");
  clearGrid();
  renderNextPage();
  window.setTimeout(() => cardsGrid?.classList.remove("is-filtering"), 220);
}

function setupFilterUI() {
  syncFilterDropdownUI();

  applyFilterBtn?.addEventListener("click", applyFilter);
  filterSelect?.addEventListener("change", () => {
    syncFilterDropdownUI();
    applyFilter();
  });
  filterDropdownBtn?.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleFilterDropdown();
  });
  filterDropdownPanel?.addEventListener("click", (event) => {
    const option = event.target.closest("[data-filter-value]");
    if (!option || !filterSelect) return;
    const nextValue = option.dataset.filterValue || "all";
    if (filterSelect.value !== nextValue) {
      filterSelect.value = nextValue;
      filterSelect.dispatchEvent(new Event("change", { bubbles: true }));
    } else {
      syncFilterDropdownUI();
    }
    closeFilterDropdown();
  });
  searchInput?.addEventListener("click", () => {
    closeFilterDropdown();
    showMemberSearchPanel();
    renderMemberSearchResults();
  });
  searchInput?.addEventListener("input", () => {
    showMemberSearchPanel();
    renderMemberSearchResults();
  });
  searchInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      applyFilter();
    }
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".search-stack")) hideMemberSearchPanel();
    if (!event.target.closest(".filter-dropdown")) closeFilterDropdown();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      hideMemberSearchPanel();
      closeFilterDropdown();
    }
  });

  memberSearchList?.addEventListener("click", (event) => {
    const star = event.target.closest("[data-star-uid]");
    if (star) {
      event.stopPropagation();
      toggleFavoriteMember(star.dataset.starUid);
      return;
    }
    const row = event.target.closest("[data-uid]");
    if (!row) return;
    location.href = `./profile.html?uid=${encodeURIComponent(row.dataset.uid)}`;
  });
}

function setupNotificationUI() {
  notificationBtn?.addEventListener("click", async () => {
    await loadNotifications();
    openAnimatedModal(notificationModal);
  });
  closeNotificationBtn?.addEventListener("click", () => {
    closeAnimatedModal(notificationModal);
  });
  markAllNotificationsReadBtn?.addEventListener("click", async () => {
    try {
      await markAllNotificationsRead();
      await loadNotifications();
    } catch (error) {
      console.error("markAllNotificationsRead error:", error);
      alert("전체 읽음 처리에 실패했습니다.");
    }
  });
  deleteAllNotificationsBtn?.addEventListener("click", async () => {
    if (!confirm("알림 전체를 삭제할까요?")) return;
    try {
      await deleteAllNotifications();
      await loadNotifications();
    } catch (error) {
      console.error("deleteAllNotifications error:", error);
      alert("전체 알림 삭제에 실패했습니다.");
    }
  });
  notificationModal?.addEventListener("click", (e) => {
    if (e.target === notificationModal) closeAnimatedModal(notificationModal);
  });
}

function setupDirectMessageUI() {
  directMessageBtn?.addEventListener("click", async () => {
    await openDirectMessageCenter();
  });
  closeDirectMessageBtn?.addEventListener("click", () => {
    closeAnimatedModal(directMessageModal);
  });
  directMessageModal?.addEventListener("click", (e) => {
    if (e.target === directMessageModal) closeAnimatedModal(directMessageModal);
  });
  newDmBtn?.addEventListener("click", () => openMemberPicker("chat"));
  directThreadList?.addEventListener("click", async (event) => {
    const btn = event.target.closest("[data-thread-id]");
    if (!btn) return;
    await openThread(btn.dataset.threadId);
  });
  directMessageHistory?.addEventListener("click", (event) => {
    const openBtn = event.target.closest("[data-open-forward-post]");
    if (openBtn) {
      openForwardedPostByMessage(openBtn.dataset.openForwardPost);
      return;
    }
    const forwardBtn = event.target.closest("[data-reforward-message]");
    if (forwardBtn) {
      reforwardMessagePost(forwardBtn.dataset.reforwardMessage);
    }
  });
  sendDirectMessageBtn?.addEventListener("click", async () => {
    const thread = directThreads.find((row) => row.id === activeThreadId);
    if (!thread) return;
    const peerUid = getThreadPeerUid(thread);
    await sendDirectMessage({ threadId: thread.id, peerUid, text: directMessageInput.value, type: "text" });
    directMessageInput.value = "";
  });
  directMessageInput?.addEventListener("keydown", async (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendDirectMessageBtn?.click();
    }
  });

  closeMemberPickerBtn?.addEventListener("click", closeMemberPicker);
  closeLikesModalBtn?.addEventListener("click", closeLikesModal);
  reactionsCommentCancelBtn?.addEventListener("click", (event) => {
    event.stopPropagation();
    resetReactionCommentComposer();
  });
  reactionsCommentSubmitBtn?.addEventListener("click", async (event) => {
    event.stopPropagation();
    if (!reactionsCommentSubmitBtn.dataset.commentPost) return;
    await addComment(reactionsCommentSubmitBtn.dataset.commentPost);
  });
  reactionsCommentInput?.addEventListener("keydown", async (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (!reactionsCommentSubmitBtn?.dataset.commentPost) return;
      await addComment(reactionsCommentSubmitBtn.dataset.commentPost);
    }
  });
  document.getElementById("closeEventDayModalBtn")?.addEventListener("click", closeEventDayModal);
  eventDayModal?.addEventListener("click", (e) => {
    if (e.target === eventDayModal) closeEventDayModal();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") renderMiniCalendar();
  });

  miniCalendar?.addEventListener("click", (event) => {
    const dayBtn = event.target.closest("[data-calendar-date]");
    if (!dayBtn || dayBtn.disabled) return;
    openEventDayModal(dayBtn.dataset.calendarDate);
  });
  memberPickerModal?.addEventListener("click", (e) => {
    if (e.target === memberPickerModal) closeMemberPicker();
  });
  likesModal?.addEventListener("click", (e) => {
    if (e.target === likesModal) closeLikesModal();
  });
  memberPickerSearchInput?.addEventListener("input", renderMemberPicker);
  memberPickerList?.addEventListener("click", async (event) => {
    const row = event.target.closest("[data-picker-uid]");
    if (!row) return;
    await handleMemberPicked(row.dataset.pickerUid);
  });
  reactionsCommentList?.addEventListener("click", async (event) => {
    const editBtn = event.target.closest("[data-edit-comment]");
    if (editBtn) {
      event.stopPropagation();
      startEditComment(editBtn.dataset.editComment);
      return;
    }
    const deleteBtn = event.target.closest("[data-delete-comment]");
    if (deleteBtn) {
      event.stopPropagation();
      if (!activeReactionPostId) return;
      await deleteComment(activeReactionPostId, deleteBtn.dataset.deleteComment);
    }
  });
}

function setupGuideModal() {
  guideConfirmBtn?.addEventListener("click", confirmGuideModal);
  guideModal?.addEventListener("click", (event) => {
    if (event.target === guideModal) return;
  });
}

function setupCardActions() {
  cardsGrid?.addEventListener("click", async (event) => {
    const likeBtn = event.target.closest("[data-like-post]");
    if (likeBtn) {
      event.stopPropagation();
      await toggleLike(likeBtn.dataset.likePost);
      return;
    }

    const reactionsBtn = event.target.closest("[data-show-reactions]");
    if (reactionsBtn) {
      event.stopPropagation();
      openLikesModal(reactionsBtn.dataset.showReactions);
      return;
    }

    const addBtn = event.target.closest("[data-comment-post]");
    if (addBtn) {
      event.stopPropagation();
      await addComment(addBtn.dataset.commentPost);
      return;
    }

    const forwardBtn = event.target.closest("[data-forward-post]");
    if (forwardBtn) {
      event.stopPropagation();
      const item = allItems.find((row) => row.id === forwardBtn.dataset.forwardPost);
      if (!item) return;
      openMemberPicker("forward", item);
    }
  });
}

async function init() {
  currentUser = await whenAuthReady();
  await loadCurrentProfile();
  setupFilterUI();
  setupInfiniteScroll();
  setupNotificationUI();
  setupDirectMessageUI();
  setupGuideModal();
  setupCardActions();
  await Promise.all([loadPosts(), loadNotifications(), loadUsersForSearch(), loadDirectThreads()]);
  clearGrid();
  renderNextPage();
  if (shouldOpenGuideModal()) openGuideModal();
}

init();
