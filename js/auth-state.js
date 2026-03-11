// js/auth-state.js
import { auth } from "./firebase-init.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";

// auth 상태를 메모리에 캐시
let cachedUser = undefined; // undefined = 아직 모름, null = 비로그인, object = 로그인
let readyResolve;
const ready = new Promise((res) => (readyResolve = res));

const listeners = new Set();

// 앱 전체에서 단 1번만 구독
onAuthStateChanged(auth, (user) => {
  cachedUser = user || null;
  if (readyResolve) {
    readyResolve(cachedUser);
    readyResolve = null;
  }
  listeners.forEach((fn) => fn(cachedUser));
});

export function getUser() {
  // 즉시값 (undefined일 수 있음)
  return cachedUser;
}

export function whenAuthReady() {
  // 최초 1회 “상태 확정”을 기다림
  return ready;
}

export function onUserChange(fn) {
  listeners.add(fn);
  // 이미 확정됐으면 즉시 1회 호출
  if (cachedUser !== undefined) fn(cachedUser);
  return () => listeners.delete(fn);
}