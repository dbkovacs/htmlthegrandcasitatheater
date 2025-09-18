import { auth } from './firebase-config.js';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const loginContainer = document.getElementById('login-container');
const dashboard = document.getElementById('dashboard');
const loginForm = document.getElementById('login-form');
const logoutButton = document.getElementById('logout-button');

// --- Main Authentication Logic ---

// This function is a listener that runs whenever the user's login state changes.
onAuthStateChanged(auth, user => {
    if (user) {
        // User is signed in.
        console.log("User is logged in:", user.email);
        loginContainer.style.display = 'none';
        dashboard.style.display = 'block';
    } else {
        // User is signed out.
        console.log("User is logged out.");
        loginContainer.style.display = 'block';
        dashboard.style.display = 'none';
    }
});

// --- Event Listeners ---

// Handle login form submission
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        console.log("Login successful!", userCredential.user);
        // The onAuthStateChanged listener above will handle showing the dashboard.
    } catch (error) {
        console.error("Error signing in:", error);
        alert("Login failed: " + error.message);
    }
});

// Handle logout button click
logoutButton.addEventListener('click', () => {
    signOut(auth).catch((error) => {
        console.error("Error signing out:", error);
    });
});