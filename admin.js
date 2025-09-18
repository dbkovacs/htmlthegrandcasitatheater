import { auth, db, storage } from './firebase-config.js';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, query, where, getDocs, doc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

const loginContainer = document.getElementById('login-container');
const dashboard = document.getElementById('dashboard');
const loginForm = document.getElementById('login-form');
const logoutButton = document.getElementById('logout-button');
const submissionsContainer = document.getElementById('submissions-container');

// --- Main Function to Load Submissions ---
async function loadSubmissions() {
    if (!submissionsContainer) return;
    submissionsContainer.innerHTML = 'Loading submissions...';

    try {
        const moviesRef = collection(db, 'movies');
        const q = query(moviesRef, where("status", "==", "pending"));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            submissionsContainer.innerHTML = '<p>No pending submissions found.</p>';
            return;
        }

        submissionsContainer.innerHTML = '';
        querySnapshot.forEach((doc) => {
            const movie = doc.data();
            const movieId = doc.id;
            const movieCard = document.createElement('div');
            movieCard.className = 'submission-card';
            movieCard.setAttribute('data-id', movieId);

            movieCard.innerHTML = `
                <h4>${movie.movieTitle}</h4>
                <p>Submitted by: ${movie.hostName}</p>
                <hr>
                <div class="admin-actions">
                    <div>
                        <label for="showDate-${movieId}">Show Date:</label>
                        <input type="date" id="showDate-${movieId}" class="show-date-input" required>
                    </div>
                    <div>
                        <label for="trailerLink-${movieId}">Trailer Link:</label>
                        <input type="url" id="trailerLink-${movieId}" class="trailer-link-input" placeholder="https://youtube.com/watch?v=...">
                    </div>
                    <div>
                        <label for="posterFile-${movieId}">Movie Poster:</label>
                        <div class="poster-upload-area" id="posterArea-${movieId}">
                            <span>Drag & Drop Poster Here</span>
                        </div>
                        <input type="file" id="posterFile-${movieId}" class="poster-file-input" accept="image/*" style="display:none;">
                    </div>
                    <button class="approve-btn">Approve</button>
                    <button class="decline-btn">Decline</button>
                </div>
            `;
            submissionsContainer.appendChild(movieCard);
        });
    } catch (error) {
        console.error("Error loading submissions:", error);
        submissionsContainer.innerHTML = '<p>Error loading submissions. Check console.</p>';
    }
}

// --- Event Handlers for Admin Actions ---
submissionsContainer.addEventListener('click', async (e) => {
    const target = e.target;
    const card = target.closest('.submission-card');
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
            console.log('File uploaded, URL:', posterURL);

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

    // --- Decline Button Logic (Bonus) ---
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

// --- Drag and Drop Logic (Bonus) ---
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


// --- Authentication Logic (no changes below this line) ---
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