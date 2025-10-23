/* /auction.js */
// This is the PUBLIC-FACING script for auction.html

import { db, auth } from './firebase-config.js';
import {
    collection,
    query,
    onSnapshot,
    orderBy,
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
    setupListeners(); // Listeners can be set up regardless of auth

    // --- NEW Auth Check ---
    onAuthStateChanged(auth, (user) => {
        if (user) {
            // User is signed in (anon or otherwise)
            console.log('Auction user authenticated:', user.uid);
            setupFirebaseListener(); // NOW we can safely listen to data
            
            // Pre-fill name if it's a *real* user (not anonymous) and they have a display name
            // This is just a convenience for the *first time* they open the modal
            if (!user.isAnonymous && user.displayName) {
                 bidderNameInput.value = user.displayName;
            }
        } else {
            // No user, sign in anonymously
            console.log('No auction user, signing in anonymously...');
            signInAnonymously(auth).catch((error) => {
                console.error("Anonymous sign-in failed:", error);
                auctionItemsContainer.innerHTML = '<p class="text-red-400 col-span-full text-center">Error connecting to service. Please refresh.</p>';
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
    sortItemsSelect.addEventListener('change', (e) => {
        currentSort = e.target.value;
        renderAuctionItems();
    });

    // Event Delegation for item cards
    auctionItemsContainer.addEventListener('click', (e) => {
        if (e.target.matches('.bid-button')) {
            handleBidButtonClick(e.target);
        } else if (e.target.matches('.history-button')) {
            handleHistoryButtonClick(e.target);
        } else if (e.target.matches('.item-image')) {
            handleImageClick(e.target);
        }
    });

    // Modal Close Buttons
    closeImageModalBtn.addEventListener('click', () => imageModal.classList.add('hidden'));
    imageModal.addEventListener('click', (e) => {
        if (e.target === imageModal) imageModal.classList.add('hidden');
    });

    closeBidModalBtn.addEventListener('click', () => bidModal.classList.add('hidden'));
    bidModal.addEventListener('click', (e) => {
        if (e.target === bidModal) bidModal.classList.add('hidden');
    });

    closeHistoryModalBtn.addEventListener('click', () => historyModal.classList.add('hidden'));
    historyModal.addEventListener('click', (e) => {
        if (e.target === historyModal) historyModal.classList.add('hidden');
    });

    // Bid Form
    bidForm.addEventListener('submit', handleBidSubmit);

    // Quick Bid Buttons
    quickBidMinButton.addEventListener('click', () => setQuickBid('min'));
    quickBidPlus1Button.addEventListener('click', () => setQuickBid('plus1'));
    quickBidPlus5Button.addEventListener('click', () => setQuickBid('plus5'));
    quickBidPlus10Button.addEventListener('click', () => setQuickBid('plus10'));

    // --- REMOVED onAuthStateChanged from here, as it's now in initializePage ---
}

// --- Firebase ---
function setupFirebaseListener() {
    const q = query(collection(db, 'auctionItems'), orderBy('endTime', 'asc'));

    onSnapshot(q, (snapshot) => {
        allItems = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderAuctionItems();
    }, (error) => {
        console.error("Error fetching auction items: ", error);
        if (error.code === 'permission-denied' || error.code === 'missing-or-insufficient-permissions') {
            auctionItemsContainer.innerHTML = '<p class="text-red-400 col-span-full text-center">Permission Denied. Please ensure you have access to view these items.</p>';
        } else {
            auctionItemsContainer.innerHTML = '<p class="text-red-400 col-span-full text-center">Error loading items. Please refresh.</p>';
        }
    });
}

// --- Rendering ---
function sortItems(items) {
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

function renderAuctionItems() {
    auctionItemsContainer.innerHTML = '';
    const sorted = sortItems(allItems);

    // Filter for active items only
    const activeItems = sorted.filter(item => item.status === 'active');

    if (activeItems.length === 0) {
        auctionItemsContainer.innerHTML = '<p class="text-gray-400 col-span-full text-center">No active auction items at this time.</p>';
        return;
    }

    activeItems.forEach(item => {
        const itemCard = document.createElement('div');
        itemCard.className = 'item-card flex flex-col';
        itemCard.dataset.itemId = item.id;
        itemCard.dataset.itemTitle = item.title;
        itemCard.dataset.currentBid = item.currentBid;
        itemCard.dataset.increment = item.increment;
        itemCard.dataset.startBid = item.startBid;
        itemCard.dataset.notExceedBid = item.notToExceedBid || ''; // Store for bid logic

        const endTime = item.endTime?.toDate();
        const { text: timeText, closed } = formatTimeRemaining(endTime);

        itemCard.innerHTML = `
            <img src="${item.imageUrl}" alt="${item.title}" class="item-image w-full h-64 object-cover cursor-pointer">
            <div class="p-6 flex-grow flex flex-col">
                <h3 class="font-cinzel text-2xl font-bold text-brand-gold mb-2">${item.title}</h3>
                <p class="text-gray-300 text-sm mb-4 flex-grow">${item.description}</p>
                
                ${item.modelNumber ? `<p class="text-xs text-gray-400 mb-4">Model: ${item.modelUrl ? `<a href="${item.modelUrl}" target="_blank" class="text-yellow-300 hover:underline">${item.modelNumber}</a>` : item.modelNumber}</p>` : ''}
                ${item.notToExceedBid ? `<p class="text-sm font-semibold text-purple-300 mb-2">Buy Now at $${item.notToExceedBid.toFixed(2)}!</p>` : ''}

                <div class="mb-4">
                    <p class="text-sm text-gray-400">${item.highBidder ? 'Current Bid' : 'Starting Bid'}</p>
                    <p class="text-3xl font-bold text-white">$${(item.currentBid || item.startBid || 0).toFixed(2)}</p>
                    ${item.highBidder ? `<p class="text-sm text-gray-400">by ${item.highBidder}</p>` : '<p class="text-sm text-gray-400">Be the first to bid!</p>'}
                </div>
                
                <div class="text-center py-2 px-4 rounded-lg mb-4 ${closed ? 'bg-red-900/50 text-red-300' : 'bg-green-900/50 text-green-300'}">
                    <p class="text-sm font-semibold">${timeText}</p>
                </div>

                <div class="mt-auto space-y-2">
                    <button class="btn-velvet primary w-full bid-button" ${closed ? 'disabled' : ''}>${closed ? 'Auction Closed' : 'Place Bid'}</button>
                    <button class="btn-velvet w-full history-button">View Bid History</button>
                </div>
            </div>
        `;
        auctionItemsContainer.appendChild(itemCard);
    });
}

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
    if (parts.length === 0) return { text: 'Ending very soon!', closed: false }; // Handle last minute

    return { text: `Ends in: ${parts.join(' ')}`, closed: false };
}

// --- Modal & Bidding Logic ---

function handleImageClick(imgElement) {
    modalImage.src = imgElement.src;
    imageModal.classList.remove('hidden');
}

function handleBidButtonClick(button) {
    const card = button.closest('.item-card');
    // --- THIS IS THE FIX ---
    // The variable `notToExceedBid` was missing from this destructuring assignment,
    // causing the ReferenceError when it was used to build the currentItemData object.
    const { itemId, itemTitle, currentBid, increment, startBid, notToExceedBid } = card.dataset;
    // --- END FIX ---

    const minBid = (parseFloat(currentBid) || parseFloat(startBid)) + parseFloat(increment);

    currentItemData = {
        id: itemId,
        title: itemTitle,
        minBid: minBid,
        increment: parseFloat(increment),
        currentBid: parseFloat(currentBid),
        notToExceedBid: notToExceedBid ? parseFloat(notToExceedBid) : null
    };

    bidModalTitle.textContent = `Bid on: ${itemTitle}`;
    bidAmountInput.value = minBid.toFixed(2);
    bidAmountInput.min = minBid.toFixed(2);
    bidErrorMessage.textContent = '';

    // --- MODIFICATION: Clear name/phone fields ---
    // Pre-fill name only for *non-anonymous*, named users. Clear it otherwise.
    if (auth.currentUser && !auth.currentUser.isAnonymous && auth.currentUser.displayName) {
        bidderNameInput.value = auth.currentUser.displayName;
    } else {
        bidderNameInput.value = '';
    }
    bidderPhoneInput.value = ''; // Always clear phone for privacy
    // --- END MODIFICATION ---


    // Update quick bid buttons
    quickBidMinButton.textContent = `Bid $${minBid.toFixed(2)}`;
    quickBidPlus1Button.textContent = `+ $1 ($${(minBid + 1).toFixed(2)})`;
    quickBidPlus5Button.textContent = `+ $5 ($${(minBid + 5).toFixed(2)})`;
    quickBidPlus10Button.textContent = `+ $10 ($${(minBid + 10).toFixed(2)})`;

    bidModal.classList.remove('hidden');
    bidAmountInput.focus();
}

function setQuickBid(type) {
    if (!currentItemData) return;

    let newBid = 0;
    const currentVal = parseFloat(bidAmountInput.value) || currentItemData.minBid;

    switch (type) {
        case 'min':
            newBid = currentItemData.minBid;
            break;
        case 'plus1':
            newBid = currentVal + 1;
            break;
        case 'plus5':
            newBid = currentVal + 5;
            break;
        case 'plus10':
            newBid = currentVal + 10;
            break;
    }
    // Ensure new bid is at least the minimum bid
    bidAmountInput.value = Math.max(newBid, currentItemData.minBid).toFixed(2);
}

async function handleHistoryButtonClick(button) {
    const card = button.closest('.item-card');
    const { itemId, itemTitle } = card.dataset;

    historyModalTitle.textContent = `History for: ${itemTitle}`;
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
            // In a proxy system, we only show the *actual* bids placed, not the *max* bids.
            // But since we store the max bid, we'll display that as per admin panel.
            // For a true public view, you might only show *when* a bid was placed, not the amount.
            // For this family project, showing the max bid in history is okay.
            return `
                <div class="p-3 bg-brand-dark/50 rounded-lg">
                    <p class="font-semibold text-brand-gold">$${bid.amount.toFixed(2)} (Max Bid)</p>
                    <p class="text-sm text-gray-300">by ${bid.name}</p>
                    <p class="text-xs text-gray-500">${bid.timestamp.toDate().toLocaleString()}</p>
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
    if (!currentItemData) return;

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
        await placeBid(currentItemData.id, maxBid, name, phone);
        bidModal.classList.add('hidden');
        showToast('Bid placed successfully! You are the high bidder.');

    } catch (error) {
        console.error('Bid failed: ', error);
        if (error.message.startsWith('OUTBID')) {
            // Custom error for proxy bids
            const newMinBid = error.message.split(':')[1];
            bidErrorMessage.textContent = `You've been outbid! The new bid is $${newMinBid}. Try bidding higher.`;
            // Update modal state
            currentItemData.minBid = parseFloat(newMinBid);
            currentItemData.currentBid = parseFloat(newMinBid) - currentItemData.increment; // approx
            bidAmountInput.value = newMinBid;
            bidAmountInput.min = newMinBid;
            quickBidMinButton.textContent = `Bid $${newMinBid}`;
        } else {
             bidErrorMessage.textContent = error.message;
        }
    } finally {
        submitBidButton.disabled = false;
        submitBidButton.textContent = 'Submit Bid';
    }
}

/**
 * Places a bid using proxy bidding logic in a Firestore transaction.
 */
async function placeBid(itemId, maxBid, name, phone) {
    const itemRef = doc(db, 'auctionItems', itemId);
    const newBidRef = doc(collection(itemRef, 'bids'));

    try {
        await runTransaction(db, async (transaction) => {
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
                return; // Exit transaction
            }
            
            // --- Additional Check: Ensure bid is at least the *current* minimum bid ---
            // This prevents a race condition if two users bid simultaneously
            const minBid = (item.currentBid || item.startBid) + item.increment;
             if (maxBid < minBid) {
                 throw new Error(`Your bid must be at least $${minBid.toFixed(2)}.`);
             }
            // --- End Additional Check ---


            // --- Standard Proxy Bidding Logic ---
            const currentHighBidderMax = item.highBidderMaxBid || 0;
            const increment = item.increment;
            let newCurrentBid = item.currentBid;

            if (maxBid > currentHighBidderMax) {
                // This new bid is the highest max bid
                // The new current bid will be the OLD max bid + increment, capped at the new max bid
                newCurrentBid = Math.min(maxBid, currentHighBidderMax + increment);
                
                const updates = {
                    currentBid: newCurrentBid,
                    highBidder: name,
                    highBidderPhone: phone,
                    highBidderMaxBid: maxBid
                };
                transaction.update(itemRef, updates);
                transaction.set(newBidRef, { name, phone, amount: maxBid, timestamp: serverTimestamp(), status: 'active' });
            
            } else {
                // This new bid is NOT the highest max bid
                // The current high bidder remains, but their bid may be pushed up
                // The new current bid will be the NEW max bid + increment, capped at the high bidder's max
                newCurrentBid = Math.min(currentHighBidderMax, maxBid + increment);

                const updates = {
                    currentBid: newCurrentBid
                };
                transaction.update(itemRef, updates);
                transaction.set(newBidRef, { name, phone, amount: maxBid, timestamp: serverTimestamp(), status: 'active' });
                
                // Throw a custom error to inform the user they were outbid
                // The new minimum bid is the new current bid + increment
                const newMinBidRequired = newCurrentBid + increment;
                throw new Error(`OUTBID:${newMinBidRequired.toFixed(2)}`);
            }
        });
    } catch (error) {
        // Re-throw the error to be caught by handleBidSubmit
        throw error;
    }
}

function showToast(message) {
    successMessage.textContent = message;
    successToast.classList.add('show');
    setTimeout(() => {
        successToast.classList.remove('show');
    }, 3000);
}

// --- Start ---
document.addEventListener('DOMContentLoaded', initializePage);
/* Build Timestamp: 10/23/2025, 4:03:00 PM MDT */
