/* /auction.js */
import { db } from './firebase-config.js';
import { collection, doc, onSnapshot, orderBy, runTransaction, query, where, getDocs, getDoc, addDoc, serverTimestamp, Timestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// --- Global State ---
// REMOVED: let knownFamilyNumbers = []; // We will check inside transaction now
let currentSort = 'endTimeAsc'; // Default sort order
let allItems = []; // To store fetched items for in-memory sorting
let unsubscribe = null; // To hold the listener cancellation function
const itemTimers = {}; // Store interval IDs: { itemId: intervalId }

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

    // REMOVED: fetchAuctionSettings(); // No longer needed at page load

    if (!itemsContainer) {
        console.error('Error: Auction items container not found.');
        return;
    }

    // --- Event Delegation for Clicks on Item Cards ---
    itemsContainer.addEventListener('click', function(event) {
        const target = event.target;
        const itemCard = target.closest('.item-card'); // Get the parent card

        // Handle Bid Button Clicks
        if (target.matches('.bid-button')) {
            const itemId = target.dataset.itemId;
            // Find the corresponding item data from our local cache
            const itemData = allItems.find(item => item.id === itemId);
            if (!itemData) return; // Should not happen if rendering is correct

            const itemTitle = itemData.title || 'Item';
            const currentBid = parseFloat(itemData.currentBid || itemData.startBid || 0);
            const increment = parseFloat(itemData.increment || 1);
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
            const itemTitle = target.dataset.itemTitle || 'Item'; // Get title from button data
            openHistoryModal(itemId, itemTitle);
        }
         // Handle Buy Now Button Clicks
        if (target.matches('.buy-now-button')) {
            const itemId = target.dataset.itemId;
            const buyPrice = parseFloat(target.dataset.buyPrice);
            const itemTitle = target.dataset.itemTitle || 'Item'; // Get title from button data
            if (confirm(`Are you sure you want to buy "${itemTitle}" now for $${buyPrice.toFixed(2)}?`)) {
                 const buyerName = prompt("Please enter your name:");
                 const buyerPhone = prompt("Please enter your phone number for verification:");
                 if (buyerName && buyerPhone) {
                     // Pass the raw phone input, cleaning happens inside handleBuyNow
                     handleBuyNow(itemId, buyPrice, buyerName, buyerPhone);
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
        if (!imageUrl) return;
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
        // Ensure increment has a valid default
        const validIncrement = increment > 0 ? increment : 1;
        bidForm.dataset.increment = validIncrement;

        const minBid = (currentBid + validIncrement);

        bidAmountInput.placeholder = `$${minBid.toFixed(2)}`;
        bidAmountInput.min = minBid.toFixed(2);
        bidAmountInput.step = validIncrement;
        bidAmountInput.value = ''; // Clear previous input

        // Update Quick Bid buttons using validIncrement
        quickBidMinButton.textContent = `Bid $${minBid.toFixed(2)}`;
        quickBidMinButton.dataset.bidValue = minBid.toFixed(2);

        // --- Correct Quick Bid Calculations ---
        // Increments should be added to the *current* input value, or the min bid if empty
        // We'll handle the calculation logic in the event listeners directly.
        quickBidPlus1Button.textContent = `+ $${(validIncrement * 1).toFixed(2)}`;
        quickBidPlus1Button.dataset.incrementValue = (validIncrement * 1);

        quickBidPlus5Button.textContent = `+ $${(validIncrement * 5).toFixed(2)}`;
        quickBidPlus5Button.dataset.incrementValue = (validIncrement * 5);

        quickBidPlus10Button.textContent = `+ $${(validIncrement * 10).toFixed(2)}`;
        quickBidPlus10Button.dataset.incrementValue = (validIncrement * 10);
        // --- End Corrected Calculations ---


        // Clear old error messages
        document.getElementById('bid-error-message').textContent = '';

        bidModal.classList.remove('hidden');
        bidAmountInput.focus(); // Focus the input field
    }
    bidModalClose.onclick = () => {
        bidModal.classList.add('hidden');
        bidForm.reset();
    };

    // --- UPDATED Quick Bid Button Click Handlers ---
    function handleQuickBidIncrement(button) {
        const incrementAmount = parseFloat(button.dataset.incrementValue || 0);
        const currentInputValue = parseFloat(bidAmountInput.value || bidAmountInput.min || 0);
        const newBidValue = currentInputValue + incrementAmount;
        // Ensure it meets the minimum bid requirement
        const minBidRequired = parseFloat(bidAmountInput.min || 0);
        bidAmountInput.value = Math.max(newBidValue, minBidRequired).toFixed(2);
    }

    quickBidMinButton.addEventListener('click', () => {
        bidAmountInput.value = quickBidMinButton.dataset.bidValue;
    });
    quickBidPlus1Button.addEventListener('click', () => handleQuickBidIncrement(quickBidPlus1Button));
    quickBidPlus5Button.addEventListener('click', () => handleQuickBidIncrement(quickBidPlus5Button));
    quickBidPlus10Button.addEventListener('click', () => handleQuickBidIncrement(quickBidPlus10Button));
     // --- End UPDATED Quick Bid Handlers ---


    // Handle bid form submission
    bidForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const itemId = bidForm.dataset.itemId;
        // Retrieve increment from dataset, ensuring it's valid
        const increment = parseFloat(bidForm.dataset.increment || 1);
        placeBid(itemId, increment > 0 ? increment : 1);
    });

    // --- History Modal Logic ---
    async function openHistoryModal(itemId, itemTitle) {
        const modalTitle = document.getElementById('history-modal-title');
        const modalContent = document.getElementById('history-modal-content');

        modalTitle.textContent = `History for ${itemTitle || 'Item'}`;
        modalContent.innerHTML = '<p class="text-gray-400">Loading history...</p>';
        historyModal.classList.remove('hidden');

        try {
            // Index should handle this query now
            const bidsQuery = query(
                collection(db, 'auctionItems', itemId, 'bids'),
                where('status', '!=', 'rejected'), // Exclude rejected bids
                orderBy('timestamp', 'desc') // Get latest first for processing
            );
            const snapshot = await getDocs(bidsQuery);
            if (snapshot.empty) {
                modalContent.innerHTML = '<p class="text-gray-400">No bids have been placed yet.</p>';
                return;
            }

            // Sort by amount descending for display
            const bids = snapshot.docs.map(doc => doc.data()).sort((a,b) => b.amount - a.amount);

            const bidsHtml = bids.map(bid => {
                // Anonymize bidder name more simply
                const nameParts = (bid.name || 'Anonymous').split(' ');
                const anonymizedName = nameParts.length > 1
                    ? `${nameParts[0]} ${nameParts[nameParts.length - 1].charAt(0)}.`
                    : nameParts[0];

                // Display timestamp nicely
                const bidTime = bid.timestamp?.toDate()?.toLocaleString() ?? 'Unknown time';

                return `
                    <div class="flex justify-between items-center p-2 border-b border-yellow-300/10 text-sm">
                        <div>
                             <span class="font-semibold text-gray-200">${anonymizedName}</span>
                             <span class="text-xs text-gray-400 ml-2">${bidTime}</span>
                        </div>
                        <span class="text-brand-gold text-lg">$${(bid.amount || 0).toFixed(2)}</span>
                    </div>
                `;
            }).join('');
            modalContent.innerHTML = `<div class="space-y-1">${bidsHtml}</div>`;

        } catch (error) {
            console.error(`Error fetching bid history for ${itemId}:`, error);
            modalContent.innerHTML = '<p class="text-red-400">Could not load bid history. Check console for index errors.</p>';
        }
    }
    closeHistoryModal.onclick = () => historyModal.classList.add('hidden');

    // --- Success Toast Logic ---
    let toastTimeout;
    function showToast(message) {
        if (!successToast || !successMessage) return; // Guard against missing elements
        clearTimeout(toastTimeout);
        successMessage.textContent = message;
        successToast.classList.add('show');
        toastTimeout = setTimeout(() => {
            successToast.classList.remove('show');
        }, 3000);
    }


    // --- Firestore Listener Setup ---
    function setupFirestoreListener() {
        if (unsubscribe) {
            try { unsubscribe(); } catch (e) { console.warn("Error unsubscribing:", e); }
            console.log("Detached previous listener.");
        }

        const q = query(collection(db, 'auctionItems'));

        console.log("Setting up Firestore listener...");
        unsubscribe = onSnapshot(q, (snapshot) => {
            console.log(`Received ${snapshot.docs.length} items from Firestore.`);
            // Clear previous timers before processing new data
            clearAllItemTimers();
            allItems = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderItems(allItems);
        }, (error) => {
            console.error("Error fetching auction items: ", error);
            itemsContainer.innerHTML = '<p class="text-red-400 col-span-full text-center">Could not load auction items. Please check console and try again later.</p>';
            allItems = [];
            clearAllItemTimers(); // Clear timers on error too
        });
    }

    // --- Rendering Logic (Handles Sorting & Timers) ---
    function renderItems(items) {
        if (!itemsContainer) return;

        console.log(`Rendering ${items.length} items with sort: ${currentSort}`);

        if (items.length === 0) {
            itemsContainer.innerHTML = '<p class="text-gray-400 col-span-full text-center">No items are currently up for auction. Check back soon!</p>';
            return;
        }

        // Apply sorting (ensure safe access to properties)
        const sortedItems = [...items].sort((a, b) => {
            const endTimeA = a.endTime?.toMillis() ?? 0;
            const endTimeB = b.endTime?.toMillis() ?? 0;
            const bidA = a.currentBid ?? 0;
            const bidB = b.currentBid ?? 0;

            switch (currentSort) {
                case 'endTimeDesc': return endTimeB - endTimeA;
                case 'currentBidDesc': return bidB - bidA;
                case 'currentBidAsc': return bidA - bidB;
                case 'endTimeAsc': default: return endTimeA - endTimeB;
            }
        });

        // Use DocumentFragment for performance
        const fragment = document.createDocumentFragment();

        sortedItems.forEach(item => {
            try { // Add try...catch around each item rendering
                const itemElement = document.createElement('div');
                itemElement.className = 'item-card';
                const itemId = item.id;

                // --- Safe Defaults ---
                const title = item.title || 'Untitled Item';
                const description = item.description || 'No description available.';
                const imageUrl = item.imageUrl || 'https://placehold.co/600x400/2a0000/fde047?text=No+Image';
                const currentBidValue = item.currentBid ?? item.startBid ?? 0;
                const startBidValue = item.startBid ?? 0;
                const incrementValue = item.increment ?? 1;
                const highBidderName = item.highBidder || 'None';
                const buyNowPriceValue = item.buyItNowPrice; // Can be null/undefined
                const itemStatus = item.status || 'active';

                const now = new Date();
                const endTime = item.endTime?.toDate(); // Safely convert potential Timestamp
                let timeLeft = 'N/A';
                let canBid = false;

                if (endTime instanceof Date && !isNaN(endTime)) {
                    timeLeft = endTime > now ? formatTimeLeft(endTime - now) : 'Bidding Ended';
                    canBid = endTime > now && itemStatus === 'active';
                } else if (!endTime && itemStatus === 'active') { // Handle active items with no end time
                    timeLeft = 'Bidding Open Indefinitely';
                    canBid = true; // Allow bidding if active without end time
                } else { // Handle items with invalid end times or non-active status without end times
                    timeLeft = itemStatus !== 'active' ? itemStatus.replace('_', ' ').toUpperCase() : 'Invalid Date';
                    canBid = false;
                }

                const modelInfoHtml = (item.modelNumber && item.modelUrl)
                    ? `<p class="text-gray-400 text-xs mt-1">Model: <a href="${item.modelUrl}" target="_blank" class="text-blue-400 hover:underline">${item.modelNumber}</a></p>`
                    : (item.modelNumber ? `<p class="text-gray-400 text-xs mt-1">Model: ${item.modelNumber}</p>` : '');

                let buyNowHtml = '';
                // Only show Buy Now if price exists, auction is active AND current bid is less than Buy Now price
                if (buyNowPriceValue && canBid && currentBidValue < buyNowPriceValue) {
                    buyNowHtml = `<button class="buy-now-button btn-velvet primary mt-2 w-full" data-item-id="${itemId}" data-buy-price="${buyNowPriceValue}" data-item-title="${title}">Buy Now for $${buyNowPriceValue.toFixed(2)}</button>`;
                }

                // Determine status display
                let statusDisplay = timeLeft;
                let statusColor = 'text-green-400';
                if (itemStatus !== 'active') {
                    statusDisplay = itemStatus.replace('_', ' ').toUpperCase();
                    statusColor = 'text-yellow-400'; // awaiting_payment or paid
                    canBid = false; // Ensure bidding is off if not active
                } else if (!canBid && endTime) { // Ended naturally
                    statusDisplay = 'Bidding Ended';
                    statusColor = 'text-red-400';
                } else if (!endTime && itemStatus === 'active') { // Active but no end time
                    statusDisplay = 'Bidding Open'; // Changed from 'Indefinitely'
                    statusColor = 'text-green-400';
                } else if (canBid && endTime) { // Active and counting down
                     statusDisplay = timeLeft; // Will be updated by timer
                     statusColor = 'text-green-400';
                }

                itemElement.innerHTML = `
                    <img src="${imageUrl}" alt="${title}" class="item-image cursor-pointer w-full h-64 object-cover">
                    <div class="p-4 flex flex-col flex-grow">
                        <h3 class="font-cinzel text-2xl text-brand-gold mb-2">${title}</h3>
                        <p class="text-gray-300 text-sm mb-4 flex-grow">${description}</p>
                        ${modelInfoHtml}
                        <div class="my-4 border-t border-yellow-300/10"></div>
                        <div class="grid grid-cols-2 gap-x-4 text-sm">
                            <div>
                                <p class="font-bold text-brand-gold">Current Bid:</p>
                                <p class="text-xl">$${currentBidValue.toFixed(2)}</p>
                            </div>
                            <div>
                                <p class="font-bold text-brand-gold">High Bidder:</p>
                                <p class="truncate">${highBidderName}</p>
                            </div>
                        </div>
                        <p class="text-center font-bold mt-4 ${statusColor}" data-timer-id="timer-${itemId}">${statusDisplay}</p>
                        ${canBid ? `
                        <div class="mt-4 flex flex-col items-center gap-2">
                            <div class="flex justify-between items-center gap-4 w-full">
                                <button class="bid-button flex-1" data-item-id="${itemId}">Place Bid</button> <!-- Removed extra data, retrieve from allItems -->
                                <button class="history-button text-xs text-blue-400 hover:underline" data-item-id="${itemId}" data-item-title="${title}">View History</button>
                            </div>
                            ${buyNowHtml}
                        </div>` : ''}
                    </div>
                `;
                fragment.appendChild(itemElement);

                // Setup timer *after* element is potentially ready to be added to DOM
                if (canBid && endTime instanceof Date && !isNaN(endTime) && endTime > now) {
                     // Pass the element directly to avoid querySelector issues before append
                    setupItemTimer(itemId, endTime, itemElement.querySelector(`[data-timer-id="timer-${itemId}"]`));
                }
            } catch (renderError) {
                 console.error(`Error rendering item ${item.id}:`, renderError, item);
                 // Optionally create an error placeholder card
                 const errorElement = document.createElement('div');
                 errorElement.className = 'item-card border-red-500 p-4 text-center';
                 errorElement.innerHTML = `<p class="text-red-400">Error loading this item.</p><p class="text-xs text-gray-500">ID: ${item.id}</p>`;
                 fragment.appendChild(errorElement);
            }
        });

        // Append all items at once
        itemsContainer.innerHTML = ''; // Clear container *before* appending fragment
        itemsContainer.appendChild(fragment);
    }


    // --- Timer Management ---
    function setupItemTimer(itemId, endTime, timerSpanElement) {
        // Now receives the specific span element
        if (!timerSpanElement) {
             console.warn(`Timer span element not provided for item ${itemId}`);
             return; // Exit if the element wasn't found/passed
        }

         // Clear existing timer for this item if any
        if (itemTimers[itemId]) {
            clearInterval(itemTimers[itemId]);
        }

        // Create new timer
        itemTimers[itemId] = setInterval(() => {
            const now = new Date();
            if (endTime > now) {
                const newTimeLeft = formatTimeLeft(endTime - now);
                timerSpanElement.textContent = newTimeLeft;
                timerSpanElement.className = timerSpanElement.className.replace(/text-(red|yellow)-400/, 'text-green-400'); // Ensure green
            } else {
                timerSpanElement.textContent = 'Bidding Ended';
                timerSpanElement.className = timerSpanElement.className.replace(/text-(green|yellow)-400/, 'text-red-400'); // Ensure red
                clearInterval(itemTimers[itemId]);
                delete itemTimers[itemId];
                // Remove buttons if they exist and change status text
                 const card = timerSpanElement.closest('.item-card');
                 if (card) {
                    card.querySelector('.bid-button')?.remove();
                    card.querySelector('.buy-now-button')?.remove();
                 }
            }
        }, 1000);
    }

    function clearAllItemTimers() {
        console.log(`Clearing ${Object.keys(itemTimers).length} item timers...`);
        Object.values(itemTimers).forEach(clearInterval);
        // Clear the object itself more safely
        for (const key in itemTimers) {
            if (Object.hasOwnProperty.call(itemTimers, key)) {
                 delete itemTimers[key];
            }
        }
    }


    // --- Initial Setup ---
    if (timestampContainer) {
        timestampContainer.textContent = `Build: ${new Date().toLocaleString()}`;
    }
    setupFirestoreListener(); // Start listening

}); // End DOMContentLoaded

// --- Helper & Utility Functions ---

// REMOVED: fetchAuctionSettings() // No longer needed

function formatTimeLeft(ms) {
    if (ms <= 0) return 'Bidding Ended';
    let totalSeconds = Math.floor(ms / 1000);
    if (totalSeconds < 0) return 'Bidding Ended'; // Safety check

    let days = Math.floor(totalSeconds / (3600 * 24));
    totalSeconds %= (3600 * 24);
    let hours = Math.floor(totalSeconds / 3600);
    totalSeconds %= 3600;
    let minutes = Math.floor(totalSeconds / 60);
    let seconds = totalSeconds % 60;

    let parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    // Show seconds only if less than a minute remaining
    if (days === 0 && hours === 0 && minutes === 0) {
        parts.push(`${seconds}s`);
    }

    return parts.join(' ') || '0s'; // Handle case where all parts might be zero briefly
}


// --- Bidding and Buy Now Logic ---

// --- UPDATED placeBid ---
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
    // Clean phone number right away
    const bidderPhone = bidderPhoneInput.value.replace(/\D/g, '');

    // Basic client-side checks
    if (!bidderName || !bidderPhone || isNaN(newBidAmount) || newBidAmount <= 0) {
        errorMessage.textContent = "Valid name, phone, and bid amount required.";
        submitButton.disabled = false;
        submitButton.textContent = 'Submit Bid';
        return;
    }

    try {
        const itemRef = doc(db, 'auctionItems', itemId);
        const settingsRef = doc(db, 'settings', 'auction'); // Define settingsRef here

        await runTransaction(db, async (transaction) => {
            // Get settings *inside* transaction
            const settingsSnap = await transaction.get(settingsRef);
            const currentApprovedNumbers = settingsSnap.exists() ? settingsSnap.data().approvedNumbers || [] : [];

            // Add detailed logging
            console.log(`Checking phone: "${bidderPhone}" against list:`, currentApprovedNumbers);

            if (!Array.isArray(currentApprovedNumbers)) {
                 console.error("approvedNumbers in Firestore is not an array:", currentApprovedNumbers);
                 throw new Error("Verification system error (data format).");
            }
            if (currentApprovedNumbers.length === 0) {
                 console.warn("approvedNumbers array in Firestore is empty.");
                 throw new Error("Verification system offline (no numbers).");
            }
            // Perform the check
            if (!currentApprovedNumbers.includes(bidderPhone)) {
                 console.log(`Phone "${bidderPhone}" NOT found in approved list.`);
                 throw new Error("Phone number not recognized.");
            }
             console.log(`Phone "${bidderPhone}" IS found in approved list.`);


            // Get current item data
            const itemDoc = await transaction.get(itemRef);
            if (!itemDoc.exists()) throw new Error("Auction item not found.");
            const item = itemDoc.data();

            // Validate status and time
            if (item.status !== 'active') throw new Error("Bidding is closed for this item.");
            const now = Timestamp.now();
            const endTime = item.endTime; // Assume it's a Timestamp or null
            if (endTime && endTime.toMillis() < now.toMillis()) throw new Error("Auction has already ended.");

            // Validate bid amount
            const currentBid = item.currentBid ?? item.startBid ?? 0; // Use nullish coalescing
            const validIncrement = (item.increment ?? 1) > 0 ? (item.increment ?? 1) : 1; // Ensure increment > 0
            if (newBidAmount <= currentBid) throw new Error(`Bid must be > $${currentBid.toFixed(2)}.`);
            const minBid = currentBid + validIncrement;
            if (newBidAmount < minBid) throw new Error(`Minimum bid is now $${minBid.toFixed(2)}.`);
            // Check against Buy Now price *if* it exists
            if (item.buyItNowPrice && newBidAmount >= item.buyItNowPrice) {
                 throw new Error(`Bid meets/exceeds Buy Now ($${item.buyItNowPrice.toFixed(2)}). Use Buy Now instead.`);
            }


            // Writes
            const bidsRef = collection(itemRef, 'bids');
            const newBidRef = doc(bidsRef);
            transaction.set(newBidRef, { name: bidderName, phone: bidderPhone, amount: newBidAmount, timestamp: serverTimestamp(), status: 'active' });
            transaction.update(itemRef, { currentBid: newBidAmount, highBidder: bidderName });
        });

        // Success
        document.getElementById('bid-form').reset();
        document.getElementById('bid-modal').classList.add('hidden');
        showToast("Bid placed successfully!");

    } catch (error) {
        console.error("Error placing bid: ", error);
        errorMessage.textContent = `Failed: ${error.message}`; // Display specific error from transaction
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = 'Submit Bid';
    }
}
// --- End UPDATED placeBid ---


// --- UPDATED handleBuyNow ---
async function handleBuyNow(itemId, buyPrice, buyerName, buyerPhoneRaw) {
    // Clean phone number immediately
    const buyerPhone = buyerPhoneRaw.replace(/\D/g, '');

     // Basic client-side checks
    if (!buyerName || !buyerPhone) {
        alert("Valid name and phone number required.");
        return;
    }


    const itemRef = doc(db, 'auctionItems', itemId);
    const settingsRef = doc(db, 'settings', 'auction'); // Define settingsRef here

    try {
        await runTransaction(db, async (transaction) => {
             // Get settings *inside* transaction
            const settingsSnap = await transaction.get(settingsRef);
            const currentApprovedNumbers = settingsSnap.exists() ? settingsSnap.data().approvedNumbers || [] : [];

             // Add detailed logging
            console.log(`(Buy Now) Checking phone: "${buyerPhone}" against list:`, currentApprovedNumbers);

             if (!Array.isArray(currentApprovedNumbers)) throw new Error("Verification system error.");
             if (currentApprovedNumbers.length === 0) throw new Error("Verification system offline.");
             if (!currentApprovedNumbers.includes(buyerPhone)) {
                  console.log(`(Buy Now) Phone "${buyerPhone}" NOT found in approved list.`);
                  throw new Error("Phone number not recognized.");
             }
             console.log(`(Buy Now) Phone "${buyerPhone}" IS found in approved list.`);


            const itemDoc = await transaction.get(itemRef);
            if (!itemDoc.exists()) throw new Error("Auction item not found.");
            const itemData = itemDoc.data();

            // Conditions check
            if (itemData.status !== 'active') throw new Error("Item is no longer available.");
            if (!itemData.buyItNowPrice || itemData.buyItNowPrice !== buyPrice) throw new Error("Buy Now price unavailable/changed.");
            const now = Timestamp.now();
            const endTime = itemData.endTime;
            if (endTime && endTime.toMillis() < now.toMillis()) throw new Error("Auction has already ended.");
             // Allow Buy Now even if currentBid >= startBid, but not if currentBid >= buyPrice
             const currentBid = itemData.currentBid ?? itemData.startBid ?? 0;
            if (currentBid >= buyPrice) throw new Error("Bid already met/exceeded Buy Now price.");

            // Mark as sold - Set endTime to now to stop timers immediately
            transaction.update(itemRef, { status: 'awaiting_payment', currentBid: buyPrice, highBidder: buyerName, endTime: now });

            // Add bid record
            const bidsRef = collection(itemRef, 'bids');
            const buyNowBidRef = doc(bidsRef);
            transaction.set(buyNowBidRef, { name: buyerName, phone: buyerPhone, amount: buyPrice, timestamp: now, status: 'buy_now' });
        });

        showToast(`Item purchased successfully by ${buyerName}!`);

    } catch (error) {
        console.error("Error during Buy Now:", error);
        alert(`Could not complete purchase: ${error.message}`);
    }
}
// --- End UPDATED handleBuyNow ---

/* Build Timestamp: Thu Oct 23 2025 13:23:00 GMT-0600 (Mountain Daylight Time) */
/* /auction.js */

