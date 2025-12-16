// public/js/auth.js
import { auth, googleProvider } from "./firebase.js";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  setPersistence,
  browserLocalPersistence,
  signInWithPopup,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

const $ = (q) => document.querySelector(q);

function setLoading(isLoading) {
  const btn = $("#btnLogin");
  if (!btn) return;
  btn.disabled = isLoading;
  btn.dataset.loading = isLoading ? "1" : "0";
  btn.textContent = isLoading ? "Ingresando..." : "Iniciar sesión";
}

function showMsg(text, type = "info") {
  const box = $("#msg");
  if (!box) return;
  box.textContent = text;
  box.className = `msg ${type}`;
  box.hidden = false;
}

async function login(email, password) {
  setLoading(true);
  if ($("#msg")) $("#msg").hidden = true;

  try {
    await setPersistence(auth, browserLocalPersistence);
    await signInWithEmailAndPassword(auth, email, password);
    window.location.href = "/app.html";
  } catch (e) {
    const code = e?.code || "";
    if (code.includes("auth/invalid-credential")) showMsg("Credenciales inválidas.", "error");
    else if (code.includes("auth/too-many-requests")) showMsg("Demasiados intentos. Intenta más tarde.", "error");
    else showMsg(`Error al iniciar sesión: ${code || "desconocido"}`, "error");
    console.error(e);
  } finally {
    setLoading(false);
  }
}

async function register(email, password) {
  if ($("#msg")) $("#msg").hidden = true;

  try {
    await createUserWithEmailAndPassword(auth, email, password);
    showMsg("Cuenta creada. Ya puedes iniciar sesión.", "success");
  } catch (e) {
    const code = e?.code || "";
    if (code.includes("auth/email-already-in-use")) showMsg("Ese correo ya está registrado.", "error");
    else if (code.includes("auth/weak-password")) showMsg("Contraseña muy débil (mínimo 6).", "error");
    else showMsg(`No se pudo crear la cuenta: ${code || "desconocido"}`, "error");
    console.error(e);
  }
}

async function loginWithGoogle() {
  if ($("#msg")) $("#msg").hidden = true;

  try {
    await setPersistence(auth, browserLocalPersistence);
    await signInWithPopup(auth, googleProvider);
    window.location.href = "/app.html";
  } catch (e) {
    const code = e?.code || "";
    showMsg(`No se pudo iniciar sesión con Google: ${code || "desconocido"}`, "error");
    console.error(e);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  // Email/Password
  const form = $("#loginForm");
  if (form) {
    form.addEventListener("submit", (ev) => {
      ev.preventDefault();
      const email = $("#email")?.value.trim();
      const pass = $("#password")?.value;
      if (!email || !pass) return showMsg("Completa email y contraseña.", "info");
      login(email, pass);
    });
  }

  // Crear cuenta
  const btnCreate = $("#btnDemoCreate");
  if (btnCreate) {
    btnCreate.addEventListener("click", async () => {
      const email = $("#email")?.value.trim();
      const pass = $("#password")?.value;
      if (!email || !pass) return showMsg("Escribe email y contraseña para crear la cuenta.", "info");
      await register(email, pass);
    });
  }

  // Google
  const btnGoogle = $("#btnGoogle");
  if (btnGoogle) {
    btnGoogle.addEventListener("click", loginWithGoogle);
  } else {
    console.warn("No se encontró #btnGoogle en el HTML");
  }
});
