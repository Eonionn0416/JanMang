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
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";

const cardsGrid = document.getElementById("cardsGrid");
const sentinel = document.getElementById("sentinel");
const filterSelect = document.getElementById("filterSelect");
const searchInput = document.getElementById("searchInput");
const applyFilterBtn = document.getElementById("applyFilterBtn");
const memberSearchPanel = document.getElementById("memberSearchPanel");
const memberSearchList = document.getElementById("memberSearchList");
const notificationBtn = document.getElementById("notificationBtn");
const notificationDot = document.getElementById("notificationDot");
const notificationModal = document.getElementById("notificationModal");
const closeNotificationBtn = document.getElementById("closeNotificationBtn");
const notificationList = document.getElementById("notificationList");

let allItems = [];
let allUsers = [];
let currentUser = null;
let currentProfile = null;
let renderedCount = 0;
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

function renderMemberSearchResults() {
  if (!memberSearchPanel || !memberSearchList) return;
  if (!allUsers.length) {
    memberSearchPanel.hidden = true;
    return;
  }
  const rows = getMemberSearchRows();
  memberSearchPanel.hidden = false;
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

function hideMemberSearchPanel() {
  if (memberSearchPanel) memberSearchPanel.hidden = true;
}

function routeForPost(item) {
  return `./${item.type === "request" ? "post.request.html" : "post.html"}?id=${encodeURIComponent(item.id)}`;
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

function buildCommentsHtml(item) {
  const comments = Array.isArray(item.comments) ? item.comments : [];
  const rows = comments.slice().sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  const listHtml = rows.length
    ? rows.map((comment) => `
        <div class="comment-item">
          <div class="comment-meta">${escapeHtml(comment.name || "회원")} · ${escapeHtml(formatDateTime(comment.createdAt))}</div>
          <div>${escapeHtml(comment.text || "").replaceAll("\n", "<br>")}</div>
        </div>
      `).join("")
    : `<div class="comment-item">아직 댓글이 없습니다.</div>`;

  return `
    <div class="comment-panel" hidden>
      <div class="comment-list">${listHtml}</div>
      <div class="comment-form">
        <textarea data-comment-input="${escapeHtml(item.id)}" placeholder="댓글 입력"></textarea>
        <button class="btn add-comment-btn" type="button" data-comment-post="${escapeHtml(item.id)}">등록</button>
      </div>
    </div>
  `;
}

function buildCard(item) {
  const card = document.createElement("article");
  card.className = "card";
  card.dataset.type = item.type || "post";
  card.dataset.postId = item.id;

  const title = escapeHtml(item.title || item.programName || "Untitled");
  const body = escapeHtml(item.body || item.description || "").replaceAll("\n", "<br/>");
  const updated = formatDate(item.updatedAt || item.createdAt);
  const badgeText = escapeHtml(statusLabel(item.status, item.type));
  const author = escapeHtml(item.createdByName || item.createdByEmail || "—");
  const imageUrl = item.imageUrl || item.createdByProfileImageUrl || "";
  const liked = currentUser ? (Array.isArray(item.likedByUids) && item.likedByUids.includes(currentUser.uid)) : false;
  const commentsCount = Array.isArray(item.comments) ? item.comments.length : (item.commentsCount || 0);
  const likesCount = Array.isArray(item.likedByUids) ? item.likedByUids.length : (item.likesCount || 0);

  card.innerHTML = `
    ${imageUrl ? `<img class="card-image" src="${escapeHtml(imageUrl)}" alt="${title}">` : `<div class="card-image placeholder">No Image</div>`}
    <div class="card-head">
      <div class="card-head-title"><div class="card-title">${title}</div>${isEventUnread(item) ? `<span class="event-unread-dot" title="unread"></span>` : ""}</div>
      <span class="badge">${badgeText}</span>
    </div>
    <div class="card-meta">Updated: ${updated}</div>
    <div class="card-meta">Writer: ${author}</div>
    <div class="card-body">${body || "설명이 없습니다."}</div>
    <div class="card-actions">
      <div class="reaction-bar">
        <button class="icon-btn like-btn ${liked ? "is-liked" : ""}" type="button" data-like-post="${escapeHtml(item.id)}">❤ ${likesCount}</button>
        <button class="icon-btn toggle-comments-btn" type="button" data-toggle-comments="${escapeHtml(item.id)}">댓글 ${commentsCount}</button>
      </div>
      <div class="comment-toggle">상세 보기</div>
    </div>
    ${buildCommentsHtml(item)}
  `;

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
  next.forEach((item) => cardsGrid.appendChild(buildCard(item)));
  renderedCount += next.length;
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
    const qs = await getDocs(query(collection(db, "posts"), orderBy("updatedAt", "desc")));
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
      };
    });
  } catch (e) {
    console.error("loadPosts error:", e);
    allItems = [];
    renderEmpty("게시물을 불러올 수 없습니다. Firestore rules를 확인해 주세요.");
  }
}

async function loadUsersForSearch() {
  try {
    const qs = await getDocs(collection(db, "users"));
    allUsers = qs.docs.map((snap) => ({ uid: snap.id, ...snap.data() }));
  } catch (e) {
    console.error("loadUsersForSearch error:", e);
    allUsers = [];
  }
}

function refreshNotificationDotFromDom() {
  const unreadRows = notificationList?.querySelectorAll(".notification-item[data-read='false']") || [];
  if (notificationDot) notificationDot.hidden = unreadRows.length === 0;
}

function notificationRoute(item) {
  return `./${item.postType === "event" ? "post.html" : "post.request.html"}?id=${encodeURIComponent(item.postId)}`;
}

async function loadNotifications() {
  if (!currentUser) {
    notificationDot.hidden = true;
    notificationList.innerHTML = `<div class="notification-empty">로그인 후 알림을 확인할 수 있습니다.</div>`;
    return;
  }

  try {
    const qs = await getDocs(query(collection(db, "notifications"), where("toUid", "==", currentUser.uid)));
    const items = qs.docs.map((snap) => ({ id: snap.id, ...snap.data() })).sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
    notificationDot.hidden = items.filter((x) => !x.read).length === 0;

    if (!items.length) {
      notificationList.innerHTML = `<div class="notification-empty">알림이 없습니다.</div>`;
      return;
    }

    notificationList.innerHTML = "";
    items.forEach((item) => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "notification-item";
      row.dataset.read = item.read ? "true" : "false";
      row.innerHTML = `
        <div class="notification-item-head">
          <strong>${escapeHtml(item.title || "알림")}</strong>
          ${item.read ? "" : `<span class="notif-dot item-dot"></span>`}
        </div>
        <div class="notification-item-body">${escapeHtml(item.body || "")}</div>
        <div class="notification-item-meta">${escapeHtml(formatDateTime(item.createdAt))}</div>
      `;
      row.addEventListener("click", async () => {
        try {
          if (!item.read) {
            await updateDoc(doc(db, "notifications", item.id), { read: true, updatedAt: serverTimestamp() });
            row.dataset.read = "true";
            row.querySelector(".item-dot")?.remove();
            refreshNotificationDotFromDom();
          }
        } catch (e) {
          console.error("notification read error:", e);
        }
        location.href = notificationRoute(item);
      });
      notificationList.appendChild(row);
    });

    refreshNotificationDotFromDom();
  } catch (e) {
    console.error("loadNotifications error:", e);
    notificationList.innerHTML = `<div class="notification-empty">알림을 불러오지 못했습니다.</div>`;
  }
}

async function createNotification(toUid, postId, postType, title, body) {
  if (!toUid || !postId) return;
  await addDoc(collection(db, "notifications"), {
    toUid,
    postId,
    postType,
    title,
    body,
    read: false,
    createdAt: serverTimestamp(),
  });
}

async function notifyPostRecipients(item, title, body) {
  const recipients = [item.createdBy, ...(Array.isArray(item.assignedDeveloperUids) ? item.assignedDeveloperUids : [])]
    .filter(Boolean)
    .filter((uid, index, arr) => arr.indexOf(uid) === index)
    .filter((uid) => uid !== currentUser?.uid);
  for (const uid of recipients) {
    await createNotification(uid, item.id, item.type || "request", title, body);
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
}

async function addComment(postId) {
  if (!currentUser) {
    location.href = "./login.html";
    return;
  }
  const input = document.querySelector(`[data-comment-input="${postId}"]`);
  const text = input?.value.trim() || "";
  if (!text) return alert("댓글을 입력해 주세요.");

  const item = allItems.find((row) => row.id === postId);
  if (!item) return;
  const comments = Array.isArray(item.comments) ? [...item.comments] : [];
  comments.push({
    id: `${Date.now()}`,
    uid: currentUser.uid,
    name: getProfileName(),
    text,
    createdAt: new Date().toISOString(),
  });
  await updateDoc(doc(db, "posts", postId), {
    comments,
    commentsCount: comments.length,
    updatedAt: serverTimestamp(),
  });
  item.comments = comments;
  await notifyPostRecipients(item, "댓글 알림", `${getProfileName()}님이 게시물(${item.title || item.programName || "Untitled"})에 댓글을 남겼습니다.`);
  clearGrid();
  renderNextPage();
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
  clearGrid();
  renderNextPage();
}

function setupFilterUI() {
  applyFilterBtn?.addEventListener("click", applyFilter);
  filterSelect?.addEventListener("change", applyFilter);
  searchInput?.addEventListener("focus", () => renderMemberSearchResults());
  searchInput?.addEventListener("click", () => renderMemberSearchResults());
  searchInput?.addEventListener("input", () => {
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
    if (notificationModal) notificationModal.hidden = false;
  });
  closeNotificationBtn?.addEventListener("click", () => {
    if (notificationModal) notificationModal.hidden = true;
  });
  notificationModal?.addEventListener("click", (e) => {
    if (e.target === notificationModal) notificationModal.hidden = true;
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

    const toggleBtn = event.target.closest("[data-toggle-comments]");
    if (toggleBtn) {
      event.stopPropagation();
      const card = event.target.closest(".card");
      const panel = card?.querySelector(".comment-panel");
      if (panel) panel.hidden = !panel.hidden;
      return;
    }

    const addBtn = event.target.closest("[data-comment-post]");
    if (addBtn) {
      event.stopPropagation();
      await addComment(addBtn.dataset.commentPost);
    }
  });
}

async function init() {
  currentUser = await whenAuthReady();
  await loadCurrentProfile();
  setupFilterUI();
  setupInfiniteScroll();
  setupNotificationUI();
  setupCardActions();
  await Promise.all([loadPosts(), loadNotifications(), loadUsersForSearch()]);
  clearGrid();
  renderNextPage();
}

init();
