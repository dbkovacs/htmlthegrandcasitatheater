/* /admin_auction.js */
import { db } from './firebase-config.js';
import { collection, addDoc, onSnapshot, orderBy, doc, getDoc, getDocs, deleteDoc, serverTimestamp, Timestamp, runTransaction, query, where, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {
    const addItemForm = document.getElementById('add-item-form');
    const manageItemsContainer = document.getElementById('manage-items-container');
    const timestampContainer = document.getElementById('build-timestamp');

    // Handle form submission for adding new items
    addItemForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const title = document.getElementById('item-title').value;
        const description = document.getElementById('item-description').value;
        const imageUrl = document.getElementById('item-image-url').value;
        const startBid = parseFloat(document.getElementById('item-start-bid').value);
        const increment = parseFloat(document.getElementById('item-increment').value);
        const endTime = new Date(document.getElementById('item-end-time').value);

        try {
            await addDoc(collection(db, 'auctionItems'), {
                title,
                description,
                imageUrl,
                startBid: startBid,
                currentBid: startBid,
                increment,
                highBidder: null,
                startTime: serverTimestamp(),
                endTime: Timestamp.fromDate(endTime),
            });
            alert('Item added successfully!');
            addItemForm.reset();
        } catch (error) {
            console.error('Error adding item: ', error);
            alert('Failed to add item.');
        }
    });

    // Use event delegation for all buttons inside the manage items container
    manageItemsContainer.addEventListener('click', async function(event) {
        const target = event.target;
        
        // Handle Delete Item
        if (target.matches('.delete-button')) {
            const itemId = target.dataset.itemId;
            const itemTitle = target.dataset.itemTitle;
            deleteItem(itemId, itemTitle);
        }

        // Handle Toggle Bids View
        if (target.matches('.toggle-bids-button')) {
            const bidsSectionId = `bids-${target.dataset.itemId}`;
            const bidsSection = document.getElementById(bidsSectionId);
            bidsSection.classList.toggle('hidden');
            target.textContent = bidsSection.classList.contains('hidden') ? `Show Bids (${target.dataset.bidCount})` : 'Hide Bids';
        }

        // Handle Reject Bid
        if (target.matches('.reject-bid-button')) {
            const bidId = target.dataset.bidId;
            const itemId = target.dataset.itemId;
            rejectBid(itemId, bidId);
        }
    });


    // Load existing items for management
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
            itemElement.className = 'item-card-admin-container'; // New container class

            const bidsHtml = bids.map(bid => `
                <tr class="bid-row ${bid.status === 'rejected' ? 'opacity-50 text-gray-500' : ''}">
                    <td>${bid.name}</td>
                    <td>$${bid.amount.toFixed(2)}</td>
                    <td>${bid.timestamp ? bid.timestamp.toDate().toLocaleString() : 'N/A'}</td>
                    <td>${bid.status || 'active'}</td>
                    <td>
                        ${bid.status !== 'rejected' ? `<button class="reject-bid-button" data-item-id="${itemId}" data-bid-id="${bid.id}">Reject</button>` : 'Rejected'}
                    </td>
                </tr>
            `).join('');

            itemElement.innerHTML = `
                <div class="item-card-admin">
                    <div>
                        <h4 class="font-bold text-lg text-brand-gold">${item.title}</h4>
                        <p class="text-sm">Current Bid: $${item.currentBid.toFixed(2)} by ${item.highBidder || 'N/A'}</p>
                        <p class="text-xs text-gray-400">Ends: ${item.endTime.toDate().toLocaleString()}</p>
                    </div>
                    <div class="flex gap-2">
                        <button class="toggle-bids-button" data-item-id="${itemId}" data-bid-count="${bids.length}">Show Bids (${bids.length})</button>
                        <button class="delete-button" data-item-id="${itemId}" data-item-title="${item.title}">Delete</button>
                    </div>
                </div>
                <div id="bids-${itemId}" class="bids-section hidden">
                    <h5 class="font-bold text-md text-brand-gold mb-2">Bid History</h5>
                    ${bids.length > 0 ? `
                    <div class="overflow-x-auto">
                        <table class="bids-table">
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Amount</th>
                                    <th>Time</th>
                                    <th>Status</th>
                                    <th>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${bidsHtml}
                            </tbody>
                        </table>
                    </div>
                    ` : '<p class="text-gray-400">No bids placed yet.</p>'}
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

async function deleteItem(itemId, itemTitle) {
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
        // STEP 1: READ all necessary data outside the transaction
        const itemDoc = await getDoc(itemRef);
        const itemData = itemDoc.data();
        const allBidsSnapshot = await getDocs(collection(itemRef, 'bids'));

        let newHighBidder = null;
        let newCurrentBid = itemData.startBid;
        let highestValidBidFound = null;

        allBidsSnapshot.forEach(doc => {
            const bid = doc.data();
            // Skip the bid being rejected from recalculation
            if (doc.id === bidId) return;

            // Find the highest among the remaining valid bids
            if (bid.status !== 'rejected') {
                if (!highestValidBidFound || bid.amount > highestValidBidFound.amount) {
                    highestValidBidFound = bid;
                }
            }
        });
        
        if (highestValidBidFound) {
            newHighBidder = highestValidBidFound.name;
            newCurrentBid = highestValidBidFound.amount;
        }

        // STEP 2: RUN transaction for writes only
        await runTransaction(db, async (transaction) => {
            // Write 1: Reject the specified bid
            transaction.update(bidRef, { status: 'rejected' });
            // Write 2: Update the main item document with recalculated data
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
/* Build Timestamp: Thu Oct 16 2025 13:51:52 GMT-0600 (Mountain Daylight Time) */