/*
    Folder: /
    File: signups.js
    Extension: .js
*/

import { db } from './firebase-config.js';
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// --- DOM Element References ---
const form = document.getElementById('signupForm');
const submitButton = document.getElementById('submitButton');
const responseMessage = document.getElementById('responseMessage');
const timestampContainer = document.getElementById('build-timestamp');
const tempValueDisplay = document.getElementById('tempValue');
const thermostatContainer = document.getElementById('thermostat-container');
const thermostatThumb = document.getElementById('thermostat-thumb');
const temperatureInput = document.getElementById('temperature');

// --- Custom Thermostat Logic ---
const minTemp = 70;
const maxTemp = 80;
let isDragging = false;

function updateThermostat(yPosition) {
    const bounds = thermostatContainer.getBoundingClientRect();
    const percentage = 1 - Math.max(0, Math.min(1, (yPosition - bounds.top) / bounds.height));
    const temp = Math.round(percentage * (maxTemp - minTemp) + minTemp);
    
    // Update the visuals
    const visualPercent = (temp - minTemp) / (maxTemp - minTemp) * 100;
    thermostatThumb.style.bottom = `calc(${visualPercent}% - 16px)`; // Center thumb
    tempValueDisplay.innerHTML = `${temp}&deg;F`;
    
    // Update the hidden input for form submission
    temperatureInput.value = temp;
}

thermostatContainer.addEventListener('mousedown', (e) => {
    isDragging = true;
    updateThermostat(e.clientY);
});
thermostatContainer.addEventListener('touchstart', (e) => {
    e.preventDefault(); // Prevents page scroll on touch
    isDragging = true;
    updateThermostat(e.touches[0].clientY);
});
window.addEventListener('mousemove', (e) => {
    if (isDragging) {
        updateThermostat(e.clientY);
    }
});
window.addEventListener('touchmove', (e) => {
    if (isDragging) {
        e.preventDefault(); // Prevents page scroll on touch
        updateThermostat(e.touches[0].clientY);
    }
});
window.addEventListener('mouseup', () => {
    isDragging = false;
});
window.addEventListener('touchend', () => {
    isDragging = false;
});


// --- Form Submission Logic ---
if (form) {
    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        submitButton.disabled = true;
        submitButton.textContent = 'Submitting...';
        responseMessage.textContent = '';
        responseMessage.classList.remove('text-green-400', 'text-red-400');

        try {
            const signupData = {
                hostName: document.getElementById('name').value,
                movieTitle: document.getElementById('movie').value,
                noteToDavid: document.getElementById('noteToDavid').value,
                greeting: document.getElementById('greeting').value,
                thermostat: parseInt(temperatureInput.value, 10),
                status: "pending",
                submittedAt: serverTimestamp()
            };

            await addDoc(collection(db, "movies"), signupData);

            responseMessage.textContent = 'Success! Your movie has been submitted for approval.';
            responseMessage.classList.add('text-green-400');
            form.reset();
            
            // Reset thermostat to default 75F
            const defaultPercent = (75 - minTemp) / (maxTemp - minTemp);
            const bounds = thermostatContainer.getBoundingClientRect();
            const defaultY = bounds.top + (1 - defaultPercent) * bounds.height;
            updateThermostat(defaultY);
            
        } catch (error) {
            console.error('Error adding document: ', error);
            responseMessage.textContent = 'Oops! Something went wrong. Please try again.';
            responseMessage.classList.add('text-red-400');
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = 'Submit Movie Request';
        }
    });
}

// --- Page Load Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    // Set initial thermostat position to default 75F
    const initialTemp = 75;
    const initialPercent = (initialTemp - minTemp) / (maxTemp - minTemp);
    const bounds = thermostatContainer.getBoundingClientRect();
    const initialY = bounds.top + (1 - initialPercent) * bounds.height;
    updateThermostat(initialY);

    // Set visible build timestamp
    if (timestampContainer) {
        timestampContainer.textContent = `Page loaded: ${new Date().toLocaleString()}`;
    }
});

/*
    File: signups.js
    Build Timestamp: 2025-09-18T15:50:00-06:00
*/