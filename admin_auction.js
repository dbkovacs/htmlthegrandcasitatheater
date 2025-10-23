/* /admin_auction.js */
import { db, storage, auth } from './firebase-config.js';
import { collection, addDoc, onSnapshot, orderBy, doc, getDoc, getDocs, deleteDoc, serverTimestamp, Timestamp, runTransaction, query, where, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";


// VVV YOU MUST EDIT THIS LIST VVV
// This list controls who can access the admin panel.
const ADMIN_EMAILS = ['dbkovacs@gmail.com'];
// ^^^ YOU MUST EDIT THIS LIST ^^^

// NEW: Authentication Guard
function checkAuth() {
    onAuthStateChanged(auth, (user) => {
        if (!user) {
            // No user is signed in, redirect to login.
            console.log("No user signed in. Redirecting to login.");
            window.location.href = 'login.html';
        } else {
            // User is signed in. NOW, check if they are an admin.
            if (ADMIN_EMAILS.includes(user.email)) {
                // User is an authorized admin
                console.log("Admin user authenticated:", user.email);
                // The original code already calls checkAuth() on DOMContentLoaded,
                // so the rest of the page logic will execute.
            } else {
                // User is signed in but NOT an admin.
                console.warn(`Unauthorized user signed in: ${user.email}. Signing out.`);
                signOut(auth).then(() => {
                    // Redirect to login with an error message
                    window.location.href = 'login.html?error=auth';
                });
            }
        }
    });
}


document.addEventListener('DOMContentLoaded', () => {
    // Run the auth check immediately
    checkAuth();

    const addItemForm = document.getElementById('add-item-form');
    const manageItemsContainer = document.getElementById('manage-items-container');
    const timestampContainer = document.getElementById('build-timestamp');
    const logoutButton = document.getElementById('logout-button');
    const submitButton = document.getElementById('add-item-submit-button');

    // NEW: Logout Button Handler
    logoutButton.addEventListener('click', () => {
        signOut(auth).then(() => {
            console.log("User signed out.");
            // checkAuth() will automatically redirect
        }).catch((error) => {
            console.error("Sign out error:", error);
        });
    });

    // UPDATED: Handle form submission with file upload
    addItemForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        submitButton.disabled = true;
        submitButton.textContent = 'Uploading Image...';

        const title = document.getElementById('item-title').value;
        const description = document.getElementById('item-description').value;
        const file = document.getElementById('item-image-file').files[0];
        const startBid = parseFloat(document.getElementById('item-start-bid').value);
        const increment = parseFloat(document.getElementById('item-increment').value);
        const endTime = new Date(document.getElementById('item-end-time').value);
        const modelNumber = document.getElementById('item-model-number').value;
        const modelUrl = document.getElementById('item-model-url').value;

        if (!file) {
            alert('Please select an image file.');
            submitButton.disabled = false;
            submitButton.textContent = 'Add Item';
            return;
        }

        try {
            // 1. Upload Image to Firebase Storage
            const storageRef = ref(storage, `auction-images/${Date.now()}_${file.name}`);
            const snapshot = await uploadBytes(storageRef, file);
            const imageUrl = await getDownloadURL(snapshot.ref);
            
            submitButton.textContent = 'Adding Item...';

            // 2. Add Item to Firestore
            await addDoc(collection(db, 'auctionItems'), {
                title,
                description,
                imageUrl, // Use the URL from Storage
                startBid: startBid,
                currentBid: startBid,
                increment,
                highBidder: null,
                startTime: serverTimestamp(),
                endTime: Timestamp.fromDate(endTime),
                modelNumber: modelNumber || null,
                modelUrl: modelUrl || null,
                status: 'active' // NEW: Status for winner management
            });
            
            alert('Item added successfully!');
            addItemForm.reset();

        } catch (error) {
            console.error('Error adding item: ', error);
            alert('Failed to add item.');
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
        
        // Handle Delete Item
        if (target.matches('.delete-button')) {
            const itemTitle = target.dataset.itemTitle;
            deleteItem(itemId, itemTitle);
        }

        // Handle Toggle Bids View
        if (target.matches('.toggle-bids-button')) {
            const bidsSection = itemContainer.querySelector('.bids-section');
            bidsSection.classList.toggle('hidden');
            target.textContent = bidsSection.classList.contains('hidden') ? `Show Bids (${target.dataset.bidCount})` : 'Hide Bids';
        }

        // Handle Reject Bid
        if (target.matches('.reject-bid-button')) {
            const bidId = target.dataset.bidId;
            rejectBid(itemId, bidId);
        }
        
        // Handle Edit Button
        if (target.matches('.edit-button')) {
            itemContainer.querySelector('.item-view').classList.add('hidden');
            itemContainer.querySelector('.item-edit-form').classList.remove('hidden');
        }

        // Handle Cancel Edit Button
        if (target.matches('.cancel-edit-button')) {
            itemContainer.querySelector('.item-view').classList.remove('hidden');
            itemContainer.querySelector('.item-edit-form').classList.add('hidden');
        }

        // Handle Save Edit Button
        if (target.matches('.save-edit-button')) {
            saveItemChanges(itemId, itemContainer);
        }

        // NEW: Handle Winner Management Buttons
        if (target.matches('.mark-payment-button')) {
            if (confirm('Mark this item as "Awaiting Payment"?')) {
                target.disabled = true;
                await updateDoc(doc(db, 'auctionItems', itemId), { status: 'awaiting_payment' });
                // Snapshot will refresh the UI
            }
        }
        if (target.matches('.mark-paid-button')) {
            if (confirm('Mark this item as "Paid"? This is the final step.')) {
                target.disabled = true;
                await updateDoc(doc(db, 'auctionItems', itemId), { status: 'paid' });
                // Snapshot will refresh the UI
            }
        }
    });


    // UPDATED: Load existing items with winner management logic
    const q = query(collection(db, 'auctionItems'), orderBy('endTime', 'desc'));
    onSnapshot(q, async (snapshot) => {
        if (snapshot.empty) {
            manageItemsContainer.innerHTML = '<p class="text-gray-400">No items to manage.</p>';
            return;
        }

        const itemPromises = snapshot.docs.map(async (doc) => {
            const item = doc.data();
            const itemId = doc.id;
            
            // Fetch bids for each item
            const bidsRef = collection(db, 'auctionItems', itemId, 'bids');
            const bidsQuery = query(bidsRef, orderBy('timestamp', 'desc'));
            const bidsSnapshot = await getDocs(bidsQuery);
            const bids = bidsSnapshot.docs.map(bidDoc => ({ id: bidDoc.id, ...bidDoc.data() }));

            return { item, itemId, bids };
        });

        const itemsWithBids = await Promise.all(itemPromises);

        manageItemsContainer.innerHTML = '';
        itemsWithBids.forEach(({ item, itemId, bids }) => {
            const itemElement = document.createElement('div');
            itemElement.className = 'item-card-admin-container';
            itemElement.dataset.itemId = itemId;

            const now = new Date();
            const endTime = item.endTime.toDate();
            const isClosed = now > endTime;
            const itemStatus = item.status || 'active'; // Default to active if status not set

            if (isClosed) {
                itemElement.classList.add('item-closed');
            }

            // Bids Table HTML
            const bidsHtml = bids.map(bid => `
                <tr class="bid-row ${bid.status === 'rejected' ? 'opacity-50 text-gray-500' : ''}">
                    <td>${bid.name}</td>
                    <td>$${bid.amount.toFixed(2)}</td>
                    <td>${bid.phone || 'N/A'}</td>
                    <td>${bid.status || 'active'}</td>
                    <td>
                        ${bid.status !== 'rejected' && !isClosed ? `<button class="reject-bid-button" data-item-id="${itemId}" data-bid-id="${bid.id}">Reject</button>` : (isClosed ? 'Closed' : 'Rejected')}
                    </td>
                </tr>
            `).join('');
            
            // Convert Firestore Timestamp to a string suitable for datetime-local input
            const endTimeForInput = new Date(endTime.getTime() - (endTime.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);

            // NEW: Winner Management HTML
            let winnerHtml = '';
            if (isClosed && item.highBidder) {
                // Find the winner's phone number from the bid list
                const winnerBid = bids.find(b => b.name === item.highBidder && b.amount === item.currentBid);
                const winnerPhone = winnerBid ? winnerBid.phone : 'N/A';
                
                let statusButton = '';
                if (itemStatus === 'active') {
                    statusButton = '<button class="btn-velvet primary mark-payment-button">Mark as Awaiting Payment</button>';
                } else if (itemStatus === 'awaiting_payment') {
                    statusButton = '<button class="btn-velvet primary mark-paid-button">Mark as Paid</button>';
                } else if (itemStatus === 'paid') {
                    statusButton = '<p class="text-green-400 font-bold">Payment Received</p>';
                }

                winnerHtml = `
                <div class="winner-section">
                    <h5 class="font-bold text-md text-brand-gold mb-2">Winner Details</h5>
                    <p><strong>Name:</strong> ${item.highBidder}</p>
                    <p><strong>Phone:</strong> ${winnerPhone}</p>
                    <p><strong>Final Bid:</strong> $${item.currentBid.toFixed(2)}</p>
                    <div class="mt-4">${statusButton}</div>
                </div>
                `;
            } else if (isClosed) {
                 winnerHtml = `<div class="winner-section"><p class="text-gray-400">Auction closed with no bids.</p></div>`;
            }

            // Main Card Template
            itemElement.innerHTML = `
                <div class="item-view">
                    <div class="item-card-admin">
                        <div>
                            <h4 class="font-bold text-lg text-brand-gold">${item.title} ${isClosed ? `<span class="closed-badge">${itemStatus.replace('_', ' ')}</span>` : ''}</h4>
                            <p class="text-sm">Current Bid: $${item.currentBid.toFixed(2)} by ${item.highBidder || 'N/A'}</p>
                            <p class="text-xs text-gray-400">Ends: ${endTime.toLocaleString()}</p>
                        </div>
                        <div class="flex gap-2">
                            <button class="toggle-bids-button" data-bid-count="${bids.length}">Show Bids (${bids.length})</button>
                            <button class="edit-button">Edit</button>
                            <button class="delete-button" data-item-title="${item.title}">Delete</button>
                        </div>
                    </div>
                    
                    ${winnerHtml}

                    <div class="bids-section hidden">
                        <h5 class="font-bold text-md text-brand-gold mb-2">Bid History</h5>
                        ${bids.length > 0 ? `<div class="overflow-x-auto"><table class="bids-table"><thead><tr><th>Name</th><th>Amount</th><th>Phone</th><th>Status</th><th>Action</th></tr></thead><tbody>${bidsHtml}</tbody></table></div>` : '<p class="text-gray-400">No bids placed yet.</p>'}
                    </div>
                </div>

                <div class="item-edit-form hidden p-4 space-y-4">
                    <h4 class="font-bold text-lg text-brand-gold">Editing: ${item.title}</h4>
                    <input type="text" class="edit-item-title" value="${item.title}" placeholder="Item Title" required>
                    <textarea class="edit-item-description" placeholder="Item Description" rows="3" required>${item.description}</textarea>
                    <input type="url" class="edit-item-image-url" value="${item.imageUrl}" placeholder="Image URL" required>
                    <input type="text" class="edit-item-model-number" value="${item.modelNumber || ''}" placeholder="Model Number">
                    <input type="url" class="edit-item-model-url" value="${item.modelUrl || ''}" placeholder="Product URL">
                    <div><label>Auction End Time</label><input type="datetime-local" class="edit-item-end-time" value="${endTimeForInput}" required></div>
                    <div class="flex gap-4">
                        <button class="btn-velvet primary flex-1 save-edit-button">Save Changes</button>
                        <button class="btn-velvet flex-1 cancel-edit-button">Cancel</button>
                    </div>
                </div>
            `;
            manageItemsContainer.appendChild(itemElement);
        });
    }, (error) => {
        console.error("Error fetching items for management: ", error);
        manageItemsContainer.innerHTML = '<p class="text-red-400">Could not load items.</p>';
    });

    if (timestampContainer) {
        timestampContainer.textContent = `Build: ${new Date().toLocaleString()}`;
    }
});

async function saveItemChanges(itemId, container) {
    const updatedData = {
        title: container.querySelector('.edit-item-title').value,
        description: container.querySelector('.edit-item-description').value,
        imageUrl: container.querySelector('.edit-item-image-url').value,
        modelNumber: container.querySelector('.edit-item-model-number').value || null,
        modelUrl: container.querySelector('.edit-item-model-url').value || null,
        endTime: Timestamp.fromDate(new Date(container.querySelector('.edit-item-end-time').value)),
    };
    
    try {
        const itemRef = doc(db, 'auctionItems', itemId);
        await updateDoc(itemRef, updatedData);
        alert('Item updated successfully!');
        // The onSnapshot listener will automatically re-render the view
    } catch (error) {
        console.error("Error updating item:", error);
        alert("Failed to update item.");
    }
}

async function deleteItem(itemId, itemTitle) {
    // TODO: Add logic to delete associated image from Storage
    if (confirm(`Are you sure you want to delete "${itemTitle}"? This action cannot be undone.`)) {
        try {
            await deleteDoc(doc(db, 'auctionItems', itemId));
            alert(`"${itemTitle}" was deleted successfully.`);
        } catch (error) {
            console.error("Error removing document: ", error);
            alert(`Failed to delete "${itemTitle}".`);
        }
    }
}

async function rejectBid(itemId, bidId) {
    if (!confirm('Are you sure you want to reject this bid? This will recalculate the high bidder.')) {
        return;
    }

    const itemRef = doc(db, 'auctionItems', itemId);
    const bidRef = doc(itemRef, 'bids', bidId);

    try {
        await runTransaction(db, async (transaction) => {
            const itemDoc = await transaction.get(itemRef);
            if (!itemDoc.exists()) throw new Error("Auction item not found.");
            const itemData = itemDoc.data();
            
            // Mark the bid as rejected
            transaction.update(bidRef, { status: 'rejected' });

            // Find the *new* highest valid bid
            const bidsQuery = query(
                collection(db, 'auctionItems', itemId, 'bids'), 
                where('status', '!=', 'rejected'), 
                orderBy('amount', 'desc')
            );
            
            // We must use transaction.get() for queries inside a transaction
            const activeBidsSnapshot = await transaction.get(bidsQuery);

            let newHighBidder = null;
            let newCurrentBid = itemData.startBid; // Default to start bid

            // Find the highest bid that isn't the one we just rejected
            const highestValidBid = activeBidsSnapshot.docs.find(doc => doc.id !== bidId);

            if (highestValidBid) {
                newHighBidder = highestValidBid.data().name;
                newCurrentBid = highestValidBid.data().amount;
            }

            // Update the main item
            transaction.update(itemRef, {
                highBidder: newHighBidder,
                currentBid: newCurrentBid
            });
        });
        alert('Bid rejected and high bidder recalculated successfully.');
    } catch (error) {
        console.error("Error rejecting bid: ", error);
        alert(`Failed to reject bid. Reason: ${error.message}`);
    }
}
/* Build Timestamp: Thu Oct 17 2025 14:10:00 GMT-0600 (Mountain Daylight Time) */