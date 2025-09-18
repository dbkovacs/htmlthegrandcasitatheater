import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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
        // Create a query to get all documents from the 'movies' collection
        // where the 'status' field is 'pending'
        const moviesRef = collection(db, 'movies');
        const q = query(moviesRef, where("status", "==", "pending"));

        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            submissionsContainer.innerHTML = '<p>No pending submissions found.</p>';
            return;
        }

        // Clear the container and build the list of submissions
        submissionsContainer.innerHTML = '';
        querySnapshot.forEach((doc) => {
            const movie = doc.data();
            const movieId = doc.id;

            const movieCard = document.createElement('div');
            movieCard.className = 'submission-card';
            movieCard.setAttribute('data-id', movieId);

            // This is the HTML for each card. We will add more to this later.
            movieCard.innerHTML = `
                <h4>${movie.movieTitle}</h4>
                <p>Submitted by: ${movie.hostName}</p>
                <hr>
                <div class="admin-actions">
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


// --- Authentication Logic ---
onAuthStateChanged(auth, user => {
    if (user) {
        loginContainer.style.display = 'none';
        dashboard.style.display = 'block';
        // Load the movie submissions as soon as the admin logs in
        loadSubmissions(); 
    } else {
        loginContainer.style.display = 'block';
        dashboard.style.display = 'none';
    }
});

// Handle login form submission
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

// Handle logout button click
logoutButton.addEventListener('click', () => {
    signOut(auth).catch((error) => console.error("Error signing out:", error));
});