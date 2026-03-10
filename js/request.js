import { db, storage } from "./firebase-init.js";
import { whenAuthReady } from "./auth-state.js";
import {
  collection,
  addDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";
import {
  ref,
  uploadBytes,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-storage.js";

function $(id) { return document.getElementById(id); }

function msg(text, isError = false) {
  const el = $("requestMsg");
  if (!el) return;
  el.textContent = text || "";
  el.style.color = isError ? "crimson" : "";
}

function getCheckedValues(name) {
  return Array.from(document.querySelectorAll(`input[name="${name}"]:checked`)).map((el) => el.value);
}

function safeName(name = "file") {
  return String(name).replace(/[^a-zA-Z0-9._-]/g, "_");
}

function safeStem(name = "file") {
  return safeName(name).replace(/\.[^.]+$/, "") || "file";
}

function uniq(values = []) { return [...new Set(values.filter(Boolean))]; }

function getFiles(inputId) {
  return Array.from($(inputId)?.files || []);
}

function renderFilePreview(inputId, previewId) {
  const files = getFiles(inputId);
  const box = $(previewId);
  if (!box) return;
  box.innerHTML = files.map((file) => `<span class="attachment-chip">${safeName(file.name)}</span>`).join("");
}

function renderImagePreview(inputId, previewId) {
  const box = $(previewId);
  const file = getFiles(inputId)[0];
  if (!box) return;
  if (!file) {
    box.classList.add("empty");
    box.innerHTML = "No image selected";
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    box.classList.remove("empty");
    box.innerHTML = `<img src="${reader.result}" alt="preview">`;
  };
  reader.readAsDataURL(file);
}

function formatDateParts(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return { ymd: `${y}${m}${d}`, hm: `${hh}_${mm}`, hms: `${hh}_${mm}_${ss}` };
}

function buildDownloadName(programName, originalName, date = new Date()) {
  const { ymd, hm } = formatDateParts(date);
  const ext = /\.[^.]+$/.exec(originalName || "")?.[0] || "";
  const base = safeStem(programName || "Program");
  return `${ymd}_${base}_${hm}${ext}`;
}

async function uploadAttachments(files, folder, programName) {
  if (!files.length) return [];
  const uploaded = [];
  for (let i = 0; i < files.length; i += 1) {
    const file = files[i];
    const now = new Date();
    const downloadName = buildDownloadName(programName, file.name, now);
    const fileRef = ref(storage, `${folder}/${Date.now()}_${i + 1}_${safeName(file.name)}`);
    await uploadBytes(fileRef, file, {
      contentType: file.type || "application/octet-stream",
      contentDisposition: `attachment; filename="${downloadName}"; filename*=UTF-8''${encodeURIComponent(downloadName)}`,
      customMetadata: {
        originalName: file.name || "file",
        downloadName,
      },
    });
    const url = await getDownloadURL(fileRef);
    uploaded.push({
      name: file.name,
      url,
      type: file.type || "",
      size: file.size || 0,
      downloadName,
      uploadedAtText: `${formatDateParts(now).ymd}_${formatDateParts(now).hm}`,
    });
  }
  return uploaded;
}

async function getCurrentUserProfile(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) {
    return { name: "", email: "", role: "member", site: "", tier: "QFN" };
  }
  const u = snap.data();
  return {
    name: u.name || "",
    email: u.email || "",
    role: u.role || "member",
    site: u.site || "",
    tier: u.tier || "QFN",
  };
}

async function createNotification(toUid, postId, title, body, postType = "request") {
  if (!toUid) return;
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

async function getUsersByRoles(roles = []) {
  const qs = await getDocs(collection(db, "users"));
  return qs.docs
    .map((snap) => ({ uid: snap.id, ...snap.data() }))
    .filter((user) => roles.includes(user.role || "member"));
}

async function notifyUsers(uids, postId, title, body) {
  for (const uid of uniq(uids)) {
    await createNotification(uid, postId, title, body, "request");
  }
}

async function submitRequest() {
  msg("");

  const user = await whenAuthReady();
  if (!user) {
    alert("Log in 필요");
    location.href = "./login.html";
    return;
  }

  const uploadBtn = $("uploadRequestBtn");
  if (uploadBtn) uploadBtn.disabled = true;

  try {
    const programName = $("programName")?.value.trim() || "";
    const description = $("description")?.value.trim() || "";
    const specificRequest = $("specificRequest")?.value.trim() || "";
    const inputForms = getCheckedValues("inputForms");
    const outputForms = getCheckedValues("outputForms");
    const attachmentFiles = getFiles("requestAttachment");
    const imageFile = getFiles("requestImage")[0] || null;

    if (!programName) throw new Error("Program name을 입력해 주세요.");
    if (inputForms.length === 0) throw new Error("Input file form을 1개 이상 선택해 주세요.");
    if (outputForms.length === 0) throw new Error("Output file form을 1개 이상 선택해 주세요.");
    if (!description) throw new Error("Description을 입력해 주세요.");
    if (!specificRequest) throw new Error("Specific request를 입력해 주세요.");

    const profile = await getCurrentUserProfile(user.uid);
    const attachments = await uploadAttachments(attachmentFiles, `posts/request/${user.uid}/attachments`, programName);
    const imageUploads = imageFile ? await uploadAttachments([imageFile], `posts/request/${user.uid}/images`, programName) : [];
    const primary = attachments[0] || { name: "", url: "", type: "", size: 0, downloadName: "" };
    const imagePrimary = imageUploads[0] || { url: "" };

    const postData = {
      type: "request",
      status: "request",
      statusLabel: "Request",
      programName,
      title: programName,
      description,
      body: description,
      specificRequest,
      inputForms,
      outputForms,
      requestAttachmentName: primary.name,
      requestAttachmentUrl: primary.url,
      requestAttachmentType: primary.type,
      requestAttachmentSize: primary.size,
      requestAttachmentDownloadName: primary.downloadName || "",
      requestAttachments: attachments,
      imageUrl: imagePrimary.url || "",
      createdBy: user.uid,
      createdByEmail: user.email || profile.email || "",
      createdByName: profile.name || "",
      createdByRole: profile.role || "member",
      createdBySite: profile.site || "",
      createdByTier: profile.tier || "QFN",
      assignedDeveloperUids: [],
      assignedDeveloperNames: [],
      likedByUids: [],
      comments: [],
      likesCount: 0,
      commentsCount: 0,
      presentationLocked: false,
      finalizedAt: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const refDoc = await addDoc(collection(db, "posts"), postData);

    if ((profile.role || "member") === "member") {
      const devAndAdmins = await getUsersByRoles(["developer", "admin"]);
      await notifyUsers(
        devAndAdmins.map((item) => item.uid),
        refDoc.id,
        "새 Request 등록",
        `${profile.name || user.email || "일반 회원"}님이 새 Request를 등록했습니다.`
      );
    }

    msg("✅ Request 업로드 완료");
    setTimeout(() => {
      location.href = `./index.html?created=${encodeURIComponent(refDoc.id)}`;
    }, 400);
  } catch (e) {
    console.error(e);
    msg(`❌ ${e.message || e.code || "업로드 실패"}`, true);
  } finally {
    if (uploadBtn) uploadBtn.disabled = false;
  }
}

function bindEvents() {
  $("requestAttachment")?.addEventListener("change", () => renderFilePreview("requestAttachment", "requestAttachmentPreview"));
  $("requestImage")?.addEventListener("change", () => renderImagePreview("requestImage", "requestImagePreview"));
  $("requestForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    submitRequest();
  });
}

bindEvents();
