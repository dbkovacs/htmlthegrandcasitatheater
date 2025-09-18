// Import the services you exported from firebase-config.js
import { auth, db, storage } from './firebase-config.js';

// Now you can use them!
console.log("Firebase is ready!");
console.log("Auth service:", auth);
console.log("Firestore service:", db);

// Example: code to fetch movies will go here later...