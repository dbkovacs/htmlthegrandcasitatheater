/*
    Folder: /
    File: app.js
    Extension: .js
*/

import { db } from './firebase-config.js';
import { collection, query, where, getDocs, orderBy } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// --- DOM Element References ---
const mainContent = document.getElementById('main-content');
const comingSoonContainer = document.getElementById('coming-soon-container');
const historyContainer = document.getElementById('history-container');
const timestampContainer = document.getElementById('build-timestamp');

// --- Main Function to Load and Display Movies ---
async function loadAndDisplayMovies() {
    try {
        const moviesRef = collection(db, 'movies');
        const q = query(moviesRef, where("status", "==", "Approved"), orderBy("showDate", "desc"));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            mainContent.innerHTML = '<p class="text-center p-8">No movies found. Check back soon!</p>';
            return;
        }

        const allMovies = [];
        querySnapshot.forEach(doc => allMovies.push({ id: doc.id, ...doc.data() }));

        const now = new Date();
        let nextCutoff = new Date(now);
        nextCutoff.setHours(1, 0, 0, 0);
        const dayOfWeek = nextCutoff.getDay();
        const daysUntilFriday = (5 - dayOfWeek + 7) % 7;
        nextCutoff.setDate(now.getDate() + daysUntilFriday);

        let currentMovie = allMovies.find(movie => new Date(movie.showDate + 'T00:00:00') < nextCutoff) || null;

        if (currentMovie) {
            renderCurrentMovie(currentMovie);
            const comingSoonMovies = allMovies.filter(movie => new Date(movie.showDate + 'T00:00:00') > new Date(currentMovie.showDate + 'T00:00:00'));
            const historyMovies = allMovies.filter(movie => movie.id !== currentMovie.id && new Date(movie.showDate + 'T00:00:00') < new Date(currentMovie.showDate + 'T00:00:00'));
            renderComingSoon(comingSoonMovies.reverse());
            renderHistory(historyMovies);
        } else {
            mainContent.innerHTML = `<div class="p-8 text-center"><h2 class="text-3xl font-bold">No movie scheduled for this week. See what's coming soon!</h2></div>`;
            const futureMovies = allMovies.filter(movie => new Date(movie.showDate + 'T00:00:00') > now);
            renderComingSoon(futureMovies.reverse());
            renderHistory([]); // No history if there's no current movie
        }

    } catch (error) {
        console.error("Error loading movies:", error);
        mainContent.innerHTML = '<p>Error loading movie data. Please try again later.</p>';
    } finally {
        if (timestampContainer) {
            timestampContainer.textContent = `Page loaded: ${new Date().toLocaleString()}`;
        }
    }
}

// --- Render Functions ---
function renderCurrentMovie(movie) {
    // Populate main content
    document.getElementById('inviter-name').textContent = movie.hostName || 'The Grand Casita Theater';
    document.getElementById('inviter-comment').textContent = movie.greeting || `Invites you to a screening of:`;
    document.getElementById('movie-title').textContent = movie.movieTitle;
    document.getElementById('movie-poster').src = movie.posterURL;
    document.getElementById('movie-tagline').textContent = movie.movieTagline || '';
    
    // Populate event details
    const showDate = new Date(movie.showDate + 'T00:00:00');
    document.getElementById('event-date-display').textContent = showDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    document.getElementById('event-time-display').innerHTML = movie.eventTimeDisplay || 'Doors Open at 6:00 PM<br>Movie Starts 6:30 PM';
    document.getElementById('location-address').textContent = movie.locationAddress || '2392 Old Rosebud Ln, South Jordan, UT 84095';
    document.getElementById('google-maps-link').href = `https://maps.google.com/?q=${encodeURIComponent(movie.locationAddress || '2392 Old Rosebud Ln, South Jordan, UT 84095')}`;

    // Audience section logic
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

    // Reservation State Logic (Countdown Timer or Closed Message)
    const now = new Date();
    const reservationDeadline = new Date(showDate);
    reservationDeadline.setHours(12, 0, 0, 0); // Deadline is Noon on the day of the show

    const actionsContainer = document.getElementById('actions-container');
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
        const updateCountdown = () => {
            const timeDifference = reservationDeadline - new Date();
            if (timeDifference <= 0) {
                countdownElement.innerHTML = "Reservation Deadline Passed";
                clearInterval(countdownInterval);
                setTimeout(() => window.location.reload(), 2000);
                return;
            }
            const d = Math.floor(timeDifference / (1000 * 60 * 60 * 24));
            const h = Math.floor((timeDifference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const m = Math.floor((timeDifference % (1000 * 60 * 60)) / (1000 * 60));
            const s = Math.floor((timeDifference % (1000 * 60)) / 1000);
            countdownElement.innerHTML = `${d}d : ${String(h).padStart(2, '0')}h : ${String(m).padStart(2, '0')}m : ${String(s).padStart(2, '0')}s`;
        };
        const countdownInterval = setInterval(updateCountdown, 1000);
        updateCountdown();
    }

    // Modal Logic
    const trailerLink = document.getElementById('trailer-link');
    const trailerModal = document.getElementById('trailer-modal');
    const closeTrailerModal = document.getElementById('close-trailer-modal');
    const youtubePlayer = document.getElementById('youtube-player');
    const reserveSeatButton = document.getElementById('reserve-seat-button');
    const adultsOnlyModal = document.getElementById('adults-only-modal');
    const confirmAgeButton = document.getElementById('confirm-age-button');
    const cancelAgeButton = document.getElementById('cancel-age-button');

    if (trailerLink && movie.trailerLink) {
        trailerLink.addEventListener('click', (e) => {
            e.preventDefault();
            const embedUrl = movie.trailerLink.replace("watch?v=", "embed/") + '?autoplay=1';
            youtubePlayer.src = embedUrl;
            trailerModal.classList.remove('hidden');
        });
    }
    if (closeTrailerModal) {
        const hideTrailer = () => {
            trailerModal.classList.add('hidden');
            youtubePlayer.src = '';
        };
        closeTrailerModal.addEventListener('click', hideTrailer);
        trailerModal.addEventListener('click', (e) => { if (e.target === trailerModal) hideTrailer(); });
    }
    if (reserveSeatButton && movie.isAdultsOnly) {
        reserveSeatButton.addEventListener('click', (e) => {
            e.preventDefault();
            adultsOnlyModal.classList.remove('hidden');
        });
        confirmAgeButton.addEventListener('click', () => { window.location.href = 'reservations.html'; });
        cancelAgeButton.addEventListener('click', () => { adultsOnlyModal.classList.add('hidden'); });
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
                <p class="text-xs text-gray-400">${new Date(movie.showDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
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
                <p class="text-sm text-gray-400">Screened on: ${new Date(movie.showDate + 'T00:00:00').toLocaleDateString()}</p>
            </div>
        `;
        historyContainer.appendChild(movieCard);
    });
}

// --- Run on Page Load ---
document.addEventListener('DOMContentLoaded', loadAndDisplayMovies);

/*
    File: app.js
    Build Timestamp: 2025-09-18T14:45:00-06:00
*/