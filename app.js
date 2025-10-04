/*
 * Folder: /
 * File: app.js
 * Extension: .js
 */

import { db } from './firebase-config.js';
import { collection, query, where, getDocs, orderBy, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { VONNEGUT_JOKES } from './jokes.js';

// --- DOM References ---
const errorContainer = document.getElementById('error-container');
const errorMessage = document.getElementById('error-message');
const contentWrapper = document.getElementById('content-wrapper');
const mainContent = document.getElementById('main-content');
const buildTimestampElement = document.getElementById('build-timestamp');
const regularContent = document.getElementById('regular-content');
const temporaryContent = document.getElementById('temporary-content');


// Main Invitation Elements
const moviePoster = document.getElementById('movie-poster');
const inviterName = document.getElementById('inviter-name');
const inviterComment = document.getElementById('inviter-comment');
const movieTitle = document.getElementById('movie-title');
const movieTagline = document.getElementById('movie-tagline');
const eventDateDisplay = document.getElementById('event-date-display');
const eventTimeDoors = document.getElementById('event-time-doors');
const eventTimeMovie = document.getElementById('event-time-movie');
const actionsContainer = document.getElementById('actions-container');
const audienceSection = document.getElementById('audience-section');

// Sections
const comingSoonSection = document.getElementById('coming-soon-section');
const comingSoonContainer = document.getElementById('coming-soon-container');
const historySection = document.getElementById('history-section');
const historyContainer = document.getElementById('history-container');

// Modals
const trailerModal = document.getElementById('trailer-modal');
const closeTrailerModalBtn = document.getElementById('close-trailer-modal');
const youtubePlayer = document.getElementById('youtube-player');
const adultsOnlyModal = document.getElementById('adults-only-modal');
const confirmAgeButton = document.getElementById('confirm-age-button');
const cancelAgeButton = document.getElementById('cancel-age-button');
const bugReportModal = document.getElementById('bug-report-modal');
const bugReportResponse = document.getElementById('bug-report-response');
const openBugReportModalBtn = document.getElementById('bug-report-button');
const closeBugReportModalBtn = document.getElementById('close-bug-modal');

// --- Global Scope Function for Coming Soon Cards ---
window.playTrailer = function(trailerLink) {
    if (trailerLink && trailerLink !== 'null' && trailerLink !== 'undefined') {
        openTrailerModal(trailerLink);
    }
}

// --- Main Function ---
async function initializePage() {
    try {
        // First, check the homepage mode from Firestore
        const settingsRef = doc(db, 'settings', 'homepage');
        const settingsSnap = await getDoc(settingsRef);

        if (settingsSnap.exists() && settingsSnap.data().mode === 'temporary') {
            // Show temporary content and stop further processing
            regularContent.style.display = 'none';
            temporaryContent.style.display = 'block';
            contentWrapper.style.opacity = '1';
            return;
        }

        // If mode is 'regular' (or not set), proceed with normal movie loading
        regularContent.style.display = 'block';
        temporaryContent.style.display = 'none';

        // Fetch approved and pending movies concurrently
        const approvedQuery = query(collection(db, 'movies'), where("status", "==", "Approved"), orderBy("showDate", "asc"));
        const pendingQuery = query(collection(db, 'movies'), where("status", "==", "pending"), orderBy("submittedAt", "asc"));

        const [approvedSnapshot, pendingSnapshot] = await Promise.all([
            getDocs(approvedQuery),
            getDocs(pendingQuery)
        ]);

        const approvedMovies = approvedSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const pendingMovies = pendingSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        if (approvedMovies.length === 0 && pendingMovies.length === 0) {
            showError("No movies are currently scheduled or pending. Why not suggest one?");
            // Still show the coming soon section with the 'pick movie' card
            renderComingSoon([], []);
            return;
        }

        categorizeAndRenderMovies(approvedMovies, pendingMovies);

        contentWrapper.style.opacity = '1';

    } catch (error) {
        console.error("Error loading movie data:", error);
        if (error.code === 'failed-precondition' && error.message.includes('index')) {
            const urlMatch = error.message.match(/(https:\/\/console\.firebase\.google\.com\S+)/);
            if (urlMatch && urlMatch[0]) {
                const indexUrl = urlMatch[0];
                const friendlyMessage = `
                    <p class="font-bold mb-2 text-lg">Configuration Required: Database Index Missing</p>
                    <p class="text-sm">This is a one-time setup. The current query needs a composite index to work efficiently.</p>
                    <p class="text-sm mt-2">Click the button below to create it automatically in your Firebase console:</p>
                    <a href="${indexUrl}" target="_blank" class="inline-block mt-4 px-6 py-2 bg-yellow-500 text-black font-bold rounded-lg hover:bg-yellow-400 transition-colors">Create Index Now</a>
                `;
                showError(friendlyMessage);
            } else {
                showError("Firebase Error: A required database index is missing. Please check the developer console for the creation link.");
            }
        } else {
            showError("Error loading movie data. Please try again later.");
        }
    }
}


function categorizeAndRenderMovies(approvedMovies, pendingMovies) {
    let currentMovie = null;
    let upcomingMovies = [];
    let pastMovies = [];

    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const firstUpcomingIndex = approvedMovies.findIndex(movie => new Date(movie.showDate + 'T00:00:00') >= now);

    if (firstUpcomingIndex !== -1) {
        currentMovie = approvedMovies[firstUpcomingIndex];
        upcomingMovies = approvedMovies.slice(firstUpcomingIndex + 1);
        pastMovies = approvedMovies.slice(0, firstUpcomingIndex);
    } else if (approvedMovies.length > 0) {
        currentMovie = approvedMovies[approvedMovies.length - 1];
        pastMovies = approvedMovies.slice(0, approvedMovies.length - 1);
    }

    if (currentMovie) {
        renderCurrentMovie(currentMovie);
    } else {
        // If no current movie, but there are pending/upcoming, hide the main section
        mainContent.classList.add('hidden');
    }

    // Always render the coming soon section if there are upcoming or pending movies
    renderComingSoon(upcomingMovies, pendingMovies);

    if (pastMovies.length > 0) {
        renderHistory(pastMovies.reverse());
    }
}

// --- Render Functions ---

function renderCurrentMovie(movie) {
    mainContent.classList.remove('hidden');
    moviePoster.src = movie.posterURL || `https://placehold.co/600x900/1a0000/ffca28?text=${encodeURIComponent(movie.movieTitle)}`;
    moviePoster.alt = movie.movieTitle || 'Movie Poster';
    inviterName.textContent = movie.hostName || 'Your Host';
    inviterComment.textContent = movie.greeting || 'Enjoy the show!';
    movieTitle.textContent = movie.movieTitle || 'Movie Title';
    movieTagline.textContent = movie.movieTagline || '';

    const date = new Date(movie.showDate + 'T19:00:00');
    eventDateDisplay.textContent = date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    eventTimeDoors.textContent = "Doors Open 6:00pm";
    eventTimeMovie.textContent = "Movie Starts 6:30pm";


    if (movie.isAdultsOnly) {
        audienceSection.textContent = 'Adults Only (21+)';
        audienceSection.className = 'my-4 text-center p-3 rounded-lg border-2 border-red-500 text-red-400 bg-red-900/30';
    } else {
        audienceSection.textContent = 'All Ages Welcome';
        audienceSection.className = 'my-4 text-center p-3 rounded-lg border-2 border-green-500 text-green-300 bg-green-900/30';
    }

    actionsContainer.innerHTML = '';
    if (movie.trailerLink) {
        const trailerButton = document.createElement('button');
        trailerButton.className = 'btn-velvet primary w-full';
        trailerButton.textContent = 'Watch Trailer';
        trailerButton.onclick = () => openTrailerModal(movie.trailerLink);
        actionsContainer.appendChild(trailerButton);
    }

    const reserveButton = document.createElement('a');
    reserveButton.className = 'btn-velvet w-full text-center block';
    reserveButton.textContent = 'Reserve Your Seat';
    reserveButton.href = `reservations.html?movieId=${movie.id}`;

    if (movie.isAdultsOnly) {
        reserveButton.onclick = (e) => {
            e.preventDefault();
            adultsOnlyModal.classList.remove('hidden');
            confirmAgeButton.dataset.href = `reservations.html?movieId=${movie.id}`;
        };
    }
    actionsContainer.appendChild(reserveButton);
}

function renderComingSoon(upcomingMovies, pendingMovies) {
    comingSoonSection.classList.remove('hidden');

    const approvedHtml = upcomingMovies.map(movie => `
        <div 
            class="bg-brand-card p-3 rounded-lg shadow-lg border-2 border-yellow-300/10 text-center cursor-pointer hover:border-yellow-300/50 transition-colors"
            onclick="playTrailer('${movie.trailerLink}')"
            >
            <img src="${movie.posterURL || `https://placehold.co/600x900/1a0000/ffca28?text=${encodeURIComponent(movie.movieTitle)}`}" alt="${movie.movieTitle}" class="w-full h-auto rounded-md mb-3 aspect-[2/3] object-cover pointer-events-none">
            <h3 class="font-cinzel text-lg font-bold text-brand-gold truncate pointer-events-none">${movie.movieTitle}</h3>
            <p class="text-xs text-gray-400 pointer-events-none">${new Date(movie.showDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}</p>
        </div>
    `).join('');

    const pendingHtml = pendingMovies.map(movie => `
        <div class="bg-black/30 p-3 rounded-lg shadow-lg border-2 border-dashed border-gray-500/30 text-center opacity-70">
            <div class="w-full aspect-[2/3] rounded-md bg-black/30 flex overflow-hidden">
                
                <div class="w-11 flex-shrink-0 bg-gradient-to-b from-yellow-400 to-amber-500 flex items-center justify-center p-2 shadow-inner overflow-hidden">
                    <h3 class="font-cinzel text-lg font-bold text-gray-800 [writing-mode:vertical-rl] transform rotate-180 whitespace-nowrap tracking-wider" style="text-shadow: 0 1px 1px rgba(255,255,255,0.2);">
                        ${movie.movieTitle}
                    </h3>
                </div>

                <div class="flex-1 flex flex-col justify-between items-center p-4 text-center">
                    <div class="flex flex-col items-center justify-center">
                        <svg class="w-10 h-10 text-yellow-300/80 animate-pulse" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0h18M12 12.75h.008v.008H12v-.008z" />
                        </svg>
                        <p class="text-sm font-bold text-yellow-300/80 mt-2">Pending Scheduling</p>
                    </div>
                    <div>
                        <p class="text-xs text-gray-400">Submitted by</p>
                        <p class="text-base text-gray-300 font-semibold">${movie.hostName}</p>
                    </div>
                </div>
            </div>
        </div>
    `).join('');

    const pickMovieHtml = `
        <a href="signups.html" class="bg-brand-card p-3 rounded-lg shadow-lg border-2 border-yellow-300/10 text-center hover:border-yellow-300/50 transition-colors flex flex-col items-center justify-center aspect-[2/3]">
            <div class="flex flex-col items-center justify-center text-center p-4 border-4 border-dashed border-yellow-300/20 rounded-lg h-full w-full hover:border-yellow-300/50 transition-colors">
                 <svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12 text-yellow-300/50 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                <h3 class="font-cinzel text-lg font-bold text-brand-gold">Pick A Movie</h3>
                <p class="text-xs text-gray-400 mt-1">Have a suggestion? <br>Submit it here!</p>
            </div>
        </a>
    `;

    comingSoonContainer.innerHTML = approvedHtml + pendingHtml + pickMovieHtml;
}

function renderHistory(movies) {
    historySection.classList.remove('hidden');
    historyContainer.innerHTML = movies.map(movie => `
        <div class="bg-black/30 p-3 rounded-lg shadow-lg border-2 border-gray-500/10 text-center opacity-70 hover:opacity-100 transition-opacity">
            <img src="${movie.posterURL || `https://placehold.co/600x900/1a0000/ffca28?text=${encodeURIComponent(movie.movieTitle)}`}" alt="${movie.movieTitle}" class="w-full h-auto rounded-md mb-3 aspect-[2/3] object-cover">
            <h3 class="font-cinzel text-lg font-bold text-gray-400 truncate">${movie.movieTitle}</h3>
            <p class="text-xs text-gray-500">${new Date(movie.showDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
        </div>
    `).join('');
}

function showError(msg) {
    errorMessage.innerHTML = msg;
    errorContainer.classList.remove('hidden');
    contentWrapper.style.opacity = '1'; // Show content wrapper even on error to display 'pick movie'
    mainContent.remove();
}

// --- Utility Functions ---
function getYoutubeVideoId(url) {
    if (!url) return null;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
}

// --- Event Handlers for Modals ---
function openTrailerModal(trailerLink) {
    const videoId = getYoutubeVideoId(trailerLink);
    if (videoId) {
        youtubePlayer.src = `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1`;
        trailerModal.classList.remove('hidden');
    } else {
        console.error("Could not extract a valid YouTube Video ID from the link:", trailerLink);
    }
}

function closeTrailer() {
    youtubePlayer.src = '';
    trailerModal.classList.add('hidden');
}

closeTrailerModalBtn.addEventListener('click', closeTrailer);
trailerModal.addEventListener('click', (e) => {
    if (e.target === trailerModal) {
        closeTrailer();
    }
});

confirmAgeButton.addEventListener('click', () => {
    window.location.href = confirmAgeButton.dataset.href;
});

cancelAgeButton.addEventListener('click', () => {
    adultsOnlyModal.classList.add('hidden');
});

// --- Event Handlers for Bug Report Modal ---
openBugReportModalBtn.addEventListener('click', () => {
    const randomIndex = Math.floor(Math.random() * VONNEGUT_JOKES.length);
    bugReportResponse.textContent = VONNEGUT_JOKES[randomIndex];
    bugReportModal.classList.remove('hidden');
});

function closeBugModal() {
    bugReportModal.classList.add('hidden');
}

closeBugReportModalBtn.addEventListener('click', closeBugModal);
bugReportModal.addEventListener('click', (e) => {
    if (e.target === bugReportModal) {
        closeBugModal();
    }
});

// --- Initialization ---
function setBuildTimestamp() {
    const buildDate = new Date();
    const options = {
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZoneName: 'short'
    };
    if (buildTimestampElement) {
        buildTimestampElement.textContent = `Build: ${buildDate.toLocaleString(undefined, options)}`;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    setBuildTimestamp();
    initializePage();
});

/*
 * Build Timestamp: 9/22/2025, 3:13:58 PM MDT
 */