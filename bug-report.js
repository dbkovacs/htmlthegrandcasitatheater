/*
    Folder: /
    File: bug-report.js
    Extension: .js
*/
import { VONNEGUT_JOKES } from './jokes.js';

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('bug-report-form');
    const responseContainer = document.getElementById('response-container');
    const responseJoke = document.getElementById('response-joke');

    if (form) {
        form.addEventListener('submit', (e) => {
            // 1. Prevent the form from actually submitting
            e.preventDefault();

            // 2. Select a random joke
            const randomIndex = Math.floor(Math.random() * VONNEGUT_JOKES.length);
            const joke = VONNEGUT_JOKES[randomIndex];

            // 3. Display the joke
            responseJoke.textContent = joke;

            // 4. Hide the form and show the response container
            form.classList.add('hidden');
            responseContainer.classList.remove('hidden');
        });
    }
});