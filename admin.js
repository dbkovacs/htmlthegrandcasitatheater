/*
    Folder: /
    File: admin.js
    Extension: .js
*/

import { auth, db, storage } from './firebase-config.js';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, query, where, getDocs, doc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

// --- DOM Element References ---
const loginContainer = document.getElementById('login-container');
const dashboard = document.getElementById('dashboard');
const loginForm = document.getElementById('login-form');
const logoutButton = document.getElementById('logout-button');
const timestampContainer = document.getElementById('build-timestamp');

// Pending Submissions References
const submissionsContainer = document.getElementById('submissions-container');

// Approved Movies References
const approvedMoviesTbody = document.getElementById('approved-movies-tbody');
const filterInput = document.getElementById('filter-input');
const approvedTableHead = document.querySelector('#approved-section thead');

// --- State Management ---
let approvedMovies = [];
let currentSort = { key: 'showDate', order: 'desc' };

// ===================================================================
// === PENDING SUBMISSIONS LOGIC (No changes here)
// ===================================================================
async function loadSubmissions() {
    // ... This function remains the same as before
}
// ... Event listeners for pending submissions (approve, decline, drag-drop) remain the same

// ===================================================================
// === APPROVED MOVIES LOGIC (New Section)
// ===================================================================

// --- Fetch Approved Movies ---
async function loadApprovedMovies() {
    try {
        const moviesRef = collection(db, 'movies');
        const q = query(moviesRef, where("status", "==", "Approved"));
        const querySnapshot = await getDocs(q);
        
        approvedMovies = []; // Clear the array
        querySnapshot.forEach((doc) => {
            approvedMovies.push({ id: doc.id, ...doc.data() });
        });
        
        renderApprovedMovies(); // Render the full table
    } catch (error) {
        console.error("Error loading approved movies:", error);
        approvedMoviesTbody.innerHTML = `<tr><td colspan="4" class="text-red-400 p-4">Error loading movies.</td></tr>`;
    }
}

// --- Render the Approved Movies Table ---
function renderApprovedMovies() {
    approvedMoviesTbody.innerHTML = ''; // Clear existing table rows

    // 1. Filter the movies based on the search input
    const filterText = filterInput.value.toLowerCase();
    const filteredMovies = approvedMovies.filter(movie => 
        movie.movieTitle.toLowerCase().includes(filterText)
    );

    // 2. Sort the filtered movies
    filteredMovies.sort((a, b) => {
        if (a[currentSort.key] < b[currentSort.key]) return currentSort.order === 'asc' ? -1 : 1;
        if (a[currentSort.key] > b[currentSort.key]) return currentSort.order === 'asc' ? 1 : -1;
        return 0;
    });

    // 3. Create and append the table rows
    if (filteredMovies.length === 0) {
        approvedMoviesTbody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-gray-400">No approved movies found.</td></tr>`;
        return;
    }

    filteredMovies.forEach(movie => {
        const row = document.createElement('tr');
        row.className = 'bg-black/20 border-b border-yellow-300/10 hover:bg-black/30';
        row.setAttribute('data-id', movie.id);
        
        row.innerHTML = `
            <td class="px-6 py-4" data-field="movieTitle">${movie.movieTitle}</td>
            <td class="px-6 py-4" data-field="hostName">${movie.hostName}</td>
            <td class="px-6 py-4" data-field="showDate">${movie.showDate}</td>
            <td class="px-6 py-4">
                <button class="font-bold text-yellow-300 hover:text-white edit-btn">Edit</button>
            </td>
        `;
        approvedMoviesTbody.appendChild(row);
    });
}


// --- In-Place Editing, Filtering, and Sorting Logic ---
// Use event delegation for the whole table body
approvedMoviesTbody.addEventListener('click', async (e) => {
    const target = e.target;
    const row = target.closest('tr');
    if (!row) return;
    const movieId = row.getAttribute('data-id');

    // --- Handle "Edit" button click ---
    if (target.classList.contains('edit-btn')) {
        // Change button to Save/Cancel
        target.parentElement.innerHTML = `
            <button class="font-bold text-green-400 hover:text-white save-btn">Save</button>
            <button class="ml-2 font-bold text-red-400 hover:text-white cancel-btn">Cancel</button>
        `;
        // Make cells editable
        row.querySelectorAll('td[data-field]').forEach(cell => {
            const field = cell.getAttribute('data-field');
            const value = cell.textContent;
            if (field === 'showDate') {
                cell.innerHTML = `<input type="date" value="${value}" class="bg-black/50 p-1 rounded w-full">`;
            } else {
                cell.innerHTML = `<input type="text" value="${value}" class="bg-black/50 p-1 rounded w-full">`;
            }
        });
    }

    // --- Handle "Save" button click ---
    if (target.classList.contains('save-btn')) {
        const updatedData = {};
        row.querySelectorAll('td[data-field]').forEach(cell => {
            const field = cell.getAttribute('data-field');
            updatedData[field] = cell.querySelector('input').value;
        });
        
        try {
            await updateDoc(doc(db, 'movies', movieId), updatedData);
            // After saving, reload all data to ensure consistency
            loadApprovedMovies(); 
        } catch (error) {
            console.error("Error updating document:", error);
            alert("Failed to save changes.");
        }
    }

    // --- Handle "Cancel" button click ---
    if (target.classList.contains('cancel-btn')) {
        // Just re-render the table to discard changes
        renderApprovedMovies();
    }
});

// Event listener for the filter input
filterInput.addEventListener('input', renderApprovedMovies);

// Event listener for sorting by clicking table headers
approvedTableHead.addEventListener('click', (e) => {
    const key = e.target.getAttribute('data-sort');
    if (!key) return;

    if (currentSort.key === key) {
        currentSort.order = currentSort.order === 'asc' ? 'desc' : 'asc';
    } else {
        currentSort.key = key;
        currentSort.order = 'asc';
    }
    renderApprovedMovies();
});


// ===================================================================
// === AUTHENTICATION & INITIALIZATION
// ===================================================================
onAuthStateChanged(auth, user => {
    if (user) {
        loginContainer.style.display = 'none';
        dashboard.style.display = 'block';
        loadSubmissions(); 
        loadApprovedMovies(); // Load approved movies on login
    } else {
        loginContainer.style.display = 'block';
        dashboard.style.display = 'none';
    }
});

loginForm.addEventListener('submit', async (e) => { /* ... unchanged ... */ });
logoutButton.addEventListener('click', () => { /* ... unchanged ... */ });

document.addEventListener('DOMContentLoaded', () => {
    if (timestampContainer) {
        timestampContainer.textContent = `Page loaded: ${new Date().toLocaleString()}`;
    }
});

/*
    File: admin.js
    Build Timestamp: 2025-09-18T16:15:00-06:00
*/