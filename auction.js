/* /auction.js */
// This is the PUBLIC-FACING script for auction.html

import { db, auth } from './firebase-config.js';
import {
    collection,
    query,
    onSnapshot,
    orderBy, // Keep orderBy for bids subcollection
    doc,
    runTransaction,
    serverTimestamp,
    Timestamp,
    getDocs
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
// --- MODIFIED IMPORTS ---
import { onAuthStateChanged, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
// --- END MODIFIED IMPORTS ---

// --- DOM Elements ---
const auctionItemsContainer = document.getElementById('auction-items-container');
const sortItemsSelect = document.getElementById('sort-items');
const timestampContainer = document.getElementById('build-timestamp');
// --- NEW DOM Elements for Completed Items ---
const completedItemsSection = document.getElementById('completed-items-section');
const completedItemsContainer = document.getElementById('completed-items-container');
// --- END NEW ---

// Image Modal
const imageModal = document.getElementById('image-modal');
const closeImageModalBtn = document.getElementById('close-image-modal');
const modalImage = document.getElementById('modal-image');

// Bid Modal
const bidModal = document.getElementById('bid-modal');
const closeBidModalBtn = document.getElementById('close-bid-modal');
const bidModalTitle = document.getElementById('bid-modal-title');
const bidForm = document.getElementById('bid-form');
const bidAmountInput = document.getElementById('bid-amount');
const bidderNameInput = document.getElementById('bidder-name');
const bidderPhoneInput = document.getElementById('bidder-phone');
const bidErrorMessage = document.getElementById('bid-error-message');
const submitBidButton = document.getElementById('submit-bid-button');

// Quick Bid Buttons
const quickBidMinButton = document.getElementById('quick-bid-min-button');
const quickBidPlus1Button = document.getElementById('quick-bid-plus-1-button');
const quickBidPlus5Button = document.getElementById('quick-bid-plus-5-button');
const quickBidPlus10Button = document.getElementById('quick-bid-plus-10-button');

// History Modal
const historyModal = document.getElementById('history-modal');
const closeHistoryModalBtn = document.getElementById('close-history-modal');
const historyModalTitle = document.getElementById('history-modal-title');
const historyModalContent = document.getElementById('history-modal-content');

// Success Toast
const successToast = document.getElementById('success-toast');
const successMessage = document.getElementById('success-message');

// --- Global State ---
let currentSort = 'endTimeAsc';
let allItems = [];
let currentItemData = null; // Holds data for the item being bid on

// --- MODIFIED Initialization ---
function initializePage() {
    // --- FIX: Call setupListeners AFTER DOMContentLoaded ensures elements exist ---
    // setupListeners(); // Moved to DOMContentLoaded event listener

    // --- NEW Auth Check ---
    onAuthStateChanged(auth, (user) => {
        if (user) {
            // User is signed in (anon or otherwise)
            console.log('Auction user authenticated:', user.uid);
            setupFirebaseListener(); // NOW we can safely listen to data
            
            // Pre-fill name if it's a *real* user (not anonymous) and they have a display name
            // This is just a convenience for the *first time* they open the modal
            if (bidderNameInput && !user.isAnonymous && user.displayName) { // Add null check for bidderNameInput
                 bidderNameInput.value = user.displayName;
            }
        } else {
            // No user, sign in anonymously
            console.log('No auction user, signing in anonymously...');
            signInAnonymously(auth).catch((error) => {
                console.error("Anonymous sign-in failed:", error);
                 if (auctionItemsContainer) { // Add null check
                    auctionItemsContainer.innerHTML = '<p class="text-red-400 col-span-full text-center">Error connecting to service. Please refresh.</p>';
                 }
            });
            // The listener will re-run on success, triggering setupFirebaseListener
        }
    });
    // --- END NEW Auth Check ---

    if (timestampContainer) {
        timestampContainer.textContent = `Build: ${new Date().toLocaleString()}`;
    }
}
// --- END MODIFIED Initialization ---

function setupListeners() {
    // Sort dropdown
    if (sortItemsSelect) {
        sortItemsSelect.addEventListener('change', (e) => {
            currentSort = e.target.value;
            renderAuctionItems(); // This will re-render both active and completed based on the new sort for active
        });
    }

    // Event Delegation for item cards (applies to both containers now)
    // --- FIX: Add null checks ---
    if (auctionItemsContainer) {
        auctionItemsContainer.addEventListener('click', handleCardClick);
    }
    if (completedItemsContainer) { // This was the line causing the error
        completedItemsContainer.addEventListener('click', handleCardClick);
    }
    // --- END FIX ---


    // Modal Close Buttons
    if (closeImageModalBtn) {
        closeImageModalBtn.addEventListener('click', () => imageModal.classList.add('hidden'));
    }
    if (imageModal) {
        imageModal.addEventListener('click', (e) => {
            if (e.target === imageModal) imageModal.classList.add('hidden');
        });
    }

    if (closeBidModalBtn) {
        closeBidModalBtn.addEventListener('click', () => bidModal.classList.add('hidden'));
    }
    if (bidModal) {
        bidModal.addEventListener('click', (e) => {
            if (e.target === bidModal) bidModal.classList.add('hidden');
        });
    }

    if (closeHistoryModalBtn) {
        closeHistoryModalBtn.addEventListener('click', () => historyModal.classList.add('hidden'));
    }
    if (historyModal) {
        historyModal.addEventListener('click', (e) => {
            if (e.target === historyModal) historyModal.classList.add('hidden');
        });
    }

    // Bid Form
    if (bidForm) {
        bidForm.addEventListener('submit', handleBidSubmit);
    }

    // Quick Bid Buttons
    if (quickBidMinButton) quickBidMinButton.addEventListener('click', () => setQuickBid('min'));
    if (quickBidPlus1Button) quickBidPlus1Button.addEventListener('click', () => setQuickBid('plus1'));
    if (quickBidPlus5Button) quickBidPlus5Button.addEventListener('click', () => setQuickBid('plus5'));
    if (quickBidPlus10Button) quickBidPlus10Button.addEventListener('click', () => setQuickBid('plus10'));

}

// --- NEW Centralized Card Click Handler ---
function handleCardClick(e) {
     if (e.target.matches('.bid-button') && !e.target.disabled) { // Only handle active bid buttons
        handleBidButtonClick(e.target);
    } else if (e.target.matches('.history-button')) {
        handleHistoryButtonClick(e.target);
    } else if (e.target.matches('.item-image')) {
        handleImageClick(e.target);
    }
}
// --- END NEW ---

// --- Firebase ---
function setupFirebaseListener() {
    // --- MODIFIED QUERY: Fetch all items, no initial sort needed here ---
    const q = query(collection(db, 'auctionItems'));
    // --- END MODIFICATION ---

    onSnapshot(q, (snapshot) => {
        allItems = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderAuctionItems(); // Render function will handle filtering and sorting
    }, (error) => {
        console.error("Error fetching auction items: ", error);
        // Display error in the active items container
        if (auctionItemsContainer) { // Add null check
            auctionItemsContainer.innerHTML = '<p class="text-red-400 col-span-full text-center">Error loading items. Please check permissions or refresh.</p>';
        }
        // Hide the completed section if there's an error
        if (completedItemsSection) completedItemsSection.classList.add('hidden');
    });
}

// --- Rendering ---
// --- MODIFIED: sortItems now only sorts active items ---
function sortActiveItems(items) {
    return [...items].sort((a, b) => {
        const endTimeA = a.endTime?.toMillis() || 0;
        const endTimeB = b.endTime?.toMillis() || 0;
        const bidA = a.currentBid || 0;
        const bidB = b.currentBid || 0;

        switch (currentSort) {
            case 'endTimeDesc':
                return endTimeB - endTimeA;
            case 'currentBidDesc':
                return bidB - bidA;
            case 'currentBidAsc':
                return bidA - bidB;
            case 'endTimeAsc':
            default:
                return endTimeA - endTimeB;
        }
    });
}
// --- END MODIFICATION ---

// --- MODIFIED: renderAuctionItems separates active and completed ---
function renderAuctionItems() {
    // Add null checks for containers
    if (!auctionItemsContainer || !completedItemsContainer || !completedItemsSection) {
        console.error("Required container elements not found in the DOM.");
        return;
    }

    auctionItemsContainer.innerHTML = ''; // Clear active items
    completedItemsContainer.innerHTML = ''; // Clear completed items

    const now = new Date();
    const activeItems = [];
    const completedItems = [];

    // Separate items based on status or time
    allItems.forEach(item => {
        const endTime = item.endTime?.toDate();
        const isClosedByTime = endTime && now > endTime;
        if (item.status === 'active' && !isClosedByTime) {
            activeItems.push(item);
        } else {
            completedItems.push(item);
        }
    });

    // Sort and Render Active Items
    const sortedActive = sortActiveItems(activeItems);
    if (sortedActive.length === 0) {
        auctionItemsContainer.innerHTML = '<p class="text-gray-400 col-span-full text-center">No active auction items at this time.</p>';
    } else {
        sortedActive.forEach(item => {
            auctionItemsContainer.appendChild(createItemCardElement(item));
        });
    }

    // Render Completed Items (sorted by end time descending by default)
    if (completedItems.length > 0) {
        completedItems.sort((a, b) => (b.endTime?.toMillis() || 0) - (a.endTime?.toMillis() || 0)); // Sort newest completed first
        completedItems.forEach(item => {
            completedItemsContainer.appendChild(createItemCardElement(item));
        });
        completedItemsSection.classList.remove('hidden'); // Show the section
    } else {
        completedItemsSection.classList.add('hidden'); // Hide if no completed items
    }
}
// --- END MODIFICATION ---

// --- NEW Function: createItemCardElement (extracted from render) ---
function createItemCardElement(item) {
    const itemCard = document.createElement('div');
    itemCard.className = 'item-card flex flex-col'; // Base class
    itemCard.dataset.itemId = item.id;
    itemCard.dataset.itemTitle = item.title;
    // Ensure numeric values or default to 0 before setting dataset attributes
    itemCard.dataset.currentBid = item.currentBid ?? item.startBid ?? 0;
    itemCard.dataset.increment = item.increment ?? 1; // Default increment if missing
    itemCard.dataset.startBid = item.startBid ?? 0;
    itemCard.dataset.notExceedBid = item.notToExceedBid || ''; // Store for bid logic

    const endTime = item.endTime?.toDate();
    const now = new Date();
    const isClosedByTime = endTime && now > endTime;
    const isCompleted = item.status !== 'active' || isClosedByTime;

    const { text: timeText, closed } = formatTimeRemaining(endTime); // Use the existing formatter

    // Determine the final price/bid shown for completed items
    let finalBidDisplay = (parseFloat(itemCard.dataset.currentBid) || 0).toFixed(2); // Use dataset value which has fallback
    let finalBidder = item.highBidder;

    // Adjust display for "awaiting_payment" or "paid"
    let statusText = closed ? 'Auction Closed' : 'Place Bid';
    let statusClass = closed ? 'bg-red-900/50 text-red-300' : 'bg-green-900/50 text-green-300';
    if (item.status === 'awaiting_payment') {
        statusText = 'Awaiting Payment';
        statusClass = 'bg-yellow-900/50 text-yellow-300';
    } else if (item.status === 'paid') {
        statusText = 'Paid & Claimed';
         statusClass = 'bg-blue-900/50 text-blue-300';
    }


    itemCard.innerHTML = `
        <img src="${item.imageUrl}" alt="${item.title || 'Auction Item'}" class="item-image w-full h-64 object-cover ${isCompleted ? '' : 'cursor-pointer'}">
        <div class="p-6 flex-grow flex flex-col">
            <h3 class="font-cinzel text-2xl font-bold text-brand-gold mb-2">${item.title || 'Untitled Item'}</h3>
            <p class="text-gray-300 text-sm mb-4 flex-grow">${item.description || 'No description available.'}</p>
            
            ${item.modelNumber ? `<p class="text-xs text-gray-400 mb-4">Model: ${item.modelUrl ? `<a href="${item.modelUrl}" target="_blank" class="text-yellow-300 hover:underline">${item.modelNumber}</a>` : item.modelNumber}</p>` : ''}
            
            <!-- Only show Buy Now if item is active -->
            ${!isCompleted && item.notToExceedBid ? `<p class="text-sm font-semibold text-purple-300 mb-2">Buy Now at $${parseFloat(item.notToExceedBid).toFixed(2)}!</p>` : ''}

            <div class="mb-4">
                <p class="text-sm text-gray-400">${isCompleted ? (finalBidder ? 'Winning Bid' : 'Final Price') : (item.highBidder ? 'Current Bid' : 'Starting Bid')}</p>
                <p class="text-3xl font-bold text-white">$${finalBidDisplay}</p>
                ${finalBidder ? `<p class="text-sm text-gray-400">by ${finalBidder}</p>` : (isCompleted ? '<p class="text-sm text-gray-400">Auction ended.</p>' : '<p class="text-sm text-gray-400">Be the first to bid!</p>')}
            </div>
            
            <div class="text-center py-2 px-4 rounded-lg mb-4 ${statusClass}">
                 <!-- Show explicit status for completed items -->
                 ${isCompleted ? `<p class="text-sm font-semibold">${statusText}</p>`: ''}
                 <!-- Optionally show end time even if closed -->
                 ${isCompleted && endTime ? `<p class="text-xs opacity-75">Ended: ${endTime.toLocaleString()}</p>` : ''}
                 <!-- Show time remaining only for active items -->
                 ${!isCompleted ? `<p class="text-sm font-semibold">${timeText}</p>` : ''}
            </div>

            <div class="mt-auto space-y-2">
                <!-- Bid button is always disabled for completed items -->
                <button class="btn-velvet primary w-full bid-button" ${isCompleted ? 'disabled' : ''}>${isCompleted ? statusText : 'Place Bid'}</button>
                <button class="btn-velvet w-full history-button">View Bid History</button>
            </div>
        </div>
    `;
    return itemCard;
}
// --- END NEW ---


function formatTimeRemaining(endTime) {
    if (!endTime) return { text: 'No end time set', closed: true };

    const now = new Date().getTime();
    const distance = endTime.getTime() - now;

    if (distance < 0) {
        return { text: 'Auction Closed', closed: true };
    }

    const days = Math.floor(distance / (1000 * 60 * 60 * 24));
    const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));

    let parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    // Ensure seconds are calculated and shown only when distance is less than a minute
    if (distance < 60000 && distance > 0) { // Less than 1 minute remaining
        const seconds = Math.floor(distance / 1000); // Show total seconds remaining
        return { text: `Ends in: ${seconds}s`, closed: false };
    }
    if (parts.length === 0 && distance > 0) return { text: 'Ending very soon!', closed: false }; // Covers the gap between 1min and 0s


    return { text: `Ends in: ${parts.join(' ')}`, closed: false };
}

// --- Modal & Bidding Logic (Largely unchanged below this line) ---

function handleImageClick(imgElement) {
    if (modalImage) {
        modalImage.src = imgElement.src;
    }
    if (imageModal) {
        imageModal.classList.remove('hidden');
    }
}

function handleBidButtonClick(button) {
    const card = button.closest('.item-card');
    if (!card || !card.dataset) return; // Add check for card and dataset

    const { itemId, itemTitle, currentBid, increment, startBid, notToExceedBid } = card.dataset;

    // Ensure values are parsed correctly, providing defaults
    const currentBidValue = parseFloat(currentBid || 0);
    const startBidValue = parseFloat(startBid || 0);
    const incrementValue = parseFloat(increment || 1); // Default increment to 1 if missing

    // Calculate minimum bid
    const baseBid = (currentBidValue > startBidValue) ? currentBidValue : startBidValue;
    // If baseBid is 0 (e.g., free item start, no bids), min bid is just the increment
    // Otherwise, it's base + increment
    const minBid = (baseBid === 0) ? incrementValue : baseBid + incrementValue;


    currentItemData = {
        id: itemId,
        title: itemTitle,
        minBid: minBid,
        increment: incrementValue,
        currentBid: currentBidValue, // Store the actual current bid
        startBid: startBidValue,    // Store start bid too
        notToExceedBid: notToExceedBid ? parseFloat(notToExceedBid) : null
    };

    // Update Modal UI only if elements exist
    if (bidModalTitle) bidModalTitle.textContent = `Bid on: ${itemTitle || 'Item'}`;
    if (bidAmountInput) {
        bidAmountInput.value = minBid.toFixed(2);
        bidAmountInput.min = minBid.toFixed(2);
    }
    if (bidErrorMessage) bidErrorMessage.textContent = '';

    if (bidderNameInput) {
         if (auth.currentUser && !auth.currentUser.isAnonymous && auth.currentUser.displayName) {
             bidderNameInput.value = auth.currentUser.displayName;
         } else {
             bidderNameInput.value = '';
         }
    }
   if (bidderPhoneInput) bidderPhoneInput.value = '';

    // Update quick bid buttons only if they exist
    if (quickBidMinButton) quickBidMinButton.textContent = `Bid $${minBid.toFixed(2)}`;
    if (quickBidPlus1Button) quickBidPlus1Button.textContent = `+ $1 ($${(minBid + 1).toFixed(2)})`;
    if (quickBidPlus5Button) quickBidPlus5Button.textContent = `+ $5 ($${(minBid + 5).toFixed(2)})`;
    if (quickBidPlus10Button) quickBidPlus10Button.textContent = `+ $10 ($${(minBid + 10).toFixed(2)})`;

    if (bidModal) {
        bidModal.classList.remove('hidden');
    }
    if (bidAmountInput) bidAmountInput.focus();
}


function setQuickBid(type) {
    if (!currentItemData || !bidAmountInput) return; // Add check for input element

    let newBid = 0;
    // Start calculation from the minimum bid required now
    const currentMinBid = currentItemData.minBid;

    switch (type) {
        case 'min':
            newBid = currentMinBid;
            break;
        // Adjust increments to be relative to the *minimum* bid required
        case 'plus1':
            newBid = currentMinBid + 1;
            break;
        case 'plus5':
            newBid = currentMinBid + 5;
            break;
        case 'plus10':
            newBid = currentMinBid + 10;
            break;
    }
    // Ensure new bid is *at least* the minimum bid (handles edge cases)
    bidAmountInput.value = Math.max(newBid, currentMinBid).toFixed(2);
}


async function handleHistoryButtonClick(button) {
    const card = button.closest('.item-card');
    if (!card || !card.dataset) return; // Add check
    const { itemId, itemTitle } = card.dataset;

    // Add checks for modal elements
    if (!historyModal || !historyModalTitle || !historyModalContent) {
        console.error("History modal elements not found.");
        return;
    }


    historyModalTitle.textContent = `History for: ${itemTitle || 'Item'}`;
    historyModalContent.innerHTML = '<p class="text-gray-400">Loading history...</p>';
    historyModal.classList.remove('hidden');

    try {
        const bidsRef = collection(db, 'auctionItems', itemId, 'bids');
        const q = query(bidsRef, orderBy('timestamp', 'desc'));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            historyModalContent.innerHTML = '<p class="text-gray-400">No bids have been placed yet.</p>';
            return;
        }

        const historyHtml = snapshot.docs.map(doc => {
            const bid = doc.data();
            // Show Max Bid placed in history for transparency within the family context
            return `
                <div class="p-3 bg-brand-dark/50 rounded-lg">
                    <p class="font-semibold text-brand-gold">$${(bid.amount || 0).toFixed(2)} (Max Bid)</p>
                    <p class="text-sm text-gray-300">by ${bid.name || 'Anonymous'}</p>
                    <p class="text-xs text-gray-500">${bid.timestamp?.toDate()?.toLocaleString() ?? 'Date unknown'}</p>
                </div>
            `;
        }).join('');
        historyModalContent.innerHTML = `<div class="space-y-3">${historyHtml}</div>`;

    } catch (error) {
        console.error("Error fetching bid history: ", error);
        historyModalContent.innerHTML = '<p class="text-red-400">Could not load history.</p>';
    }
}

async function handleBidSubmit(e) {
    e.preventDefault();
    if (!currentItemData || !bidAmountInput || !bidderNameInput || !bidderPhoneInput || !bidErrorMessage || !submitBidButton) {
        console.error("Bid modal form elements missing.");
        return;
    }; // Add checks

    const maxBid = parseFloat(bidAmountInput.value);
    const name = bidderNameInput.value.trim();
    const phone = bidderPhoneInput.value.trim().replace(/\D/g, ''); // Remove non-numeric chars

    // Validation
    if (isNaN(maxBid) || maxBid < currentItemData.minBid) {
        bidErrorMessage.textContent = `Your bid must be at least $${currentItemData.minBid.toFixed(2)}.`;
        return;
    }
    if (!name) {
        bidErrorMessage.textContent = 'Please enter your name.';
        return;
    }
    if (phone.length < 10) { // Simple phone validation
        bidErrorMessage.textContent = 'Please enter a valid 10-digit phone number.';
        return;
    }
    bidErrorMessage.textContent = '';
    submitBidButton.disabled = true;
    submitBidButton.textContent = 'Placing Bid...';

    try {
        const result = await placeBid(currentItemData.id, maxBid, name, phone); // Capture result
        if (bidModal) bidModal.classList.add('hidden'); // Add check

        // Modify toast based on whether the user is the high bidder *after* the transaction
        if (result === 'INSTANT_WIN') {
            showToast('Congratulations! You won the item instantly!');
        } else if (result === 'HIGH_BIDDER') {
            showToast('Bid placed successfully! You are the high bidder.');
        } else if (result === 'OUTBID') {
             // This case is now handled by the error catch block below
             // showToast('Bid placed, but you were immediately outbid.');
        } else {
             showToast('Bid placed successfully!'); // Generic fallback
        }


    } catch (error) {
        console.error('Bid failed: ', error);
        if (error.message.startsWith('OUTBID')) {
            // Custom error for proxy bids
            const newMinBid = error.message.split(':')[1];
            bidErrorMessage.textContent = `Bid placed, but you were outbid! The new bid is $${newMinBid}. Try bidding higher.`;
            // Update modal state
            currentItemData.minBid = parseFloat(newMinBid);
            currentItemData.currentBid = parseFloat(newMinBid) - currentItemData.increment; // approx
            bidAmountInput.value = newMinBid;
            bidAmountInput.min = newMinBid;
            if (quickBidMinButton) quickBidMinButton.textContent = `Bid $${newMinBid}`;
            // Adjust other quick bid buttons relative to the new minimum
            if (quickBidPlus1Button) quickBidPlus1Button.textContent = `+ $1 ($${(parseFloat(newMinBid) + 1).toFixed(2)})`;
            if (quickBidPlus5Button) quickBidPlus5Button.textContent = `+ $5 ($${(parseFloat(newMinBid) + 5).toFixed(2)})`;
            if (quickBidPlus10Button) quickBidPlus10Button.textContent = `+ $10 ($${(parseFloat(newMinBid) + 10).toFixed(2)})`;

        } else {
             bidErrorMessage.textContent = `Error: ${error.message}`; // Show generic errors
        }
    } finally {
        submitBidButton.disabled = false;
        submitBidButton.textContent = 'Submit Bid';
    }
}

/**
 * Places a bid using proxy bidding logic in a Firestore transaction.
 * Returns a status string: 'HIGH_BIDDER', 'OUTBID', 'INSTANT_WIN'
 */
async function placeBid(itemId, maxBid, name, phone) {
    const itemRef = doc(db, 'auctionItems', itemId);
    const newBidRef = doc(collection(itemRef, 'bids'));

    try {
        // Return value from the transaction
        return await runTransaction(db, async (transaction) => {
            const itemDoc = await transaction.get(itemRef);
            if (!itemDoc.exists()) throw new Error("This item no longer exists.");

            const item = itemDoc.data();
            if (item.status !== 'active' || (item.endTime && new Date() > item.endTime.toDate())) {
                throw new Error("Sorry, this auction has already closed.");
            }

            // --- Instant-Win "Not to Exceed" Logic ---
            if (item.notToExceedBid && maxBid >= item.notToExceedBid) {
                const updates = {
                    currentBid: item.notToExceedBid, // Winner pays this price
                    highBidder: name,
                    highBidderPhone: phone,
                    highBidderMaxBid: maxBid, // Store their actual max bid
                    status: 'awaiting_payment', // Auction is OVER
                    endTime: serverTimestamp() // End it now
                };
                transaction.update(itemRef, updates);
                transaction.set(newBidRef, { name, phone, amount: maxBid, timestamp: serverTimestamp(), status: 'active' });
                return 'INSTANT_WIN'; // Return status
            }

            // --- Additional Check: Ensure bid is at least the *current* minimum bid ---
            const currentBidValue = item.currentBid || 0;
            const startBidValue = item.startBid || 0;
            const increment = item.increment || 1; // Default increment to 1 if missing
            const baseBid = (currentBidValue > startBidValue) ? currentBidValue : startBidValue;
            // Recalculate minBid inside transaction based on fetched data
            const minBid = (baseBid === 0) ? increment : baseBid + increment;


             if (maxBid < minBid) {
                 // Throw specific error if the bid isn't high enough *at the time of the transaction*
                 throw new Error(`The minimum bid increased to $${minBid.toFixed(2)} while you were bidding. Please bid higher.`);
             }


            // --- Standard Proxy Bidding Logic ---
            const currentHighBidderMax = item.highBidderMaxBid || 0;
            let newCurrentBid;

            if (maxBid > currentHighBidderMax) {
                // This new bid is the highest max bid
                // Determine the new current bid based on the previous high max bid + increment
                 if (!item.highBidder) { // This is the first *successful* bid
                     // Current bid becomes startBid + increment if maxBid allows, otherwise stays startBid
                     // Capped at maxBid
                     newCurrentBid = Math.min(maxBid, item.startBid + increment);
                     // Ensure it doesn't go below start bid if increment is small or start is 0
                     newCurrentBid = Math.max(newCurrentBid, item.startBid);
                 } else { // Subsequent bid that is higher max
                     // New current is old max + increment, capped by new max bid
                     newCurrentBid = Math.min(maxBid, currentHighBidderMax + increment);
                 }
                 // Ensure newCurrentBid is at least the minimum required bid calculated earlier
                 newCurrentBid = Math.max(newCurrentBid, minBid);


                const updates = {
                    currentBid: newCurrentBid,
                    highBidder: name,
                    highBidderPhone: phone,
                    highBidderMaxBid: maxBid
                };
                transaction.update(itemRef, updates);
                transaction.set(newBidRef, { name, phone, amount: maxBid, timestamp: serverTimestamp(), status: 'active' });
                return 'HIGH_BIDDER'; // Return status
            
            } else {
                // This new bid is NOT the highest max bid
                // The current high bidder remains, but their current bid might increase
                // The new current bid will be the NEW max bid + increment, capped at the high bidder's max
                newCurrentBid = Math.min(currentHighBidderMax, maxBid + increment);

                 // Ensure the current bid doesn't somehow drop below the minimum required bid
                 newCurrentBid = Math.max(newCurrentBid, minBid);


                const updates = {
                    currentBid: newCurrentBid
                };
                transaction.update(itemRef, updates);
                transaction.set(newBidRef, { name, phone, amount: maxBid, timestamp: serverTimestamp(), status: 'active' });
                
                // Throw a custom error to inform the user they were outbid
                // The new minimum bid is the new current bid + increment
                const newMinBidRequired = newCurrentBid + increment;
                 // Ensure the message shows a value *at least* the original minBid required by this bidder
                throw new Error(`OUTBID:${Math.max(minBid, newMinBidRequired).toFixed(2)}`);
            }
        });
    } catch (error) {
        // Re-throw the error to be caught by handleBidSubmit
        throw error;
    }
}


function showToast(message) {
    // Add null checks for toast elements
    if (successMessage) successMessage.textContent = message;
    if (successToast) {
        successToast.classList.add('show');
        setTimeout(() => {
            successToast.classList.remove('show');
        }, 3000);
    }
}

// --- Start ---
// --- FIX: Wrap initializePage and setupListeners in DOMContentLoaded ---
document.addEventListener('DOMContentLoaded', () => {
    initializePage(); // Handles auth and Firebase listener setup
    setupListeners(); // Setup static listeners once DOM is ready
});
/* Build Timestamp: 10/23/2025, 4:17:00 PM MDT */

