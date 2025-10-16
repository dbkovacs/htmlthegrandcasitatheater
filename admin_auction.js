/* /admin_auction.js */
import { db } from './firebase-config.js';
import { collection, addDoc, onSnapshot, orderBy, doc, deleteDoc, serverTimestamp, Timestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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

    // Use event delegation for delete buttons
    manageItemsContainer.addEventListener('click', function(event) {
        if (event.target.matches('.delete-button')) {
            const itemId = event.target.dataset.itemId;
            const itemTitle = event.target.dataset.itemTitle;
            deleteItem(itemId, itemTitle);
        }
    });


    // Load existing items for management
    const q = orderBy('endTime', 'desc');
    onSnapshot(collection(db, 'auctionItems'), q, (snapshot) => {
        if (snapshot.empty) {
            manageItemsContainer.innerHTML = '<p class="text-gray-400">No items to manage.</p>';
            return;
        }

        manageItemsContainer.innerHTML = '';
        snapshot.forEach(doc => {
            const item = doc.data();
            const itemId = doc.id;
            const itemElement = document.createElement('div');
            itemElement.className = 'item-card-admin';

            itemElement.innerHTML = `
                <div>
                    <h4 class="font-bold text-lg text-brand-gold">${item.title}</h4>
                    <p class="text-sm">Current Bid: $${item.currentBid.toFixed(2)}</p>
                    <p class="text-xs text-gray-400">Ends: ${item.endTime.toDate().toLocaleString()}</p>
                </div>
                <button class="delete-button" data-item-id="${itemId}" data-item-title="${item.title}">Delete</button>
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
/* Build Timestamp: Thu Oct 16 2025 13:19:14 GMT-0600 (Mountain Daylight Time) */