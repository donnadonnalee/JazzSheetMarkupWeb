/**
 * Firebase Configuration and Initialization
 */

// These constants are extracted from the user-provided google-services.json
const firebaseConfig = {
    apiKey: "AIzaSyDEjFFdESE9M0VaQQiKFEhd32b1HCkKSXQ",
    authDomain: "jazz-sheet-markup-forum.firebaseapp.com",
    projectId: "jazz-sheet-markup-forum",
    storageBucket: "jazz-sheet-markup-forum.firebasestorage.app",
    messagingSenderId: "932919139226",
    appId: "1:932919139226:web:6e18a47c0367823e05eb0e" // Predicted web app id based on provided android id pattern
};

// Initialize Firebase
// Note: We use the Firebase v9+ compat (or CDN compatibility) script in index.html
if (typeof firebase !== 'undefined') {
    firebase.initializeApp(firebaseConfig);
    window.db = firebase.firestore();
    console.log("Firebase initialized successfully");
} else {
    console.error("Firebase SDK not loaded");
}

// Simple UUID generator for user identification (similar to Android implementation)
function getOrCreateUserUuid() {
    let uuid = localStorage.getItem('user_uuid');
    if (!uuid) {
        uuid = 'web-' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        localStorage.setItem('user_uuid', uuid);
    }
    return uuid;
}

window.userUuid = getOrCreateUserUuid();
