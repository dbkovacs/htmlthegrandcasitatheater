import { auth } from './firebase-config.js';
import { signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const loginButton = document.getElementById('login-button');
    const loginError = document.getElementById('login-error');

    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            
            loginButton.disabled = true;
            loginButton.textContent = 'Signing In...';
            loginError.textContent = '';

            signInWithEmailAndPassword(auth, email, password)
                .then((userCredential) => {
                    // Sign-in successful, redirect to the main admin page.
                    window.location.href = 'admin.html';
                })
                .catch((error) => {
                    console.error("Login Error:", error);
                    loginError.textContent = 'Invalid email or password.';
                    loginButton.disabled = false;
                    loginButton.textContent = 'Sign In';
                });
        });
    }
});
