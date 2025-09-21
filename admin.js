/*
    Folder: /
    File: admin.js
    Extension: .js
*/

import { db, storage } from './firebase-config.js';
import { collection, query, where, getDocs, doc, updateDoc, deleteDoc, orderBy } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

// --- DOM References ---
const timestampContainer = document.getElementById('build-timestamp');
const submissionsContainer = document.getElementById('submissions-container');
const approvedMoviesContainer = document.getElementById('approved-movies-container');
const exportCsvButton = document.getElementById('export-csv-button');

// --- In-memory store for movie data ---
let approvedMovies = [];
const flatpickrOptions = {
    dateFormat: "Y-m-d",
    altInput: true,
    altFormat: "F j, Y",
};

// ===================================================================
// === PENDING SUBMISSIONS LOGIC
// ===================================================================
async function loadSubmissions() {
    if (!submissionsContainer) return;
    submissionsContainer.innerHTML = '<p class="text-gray-400">Loading submissions...</p>';
    try {
        const q = query(collection(db, 'movies'), where("status", "==", "pending"));
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
                        <input type="text" id="showDate-${movieId}" class="show-date-input w-full bg-black/30 border-yellow-300/20 text-white rounded-lg p-2 focus:ring-1 focus:ring-yellow-300 focus:border-yellow-300 transition">
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
            
            const dateInput = movieCard.querySelector('.show-date-input');
            if (dateInput) flatpickr(dateInput, flatpickrOptions);
        });
    } catch (error) {
        console.error("Error loading submissions:", error);
        submissionsContainer.innerHTML = '<p class="text-red-400">Error loading submissions.</p>';
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
            await updateDoc(doc(db, 'movies', movieId), { status: 'Approved', showDate, trailerLink, posterURL, reservations: [] }); // Initialize reservations
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
// === APPROVED MOVIES LOGIC
// ===================================================================
async function loadApprovedMovies() {
    try {
        // Change orderBy to descending to show furthest future date at top
        const q = query(collection(db, 'movies'), where("status", "==", "Approved"), orderBy("showDate", "desc"));
        
        const querySnapshot = await getDocs(q);
        
        approvedMovies = [];
        querySnapshot.forEach(doc => approvedMovies.push({ id: doc.id, ...doc.data() }));

        approvedMoviesContainer.innerHTML = '';
        if (approvedMovies.length === 0) {
            approvedMoviesContainer.innerHTML = '<p class="text-gray-400">No approved movies found.</p>';
            return;
        }

        const now = new Date();
        now.setHours(0, 0, 0, 0);

        let currentMovie = null;

        // Find all movies that are today or in the future
        const upcomingOrTodayMovies = approvedMovies.filter(movie => {
            const movieDate = new Date(movie.showDate + 'T00:00:00');
            return movieDate >= now;
        });

        if (upcomingOrTodayMovies.length > 0) {
            // Sort these upcoming movies in ascending order to find the *next chronological* one
            upcomingOrTodayMovies.sort((a, b) => {
                const dateA = new Date(a.showDate + 'T00:00:00');
                const dateB = new Date(b.showDate + 'T00:00:00');
                return dateA.getTime() - dateB.getTime();
            });
            currentMovie = upcomingOrTodayMovies[0]; // This is the next chronological upcoming movie
        } else if (approvedMovies.length > 0) {
            // If no upcoming movies, the approvedMovies list is sorted descending (future to past).
            // The first element in this list will be the most recent past movie.
            currentMovie = approvedMovies[0];
        }
        
        // --- NEW: Get the date object for the identified currentMovie for comparison ---
        const currentMovieDateObject = currentMovie ? new Date(currentMovie.showDate + 'T00:00:00') : null;

        approvedMovies.forEach(movie => {
            let status = 'past'; // Default status is 'past'
            const movieDate = new Date(movie.showDate + 'T00:00:00');

            if (currentMovie && movie.id === currentMovie.id) {
                status = 'current'; // This is the designated 'current' movie (yellow)
            } else if (currentMovieDateObject && movieDate > currentMovieDateObject) {
                status = 'upcoming'; // Movies after the current movie (blue)
            }
            // All other movies (i.e., those with dates <= currentMovieDateObject and not the currentMovie itself)
            // will correctly remain 'past' (gray) due to the default `status = 'past'` assignment.

            const card = document.createElement('div');
            card.className = 'approved-movie-card';
            card.setAttribute('data-id', movie.id);
            card.innerHTML = createApprovedCardView(movie, status);
            approvedMoviesContainer.appendChild(card);
        });
    } catch (error) {
        console.error("Error loading approved movies:", error);
        approvedMoviesContainer.innerHTML = `<p class="text-red-400">Error loading movies. Check the console for details.</p>`;
    }
}

function createApprovedCardView(movie, status) {
    const reservationCount = (movie.reservations && movie.reservations.length > 0) ? `(${movie.reservations.length} reservations)` : '';
    return `
        <div class="status-flag status-flag-${status}"></div>
        <div class="pl-4">
             <div class="flex justify-between items-start">
                <div>
                    <h4 class="font-cinzel text-xl text-brand-gold">${movie.movieTitle}</h4>
                    <p class="text-sm text-gray-400">Hosted by ${movie.hostName} on ${movie.showDate} ${reservationCount}</p>
                </div>
                <button class="btn-velvet text-xs edit-btn">Edit</button>
            </div>
        </div>
    `;
}

function createReservationItemHtml(reservation, index) {
    return `
        <div class="reservation-item" data-res-index="${index}">
            <div>
                <p class="text-sm text-brand-gold">${reservation.name} - ${reservation.seats} seats</p>
                <p class="text-xs text-gray-400">${reservation.email}</p>
            </div>
            <div class="actions">
                <button class="btn-velvet text-xs edit-reservation-btn">Edit</button>
                <button class="btn-velvet decline-btn text-xs delete-reservation-btn">Delete</button>
            </div>
        </div>
    `;
}

function createEditFormView(movie) {
    const reservationsHtml = (movie.reservations && movie.reservations.length > 0)
        ? movie.reservations.map((res, index) => createReservationItemHtml(res, index)).join('')
        : '<p class="text-gray-400 text-sm">No reservations yet.</p>';

    return `
        <div class="space-y-4">
            <h4 class="font-cinzel text-xl text-brand-gold">Editing: ${movie.movieTitle}</h4>
            <div class="edit-form-grid">
                <div class="col-span-2"><label for="edit-movieTitle-${movie.id}">Movie Title</label><input type="text" id="edit-movieTitle-${movie.id}" value="${movie.movieTitle || ''}"></div>
                <div><label for="edit-hostName-${movie.id}">Host Name</label><input type="text" id="edit-hostName-${movie.id}" value="${movie.hostName || ''}"></div>
                <div><label for="edit-showDate-${movie.id}">Show Date</label><input type="text" id="edit-showDate-${movie.id}" class="show-date-input" value="${movie.showDate || ''}"></div>
                <div class="col-span-2"><label for="edit-greeting-${movie.id}">Greeting</label><textarea id="edit-greeting-${movie.id}">${movie.greeting || ''}</textarea></div>
                <div class="col-span-2"><label for="edit-movieTagline-${movie.id}">Tagline</label><input type="text" id="edit-movieTagline-${movie.id}" value="${movie.movieTagline || ''}"></div>
                <div class="col-span-2"><label for="edit-trailerLink-${movie.id}">Trailer Link (YouTube)</label><input type="url" id="edit-trailerLink-${movie.id}" value="${movie.trailerLink || ''}"></div>
                <div class="col-span-2"><label for="edit-posterURL-${movie.id}">Poster Image URL</label><input type="url" id="edit-posterURL-${movie.id}" value="${movie.posterURL || ''}"></div>
                <div class="flex items-center gap-2"><input type="checkbox" id="edit-isAdultsOnly-${movie.id}" ${movie.isAdultsOnly ? 'checked' : ''}><label for="edit-isAdultsOnly-${movie.id}" class="mb-0">Is Adults Only?</label></div>
            </div>

            <div class="pt-4 border-t border-yellow-300/10 mt-4 space-y-3">
                <h5 class="font-cinzel text-lg text-brand-gold">Reservations</h5>
                <div id="reservations-list-${movie.id}" class="reservation-list">
                    ${reservationsHtml}
                </div>
                <button class="btn-velvet text-sm add-reservation-btn w-full">Add New Reservation</button>
                <div id="add-edit-reservation-form-${movie.id}" class="hidden bg-black/30 p-4 rounded-lg space-y-3 mt-4 border border-yellow-300/10">
                    <h6 class="font-cinzel text-md text-brand-gold" id="reservation-form-title-${movie.id}">Add Reservation</h6>
                    <div><label for="res-name-${movie.id}">Name</label><input type="text" id="res-name-${movie.id}" placeholder="Full Name"></div>
                    <div><label for="res-email-${movie.id}">Email</label><input type="email" id="res-email-${movie.id}" placeholder="email@example.com"></div>
                    <div><label for="res-seats-${movie.id}">Seats</label><input type="number" id="res-seats-${movie.id}" min="1" value="1"></div>
                    <div class="flex gap-2">
                        <button class="btn-velvet primary save-reservation-btn flex-1">Save Reservation</button>
                        <button class="btn-velvet cancel-reservation-btn flex-1">Cancel</button>
                    </div>
                </div>
            </div>

            <div class="flex gap-4 pt-4 border-t border-yellow-300/10">
                <button class="btn-velvet primary save-btn flex-1">Save All Changes</button>
                <button class="btn-velvet cancel-btn flex-1">Cancel</button>
            </div>
        </div>
    `;
}

// Function to generate a simple unique ID for reservations (client-side)
function generateReservationId() {
    return 'res_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

approvedMoviesContainer.addEventListener('click', async (e) => {
    const card = e.target.closest('.approved-movie-card');
    if (!card) return;
    const movieId = card.getAttribute('data-id');
    const movieData = approvedMovies.find(m => m.id === movieId);
    if (!movieData) return;

    // --- Movie Card Actions ---
    if (e.target.classList.contains('edit-btn')) {
        card.innerHTML = createEditFormView(movieData);
        const dateInput = card.querySelector(`#edit-showDate-${movieId}`);
        if (dateInput) flatpickr(dateInput, flatpickrOptions);
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
            // Reservations are already handled directly in movieData.reservations array
        };
        try {
            await updateDoc(doc(db, 'movies', movieId), updatedData);
            alert("Changes saved successfully!");
            loadApprovedMovies(); 
        } catch (error) {
            console.error("Error updating document:", error);
            alert("Failed to save changes.");
        }
    }
    if (e.target.classList.contains('cancel-btn')) {
        loadApprovedMovies();
    }

    // --- Reservation Actions ---
    const reservationForm = card.querySelector(`#add-edit-reservation-form-${movieId}`);
    const reservationFormTitle = card.querySelector(`#reservation-form-title-${movieId}`);
    const resNameInput = card.querySelector(`#res-name-${movieId}`);
    const resEmailInput = card.querySelector(`#res-email-${movieId}`);
    const resSeatsInput = card.querySelector(`#res-seats-${movieId}`);
    let editingReservationIndex = null; // To keep track if we are editing or adding

    if (e.target.classList.contains('add-reservation-btn')) {
        reservationForm.classList.remove('hidden');
        reservationFormTitle.textContent = 'Add Reservation';
        resNameInput.value = '';
        resEmailInput.value = '';
        resSeatsInput.value = '1';
        editingReservationIndex = null;
    }
    if (e.target.classList.contains('edit-reservation-btn')) {
        const resItem = e.target.closest('.reservation-item');
        editingReservationIndex = parseInt(resItem.getAttribute('data-res-index'));
        const reservationToEdit = movieData.reservations[editingReservationIndex];

        reservationForm.classList.remove('hidden');
        reservationFormTitle.textContent = 'Edit Reservation';
        resNameInput.value = reservationToEdit.name;
        resEmailInput.value = reservationToEdit.email;
        resSeatsInput.value = reservationToEdit.seats;
    }
    if (e.target.classList.contains('save-reservation-btn')) {
        const name = resNameInput.value.trim();
        const email = resEmailInput.value.trim();
        const seats = parseInt(resSeatsInput.value);

        if (!name || !email || isNaN(seats) || seats <= 0) {
            alert('Please fill in all reservation fields correctly.');
            return;
        }

        const newReservation = { name, email, seats, timestamp: new Date().toISOString() };

        if (editingReservationIndex !== null) {
            // Editing existing reservation
            movieData.reservations[editingReservationIndex] = { ...movieData.reservations[editingReservationIndex], ...newReservation };
        } else {
            // Adding new reservation
            newReservation.id = generateReservationId(); // Assign a unique ID for new reservations
            movieData.reservations = [...(movieData.reservations || []), newReservation];
        }

        try {
            await updateDoc(doc(db, 'movies', movieId), { reservations: movieData.reservations });
            alert("Reservation saved!");
            reservationForm.classList.add('hidden');
            loadApprovedMovies(); // Reload to update the card view
        } catch (error) {
            console.error("Error saving reservation:", error);
            alert("Failed to save reservation.");
        }
    }
    if (e.target.classList.contains('cancel-reservation-btn')) {
        reservationForm.classList.add('hidden');
        editingReservationIndex = null;
    }
    if (e.target.classList.contains('delete-reservation-btn')) {
        if (confirm('Are you sure you want to delete this reservation?')) {
            const resItem = e.target.closest('.reservation-item');
            const indexToDelete = parseInt(resItem.getAttribute('data-res-index'));
            movieData.reservations.splice(indexToDelete, 1); // Remove from array
            try {
                await updateDoc(doc(db, 'movies', movieId), { reservations: movieData.reservations });
                alert("Reservation deleted!");
                loadApprovedMovies(); // Reload to update the card view
            } catch (error) {
                console.error("Error deleting reservation:", error);
                alert("Failed to delete reservation.");
            }
        }
    }
});

// ===================================================================
// === CSV EXPORT LOGIC
// ===================================================================
function formatCSVRow(items) {
    return items.map(item => {
        let str = String(item === null || item === undefined ? '' : item);
        if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
            str = `"${str.replace(/"/g, '""')}"`;
        }
        return str;
    }).join(',');
}

async function exportMoviesToCSV() {
    exportCsvButton.disabled = true;
    exportCsvButton.textContent = 'Exporting...';
    try {
        const moviesQuery = query(collection(db, 'movies'), orderBy("showDate", "desc"));
        const querySnapshot = await getDocs(moviesQuery);

        if (querySnapshot.empty) {
            alert("No movies found to export.");
            return;
        }

        const headers = [
            'Movie_ID', 'Movie_ShowDate', 'Movie_Status', 'Movie_Title', 'Movie_HostName', 
            'Movie_Greeting', 'Movie_NoteToDavid', 'Movie_PosterURL', 'Movie_TrailerLink', 
            'Movie_Tagline', 'Movie_IsAdultsOnly', 'Movie_SubmittedAt',
            'Reservation_ID', 'Reservation_Name', 'Reservation_Email', 'Reservation_Seats', 'Reservation_Timestamp'
        ];
        let csvContent = formatCSVRow(headers) + "\r\n";

        querySnapshot.forEach(doc => {
            const movie = doc.data();
            const submittedAt = movie.submittedAt?.toDate ? movie.submittedAt.toDate().toISOString() : '';
            const baseMovieData = [
                doc.id, movie.showDate || '', movie.status || '', movie.movieTitle || '', movie.hostName || '',
                movie.greeting || '', movie.noteToDavid || '', movie.posterURL || '', movie.trailerLink || '',
                movie.isAdultsOnly ? 'true' : 'false', submittedAt
            ];

            if (movie.reservations && movie.reservations.length > 0) {
                movie.reservations.forEach(reservation => {
                    const rowData = [
                        ...baseMovieData,
                        reservation.id || '', reservation.name || '', reservation.email || '', 
                        reservation.seats || '', reservation.timestamp || ''
                    ];
                    csvContent += formatCSVRow(rowData) + "\r\n";
                });
            } else {
                // If no reservations, still export movie data with empty reservation fields
                const rowData = [
                    ...baseMovieData,
                    '', '', '', '', '' // Empty fields for reservation data
                ];
                csvContent += formatCSVRow(rowData) + "\r\n";
            }
        });

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        const timestamp = new Date().toISOString().slice(0, 10);
        link.setAttribute("download", `all_movies_and_reservations_export_${timestamp}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        alert("All movies and reservations exported to CSV successfully!");
    } catch (error) {
        console.error("Error exporting to CSV:", error);
        alert("An error occurred during the export. Check the console for details.");
    } finally {
        exportCsvButton.disabled = false;
        exportCsvButton.textContent = 'Export All to CSV';
    }
}

// ===================================================================
// === INITIALIZATION
// ===================================================================

document.addEventListener('DOMContentLoaded', () => {
    // Directly call the loading functions as there is no login check
    loadSubmissions();
    loadApprovedMovies();

    if (timestampContainer) {
        timestampContainer.textContent = `Page loaded: ${new Date().toLocaleString()}`;
    }
    if(exportCsvButton) {
        exportCsvButton.addEventListener('click', exportMoviesToCSV);
    }
});

/*
    File: admin.js
    Build Timestamp: 2025-09-21T13:45:00-06:00
*/