import { auth } from './firebase-config.js';
import { GoogleAuthProvider, signInWithPopup } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

document.addEventListener('DOMContentLoaded', () => {
    const googleLoginButton = document.getElementById('google-login-button');
    const loginError = document.getElementById('login-error');

    // Check for auth error query parameter
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('error') === 'auth') {
        loginError.textContent = 'Your account is not authorized for admin access.';
    }

    if (googleLoginButton) {
        googleLoginButton.addEventListener('click', ()_=> {
            googleLoginButton.disabled = true;
            googleLoginButton.textContent = 'Signing In...';
            loginError.textContent = '';

            const provider = new GoogleAuthProvider();

            signInWithPopup(auth, provider)
                .then((result) => {
                    // This will trigger the onAuthStateChanged in admin.js
                    // which will then verify if the user is an admin.
                    window.location.href = 'admin.html';
                })
                .catch((error) => {
                    console.error("Login Error:", error);
                    loginError.textContent = 'Sign-in failed. Please try again.';
                    
                    // Handle specific errors
                    if (error.code === 'auth/popup-closed-by-user') {
                        loginError.textContent = 'Sign-in cancelled.';
                    }

                    googleLoginButton.disabled = false;
                    googleLoginButton.textContent = 'Sign In with Google';
                });
        });
    }
});
