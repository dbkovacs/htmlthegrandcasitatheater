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
        // 1. Fetch all "Approved" movies from Firestore, ordered by date descending
        const moviesRef = collection(db, 'movies');
        const q = query(moviesRef, where("status", "==", "Approved"), orderBy("showDate", "desc"));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            mainContent.innerHTML = '<p class="text-center p-8">No movies found. Check back soon!</p>';
            return;
        }

        // 2. Process and Sort Movies
        const allMovies = [];
        querySnapshot.forEach(doc => {
            allMovies.push({ id: doc.id, ...doc.data() });
        });

        const now = new Date();

        // Find the next upcoming Friday at 1 AM, which is our cutoff
        let nextCutoff = new Date(now);
        nextCutoff.setHours(1, 0, 0, 0); // Set time to 1 AM
        const dayOfWeek = nextCutoff.getDay(); // Sunday = 0, Friday = 5
        const daysUntilFriday = (5 - dayOfWeek + 7) % 7;
        nextCutoff.setDate(now.getDate() + daysUntilFriday);

        // Determine the current movie: it's the first one in our descending list
        // whose show date is before the next cutoff time.
        let currentMovie = allMovies.find(movie => new Date(movie.showDate + 'T00:00:00') < nextCutoff) || null;

        const comingSoonMovies = [];
        const historyMovies = [];

        // Categorize all other movies based on the current one
        if (currentMovie) {
            for (const movie of allMovies) {
                if (movie.id === currentMovie.id) continue; // Skip the current movie
                
                const movieShowDate = new Date(movie.showDate + 'T00:00:00');
                const currentMovieShowDate = new Date(currentMovie.showDate + 'T00:00:00');

                if (movieShowDate > currentMovieShowDate) {
                    comingSoonMovies.push(movie);
                } else {
                    historyMovies.push(movie);
                }
            }
        } else {
            // If no current movie, everything in the future is "coming soon"
            allMovies.forEach(movie => {
                if (new Date(movie.showDate + 'T00:00:00') > now) {
                    comingSoonMovies.push(movie);
                }
            });
        }
        
        // 3. Render the movies into their sections
        if (currentMovie) {
            renderCurrentMovie(currentMovie);
        } else {
            mainContent.innerHTML = `<div class="p-8 text-center"><h2 class="text-3xl font-bold">No movie scheduled for this week. See what's coming soon!</h2></div>`;
        }
        renderComingSoon(comingSoonMovies.reverse()); // reverse to show nearest date first
        renderHistory(historyMovies);

    } catch (error) {
        console.error("Error loading movies:", error);
        mainContent.innerHTML = '<p>Error loading movie data. Please try again later.</p>';
    } finally {
        // 4. Set the build timestamp
        if (timestampContainer) {
            timestampContainer.textContent = `Page loaded: ${new Date().toLocaleString()}`;
        }
    }
}

// --- Render Functions ---
function renderCurrentMovie(movie) {
    document.getElementById('inviter-name').textContent = movie.hostName || 'The Grand Casita Theater';
    document.getElementById('inviter-comment').textContent = movie.greeting || `Invites you to a screening of:`;
    document.getElementById('movie-title').textContent = movie.movieTitle;
    document.getElementById('movie-poster').src = movie.posterURL;
    
    const trailerButton = document.getElementById('trailer-link');
    const trailerModal = document.getElementById('trailer-modal');
    const closeTrailerModal = document.getElementById('close-trailer-modal');
    const youtubePlayer = document.getElementById('youtube-player');
    
    if (trailerButton && movie.trailerLink) {
        trailerButton.addEventListener('click', (e) => {
            e.preventDefault();
            const embedUrl = movie.trailerLink.replace("watch?v=", "embed/") + '?autoplay=1';
            youtubePlayer.src = embedUrl;
            trailerModal.classList.remove('hidden');
        });
    }
     if (closeTrailerModal) {
        closeTrailerModal.addEventListener('click', () => {
            youtubePlayer.src = '';
            trailerModal.classList.add('hidden');
        });
     }

    document.getElementById('event-date-display').textContent = new Date(movie.showDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

function renderComingSoon(movies) {
    if (!comingSoonContainer) return;
    if (movies.length === 0) {
        document.getElementById('coming-soon-section').style.display = 'none';
        return;
    }
    comingSoonContainer.innerHTML = '';
    movies.forEach(movie => {
        const movieCard = document.createElement('div');
        movieCard.className = 'bg-brand-card rounded-lg overflow-hidden shadow-lg';
        movieCard.innerHTML = `
            <img src="${movie.posterURL}" alt="${movie.movieTitle}" class="w-full h-auto object-cover">
            <div class="p-2 text-center">
                <h3 class="text-sm font-bold font-cinzel">${movie.movieTitle}</h3>
                <p class="text-xs text-gray-400">${new Date(movie.showDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
            </div>
        `;
        comingSoonContainer.appendChild(movieCard);
    });
}

function renderHistory(movies) {
    if (!historyContainer) return;
     if (movies.length === 0) {
        document.getElementById('history-section').style.display = 'none';
        return;
    }
    historyContainer.innerHTML = '';
    movies.forEach((movie, index) => {
        const movieCard = document.createElement('div');
        const isReversed = index % 2 !== 0; // Alternate layout
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
    Build Timestamp: Will be populated by this script.
*/