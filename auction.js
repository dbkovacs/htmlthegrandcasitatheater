/* /auction.js */
import { db } from './firebase-config.js';
import { collection, doc, onSnapshot, orderBy, runTransaction, query, where, getDocs, getDoc, addDoc, serverTimestamp, Timestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// --- START: Family Verification ---
let knownFamilyNumbers = [];
// --- END: Family Verification ---

// --- Global State ---
let currentSort = 'endTimeAsc'; // Default sort order
let allItems = []; // To store fetched items for in-memory sorting
let unsubscribe = null; // To hold the listener cancellation function

document.addEventListener('DOMContentLoaded', () => {
    const itemsContainer = document.getElementById('auction-items-container');
    const timestampContainer = document.getElementById('build-timestamp');
    const sortDropdown = document.getElementById('sort-items');
    const successToast = document.getElementById('success-toast');
    const successMessage = document.getElementById('success-message');

    // Modals
    const imageModal = document.getElementById('image-modal');
    const modalImage = document.getElementById('modal-image');
    const closeModal = document.getElementById('close-image-modal');
    const bidModal = document.getElementById('bid-modal');
    const bidModalClose = document.getElementById('close-bid-modal');
    const bidForm = document.getElementById('bid-form');
    const bidModalTitle = document.getElementById('bid-modal-title');
    const historyModal = document.getElementById('history-modal');
    const closeHistoryModal = document.getElementById('close-history-modal');

    // Quick Bid Buttons (in modal)
    const quickBidMinButton = document.getElementById('quick-bid-min-button');
    const quickBidPlus1Button = document.getElementById('quick-bid-plus-1-button');
    const quickBidPlus5Button = document.getElementById('quick-bid-plus-5-button');
    const quickBidPlus10Button = document.getElementById('quick-bid-plus-10-button');
    const bidAmountInput = document.getElementById('bid-amount'); // Reference needed for quick bids

    // Fetch auction settings (like phone numbers) from Firestore
    fetchAuctionSettings();

    if (!itemsContainer) {
        console.error('Error: Auction items container not found.');
        return;
    }

    // --- Event Delegation for Clicks on Item Cards ---
    itemsContainer.addEventListener('click', function(event) {
        const target = event.target;

        // Handle Bid Button Clicks
        if (target.matches('.bid-button')) {
            const itemId = target.dataset.itemId;
            const itemTitle = target.dataset.itemTitle;
            const currentBid = parseFloat(target.dataset.currentBid);
            const increment = parseFloat(target.dataset.increment);
            openBidModal(itemId, itemTitle, currentBid, increment);
        }
        // Handle Image Clicks for Modal
        if (target.matches('.item-image')) {
            const imageUrl = target.src;
            openImageModal(imageUrl);
        }
        // Handle History Button Clicks
        if (target.matches('.history-button')) {
            const itemId = target.dataset.itemId;
            const itemTitle = target.dataset.itemTitle;
            openHistoryModal(itemId, itemTitle);
        }
         // Handle Buy Now Button Clicks
        if (target.matches('.buy-now-button')) {
            const itemId = target.dataset.itemId;
            const buyPrice = parseFloat(target.dataset.buyPrice);
            const itemTitle = target.dataset.itemTitle;
            if (confirm(`Are you sure you want to buy "${itemTitle}" now for $${buyPrice.toFixed(2)}?`)) {
                 const buyerName = prompt("Please enter your name:");
                 const buyerPhone = prompt("Please enter your phone number for verification:");
                 if (buyerName && buyerPhone) {
                     handleBuyNow(itemId, buyPrice, buyerName, buyerPhone.replace(/\D/g, ''));
                 } else {
                     alert("Name and phone number are required to Buy Now.");
                 }
            }
        }
    });

    // --- Sorting Logic ---
    sortDropdown.addEventListener('change', (e) => {
        currentSort = e.target.value;
        renderItems(allItems); // Re-render with the current items using the new sort
    });

    // --- Image Modal Logic ---
    function openImageModal(imageUrl) {
        modalImage.src = imageUrl;
        imageModal.classList.remove('hidden');
    }
    closeModal.onclick = () => imageModal.classList.add('hidden');
    imageModal.onclick = (e) => {
        if (e.target === imageModal) {
            imageModal.classList.add('hidden');
        }
    };

    // --- Bid Modal Logic (Enhanced Quick Bids) ---
    function openBidModal(itemId, itemTitle, currentBid, increment) {
        bidModalTitle.textContent = `Bid on: ${itemTitle}`;
        bidForm.dataset.itemId = itemId;
        bidForm.dataset.increment = increment; // Store increment for validation
        const minBid = (currentBid + increment);

        bidAmountInput.placeholder = `$${minBid.toFixed(2)}`;
        bidAmountInput.min = minBid.toFixed(2);
        bidAmountInput.step = increment;
        bidAmountInput.value = ''; // Clear previous input

        // Update Quick Bid buttons
        quickBidMinButton.textContent = `Bid $${minBid.toFixed(2)}`;
        quickBidMinButton.dataset.bidValue = minBid.toFixed(2);

        quickBidPlus1Button.textContent = `+ $${(increment * 1).toFixed(2)}`;
        quickBidPlus1Button.dataset.bidValue = (minBid + (increment * 1)).toFixed(2);

        quickBidPlus5Button.textContent = `+ $${(increment * 5).toFixed(2)}`;
        quickBidPlus5Button.dataset.bidValue = (minBid + (increment * 5)).toFixed(2);

        quickBidPlus10Button.textContent = `+ $${(increment * 10).toFixed(2)}`;
        quickBidPlus10Button.dataset.bidValue = (minBid + (increment * 10)).toFixed(2);


        // Clear old error messages
        document.getElementById('bid-error-message').textContent = '';

        bidModal.classList.remove('hidden');
    }
    bidModalClose.onclick = () => {
        bidModal.classList.add('hidden');
        bidForm.reset();
    };

    // Quick Bid Button Click Handlers (sets the input value)
    quickBidMinButton.addEventListener('click', () => {
        bidAmountInput.value = quickBidMinButton.dataset.bidValue;
    });
    quickBidPlus1Button.addEventListener('click', () => {
        bidAmountInput.value = quickBidPlus1Button.dataset.bidValue;
    });
     quickBidPlus5Button.addEventListener('click', () => {
        bidAmountInput.value = quickBidPlus5Button.dataset.bidValue;
    });
     quickBidPlus10Button.addEventListener('click', () => {
        bidAmountInput.value = quickBidPlus10Button.dataset.bidValue;
    });


    // Handle bid form submission
    bidForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const itemId = bidForm.dataset.itemId;
        const increment = parseFloat(bidForm.dataset.increment);
        placeBid(itemId, increment);
    });

    // --- History Modal Logic ---
    async function openHistoryModal(itemId, itemTitle) {
        const modalTitle = document.getElementById('history-modal-title');
        const modalContent = document.getElementById('history-modal-content');

        modalTitle.textContent = `History for ${itemTitle}`;
        modalContent.innerHTML = '<p class="text-gray-400">Loading history...</p>';
        historyModal.classList.remove('hidden');

        try {
            const bidsQuery = query(
                collection(db, 'auctionItems', itemId, 'bids'),
                where('status', '!=', 'rejected'), // Exclude rejected bids
                orderBy('timestamp', 'desc') // Get latest first for processing, will display differently
            );
            const snapshot = await getDocs(bidsQuery);
            if (snapshot.empty) {
                modalContent.innerHTML = '<p class="text-gray-400">No bids have been placed yet.</p>';
                return;
            }

            // Sort by amount descending for display
            const bids = snapshot.docs.map(doc => doc.data()).sort((a,b) => b.amount - a.amount);

            const bidsHtml = bids.map(bid => {
                // Anonymize bidder name: "David K." -> "D. K."
                const nameParts = bid.name.split(' ');
                const anonymizedName = nameParts.map((part, index) => {
                     // Keep the first name fully, initial for the rest
                    // return part.charAt(0).toUpperCase() + (index > 0 ? "." : part.slice(1));
                     if (index === 0) return part; // Keep first name
                     return part.charAt(0).toUpperCase() + ".";
                }).join(' ');

                // Display timestamp nicely
                const bidTime = bid.timestamp ? bid.timestamp.toDate().toLocaleString() : 'Just now';

                return `
                    <div class="flex justify-between items-center p-2 border-b border-yellow-300/10 text-sm">
                        <div>
                             <span class="font-semibold text-gray-200">${anonymizedName}</span>
                             <span class="text-xs text-gray-400 ml-2">${bidTime}</span>
                        </div>
                        <span class="text-brand-gold text-lg">$${bid.amount.toFixed(2)}</span>
                    </div>
                `;
            }).join('');
            modalContent.innerHTML = `<div class="space-y-1">${bidsHtml}</div>`;

        } catch (error) {
            console.error("Error fetching bid history:", error);
            modalContent.innerHTML = '<p class="text-red-400">Could not load bid history.</p>';
        }
    }
    closeHistoryModal.onclick = () => historyModal.classList.add('hidden');

    // --- Success Toast Logic ---
    let toastTimeout;
    function showToast(message) {
        clearTimeout(toastTimeout); // Clear any existing timer
        successMessage.textContent = message;
        successToast.classList.add('show');
        toastTimeout = setTimeout(() => {
            successToast.classList.remove('show');
        }, 3000); // Hide after 3 seconds
    }


    // --- Firestore Listener Setup ---
    function setupFirestoreListener() {
        // Detach any existing listener before creating a new one
        if (unsubscribe) {
            unsubscribe();
            console.log("Detached previous listener.");
        }

        // Base query - always get all items, sorting is done in memory
        const q = query(collection(db, 'auctionItems'));

        console.log("Setting up Firestore listener...");
        unsubscribe = onSnapshot(q, (snapshot) => {
            console.log(`Received ${snapshot.docs.length} items from Firestore.`);
            allItems = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderItems(allItems); // Render using the current sort order
        }, (error) => {
            console.error("Error fetching auction items: ", error);
            itemsContainer.innerHTML = '<p class="text-red-400 col-span-full text-center">Could not load auction items. Please try again later.</p>';
            allItems = []; // Clear local cache on error
        });
    }

    // --- Rendering Logic (Handles Sorting) ---
    function renderItems(items) {
        if (!itemsContainer) return;

        console.log(`Rendering ${items.length} items with sort: ${currentSort}`);

        if (items.length === 0) {
            itemsContainer.innerHTML = '<p class="text-gray-400 col-span-full text-center">No items are currently up for auction. Check back soon!</p>';
            return;
        }

        // Apply sorting
        const sortedItems = [...items].sort((a, b) => {
            switch (currentSort) {
                case 'endTimeDesc':
                    return (b.endTime?.toMillis() || 0) - (a.endTime?.toMillis() || 0);
                case 'currentBidDesc':
                    return (b.currentBid || 0) - (a.currentBid || 0);
                case 'currentBidAsc':
                    return (a.currentBid || 0) - (b.currentBid || 0);
                case 'endTimeAsc': // Default and explicit case
                default:
                    return (a.endTime?.toMillis() || 0) - (b.endTime?.toMillis() || 0);
            }
        });

        itemsContainer.innerHTML = ''; // Clear previous content

        // Stop existing timers before creating new ones
        clearAllItemTimers();

        sortedItems.forEach(item => {
            const itemElement = document.createElement('div');
            itemElement.className = 'item-card';
            const itemId = item.id;

            const now = new Date();
            const endTime = item.endTime?.toDate(); // Handle potential missing endTime
            let timeLeft = 'N/A';
            let canBid = false;

            if (endTime) {
                 timeLeft = endTime > now ? formatTimeLeft(endTime - now) : 'Bidding Ended';
                 canBid = endTime > now && item.status === 'active';
            } else {
                 timeLeft = 'End Time Not Set';
                 canBid = item.status === 'active'; // Allow bidding if no end time but active
            }


            const modelInfoHtml = (item.modelNumber && item.modelUrl)
                ? `<p class="text-gray-400 text-xs mt-1">Model: <a href="${item.modelUrl}" target="_blank" class="text-blue-400 hover:underline">${item.modelNumber}</a></p>`
                : (item.modelNumber ? `<p class="text-gray-400 text-xs mt-1">Model: ${item.modelNumber}</p>` : '');

            let buyNowHtml = '';
            // Only show Buy Now if price exists, auction is active AND current bid is less than Buy Now price
            if (item.buyItNowPrice && canBid && item.status === 'active' && item.currentBid < item.buyItNowPrice) {
                 buyNowHtml = `<button class="buy-now-button btn-velvet primary mt-2 w-full" data-item-id="${itemId}" data-buy-price="${item.buyItNowPrice}" data-item-title="${item.title}">Buy Now for $${item.buyItNowPrice.toFixed(2)}</button>`;
            }

            // Determine status display
            let statusDisplay = timeLeft;
            let statusColor = 'text-green-400';
             if (item.status !== 'active') {
                statusDisplay = item.status.replace('_', ' ').toUpperCase();
                statusColor = 'text-yellow-400'; // e.g., AWAITING PAYMENT
            } else if (!canBid && endTime) { // Ended naturally
                statusDisplay = 'Bidding Ended';
                statusColor = 'text-red-400';
            } else if (!endTime && item.status === 'active') { // Active but no end time
                 statusDisplay = 'Bidding Open';
                 statusColor = 'text-green-400';
             }


            itemElement.innerHTML = `
                <img src="${item.imageUrl}" alt="${item.title}" class="item-image cursor-pointer">
                <div class="p-4 flex flex-col flex-grow">
                    <h3 class="font-cinzel text-2xl text-brand-gold mb-2">${item.title}</h3>
                    <p class="text-gray-300 text-sm mb-4 flex-grow">${item.description}</p>
                    ${modelInfoHtml}
                    <div class="my-4 border-t border-yellow-300/10"></div>
                    <div class="grid grid-cols-2 gap-x-4 text-sm">
                        <div>
                            <p class="font-bold text-brand-gold">Current Bid:</p>
                            <p class="text-xl">$${(item.currentBid || 0).toFixed(2)}</p>
                        </div>
                        <div>
                            <p class="font-bold text-brand-gold">High Bidder:</p>
                            <p class="truncate">${item.highBidder || 'None'}</p>
                        </div>
                    </div>
                    <p class="text-center font-bold mt-4 ${statusColor}" data-timer-id="timer-${itemId}">${statusDisplay}</p>
                    ${canBid ? `
                    <div class="mt-4 flex flex-col items-center gap-2">
                         <div class="flex justify-between items-center gap-4 w-full">
                            <button class="bid-button flex-1" data-item-id="${itemId}" data-item-title="${item.title}" data-current-bid="${item.currentBid || item.startBid || 0}" data-increment="${item.increment || 1}">Place Bid</button>
                            <button class="history-button text-xs text-blue-400 hover:underline" data-item-id="${itemId}" data-item-title="${item.title}">View History</button>
                        </div>
                        ${buyNowHtml}
                    </div>` : ''}
                </div>
            `;
            itemsContainer.appendChild(itemElement);

            // Setup timer only if the item is active and has an end time in the future
            if (canBid && endTime && endTime > now) {
                setupItemTimer(itemId, endTime);
            }
        });
    }


    // --- Timer Management ---
    const itemTimers = {}; // Store interval IDs: { itemId: intervalId }

    function setupItemTimer(itemId, endTime) {
        const timerId = `timer-${itemId}`;
        const timerSpan = itemsContainer.querySelector(`[data-timer-id="${timerId}"]`); // Use attribute selector

        if (timerSpan) {
            // Clear existing timer for this item if any
            if (itemTimers[itemId]) {
                clearInterval(itemTimers[itemId]);
            }

            // Create new timer
            itemTimers[itemId] = setInterval(() => {
                const now = new Date();
                if (endTime > now) {
                    const newTimeLeft = formatTimeLeft(endTime - now);
                    timerSpan.textContent = newTimeLeft;
                    timerSpan.classList.remove('text-red-400');
                    timerSpan.classList.add('text-green-400');
                } else {
                    timerSpan.textContent = 'Bidding Ended';
                    timerSpan.classList.remove('text-green-400');
                    timerSpan.classList.add('text-red-400');
                    clearInterval(itemTimers[itemId]);
                    delete itemTimers[itemId];
                    // Optionally: Disable bid buttons here if needed, though renderItems should handle it on next update
                    const card = timerSpan.closest('.item-card');
                    if (card) {
                       card.querySelector('.bid-button')?.remove();
                       card.querySelector('.buy-now-button')?.remove();
                    }
                }
            }, 1000);
        } else {
             console.warn(`Timer span not found for item ${itemId}`);
        }
    }

    function clearAllItemTimers() {
        console.log("Clearing all item timers...");
        Object.values(itemTimers).forEach(clearInterval);
        // Clear the object itself
        for (const key in itemTimers) {
            delete itemTimers[key];
        }
    }


    // --- Initial Setup ---
    if (timestampContainer) {
        timestampContainer.textContent = `Build: ${new Date().toLocaleString()}`;
    }
    setupFirestoreListener(); // Start listening

}); // End DOMContentLoaded

// --- Helper & Utility Functions ---

async function fetchAuctionSettings() {
    try {
        const settingsRef = doc(db, 'settings', 'auction');
        const docSnap = await getDoc(settingsRef);
        if (docSnap.exists()) {
            knownFamilyNumbers = docSnap.data().approvedNumbers || [];
            console.log(`Loaded ${knownFamilyNumbers.length} approved phone numbers.`);
            if (knownFamilyNumbers.length === 0) {
                 console.warn("Auction settings 'approvedNumbers' array is empty in Firestore.");
            }
        } else {
            console.error("CRITICAL: 'settings/auction' document not found in Firestore. Bidder verification will fail.");
        }
    } catch (error) {
        console.error("Error fetching auction settings:", error);
    }
}

function formatTimeLeft(ms) {
    if (ms <= 0) return 'Bidding Ended';
    let seconds = Math.floor(ms / 1000);
    let minutes = Math.floor(seconds / 60);
    let hours = Math.floor(minutes / 60);
    let days = Math.floor(hours / 24);

    hours %= 24;
    minutes %= 60;
    seconds %= 60;

    let parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (seconds >= 0) parts.push(`${seconds}s`); // Show seconds even if 0 when it's the smallest unit left

    return parts.join(' ') || '0s'; // Ensure at least '0s' is shown
}

// --- Bidding and Buy Now Logic ---

// placeBid function (Enhanced with Success Toast)
async function placeBid(itemId, increment) {
    const bidAmountInput = document.getElementById('bid-amount');
    const bidderNameInput = document.getElementById('bidder-name');
    const bidderPhoneInput = document.getElementById('bidder-phone');
    const submitButton = document.getElementById('submit-bid-button');
    const errorMessage = document.getElementById('bid-error-message');

    errorMessage.textContent = '';
    submitButton.disabled = true;
    submitButton.textContent = 'Submitting...';

    const newBidAmount = parseFloat(bidAmountInput.value);
    const bidderName = bidderNameInput.value.trim();
    const bidderPhone = bidderPhoneInput.value.replace(/\D/g, '');

    // Phone number verification moved inside transaction for consistency check
    // Basic client-side checks remain
     if (!bidderName || isNaN(newBidAmount) || newBidAmount <= 0) {
         errorMessage.textContent = "Please provide a valid name and bid amount.";
         submitButton.disabled = false;
         submitButton.textContent = 'Submit Bid';
         return;
     }

    try {
        const itemRef = doc(db, 'auctionItems', itemId);

        await runTransaction(db, async (transaction) => {
            // Verify phone number *inside* transaction using potentially updated settings
            const settingsRef = doc(db, 'settings', 'auction');
            const settingsSnap = await transaction.get(settingsRef); // Use transaction.get
            const currentApprovedNumbers = settingsSnap.exists() ? settingsSnap.data().approvedNumbers || [] : [];

            if (currentApprovedNumbers.length === 0) {
                 throw new Error("Verification system offline. Contact admin.");
            }
             if (!currentApprovedNumbers.includes(bidderPhone)) {
                 throw new Error("Phone number not recognized. Use a family number.");
             }

            // Get current item data
            const itemDoc = await transaction.get(itemRef);
            if (!itemDoc.exists()) {
                throw new Error("Auction item not found.");
            }
            const item = itemDoc.data();

            // Validate status and time
            if (item.status !== 'active') {
                throw new Error("Bidding is closed for this item.");
            }
            const now = Timestamp.now();
            if (item.endTime && item.endTime.toMillis() < now.toMillis()) {
                 throw new Error("Auction has already ended.");
            }


            // Validate bid amount
            const currentBid = item.currentBid || 0;
            if (newBidAmount <= currentBid) {
                throw new Error(`Your bid must be higher than the current $${currentBid.toFixed(2)}.`);
            }
            const minBid = currentBid + (item.increment || 1); // Use item's increment or default to 1
            if (newBidAmount < minBid) {
                throw new Error(`Minimum bid is now $${minBid.toFixed(2)}.`);
            }
             // Check against Buy Now price if it exists
             if (item.buyItNowPrice && newBidAmount >= item.buyItNowPrice) {
                  throw new Error(`Bid amount meets or exceeds Buy Now price ($${item.buyItNowPrice.toFixed(2)}). Use Buy Now instead.`);
             }


            // All checks passed, perform writes
            const bidsRef = collection(itemRef, 'bids');
            const newBidRef = doc(bidsRef);

            transaction.set(newBidRef, {
                name: bidderName,
                phone: bidderPhone, // Store cleaned phone number
                amount: newBidAmount,
                timestamp: serverTimestamp(), // Use server timestamp
                status: 'active'
            });

            transaction.update(itemRef, {
                currentBid: newBidAmount,
                highBidder: bidderName
            });
        });

        // Success!
        document.getElementById('bid-form').reset();
        document.getElementById('bid-modal').classList.add('hidden');
        // --- Show Success Toast ---
        showToast("Bid placed successfully!");

    } catch (error) {
        console.error("Error placing bid: ", error);
        errorMessage.textContent = `Failed: ${error.message}`;
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = 'Submit Bid';
    }
}

// handleBuyNow function (Includes Success Toast)
async function handleBuyNow(itemId, buyPrice, buyerName, buyerPhone) {
    // Quick client-side check (already fetched)
    if (knownFamilyNumbers.length === 0) {
        alert("Verification system is offline. Cannot complete purchase.");
        return;
    }
    if (!knownFamilyNumbers.includes(buyerPhone)) {
        alert("Phone number not recognized. Please use a family number.");
        return;
    }

    const itemRef = doc(db, 'auctionItems', itemId);
    try {
        await runTransaction(db, async (transaction) => {
            // Re-verify phone number inside transaction
            const settingsRef = doc(db, 'settings', 'auction');
            const settingsSnap = await transaction.get(settingsRef);
            const currentApprovedNumbers = settingsSnap.exists() ? settingsSnap.data().approvedNumbers || [] : [];
            if (!currentApprovedNumbers.includes(buyerPhone)) {
                 throw new Error("Phone number not recognized."); // More concise error for transaction
            }


            const itemDoc = await transaction.get(itemRef);
            if (!itemDoc.exists()) {
                throw new Error("Auction item not found.");
            }
            const itemData = itemDoc.data();

            // Double-check conditions inside transaction
            if (itemData.status !== 'active') {
                throw new Error("Item is no longer available.");
            }
            if (!itemData.buyItNowPrice || itemData.buyItNowPrice !== buyPrice) {
                throw new Error("Buy Now price unavailable or changed.");
            }
             const now = Timestamp.now();
             if (itemData.endTime && itemData.endTime.toMillis() < now.toMillis()) {
                 throw new Error("Auction has already ended.");
             }
             if (itemData.currentBid >= buyPrice) {
                  throw new Error("Current bid has already met or exceeded the Buy Now price.");
             }


            // Mark as sold!
            transaction.update(itemRef, {
                status: 'awaiting_payment',
                currentBid: buyPrice,
                highBidder: buyerName,
                endTime: now // End the auction immediately
            });

             // Add a record to bids subcollection
             const bidsRef = collection(itemRef, 'bids');
             const buyNowBidRef = doc(bidsRef);
             transaction.set(buyNowBidRef, {
                 name: buyerName,
                 phone: buyerPhone,
                 amount: buyPrice,
                 timestamp: now,
                 status: 'buy_now'
             });
        });

        // --- Show Success Toast ---
        showToast(`Item purchased successfully by ${buyerName}!`);
        // UI will update via onSnapshot

    } catch (error) {
        console.error("Error during Buy Now:", error);
        alert(`Could not complete purchase: ${error.message}`);
    }
}


/* Build Timestamp: Thu Oct 23 2025 13:00:00 GMT-0600 (Mountain Daylight Time) */
/* /auction.js */
