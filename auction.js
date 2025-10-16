/* /auction.js */
import { db } from './firebase-config.js';
import { collection, doc, onSnapshot, orderBy, runTransaction } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {
    const itemsContainer = document.getElementById('auction-items-container');
    const timestampContainer = document.getElementById('build-timestamp');

    if (!itemsContainer) {
        console.error('Error: Auction items container not found.');
        return;
    }

    // Assign event listener to a parent element
    itemsContainer.addEventListener('click', function(event) {
        if (event.target.matches('.bid-button')) {
            const itemId = event.target.dataset.itemId;
            placeBid(itemId);
        }
    });

    // Listen for real-time updates to auction items
    const q = orderBy('endTime', 'asc');
    const unsubscribe = onSnapshot(collection(db, 'auctionItems'), q, (snapshot) => {
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
                <img src="${item.imageUrl}" alt="${item.title}" class="item-image">
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
                    <div class="bid-form mt-4">
                        <input type="number" id="bid-amount-${itemId}" placeholder="$${(item.currentBid + item.increment).toFixed(2)}" min="${(item.currentBid + item.increment).toFixed(2)}" step="${item.increment}">
                        <button class="bid-button" data-item-id="${itemId}">Place Bid</button>
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
                            // Optionally, refresh just this card or the whole list
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
    const bidAmountInput = document.getElementById(`bid-amount-${itemId}`);
    const newBidAmount = parseFloat(bidAmountInput.value);

    const bidderName = prompt("Please enter your name to place a bid:");
    if (!bidderName) {
        alert("You must enter a name to bid.");
        return;
    }

    if (isNaN(newBidAmount) || newBidAmount <= 0) {
        alert('Please enter a valid bid amount.');
        return;
    }

    const itemRef = doc(db, 'auctionItems', itemId);

    try {
        const newBid = await runTransaction(db, async (transaction) => {
            const itemDoc = await transaction.get(itemRef);
            if (!itemDoc.exists()) {
                throw new Error("Auction item not found.");
            }
            const item = itemDoc.data();
            if (newBidAmount > item.currentBid) {
                transaction.update(itemRef, {
                    currentBid: newBidAmount,
                    highBidder: bidderName
                });
                return newBidAmount;
            } else {
                throw new Error('Your bid must be higher than the current bid.');
            }
        });
        alert(`Congratulations, ${bidderName}! Your bid of $${newBid.toFixed(2)} is the new high bid!`);
        bidAmountInput.value = '';
    } catch (error) {
        console.error("Error placing bid: ", error);
        alert(`Failed to place bid. Reason: ${error.message}`);
    }
}
/* Build Timestamp: Thu Oct 16 2025 13:19:14 GMT-0600 (Mountain Daylight Time) */