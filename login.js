// /login.js
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
        // CORRECTED: Fixed the arrow function syntax here
        googleLoginButton.addEventListener('click', () => {
            googleLoginButton.disabled = true;
            googleLoginButton.textContent = 'Signing In...';
            loginError.textContent = '';

            const provider = new GoogleAuthProvider();

            signInWithPopup(auth, provider)
                .then((result) => {
                    // This will trigger the onAuthStateChanged in admin.js
                    // which will then verify if the user is an admin.
                    // Redirect regardless, the admin pages handle unauthorized users.
                    window.location.href = 'admin.html';
                })
                .catch((error) => {
                    console.error("Login Error:", error);
                    loginError.textContent = 'Sign-in failed. Please try again.';

                    // Handle specific errors
                    if (error.code === 'auth/popup-closed-by-user') {
                        loginError.textContent = 'Sign-in cancelled.';
                    } else if (error.code === 'auth/cancelled-popup-request') {
                         loginError.textContent = 'Sign-in cancelled.';
                    } else if (error.code === 'auth/popup-blocked') {
                         loginError.textContent = 'Popup blocked. Please enable popups for this site.';
                    }


                    googleLoginButton.disabled = false;
                    // Restore original button text with icon
                    googleLoginButton.innerHTML = `
                        <svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
                            <path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"/>
                            <path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"/>
                            <path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.222,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z"/>
                            <path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571l6.19,5.238C39.712,34.464,44,28.738,44,20C44,22.659,43.862,21.35,43.611,20.083z"/>
                        </svg>
                        Sign In with Google`;
                });
        });
    }
});
// /login.js
