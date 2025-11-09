/* /admin_santa.js */
import { db, auth } from './firebase-config.js';
import { 
    collection, 
    onSnapshot, 
    doc, 
    deleteDoc, 
    updateDoc, 
    query, 
    orderBy,
    runTransaction,
    documentId // <-- ADDED THIS IMPORT
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { 
    onAuthStateChanged, 
    signOut 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// VVV YOU MUST EDIT THIS LIST VVV
// This list controls who can access the admin panel.
const ADMIN_EMAILS = ['dbkovacs@gmail.com'];
// ^^^ YOU MUST EDIT THIS LIST ^^^

// --- CONFIGURATION ---
// This *MUST* match the Document ID from 'santa-signup.js'
const PARTY_DATE_YYYY_MM_DD = "2025-12-14"; 
// --- END CONFIGURATION ---


// --- Global State ---
let allBookings = []; // To store bookings for the print function

// --- DOM References ---
const manageBookingsContainer = document.getElementById('manage-bookings-container');
const timestampContainer = document.getElementById('build-timestamp');
const logoutButton = document.getElementById('logout-button');
const printShotListButton = document.getElementById('print-shot-list-button');

// --- Authentication Guard ---
function checkAuth() {
    onAuthStateChanged(auth, (user) => {
        if (!user) {
            console.log("No user signed in. Redirecting to login.");
            window.location.href = 'login.html';
        } else {
            if (!ADMIN_EMAILS.includes(user.email)) {
                console.warn(`Unauthorized user signed in: ${user.email}. Signing out.`);
                signOut(auth).then(() => {
                    window.location.href = 'login.html?error=auth';
                });
            } else {
                console.log("Admin user authenticated:", user.email);
                // Initialize page only after auth confirmed
                initializePage();
            }
        }
    });
}

// --- Page Initialization ---
function initializePage() {
    // Logout Button
    logoutButton.addEventListener('click', () => {
        signOut(auth).catch((error) => console.error("Sign out error:", error));
        // checkAuth listener will handle redirect
    });

    // Print Button
    printShotListButton.addEventListener('click', () => printShotList());

    // Event Delegation for all booking card actions
    manageBookingsContainer.addEventListener('click', async function(event) {
        const target = event.target;
        const container = target.closest('.booking-card-admin-container');
        if (!container) return;

        const bookingId = container.dataset.bookingId;
        const slotLabel = container.dataset.slotLabel;

        // Handle Delete Booking
        if (target.matches('.delete-button')) {
            deleteBooking(bookingId, slotLabel);
        }

        // Handle Edit Button
        if (target.matches('.edit-button')) {
             const view = container.querySelector('.booking-view');
             const editForm = container.querySelector('.booking-edit-form');
             if(view) view.classList.add('hidden');
             if(editForm) editForm.classList.remove('hidden');
        }

        // Handle Cancel Edit Button
        if (target.matches('.cancel-edit-button')) {
             const view = container.querySelector('.booking-view');
             const editForm = container.querySelector('.booking-edit-form');
             if(view) view.classList.remove('hidden');
             if(editForm) editForm.classList.add('hidden');
        }

        // Handle Save Edit Button
        if (target.matches('.save-edit-button')) {
            saveBookingChanges(bookingId, container);
        }
    });

    // Load existing bookings
    // We order by the document ID, which is the ISO timestamp, so it sorts by time
    const q = query(collection(db, 'santaBookings'), orderBy(documentId(), 'asc'));
    
    onSnapshot(q, (snapshot) => {
        allBookings = snapshot.docs; // Store for printing

        if (manageBookingsContainer) {
            manageBookingsContainer.innerHTML = ''; // Clear previous

            if (snapshot.empty) {
                manageBookingsContainer.innerHTML = '<p class="text-gray-400">No Santa bookings found.</p>';
                return;
            }

            snapshot.docs.forEach((doc) => {
                const booking = doc.data();
                const bookingId = doc.id;
                const card = createBookingCard(bookingId, booking);
                manageBookingsContainer.appendChild(card);
            });
        }
    }, (error) => {
        console.error("Error fetching bookings: ", error);
        if (manageBookingsContainer) {
             manageBookingsContainer.innerHTML = '<p class="text-red-400">Could not load bookings. Check Firestore rules and console.</p>';
        }
    });

    if (timestampContainer) {
        timestampContainer.textContent = `Build: ${new Date().toLocaleString()}`;
    }
} // End initializePage

// --- Helper Functions ---

/**
 * Creates the HTML element for a single booking card
 */
function createBookingCard(bookingId, booking) {
    const cardElement = document.createElement('div');
    cardElement.className = 'booking-card-admin-container';
    cardElement.dataset.bookingId = bookingId;
    cardElement.dataset.slotLabel = booking.slotLabel || 'Unknown Slot';

    // --- Format Photo Combinations for display ---
    let photoListHtml = '<p class="text-gray-400 italic">No photo requests.</p>';
    if (booking.photoCombinations && booking.photoCombinations.length > 0) {
        photoListHtml = '<ul class="list-disc list-inside text-sm text-gray-300">';
        booking.photoCombinations.forEach(combo => {
            photoListHtml += `<li>${combo.description} ${combo.withSanta ? '<strong>(w/ Santa)</strong>' : ''}</li>`;
        });
        photoListHtml += '</ul>';
    }

    // --- Create View Mode ---
    const viewHtml = `
        <div class="booking-view">
            <div class="booking-card-admin">
                <div>
                    <h4 class="font-bold text-lg text-brand-gold">${booking.slotLabel || 'Booking'}</h4>
                    <p class="text-sm"><strong>Booked by:</strong> ${booking.submitterName || 'N/A'}</p>
                    <p class="text-sm text-gray-400"><strong>Family:</strong> ${booking.familyMembers || 'N/A'}</p>
                    <p class="text-sm text-gray-400"><strong>Phone:</strong> ${booking.familyPhone || 'N/A'}</p>
                </div>
                <div class="flex flex-col gap-2">
                    <button class="edit-button text-xs">Edit</button>
                    <button class="delete-button text-xs">Delete</button>
                </div>
            </div>
            <div class="mt-4 pt-4 border-t border-yellow-300/10">
                <h5 class="font-cinzel text-md text-brand-gold mb-2">Photo Shot List</h5>
                ${photoListHtml}
            </div>
        </div>
    `;

    // --- Create Edit Form ---
    const editHtml = `
        <div class="booking-edit-form hidden p-4 space-y-4 bg-black/30 rounded-b-lg">
            <h4 class="font-bold text-lg text-brand-gold">Editing: ${booking.slotLabel}</h4>
            
            <div>
                <label for="edit-submitter-name-${bookingId}">Submitter Name</label>
                <input type="text" id="edit-submitter-name-${bookingId}" class="edit-submitter-name" value="${booking.submitterName || ''}">
            </div>
            
            <div>
                <label for="edit-family-members-${bookingId}">Family Members Attending</label>
                <input type="text" id="edit-family-members-${bookingId}" class="edit-family-members" value="${booking.familyMembers || ''}">
            </div>

            <div>
                <label for="edit-photo-combos-${bookingId}">Photo Combinations (Edit as JSON)</label>
                <textarea id="edit-photo-combos-${bookingId}" class="edit-photo-combos font-mono text-xs" rows="6">${JSON.stringify(booking.photoCombinations || [], null, 2)}</textarea>
                <p class="text-xs text-gray-400 mt-1">Edit the JSON array directly. Be careful!</p>
            </div>

            <div class="flex gap-4 pt-2">
                <button class="btn-velvet primary flex-1 save-edit-button text-sm py-2">Save Changes</button>
                <button class="btn-velvet flex-1 cancel-edit-button text-sm py-2">Cancel</button>
            </div>
        </div>
    `;

    cardElement.innerHTML = viewHtml + editHtml;
    return cardElement;
}

/**
 * Saves changes from the edit form to Firestore
 */
async function saveBookingChanges(bookingId, container) {
    const editForm = container.querySelector('.booking-edit-form');
    if (!editForm) return;

    const saveButton = editForm.querySelector('.save-edit-button');
    saveButton.disabled = true;
    saveButton.textContent = 'Saving...';

    const newName = editForm.querySelector('.edit-submitter-name').value;
    const newFamily = editForm.querySelector('.edit-family-members').value;
    const combosText = editForm.querySelector('.edit-photo-combos').value;

    let newPhotoCombos;
    try {
        newPhotoCombos = JSON.parse(combosText);
        if (!Array.isArray(newPhotoCombos)) {
            throw new Error("Input is not a valid JSON array.");
        }
    } catch (jsonError) {
        alert(`Error: Invalid JSON format for Photo Combinations. ${jsonError.message}`);
        saveButton.disabled = false;
        saveButton.textContent = 'Save Changes';
        return;
    }

    const updatedData = {
        submitterName: newName,
        familyMembers: newFamily,
        photoCombinations: newPhotoCombos
    };

    try {
        await updateDoc(doc(db, 'santaBookings', bookingId), updatedData);
        alert('Booking updated successfully!');
        // Toggle view (onSnapshot will handle data refresh)
        container.querySelector('.booking-view').classList.remove('hidden');
        container.querySelector('.booking-edit-form').classList.add('hidden');
    } catch (error) {
        console.error("Error updating booking:", error);
        alert("Failed to update booking. Check console.");
    } finally {
        saveButton.disabled = false;
        saveButton.textContent = 'Save Changes';
    }
}

/**
 * Deletes a booking from 'santaBookings' and frees up the slot in 'publicSantaConfig'
 */
async function deleteBooking(bookingId, slotLabel) {
    if (!confirm(`Are you sure you want to delete the booking for ${slotLabel}? This action cannot be undone and will make the time slot available again.`)) {
        return;
    }

    // Define document references
    const bookingRef = doc(db, 'santaBookings', bookingId);
    const publicSlotsRef = doc(db, "publicSantaConfig", PARTY_DATE_YYYY_MM_DD);

    try {
        await runTransaction(db, async (transaction) => {
            // 1. Get the public config doc
            const publicSlotsDoc = await transaction.get(publicSlotsRef);
            if (!publicSlotsDoc.exists()) {
                // This shouldn't happen, but good to check
                throw new Error("Public slot config document not found. Cannot free slot.");
            }

            // 2. Delete the private booking
            transaction.delete(bookingRef);

            // 3. Update the public config to remove the slot
            const takenSlots = publicSlotsDoc.data().takenSlots || [];
            const newTakenSlots = takenSlots.filter(iso => iso !== bookingId);
            transaction.update(publicSlotsRef, { takenSlots: newTakenSlots });
        });

        alert(`Booking for ${slotLabel} deleted successfully. The slot is now available.`);
        // onSnapshot will automatically update the UI

    } catch (error) {
        console.error("Error deleting booking (transaction failed):", error);
        alert(`Failed to delete booking: ${error.message}`);
    }
}

/**
 * Generates a new, print-friendly window with the shot list
 */
function printShotList() {
    if (!allBookings || allBookings.length === 0) {
        alert('No bookings to print.');
        return;
    }

    const printWindow = window.open('', 'Print Shot List', 'height=800,width=600');
    
    printWindow.document.write('<html><head><title>Santa Photo Shot List</title>');
    // Print Styles
    printWindow.document.write(`
        <style>
            body { 
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
                margin: 0.75in;
                line-height: 1.5;
                font-size: 12pt; /* Base font size for print */
            }
            h1 {
                font-family: "Times New Roman", Times, serif;
                font-size: 20pt;
                text-align: center;
                border-bottom: 2px solid #000;
                padding-bottom: 10px;
                margin-bottom: 0.3in;
            }
            .booking-entry {
                margin-bottom: 0.25in;
                page-break-inside: avoid;
                border: 1px solid #aaa;
                border-radius: 8px;
                padding: 0.15in;
            }
            .entry-header {
                display: flex;
                align-items: flex-start; /* Align checkbox to top */
                font-size: 14pt;
                font-weight: bold;
            }
            .main-checkbox {
                width: 22px;
                height: 22px;
                margin-right: 12px;
                border: 2px solid #000;
                flex-shrink: 0;
                margin-top: 4px; /* Align with top of text */
            }
            .header-info {
                display: flex;
                flex-direction: column;
            }
            .header-info .time-slot {
                font-size: 1.1em; /* ~15.4pt */
                color: #000;
            }
            .header-info .family-members {
                font-size: 0.9em; /* ~12.6pt */
                font-weight: normal;
                color: #333;
                margin-top: 4px;
            }
            .shots-section {
                margin-top: 0.15in;
                padding-top: 0.1in;
                border-top: 1px solid #ccc;
                margin-left: 34px; /* Indent to align with header text */
            }
            .shots-section h3 {
                font-size: 11pt;
                font-weight: bold;
                color: #333;
                margin: 0 0 5px 0;
            }
            .shots-section ul {
                margin: 0;
                padding-left: 0;
                list-style-type: none;
            }
            .shots-section li {
                font-size: 12pt;
                display: flex;
                align-items: center;
                margin-bottom: 5px;
                color: #000;
            }
            .shot-checkbox {
                width: 16px;
                height: 16px;
                margin-right: 10px;
                border: 1px solid #555;
                flex-shrink: 0;
            }
            @media print {
                body { 
                    margin: 0.5in; 
                    font-size: 11pt; /* Base print font */
                }
                .booking-entry {
                    border: 1px solid #999;
                }
                .main-checkbox, .shot-checkbox {
                    border: 1px solid #000 !important;
                    -webkit-print-color-adjust: exact;
                    print-color-adjust: exact;
                }
            }
        </style>
    `);
    printWindow.document.write('</head><body>');
    
    printWindow.document.write('<h1>Santa Photo Shot List</h1>');

    // Loop through sorted bookings (already sorted by time)
    allBookings.forEach(doc => {
        const booking = doc.data();
        
        printWindow.document.write('<div class="booking-entry">');
        
        // Main header with checkbox
        printWindow.document.write(`
            <div class="entry-header">
                <span class="main-checkbox"></span>
                <div class="header-info">
                    <span class="time-slot">${booking.slotLabel} - ${booking.submitterName}</span>
                    <span class="family-members">Family: ${booking.familyMembers || 'N/A'}</span>
                </div>
            </div>
        `);
        
        // Shots section, indented
        printWindow.document.write('<div class="shots-section">');
        printWindow.document.write('<h3>Requested Shots:</h3>');
        if (booking.photoCombinations && booking.photoCombinations.length > 0) {
            printWindow.document.write('<ul>');
            booking.photoCombinations.forEach(combo => {
                const description = combo.description.replace(/</g, "&lt;").replace(/>/g, "&gt;"); // Sanitize
                const santaText = combo.withSanta ? '<strong>(w/ Santa)</strong>' : '';
                // Add a checkbox for each list item
                printWindow.document.write(`
                    <li>
                        <span class="shot-checkbox"></span>
                        <span>${description} ${santaText}</span>
                    </li>
                `);
            });
            printWindow.document.write('</ul>');
        } else {
            printWindow.document.write('<p><em>No specific shots listed.</em></p>');
        }
        printWindow.document.write('</div>'); // End .shots-section

        printWindow.document.write('</div>'); // End .booking-entry
    });

    printWindow.document.write('</body></html>');
    
    printWindow.document.close(); // Finish writing
    printWindow.focus(); // Focus the new window
    printWindow.print(); // Open the print dialog
}


// --- Initialization Trigger ---
document.addEventListener('DOMContentLoaded', checkAuth); // Start auth check first

/* Build Timestamp: 11/9/2025, 11:12:00 AM MST */