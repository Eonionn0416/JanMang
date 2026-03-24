import { db, storage } from "./firebase-init.js";
import { whenAuthReady } from "./auth-state.js";
import { doc, getDoc, updateDoc, deleteDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-storage.js";

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
function getFiles(id) { return Array.from($(id)?.files || []); }
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
function formatEventDateTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (!Number.isNaN(d.getTime())) return d.toLocaleString("ko-KR");
  return String(value).replace("T", " ");
}
function formatDateParts(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return { ymd: `${y}${m}${d}`, hm: `${hh}_${mm}` };
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
  return `<img class="detail-preview-image" src="${escapeHtml(url)}" alt="${escapeHtml(alt)}">`;
}
function renderFilePreview(inputId, previewId) {
  const box = $(previewId);
  if (!box) return;
  const files = getFiles(inputId);
  if (!files.length) {
    box.classList.add("empty");
    box.innerHTML = "선택된 이미지가 없습니다.";
    return;
  }
  const primaryFile = files[0];
  const primaryUrl = URL.createObjectURL(primaryFile);
  box.classList.remove("empty");
  box.innerHTML = `
    <div class="meeting-upload-primary-preview">
      <div class="meeting-upload-primary-head">대표 미리보기 (1번 이미지)</div>
      <img class="meeting-upload-primary-image" src="${escapeHtml(primaryUrl)}" alt="${escapeHtml(primaryFile.name || "meeting image")}">
      <div class="meeting-upload-primary-name">${escapeHtml(primaryFile.name || "대표 이미지")}</div>
    </div>
    <div class="meeting-upload-file-list">
      ${files.map((file, index) => `
        <div class="meeting-upload-file">
          <span class="meeting-upload-count">${index + 1}</span>
          <span class="meeting-upload-file-name">${escapeHtml(file.name)}</span>
          ${index === 0 ? '<span class="meeting-upload-badge">대표</span>' : ''}
        </div>
      `).join("")}
    </div>
  `;
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
function normalizeImages(post) {
  if (Array.isArray(post?.images) && post.images.length) return post.images;
  if (post?.imageName || post?.imageUrl) {
    return [{
      name: post.imageName || "image",
      url: post.imageUrl || "",
      downloadName: post.imageDownloadName || post.imageName || "image",
    }];
  }
  if (post?.imageUrl) {
    return [{ name: "image", url: post.imageUrl, downloadName: "image" }];
  }
  return [];
}
function normalizeMeetingImages(post) {
  if (Array.isArray(post?.meetingImages) && post.meetingImages.length) return post.meetingImages;
  return [];
}
function mergeEventAndMeetingImages(post) {
  const result = [];
  const seen = new Set();
  [...normalizeImages(post), ...normalizeMeetingImages(post)].forEach((item, index) => {
    if (!item?.url) return;
    const key = item.url;
    if (seen.has(key)) return;
    seen.add(key);
    result.push({
      ...item,
      source: index < normalizeImages(post).length ? "event" : "meeting",
    });
  });
  return result;
}
function getRepresentativeMeetingIndex(post) {
  const items = mergeEventAndMeetingImages(post);
  if (!items.length) return -1;
  const targetUrl = post?.meetingRepresentativeUrl || post?.imageUrl || "";
  if (!targetUrl) return 0;
  const index = items.findIndex((item) => item?.url === targetUrl);
  return index >= 0 ? index : 0;
}
function getRepresentativeMeetingImage(post) {
  const index = getRepresentativeMeetingIndex(post);
  return index >= 0 ? mergeEventAndMeetingImages(post)[index] : null;
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
function renderMeetingImages(post, updatedAt = null) {
  const items = mergeEventAndMeetingImages(post);
  if (!items.length) return "—";
  const representativeIndex = getRepresentativeMeetingIndex(post);
  const representative = items[representativeIndex] || items[0];
  const currentIndexUrl = post?.imageUrl || representative?.url || "";
  return `
    <div class="meeting-gallery-layout">
      <div class="meeting-gallery-main">
        <div class="meeting-gallery-main-head">대표 미리보기</div>
        <img class="detail-preview-image meeting-gallery-main-image" src="${escapeHtml(representative?.url || "")}" alt="${escapeHtml(representative?.name || "image")}">
        <div class="meeting-gallery-main-name"><b>${escapeHtml(representative?.name || "Image")}</b></div>
        <div class="card-meta">대표 이미지 = index 게시물 이미지</div>
        <div class="card-meta">${escapeHtml(representative?.uploaderName || representative?.uploaderEmail || "")}</div>
      </div>
      <div class="meeting-gallery-list">
        ${items.map((item, index) => {
          const downloadName = item.downloadName || buildDownloadName("event_image", item.name || `image_${index + 1}`, updatedAt);
          const isRepresentative = index === representativeIndex;
          const isIndexImage = currentIndexUrl && item?.url && currentIndexUrl === item.url;
          return `
            <div class="meeting-gallery-row">
              <div class="meeting-gallery-row-text">
                <div class="meeting-gallery-row-name">
                  <b>${escapeHtml(item.name || `Image ${index + 1}`)}</b>
                  ${isRepresentative ? '<span class="meeting-upload-badge">대표</span>' : ''}
                  ${isIndexImage ? '<span class="meeting-upload-badge secondary">Index</span>' : ''}
                  ${item.source === "event" ? '<span class="meeting-upload-badge secondary">Event</span>' : '<span class="meeting-upload-badge secondary">Upload</span>'}
                </div>
                <div class="card-meta">${escapeHtml(item.uploaderName || item.uploaderEmail || "")}</div>
              </div>
              <div class="meeting-gallery-row-actions">
                <button class="btn btn-ghost set-meeting-representative-btn" type="button" data-meeting-action="representative" data-meeting-index="${index}">대표로 설정</button>
                <button class="btn attachment-download-btn" type="button" data-url="${escapeHtml(item.url || "")}" data-filename="${escapeHtml(downloadName)}">Download</button>
                <button class="btn btn-ghost delete-meeting-image-btn" type="button" data-meeting-action="delete" data-meeting-index="${index}">Delete</button>
              </div>
            </div>
          `;
        }).join("")}
      </div>
    </div>
  `;
}
function canUploadMeetingImages(post, user) {
  if (!post || !user) return false;
  if (post.createdBy === user.uid) return true;
  const attendeeUids = Array.isArray(post.attendeeUids) ? post.attendeeUids : [];
  return attendeeUids.includes(user.uid);
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
      contentDisposition: `attachment; filename="${downloadName}"; filename*=UTF-8''${encodeURIComponent(downloadName)}`,
      customMetadata: { originalName: file.name || "file", downloadName },
    });
    const url = await getDownloadURL(fileRef);
    result.push({ name: file.name, url, type: file.type || "", size: file.size || 0, downloadName });
  }
  return result;
}

let currentUser = null;
let currentPost = null;

async function loadPost() {
  const postId = getPostId();
  if (!postId) return msg("게시물 ID가 없습니다.", true);
  const snap = await getDoc(doc(db, "posts", postId));
  if (!snap.exists()) return msg("게시물을 찾을 수 없습니다.", true);
  const data = { id: snap.id, ...snap.data() };
  currentPost = data;
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
  setText("detailEventDate", formatEventDateTime(data.eventDate || ""));
  setText("detailEventLocation", data.eventLocation || "—");
  const desc = $("detailDescription");
  if (desc) desc.innerHTML = escapeHtml(data.description || data.body || "—").replaceAll("\n", "<br>");
  const image = $("detailImage");
  const representativeImage = getRepresentativeMeetingImage(data);
  if (image) image.innerHTML = renderImageBox(representativeImage?.url || data.imageUrl, title);
  const attendees = $("detailAttendees");
  if (attendees) attendees.innerHTML = renderAttendees(data.attendees || []);
  const detailAttachment = $("detailAttachment");
  if (detailAttachment) detailAttachment.innerHTML = renderAttachmentList(normalizeAttachments(data), title, data.updatedAt || data.createdAt);
  const detailMeetingImages = $("detailMeetingImages");
  if (detailMeetingImages) detailMeetingImages.innerHTML = renderMeetingImages(data, data.updatedAt || data.createdAt);
  const eventProofSection = $("eventProofSection");
  if (eventProofSection) eventProofSection.hidden = !canUploadMeetingImages(data, currentUser);
  const deleteBtn = $("deleteEventBtn");
  if (deleteBtn) deleteBtn.hidden = !(currentUser && data.createdBy === currentUser.uid);
  if (currentUser?.uid) markEventRead(postId, currentUser.uid);
}

function openImagePreview(src = "") {
  const modal = $("imagePreviewModal");
  const img = $("imagePreviewModalImg");
  if (!modal || !img || !src) return;
  img.src = src;
  modal.hidden = false;
}

function closeImagePreview() {
  const modal = $("imagePreviewModal");
  const img = $("imagePreviewModalImg");
  if (img) img.src = "";
  if (modal) modal.hidden = true;
}

async function saveMeetingImages() {
  const btn = $("saveEventProofBtn");
  if (btn) btn.disabled = true;
  try {
    msg("");
    if (!currentUser || !currentPost) throw new Error("로그인이 필요합니다.");
    if (!canUploadMeetingImages(currentPost, currentUser)) throw new Error("게시자 또는 참석자만 저장할 수 있습니다.");
    const files = getFiles("eventProofImage");
    if (!files.length) throw new Error("이미지를 선택해 주세요.");
    const uploads = await uploadAttachments(files, `posts/event/${currentPost.id}/meeting`, currentPost.title || "Event");
    const appended = uploads.map((item) => ({
      ...item,
      uploaderUid: currentUser.uid,
      uploaderEmail: currentUser.email || "",
      uploaderName: currentPost.createdBy === currentUser.uid ? (currentPost.createdByName || currentUser.displayName || "") : (currentUser.displayName || ""),
      createdAt: new Date().toISOString(),
      source: "meeting",
    }));
    const previousImages = mergeEventAndMeetingImages(currentPost);
    const nextImages = [...previousImages, ...appended];
    const first = nextImages[0] || null;
    const patch = {
      images: nextImages,
      meetingImages: nextImages,
      updatedAt: serverTimestamp(),
    };
    if (!currentPost.meetingRepresentativeUrl && first?.url) {
      patch.meetingRepresentativeUrl = first.url;
      patch.meetingRepresentativeName = first.name || "";
    }
    if (!currentPost.imageUrl && first?.url) {
      patch.imageUrl = first.url;
      patch.imageName = first.name || "";
      patch.imageType = first.type || "image/*";
      patch.imageSize = first.size || 0;
      patch.imageDownloadName = first.downloadName || first.name || "";
    }
    await updateDoc(doc(db, "posts", currentPost.id), patch);
    $("eventProofImage").value = "";
    renderFilePreview("eventProofImage", "eventProofPreview");
    await loadPost();
    msg("✅ 이미지 저장 완료");
  } catch (e) {
    console.error(e);
    msg(`❌ ${e.message || e.code || "저장 실패"}`, true);
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function setMeetingImagePreference(action, index) {
  try {
    msg("");
    if (!currentUser || !currentPost) throw new Error("로그인이 필요합니다.");
    if (!canUploadMeetingImages(currentPost, currentUser)) throw new Error("게시자 또는 참석자만 변경할 수 있습니다.");
    const items = mergeEventAndMeetingImages(currentPost);
    const target = items[index];
    if (!target) throw new Error("이미지를 찾을 수 없습니다.");
    const patch = { updatedAt: serverTimestamp() };
    if (action === "representative") {
      patch.meetingRepresentativeUrl = target.url || "";
      patch.meetingRepresentativeName = target.name || "";
      patch.imageUrl = target.url || "";
      patch.imageName = target.name || "";
      patch.imageType = target.type || "image/*";
      patch.imageSize = target.size || 0;
      patch.imageDownloadName = target.downloadName || target.name || "";
    }
    await updateDoc(doc(db, "posts", currentPost.id), patch);
    await loadPost();
    msg("✅ 대표 / Index 이미지 변경 완료");
  } catch (e) {
    console.error(e);
    msg(`❌ ${e.message || e.code || "변경 실패"}`, true);
  }
}

async function deleteMeetingImage(index) {
  try {
    msg("");
    if (!currentUser || !currentPost) throw new Error("로그인이 필요합니다.");
    if (!canUploadMeetingImages(currentPost, currentUser)) throw new Error("게시자 또는 참석자만 삭제할 수 있습니다.");
    const items = mergeEventAndMeetingImages(currentPost);
    const target = items[index];
    if (!target) throw new Error("이미지를 찾을 수 없습니다.");
    if (!confirm(`이미지를 삭제할까요?
${target.name || "image"}`)) return;
    const nextImages = items.filter((_, i) => i !== index);
    const nextRepresentative = nextImages[0] || null;
    const patch = {
      images: nextImages,
      meetingImages: nextImages,
      updatedAt: serverTimestamp(),
      meetingRepresentativeUrl: nextRepresentative?.url || "",
      meetingRepresentativeName: nextRepresentative?.name || "",
      imageUrl: nextRepresentative?.url || "",
      imageName: nextRepresentative?.name || "",
      imageType: nextRepresentative?.type || "",
      imageSize: nextRepresentative?.size || 0,
      imageDownloadName: nextRepresentative?.downloadName || nextRepresentative?.name || "",
    };
    await updateDoc(doc(db, "posts", currentPost.id), patch);
    await loadPost();
    msg("✅ 이미지 삭제 완료");
  } catch (e) {
    console.error(e);
    msg(`❌ ${e.message || e.code || "삭제 실패"}`, true);
  }
}

async function deleteCurrentPost() {
  try {
    msg("");
    if (!currentUser || !currentPost) throw new Error("로그인이 필요합니다.");
    if (currentPost.createdBy !== currentUser.uid) throw new Error("게시자만 삭제할 수 있습니다.");
    if (!confirm("이 Event 게시물을 삭제할까요?")) return;
    await deleteDoc(doc(db, "posts", currentPost.id));
    location.href = "./index.html";
  } catch (e) {
    console.error(e);
    msg(`❌ ${e.message || e.code || "삭제 실패"}`, true);
  }
}

function bindEvents() {
  $("eventProofImage")?.addEventListener("change", () => renderFilePreview("eventProofImage", "eventProofPreview"));
  $("saveEventProofBtn")?.addEventListener("click", saveMeetingImages);
  $("deleteEventBtn")?.addEventListener("click", deleteCurrentPost);
  document.addEventListener("click", async (event) => {
    const btn = event.target.closest(".attachment-download-btn");
    if (btn) {
      event.preventDefault();
      try {
        await triggerDownload(btn.dataset.url, btn.dataset.filename);
      } catch (e) {
        console.error(e);
        alert("첨부 파일 다운로드에 실패했습니다.");
      }
      return;
    }

    const prefBtn = event.target.closest("[data-meeting-action]");
    if (prefBtn) {
      event.preventDefault();
      const action = prefBtn.dataset.meetingAction;
      const index = Number(prefBtn.dataset.meetingIndex);
      if (action === "delete") await deleteMeetingImage(index);
      else await setMeetingImagePreference(action, index);
      return;
    }

    const previewImage = event.target.closest(".detail-preview-image");
    if (previewImage) {
      openImagePreview(previewImage.getAttribute("src") || "");
      return;
    }

    if (event.target.id === "closeImagePreviewBtn" || event.target.id === "imagePreviewModal") {
      closeImagePreview();
    }
  });
}

async function init() {
  currentUser = await whenAuthReady();
  bindEvents();
  await loadPost();
}

init();
