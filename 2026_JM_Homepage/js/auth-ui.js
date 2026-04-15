// js/auth-ui.js
import { whenAuthReady } from "./auth-state.js";

const btn = document.getElementById("dynamicAuthBtn");
if (!btn) { /* noop */ } else {
  // ✅ 확정되기 전엔 숨김(깜빡임 방지)
  btn.classList.add("auth-pending");

  const page = location.pathname.toLowerCase().split("/").pop();

  function setBtn(text, href) {
    btn.textContent = text;
    btn.setAttribute("href", href);
  }

  (async () => {
    const user = await whenAuthReady(); // ✅ 단일 창구에서 확정까지 대기

    if (page === "login.html" || page === "signup.html") {
      setBtn("Back to reel", "./index.html");
    } else if (page === "profile.html" || page === "request.html" || page === "event.html") {
      // 네 요구사항: profile/request/event에서 상단은 back to reel
      setBtn("Back to reel", "./index.html");
    } else {
      // index
      if (!user) setBtn("회원가입 / Log in", "./login.html");
      else setBtn("My Profile", "./profile.html");
    }

    // ✅ 세팅 끝나고 표시
    btn.classList.remove("auth-pending");
  })();
}