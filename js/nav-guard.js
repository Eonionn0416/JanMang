// js/nav-guard.js
import { getUser, whenAuthReady } from "./auth-state.js";

const req = document.getElementById("navRequest");
const evt = document.getElementById("navEvent");

if (req) req.addEventListener("click", (e) => guard(e, "./request.html"));
if (evt) evt.addEventListener("click", (e) => guard(e, "./event.html"));

async function guard(e, targetUrl) {
  e.preventDefault();

  // 캐시가 확정 전이면 확정까지 짧게 대기 (팝업 깜빡임/오판 방지)
  let user = getUser();
  if (user === undefined) user = await whenAuthReady();

  if (!user) {
    alert("Log in 필요");
    location.href = "./login.html";
    return;
  }
  location.href = targetUrl;
}