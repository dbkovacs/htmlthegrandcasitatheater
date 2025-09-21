/*
    Folder: /
    File: admin.js
    Extension: .js
*/

import { db, storage } from './firebase-config.js';
import { collection, query, where, getDocs, doc, updateDoc, deleteDoc, orderBy, addDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
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
            // Initialize the movie document without a 'reservations' array field
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
// === APPROVED MOVIES LOGIC
// ===================================================================
async function loadApprovedMovies() {
    try {
        const q = query(collection(db, 'movies'), where("status", "==", "Approved"), orderBy("showDate", "desc"));
        const querySnapshot = await getDocs(q);
        
        approvedMovies = [];
        const moviesPromises = querySnapshot.docs.map(async (movieDoc) => {
            const movieData = { id: movieDoc.id, ...movieDoc.data() };
            // Fetch reservations from the subcollection
            const reservationsRef = collection(db, 'movies', movieDoc.id, 'reservations');
            const reservationsSnapshot = await getDocs(reservationsRef);
            movieData.reservations = reservationsSnapshot.docs.map(resDoc => ({ id: resDoc.id, ...resDoc.data() }));
            return movieData;
        });

        approvedMovies = await Promise.all(moviesPromises);

        approvedMoviesContainer.innerHTML = '';
        if (approvedMovies.length === 0) {
            approvedMoviesContainer.innerHTML = '<p class="text-gray-400">No approved movies found.</p>';
            return;
        }

        const now = new Date();
        now.setHours(0, 0, 0, 0);

        let currentMovie = null;

        const upcomingOrTodayMovies = approvedMovies.filter(movie => {
            const movieDate = new Date(movie.showDate + 'T00:00:00');
            return movieDate >= now;
        });

        if (upcomingOrTodayMovies.length > 0) {
            upcomingOrTodayMovies.sort((a, b) => {
                const dateA = new Date(a.showDate + 'T00:00:00');
                const dateB = new Date(b.showDate + 'T00:00:00');
                return dateA.getTime() - dateB.getTime();
            });
            currentMovie = upcomingOrTodayMovies[0];
        } else if (approvedMovies.length > 0) {
            currentMovie = approvedMovies[0];
        }
        
        const currentMovieDateObject = currentMovie ? new Date(currentMovie.showDate + 'T00:00:00') : null;

        approvedMovies.forEach(movie => {
            let status = 'past';
            const movieDate = new Date(movie.showDate + 'T00:00:00');

            if (currentMovie && movie.id === currentMovie.id) {
                status = 'current';
            } else if (currentMovieDateObject && movieDate > currentMovieDateObject) {
                status = 'upcoming';
            }
            
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

function createReservationRowHtml(reservation, index, movieId) {
    // reservation.id is the document ID for the reservation in the subcollection
    const resId = reservation.id || `new-res-${index}`; // Use document ID or a temporary ID for new unsaved rows
    return `
        <tr class="reservation-row" data-res-id="${resId}" data-res-index="${index}">
            <td><input type="text" value="${reservation.name || ''}" class="res-input-name w-full bg-black/30 border-yellow-300/20 text-white rounded-lg p-1 text-sm"></td>
            <td><input type="email" value="${reservation.email || ''}" class="res-input-email w-full bg-black/30 border-yellow-300/20 text-white rounded-lg p-1 text-sm"></td>
            <td><input type="number" value="${reservation.seats || '1'}" min="1" class="res-input-seats w-full bg-black/30 border-yellow-300/20 text-white rounded-lg p-1 text-sm"></td>
            <td class="text-right">
                <button class="btn-velvet text-xs save-reservation-btn primary mr-1" data-res-id="${resId}">Save</button>
                <button class="btn-velvet text-xs delete-reservation-btn" data-res-id="${resId}">Delete</button>
            </td>
        </tr>
    `;
}


function createEditFormView(movie) {
    const reservationsTableRows = (movie.reservations && movie.reservations.length > 0)
        ? movie.reservations.map((res, index) => createReservationRowHtml(res, index, movie.id)).join('')
        : ''; // No 'No reservations yet' message here, table headers will always show

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
                <div class="overflow-x-auto">
                    <table class="w-full text-left table-auto reservation-table">
                        <thead>
                            <tr class="text-xs text-gray-300 uppercase bg-black/20">
                                <th class="py-2 px-3">Name</th>
                                <th class="py-2 px-3">Email</th>
                                <th class="py-2 px-3">Seats</th>
                                <th class="py-2 px-3 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody id="reservations-table-body-${movie.id}">
                            ${reservationsTableRows}
                        </tbody>
                    </table>
                </div>
                <button class="btn-velvet text-sm add-reservation-row-btn w-full mt-4">Add New Reservation</button>
            </div>

            <div class="flex gap-4 pt-4 border-t border-yellow-300/10">
                <button class="btn-velvet primary save-btn flex-1">Save All Movie Changes</button>
                <button class="btn-velvet cancel-btn flex-1">Cancel</button>
            </div>
        </div>
    `;
}

// Function to generate a simple unique ID for *unsaved* reservations (client-side)
// The actual Firebase document ID will be used once saved
let newReservationCounter = 0;
function generateClientReservationId() {
    return `client_res_${Date.now()}_${newReservationCounter++}`;
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
        };
        try {
            await updateDoc(doc(db, 'movies', movieId), updatedData);
            alert("Movie details saved successfully!");
            loadApprovedMovies(); 
        } catch (error) {
            console.error("Error updating movie document:", error);
            alert("Failed to save movie details.");
        }
    }
    if (e.target.classList.contains('cancel-btn')) {
        loadApprovedMovies();
    }

    // --- Reservation Table Actions ---
    const reservationsTableBody = card.querySelector(`#reservations-table-body-${movieId}`);

    if (e.target.classList.contains('add-reservation-row-btn')) {
        const newTempReservation = {
            id: generateClientReservationId(), // Temporary client-side ID
            name: '',
            email: '',
            seats: 1,
            isNew: true // Flag to indicate it's a new unsaved reservation
        };
        // Add to movieData.reservations array to keep in-sync for re-rendering if needed
        movieData.reservations = [...(movieData.reservations || []), newTempReservation];
        const newRowHtml = createReservationRowHtml(newTempReservation, movieData.reservations.length - 1, movieId);
        reservationsTableBody.insertAdjacentHTML('beforeend', newRowHtml);
    }

    if (e.target.classList.contains('save-reservation-btn')) {
        const button = e.target;
        button.textContent = 'Saving...';
        button.disabled = true;

        const row = button.closest('.reservation-row');
        if (!row) return;

        const resId = row.getAttribute('data-res-id');
        const name = row.querySelector('.res-input-name').value.trim();
        const email = row.querySelector('.res-input-email').value.trim();
        const seats = parseInt(row.querySelector('.res-input-seats').value);

        if (!name || !email || isNaN(seats) || seats <= 0) {
            alert('Please fill in all reservation fields correctly.');
            button.textContent = 'Save';
            button.disabled = false;
            return;
        }

        const reservationData = { name, email, seats, timestamp: new Date().toISOString() };

        try {
            if (resId && !resId.startsWith('client_res_')) { // Existing reservation with Firebase ID
                const reservationDocRef = doc(db, 'movies', movieId, 'reservations', resId);
                await updateDoc(reservationDocRef, reservationData);
                alert("Reservation updated successfully!");
            } else { // New reservation
                const reservationsCollectionRef = collection(db, 'movies', movieId, 'reservations');
                await addDoc(reservationsCollectionRef, reservationData);
                alert("Reservation added successfully!");
            }
            loadApprovedMovies(); // Reload all movies to refresh the view with accurate data
        } catch (error) {
            console.error("Error saving reservation:", error);
            alert("Failed to save reservation.");
            button.textContent = 'Save';
            button.disabled = false;
        }
    }

    if (e.target.classList.contains('delete-reservation-btn')) {
        if (confirm('Are you sure you want to delete this reservation?')) {
            const button = e.target;
            button.textContent = 'Deleting...';
            button.disabled = true;

            const row = button.closest('.reservation-row');
            if (!row) return;

            const resId = row.getAttribute('data-res-id');

            try {
                if (resId.startsWith('client_res_')) {
                    // It's a newly added row that hasn't been saved to Firebase yet
                    row.remove();
                    // Also remove from movieData.reservations if it was added there
                    movieData.reservations = movieData.reservations.filter(res => res.id !== resId);
                    alert("Unsaved reservation row removed.");
                } else {
                    const reservationDocRef = doc(db, 'movies', movieId, 'reservations', resId);
                    await deleteDoc(reservationDocRef);
                    alert("Reservation deleted successfully!");
                    loadApprovedMovies(); // Reload all movies to refresh the view
                }
            } catch (error) {
                console.error("Error deleting reservation:", error);
                alert("Failed to delete reservation.");
                button.textContent = 'Delete';
                button.disabled = false;
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

        for (const movieDoc of querySnapshot.docs) {
            const movie = movieDoc.data();
            const submittedAt = movie.submittedAt?.toDate ? movie.submittedAt.toDate().toISOString() : '';
            const baseMovieData = [
                movieDoc.id, movie.showDate || '', movie.status || '', movie.movieTitle || '', movie.hostName || '',
                movie.greeting || '', movie.noteToDavid || '', movie.posterURL || '', movie.trailerLink || '',
                movie.movieTagline || '', // Added movieTagline here
                movie.isAdultsOnly ? 'true' : 'false', submittedAt
            ];

            const reservationsRef = collection(db, 'movies', movieDoc.id, 'reservations');
            const reservationsSnapshot = await getDocs(reservationsRef);
            const reservations = reservationsSnapshot.docs.map(resDoc => ({ id: resDoc.id, ...resDoc.data() }));

            if (reservations.length > 0) {
                reservations.forEach(reservation => {
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
        }

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
    loadSubmissions();
    loadApprovedMovies();

    if (timestampContainer) {
        timestampContainer.textContent = `Page loaded: ${new Date().toLocaleString()}`;
    }
    if(exportCsvButton) {
        exportCsvButton.addEventListener('click', exportMoviesToCSV);
    }
});