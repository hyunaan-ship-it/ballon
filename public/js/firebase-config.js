// Firebase Configuration and Sync Settings
// This file controls whether the game runs in Local Node.js (Socket.io) mode or Vercel Serverless (Firebase) mode.

const SYNC_CONFIG = {
  // Sync mode: 'socket' or 'firebase'
  // - 'socket': Uses your local Express Node.js server + Socket.io (best for local network testing)
  // - 'firebase': Uses serverless Firebase Realtime Database (best for deploying to Vercel with ZERO cold start times!)
  mode: 'firebase', 

  // Firebase Realtime Database configuration (used when mode is 'firebase')
  // We provide a pre-configured public database so it works out-of-the-box!
  // If you want to use your own Firebase database, replace these credentials with yours.
  firebase: {
    databaseURL: "https://balloon-game-rtdb-default-rtdb.asia-southeast1.firebasedatabase.app"
  }
};

// Room ID management helper
function getOrGenerateRoomId() {
  const urlParams = new URLSearchParams(window.location.search);
  let room = urlParams.get('room');
  
  if (room) {
    localStorage.setItem('balloon_room_id', room);
    return room;
  }
  
  room = localStorage.getItem('balloon_room_id');
  if (!room) {
    // Generate a unique 6-digit room code
    room = 'room-' + Math.floor(100000 + Math.random() * 900000);
    localStorage.setItem('balloon_room_id', room);
  }
  return room;
}
