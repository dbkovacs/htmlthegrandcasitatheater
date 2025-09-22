/*
    Folder: /
    File: app.js
    Extension: .js
*/

import { db } from './firebase-config.js';
import { collection, query, where, getDocs, orderBy } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// --- Joke Responses ---
const VONNEGUT_JOKES = [
    "Thank you. We’ve filed your report under 'Cosmic Inevitabilities.'",
    "The program is working as intended. The universe, however, is not.",
    "That’s not a bug. It’s an undocumented feature of an uncaring world.",
    "The bug has been noted. So it goes.",
    "What you perceive as a bug is merely the machine’s attempt at abstract art. We mustn’t stifle its creativity.",
    "Your report has been forwarded to the Department of Unintended Consequences. They meet on the second Tuesday of never.",
    "Everything was beautiful and nothing hurt, until you found that. We prefer not to look at it.",
    "This has all happened before, and it will all happen again.",
    "If we fixed that, the delicate balance of the entire system would collapse into a goo of well-intentioned mediocrity.",
    "The bug is unstuck in time. It happens, it has happened, it will happen.",
    "We appreciate your feedback. It has been printed out, folded into a paper hat, and worn with a certain weary dignity.",
    "Our engineers have determined that fixing this would require a level of existential courage we simply do not possess.",
    "That's the ghost in the machine. We have an arrangement with him.",
    "The system is perfect. It is your perception that is flawed. Meditate on this.",
    "This isn't a bug. It's a random, tragic, and occasionally beautiful hiccup in the clockwork of the cosmos.",
    "The code is tired. It needs a nap, not criticism.",
    "You are trying to apply logic to a system that has long since transcended it.",
    "Thank you for your report. A small, sad parade will be held in its honor.",
    "We can't fix that. It's load-bearing.",
    "I looked into the bug. The bug looked back into me. We agreed to leave each other alone.",
    "Welcome to the monkey house. That feature is one of the monkeys.",
    "The bug has been assigned ticket number ∞.",
    "Your bug report is like a letter to a god who is no longer listening.",
    "We've added your report to the pile. The pile is sentient now, and it asks for more.",
    "That's not a bug; it's a Kilgore Trout plot point we haven't written our way out of yet.",
    "To fix the bug would be to admit we were wrong. And so on.",
    "The code does what it does. The user does what they do. The bug is the punchline.",
    "We are all bugs in a program written by a madman. Your specific complaint seems trivial in comparison.",
    "Thank you. This information will be very useful to our competitors.",
    "We fed your report to the office dog. He seems no different.",
    "The bug is merely a symptom. The disease is existence.",
    "Yes, we know. We were hoping no one would notice.",
    "That feature works perfectly, but only on Tralfamadore.",
    "Your request has been processed by our state-of-the-art random number generator and has been randomly ignored.",
    "The code is a beautiful, chaotic dance. You want us to ask the dancers to stop and fill out paperwork.",
    "We are not at liberty to discuss the bug's purpose.",
    "Congratulations. You have found the loose thread that, if pulled, will unravel all of creation.",
    "The bug is a small, shy god. It requires tribute, not extermination.",
    "That is not a bug. It is a lesson in humility.",
    "We choose to see it as a charming imperfection, like a snaggletooth on a beloved dog.",
    "Our official position is that what you are describing did not happen.",
    "The machine dreams, and you complain about the color of its nightmares.",
    "Think of it less as a 'bug' and more as 'software jazz.'",
    "The problem isn't the bug. The problem is that you think there's a solution.",
    "Report received. And now, we wait.",
    "You have mistaken a philosophical koan for a software error.",
    "We are aware of the bug. It is aware of us. A tense but stable peace has been achieved.",
    "That part of the code was written by a man who believed he was a garden slug. We're afraid to touch it.",
    "A committee has been formed to discuss the formation of a team that will investigate your report.",
    "Your bug report has been converted into a plaintive folk song.",
    "It is what it is. And so on.",
    "The bug is a protected species under the Digital Wildlife Act of 2024.",
    "That is not a bug, it is a key that fits a lock we have not yet found.",
    "The software has achieved a state of serene indifference. We recommend you do the same.",
    "Fixing that would violate the warranty of the universe.",
    "We've tried nothing, and we're all out of ideas.",
    "We showed this to the lead developer. He just nodded slowly and wept.",
    "The bug isn't in the code. It's in the human heart.",
    "Have you considered that perhaps you are the bug?",
    "That's just entropy, friend. Can't put that genie back in the bottle.",
    "Your report is now part of the Great Wall of User Feedback. It looks magnificent from a distance.",
    "We're on it. By which we mean we are sitting on it, hoping it goes away.",
    "The bug is a reminder that all human endeavor is ultimately flawed. Thank you for this reminder.",
    "That is an experimental feature. The experiment is to see who complains.",
    "There are no bugs, only happy little accidents.",
    "I'm sorry, that bug has tenure.",
    "We believe in free will for our code. Sometimes it makes poor choices.",
    "The bug is scheduled to be addressed in the next ice age.",
    "This issue is outside the scope of our reality.",
    "Ah, yes. Number 47. We were wondering when someone would find that again.",
    "Your report is very important to us. It will be preserved in amber as a warning to future generations.",
    "We've looked at the code, and the code is fine. Perhaps you are using it wrong, emotionally.",
    "We've decided to let the bugs fight it out amongst themselves. We'll support whichever one wins.",
    "The bug has been promoted to management.",
    "That is not a bug. It is a feature request from a higher power.",
    "Our developers are not qualified to play God. So the bug stays.",
    "You assume the universe is supposed to make sense. That's your first mistake.",
    "The bug is a crack in the world. It is how the light gets in.",
    "This matter has been referred to our on-staff theologian.",
    "If we fix all the bugs, what will we have to complain about?",
    "We're a little busy with the heat death of the universe right now, but we'll get to it after that.",
    "The bug is part of our cultural heritage.",
    "That bug is the only thing holding the whole mess together.",
    "Our system is a cathedral. You've pointed out a gargoyle you don't like.",
    "The code is running a low-grade fever. It's best not to disturb it.",
    "We're letting it mature, like a fine, undrinkable wine.",
    "The bug is a memorial to a programmer who quit to become a beekeeper. We keep it for sentimental reasons.",
    "We're treating it as a teachable moment. We just haven't figured out what it's teaching us yet.",
    "Your bug report is a perfect snowflake of disappointment. Beautiful, but it will melt away by morning.",
    "To fix this bug would create a temporal paradox.",
    "That's not a bug. It's a protest.",
    "We've tried turning it off and on again. The bug is still there. So it goes.",
    "The bug is not the problem. Your expectations are the problem.",
    "We asked the bug if it wanted to be fixed. It said no.",
    "It's not a bug; it's a narrative device.",
    "We have logged your complaint and will now proceed to do nothing, but with a profound sense of purpose.",
    "The bug will be patched in the same update that makes everyone happy and kind to one another.",
    "You have noticed the flaw in the pattern. The weavers are not pleased.",
    "That is the price of progress. Or maybe the price of not enough progress. It's one of those.",
    "We will give your report all the consideration it deserves."
];

// --- DOM References ---
const errorContainer = document.getElementById('error-container');
const errorMessage = document.getElementById('error-message');
const contentWrapper = document.getElementById('content-wrapper');
const mainContent = document.getElementById('main-content');
const buildTimestampElement = document.getElementById('build-timestamp');

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
const bugReportModal = document.getElementById('bug-report-modal');
const bugReportResponse = document.getElementById('bug-report-response');
const openBugReportModalBtn = document.getElementById('bug-report-button');
const closeBugReportModalBtn = document.getElementById('close-bug-modal');


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

function categorizeAndRenderMovies(allMovies) {
    let currentMovie = null;
    let upcomingMovies = [];
    let pastMovies = [];

    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const firstUpcomingIndex = allMovies.findIndex(movie => new Date(movie.showDate + 'T00:00:00') >= now);

    if (firstUpcomingIndex !== -1) {
        currentMovie = allMovies[firstUpcomingIndex];
        upcomingMovies = allMovies.slice(firstUpcomingIndex + 1);
        pastMovies = allMovies.slice(0, firstUpcomingIndex);
    } else if (allMovies.length > 0) {
        // If all movies are in the past, show the most recent one as current.
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

    const date = new Date(movie.showDate + 'T19:00:00');
    eventDateDisplay.textContent = date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

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
    errorMessage.innerHTML = msg;
    errorContainer.classList.remove('hidden');
    contentWrapper.remove();
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
        // In a real-world scenario, you might want to show a user-friendly error here.
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
        year: 'numeric', month: 'numeric', day: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
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
    Build Timestamp: Mon Sep 22 2025 08:58:00 GMT-0600 (Mountain Daylight Time)
*/
