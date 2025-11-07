/* /santa-signup.js */
import { db, auth } from './firebase-config.js';
import { 
    collection, 
    doc, 
    setDoc, 
    onSnapshot, 
    serverTimestamp, 
    query // Keep query
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { 
    signInAnonymously, 
    onAuthStateChanged,
    signOut 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// --- CONFIGURATION ---
// Set the date of the party
// IMPORTANT: Use YYYY-MM-DD format.
const PARTY_DATE_YYYY_MM_DD = "2025-12-14"; 

// Set the start and end times for the party (24-hour format)
// Example: 9:00 AM = 9, 5:00 PM = 17
const PARTY_START_HOUR = 17; // 5:00 PM
const PARTY_END_HOUR = 19; // 7:00 PM (slots will run *until* 7:00 PM)

// Set the duration of each time slot in minutes
const SLOT_DURATION_MINUTES = 15;
// --- END CONFIGURATION ---

// --- DOM References ---
const timestampContainer = document.getElementById('build-timestamp');
const timeSlotContainer = document.getElementById('time-slot-container');
const timeSlotFieldset = document.getElementById('time-slot-fieldset');
const photoDetailsFieldset = document.getElementById('photo-details-fieldset');
const selectedTimeDisplay = document.getElementById('selected-time-display');
const backToSlotsButton = document.getElementById('back-to-slots-button');
const santaSignupForm = document.getElementById('santaSignupForm');
const submitButton = document.getElementById('submitButton');
const formErrorMessage = document.getElementById('form-error-message');
const successMessageContainer = document.getElementById('success-message-container');
const bookedSlotDisplay = document.getElementById('booked-slot-display');

// --- State ---
let selectedSlotInfo = null; // { iso: "...", label: "..." }
let unsubscribeSlots = null; // This will now be a function that unsubscribes from *all* doc listeners
let allSlots = [];

// --- Auth ---
// This function forces a fresh sign-in to ensure auth is valid
async function initializePage() {
    try {
        console.log("Forcing fresh anonymous sign-in...");
        // 1. Sign out any existing user to clear stale/bad credentials
        await signOut(auth); 
        console.log("Signed out previous user.");

        // 2. Sign in with a new, guaranteed-fresh anonymous user
        const userCredential = await signInAnonymously(auth);
        console.log('Fresh user signed in:', userCredential.user.uid);
        
        // 3. NOW that we are 100% sure we have a valid user, set up the listener.
        setupSlotListener();

    } catch (error) {
        console.error("Critical auth error:", error);
        if (timeSlotContainer) {
            timeSlotContainer.innerHTML = '<p class="text-red-400 col-span-full text-center">Error connecting to service. Please refresh.</p>';
        }
    }
}


// --- Time Slot Generation & Rendering ---
function generateAllSlots() {
    allSlots = [];
    const partyDate = new Date(`${PARTY_DATE_YYYY_MM_DD}T00:00:00`);
    let currentSlotTime = new Date(partyDate.getTime());
    currentSlotTime.setHours(PARTY_START_HOUR, 0, 0, 0);

    const endSlotTime = new Date(partyDate.getTime());
    endSlotTime.setHours(PARTY_END_HOUR, 0, 0, 0);

    while (currentSlotTime < endSlotTime) {
        const slotStart = new Date(currentSlotTime.getTime());
        const slotEnd = new Date(slotStart.getTime() + SLOT_DURATION_MINUTES * 60000);
        
        allSlots.push({
            iso: slotStart.toISOString(),
            label: `${formatTime(slotStart)} - ${formatTime(slotEnd)}`
        });
        
        currentSlotTime.setTime(slotEnd.getTime());
    }
}

function formatTime(date) {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

// === *** FIX REVERTED *** ===
// This function is now reverted to the *original* logic
// to query the entire collection at once.
// This relies on the `allow list: if request.auth != null;` rule.
function setupSlotListener() {
    // Generate the master list of slots first
    generateAllSlots();

    // We listen to the *entire* collection.
    // This query is allowed by your rule: "allow list: if request.auth != null;"
    const q = query(collection(db, "santaSignups"));
    
    if (unsubscribeSlots) unsubscribeSlots(); // Stop previous listener if any
    
    unsubscribeSlots = onSnapshot(q, (snapshot) => {
        // CLIENT-SIDE FILTERING:
        // Filter the docs to only include those for the current party date
        const takenSlotISOs = snapshot.docs
            .filter(doc => doc.data().partyDate === PARTY_DATE_YYYY_MM_DD)
            .map(doc => doc.id); // Doc ID is the ISO string
            
        console.log("Taken slots:", takenSlotISOs);
        renderTimeSlots(takenSlotISOs);
    }, (error) => {
        // --- ENHANCED ERROR LOGGING ---
        console.error("Full Firebase Error (santa-signup.js):", error); // Log the full error
        let errorMsg = "Error loading time slots. Please refresh the page.";
        
        if (error.code === 'missing-or-insufficient-permissions' || error.code === 'permission-denied') {
            errorMsg = "A configuration error occurred. Please contact the administrator. (Error: Permissions)";
        } else if (error.code === 'failed-precondition' && error.message.includes('index')) {
             errorMsg = "A database index is required. Please contact the administrator.";
        }
        
        if (timeSlotContainer) {
            timeSlotContainer.innerHTML = `<p class="text-red-400 col-span-full text-center">${errorMsg}</p>`;
        }
        // --- END ENHANCED LOGGING ---
    });
}

// === MODIFIED to accept an Array ===
function renderTimeSlots(takenSlotISOs) { // Now accepts an Array
    if (!timeSlotContainer) return;
    timeSlotContainer.innerHTML = ''; // Clear existing

    if (allSlots.length === 0) {
        timeSlotContainer.innerHTML = '<p class="text-gray-400 col-span-full text-center">No time slots have been configured.</p>';
        return;
    }

    // Add the dummy 'init' document to the taken list so it doesn't appear
    const allTakenSlots = [...takenSlotISOs]; // Copy the array
    if (!allTakenSlots.includes('init')) {
        allTakenSlots.push('init'); // Add 'init' doc to the array
    }

    allSlots.forEach(slot => {
        // === MODIFICATION: Use .includes() for Array lookup ===
        const isTaken = allTakenSlots.includes(slot.iso); 
        // === END MODIFICATION ===
        
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = slot.label;
        button.dataset.iso = slot.iso;
        button.dataset.label = slot.label;
        
        if (isTaken) {
            button.className = 'time-slot-btn taken';
            button.disabled = true;
        } else {
            button.className = 'time-slot-btn available';
            button.addEventListener('click', handleSlotClick);
        }
        
        timeSlotContainer.appendChild(button);
    });
}
// === *** END OF REVERT *** ===


// --- UI Interaction ---
function handleSlotClick(e) {
    const target = e.currentTarget;
    selectedSlotInfo = {
        iso: target.dataset.iso,
        label: target.dataset.label
    };
    
    // Show selected time
    selectedTimeDisplay.textContent = selectedSlotInfo.label;

    // Show/Hide fieldsets
    timeSlotFieldset.classList.add('hidden');
    photoDetailsFieldset.classList.remove('hidden');
    
    // Focus the first input of the new section
    document.getElementById('submitter-name').focus();
}

backToSlotsButton.addEventListener('click', () => {
    selectedSlotInfo = null;
    timeSlotFieldset.classList.remove('hidden');
    photoDetailsFieldset.classList.add('hidden');
});

// --- Form Submission ---
santaSignupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!selectedSlotInfo) {
        formErrorMessage.textContent = "An error occurred. Please go back and re-select your time.";
        return;
    }

    const submitterName = document.getElementById('submitter-name').value.trim();
    const familyMembers = document.getElementById('family-members').value.trim();

    if (!submitterName || !familyMembers) {
        formErrorMessage.textContent = "Please fill out your name and the family members attending.";
        return;
    }

    formErrorMessage.textContent = "";
    submitButton.disabled = true;
    submitButton.textContent = "Booking...";

    // === MODIFIED: Collect photo combinations as objects ===
    const photoComboRows = document.querySelectorAll('.photo-combo-row');
    const photoCombinations = [];
    photoComboRows.forEach(row => {
        const textInput = row.querySelector('input[type="text"]');
        const santaCheckbox = row.querySelector('input[type="checkbox"]');
        const description = textInput.value.trim();

        if (description.length > 0) { // Only save non-empty strings
            photoCombinations.push({
                description: description,
                withSanta: santaCheckbox.checked
            });
        }
    });
    // === END MODIFICATION ===

    const bookingData = {
        submitterName: submitterName,
        familyMembers: familyMembers,
        // 'includeSanta' field is removed
        photoCombinations: photoCombinations, // This now holds the array of objects
        slotLabel: selectedSlotInfo.label,
        partyDate: PARTY_DATE_YYYY_MM_DD, // Store the date for querying
        bookedAt: serverTimestamp(),
        userId: auth.currentUser ? auth.currentUser.uid : 'anonymous'
    };

    try {
        // We will use the ISO string (which is unique) as the document ID.
        // This maps to the 'allow create: if request.auth != null' rule.
        const docRef = doc(db, "santaSignups", selectedSlotInfo.iso);
        await setDoc(docRef, bookingData);

        // Success!
        santaSignupForm.classList.add('hidden');
        successMessageContainer.classList.remove('hidden');
        bookedSlotDisplay.textContent = `Your slot: ${selectedSlotInfo.label}`;
        
        // Stop listening, we're done.
        if (unsubscribeSlots) unsubscribeSlots();

    } catch (error) {
        console.error("Error booking slot:", error);
        // This error will fire if the user tries to book a slot
        // that was *just* taken (i.e., setDoc fails)
        formErrorMessage.textContent = "Could not book slot. It might have been taken. Please refresh and try again.";
        submitButton.disabled = false;
        submitButton.textContent = "Book My Time Slot";
    }
});

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    if (timestampContainer) {
        // This is required by the Core Directives
        timestampContainer.textContent = `Build: ${new Date().toLocaleString()}`;
    }
    initializePage(); // Start auth check
});

/* Build Timestamp: 11/7/2025, 10:05:00 AM MST */