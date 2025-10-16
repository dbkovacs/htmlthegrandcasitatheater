/* /auction.js */
import { db } from './firebase-config.js';
import { collection, doc, onSnapshot, orderBy, runTransaction, query, where, getDocs, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// --- START: Family Verification ---
// List of approved phone numbers for family verification.
const knownFamilyNumbers = [
    '6098027660', 
    '6094547348', 
    '8016802512'
];
// --- END: Family Verification ---


document.addEventListener('DOMContentLoaded', () => {
    const itemsContainer = document.getElementById('auction-items-container');
    const timestampContainer = document.getElementById('build-timestamp');
    const imageModal = document.getElementById('image-modal');
    const modalImage = document.getElementById('modal-image');
    const closeModal = document.getElementById('close-image-modal');
    const bidModal = document.getElementById('bid-modal');
    const bidModalClose = document.getElementById('close-bid-modal');
    const bidForm = document.getElementById('bid-form');
    const bidModalTitle = document.getElementById('bid-modal-title');

    if (!itemsContainer) {
        console.error('Error: Auction items container not found.');
        return;
    }

    // --- Event Delegation for Clicks ---
    itemsContainer.addEventListener('click', function(event) {
        // Handle Bid Button Clicks
        if (event.target.matches('.bid-button')) {
            const itemId = event.target.dataset.itemId;
            const itemTitle = event.target.dataset.itemTitle;
            const currentBid = parseFloat(event.target.dataset.currentBid);
            const increment = parseFloat(event.target.dataset.increment);
            openBidModal(itemId, itemTitle, currentBid, increment);
        }
        // Handle Image Clicks for Modal
        if (event.target.matches('.item-image')) {
            const imageUrl = event.target.src;
            openImageModal(imageUrl);
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

    // --- Bid Modal Logic ---
    function openBidModal(itemId, itemTitle, currentBid, increment) {
        bidModalTitle.textContent = `Bid on: ${itemTitle}`;
        bidForm.dataset.itemId = itemId;
        const bidAmountInput = document.getElementById('bid-amount');
        const minBid = (currentBid + increment).toFixed(2);
        bidAmountInput.placeholder = `$${minBid}`;
        bidAmountInput.min = minBid;
        bidAmountInput.step = increment;
        bidModal.classList.remove('hidden');
    }
    bidModalClose.onclick = () => bidModal.classList.add('hidden');

    bidForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const itemId = bidForm.dataset.itemId;
        placeBid(itemId);
    });

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

            itemElement.innerHTML = `
                <img src="${item.imageUrl}" alt="${item.title}" class="item-image cursor-pointer">
                <div class="p-4 flex flex-col flex-grow">
                    <h3 class="font-cinzel text-2xl text-brand-gold mb-2">${item.title}</h3>
                    <p class="text-gray-300 text-sm mb-4 flex-grow">${item.description}</p>
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
                    <div class="mt-4">
                        <button class="bid-button w-full" data-item-id="${itemId}" data-item-title="${item.title}" data-current-bid="${item.currentBid}" data-increment="${item.increment}">Place Bid</button>
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

async function placeBid(itemId) {
    const bidAmountInput = document.getElementById('bid-amount');
    const bidderNameInput = document.getElementById('bidder-name');
    const bidderPhoneInput = document.getElementById('bidder-phone');

    const newBidAmount = parseFloat(bidAmountInput.value);
    const bidderName = bidderNameInput.value.trim();
    const bidderPhone = bidderPhoneInput.value.replace(/\D/g, ''); // Remove non-numeric characters

    if (!bidderName) {
        alert("You must enter a name to bid.");
        return;
    }

    // --- Phone number verification ---
    if (!knownFamilyNumbers.includes(bidderPhone)) {
        alert("This phone number is not recognized. Please use a known family number to place a bid.");
        return;
    }

    if (isNaN(newBidAmount) || newBidAmount <= 0) {
        alert('Please enter a valid bid amount.');
        return;
    }

    const itemRef = doc(db, 'auctionItems', itemId);
    const bidsRef = collection(itemRef, 'bids');

    try {
        await runTransaction(db, async (transaction) => {
            const itemDoc = await transaction.get(itemRef);
            if (!itemDoc.exists()) {
                throw new Error("Auction item not found.");
            }
            const item = itemDoc.data();
            
            // --- Determine the actual current highest bid from the bids subcollection ---
            // Firestore transactions don't allow queries, so we have to get all bids and filter manually.
            const allBidsSnapshot = await getDocs(collection(db, 'auctionItems', itemId, 'bids'));
            let currentHighestBid = item.startBid; // Default to start bid if no active bids exist
            allBidsSnapshot.forEach(bidDoc => {
                const bid = bidDoc.data();
                if (bid.status !== 'rejected' && bid.amount > currentHighestBid) {
                    currentHighestBid = bid.amount;
                }
            });

            if (newBidAmount > currentHighestBid) {
                // First, add the new bid to the subcollection
                const newBidRef = doc(bidsRef); // Create a new doc reference in the subcollection
                transaction.set(newBidRef, {
                    name: bidderName,
                    phone: bidderPhone,
                    amount: newBidAmount,
                    timestamp: serverTimestamp(),
                    status: 'active' 
                });

                // Then, update the main item document with the new high bid info
                transaction.update(itemRef, {
                    currentBid: newBidAmount,
                    highBidder: bidderName
                });
            } else {
                throw new Error('Your bid must be higher than the current highest bid.');
            }
        });
        alert(`Congratulations, ${bidderName}! Your bid of $${newBidAmount.toFixed(2)} is the new high bid!`);
        document.getElementById('bid-form').reset();
        document.getElementById('bid-modal').classList.add('hidden');
    } catch (error) {
        console.error("Error placing bid: ", error);
        alert(`Failed to place bid. Reason: ${error.message}`);
    }
}
/* Build Timestamp: Thu Oct 16 2025 13:46:37 GMT-0600 (Mountain Daylight Time) */