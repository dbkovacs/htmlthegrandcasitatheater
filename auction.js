/* /auction.js */
import { db } from './firebase-config.js';
import { collection, doc, onSnapshot, orderBy, runTransaction, query, where, getDocs, getDoc, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// --- START: Family Verification (MOVED TO FIRESTORE) ---
let knownFamilyNumbers = [];
// --- END: Family Verification ---

document.addEventListener('DOMContentLoaded', () => {
    const itemsContainer = document.getElementById('auction-items-container');
    const timestampContainer = document.getElementById('build-timestamp');
    
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
    const quickBidButton = document.getElementById('quick-bid-button');

    // Fetch auction settings (like phone numbers) from Firestore
    fetchAuctionSettings();

    if (!itemsContainer) {
        console.error('Error: Auction items container not found.');
        return;
    }

    // --- Event Delegation for Clicks ---
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
        // NEW: Handle History Button Clicks
        if (target.matches('.history-button')) {
            const itemId = target.dataset.itemId;
            const itemTitle = target.dataset.itemTitle;
            openHistoryModal(itemId, itemTitle);
        }
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

    // --- Bid Modal Logic (UPDATED) ---
    function openBidModal(itemId, itemTitle, currentBid, increment) {
        bidModalTitle.textContent = `Bid on: ${itemTitle}`;
        bidForm.dataset.itemId = itemId;
        bidForm.dataset.increment = increment; // Store increment for validation
        const bidAmountInput = document.getElementById('bid-amount');
        const minBid = (currentBid + increment).toFixed(2);
        
        bidAmountInput.placeholder = `$${minBid}`;
        bidAmountInput.min = minBid;
        bidAmountInput.step = increment;
        
        // NEW: Update Quick Bid button
        quickBidButton.textContent = `Bid $${minBid}`;
        quickBidButton.dataset.minBid = minBid;
        
        // Clear old error messages
        document.getElementById('bid-error-message').textContent = '';
        
        bidModal.classList.remove('hidden');
    }
    bidModalClose.onclick = () => {
        bidModal.classList.add('hidden');
        bidForm.reset();
    };

    // NEW: Quick Bid Button Handler
    quickBidButton.addEventListener('click', () => {
        const bidAmountInput = document.getElementById('bid-amount');
        bidAmountInput.value = quickBidButton.dataset.minBid;
        // Trigger form submission
        bidForm.requestSubmit(document.getElementById('submit-bid-button'));
    });

    // UPDATED: Handle bid form submission
    bidForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const itemId = bidForm.dataset.itemId;
        const increment = parseFloat(bidForm.dataset.increment);
        placeBid(itemId, increment);
    });

    // NEW: History Modal Logic
    async function openHistoryModal(itemId, itemTitle) {
        const modalTitle = document.getElementById('history-modal-title');
        const modalContent = document.getElementById('history-modal-content');
        
        modalTitle.textContent = `History for ${itemTitle}`;
        modalContent.innerHTML = '<p class="text-gray-400">Loading history...</p>';
        historyModal.classList.remove('hidden');

        try {
            const bidsQuery = query(
                collection(db, 'auctionItems', itemId, 'bids'), 
                where('status', '!=', 'rejected'), 
                orderBy('status', 'asc'), // 'active' bids first
                orderBy('amount', 'desc')
            );
            const snapshot = await getDocs(bidsQuery);
            if (snapshot.empty) {
                modalContent.innerHTML = '<p class="text-gray-400">No bids have been placed yet.</p>';
                return;
            }

            const bidsHtml = snapshot.docs.map(doc => {
                const bid = doc.data();
                // Anonymize bidder name: "David K." -> "D. K."
                const nameParts = bid.name.split(' ');
                const anonymizedName = nameParts.map((part, index) => {
                    if (index === 0) return part; // Keep first name
                    return part.charAt(0).toUpperCase() + ".";
                }).join(' ');

                return `
                    <div class="flex justify-between items-center p-2 border-b border-yellow-300/10">
                        <span class="font-semibold text-gray-200">${anonymizedName}</span>
                        <span class="text-brand-gold text-lg">$${bid.amount.toFixed(2)}</span>
                    </div>
                `;
            }).join('');
            modalContent.innerHTML = `<div class="space-y-2">${bidsHtml}</div>`;

        } catch (error) {
            console.error("Error fetching bid history:", error);
            modalContent.innerHTML = '<p class="text-red-400">Could not load bid history.</p>';
        }
    }
    closeHistoryModal.onclick = () => historyModal.classList.add('hidden');


    // Listen for real-time updates to auction items
    const q = query(collection(db, 'auctionItems'), orderBy('endTime', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
        if (snapshot.empty) {
            itemsContainer.innerHTML = '<p class="text-gray-400 col-span-full text-center">No items are currently up for auction. Check back soon!</p>';
            return;
        }

        itemsContainer.innerHTML = ''; // Clear previous content
        snapshot.forEach(doc => {
            const item = doc.data();
            const itemId = doc.id;
            const itemElement = document.createElement('div');
            itemElement.className = 'item-card';

            const now = new Date();
            const endTime = item.endTime.toDate();
            const timeLeft = endTime > now ? formatTimeLeft(endTime - now) : 'Bidding Ended';
            const canBid = endTime > now;
            
            const modelInfoHtml = (item.modelNumber && item.modelUrl) 
                ? `<p class="text-gray-400 text-xs mt-1">Model: <a href="${item.modelUrl}" target="_blank" class="text-blue-400 hover:underline">${item.modelNumber}</a></p>`
                : (item.modelNumber ? `<p class="text-gray-400 text-xs mt-1">Model: ${item.modelNumber}</p>` : '');

            // UPDATED: Card template with history button
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
                            <p class="text-xl">$${item.currentBid.toFixed(2)}</p>
                        </div>
                        <div>
                            <p class="font-bold text-brand-gold">High Bidder:</p>
                            <p class="truncate">${item.highBidder || 'None'}</p>
                        </div>
                    </div>
                     <p class="text-center font-bold mt-4 ${canBid ? 'text-green-400' : 'text-red-400'}" id="timer-${itemId}">${timeLeft}</p>
                    ${canBid ? `
                    <div class="mt-4 flex justify-between items-center gap-4">
                        <button class="bid-button flex-1" data-item-id="${itemId}" data-item-title="${item.title}" data-current-bid="${item.currentBid}" data-increment="${item.increment}">Place Bid</button>
                        <button class="history-button text-xs text-blue-400 hover:underline" data-item-id="${itemId}" data-item-title="${item.title}">View History</button>
                    </div>` : ''}
                </div>
            `;
            itemsContainer.appendChild(itemElement);

            if (canBid) {
                const timerId = `timer-${itemId}`;
                const timerSpan = document.getElementById(timerId);
                if (timerSpan) {
                     const interval = setInterval(() => {
                        const newTimeLeft = endTime > new Date() ? formatTimeLeft(endTime - new Date()) : 'Bidding Ended';
                        timerSpan.textContent = newTimeLeft;
                        if (newTimeLeft === 'Bidding Ended') {
                            clearInterval(interval);
                        }
                    }, 1000);
                }
            }
        });
    }, (error) => {
        console.error("Error fetching auction items: ", error);
        itemsContainer.innerHTML = '<p class="text-red-400 col-span-full text-center">Could not load auction items. Please try again later.</p>';
    });

    if (timestampContainer) {
        timestampContainer.textContent = `Build: ${new Date().toLocaleString()}`;
    }
});

// NEW: Fetch settings from Firestore
async function fetchAuctionSettings() {
    try {
        // IMPORTANT: You must create this document in Firestore for verification to work
        const settingsRef = doc(db, 'settings', 'auction');
        const docSnap = await getDoc(settingsRef);
        if (docSnap.exists()) {
            knownFamilyNumbers = docSnap.data().approvedNumbers || [];
            if (knownFamilyNumbers.length === 0) {
                 console.warn("Auction settings 'approvedNumbers' array is empty.");
            }
        } else {
            console.error("CRITICAL: 'settings/auction' document not found in Firestore. Bidder verification will fail.");
        }
    } catch (error) {
        console.error("Error fetching auction settings:", error);
    }
}

function formatTimeLeft(ms) {
    let seconds = Math.floor(ms / 1000);
    let minutes = Math.floor(seconds / 60);
    let hours = Math.floor(minutes / 60);
    let days = Math.floor(hours / 24);

    hours %= 24;
    minutes %= 60;
    seconds %= 60;

    return `${days}d ${hours}h ${minutes}m ${seconds}s`;
}

// UPDATED: placeBid function with Race Condition fix and improved feedback
async function placeBid(itemId, increment) {
    const bidAmountInput = document.getElementById('bid-amount');
    const bidderNameInput = document.getElementById('bidder-name');
    const bidderPhoneInput = document.getElementById('bidder-phone');
    const submitButton = document.getElementById('submit-bid-button');
    const errorMessage = document.getElementById('bid-error-message');

    errorMessage.textContent = ''; // Clear previous errors
    submitButton.disabled = true;
    submitButton.textContent = 'Submitting...';

    const newBidAmount = parseFloat(bidAmountInput.value);
    const bidderName = bidderNameInput.value.trim();
    const bidderPhone = bidderPhoneInput.value.replace(/\D/g, ''); // Remove non-numeric characters

    try {
        if (!bidderName || isNaN(newBidAmount) || newBidAmount <= 0) {
            throw new Error("Please provide a valid name and bid amount.");
        }
        
        if (knownFamilyNumbers.length === 0) {
            console.error("No family numbers loaded. Bidding is disabled.");
            throw new Error("Verification system is offline. Please contact admin.");
        }

        if (!knownFamilyNumbers.includes(bidderPhone)) {
            throw new Error("This phone number is not recognized. Please use a family number.");
        }

        const itemRef = doc(db, 'auctionItems', itemId);

        // CRITICAL FIX: Run transaction to prevent race conditions
        // All reads (get) and writes (set, update) must be inside the transaction block.
        await runTransaction(db, async (transaction) => {
            
            // STEP 1: READ data INSIDE the transaction
            const itemDoc = await transaction.get(itemRef);
            if (!itemDoc.exists()) {
                throw new Error("Auction item not found.");
            }
            const item = itemDoc.data();

            // STEP 2: VALIDATE the new bid
            if (newBidAmount <= item.currentBid) {
                throw new Error(`Your bid must be higher than the current $${item.currentBid.toFixed(2)}.`);
            }
            
            const minBid = item.currentBid + increment;
            if (newBidAmount < minBid) {
                throw new Error(`The minimum bid is now $${minBid.toFixed(2)}.`);
            }

            // STEP 3: WRITE changes
            const bidsRef = collection(itemRef, 'bids');
            const newBidRef = doc(bidsRef);

            // Write 1: Create the new bid document
            transaction.set(newBidRef, {
                name: bidderName,
                phone: bidderPhone,
                amount: newBidAmount,
                timestamp: serverTimestamp(),
                status: 'active'
            });

            // Write 2: Update the main item document
            transaction.update(itemRef, {
                currentBid: newBidAmount,
                highBidder: bidderName
            });
        });

        // Success!
        document.getElementById('bid-form').reset();
        document.getElementById('bid-modal').classList.add('hidden');
        // We removed the success alert() for a cleaner UX. The snapshot listener will update the UI.

    } catch (error) {
        console.error("Error placing bid: ", error);
        errorMessage.textContent = `Failed to place bid. ${error.message}`;
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = 'Submit Bid';
    }
}
/* Build Timestamp: Thu Oct 17 2025 14:10:00 GMT-0600 (Mountain Daylight Time) */