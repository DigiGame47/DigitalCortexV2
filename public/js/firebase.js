// 1️⃣ Importamos funciones necesarias desde Firebase (CDN oficial)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js";


// 2️⃣ Configuración del proyecto Firebase
// ⚠️ ESTOS DATOS LOS DA FIREBASE CONSOLE
const firebaseConfig = {
  apiKey: "AIzaSyAmIU2nZbql0pJLxeRfu0bIAzGqzT20cbM",
  authDomain: "digitalcortex.firebaseapp.com",
  projectId: "digitalcortex",
  storageBucket: "digitalcortex.firebasestorage.app",
  messagingSenderId: "72517856030",
  appId: "1:72517856030:web:eb33af90645c56efdff70f",
  measurementId: "G-HRMBNQN7BD"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export const db = getFirestore(app);
export const storage = getStorage(app);