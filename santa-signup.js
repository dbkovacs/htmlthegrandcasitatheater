/* /santa-signup.js */
import { db, auth } from './firebase-config.js';
import { 
    doc, 
    runTransaction,
    serverTimestamp, 
    onSnapshot,
    getDoc,
    collection,
    setDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { 
    signInAnonymously, 
    signOut,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// --- CONFIGURATION ---
// Set the date of the party
// This *MUST* match the Document ID you create in 'publicSantaConfig'
const PARTY_DATE_YYYY_MM_DD = "2025-12-14"; 

const PARTY_START_HOUR = 17; // 5:00 PM
const PARTY_END_HOUR = 19; // 7:00 PM
const SLOT_DURATION_MINUTES = 15;
// --- END CONFIGURATION ---

// --- DOM References ---
const timestampContainer = document.getElementById('build-timestamp');
const timeSlotContainer = document.getElementById('time-slot-container');
const slotErrorMessage = document.getElementById('slot-error-message');
const timeSlotFieldset = document.getElementById('time-slot-fieldset');
const photoDetailsFieldset = document.getElementById('photo-details-fieldset');
const selectedTimeDisplay = document.getElementById('selected-time-display');
const backToSlotsButton = document.getElementById('back-to-slots-button');
const santaSignupForm = document.getElementById('santaSignupForm');
const submitButton = document.getElementById('submitButton');
const formErrorMessage = document.getElementById('form-error-message');
const successMessageContainer = document.getElementById('success-message-container');
const bookedSlotDisplay = document.getElementById('booked-slot-display');

// Form Fields
const familyPhoneInput = document.getElementById('family-phone');
const submitterNameInput = document.getElementById('submitter-name');
const familyMembersInput = document.getElementById('family-members');

// --- State ---
let selectedSlotInfo = null; // { iso: "...", label: "..." }
let unsubscribePublicSlots = null;
let allSlots = []; // Master list of generated slots
let isAuthReady = false; // --- NEW: Track auth state ---
let currentUser = null; // --- NEW: Store current user ---

// --- Time Slot Generation & Rendering ---
function generateAllSlots() {
    allSlots = []; // Clear and regenerate
    // --- FIX: Ensure date parsing is consistent, use local time ---
    // We assume the YYYY-MM-DD is in the server's/host's local timezone.
    const [year, month, day] = PARTY_DATE_YYYY_MM_DD.split('-').map(Number);
    // Create date in local time
    const partyDate = new Date(year, month - 1, day);
    // --- END FIX ---
    
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

/**
 * NEW: Public Slot Listener
 * This function listens to a *publicly readable* document
 * to get the list of taken slots.
 */
function setupPublicSlotListener() {
    // --- NEW: Guard to wait for auth ---
    if (!isAuthReady) {
        console.log("Auth not ready, deferring slot listener setup.");
        return;
    }
    // --- END NEW ---

    // Generate the master list of slots first
    generateAllSlots();

    if (unsubscribePublicSlots) unsubscribePublicSlots(); // Stop previous listener

    const publicSlotsRef = doc(db, "publicSantaConfig", PARTY_DATE_YYYY_MM_DD);
    
    // DEBUGGING: Log the exact path we are trying to read
    console.log(`Attaching public slot listener to: ${publicSlotsRef.path}`);

    unsubscribePublicSlots = onSnapshot(publicSlotsRef, (doc) => {
        if (doc.exists()) {
            const data = doc.data();
            const takenSlotISOs = data.takenSlots || [];
            renderTimeSlots(takenSlotISOs);
            slotErrorMessage.textContent = '';
        } else {
            // This happens if the 'publicSantaConfig/YYYY-MM-DD' doc isn't created
            console.error("CRITICAL: Public config document not found.");
            slotErrorMessage.textContent = "Error: Could not load slot configuration.";
            if (timeSlotContainer) timeSlotContainer.innerHTML = ''; // Clear spinner
        }
    }, (error) => {
        // This is where the "Missing or insufficient permissions" error was happening
        console.error("Error listening to public slots:", error);
        slotErrorMessage.textContent = `Error connecting to slot server: ${error.message}`;
        if (timeSlotContainer) timeSlotContainer.innerHTML = ''; // Clear spinner
    });
}

/**
 * Renders the time slot buttons based on the list of taken slot ISOs.
 */
function renderTimeSlots(takenSlotISOs) {
    if (!timeSlotContainer) return;
    timeSlotContainer.innerHTML = ''; // Clear spinner/existing

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
    
    if (selectedTimeDisplay) selectedTimeDisplay.textContent = selectedSlotInfo.label;

    if (timeSlotFieldset) timeSlotFieldset.classList.add('hidden');
    if (photoDetailsFieldset) photoDetailsFieldset.classList.remove('hidden');
    
    // Focus the first input of the new section
    if (familyPhoneInput) familyPhoneInput.focus();
}

if (backToSlotsButton) {
    backToSlotsButton.addEventListener('click', () => {
        selectedSlotInfo = null;
        if (timeSlotFieldset) timeSlotFieldset.classList.remove('hidden');
        if (photoDetailsFieldset) photoDetailsFieldset.classList.add('hidden');
    });
}

// --- Form Submission ---
if (santaSignupForm) {
    santaSignupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!selectedSlotInfo) {
            formErrorMessage.textContent = "An error occurred. Please go back and re-select your time.";
            return;
        }

        // Get all form data
        const familyPhone = familyPhoneInput.value.trim().replace(/\D/g, ''); // Clean phone
        const submitterName = submitterNameInput.value.trim();
        const familyMembers = familyMembersInput.value.trim();

        // Validation
        if (familyPhone.length < 10) {
            formErrorMessage.textContent = "Please enter a valid 10-digit family phone number.";
            return;
        }
        if (!submitterName || !familyMembers) {
            formErrorMessage.textContent = "Please fill out your name and the family members attending.";
            return;
        }

        formErrorMessage.textContent = "";
        submitButton.disabled = true;
        submitButton.innerHTML = '<div class="spinner"></div>'; // Show spinner

        // Collect photo combinations
        const photoComboRows = document.querySelectorAll('.photo-combo-row');
        const photoCombinations = [];
        photoComboRows.forEach(row => {
            const textInput = row.querySelector('input[type="text"]');
            const santaCheckbox = row.querySelector('input[type="checkbox"]');
            if (textInput && santaCheckbox) {
                const description = textInput.value.trim();
                if (description.length > 0) {
                    photoCombinations.push({
                        description: description,
                        withSanta: santaCheckbox.checked
                    });
                }
            }
        });

        const bookingData = {
            submitterName: submitterName,
            familyMembers: familyMembers,
            familyPhone: familyPhone, // Include verified phone
            photoCombinations: photoCombinations,
            slotLabel: selectedSlotInfo.label,
            partyDate: PARTY_DATE_YYYY_MM_DD,
            bookedAt: serverTimestamp(),
            // userId will be added within the transaction
        };

        // --- CORRECTED: Get user from auth state ---
        const user = currentUser; // Use the stored user

        try {
            // 1. Check if user is authenticated (from the onAuthStateChanged listener)
            if (!user) {
                throw new Error("Authentication session expired. Please refresh the page and try again.");
            }
            bookingData.userId = user.uid; // Add the auth UID to the data

            // 2. Run the secure transaction
            await runTransaction(db, async (transaction) => {
                // Define all document references
                
                // --- UPDATED PATH ---
                const phoneListRef = doc(db, "settings", "auction");
                // --- END UPDATED PATH ---

                const publicSlotsRef = doc(db, "publicSantaConfig", PARTY_DATE_YYYY_MM_DD);
                const newBookingRef = doc(db, "santaBookings", selectedSlotInfo.iso);

                // --- Read Phase ---
                // a. Read the private family phone list
                const phoneListDoc = await transaction.get(phoneListRef);
                if (!phoneListDoc.exists()) {
                    throw new Error("CONFIG_ERROR: Family phone list not found.");
                }
                
                // b. Read the public slot tracker
                const publicSlotsDoc = await transaction.get(publicSlotsRef);
                if (!publicSlotsDoc.exists()) {
                    throw new Error("CONFIG_ERROR: Public slot config not found.");
                }

                // --- Validation Phase ---
                // a. Check if phone is on the list
                
                // --- UPDATED FIELD NAME ---
                const allowedPhones = phoneListDoc.data().approvedNumbers || [];
                // --- END UPDATED FIELD NAME ---

                if (!allowedPhones.includes(familyPhone)) {
                    throw new Error("VERIFICATION_FAILED");
                }

                // b. Check if slot is already taken
                const takenSlots = publicSlotsDoc.data().takenSlots || [];
                if (takenSlots.includes(selectedSlotInfo.iso)) {
                    throw new Error("SLOT_TAKEN");
                }

                // --- Write Phase (All checks passed) ---
                // a. Write the private booking data
                transaction.set(newBookingRef, bookingData);
                
                // b. Update the public list of taken slots
                const newTakenSlots = [...takenSlots, selectedSlotInfo.iso];
                transaction.update(publicSlotsRef, { takenSlots: newTakenSlots });
            });

            // 3. Transaction Succeeded
            santaSignupForm.classList.add('hidden');
            if (successMessageContainer) successMessageContainer.classList.remove('hidden');
            if (bookedSlotDisplay) bookedSlotDisplay.textContent = `Your slot: ${selectedSlotInfo.label}`;
            
            if (unsubscribePublicSlots) unsubscribePublicSlots(); // Stop listening

        } catch (error) {
            console.error("Error booking slot:", error);
            // Handle custom transaction errors
            if (error.message === "VERIFICATION_FAILED") {
                formErrorMessage.textContent = "Phone number not found on the family list. Please try again.";
            } else if (error.message === "SLOT_TAKEN") {
                formErrorMessage.textContent = "Sorry, that slot was just booked by someone else. Please go back and pick a new time.";
            } else if (error.message.startsWith("CONFIG_ERROR")) {
                formErrorMessage.textContent = "A configuration error occurred. Please contact the administrator.";
            } else {
                formErrorMessage.textContent = `Could not book slot: ${error.message}`;
            }
            
        } finally {
            // --- CORRECTED: Removed the signOut() call ---
            
            // Restore button
            submitButton.disabled = false;
            submitButton.innerHTML = "Book My Time Slot";
        }
    });
}

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    // 1. Set build timestamp immediately
    if (timestampContainer) {
        timestampContainer.textContent = `Build: ${new Date().toLocaleString()}`;
    }

    // 2. Set up the auth state listener
    onAuthStateChanged(auth, (user) => {
        if (user) {
            // 3a. User is authenticated
            console.log("Authenticated with user ID:", user.uid);
            isAuthReady = true; // --- NEW: Mark auth as ready
            currentUser = user; // --- NEW: Store user
            
            // 4. NOW it's safe to attach the Firestore listener
            setupPublicSlotListener(); 
            
        } else {
            // 3b. No user. Sign in anonymously.
            console.log("No user, signing in anonymously...");
            isAuthReady = false; // Mark auth as not ready
            currentUser = null;
            signInAnonymously(auth).catch((error) => {
                console.error("Error signing in anonymously for listener:", error);
                if(slotErrorMessage) slotErrorMessage.textContent = "Error initializing connection.";
            });
            // The listener will re-run when sign-in is complete.
        }
    });
});
/* Build Timestamp: 11/8/2025, 4:09:00 PM MST */