/*
    Folder: /
    File: app.js
    Extension: .js
*/

import { db } from './firebase-config.js';
import { collection, query, where, getDocs, orderBy } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// --- DOM References ---
const errorContainer = document.getElementById('error-container');
const errorMessage = document.getElementById('error-message');
const contentWrapper = document.getElementById('content-wrapper');
const mainContent = document.getElementById('main-content');

// Main Invitation Elements
const moviePoster = document.getElementById('movie-poster');
const inviterName = document.getElementById('inviter-name');
const inviterComment = document.getElementById('inviter-comment');
const movieTitle = document.getElementById('movie-title');
const movieTagline = document.getElementById('movie-tagline');
const eventDateDisplay = document.getElementById('event-date-display');
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

// --- Main Function ---
async function initializePage() {
    try {
        const q = query(collection(db, 'movies'), where("status", "==", "Approved"), orderBy("showDate", "asc"));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            showError("No movies are currently scheduled. Please check back soon!");
            return;
        }

        const allMovies = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        categorizeAndRenderMovies(allMovies);

        contentWrapper.style.opacity = '1';

    } catch (error) {
        console.error("Error loading movie data:", error); // Keep logging the full error for debugging

        // NEW: Check if this is the specific "missing index" error
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
                // Fallback if the URL can't be extracted
                showError("Firebase Error: A required database index is missing. Please check the developer console for the creation link.");
            }
        } else {
            // Handle all other types of errors generically
            showError("Error loading movie data. Please try again later.");
        }
    }
}

function categorizeAndRenderMovies(allMovies) {
    let currentMovie = null;
    let upcomingMovies = [];
    let pastMovies = [];

    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const firstUpcomingIndex = allMovies.findIndex(movie => new Date(movie.showDate + 'T00:00:00') >= now);

    if (firstUpcomingIndex !== -1) {
        // We have at least one upcoming movie
        currentMovie = allMovies[firstUpcomingIndex];
        upcomingMovies = allMovies.slice(firstUpcomingIndex + 1);
        pastMovies = allMovies.slice(0, firstUpcomingIndex);
    } else if (allMovies.length > 0) {
        // All movies are in the past, show the most recent one as "current"
        currentMovie = allMovies[allMovies.length - 1];
        pastMovies = allMovies.slice(0, allMovies.length - 1);
    }
    
    if (currentMovie) {
        renderCurrentMovie(currentMovie);
    }
    if (upcomingMovies.length > 0) {
        renderComingSoon(upcomingMovies);
    }
    if (pastMovies.length > 0) {
        // Reverse to show most recent past movies first
        renderHistory(pastMovies.reverse());
    }
}

// --- Render Functions ---

function renderCurrentMovie(movie) {
    mainContent.classList.remove('hidden');
    moviePoster.src = movie.posterURL || 'path/to/default/poster.jpg';
    moviePoster.alt = movie.movieTitle || 'Movie Poster';
    inviterName.textContent = movie.hostName || 'Your Host';
    inviterComment.textContent = movie.greeting || 'Enjoy the show!';
    movieTitle.textContent = movie.movieTitle || 'Movie Title';
    movieTagline.textContent = movie.movieTagline || '';

    // Format date nicely
    const date = new Date(movie.showDate + 'T19:00:00'); // Assuming 7 PM showtime
    eventDateDisplay.textContent = date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    
    // Set audience rating
    if (movie.isAdultsOnly) {
        audienceSection.textContent = 'Adults Only (21+)';
        audienceSection.className = 'my-4 text-center p-3 rounded-lg border-2 border-red-500 text-red-400 bg-red-900/30';
    } else {
        audienceSection.textContent = 'All Ages Welcome';
        audienceSection.className = 'my-4 text-center p-3 rounded-lg border-2 border-green-500 text-green-300 bg-green-900/30';
    }

    // Clear and add action buttons
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
            // Store the destination URL to use after confirmation
            confirmAgeButton.dataset.href = `reservations.html?movieId=${movie.id}`;
        };
    }
    actionsContainer.appendChild(reserveButton);
}

function renderComingSoon(movies) {
    comingSoonSection.classList.remove('hidden');
    comingSoonContainer.innerHTML = movies.map(movie => `
        <div class="bg-brand-card p-3 rounded-lg shadow-lg border-2 border-yellow-300/10 text-center">
            <img src="${movie.posterURL}" alt="${movie.movieTitle}" class="w-full h-auto rounded-md mb-3 aspect-[2/3] object-cover">
            <h3 class="font-cinzel text-lg font-bold text-brand-gold truncate">${movie.movieTitle}</h3>
            <p class="text-xs text-gray-400">${new Date(movie.showDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}</p>
        </div>
    `).join('');
}

function renderHistory(movies) {
    historySection.classList.remove('hidden');
    historyContainer.innerHTML = movies.map(movie => `
        <div class="bg-black/30 p-3 rounded-lg shadow-lg border-2 border-gray-500/10 text-center opacity-70 hover:opacity-100 transition-opacity">
            <img src="${movie.posterURL}" alt="${movie.movieTitle}" class="w-full h-auto rounded-md mb-3 aspect-[2/3] object-cover">
            <h3 class="font-cinzel text-lg font-bold text-gray-400 truncate">${movie.movieTitle}</h3>
            <p class="text-xs text-gray-500">${new Date(movie.showDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
        </div>
    `).join('');
}


function showError(msg) {
    // UPDATED: Use innerHTML to allow for clickable links in the error message
    errorMessage.innerHTML = msg; 
    errorContainer.classList.remove('hidden');
    contentWrapper.remove(); // Remove the main content wrapper entirely
}

// --- Event Handlers for Modals ---

function openTrailerModal(trailerLink) {
    // Extract YouTube video ID
    const videoId = trailerLink.split('v=')[1]?.split('&')[0];
    if (videoId) {
        youtubePlayer.src = `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`;
        trailerModal.classList.remove('hidden');
    }
}

function closeTrailer() {
    youtubePlayer.src = '';
    trailerModal.classList.add('hidden');
}

closeTrailerModalBtn.addEventListener('click', closeTrailer);
trailerModal.addEventListener('click', (e) => {
    if (e.target === trailerModal) { // Close only if clicking on the background
        closeTrailer();
    }
});

confirmAgeButton.addEventListener('click', () => {
    window.location.href = confirmAgeButton.dataset.href;
});

cancelAgeButton.addEventListener('click', () => {
    adultsOnlyModal.classList.add('hidden');
});

// --- Initialization ---
document.addEventListener('DOMContentLoaded', initializePage);