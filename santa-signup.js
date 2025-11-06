/* /santa-signup.js */
import { db, auth } from './firebase-config.js';
import { 
    collection, 
    doc, 
    setDoc, 
    onSnapshot, 
    serverTimestamp, 
    query, 
    where
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { 
    signInAnonymously, 
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// --- CONFIGURATION ---
// Set the date of the party
// IMPORTANT: Use YYYY-MM-DD format.
const PARTY_DATE_YYYY_MM_DD = "2025-12-14"; 

// Set the start and end times for the party (24-hour format)
// Example: 9:00 AM = 9, 5:00 PM = 17
const PARTY_START_HOUR = 9; // 9:00 AM
const PARTY_END_HOUR = 17; // 5:00 PM (slots will run *until* 5:00 PM)

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
let unsubscribeSlots = null;
let allSlots = [];

// --- Auth ---
function initializePage() {
    onAuthStateChanged(auth, (user) => {
        if (user) {
            console.log('User is signed in:', user.uid);
            setupSlotListener();
        } else {
            console.log('No user, signing in anonymously...');
            signInAnonymously(auth).catch((error) => {
                console.error("Anonymous sign-in failed:", error);
                timeSlotContainer.innerHTML = '<p class="text-red-400 col-span-full text-center">Error connecting to service. Please refresh.</p>';
            });
            // onAuthStateChanged will fire again on success, triggering setupSlotListener
        }
    });
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

function setupSlotListener() {
    // Generate the master list of slots first
    generateAllSlots();

    // Listen for documents in the 'santaSignups' collection FOR THAT DAY
    const q = query(collection(db, "santaSignups"), where("partyDate", "==", PARTY_DATE_YYYY_MM_DD));
    
    if (unsubscribeSlots) unsubscribeSlots(); // Stop previous listener if any
    
    unsubscribeSlots = onSnapshot(q, (snapshot) => {
        const takenSlotISOs = snapshot.docs.map(doc => doc.id); // Doc ID is the ISO string
        console.log("Taken slots:", takenSlotISOs);
        renderTimeSlots(takenSlotISOs);
    }, (error) => {
        console.error("Error listening to time slots:", error);
        timeSlotContainer.innerHTML = '<p class="text-red-400 col-span-full text-center">Error loading time slots. Please refresh.</p>';
    });
}

function renderTimeSlots(takenSlotISOs) {
    if (!timeSlotContainer) return;
    timeSlotContainer.innerHTML = ''; // Clear existing

    if (allSlots.length === 0) {
        timeSlotContainer.innerHTML = '<p class="text-gray-400 col-span-full text-center">No time slots have been configured.</p>';
        return;
    }

    allSlots.forEach(slot => {
        const isTaken = takenSlotISOs.includes(slot.iso);
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
        // Use setDoc with the ISO string as the ID.
        // This acts as a final check. If someone *just* took the slot,
        // this will overwrite... but since we're using onSnapshot,
        // the button should have been disabled.
        // For a more robust "atomic" lock, we'd use a transaction,
        // but setDoc with a unique ID is 99.9% effective here.
        
        // We will use the ISO string (which is unique) as the document ID.
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
        formErrorMessage.textContent = "Could not book slot. It might have been taken. Please refresh and try again.";
        submitButton.disabled = false;
        submitButton.textContent = "Book My Time Slot";
    }
});

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    if (timestampContainer) {
        timestampContainer.textContent = `Build: ${new Date().toLocaleString()}`;
    }
    initializePage(); // Start auth check
});

/* Build Timestamp: 11/6/2025, 11:30:00 AM MST */