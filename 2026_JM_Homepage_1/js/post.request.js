import { db, storage } from "./firebase-init.js";
import { whenAuthReady } from "./auth-state.js";
import {
  doc,
  getDoc,
  updateDoc,
  collection,
  addDoc,
  query,
  orderBy,
  getDocs,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";
import {
  ref,
  uploadBytes,
  getDownloadURL,
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-storage.js";

function $(id) { return document.getElementById(id); }
function msg(text, isError = false) {
  const el = $("postMsg");
  if (!el) return;
  el.textContent = text || "";
  el.style.color = isError ? "crimson" : "";
}
function getPostId() { return new URLSearchParams(location.search).get("id") || ""; }
function safeName(name = "file") { return String(name).replace(/[^a-zA-Z0-9._-]/g, "_"); }
function safeStem(name = "file") { return safeName(name).replace(/\.[^.]+$/, "") || "file"; }
function uniq(values = []) { return [...new Set(values.filter(Boolean))]; }
function getFiles(id) { return Array.from($(id)?.files || []); }

function formatDate(ts) {
  if (!ts) return "—";
  try {
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString("ko-KR");
  } catch {
    return "—";
  }
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function statusLabel(status) {
  const map = { request: "Request", present: "Presentation", developing: "Developing", management: "Finalized" };
  return map[status] || status || "—";
}

function renderFilePreview(inputId, previewId) {
  const box = $(previewId);
  if (!box) return;
  box.innerHTML = getFiles(inputId).map((file) => `<span class="attachment-chip">${safeName(file.name)}</span>`).join("");
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
  const parts = formatDateParts(toDate(updatedAt) || new Date());
  const ext = /\.[^.]+$/.exec(originalName || "")?.[0] || "";
  return `${today}_${safeStem(baseName || "Program")}_${parts.hm.replace(":", "_")}${ext}`;
}

function renderPersonLink(uid, label) {
  if (!label) return "—";
  if (!uid) return escapeHtml(label);
  return `<a class="detail-person-link" href="./profile.html?uid=${encodeURIComponent(uid)}">${escapeHtml(label)}</a>`;
}

function renderPersonList(uids = [], names = []) {
  if (!names.length) return "—";
  return names.map((name, index) => renderPersonLink(uids[index] || "", name)).join(", ");
}

function renderImageBox(url, alt = "image") {
  if (!url) return `<div class="image-upload-preview empty">No image</div>`;
  return `<img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}">`;
}

function normalizeAttachments(post) {
  if (Array.isArray(post?.requestAttachments) && post.requestAttachments.length) return post.requestAttachments;
  if (post?.requestAttachmentName || post?.requestAttachmentUrl) {
    return [{
      name: post.requestAttachmentName || "attachment",
      url: post.requestAttachmentUrl || "",
      type: post.requestAttachmentType || "",
      size: post.requestAttachmentSize || 0,
      downloadName: post.requestAttachmentDownloadName || post.requestAttachmentName || "attachment",
    }];
  }
  return [];
}

function normalizeUpdateAttachments(item) {
  if (Array.isArray(item?.attachments) && item.attachments.length) return item.attachments;
  if (item?.attachmentName || item?.attachmentUrl) {
    return [{
      name: item.attachmentName || "attachment",
      url: item.attachmentUrl || "",
      downloadName: item.downloadName || item.attachmentName || "attachment",
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
  a.target = "_blank";
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function renderAttachmentList(items = [], baseName = "Program", updatedAt = null) {
  if (!items.length) return "—";
  return `<div class="attachment-list">${items.map((item, index) => {
    const downloadName = item.downloadName || buildDownloadName(baseName, item.name || `attachment_${index + 1}`, updatedAt);
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

function setCheckedGroup(prefix, values = []) {
  ["excel", "csv", "pptx", "pdf"].forEach((value) => {
    const input = $(`${prefix}_${value}`);
    if (input) input.checked = values.includes(value);
  });
}

async function uploadAttachments(files, folder, baseName) {
  const result = [];
  for (let i = 0; i < files.length; i += 1) {
    const file = files[i];
    const now = new Date();
    const downloadName = buildDownloadName(baseName, file.name, now);
    const fileRef = ref(storage, `${folder}/${Date.now()}_${i + 1}_${safeName(file.name)}`);
    await uploadBytes(fileRef, file, {
      contentType: file.type || "application/octet-stream",
      contentDisposition: `attachment; filename="${downloadName}"; filename*=UTF-8''${encodeURIComponent(downloadName)}` ,
      customMetadata: { originalName: file.name || "file", downloadName },
    });
    const url = await getDownloadURL(fileRef);
    result.push({ name: file.name, url, type: file.type || "", size: file.size || 0, downloadName });
  }
  return result;
}

async function getMyProfile(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) return { role: "member", name: "", email: "" };
  const u = snap.data();
  return { role: u.role || "member", name: u.name || "", email: u.email || "" };
}

async function getUsersByRoles(roles = []) {
  const qs = await getDocs(collection(db, "users"));
  return qs.docs.map((snap) => ({ uid: snap.id, ...snap.data() })).filter((user) => roles.includes(user.role || "member"));
}

async function createNotification(toUid, postId, title, body) {
  if (!toUid) return;
  await addDoc(collection(db, "notifications"), {
    toUid,
    postId,
    postType: "request",
    title,
    body,
    read: false,
    createdAt: serverTimestamp(),
  });
}

async function createNotifications(toUids, postId, title, body) {
  for (const uid of uniq(toUids)) await createNotification(uid, postId, title, body);
}

async function addHistory(postId, type, payload, actorUid, actorName) {
  await addDoc(collection(db, "posts", postId, "updates"), {
    type,
    ...payload,
    actorUid,
    actorName,
    createdAt: serverTimestamp(),
  });
}

let currentUser = null;
let currentProfile = null;
let currentPost = null;
let currentPostId = null;

function isDeveloperRole() { return Boolean(currentProfile && ["developer", "admin"].includes(currentProfile.role)); }
function isOwner() { return Boolean(currentUser && currentPost && currentPost.createdBy === currentUser.uid); }
function getAssignedDeveloperUids(post = currentPost) {
  if (!post) return [];
  if (Array.isArray(post.assignedDeveloperUids)) return uniq(post.assignedDeveloperUids);
  return post.assignedDeveloperUid ? [post.assignedDeveloperUid] : [];
}
function getAssignedDeveloperNames(post = currentPost) {
  if (!post) return [];
  if (Array.isArray(post.assignedDeveloperNames)) return uniq(post.assignedDeveloperNames);
  return post.assignedDeveloperName ? [post.assignedDeveloperName] : [];
}
function canDeveloperAct() { return isDeveloperRole(); }
function canInvite() { return Boolean(currentPost && currentPost.status === "request" && canDeveloperAct()); }
function canFinalize() { return Boolean(currentPost && currentPost.presentationLocked && canDeveloperAct()); }

function getAllowedComposerOptions() {
  if (!currentPost || currentPost.status === "request") return [];
  if (!currentPost.presentationLocked) return isOwner() ? [{ value: "presentation", label: "Presentation" }] : [];
  if (canDeveloperAct()) return [{ value: "develop", label: "Develop result" }, { value: "specific-request", label: "Specific request" }];
  return isOwner() ? [{ value: "specific-request", label: "Specific request" }] : [];
}

function canUseComposerFor(type) { return getAllowedComposerOptions().some((item) => item.value === type); }

function setComposerOptions() {
  const select = $("updateType");
  if (!select) return;
  const options = getAllowedComposerOptions();
  const prevValue = select.value;
  if (!options.length) {
    select.innerHTML = `<option value="">사용 가능 항목 없음</option>`;
    select.value = "";
    return;
  }
  select.innerHTML = options.map((item) => `<option value="${item.value}">${item.label}</option>`).join("");
  select.value = options.some((item) => item.value === prevValue) ? prevValue : options[0].value;
}

function updateComposerState() {
  const options = getAllowedComposerOptions();
  const composerEnabled = options.length > 0;
  $("unifiedComposer")?.classList.toggle("composer-disabled", !composerEnabled);
  if ($("updateType")) $("updateType").disabled = !composerEnabled;
  if ($("unifiedComment")) $("unifiedComment").disabled = !composerEnabled;
  if ($("unifiedAttachment")) $("unifiedAttachment").disabled = !composerEnabled;
  if ($("unifiedSaveBtn")) $("unifiedSaveBtn").disabled = !composerEnabled;
  if ($("finalizeBtn")) $("finalizeBtn").disabled = !canFinalize();
  if ($("finalizeBtn")) $("finalizeBtn").hidden = !canDeveloperAct();

  const hint = $("composerHint");
  if (!hint) return;
  if (currentPost?.status === "request") {
    hint.textContent = canDeveloperAct() ? "Invitation 버튼으로 진행을 시작해 주세요." : "Developer/Admin의 Invitation 이후 작성할 수 있습니다.";
  } else if (!currentPost?.presentationLocked) {
    hint.textContent = isOwner() ? "Presentation 등록이 가능합니다." : "Presentation은 작성자만 등록할 수 있습니다.";
  } else if (canDeveloperAct()) {
    hint.textContent = "Develop result / Specific request 작성 가능. Finalized는 Developer/Admin만 가능합니다.";
  } else if (isOwner()) {
    hint.textContent = "Specific request 작성이 가능합니다.";
  } else {
    hint.textContent = "현재 작성 권한이 없습니다.";
  }
}

function renderPost(data) {
  $("detailType").textContent = data.type || "request";
  $("detailTitle").textContent = data.title || data.programName || "Untitled";
  $("detailStatus").textContent = statusLabel(data.status);
  $("detailWriter").innerHTML = renderPersonLink(data.createdBy, data.createdByName || data.createdByEmail || "—");
  $("detailUpdated").textContent = formatDate(data.updatedAt || data.createdAt);
  $("detailAssignedDeveloper").innerHTML = renderPersonList(getAssignedDeveloperUids(data), getAssignedDeveloperNames(data));
  $("detailFinalizedAt").textContent = formatDate(data.finalizedAt);
  $("programNameReadonly").value = data.programName || data.title || "";
  $("descriptionReadonly").value = data.description || data.body || "";
  $("specificRequestReadonly").value = data.specificRequest || "";
  $("detailAttachment").innerHTML = renderAttachmentList(normalizeAttachments(data), data.programName || data.title || "Program", data.updatedAt || data.createdAt);
  const detailImage = $("detailImage");
  if (detailImage) detailImage.innerHTML = renderImageBox(data.imageUrl, data.programName || data.title || "request image");
  setCheckedGroup("input", data.inputForms || []);
  setCheckedGroup("output", data.outputForms || []);
  $("inviteWrap").hidden = !canInvite();
  setComposerOptions();
  updateComposerState();
}

function buildStackCard(item, index) {
  const typeMap = {
    presentation: "Presentation",
    develop: `Develop result ${index}`,
    "specific-request": `Specific request ${index}`,
    invitation: "Invitation",
    finalize: "Finalized",
  };
  const title = typeMap[item.type] || item.type || "Update";
  const text = escapeHtml(item.text || "—").replaceAll("\n", "<br>");
  const attachments = renderAttachmentList(normalizeUpdateAttachments(item), currentPost?.programName || currentPost?.title || "Program", item.createdAt);
  return `
    <div class="timeline-item">
      <div class="stack-title-row">
        <strong>${title}</strong>
        <span class="card-meta">${escapeHtml(item.actorName || "unknown")}</span>
      </div>
      <div class="detail-box readonly-box">${text}</div>
      ${attachments === "—" ? "" : attachments}
      <div class="card-meta">${formatDate(item.createdAt)}</div>
    </div>
  `;
}

async function loadTimeline(postId) {
  const box = $("timelineList");
  box.innerHTML = "";
  try {
    const qs = await getDocs(query(collection(db, "posts", postId, "updates"), orderBy("createdAt", "asc")));
    const items = qs.docs.map((snap) => snap.data()).filter((item) => item.type !== "invitation");
    if (!items.length) {
      box.innerHTML = `<div class="timeline-item">아직 저장된 comment / attachment 가 없습니다.</div>`;
      return;
    }
    let developIndex = 0;
    let requestIndex = 0;
    box.innerHTML = items.map((item) => {
      if (item.type === "develop") developIndex += 1;
      if (item.type === "specific-request") requestIndex += 1;
      const idx = item.type === "develop" ? developIndex : item.type === "specific-request" ? requestIndex : "";
      return buildStackCard(item, idx);
    }).join("");
  } catch (e) {
    console.error("loadTimeline error:", e);
    box.innerHTML = `<div class="timeline-item">stack 을 불러오지 못했습니다.</div>`;
  }
}

async function loadPost() {
  currentPostId = getPostId();
  if (!currentPostId) return msg("게시물 ID가 없습니다.", true);
  const snap = await getDoc(doc(db, "posts", currentPostId));
  if (!snap.exists()) return msg("게시물을 찾을 수 없습니다.", true);
  currentPost = { id: snap.id, ...snap.data() };
  renderPost(currentPost);
  await loadTimeline(currentPostId);
}

async function handleInvitation() {
  try {
    msg("");
    if (!canInvite()) throw new Error("Invitation은 Developer/Admin만 누를 수 있습니다.");
    await updateDoc(doc(db, "posts", currentPostId), { status: "present", updatedAt: serverTimestamp() });
    await addHistory(currentPostId, "invitation", { text: "Developer/Admin이 invitation을 수락했습니다." }, currentUser.uid, currentProfile.name || currentUser.email || "");
    await createNotifications([currentPost.createdBy, ...(await getUsersByRoles(["admin"])).map((item) => item.uid)], currentPostId, "Invitation 수신", "Developer/Admin이 invitation을 눌렀습니다.");
    await loadPost();
    msg("✅ Invitation 완료");
  } catch (e) {
    console.error(e);
    msg(`❌ ${e.message || e.code || "Invitation 실패"}`, true);
  }
}

async function handleUnifiedSave() {
  const btn = $("unifiedSaveBtn");
  btn.disabled = true;
  try {
    msg("");
    const type = $("updateType").value;
    if (!canUseComposerFor(type)) throw new Error("현재 단계에서 저장할 수 없습니다.");

    const text = $("unifiedComment").value.trim();
    const files = getFiles("unifiedAttachment");
    if (!text && !files.length) throw new Error("Comment 또는 Attachment 중 하나는 입력해 주세요.");

    const actorName = currentProfile.name || currentUser.email || "";
    const baseName = currentPost.programName || currentPost.title || "Program";
    const attachments = await uploadAttachments(files, `posts/${currentPostId}/${type}`, baseName);

    await addHistory(currentPostId, type, {
      text,
      attachments,
      attachmentName: attachments[0]?.name || "",
      attachmentUrl: attachments[0]?.url || "",
      downloadName: attachments[0]?.downloadName || "",
    }, currentUser.uid, actorName);

    const patch = { updatedAt: serverTimestamp() };
    const admins = await getUsersByRoles(["admin"]);
    const adminUids = admins.map((item) => item.uid);

    if (type === "presentation") {
      patch.status = "developing";
      patch.presentationLocked = true;
      patch.presentationComment = text;
      patch.presentationAttachments = attachments;
      patch.presentationAttachmentName = attachments[0]?.name || "";
      patch.presentationAttachmentUrl = attachments[0]?.url || "";
      const devAndAdmins = await getUsersByRoles(["developer", "admin"]);
      await createNotifications(devAndAdmins.map((item) => item.uid), currentPostId, "Presentation 등록", `${actorName || "작성자"}님이 Presentation을 등록했습니다.`);
    } else if (type === "develop") {
      patch.status = currentPost.status === "management" ? "management" : "developing";
      const prevUids = getAssignedDeveloperUids(currentPost);
      const prevNames = getAssignedDeveloperNames(currentPost);
      patch.assignedDeveloperUids = prevUids.includes(currentUser.uid) ? prevUids : [...prevUids, currentUser.uid];
      patch.assignedDeveloperNames = prevUids.includes(currentUser.uid) ? prevNames : [...prevNames, actorName];
      await createNotifications([currentPost.createdBy, ...adminUids], currentPostId, "Develop result 저장", `${actorName || "Developer"}님이 develop result를 등록했습니다.`);
    } else if (type === "specific-request") {
      patch.status = currentPost.status === "management" ? "management" : "developing";
      if (isOwner() && !canDeveloperAct()) {
        await createNotifications([...getAssignedDeveloperUids(currentPost), ...adminUids], currentPostId, "Specific request 저장", "Requester가 새 specific request를 등록했습니다.");
      } else {
        await createNotifications([currentPost.createdBy, ...adminUids], currentPostId, "Specific request 저장", `${actorName || "Developer"}님이 specific request를 등록했습니다.`);
      }
    }

    await updateDoc(doc(db, "posts", currentPostId), patch);
    $("unifiedComment").value = "";
    $("unifiedAttachment").value = "";
    renderFilePreview("unifiedAttachment", "unifiedAttachmentPreview");
    await loadPost();
    msg("✅ 저장 완료");
  } catch (e) {
    console.error(e);
    msg(`❌ ${e.message || e.code || "저장 실패"}`, true);
  } finally {
    btn.disabled = false;
  }
}

async function handleFinalize() {
  const btn = $("finalizeBtn");
  btn.disabled = true;
  try {
    msg("");
    if (!canFinalize()) throw new Error("Finalized는 Developer/Admin만 진행할 수 있습니다.");
    await updateDoc(doc(db, "posts", currentPostId), { status: "management", finalizedAt: serverTimestamp(), updatedAt: serverTimestamp() });
    await addHistory(currentPostId, "finalize", { text: "Status가 management로 변경되었습니다." }, currentUser.uid, currentProfile.name || currentUser.email || "");
    const admins = await getUsersByRoles(["admin"]);
    await createNotifications([currentPost.createdBy, ...admins.map((item) => item.uid)], currentPostId, "Finalized", "Developer/Admin이 finalized를 눌러 management 상태로 변경했습니다.");
    await loadPost();
    msg("✅ Finalized 완료");
  } catch (e) {
    console.error(e);
    msg(`❌ ${e.message || e.code || "Finalized 실패"}`, true);
  } finally {
    btn.disabled = false;
  }
}

function bindEvents() {
  $("inviteBtn")?.addEventListener("click", handleInvitation);
  $("unifiedSaveBtn")?.addEventListener("click", handleUnifiedSave);
  $("finalizeBtn")?.addEventListener("click", handleFinalize);
  $("updateType")?.addEventListener("change", () => updateComposerState());
  $("unifiedAttachment")?.addEventListener("change", () => renderFilePreview("unifiedAttachment", "unifiedAttachmentPreview"));
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
  if (!currentUser) {
    location.href = "./login.html";
    return;
  }
  currentProfile = await getMyProfile(currentUser.uid);
  bindEvents();
  await loadPost();
}

init();
