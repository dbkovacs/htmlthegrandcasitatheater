/* /admin_auction.js */
import { db, storage, auth } from './firebase-config.js';
import { collection, addDoc, onSnapshot, orderBy, doc, getDoc, getDocs, deleteDoc, serverTimestamp, Timestamp, runTransaction, query, where, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js"; // Added deleteObject
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";


// VVV YOU MUST EDIT THIS LIST VVV
// This list controls who can access the admin panel.
const ADMIN_EMAILS = ['dbkovacs@gmail.com'];
// ^^^ YOU MUST EDIT THIS LIST ^^^

// Authentication Guard
function checkAuth() {
    onAuthStateChanged(auth, (user) => {
        if (!user) {
            console.log("No user signed in. Redirecting to login.");
            window.location.href = 'login.html';
        } else {
            if (!ADMIN_EMAILS.includes(user.email)) {
                console.warn(`Unauthorized user signed in: ${user.email}. Signing out.`);
                signOut(auth).then(() => {
                    window.location.href = 'login.html?error=auth';
                });
            } else {
                console.log("Admin user authenticated:", user.email);
                // Initialize page only after auth confirmed
                initializeAuctionAdminPage();
            }
        }
    });
}


function initializeAuctionAdminPage() {
    const addItemForm = document.getElementById('add-item-form');
    const manageItemsContainer = document.getElementById('manage-items-container');
    const timestampContainer = document.getElementById('build-timestamp');
    const logoutButton = document.getElementById('logout-button');
    const submitButton = document.getElementById('add-item-submit-button');

    // Logout Button Handler
    logoutButton.addEventListener('click', () => {
        signOut(auth).catch((error) => console.error("Sign out error:", error));
        // checkAuth listener will handle redirect
    });

    // Handle form submission with file upload & new fields
    addItemForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        submitButton.disabled = true;
        submitButton.textContent = 'Uploading Image...';

        const title = document.getElementById('item-title').value;
        const description = document.getElementById('item-description').value;
        const file = document.getElementById('item-image-file').files[0];
        // Allow $0 start bid
        const startBid = parseFloat(document.getElementById('item-start-bid').value);
        if (isNaN(startBid) || startBid < 0) {
             alert('Starting Bid must be a number equal to or greater than 0.');
             submitButton.disabled = false; submitButton.textContent = 'Add Item'; return;
        }

        const increment = parseFloat(document.getElementById('item-increment').value);
         if (isNaN(increment) || increment <= 0) { // Increment must be positive
             alert('Bid Increment must be a positive number.');
             submitButton.disabled = false; submitButton.textContent = 'Add Item'; return;
        }

        const endTime = new Date(document.getElementById('item-end-time').value);
         if (isNaN(endTime.getTime())) {
             alert('Please select a valid Auction End Time.');
             submitButton.disabled = false; submitButton.textContent = 'Add Item'; return;
         }

        const modelNumber = document.getElementById('item-model-number').value;
        const modelUrl = document.getElementById('item-model-url').value;
        // --- Get Not To Exceed Bid ---
        const notToExceedInput = document.getElementById('item-not-exceed-bid');
        const notToExceedBid = notToExceedInput.value ? parseFloat(notToExceedInput.value) : null;

        if (notToExceedBid !== null && (isNaN(notToExceedBid) || notToExceedBid <= startBid)) {
            alert('Not To Exceed Bid must be a number greater than the Starting Bid.');
            submitButton.disabled = false; submitButton.textContent = 'Add Item'; return;
        }
        // --- End Get Not To Exceed Bid ---


        if (!file) {
            alert('Please select an image file.');
            submitButton.disabled = false; submitButton.textContent = 'Add Item'; return;
        }

        try {
            // 1. Upload Image to Firebase Storage
            const storagePath = `auction-images/${Date.now()}_${file.name}`; // Store path for potential deletion
            const storageRef = ref(storage, storagePath);
            const snapshot = await uploadBytes(storageRef, file);
            const imageUrl = await getDownloadURL(snapshot.ref);

            submitButton.textContent = 'Adding Item...';

            // 2. Add Item to Firestore with new fields
            await addDoc(collection(db, 'auctionItems'), {
                title,
                description,
                imageUrl,
                imageStoragePath: storagePath, // Save the path
                startBid: startBid,
                currentBid: startBid, // Initial current bid is start bid
                increment,
                highBidder: null,
                highBidderPhone: null, // New field
                highBidderMaxBid: null, // New field
                notToExceedBid: notToExceedBid, // New field
                startTime: serverTimestamp(),
                endTime: Timestamp.fromDate(endTime),
                modelNumber: modelNumber || null,
                modelUrl: modelUrl || null,
                status: 'active'
            });

            alert('Item added successfully!');
            addItemForm.reset();

        } catch (error) {
            console.error('Error adding item: ', error);
            alert('Failed to add item. Check console for details.');
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = 'Add Item';
        }
    });

    // Use event delegation for all buttons inside the manage items container
    manageItemsContainer.addEventListener('click', async function(event) {
        const target = event.target;
        const itemContainer = target.closest('.item-card-admin-container');
        if (!itemContainer) return;
        const itemId = itemContainer.dataset.itemId;
        const itemTitle = itemContainer.dataset.itemTitle || 'Item'; // Get title stored on container

        // Handle Delete Item
        if (target.matches('.delete-button')) {
            const imagePath = itemContainer.dataset.imagePath; // Get image path
            deleteItem(itemId, itemTitle, imagePath); // Pass image path
        }

        // Handle Toggle Bids View
        if (target.matches('.toggle-bids-button')) {
            const bidsSection = itemContainer.querySelector('.bids-section');
            if (bidsSection) {
                 bidsSection.classList.toggle('hidden');
                 target.textContent = bidsSection.classList.contains('hidden') ? `Show Bids (${target.dataset.bidCount || 0})` : 'Hide Bids';
            }
        }

        // Handle Reject Bid (Needs update for proxy bidding - more complex)
        if (target.matches('.reject-bid-button')) {
            const bidId = target.dataset.bidId;
            // TODO: Rejecting bids is much more complex with proxy bidding.
            // Requires recalculating not just highBidder but potentially highBidderMaxBid
            // and currentBid based on remaining valid bids. Deferring this for now.
            alert("Rejecting bids in proxy mode requires careful recalculation and is not yet implemented in this admin panel.");
            // rejectBid(itemId, bidId); // Keep the function call commented out
        }

        // Handle Edit Button
        if (target.matches('.edit-button')) {
             const view = itemContainer.querySelector('.item-view');
             const editForm = itemContainer.querySelector('.item-edit-form');
             if(view) view.classList.add('hidden');
             if(editForm) editForm.classList.remove('hidden');
        }

        // Handle Cancel Edit Button
        if (target.matches('.cancel-edit-button')) {
             const view = itemContainer.querySelector('.item-view');
             const editForm = itemContainer.querySelector('.item-edit-form');
             if(view) view.classList.remove('hidden');
             if(editForm) editForm.classList.add('hidden');
        }

        // Handle Save Edit Button
        if (target.matches('.save-edit-button')) {
            saveItemChanges(itemId, itemContainer);
        }

        // Handle Winner Management Buttons (Remain mostly the same)
        if (target.matches('.mark-payment-button')) {
            if (confirm('Mark this item as "Awaiting Payment"?')) {
                target.disabled = true;
                await updateDoc(doc(db, 'auctionItems', itemId), { status: 'awaiting_payment' });
                // Snapshot will refresh UI
            }
        }
        if (target.matches('.mark-paid-button')) {
            if (confirm('Mark this item as "Paid"? This is the final step.')) {
                target.disabled = true;
                await updateDoc(doc(db, 'auctionItems', itemId), { status: 'paid' });
                 // Snapshot will refresh UI
            }
        }
    });


    // Load existing items with winner management logic
    const q = query(collection(db, 'auctionItems'), orderBy('endTime', 'desc'));
    onSnapshot(q, async (snapshot) => {
        if (!manageItemsContainer) return; // Guard
        manageItemsContainer.innerHTML = ''; // Clear previous

        if (snapshot.empty) {
            manageItemsContainer.innerHTML = '<p class="text-gray-400">No items to manage.</p>';
            return;
        }

        // Fetch bids concurrently
        const itemPromises = snapshot.docs.map(async (doc) => {
            const item = doc.data();
            const itemId = doc.id;
            const bidsRef = collection(db, 'auctionItems', itemId, 'bids');
            // Fetch ALL bids (including rejected for admin view) ordered by timestamp
            const bidsQuery = query(bidsRef, orderBy('timestamp', 'desc'));
            const bidsSnapshot = await getDocs(bidsQuery);
            const bids = bidsSnapshot.docs.map(bidDoc => ({ id: bidDoc.id, ...bidDoc.data() }));
            return { item, itemId, bids };
        });

        try {
            const itemsWithBids = await Promise.all(itemPromises);

            itemsWithBids.forEach(({ item, itemId, bids }) => {
                const itemElement = document.createElement('div');
                // Store title and image path for delete function
                itemElement.className = 'item-card-admin-container';
                itemElement.dataset.itemId = itemId;
                itemElement.dataset.itemTitle = item.title || 'Untitled Item';
                itemElement.dataset.imagePath = item.imageStoragePath || ''; // Store image path

                const now = new Date();
                const endTime = item.endTime?.toDate(); // Use optional chaining
                const isClosed = endTime && now > endTime;
                const itemStatus = item.status || 'active';

                if (isClosed && itemStatus === 'active') { // Mark as ended if time passed but status wasn't updated
                     itemElement.classList.add('item-closed');
                     // Note: We don't automatically update status in DB from admin view
                } else if (itemStatus !== 'active') {
                    itemElement.classList.add('item-closed'); // Also mark if awaiting payment or paid
                }


                // Bids Table HTML (Show Max Bid)
                const bidsHtml = bids.map(bid => `
                    <tr class="bid-row ${bid.status === 'rejected' ? 'opacity-50 text-gray-500 line-through' : ''}">
                        <td>${bid.name || 'N/A'}</td>
                        <td>$${(bid.amount || 0).toFixed(2)}</td> <!-- This is the MAX bid placed -->
                        <td>${bid.phone || 'N/A'}</td>
                        <td>${bid.timestamp?.toDate()?.toLocaleString() ?? 'N/A'}</td>
                        <td>${bid.status || 'active'}</td>
                        <td>
                            ${bid.status !== 'rejected' && itemStatus === 'active' ? `<button class="reject-bid-button text-xs text-red-400 hover:text-red-200" data-item-id="${itemId}" data-bid-id="${bid.id}">Reject</button>` : (bid.status === 'rejected' ? 'Rejected' : 'Closed')}
                        </td>
                    </tr>
                `).join('');

                // Convert Firestore Timestamp for input field
                const endTimeForInput = endTime ? new Date(endTime.getTime() - (endTime.getTimezoneOffset() * 60000)).toISOString().slice(0, 16) : '';

                // Winner Management HTML (Show Max Bid if applicable)
                let winnerHtml = '';
                // Show winner details if status is ended/paid/awaiting OR if explicitly closed by exceeding bid
                if (itemStatus !== 'active' || (isClosed && item.highBidder)) {
                    const finalPrice = item.currentBid ?? item.startBid ?? 0; // The actual winning price
                    const winnerMaxBid = item.highBidderMaxBid ? ` (Max: $${item.highBidderMaxBid.toFixed(2)})` : '';
                    let statusButton = '';
                     if (itemStatus === 'active' && isClosed) { // Ended naturally, needs marking
                         statusButton = '<button class="btn-velvet primary mark-payment-button text-xs py-1 px-2">Mark Awaiting Payment</button>';
                     } else if (itemStatus === 'awaiting_payment') {
                        statusButton = '<button class="btn-velvet primary mark-paid-button text-xs py-1 px-2">Mark as Paid</button>';
                    } else if (itemStatus === 'paid') {
                        statusButton = '<p class="text-green-400 font-bold text-sm">Payment Received</p>';
                    }

                    winnerHtml = `
                    <div class="winner-section mt-4 pt-4 border-t border-yellow-300/10">
                        <h5 class="font-bold text-md text-brand-gold mb-2">Winner Details</h5>
                        <p class="text-sm"><strong>Name:</strong> ${item.highBidder || 'None'}</p>
                        <p class="text-sm"><strong>Phone:</strong> ${item.highBidderPhone || 'N/A'}</p>
                        <p class="text-sm"><strong>Winning Bid:</strong> $${finalPrice.toFixed(2)}${winnerMaxBid}</p>
                        <div class="mt-2">${statusButton || '<p class="text-gray-400 text-sm">Auction ended with no bids or winner.</p>'}</div>
                    </div>
                    `;
                }


                // Main Card Template
                itemElement.innerHTML = `
                    <div class="item-view">
                        <div class="item-card-admin">
                            <div>
                                <h4 class="font-bold text-lg text-brand-gold">${item.title || 'Untitled Item'} ${itemStatus !== 'active' ? `<span class="closed-badge">${itemStatus.replace('_', ' ')}</span>` : (isClosed ? '<span class="closed-badge">Ended</span>' : '')}</h4>
                                <p class="text-sm">Current Bid: $${(item.currentBid ?? item.startBid ?? 0).toFixed(2)} by ${item.highBidder || 'N/A'}</p>
                                <p class="text-xs text-gray-400">Ends: ${endTime?.toLocaleString() ?? 'N/A'}</p>
                                ${item.notToExceedBid ? `<p class="text-xs text-purple-300">Auto-Win at: $${item.notToExceedBid.toFixed(2)}</p>` : ''}
                            </div>
                            <div class="flex gap-2">
                                <button class="toggle-bids-button text-xs" data-bid-count="${bids.length}">Show Bids (${bids.length})</button>
                                <button class="edit-button text-xs">Edit</button>
                                <button class="delete-button text-xs">Delete</button>
                            </div>
                        </div>

                        ${winnerHtml}

                        <div class="bids-section hidden mt-4 pt-4 border-t border-yellow-300/10">
                            <h5 class="font-bold text-md text-brand-gold mb-2">Bid History (Max Bids Shown)</h5>
                            ${bids.length > 0 ? `<div class="overflow-x-auto"><table class="bids-table"><thead><tr><th>Name</th><th>Max Bid</th><th>Phone</th><th>Time</th><th>Status</th><th>Action</th></tr></thead><tbody>${bidsHtml}</tbody></table></div>` : '<p class="text-gray-400 text-sm">No bids placed yet.</p>'}
                        </div>
                    </div>

                    <!-- Edit Form -->
                    <div class="item-edit-form hidden p-4 space-y-4 bg-black/30 rounded-b-lg">
                        <h4 class="font-bold text-lg text-brand-gold">Editing: ${item.title || 'Untitled Item'}</h4>
                        <input type="text" class="edit-item-title" value="${item.title || ''}" placeholder="Item Title" required>
                        <textarea class="edit-item-description" placeholder="Item Description" rows="3" required>${item.description || ''}</textarea>
                        <!-- Image editing not implemented - show current URL -->
                        <div><label class="text-xs">Image URL (Cannot change here)</label><input type="url" class="edit-item-image-url bg-gray-700 cursor-not-allowed" value="${item.imageUrl || ''}" placeholder="Image URL" readonly></div>
                        <input type="text" class="edit-item-model-number" value="${item.modelNumber || ''}" placeholder="Model Number">
                        <input type="url" class="edit-item-model-url" value="${item.modelUrl || ''}" placeholder="Product URL">
                        <div><label class="text-xs">Not To Exceed Bid ($)</label><input type="number" step="0.01" class="edit-item-not-exceed-bid" value="${item.notToExceedBid || ''}" placeholder="Optional auto-win price"></div>
                        <div><label class="text-xs">Auction End Time</label><input type="datetime-local" class="edit-item-end-time" value="${endTimeForInput}" required></div>
                        <div class="flex gap-4">
                            <button class="btn-velvet primary flex-1 save-edit-button text-sm py-2">Save Changes</button>
                            <button class="btn-velvet flex-1 cancel-edit-button text-sm py-2">Cancel</button>
                        </div>
                    </div>
                `;
                manageItemsContainer.appendChild(itemElement);
            });
        } catch (error) {
            console.error("Error processing items snapshot: ", error);
             manageItemsContainer.innerHTML = '<p class="text-red-400">Error displaying items. Check console.</p>';
        }
    }, (error) => {
        console.error("Error fetching items for management: ", error);
        if (manageItemsContainer) {
             manageItemsContainer.innerHTML = '<p class="text-red-400">Could not load items. Check Firestore rules and console.</p>';
        }
    });

    if (timestampContainer) {
        timestampContainer.textContent = `Build: ${new Date().toLocaleString()}`;
    }
} // End initializeAuctionAdminPage

// --- Helper Functions ---

async function saveItemChanges(itemId, container) {
    const editForm = container.querySelector('.item-edit-form');
    if (!editForm) return;

    // Retrieve startBid and notToExceedBid for validation
    const itemRef = doc(db, 'auctionItems', itemId);
    let startBid = 0; // Default
    try {
        const docSnap = await getDoc(itemRef);
        if (docSnap.exists()) {
            startBid = docSnap.data().startBid || 0;
        }
    } catch(e) { console.warn("Could not fetch startBid for validation"); }

    const notToExceedInput = editForm.querySelector('.edit-item-not-exceed-bid');
    const notToExceedBid = notToExceedInput.value ? parseFloat(notToExceedInput.value) : null;

    if (notToExceedBid !== null && (isNaN(notToExceedBid) || notToExceedBid <= startBid)) {
        alert('Not To Exceed Bid must be a number greater than the Starting Bid.');
        return;
    }

     const endTimeValue = editForm.querySelector('.edit-item-end-time').value;
     if (!endTimeValue) {
         alert("Please select a valid end time.");
         return;
     }

    const updatedData = {
        title: editForm.querySelector('.edit-item-title').value || 'Untitled Item',
        description: editForm.querySelector('.edit-item-description').value || '',
        // Cannot update imageUrl here easily without file upload logic
        modelNumber: editForm.querySelector('.edit-item-model-number').value || null,
        modelUrl: editForm.querySelector('.edit-item-model-url').value || null,
        notToExceedBid: notToExceedBid, // Save updated value
        endTime: Timestamp.fromDate(new Date(endTimeValue)),
    };

    try {
        await updateDoc(itemRef, updatedData);
        alert('Item updated successfully!');
        // Switch back to view mode (onSnapshot will refresh data)
        const view = container.querySelector('.item-view');
        if(view) view.classList.remove('hidden');
        editForm.classList.add('hidden');

    } catch (error) {
        console.error("Error updating item:", error);
        alert("Failed to update item.");
    }
}

// Updated deleteItem to include image deletion
async function deleteItem(itemId, itemTitle, imageStoragePath) {
    if (confirm(`Are you sure you want to delete "${itemTitle}"? This action CANNOT be undone and will delete bids and the image.`)) {
        try {
            // 1. Delete Firestore Document (handles subcollections like bids automatically)
            await deleteDoc(doc(db, 'auctionItems', itemId));
            console.log(`Firestore document ${itemId} deleted.`);

            // 2. Delete Image from Storage if path exists
            if (imageStoragePath) {
                try {
                    const imageRef = ref(storage, imageStoragePath);
                    await deleteObject(imageRef);
                    console.log(`Storage file ${imageStoragePath} deleted.`);
                } catch (storageError) {
                     // Log error but continue - maybe file already deleted or permissions issue
                     console.error(`Failed to delete storage file ${imageStoragePath}:`, storageError);
                     alert(`Item data deleted, but failed to delete image file: ${storageError.message}. You may need to remove it manually.`);
                }
            }

            alert(`"${itemTitle}" and its associated data/image were deleted successfully.`);
            // onSnapshot listener will remove the item from the UI

        } catch (error) {
            console.error("Error removing item: ", error);
            alert(`Failed to delete "${itemTitle}". Check console.`);
        }
    }
}


// Placeholder - Complex logic needed for proxy bidding recalculation
async function rejectBid(itemId, bidId) {
    console.warn("Reject bid function called but not fully implemented for proxy bidding.");
     alert("Rejecting bids in proxy mode requires careful recalculation and is not yet implemented in this admin panel.");
    // If implemented, it needs to:
    // 1. Mark the bid as 'rejected' in the bids subcollection.
    // 2. Query all *other* non-rejected bids for the item, ordered by amount (max bid) descending.
    // 3. Determine the new high bidder and their max bid from the remaining bids.
    // 4. Determine the new *second highest* max bid among the remaining bids.
    // 5. Calculate the new 'currentBid' (usually second highest max + increment, capped by new highest max).
    // 6. Update the main item document (currentBid, highBidder, highBidderPhone, highBidderMaxBid) in a transaction.
}

// --- Initialization Trigger ---
document.addEventListener('DOMContentLoaded', checkAuth); // Start auth check first

/* Build Timestamp: Thu Oct 23 2025 13:55:00 GMT-0600 (Mountain Daylight Time) */
