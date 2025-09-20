/*
    Folder: /
    File: reservations.js
    Extension: .js
*/

import { db } from './firebase-config.js';
import { collection, doc, getDoc, getDocs, addDoc, query, orderBy, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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

// --- State ---
let currentMovie = null;
let seatingLayout = [];
let reservations = [];
let selectedSeats = [];
let unsubscribeReservations = null; // To detach the real-time listener

// --- Main Initialization ---
async function initializePage() {
    try {
        const urlParams = new URLSearchParams(window.location.search);
        const movieId = urlParams.get('movieId');

        if (!movieId) {
            handleFatalError("No movie specified. Please return to the main page and select a movie.");
            return;
        }

        const movieDoc = await getDoc(doc(db, "movies", movieId));
        if (!movieDoc.exists()) {
            handleFatalError("The specified movie could not be found.");
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
        handleFatalError("Could not load reservation data. Please try again later.");
    }
}

function handleFatalError(message) {
    loadingOverlay.innerHTML = `<p class="text-red-400 font-cinzel text-xl text-center">${message}</p><a href="index.html" class="btn-velvet mt-4">Return to Main Page</a>`;
}

// --- Data Fetching ---
async function fetchSeatingLayout() {
    const layoutDoc = await getDoc(doc(db, "layouts", "default"));
    if (layoutDoc.exists()) {
        seatingLayout = layoutDoc.data().seats;
    } else {
        throw new Error("Default seating layout not found in the database. Please run the setup script.");
    }
}

function setupRealtimeReservationsListener() {
    if (unsubscribeReservations) unsubscribeReservations(); // Detach any old listener

    const reservationsRef = collection(db, "movies", currentMovie.id, "reservations");
    const q = query(reservationsRef, orderBy("timestamp", "asc"));
    
    unsubscribeReservations = onSnapshot(q, (snapshot) => {
        reservations = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderAll();
    }, (error) => {
        console.error("Error listening to reservations:", error);
        handleFatalError("Lost connection to the reservation server.");
    });
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
    
    const rows = [...new Set(seatingLayout.map(s => s.row))]; // ['A', 'B', 'C', 'D']
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
        reservationsListContainer.innerHTML = `<p class="text-gray-400 italic">No one has reserved a seat yet. Be the first!</p>`;
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


// --- UI Interaction ---
function handleSeatClick(seatId) {
    if (selectedSeats.includes(seatId)) {
        selectedSeats = selectedSeats.filter(id => id !== seatId);
    } else {
        selectedSeats.push(seatId);
    }
    updateSelectedSeatsDisplay();
    renderSeatingChart(); // Re-render to show selection change
}

function updateSelectedSeatsDisplay() {
    selectedSeatsCount.textContent = selectedSeats.length;
    if (selectedSeats.length > 0) {
        const seatNames = selectedSeats.map(id => {
            const seat = seatingLayout.find(s => s.id === id);
            return seat ? `${seat.row}${seat.number}` : '';
        }).join(', ');
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
async function handleReservationSubmit() {
    const name = reserverNameInput.value.trim();
    if (!name || selectedSeats.length === 0) {
        alert("Please enter your name and select at least one seat.");
        return;
    }

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
            timestamp: new Date()
        });

        successModal.classList.remove('hidden');

    } catch (error) {
        console.error("Error submitting reservation:", error);
        alert("There was an error saving your reservation. Please try again.");
        reserveButton.disabled = false;
        reserveButton.innerHTML = 'Reserve Seats';
    }
}


// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', initializePage);
reserverNameInput.addEventListener('input', updateReservationButton);
reserveButton.addEventListener('click', () => {
    if (!reserveButton.classList.contains('disabled')) {
        handleReservationSubmit();
    }
});
