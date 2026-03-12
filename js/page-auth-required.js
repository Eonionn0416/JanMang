// js/page-auth-required.js
import { whenAuthReady } from "./auth-state.js";

(async () => {
  const user = await whenAuthReady();
  if (!user) {
    alert("Log in 필요");
    location.href = "./login.html";
  }
})();