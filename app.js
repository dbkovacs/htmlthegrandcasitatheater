/*
    Folder: /
    File: app.js
    Extension: .js
*/

import { db } from './firebase-config.js';
import { collection, doc, getDoc, query, where, getDocs, orderBy, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// --- DOM Element References ---
const mainContent = document.getElementById('main-content');
const comingSoonContainer = document.getElementById('coming-soon-container');
const historyContainer = document.getElementById('history-container');
const timestampContainer = document.getElementById('build-timestamp');

/**
 * Safely parses a date string in YYYY-MM-DD format.
 * @param {string} dateString The date string to parse.
 * @returns {Date|null} A valid Date object or null if the string is invalid.
 */
function safeParseDate(dateString) {
    if (!dateString || typeof dateString !== 'string') return null;
    const date = new Date(dateString + 'T00:00:00');
    return isNaN(date.getTime()) ? null : date;
}

// --- Main Function ---
async function loadAndDisplayMovies() {
    try {
        const moviesRef = collection(db, 'movies');
        const q = query(moviesRef, where("status", "==", "Approved"), orderBy("showDate", "asc"));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            mainContent.innerHTML = '<p class="text-center p-8">No movies found.</p>';
            return;
        }

        const allMovies = [];
        querySnapshot.forEach(doc => {
            const movieData = doc.data();
            const parsedDate = safeParseDate(movieData.showDate);
            if (parsedDate) {
                allMovies.push({ id: doc.id, ...movieData, parsedShowDate: parsedDate });
            } else {
                console.warn(`[Data Warning] Skipping movie: "${movieData.movieTitle || 'N/A'}" due to invalid showDate.`);
            }
        });

        if (allMovies.length === 0) {
            mainContent.innerHTML = '<p class="text-center p-8">No valid movie screenings found.</p>';
            return;
        }

        const now = new Date();
        now.setHours(0, 0, 0, 0);

        let currentMovie = allMovies.find(movie => movie.parsedShowDate >= now);
        if (!currentMovie) {
            currentMovie = allMovies[allMovies.length - 1]; 
        }
        
        if (currentMovie) {
            renderCurrentMovie(currentMovie);
            loadReservationsForCurrentMovie(currentMovie); 
            
            const currentIndex = allMovies.findIndex(movie => movie.id === currentMovie.id);
            const historyMovies = allMovies.slice(0, currentIndex);
            const comingSoonMovies = allMovies.slice(currentIndex + 1);
            
            renderHistory(historyMovies.reverse()); 
            renderComingSoon(comingSoonMovies);
        } else {
            mainContent.innerHTML = `<div class="p-8 text-center"><h2 class="text-3xl font-bold">No movie is currently scheduled.</h2></div>`;
        }

    } catch (error) {
        console.error("Error loading movies:", error);
        mainContent.innerHTML = `<div class="bg-red-900/50 border border-red-500 text-red-300 p-4 rounded-lg text-center"><strong>Error loading movie data.</strong></div>`;
    } finally {
        if (timestampContainer) {
            timestampContainer.textContent = `Page loaded: ${new Date().toLocaleString()}`;
        }
    }
}

// --- Real-time Reservation Handling ---
let unsubscribeReservations = null;

function loadReservationsForCurrentMovie(movie) {
    if (unsubscribeReservations) unsubscribeReservations();

    const reservationsRef = collection(db, 'movies', movie.id, 'reservations');
    const q = query(reservationsRef, orderBy("timestamp", "asc"));
    unsubscribeReservations = onSnapshot(q, (snapshot) => {
        const reservations = snapshot.docs.map(doc => doc.data());
        renderGuestList(reservations);
        checkPremiumSeating(reservations);
    });
}

function renderGuestList(reservations) {
    const container = document.getElementById('guest-list-container');
    if (!container) return;

    if (reservations.length === 0) {
        container.innerHTML = `<p class="text-gray-400 italic">Be the first to reserve a seat!</p>`;
        return;
    }

    const guestNames = reservations.map(r => r.name).join(', ');
    container.innerHTML = `<p><span class="font-semibold text-brand-gold">Guests:</span> ${guestNames}</p>`;
}

async function checkPremiumSeating(reservations) {
    const sashBannerContainer = document.getElementById('sash-banner-container');
    if (!sashBannerContainer) return;

    try {
        const layoutDoc = await getDoc(doc(db, "layouts", "default"));
        if (!layoutDoc.exists()) return;
        
        const allSeats = layoutDoc.data().seats;
        const premiumSeatIds = allSeats.filter(s => s.isPremium).map(s => s.id);
        if(premiumSeatIds.length === 0) return;

        const reservedSeatIds = reservations.flatMap(r => r.seats.map(s => s.id));
        const allPremiumReserved = premiumSeatIds.every(id => reservedSeatIds.includes(id));

        sashBannerContainer.classList.toggle('hidden', !allPremiumReserved);
    } catch (error) {
        console.error("Error checking premium seating:", error);
    }
}


// --- Main Render Functions ---
function renderCurrentMovie(movie) {
    const invitationDetails = document.getElementById('invitation-details');
    if (invitationDetails && !document.getElementById('guest-list-container')) {
        const audienceSection = document.getElementById('audience-section');
        audienceSection.insertAdjacentHTML('afterend', `
            <div id="guest-list-container" class="mt-6 text-center text-gray-300 min-h-[24px]">
                <div class="loader-small mx-auto"></div>
            </div>
        `);
    }

    document.getElementById('inviter-name').textContent = movie.hostName || 'The Grand Casita Theater';
    document.getElementById('inviter-comment').textContent = movie.greeting || `Invites you to a screening of:`;
    document.getElementById('movie-title').textContent = movie.movieTitle;
    document.getElementById('movie-poster').src = movie.posterURL;
    document.getElementById('movie-tagline').textContent = movie.movieTagline || '';
    
    document.getElementById('event-date-display').textContent = movie.parsedShowDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
    document.getElementById('event-time-display').innerHTML = movie.eventTimeDisplay || 'Doors Open at 6:00 PM<br>Movie Starts 6:30 PM';
    document.getElementById('location-address').textContent = movie.locationAddress || '2392 Old Rosebud Ln, South Jordan, UT 84095';
    document.getElementById('google-maps-link').href = `https://maps.google.com/?q=${encodeURIComponent(movie.locationAddress || '2392 Old Rosebud Ln, South Jordan, UT 84095')}`;
    
    const audienceSection = document.getElementById('audience-section');
    audienceSection.innerHTML = `
        <span id="audience-label" class="font-cinzel text-brand-gold text-xl font-bold">${movie.isAdultsOnly ? "Adults Only" : "Kids Welcome"}</span>
        <p id="audience-message" class="text-gray-300 mt-1 text-sm h-4">${movie.isAdultsOnly ? "This screening is for adults only (21+)." : "This is a family-friendly screening."}</p>
    `;
    audienceSection.className = `my-4 text-center p-3 rounded-lg border-2 ${movie.isAdultsOnly ? 'bg-red-900/30 border-red-500/50' : 'border-transparent'}`;

    const now = new Date();
    const reservationDeadline = new Date(movie.parsedShowDate);
    reservationDeadline.setUTCHours(18, 0, 0, 0);

    const actionsContainer = document.getElementById('actions-container');
    const reservationsClosedContainer = document.getElementById('reservations-closed-container');
    const existingCountdown = document.getElementById('countdown-container');
    if(existingCountdown) existingCountdown.remove();
    
    if (now > reservationDeadline) {
        actionsContainer.style.display = 'none';
        reservationsClosedContainer.style.display = 'block';
    } else {
        actionsContainer.style.display = 'grid';
        reservationsClosedContainer.style.display = 'none';

        actionsContainer.innerHTML = `
            <div class="flex"><button id="trailer-link" class="btn-velvet w-full">Watch Trailer</button></div>
            <div class="flex gap-2">
                <a href="reservations.html?movieId=${movie.id}" id="reserve-seat-button" class="btn-velvet w-1/2">Reserve Seat</a>
                <a href="swigdrinkorder.html" class="btn-velvet w-1/2">Order a Drink</a>
            </div>
            <div class="flex gap-2">
                <a href="history.html" class="btn-velvet w-1/2 leading-tight">Coming Soon<br>History</a>
                <a href="signups.html" class="btn-velvet w-1/2">Pick a Movie</a>
            </div>
            <div class="flex"><a href="products.html" class="btn-velvet w-full">Products</a></div>
        `;

        const countdownContainerHTML = `<div id="countdown-container" class="my-6 text-center"><p class="font-cinzel text-yellow-300/80 text-sm uppercase">Reservation Deadline</p><div id="countdown-timer" class="text-2xl font-mono mt-1"></div></div>`;
        actionsContainer.insertAdjacentHTML('beforebegin', countdownContainerHTML);
        
        const countdownElement = document.getElementById('countdown-timer');
        const countdownInterval = setInterval(() => {
            const timeDifference = reservationDeadline - new Date();
            if (timeDifference <= 0) {
                clearInterval(countdownInterval);
                window.location.reload();
            } else {
                const d = Math.floor(timeDifference / 86400000);
                const h = Math.floor((timeDifference % 86400000) / 3600000);
                const m = Math.floor((timeDifference % 3600000) / 60000);
                const s = Math.floor((timeDifference % 60000) / 1000);
                countdownElement.innerHTML = `${d}d : ${String(h).padStart(2, '0')}h : ${String(m).padStart(2, '0')}m : ${String(s).padStart(2, '0')}s`;
            }
        }, 1000);
    }
    
    const trailerLink = document.getElementById('trailer-link');
    if (trailerLink && movie.trailerLink) {
        trailerLink.addEventListener('click', (e) => {
            e.preventDefault();
            document.getElementById('youtube-player').src = movie.trailerLink.replace("watch?v=", "embed/") + '?autoplay=1';
            document.getElementById('trailer-modal').classList.remove('hidden');
        });
    }

    const reserveSeatButton = document.getElementById('reserve-seat-button');
    if (reserveSeatButton && movie.isAdultsOnly) {
        reserveSeatButton.addEventListener('click', (e) => {
            e.preventDefault();
            document.getElementById('adults-only-modal').classList.remove('hidden');
        });
        document.getElementById('confirm-age-button').onclick = () => { window.location.href = `reservations.html?movieId=${movie.id}`; };
        document.getElementById('cancel-age-button').onclick = () => { document.getElementById('adults-only-modal').classList.add('hidden'); };
    }
}

function renderComingSoon(movies) {
    document.getElementById('coming-soon-section').style.display = movies.length > 0 ? 'block' : 'none';
    comingSoonContainer.innerHTML = movies.map(movie => `
        <div class="bg-brand-card rounded-lg overflow-hidden shadow-lg">
            <img src="${movie.posterURL}" alt="${movie.movieTitle}" class="w-full h-auto object-cover aspect-[2/3]">
            <div class="p-2 text-center">
                <h3 class="text-sm font-bold font-cinzel">${movie.movieTitle}</h3>
                <p class="text-xs text-gray-400">${movie.parsedShowDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}</p>
            </div>
        </div>
    `).join('');
}

function renderHistory(movies) {
    document.getElementById('history-section').style.display = movies.length > 0 ? 'block' : 'none';
    historyContainer.innerHTML = movies.map((movie, index) => `
        <div class="flex flex-col md:flex-row ${index % 2 !== 0 ? 'md:flex-row-reverse' : ''} bg-brand-card rounded-lg overflow-hidden shadow-lg items-center">
            <div class="md:w-1/4 w-1/2"><img src="${movie.posterURL}" alt="${movie.movieTitle}" class="w-full h-auto object-cover"></div>
            <div class="p-4 md:w-3/4">
                <h3 class="text-xl font-bold font-cinzel">${movie.movieTitle}</h3>
                <p class="text-sm text-gray-300">Hosted by: ${movie.hostName}</p>
                <p class="text-sm text-gray-400">Screened on: ${movie.parsedShowDate.toLocaleDateString('en-US', { timeZone: 'UTC' })}</p>
            </div>
        </div>`).join('');
}

// --- Initializer ---
document.addEventListener('DOMContentLoaded', () => {
    loadAndDisplayMovies();
    const trailerModal = document.getElementById('trailer-modal');
    if (trailerModal) {
        const closeTrailer = () => {
            trailerModal.classList.add('hidden');
            document.getElementById('youtube-player').src = '';
        };
        document.getElementById('close-trailer-modal').addEventListener('click', closeTrailer);
        trailerModal.addEventListener('click', (e) => { if (e.target === trailerModal) closeTrailer(); });
    }
});

