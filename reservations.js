/*
    Folder: /
    File: reservations.js
    Extension: .js
*/

// FIX 1: Import serverTimestamp to ensure reliable timekeeping.
import { db } from './firebase-config.js';
import { collection, doc, getDoc, addDoc, query, orderBy, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// --- DOM References ---
const loadingOverlay = document.getElementById('loading-overlay');
const reservationContent = document.getElementById('reservation-content');
const movieTitleDisplay = document.getElementById('movie-title-display');
const seatingContainer = document.getElementById('seating-container');
const selectedSeatsCount = document.getElementById('selected-seats-count');
const selectedSeatsList = document.getElementById('selected-seats-list');
const reserverNameInput = document.getElementById('reserver-name');
const reserveButton = document.getElementById('reserve-button');
const reservationsListContainer = document.getElementById('reservations-list-container');
const successModal = document.getElementById('success-modal');
const premiumFullModal = document.getElementById('premium-full-modal');
const confirmContinueButton = document.getElementById('confirm-continue-button');
const cancelContinueButton = document.getElementById('cancel-continue-button');


// --- State ---
let currentMovie = null;
let seatingLayout = [];
let reservations = [];
let selectedSeats = [];
let unsubscribeReservations = null;
let arePremiumSeatsFull = false;

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
        throw new Error("The 'default' seating layout was not found. Please run 'setup-firestore.html'.");
    }
}

function setupRealtimeReservationsListener() {
    if (unsubscribeReservations) unsubscribeReservations();

    // FIX 2: Remove orderBy from the query to fetch all documents, even if they lack a timestamp field.
    const reservationsRef = collection(db, "movies", currentMovie.id, "reservations");
    
    unsubscribeReservations = onSnapshot(reservationsRef, (snapshot) => {
        reservations = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        // Sort on the client-side to handle documents with or without timestamps gracefully.
        reservations.sort((a, b) => {
            const timeA = a.timestamp?.toDate()?.getTime() || 0;
            const timeB = b.timestamp?.toDate()?.getTime() || 0;
            return timeA - timeB;
        });

        checkPremiumSeatStatus();
        renderAll();
    }, (error) => {
        console.error("Error listening to reservations:", error);
        handleFatalError("Connection Lost", "Please refresh the page.");
    });
}

// --- Check Premium Seat Status ---
function checkPremiumSeatStatus() {
    const premiumSeatIds = seatingLayout.filter(s => s.isPremium).map(s => s.id);
    if (premiumSeatIds.length === 0) {
        arePremiumSeatsFull = false;
        return;
    }
    const reservedSeatIds = reservations.flatMap(r => r.seats.map(s => s.id));
    arePremiumSeatsFull = premiumSeatIds.every(id => reservedSeatIds.includes(id));
}


// --- Rendering ---
function renderAll() {
    renderSeatingChart();
    renderGuestList();
    updateReservationButton();
}

function renderSeatingChart() {
    seatingContainer.innerHTML = '';
    const reservedSeatIds = reservations.flatMap(r => r.seats.map(s => s.id));
    
    const rows = [...new Set(seatingLayout.map(s => s.row))].sort();
    rows.forEach(rowLetter => {
        const rowDiv = document.createElement('div');
        rowDiv.className = 'flex justify-center gap-4 items-center';
        
        const rowSeats = seatingLayout.filter(s => s.row === rowLetter).sort((a,b) => a.number - b.number);
        
        rowSeats.forEach(seat => {
            const seatDiv = document.createElement('div');
            const isReserved = reservedSeatIds.includes(seat.id);
            const isSelected = selectedSeats.includes(seat.id);
            
            let statusClass = 'bg-gray-400 hover:bg-gray-500 cursor-pointer';
            if (isReserved) statusClass = 'bg-red-800 cursor-not-allowed opacity-70';
            if (isSelected) statusClass = 'bg-blue-500 ring-2 ring-offset-2 ring-offset-brand-card ring-blue-400';
            
            const shapeClass = seat.type === 'beanbag' ? 'rounded-full' : 'rounded-lg';

            seatDiv.className = `w-12 h-12 flex items-center justify-center shadow-md transition-all font-bold ${shapeClass} ${statusClass}`;
            seatDiv.textContent = `${seat.row}${seat.number}`;
            seatDiv.dataset.seatId = seat.id;

            if (!isReserved) {
                seatDiv.addEventListener('click', () => handleSeatClick(seat.id));
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
            <p class="text-gray-300 text-sm">Seats: ${res.seats.map(s => `${s.row}${s.number}`).join(', ')}</p>
        `;
        list.appendChild(li);
    });
    reservationsListContainer.innerHTML = '';
    reservationsListContainer.appendChild(list);
}


// --- UI Interaction & State Management ---
function handleSeatClick(seatId) {
    if (selectedSeats.includes(seatId)) {
        selectedSeats = selectedSeats.filter(id => id !== seatId);
    } else {
        selectedSeats.push(seatId);
    }
    updateSelectedSeatsDisplay();
    renderSeatingChart();
}

function updateSelectedSeatsDisplay() {
    selectedSeatsCount.textContent = selectedSeats.length;
    if (selectedSeats.length > 0) {
        const seatNames = selectedSeats.map(id => {
            const seat = seatingLayout.find(s => s.id === id);
            return seat ? `${seat.row}${seat.number}` : '';
        }).sort().join(', ');
        selectedSeatsList.textContent = seatNames;
    } else {
        selectedSeatsList.textContent = 'None';
    }
    updateReservationButton();
}

function updateReservationButton() {
    const name = reserverNameInput.value.trim();
    if (name && selectedSeats.length > 0) {
        reserveButton.classList.remove('disabled');
    } else {
        reserveButton.classList.add('disabled');
    }
}

// --- Form Submission ---
function handleReservationClick() {
    const selectedSeatObjects = selectedSeats.map(id => seatingLayout.find(s => s.id === id));
    const isSelectingOnlyNonPremium = selectedSeatObjects.every(s => !s.isPremium);

    if (arePremiumSeatsFull && !isSelectingOnlyNonPremium) {
         alert("All premium seats are currently taken. Please select only available bean bag seats.");
         return;
    }
    
    if (arePremiumSeatsFull && isSelectingOnlyNonPremium) {
        premiumFullModal.classList.remove('hidden');
    } else {
        submitReservation();
    }
}

async function submitReservation() {
    const name = reserverNameInput.value.trim();
    if (!name || selectedSeats.length === 0) return;

    reserveButton.disabled = true;
    reserveButton.innerHTML = `<div class="loader"></div>`;

    const seatsToReserve = selectedSeats.map(id => {
        const seat = seatingLayout.find(s => s.id === id);
        return { id: seat.id, row: seat.row, number: seat.number };
    });

    try {
        const reservationsRef = collection(db, "movies", currentMovie.id, "reservations");
        await addDoc(reservationsRef, {
            name: name,
            seats: seatsToReserve,
            // FIX 3: Use serverTimestamp() for all new reservations for reliability.
            timestamp: serverTimestamp()
        });
        successModal.classList.remove('hidden');
    } catch (error) {
        console.error("Error submitting reservation:", error);
        alert("There was an error saving your reservation.");
        reserveButton.disabled = false;
        reserveButton.innerHTML = 'Reserve Seats';
    }
}

// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', initializePage);
reserverNameInput.addEventListener('input', updateReservationButton);
reserveButton.addEventListener('click', () => {
    if (!reserveButton.classList.contains('disabled')) {
        handleReservationClick();
    }
});
confirmContinueButton.addEventListener('click', () => {
    premiumFullModal.classList.add('hidden');
    submitReservation();
});
cancelContinueButton.addEventListener('click', () => {
    premiumFullModal.classList.add('hidden');
});