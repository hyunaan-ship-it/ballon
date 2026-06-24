// Config and Synchronization Settings
// Controls whether the game runs in Local Node.js (Socket.io) mode, Serverless Firebase mode, or Serverless Supabase Realtime mode!

const SYNC_CONFIG = {
  // Sync mode: 'socket', 'firebase', or 'supabase'
  // - 'socket': Uses your local Express Node.js server + Socket.io (best for local network testing)
  // - 'firebase': Uses serverless Firebase Realtime Database
  // - 'supabase': Uses serverless Supabase Realtime Broadcast (extreme low-latency, free, and zero SQL tables setup needed!)
  mode: (window.location.hostname.includes('vercel.app') || window.location.href.includes('mode=supabase')) ? 'supabase' : 'socket', 

  // Connection failure warning banner toggle (set to true to completely hide the yellow offline warning banner on the host screen)
  suppressWarningBanner: false,

  // Firebase configuration (used when mode is 'firebase')
  firebase: {
    databaseURL: "https://balloon-game-rtdb-default-rtdb.asia-southeast1.firebasedatabase.app"
  },

  // Supabase Realtime configuration (used when mode is 'supabase')
  // Simply create a free Supabase project, copy your URL and Anon Key here, and it will work instantly with ZERO SQL database tables setup!
  supabase: {
    url: "https://dmmgkrtxszjogdjhdwde.supabase.co",
    anonKey: "sb_publishable_kfpjWCVFzozRMGCIo1tPxg_59HRk81F"
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
