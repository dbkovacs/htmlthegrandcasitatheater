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

// --- Main Function to Load and Display Movies ---
async function loadAndDisplayMovies() {
    try {
        const moviesRef = collection(db, 'movies');
        const q = query(moviesRef, where("status", "==", "Approved"), orderBy("showDate", "asc"));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            mainContent.innerHTML = '<p class="text-center p-8">No movies found. Check back soon!</p>';
            return;
        }

        const allMovies = [];
        querySnapshot.forEach(doc => {
            const movieData = doc.data();
            const parsedDate = safeParseDate(movieData.showDate);
            if (parsedDate) {
                allMovies.push({ id: doc.id, ...movieData, parsedShowDate: parsedDate });
            } else {
                console.warn(`[Data Quality Warning] Skipping movie: "${movieData.movieTitle || 'N/A'}". Invalid showDate.`);
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
            // Asynchronously load reservations and update the UI
            loadReservationsForCurrentMovie(currentMovie); 
            renderCurrentMovie(currentMovie);
            
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

// --- NEW: Functions to handle reservation data on the main page ---
let unsubscribeReservations = null;

function loadReservationsForCurrentMovie(movie) {
    if (unsubscribeReservations) {
        unsubscribeReservations(); // Stop listening to old movie's reservations
    }
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
    const premiumSeatsFullBanner = document.getElementById('premium-seats-full-banner');
    if (!premiumSeatsFullBanner) return;

    const layoutDoc = await getDoc(doc(db, "layouts", "default"));
    if (!layoutDoc.exists()) return;
    
    const allSeats = layoutDoc.data().seats;
    const premiumSeatIds = allSeats.filter(s => s.isPremium).map(s => s.id);
    const reservedSeatIds = reservations.flatMap(r => r.seats.map(s => s.id));

    const allPremiumReserved = premiumSeatIds.every(id => reservedSeatIds.includes(id));

    if (allPremiumReserved) {
        premiumSeatsFullBanner.classList.remove('hidden');
    } else {
        premiumSeatsFullBanner.classList.add('hidden');
    }
}


// --- Render Functions ---
function renderCurrentMovie(movie) {
    const posterContainer = document.getElementById('poster-container');
    if (posterContainer && !document.getElementById('premium-seats-full-banner')) {
        posterContainer.insertAdjacentHTML('beforeend', `
            <div id="premium-seats-full-banner" class="absolute inset-0 bg-black/70 flex items-center justify-center hidden">
                <p class="text-2xl font-black text-white text-center transform -rotate-12 border-4 border-white p-4 font-cinzel">PREMIUM SEATING<br>FULL</p>
            </div>
        `);
    }

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
    
    const reserveSeatButton = document.getElementById('reserve-seat-button');
    if(reserveSeatButton) {
        reserveSeatButton.href = `reservations.html?movieId=${movie.id}`;
    }

    const audienceSection = document.getElementById('audience-section');
    if (movie.isAdultsOnly) {
        document.getElementById('audience-label').textContent = "Adults Only";
        document.getElementById('audience-message').textContent = "This screening is for adults only (21+).";
        audienceSection.classList.add('bg-red-900/30', 'border-red-500/50');
    } else {
        document.getElementById('audience-label').textContent = "Kids Welcome";
        document.getElementById('audience-message').textContent = "This is a family-friendly screening.";
        audienceSection.classList.remove('bg-red-900/30', 'border-red-500/50');
    }
    
    const now = new Date();
    const reservationDeadline = new Date(movie.parsedShowDate);
    reservationDeadline.setUTCHours(18, 0, 0, 0); 

    const actionsContainer = document.getElementById('actions-container');
    const existingCountdown = document.getElementById('countdown-container');
    if (existingCountdown) existingCountdown.remove();

    if (now > reservationDeadline) {
        actionsContainer.innerHTML = `
            <div class="bg-black/30 p-4 rounded-lg border-l-4 border-yellow-300/50 text-center">
                <h3 class="text-2xl font-bold mb-2 text-shadow font-cinzel text-brand-gold">Reservations Closed</h3>
                <p class="text-gray-300">The deadline to reserve a seat has passed.</p>
            </div>`;
    } else {
        const countdownContainerHTML = `
            <div id="countdown-container" class="my-6 text-center">
                <p class="font-cinzel text-yellow-300/80 text-sm uppercase tracking-widest">Reservation Deadline</p>
                <div id="countdown-timer" class="text-2xl font-mono text-white mt-1"></div>
            </div>`;
        actionsContainer.insertAdjacentHTML('beforebegin', countdownContainerHTML);
        
        const countdownElement = document.getElementById('countdown-timer');
        const countdownInterval = setInterval(() => {
            const timeDifference = reservationDeadline - new Date();
            if (timeDifference <= 0) {
                countdownElement.innerHTML = "Reservation Deadline Passed";
                clearInterval(countdownInterval);
                setTimeout(() => window.location.reload(), 2000);
            } else {
                const d = Math.floor(timeDifference / (1000 * 60 * 60 * 24));
                const h = Math.floor((timeDifference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                const m = Math.floor((timeDifference % (1000 * 60 * 60)) / (1000 * 60));
                const s = Math.floor((timeDifference % (1000 * 60)) / 1000);
                countdownElement.innerHTML = `${d}d : ${String(h).padStart(2, '0')}h : ${String(m).padStart(2, '0')}m : ${String(s).padStart(2, '0')}s`;
            }
        }, 1000);
    }
    
    const trailerLink = document.getElementById('trailer-link');
    const adultsOnlyModal = document.getElementById('adults-only-modal');

    if (trailerLink && movie.trailerLink) {
        trailerLink.addEventListener('click', (e) => {
            e.preventDefault();
            document.getElementById('youtube-player').src = movie.trailerLink.replace("watch?v=", "embed/") + '?autoplay=1';
            document.getElementById('trailer-modal').classList.remove('hidden');
        });
    }

    if (reserveSeatButton && movie.isAdultsOnly) {
        reserveSeatButton.addEventListener('click', (e) => {
            e.preventDefault();
            adultsOnlyModal.classList.remove('hidden');
        });
        document.getElementById('confirm-age-button').addEventListener('click', () => { window.location.href = `reservations.html?movieId=${movie.id}`; });
        document.getElementById('cancel-age-button').addEventListener('click', () => { adultsOnlyModal.classList.add('hidden'); });
    }
}

function renderComingSoon(movies) {
    if (!comingSoonContainer || !document.getElementById('coming-soon-section')) return;
    if (movies.length === 0) {
        document.getElementById('coming-soon-section').style.display = 'none';
        return;
    }
    document.getElementById('coming-soon-section').style.display = 'block';
    comingSoonContainer.innerHTML = '';
    movies.forEach(movie => {
        const movieCard = document.createElement('div');
        movieCard.className = 'bg-brand-card rounded-lg overflow-hidden shadow-lg';
        movieCard.innerHTML = `
            <img src="${movie.posterURL}" alt="${movie.movieTitle}" class="w-full h-auto object-cover aspect-[2/3]">
            <div class="p-2 text-center">
                <h3 class="text-sm font-bold font-cinzel">${movie.movieTitle}</h3>
                <p class="text-xs text-gray-400">${movie.parsedShowDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}</p>
            </div>
        `;
        comingSoonContainer.appendChild(movieCard);
    });
}

function renderHistory(movies) {
    if (!historyContainer || !document.getElementById('history-section')) return;
     if (movies.length === 0) {
        document.getElementById('history-section').style.display = 'none';
        return;
    }
    document.getElementById('history-section').style.display = 'block';
    historyContainer.innerHTML = '';
    movies.forEach((movie, index) => {
        const movieCard = document.createElement('div');
        const isReversed = index % 2 !== 0;
        movieCard.className = `flex flex-col md:flex-row ${isReversed ? 'md:flex-row-reverse' : ''} bg-brand-card rounded-lg overflow-hidden shadow-lg items-center`;
        movieCard.innerHTML = `
            <div class="md:w-1/4 w-1/2">
                <img src="${movie.posterURL}" alt="${movie.movieTitle}" class="w-full h-auto object-cover">
            </div>
            <div class="p-4 md:w-3/4">
                <h3 class="text-xl font-bold font-cinzel">${movie.movieTitle}</h3>
                <p class="text-sm text-gray-300">Hosted by: ${movie.hostName}</p>
                <p class="text-sm text-gray-400">Screened on: ${movie.parsedShowDate.toLocaleDateString('en-US', { timeZone: 'UTC' })}</p>
            </div>
        `;
        historyContainer.appendChild(movieCard);
    });
}

// --- Run on Page Load ---
document.addEventListener('DOMContentLoaded', () => {
    loadAndDisplayMovies();
    // Close trailer modal logic
    const trailerModal = document.getElementById('trailer-modal');
    if (trailerModal) {
        document.getElementById('close-trailer-modal').addEventListener('click', () => {
            trailerModal.classList.add('hidden');
            document.getElementById('youtube-player').src = '';
        });
        trailerModal.addEventListener('click', (e) => { 
            if (e.target === trailerModal) {
                trailerModal.classList.add('hidden');
                document.getElementById('youtube-player').src = '';
            }
        });
    }
});

/*
    File: app.js
    Build Timestamp: 2025-09-19T21:00:00-06:00
*/

