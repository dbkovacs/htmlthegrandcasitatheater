/*
    Folder: /
    File: admin.js
    Extension: .js
*/

import { auth, db, storage } from './firebase-config.js';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, query, where, getDocs, doc, updateDoc, deleteDoc, orderBy } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

// --- DOM References ---
const loginContainer = document.getElementById('login-container');
const dashboard = document.getElementById('dashboard');
const loginForm = document.getElementById('login-form');
const logoutButton = document.getElementById('logout-button');
const timestampContainer = document.getElementById('build-timestamp');
const submissionsContainer = document.getElementById('submissions-container');
const approvedMoviesContainer = document.getElementById('approved-movies-container');

// --- In-memory store for movie data to reduce reads ---
let approvedMovies = [];

// ===================================================================
// === PENDING SUBMISSIONS LOGIC (This section is now fixed)
// ===================================================================
async function loadSubmissions() {
    if (!submissionsContainer) return;
    submissionsContainer.innerHTML = '<p class="text-gray-400">Loading submissions...</p>';

    try {
        const moviesRef = collection(db, 'movies');
        // FIXED: The query is now simplified to only filter by status, which does not require a special index.
        const q = query(moviesRef, where("status", "==", "pending"));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            submissionsContainer.innerHTML = '<p class="text-gray-400">No pending submissions found.</p>';
            return;
        }

        submissionsContainer.innerHTML = '';
        querySnapshot.forEach((doc) => {
            const movie = doc.data();
            const movieId = doc.id;
            const movieCard = document.createElement('div');
            movieCard.className = 'bg-black/40 p-6 rounded-lg border border-yellow-300/10 space-y-4';
            movieCard.setAttribute('data-id', movieId);
            movieCard.innerHTML = `
                <div>
                    <h4 class="font-cinzel text-2xl text-brand-gold">${movie.movieTitle}</h4>
                    <p class="text-sm text-gray-400">Submitted by: ${movie.hostName}</p>
                    ${movie.noteToDavid ? `<p class="text-sm text-gray-300 mt-2 italic border-l-2 border-yellow-300/20 pl-3"><strong>Note:</strong> ${movie.noteToDavid}</p>` : ''}
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label for="showDate-${movieId}" class="block text-xs font-medium text-gray-300 mb-1 font-cinzel tracking-wider">Show Date</label>
                        <input type="date" id="showDate-${movieId}" class="show-date-input w-full bg-black/30 border-yellow-300/20 text-white rounded-lg p-2 focus:ring-1 focus:ring-yellow-300 focus:border-yellow-300 transition">
                    </div>
                    <div>
                        <label for="trailerLink-${movieId}" class="block text-xs font-medium text-gray-300 mb-1 font-cinzel tracking-wider">Trailer Link</label>
                        <input type="url" id="trailerLink-${movieId}" class="trailer-link-input w-full bg-black/30 border-yellow-300/20 text-white rounded-lg p-2 focus:ring-1 focus:ring-yellow-300 focus:border-yellow-300 transition" placeholder="https://youtube.com/watch?v=...">
                    </div>
                </div>
                <div>
                    <label for="posterFile-${movieId}" class="block text-xs font-medium text-gray-300 mb-1 font-cinzel tracking-wider">Movie Poster</label>
                    <div class="poster-upload-area" id="posterArea-${movieId}">
                        <span>Drag & Drop Poster Here</span>
                    </div>
                    <input type="file" id="posterFile-${movieId}" class="poster-file-input" accept="image/*" style="display:none;">
                </div>
                <div class="flex gap-4 pt-2">
                    <button class="btn-velvet primary approve-btn flex-1">Approve</button>
                    <button class="btn-velvet decline-btn flex-1">Decline</button>
                </div>
            `;
            submissionsContainer.appendChild(movieCard);
        });
    } catch (error) {
        console.error("Error loading submissions:", error);
        submissionsContainer.innerHTML = '<p class="text-red-400">Error loading submissions. Check console.</p>';
    }
}
submissionsContainer.addEventListener('click', async (e) => {
    const card = e.target.closest('.bg-black\\/40');
    if (!card) return;
    const movieId = card.getAttribute('data-id');
    if (e.target.classList.contains('approve-btn')) {
        e.target.textContent = 'Approving...'; e.target.disabled = true;
        const showDate = card.querySelector('.show-date-input').value;
        const trailerLink = card.querySelector('.trailer-link-input').value;
        const posterFile = card.querySelector('.poster-file-input').files[0];
        if (!showDate || !posterFile) {
            alert('Please select a show date and a poster image.');
            e.target.textContent = 'Approve'; e.target.disabled = false; return;
        }
        try {
            const posterRef = ref(storage, `posters/${movieId}_${posterFile.name}`);
            await uploadBytes(posterRef, posterFile);
            const posterURL = await getDownloadURL(posterRef);
            await updateDoc(doc(db, 'movies', movieId), { status: 'Approved', showDate, trailerLink, posterURL });
            alert('Movie approved successfully!');
            loadSubmissions();
            loadApprovedMovies();
        } catch (error) {
            console.error('Error approving movie:', error);
            alert('An error occurred.');
            e.target.textContent = 'Approve'; e.target.disabled = false;
        }
    }
    if (e.target.classList.contains('decline-btn')) {
        if (confirm('Are you sure you want to decline this movie?')) {
            try {
                await deleteDoc(doc(db, 'movies', movieId));
                alert('Submission declined and deleted.');
                loadSubmissions();
            } catch (error) { console.error('Error declining movie:', error); alert('An error occurred.'); }
        }
    }
});
submissionsContainer.addEventListener('dragover', (e) => { e.preventDefault(); const area = e.target.closest('.poster-upload-area'); if (area) area.classList.add('drag-over'); });
submissionsContainer.addEventListener('dragleave', (e) => { const area = e.target.closest('.poster-upload-area'); if (area) area.classList.remove('drag-over'); });
submissionsContainer.addEventListener('drop', (e) => { e.preventDefault(); const area = e.target.closest('.poster-upload-area'); if (area) { area.classList.remove('drag-over'); const fileInput = area.nextElementSibling; if (e.dataTransfer.files.length > 0) { fileInput.files = e.dataTransfer.files; area.querySelector('span').textContent = e.dataTransfer.files[0].name; } } });


// ===================================================================
// === APPROVED MOVIES LOGIC (This section is correct and unchanged)
// ===================================================================
async function loadApprovedMovies() {
    try {
        const moviesRef = collection(db, 'movies');
        const q = query(moviesRef, where("status", "==", "Approved"), orderBy("showDate", "desc"));
        const querySnapshot = await getDocs(q);
        
        approvedMovies = [];
        querySnapshot.forEach(doc => approvedMovies.push({ id: doc.id, ...doc.data() }));

        approvedMoviesContainer.innerHTML = '';
        if (approvedMovies.length === 0) {
            approvedMoviesContainer.innerHTML = '<p class="text-gray-400">No approved movies found.</p>';
            return;
        }
        approvedMovies.forEach(movie => {
            const card = document.createElement('div');
            card.className = 'approved-movie-card';
            card.setAttribute('data-id', movie.id);
            card.innerHTML = createApprovedCardView(movie);
            approvedMoviesContainer.appendChild(card);
        });
    } catch (error) {
        console.error("Error loading approved movies:", error);
        approvedMoviesContainer.innerHTML = `<p class="text-red-400">Error loading movies.</p>`;
    }
}

function createApprovedCardView(movie) {
    return `<div class="flex justify-between items-start"><div><h4 class="font-cinzel text-xl text-brand-gold">${movie.movieTitle}</h4><p class="text-sm text-gray-400">Hosted by ${movie.hostName} on ${movie.showDate}</p></div><button class="btn-velvet text-xs edit-btn">Edit</button></div>`;
}

function createEditFormView(movie) {
    return `<div class="space-y-4"><h4 class="font-cinzel text-xl text-brand-gold">Editing: ${movie.movieTitle}</h4><div class="edit-form-grid"><div class="col-span-2"><label for="edit-movieTitle-${movie.id}">Movie Title</label><input type="text" id="edit-movieTitle-${movie.id}" value="${movie.movieTitle || ''}"></div><div><label for="edit-hostName-${movie.id}">Host Name</label><input type="text" id="edit-hostName-${movie.id}" value="${movie.hostName || ''}"></div><div><label for="edit-showDate-${movie.id}">Show Date</label><input type="date" id="edit-showDate-${movie.id}" value="${movie.showDate || ''}"></div><div class="col-span-2"><label for="edit-greeting-${movie.id}">Greeting</label><textarea id="edit-greeting-${movie.id}">${movie.greeting || ''}</textarea></div><div class="col-span-2"><label for="edit-movieTagline-${movie.id}">Tagline</label><input type="text" id="edit-movieTagline-${movie.id}" value="${movie.movieTagline || ''}"></div><div class="col-span-2"><label for="edit-trailerLink-${movie.id}">Trailer Link (YouTube)</label><input type="url" id="edit-trailerLink-${movie.id}" value="${movie.trailerLink || ''}"></div><div class="col-span-2"><label for="edit-posterURL-${movie.id}">Poster Image URL</label><input type="url" id="edit-posterURL-${movie.id}" value="${movie.posterURL || ''}"></div><div class="flex items-center gap-2"><input type="checkbox" id="edit-isAdultsOnly-${movie.id}" ${movie.isAdultsOnly ? 'checked' : ''}><label for="edit-isAdultsOnly-${movie.id}" class="mb-0">Is Adults Only?</label></div></div><div class="flex gap-4 pt-4 border-t border-yellow-300/10"><button class="btn-velvet primary save-btn flex-1">Save Changes</button><button class="btn-velvet cancel-btn flex-1">Cancel</button></div></div>`;
}

approvedMoviesContainer.addEventListener('click', async (e) => {
    const card = e.target.closest('.approved-movie-card');
    if (!card) return;
    const movieId = card.getAttribute('data-id');
    const movieData = approvedMovies.find(m => m.id === movieId);

    if (e.target.classList.contains('edit-btn')) {
        if (movieData) card.innerHTML = createEditFormView(movieData);
    }
    if (e.target.classList.contains('save-btn')) {
        const updatedData = {
            movieTitle: card.querySelector(`#edit-movieTitle-${movieId}`).value,
            hostName: card.querySelector(`#edit-hostName-${movieId}`).value,
            showDate: card.querySelector(`#edit-showDate-${movieId}`).value,
            greeting: card.querySelector(`#edit-greeting-${movieId}`).value,
            movieTagline: card.querySelector(`#edit-movieTagline-${movieId}`).value,
            trailerLink: card.querySelector(`#edit-trailerLink-${movieId}`).value,
            posterURL: card.querySelector(`#edit-posterURL-${movieId}`).value,
            isAdultsOnly: card.querySelector(`#edit-isAdultsOnly-${movieId}`).checked,
        };
        try {
            await updateDoc(doc(db, 'movies', movieId), updatedData);
            const index = approvedMovies.findIndex(m => m.id === movieId);
            if (index !== -1) approvedMovies[index] = { id: movieId, ...updatedData };
            card.innerHTML = createApprovedCardView({ id: movieId, ...updatedData });
        } catch (error) {
            console.error("Error updating document:", error);
            alert("Failed to save changes.");
        }
    }
    if (e.target.classList.contains('cancel-btn')) {
        if (movieData) card.innerHTML = createApprovedCardView(movieData);
    }
});


// ===================================================================
// === AUTHENTICATION & INITIALIZATION (This section is correct and unchanged)
// ===================================================================
onAuthStateChanged(auth, user => {
    if (user) {
        loginContainer.style.display = 'none';
        dashboard.style.display = 'block';
        loadSubmissions(); 
        loadApprovedMovies();
    } else {
        loginContainer.style.display = 'block';
        dashboard.style.display = 'none';
    }
});
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
        console.error("Error signing in:", error);
        alert("Login failed: " + error.message);
    }
});
logoutButton.addEventListener('click', () => {
    signOut(auth).catch((error) => console.error("Error signing out:", error));
});
document.addEventListener('DOMContentLoaded', () => {
    if (timestampContainer) {
        timestampContainer.textContent = `Page loaded: ${new Date().toLocaleString()}`;
    }
});

/*
    File: admin.js
    Build Timestamp: 2025-09-18T16:25:00-06:00
*/