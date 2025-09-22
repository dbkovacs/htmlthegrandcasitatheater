/*
 * Folder: /
 * File: admin.js
 * Extension: .js
 */

import {
    db
} from './firebase-config.js';
import {
    collection,
    query,
    where,
    getDocs,
    orderBy,
    doc,
    updateDoc,
    deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// --- DOM References ---
const submissionsContainer = document.getElementById('submissions-container');
const approvedMoviesContainer = document.getElementById('approved-movies-container');
const buildTimestampElement = document.getElementById('build-timestamp');

/**
 * Fetches and renders all movie data, separated into pending and approved lists.
 */
async function initializeAdminPage() {
    try {
        // Query for pending movies, ordered by submission date (oldest first)
        const pendingQuery = query(collection(db, 'movies'), where("status", "==", "pending"), orderBy("submittedAt", "asc"));

        // Query for approved movies, ordered by their scheduled show date
        const approvedQuery = query(collection(db, 'movies'), where("status", "==", "Approved"), orderBy("showDate", "asc"));

        // Fetch both sets of data concurrently for efficiency
        const [pendingSnapshot, approvedSnapshot] = await Promise.all([
            getDocs(pendingQuery),
            getDocs(approvedQuery)
        ]);

        const pendingMovies = pendingSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        const approvedMovies = approvedSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        renderPendingMovies(pendingMovies);
        renderApprovedMovies(approvedMovies);

    } catch (error) {
        console.error("Error loading admin data:", error);
        submissionsContainer.innerHTML = `<p class="text-red-400">Error loading data. Please check the developer console for details.</p>`;
    }
}

/**
 * Renders the list of pending movie submissions.
 * @param {Array} movies - An array of pending movie objects.
 */
function renderPendingMovies(movies) {
    if (movies.length === 0) {
        submissionsContainer.innerHTML = `<p class="text-gray-400 italic">No pending submissions.</p>`;
        return;
    }

    submissionsContainer.innerHTML = movies.map(movie => `
        <div class="bg-black/30 p-4 rounded-lg shadow-lg border-2 border-dashed border-yellow-300/30 relative overflow-hidden">
            <div class="absolute top-0 right-0">
                <div class="bg-yellow-500/80 text-black text-xs font-bold uppercase px-4 py-1" style="clip-path: polygon(10% 0, 100% 0, 100% 100%, 0 100%);">
                    Not Scheduled
                </div>
            </div>
            
            <div class="flex flex-col h-full">
                <div>
                    <h4 class="font-cinzel text-xl font-bold text-brand-gold truncate pr-28">${movie.movieTitle || 'Untitled Movie'}</h4>
                    <p class="text-sm text-gray-400 mb-3">Submitted by: <span class="font-semibold">${movie.hostName || 'Unknown Host'}</span></p>
                </div>
                <div class="mt-auto flex justify-end gap-2 pt-3 border-t border-yellow-300/10">
                    <button class="btn-velvet primary" onclick="window.handleEditAndApprove('${movie.id}')">Edit & Approve</button>
                    <button class="btn-velvet" onclick="window.handleDelete('${movie.id}')">Delete</button>
                </div>
            </div>
        </div>
    `).join('');
}


/**
 * Renders the list of approved and scheduled movies.
 * @param {Array} movies - An array of approved movie objects.
 */
function renderApprovedMovies(movies) {
    if (movies.length === 0) {
        approvedMoviesContainer.innerHTML = `<p class="text-gray-400 italic">No approved movies scheduled.</p>`;
        return;
    }

    approvedMoviesContainer.innerHTML = movies.map(movie => {
        const showDate = movie.showDate ?
            new Date(movie.showDate + 'T00:00:00').toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            }) :
            'Date Not Set';

        return `
            <div class="bg-brand-card p-4 rounded-lg shadow-lg border-2 border-yellow-300/10">
                <h4 class="font-cinzel text-xl font-bold text-brand-gold truncate">${movie.movieTitle}</h4>
                <p class="text-sm text-gray-300">Host: ${movie.hostName}</p>
                <p class="text-sm text-brand-gold font-bold">Showing: ${showDate}</p>
                <div class="mt-4 flex justify-end gap-2">
                    <button class="btn-velvet" onclick="window.location.href='reservations.html?movieId=${movie.id}'">View Reservations</button>
                    <button class="btn-velvet">Edit</button>
                </div>
            </div>
        `;
    }).join('');
}

// --- Global Event Handlers ---
// Note: Attaching to the window object to make them accessible from inline onclick attributes.

/**
 * Handles the deletion of a movie submission.
 * @param {string} id - The Firestore document ID of the movie to delete.
 */
window.handleDelete = async (id) => {
    if (!confirm("Are you sure you want to permanently delete this submission? This action cannot be undone.")) return;

    try {
        await deleteDoc(doc(db, "movies", id));
        alert("Submission successfully deleted.");
        initializeAdminPage(); // Refresh the lists
    } catch (error) {
        console.error("Error deleting document: ", error);
        alert("Failed to delete submission. See console for details.");
    }
};

/**
 * Placeholder for the "Edit & Approve" functionality.
 * @param {string} id - The Firestore document ID of the movie to edit.
 */
window.handleEditAndApprove = (id) => {
    // In a full implementation, this would open a modal form pre-filled with the movie's data.
    // The form would allow editing details, setting a 'showDate', and then updating the status to 'Approved'.
    alert(`Editing movie with ID: ${id}.\n\nThis will open an edit form where you can set the showDate and officially approve the movie.`);
};


// --- Initialization ---

/**
 * Sets the build timestamp in the footer.
 */
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

// Run initialization logic when the DOM is fully loaded.
document.addEventListener('DOMContentLoaded', () => {
    setBuildTimestamp();
    initializeAdminPage();
});

/*
 * Build Timestamp: 9/22/2025, 2:03:03 PM MDT
 */