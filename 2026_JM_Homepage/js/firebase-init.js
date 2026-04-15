// js/firebase-init.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyDGlOdGnOvoAuiNHJBxbhLyZb5f1rKT-1k",
  authDomain: "janmang-a5aa9.firebaseapp.com",
  projectId: "janmang-a5aa9",
  storageBucket: "janmang-a5aa9.firebasestorage.app",
  messagingSenderId: "699034804163",
  appId: "1:699034804163:web:7421cb44db5fc0eee86776",
  measurementId: "G-N2BZ26JB0G"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
