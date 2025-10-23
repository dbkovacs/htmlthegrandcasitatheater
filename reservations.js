/*
    Folder: /
    File: reservations.js
    Extension: .js
*/
import { db } from './firebase-config.js';
import { collection, doc, getDoc, addDoc, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// --- DOM References ---
const loadingOverlay = document.getElementById('loading-overlay');
const reservationContent = document.getElementById('reservation-content');
const movieTitleDisplay = document.getElementById('movie-title-display');
const seatingContainer = document.getElementById('seating-container');
const reservationsListContainer = document.getElementById('reservations-list-container');
const nameEntryModal = document.getElementById('name-entry-modal');
const beanbagConfirmModal = document.getElementById('beanbag-confirm-modal');
const modalSeatIdDisplay = document.getElementById('modal-seat-id-display');
const modalReserverNameInput = document.getElementById('modal-reserver-name');
const modalSaveNameButton = document.getElementById('modal-save-name-button');
const modalCancelNameButton = document.getElementById('modal-cancel-name-button');
const confirmBeanbagButton = document.getElementById('confirm-beanbag-button');
const cancelBeanbagButton = document.getElementById('cancel-beanbag-button');

// --- State ---
let currentMovie = null;
let seatingLayout = [];
let reservations = [];
let unsubscribeReservations = null;
let seatToProcess = null; // To hold the entire seat object between modals

// --- Main Initialization ---
async function initializePage() {
    try {
        const urlParams = new URLSearchParams(window.location.search);
        const movieId = urlParams.get('movieId');

        if (!movieId) {
            handleFatalError("No Movie ID Provided", "Please return to the main page and click 'Reserve Seat' again.");
            return;
        }

        const movieDoc = await getDoc(doc(db, "movies", movieId));
        if (!movieDoc.exists()) {
            handleFatalError("Movie Not Found", `The movie with ID "${movieId}" could not be found.`);
            return;
        }
        currentMovie = { id: movieDoc.id, ...movieDoc.data() };
        movieTitleDisplay.textContent = `for "${currentMovie.movieTitle}"`;

        await fetchSeatingLayout();
        setupRealtimeReservationsListener();

        loadingOverlay.style.display = 'none';
        reservationContent.classList.remove('hidden');
        reservationContent.classList.add('flex');

    } catch (error) {
        console.error("Initialization Error:", error);
        handleFatalError("Initialization Error", `A critical error occurred: ${error.message}.`);
    }
}

function handleFatalError(title, message) {
    loadingOverlay.innerHTML = `
        <div class="text-center max-w-lg">
            <h2 class="font-cinzel text-2xl text-red-400 mb-2">${title}</h2>
            <p class="text-gray-300">${message}</p>
            <a href="index.html" class="btn-velvet mt-6 inline-block">Return to Main Page</a>
        </div>
    `;
    loadingOverlay.style.display = 'flex';
}

// --- Data Fetching ---
async function fetchSeatingLayout() {
    const layoutDoc = await getDoc(doc(db, "layouts", "default"));
    if (layoutDoc.exists()) {
        seatingLayout = layoutDoc.data().seats;
    } else {
        throw new Error("The 'default' seating layout was not found.");
    }
}

function setupRealtimeReservationsListener() {
    if (unsubscribeReservations) unsubscribeReservations();

    const reservationsRef = collection(db, "movies", currentMovie.id, "reservations");
    
    unsubscribeReservations = onSnapshot(reservationsRef, (snapshot) => {
        reservations = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        reservations.sort((a, b) => {
            const timeA = a.timestamp?.toDate()?.getTime() || 0;
            const timeB = b.timestamp?.toDate()?.getTime() || 0;
            return timeA - timeB;
        });

        renderAll();
    }, (error) => {
        console.error("Error listening to reservations:", error);
        handleFatalError("Connection Lost", "Please refresh the page.");
    });
}

// --- Rendering ---
function renderAll() {
    renderSeatingChart();
    renderGuestList();
}

function renderSeatingChart() {
    seatingContainer.innerHTML = '';
    const reservedSeatIds = reservations.flatMap(r => r.seats.map(s => s.id));
    
    const rows = [...new Set(seatingLayout.map(s => s.row))].sort();
    rows.forEach(rowLetter => {
        const rowDiv = document.createElement('div');
        rowDiv.className = 'flex justify-center gap-4 items-center';
        
        // Sort by number ascending, then reverse for the 4,3,2,1 visual order
        const rowSeats = seatingLayout
            .filter(s => s.row === rowLetter)
            .sort((a, b) => a.number - b.number)
            .reverse(); 
        
        rowSeats.forEach(seat => {
            const seatDiv = document.createElement('div');
            const isReserved = reservedSeatIds.includes(seat.id);
            
            let statusClass = 'bg-gray-400 hover:bg-gray-500 cursor-pointer';
            if (isReserved) statusClass = 'bg-red-800 cursor-not-allowed opacity-70';
            
            const shapeClass = seat.type === 'beanbag' ? 'rounded-full' : 'rounded-lg';

            seatDiv.className = `w-12 h-12 flex items-center justify-center shadow-md transition-all font-bold ${shapeClass} ${statusClass}`;
            seatDiv.textContent = `${seat.row}${seat.number}`;
            seatDiv.dataset.seatId = seat.id;

            if (!isReserved) {
                seatDiv.addEventListener('click', () => handleSeatClick(seat));
            }
            rowDiv.appendChild(seatDiv);
        });
        seatingContainer.appendChild(rowDiv);
    });
}

function renderGuestList() {
    if (reservations.length === 0) {
        reservationsListContainer.innerHTML = `<p class="text-gray-400 italic">Be the first to reserve a seat!</p>`;
        return;
    }
    const list = document.createElement('ul');
    list.className = 'space-y-4';
    reservations.forEach(res => {
        const li = document.createElement('li');
        li.className = 'bg-brand-dark/50 p-3 rounded-lg';
        li.innerHTML = `
            <p class="font-semibold text-lg text-brand-gold">${res.name}</p>
            <p class="text-gray-300 text-sm">Seat: ${res.seats.map(s => s.id).sort().join(', ')}</p>
        `;
        list.appendChild(li);
    });
    reservationsListContainer.innerHTML = '';
    reservationsListContainer.appendChild(list);
}

// --- UI Interaction & Modals ---
function handleSeatClick(seat) {
    seatToProcess = seat; // Store the entire seat object
    if (seat.type === 'beanbag') {
        beanbagConfirmModal.classList.remove('hidden');
    } else {
        showNameEntryModal();
    }
}

function showNameEntryModal() {
    modalSeatIdDisplay.textContent = seatToProcess.id;
    nameEntryModal.classList.remove('hidden');
    modalReserverNameInput.focus();
}

function closeAndResetNameModal() {
    nameEntryModal.classList.add('hidden');
    modalReserverNameInput.value = '';
    seatToProcess = null;
}

// --- Form Submission ---
async function submitReservation() {
    const name = modalReserverNameInput.value.trim();
    if (!name || !seatToProcess) return;

    modalSaveNameButton.disabled = true;
    modalSaveNameButton.textContent = 'Reserving...';

    const seatToReserve = { id: seatToProcess.id, row: seatToProcess.row, number: seatToProcess.number };

    try {
        const reservationsRef = collection(db, "movies", currentMovie.id, "reservations");
        await addDoc(reservationsRef, {
            name: name,
            seats: [seatToReserve], // Save as an array with one seat object
            timestamp: serverTimestamp()
        });
        closeAndResetNameModal(); // Success is handled by the listener
    } catch (error) {
        console.error("Error submitting reservation:", error);
        alert("There was an error saving your reservation.");
    } finally {
        modalSaveNameButton.disabled = false;
        modalSaveNameButton.textContent = 'Reserve';
    }
}

// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', initializePage);

// Beanbag Modal Listeners
confirmBeanbagButton.addEventListener('click', () => {
    beanbagConfirmModal.classList.add('hidden');
    showNameEntryModal(); // Proceed to name entry
});

cancelBeanbagButton.addEventListener('click', () => {
    beanbagConfirmModal.classList.add('hidden');
    seatToProcess = null; // Clear the selected seat
});

// Name Modal Listeners
modalSaveNameButton.addEventListener('click', submitReservation);
modalCancelNameButton.addEventListener('click', closeAndResetNameModal);

modalReserverNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        submitReservation();
    }
});

/* Build Timestamp: 10/23/2025, 3:37:00 PM MDT */
