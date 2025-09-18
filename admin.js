/*
    Folder: /
    File: admin.js
    Extension: .js
*/

import { auth, db, storage } from './firebase-config.js';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, query, where, getDocs, doc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

const loginContainer = document.getElementById('login-container');
const dashboard = document.getElementById('dashboard');
const loginForm = document.getElementById('login-form');
const logoutButton = document.getElementById('logout-button');
const submissionsContainer = document.getElementById('submissions-container');
const timestampContainer = document.getElementById('build-timestamp');

// --- Main Function to Load Submissions ---
async function loadSubmissions() {
    if (!submissionsContainer) return;
    submissionsContainer.innerHTML = '<p class="text-gray-400">Loading submissions...</p>';

    try {
        const moviesRef = collection(db, 'movies');
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
            // This is the new themed card container
            movieCard.className = 'bg-black/40 p-6 rounded-lg border border-yellow-300/10 space-y-4';
            movieCard.setAttribute('data-id', movieId);

            // This is the new, themed HTML for each card.
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


// --- Event Handlers for Admin Actions ---
submissionsContainer.addEventListener('click', async (e) => {
    const target = e.target;
    const card = target.closest('.submission-card, .bg-black\\/40'); // Handle new class name
    if (!card) return;

    const movieId = card.getAttribute('data-id');

    // --- Approve Button Logic ---
    if (target.classList.contains('approve-btn')) {
        target.textContent = 'Approving...';
        target.disabled = true;

        const showDate = card.querySelector('.show-date-input').value;
        const trailerLink = card.querySelector('.trailer-link-input').value;
        const posterFile = card.querySelector('.poster-file-input').files[0];

        if (!showDate || !posterFile) {
            alert('Please select a show date and a poster image.');
            target.textContent = 'Approve';
            target.disabled = false;
            return;
        }

        try {
            // 1. Upload Poster to Firebase Storage
            const posterRef = ref(storage, `posters/${movieId}_${posterFile.name}`);
            await uploadBytes(posterRef, posterFile);
            const posterURL = await getDownloadURL(posterRef);
            
            // 2. Update Document in Firestore
            const movieDocRef = doc(db, 'movies', movieId);
            await updateDoc(movieDocRef, {
                status: 'Approved',
                showDate: showDate,
                trailerLink: trailerLink,
                posterURL: posterURL
            });

            alert('Movie approved successfully!');
            loadSubmissions(); // Refresh the list

        } catch (error) {
            console.error('Error approving movie:', error);
            alert('An error occurred. Check the console.');
            target.textContent = 'Approve';
            target.disabled = false;
        }
    }

    // --- Decline Button Logic ---
    if (target.classList.contains('decline-btn')) {
        if (confirm('Are you sure you want to decline this movie? It will be deleted.')) {
            try {
                await deleteDoc(doc(db, 'movies', movieId));
                alert('Submission declined and deleted.');
                loadSubmissions(); // Refresh the list
            } catch (error) {
                console.error('Error declining movie:', error);
                alert('An error occurred. Check the console.');
            }
        }
    }
});

// --- Drag and Drop Logic ---
submissionsContainer.addEventListener('dragover', (e) => {
    e.preventDefault();
    const area = e.target.closest('.poster-upload-area');
    if (area) area.classList.add('drag-over');
});
submissionsContainer.addEventListener('dragleave', (e) => {
    const area = e.target.closest('.poster-upload-area');
    if (area) area.classList.remove('drag-over');
});
submissionsContainer.addEventListener('drop', (e) => {
    e.preventDefault();
    const area = e.target.closest('.poster-upload-area');
    if (area) {
        area.classList.remove('drag-over');
        const fileInput = area.nextElementSibling;
        if (e.dataTransfer.files.length > 0) {
            fileInput.files = e.dataTransfer.files;
            area.querySelector('span').textContent = e.dataTransfer.files[0].name;
        }
    }
});


// --- Authentication Logic ---
onAuthStateChanged(auth, user => {
    if (user) {
        loginContainer.style.display = 'none';
        dashboard.style.display = 'block';
        loadSubmissions(); 
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


// Add visible build timestamp to the footer
document.addEventListener('DOMContentLoaded', () => {
    if (timestampContainer) {
        timestampContainer.textContent = `Page loaded: ${new Date().toLocaleString()}`;
    }
});

/*
    File: admin.js
    Build Timestamp: 2025-09-18T16:05:00-06:00
*/