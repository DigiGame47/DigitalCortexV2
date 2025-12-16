// public/js/guard.js
import { auth } from "./firebase.js";
import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

const $ = (q) => document.querySelector(q);

export function requireAuth() {
  onAuthStateChanged(auth, (user) => {
    if (!user) window.location.href = "/login.html";
    else {
      const name = user.email || "Usuario";
      const el = $("#userEmail");
      if (el) el.textContent = name;
    }
  });
}

export function wireLogout() {
  const btn = $("#btnLogout");
  if (!btn) return;
  btn.addEventListener("click", async () => {
    await signOut(auth);
    window.location.href = "/login.html";
  });
}


