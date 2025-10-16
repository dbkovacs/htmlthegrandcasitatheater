/* /auction.js */
document.addEventListener('DOMContentLoaded', () => {
    const db = firebase.firestore();
    const itemsContainer = document.getElementById('auction-items-container');

    if (!itemsContainer) {
        console.error('Error: Auction items container not found.');
        return;
    }

    // Listen for real-time updates to auction items
    db.collection('auctionItems').orderBy('endTime', 'asc').onSnapshot(snapshot => {
        if (snapshot.empty) {
            itemsContainer.innerHTML = '<p>No items are currently up for auction. Check back soon!</p>';
            return;
        }

        itemsContainer.innerHTML = ''; // Clear previous content
        snapshot.forEach(doc => {
            const item = doc.data();
            const itemId = doc.id;
            const itemElement = document.createElement('div');
            itemElement.classList.add('item-card');

            const now = new Date();
            const endTime = item.endTime.toDate();
            const timeLeft = endTime > now ? formatTimeLeft(endTime - now) : 'Bidding Ended';

            itemElement.innerHTML = `
                <h3>${item.title}</h3>
                <img src="${item.imageUrl}" alt="${item.title}" class="item-image">
                <p>${item.description}</p>
                <p><strong>Current Bid:</strong> $${item.currentBid.toFixed(2)}</p>
                <p><strong>High Bidder:</strong> ${item.highBidder || 'None'}</p>
                <p><strong>Time Left:</strong> <span id="timer-${itemId}">${timeLeft}</span></p>
                <div class="bid-form">
                    <input type="number" id="bid-amount-${itemId}" placeholder="$${(item.currentBid + item.increment).toFixed(2)}" min="${(item.currentBid + item.increment).toFixed(2)}" step="${item.increment}">
                    <button onclick="placeBid('${itemId}')">Place Bid</button>
                </div>
            `;
            itemsContainer.appendChild(itemElement);

            // Update timer every second
            if (endTime > now) {
                setInterval(() => {
                    const updatedTimeLeft = endTime > new Date() ? formatTimeLeft(endTime - new Date()) : 'Bidding Ended';
                    const timerSpan = document.getElementById(`timer-${itemId}`);
                    if (timerSpan) {
                        timerSpan.textContent = updatedTimeLeft;
                    }
                }, 1000);
            }
        });
    }, error => {
        console.error("Error fetching auction items: ", error);
        itemsContainer.innerHTML = '<p>Could not load auction items. Please try again later.</p>';
    });
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

function placeBid(itemId) {
    const db = firebase.firestore();
    const bidAmountInput = document.getElementById(`bid-amount-${itemId}`);
    const newBidAmount = parseFloat(bidAmountInput.value);
    
    // For now, we'll use a prompt to get the bidder's name.
    // In a future version, this would be tied to user authentication.
    const bidderName = prompt("Please enter your name to place a bid:");
    if (!bidderName) {
        alert("You must enter a name to bid.");
        return;
    }

    if (isNaN(newBidAmount) || newBidAmount <= 0) {
        alert('Please enter a valid bid amount.');
        return;
    }

    const itemRef = db.collection('auctionItems').doc(itemId);

    db.runTransaction(transaction => {
        return transaction.get(itemRef).then(doc => {
            if (!doc.exists) {
                throw "Document does not exist!";
            }
            
            const item = doc.data();
            if (newBidAmount > item.currentBid) {
                transaction.update(itemRef, { 
                    currentBid: newBidAmount,
                    highBidder: bidderName 
                });
                return newBidAmount;
            } else {
                return Promise.reject('Your bid must be higher than the current bid.');
            }
        });
    }).then(newBid => {
        alert(`Congratulations, ${bidderName}! Your bid of $${newBid.toFixed(2)} is the new high bid!`);
        bidAmountInput.value = ''; // Clear input after successful bid
    }).catch(error => {
        console.error("Error placing bid: ", error);
        alert(`Failed to place bid. Reason: ${error}`);
    });
}

// Update the build timestamp
document.getElementById('build-timestamp').textContent = `Build: ${new Date().toLocaleString()}`;
/* Build Timestamp: Thu Oct 16 2025 13:14:54 GMT-0600 (Mountain Daylight Time) */