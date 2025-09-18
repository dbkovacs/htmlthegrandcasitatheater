// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBpSWNq4G0ldr9BwiSk3KEeEp4L0KG6xEs",
  authDomain: "htmlthegrandcasitatheater.firebaseapp.com",
  projectId: "htmlthegrandcasitatheater",
  storageBucket: "htmlthegrandcasitatheater.firebasestorage.app",
  messagingSenderId: "570036902853",
  appId: "1:570036902853:web:5b0d244a1fe3b63f2c09ac",
  measurementId: "G-7KP0BL67YF"
};

// Initialize Firebase (ONLY ONCE)
const app = initializeApp(firebaseConfig);

// Initialize and export Firebase services
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);