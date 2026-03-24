import { db, storage } from "./firebase-init.js";
import { whenAuthReady } from "./auth-state.js";
import {
  collection,
  addDoc,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";
import {
  ref,
  uploadBytes,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-storage.js";

function $(id) { return document.getElementById(id); }

const EVENT_GUIDE_SLIDES = [8, 9, 10].map((page) => ({
  page,
  src: `./assets/manual/slide-${page}.png`,
  alt: `Event manual page ${page}`,
}));

const selectedAttendeeMap = new Map();
const eventGuideModal = $("eventGuideModal");
const eventGuideConfirmBtn = $("eventGuideConfirmBtn");
const eventGuidePrevBtn = $("eventGuidePrevBtn");
const eventGuideNextBtn = $("eventGuideNextBtn");
const eventGuidePageIndicator = $("eventGuidePageIndicator");
const eventGuideCurrentImage = $("eventGuideCurrentImage");
const eventGuideThumbs = $("eventGuideThumbs");
let allUsers = [];
let currentProfile = null;
let eventGuideIndex = 0;

function msg(text, isError = false) {
  const el = $("eventMsg");
  if (!el) return;
  el.textContent = text || "";
  el.style.color = isError ? "crimson" : "";
}

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

function buildDownloadName(title, originalName, date = new Date()) {
  const { ymd, hm } = formatDateParts(date);
  const ext = /\.[^.]+$/.exec(originalName || "")?.[0] || "";
  return `${ymd}_${safeStem(title || "Event")}_${hm}${ext}`;
}

async function uploadAttachments(files, folder, title) {
  const result = [];
  for (let i = 0; i < files.length; i += 1) {
    const file = files[i];
    const now = new Date();
    const downloadName = buildDownloadName(title, file.name, now);
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

async function getCurrentUserProfile(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) {
    return { name: "", email: "", role: "member", site: "", tier: "QFN", eventManualSeen: false };
  }
  const u = snap.data();
  return {
    name: u.name || "",
    email: u.email || "",
    role: u.role || "member",
    site: u.site || "",
    tier: u.tier || "QFN",
    eventManualSeen: Boolean(u.eventManualSeen),
  };
}

function shouldOpenEventGuideModal() {
  return Boolean(currentProfile && !currentProfile.eventManualSeen);
}

function renderEventGuideThumbs() {
  if (!eventGuideThumbs) return;
  eventGuideThumbs.innerHTML = EVENT_GUIDE_SLIDES.map((slide, index) => `
    <button class="guide-thumb-btn${index === eventGuideIndex ? " is-active" : ""}" type="button" data-event-guide-index="${index}" aria-label="Page ${slide.page} 이동">
      ${slide.page}
    </button>
  `).join("");
}

function renderEventGuideSlide() {
  const slide = EVENT_GUIDE_SLIDES[eventGuideIndex];
  if (!slide) return;
  if (eventGuideCurrentImage) {
    eventGuideCurrentImage.src = slide.src;
    eventGuideCurrentImage.alt = slide.alt;
  }
  if (eventGuidePageIndicator) {
    eventGuidePageIndicator.textContent = `Page ${slide.page} / ${EVENT_GUIDE_SLIDES[EVENT_GUIDE_SLIDES.length - 1].page}`;
  }
  if (eventGuidePrevBtn) eventGuidePrevBtn.disabled = eventGuideIndex === 0;
  if (eventGuideNextBtn) eventGuideNextBtn.disabled = eventGuideIndex === EVENT_GUIDE_SLIDES.length - 1;
  renderEventGuideThumbs();
}

function moveEventGuide(delta) {
  eventGuideIndex = Math.min(EVENT_GUIDE_SLIDES.length - 1, Math.max(0, eventGuideIndex + delta));
  renderEventGuideSlide();
}

function openEventGuideModal() {
  eventGuideIndex = 0;
  renderEventGuideSlide();
  if (eventGuideModal) eventGuideModal.hidden = false;
  document.body.classList.add("modal-open");
}

function closeEventGuideModal() {
  if (eventGuideModal) eventGuideModal.hidden = true;
  document.body.classList.remove("modal-open");
}

async function confirmEventGuideModal() {
  const user = await whenAuthReady();
  if (!user) {
    closeEventGuideModal();
    return;
  }
  try {
    await updateDoc(doc(db, "users", user.uid), {
      eventManualSeen: true,
      eventManualSeenAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    if (currentProfile) currentProfile.eventManualSeen = true;
    closeEventGuideModal();
  } catch (error) {
    console.error("event manual confirm error:", error);
    msg("❌ 매뉴얼 확인 저장에 실패했습니다.", true);
  }
}

async function loadUsers() {
  const qs = await getDocs(collection(db, "users"));
  allUsers = qs.docs.map((snap) => ({ uid: snap.id, ...snap.data() }))
    .sort((a, b) => String(a.name || a.email || "").localeCompare(String(b.name || b.email || ""), "ko"));
  renderAttendeeResults();
}

function getAttendeeRows() {
  const q = ($("eventAttendeeSearch")?.value || "").trim().toLowerCase();
  return allUsers.filter((user) => {
    if (selectedAttendeeMap.has(user.uid)) return false;
    if (!q) return true;
    const target = [user.name, user.email, user.dept, user.rank, user.empId].join(" ").toLowerCase();
    return target.includes(q);
  });
}

function renderAttendeeResults() {
  const panel = $("eventAttendeePanel");
  const list = $("eventAttendeeList");
  if (!panel || !list) return;
  const rows = getAttendeeRows();
  if (document.activeElement !== $("eventAttendeeSearch")) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;
  list.innerHTML = rows.length ? rows.map((user) => `
    <button class="member-search-item" type="button" data-pick-uid="${escapeHtml(user.uid)}">
      <div class="member-star is-favorite">+</div>
      <div class="member-main">
        <div class="member-name">${escapeHtml(user.name || user.email || "회원")}</div>
        <div class="member-sub">${escapeHtml(user.email || "")}${user.dept ? ` · ${escapeHtml(user.dept)}` : ""}${user.rank ? ` · ${escapeHtml(user.rank)}` : ""}</div>
      </div>
      <div class="member-role-badge">${escapeHtml(user.role || "member")}</div>
    </button>
  `).join("") : `<div class="member-search-item"><div class="member-main"><div class="member-name">검색 결과 없음</div></div></div>`;
}

function renderSelectedAttendees() {
  const box = $("selectedAttendees");
  if (!box) return;
  const rows = [...selectedAttendeeMap.values()];
  box.innerHTML = rows.length ? rows.map((user) => `
    <div class="selected-member-chip">
      <span>${escapeHtml(user.name || user.email || "회원")}</span>
      <button type="button" class="chip-remove-btn" data-remove-uid="${escapeHtml(user.uid)}">×</button>
    </div>
  `).join("") : `<div class="card-meta">선택된 참석자가 없습니다.</div>`;
}

function getSelectedAttendeesPayload() {
  return [...selectedAttendeeMap.values()].map((user) => ({
    uid: user.uid,
    name: user.name || "",
    email: user.email || "",
    dept: user.dept || "",
    rank: user.rank || "",
  }));
}

async function submitEvent() {
  msg("");
  const user = await whenAuthReady();
  if (!user) {
    alert("Log in 필요");
    location.href = "./login.html";
    return;
  }

  const uploadBtn = $("uploadEventBtn");
  if (uploadBtn) uploadBtn.disabled = true;

  try {
    const title = $("eventTitle")?.value.trim() || "";
    const eventDate = $("eventDate")?.value || "";
    const eventLocation = $("eventLocation")?.value.trim() || "";
    const description = $("eventDescription")?.value.trim() || "";
    const imageFiles = getFiles("eventImage");
    const attachmentFiles = getFiles("eventAttachment");

    if (!title) throw new Error("Event title을 입력해 주세요.");
    if (!eventDate) throw new Error("Date / Time을 입력해 주세요.");
    if (!description) throw new Error("Description을 입력해 주세요.");

    const profile = await getCurrentUserProfile(user.uid);
    const imageUploads = await uploadAttachments(imageFiles, `posts/event/${user.uid}/image`, title);
    const attachments = await uploadAttachments(attachmentFiles, `posts/event/${user.uid}/attachment`, title);
    const primaryImage = imageUploads[0] || { name: "", url: "", type: "", size: 0, downloadName: "" };

    const attendees = getSelectedAttendeesPayload();
    const postData = {
      type: "event",
      status: "event",
      title,
      body: description,
      description,
      eventDate,
      eventLocation,
      attendees,
      attendeeUids: attendees.map((row) => row.uid),
      imageName: primaryImage.name,
      imageSize: primaryImage.size,
      imageType: primaryImage.type,
      imageUrl: primaryImage.url,
      imageDownloadName: primaryImage.downloadName || "",
      images: imageUploads,
      attachmentName: attachments[0]?.name || "",
      attachmentSize: attachments[0]?.size || 0,
      attachmentType: attachments[0]?.type || "",
      attachmentUrl: attachments[0]?.url || "",
      attachmentDownloadName: attachments[0]?.downloadName || "",
      attachments,
      createdBy: user.uid,
      authorUid: user.uid,
      createdByEmail: user.email || profile.email || "",
      createdByName: profile.name || "",
      createdByRole: profile.role || "member",
      createdBySite: profile.site || "",
      createdByTier: profile.tier || "QFN",
      likedByUids: [],
      comments: [],
      likesCount: 0,
      commentsCount: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    await addDoc(collection(db, "posts"), postData);
    msg("✅ Event 업로드 완료");
    setTimeout(() => {
      location.href = "./index.html";
    }, 400);
  } catch (e) {
    console.error(e);
    msg(`❌ ${e.message || e.code || "업로드 실패"}`, true);
  } finally {
    if (uploadBtn) uploadBtn.disabled = false;
  }
}

async function initializeEventGuide() {
  const user = await whenAuthReady();
  if (!user) return;
  currentProfile = await getCurrentUserProfile(user.uid);
  if (shouldOpenEventGuideModal()) {
    openEventGuideModal();
  }
}

function bindEvents() {
  $("eventImage")?.addEventListener("change", () => renderFilePreview("eventImage", "eventImagePreview"));
  $("eventAttachment")?.addEventListener("change", () => renderFilePreview("eventAttachment", "eventAttachmentPreview"));
  $("eventAttendeeSearch")?.addEventListener("focus", renderAttendeeResults);
  $("eventAttendeeSearch")?.addEventListener("input", renderAttendeeResults);
  $("eventForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    submitEvent();
  });
  eventGuidePrevBtn?.addEventListener("click", () => moveEventGuide(-1));
  eventGuideNextBtn?.addEventListener("click", () => moveEventGuide(1));
  eventGuideConfirmBtn?.addEventListener("click", confirmEventGuideModal);
  eventGuideThumbs?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-event-guide-index]");
    if (!button) return;
    eventGuideIndex = Number(button.dataset.eventGuideIndex || 0);
    renderEventGuideSlide();
  });

  document.addEventListener("click", (event) => {
    const pick = event.target.closest("[data-pick-uid]");
    if (pick) {
      const user = allUsers.find((row) => row.uid === pick.dataset.pickUid);
      if (user) {
        selectedAttendeeMap.set(user.uid, user);
        renderSelectedAttendees();
        renderAttendeeResults();
        $("eventAttendeeSearch").value = "";
        $("eventAttendeeSearch").focus();
      }
      return;
    }

    const removeBtn = event.target.closest("[data-remove-uid]");
    if (removeBtn) {
      selectedAttendeeMap.delete(removeBtn.dataset.removeUid);
      renderSelectedAttendees();
      renderAttendeeResults();
      return;
    }

    if (!event.target.closest(".attendee-picker")) {
      $("eventAttendeePanel").hidden = true;
    }
  });

  document.addEventListener("keydown", (event) => {
    if (eventGuideModal?.hidden) return;
    if (event.key === "ArrowLeft") moveEventGuide(-1);
    if (event.key === "ArrowRight") moveEventGuide(1);
  });
}

bindEvents();
renderSelectedAttendees();
loadUsers().catch((e) => console.error("event user load error:", e));
initializeEventGuide().catch((error) => console.error("event guide init error:", error));
