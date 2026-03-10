import { db, storage } from "./firebase-init.js";
import { whenAuthReady } from "./auth-state.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";
import { ref } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-storage.js";

function $(id) { return document.getElementById(id); }
function setText(id, value) {
  const el = $(id);
  if (!el) return;
  el.textContent = value ?? "";
}
function msg(text, isError = false) {
  const el = $("postMsg");
  if (!el) return;
  el.textContent = text || "";
  el.style.color = isError ? "crimson" : "";
}
function getPostId() { return new URLSearchParams(location.search).get("id") || ""; }
function safeName(name = "file") { return String(name).replace(/[^a-zA-Z0-9._-]/g, "_"); }
function safeStem(name = "file") { return safeName(name).replace(/\.[^.]+$/, "") || "file"; }
function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
function formatDateTime(ts) {
  if (!ts) return "—";
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("ko-KR");
}
function formatDateParts(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return { ymd: `${y}${m}${d}`, hm: `${hh}:${mm}` };
}
function toDate(value) {
  if (!value) return null;
  const d = value?.toDate ? value.toDate() : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}
function buildDownloadName(baseName, originalName, updatedAt) {
  const today = formatDateParts(new Date()).ymd;
  const updated = formatDateParts(toDate(updatedAt) || new Date()).hm;
  const ext = /\.[^.]+$/.exec(originalName || "")?.[0] || "";
  return `${today}_${safeStem(baseName || "Event")}_${updated}${ext}`;
}
function renderPersonLink(uid, label) {
  if (!label) return "—";
  if (!uid) return escapeHtml(label);
  return `<a class="detail-person-link" href="./profile.html?uid=${encodeURIComponent(uid)}">${escapeHtml(label)}</a>`;
}
function renderImageBox(url, alt = "image") {
  if (!url) return `<div class="image-upload-preview empty">No image</div>`;
  return `<img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}">`;
}
function getEventReadKey(uid = "guest") { return `read_event_posts_${uid}`; }
function markEventRead(postId, uid) {
  if (!postId || !uid) return;
  try {
    const state = JSON.parse(localStorage.getItem(getEventReadKey(uid)) || "{}");
    state[postId] = true;
    localStorage.setItem(getEventReadKey(uid), JSON.stringify(state));
  } catch {}
}
function normalizeAttachments(post) {
  if (Array.isArray(post?.attachments) && post.attachments.length) return post.attachments;
  if (post?.attachmentName || post?.attachmentUrl) {
    return [{
      name: post.attachmentName || "attachment",
      url: post.attachmentUrl || "",
      downloadName: post.attachmentDownloadName || post.attachmentName || "attachment",
    }];
  }
  return [];
}
function parseStoragePath(url = "") {
  try {
    const u = new URL(url);
    const match = u.pathname.match(/\/o\/(.+)$/);
    return match ? decodeURIComponent(match[1]) : "";
  } catch {
    return "";
  }
}
function buildNavigationDownloadUrl(url = "", filename = "") {
  try {
    const next = new URL(url);
    if (filename) next.searchParams.set("download", filename);
    return next.toString();
  } catch {
    return url;
  }
}
async function triggerDownload(url, filename) {
  const targetUrl = buildNavigationDownloadUrl(url, filename);
  const a = document.createElement("a");
  a.href = targetUrl;
  a.rel = "noopener";
  a.target = "_blank";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
function renderAttachmentList(items = [], title = "Event", updatedAt = null) {
  if (!items.length) return "—";
  return `<div class="attachment-list">${items.map((item, index) => {
    const downloadName = item.downloadName || buildDownloadName(title, item.name || `attachment_${index + 1}`, updatedAt);
    return `
      <div class="attachment-row">
        <div>
          <div><b>${escapeHtml(item.name || `Attachment ${index + 1}`)}</b></div>
          <div class="card-meta">download: ${escapeHtml(downloadName)}</div>
        </div>
        ${item.url ? `<button class="btn attachment-download-btn" type="button" data-url="${escapeHtml(item.url)}" data-filename="${escapeHtml(downloadName)}">Download</button>` : ""}
      </div>
    `;
  }).join("")}</div>`;
}
function renderAttendees(items = []) {
  if (!Array.isArray(items) || !items.length) return "—";
  return `<div class="selected-member-list">${items.map((item) => `
    <a class="selected-member-chip selected-member-link" href="./profile.html?uid=${encodeURIComponent(item.uid || "")}">
      ${escapeHtml(item.name || item.email || "회원")}
    </a>
  `).join("")}</div>`;
}

async function loadPost() {
  const postId = getPostId();
  if (!postId) return msg("게시물 ID가 없습니다.", true);
  const snap = await getDoc(doc(db, "posts", postId));
  if (!snap.exists()) return msg("게시물을 찾을 수 없습니다.", true);
  const data = snap.data();
  if ((data.type || "event") !== "event") {
    location.href = `./post.request.html?id=${encodeURIComponent(postId)}`;
    return;
  }

  const title = data.title || "Untitled";
  setText("detailType", data.type || "event");
  setText("detailTitle", title);
  setText("detailStatus", "Event");
  const writer = $("detailWriter");
  if (writer) writer.innerHTML = renderPersonLink(data.createdBy, data.createdByName || data.createdByEmail || "—");
  setText("detailUpdated", formatDateTime(data.updatedAt || data.createdAt));
  setText("detailEventDate", data.eventDate || "—");
  setText("detailEventLocation", data.eventLocation || "—");
  const desc = $("detailDescription");
  if (desc) desc.innerHTML = escapeHtml(data.description || data.body || "—").replaceAll("\n", "<br>");
  const image = $("detailImage");
  if (image) image.innerHTML = renderImageBox(data.imageUrl, title);
  const attendees = $("detailAttendees");
  if (attendees) attendees.innerHTML = renderAttendees(data.attendees || []);
  const detailAttachment = $("detailAttachment");
  if (detailAttachment) detailAttachment.innerHTML = renderAttachmentList(normalizeAttachments(data), title, data.updatedAt || data.createdAt);
  if (currentUser?.uid) markEventRead(postId, currentUser.uid);
}

let currentUser = null;

function bindEvents() {
  document.addEventListener("click", async (event) => {
    const btn = event.target.closest(".attachment-download-btn");
    if (!btn) return;
    event.preventDefault();
    try {
      await triggerDownload(btn.dataset.url, btn.dataset.filename);
    } catch (e) {
      console.error(e);
      alert("첨부 파일 다운로드에 실패했습니다.");
    }
  });
}

async function init() {
  currentUser = await whenAuthReady();
  bindEvents();
  await loadPost();
}

init();
