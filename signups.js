/*
    Folder: /
    File: signups.js
    Extension: .js
*/

import { db } from './firebase-config.js';
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// --- DOM Element References ---
const tempSlider = document.getElementById('temperature');
const tempValue = document.getElementById('tempValue');
const form = document.getElementById('signupForm');
const submitButton = document.getElementById('submitButton');
const responseMessage = document.getElementById('responseMessage');

// --- Script to handle temperature slider value display ---
if (tempSlider && tempValue) {
    tempSlider.addEventListener('input', (event) => {
        tempValue.innerHTML = `${event.target.value}&deg;F`;
    });
}

// --- Script to handle form submission to Firestore ---
if (form) {
    form.addEventListener('submit', async function(e) {
        e.preventDefault(); // Prevent the default form submission
        
        // Show loading state
        submitButton.disabled = true;
        submitButton.textContent = 'Submitting...';
        responseMessage.textContent = '';
        responseMessage.classList.remove('text-green-400', 'text-red-400');

        try {
            // 1. Collect the form data into an object matching our Firestore schema.
            const signupData = {
                hostName: document.getElementById('name').value,
                movieTitle: document.getElementById('movie').value,
                audience: document.querySelector('input[name="audience"]:checked').value,
                thermostat: parseInt(document.getElementById('temperature').value, 10),
                greeting: document.getElementById('greeting').value,
                status: "pending", // Automatically set the status to pending
                submittedAt: serverTimestamp() // Add a server-side timestamp
            };

            // 2. Add a new document to the "movies" collection in Firestore.
            const docRef = await addDoc(collection(db, "movies"), signupData);
            console.log("Document written with ID: ", docRef.id);

            // 3. Show success message and reset the form.
            responseMessage.textContent = 'Success! Your movie night has been submitted for approval.';
            responseMessage.classList.add('text-green-400');
            form.reset(); 
            if (tempValue) {
                tempValue.innerHTML = '70&deg;F'; // Reset slider display
            }

        } catch (error) {
            console.error('Error adding document: ', error);
            responseMessage.textContent = 'Oops! Something went wrong. Please try again.';
            responseMessage.classList.add('text-red-400');
        } finally {
            // Restore button state
            submitButton.disabled = false;
            submitButton.textContent = 'Submit Movie Night';
        }
    });
}

// Add build timestamp to the footer comment in the HTML
document.addEventListener('DOMContentLoaded', () => {
    const timestampComment = document.createComment(`Build Timestamp: ${new Date().toLocaleString()}`);
    document.body.appendChild(timestampComment);
});