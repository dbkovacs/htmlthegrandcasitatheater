/*
    File: inspect-schema.js
    Extension: .js
*/

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

const serviceAccount = JSON.parse(readFileSync('./htmlthegrandcasitatheater-firebase-adminsdk-fbsvc-a6d8aed68f.json'));

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

/**
 * Recursively gets the schema of a collection by inspecting multiple documents.
 * @param {FirebaseFirestore.CollectionReference} collectionRef - The collection to inspect.
 * @param {string} [indent=''] - The indentation for logging.
 */
async function getCollectionSchema(collectionRef, indent = '') {
    console.log(`${indent}📁 ${collectionRef.id} (collection)`);

    // Get a sample of documents to inspect.
    const collectionSnapshot = await collectionRef.limit(10).get(); // Increased to 10 for a better sample

    if (collectionSnapshot.empty) {
        console.log(`${indent}  (empty collection)`);
        return;
    }

    console.log(`${indent}  --- Inspecting up to 10 documents ---`);

    // --- MAJOR CHANGE ---
    // Loop through EACH document we found in the sample.
    for (const doc of collectionSnapshot.docs) {
        const docData = doc.data();
        console.log(`${indent}  📄 {${doc.id}} (document)`);

        // Print the fields for THIS specific document
        for (const key in docData) {
            const value = docData[key];
            const type = Array.isArray(value) ? 'array' : typeof value;
            console.log(`${indent}    - ${key}: (${type})`);
        }

        // Check for subcollections on THIS specific document
        const subcollections = await doc.ref.listCollections();
        if (subcollections.length > 0) {
            for (const subcollection of subcollections) {
                // Recursively inspect the found subcollection
                await getCollectionSchema(subcollection, indent + '    ');
            }
        } else {
             console.log(`${indent}    (No subcollections)`);
        }
    }
}

// Main function to start the process
async function inspectDatabase() {
    console.log('Inspecting Firestore Schema...\n');
    try {
        const rootCollections = await db.listCollections();
        for (const collectionRef of rootCollections) {
            await getCollectionSchema(collectionRef);
            console.log(''); // Add a blank line between root collections
        }
    } catch (error) {
        console.error("Failed to inspect database:", error);
    }
}

inspectDatabase();