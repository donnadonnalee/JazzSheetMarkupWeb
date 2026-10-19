/**
 * SessionRoom - Realtime Collaborative Editing & Chat Room for JazzSheetMarkup
 * Powered by Cloud Firestore onSnapshot
 */
class SessionRoom {
    constructor(db, userUuid) {
        this.db = db;
        this.userUuid = userUuid;
        // Use dedicated 'share_rooms' collection in Firestore
        this.roomsCollection = db ? db.collection('share_rooms') : null;

        this.currentRoomId = null;
        this.userName = this.loadOrCreateUserName();
        this.isConnected = false;
        this.unsubscribe = null;

        this.lastRemoteMarkup = null;
        this.lastLocalMarkup = null;
        this.debounceTimer = null;
        this.debounceMs = 1200; // 1.2s debounce to preserve Firestore quota

        // Chat state
        this.messages = [];
        this.unreadCount = 0;
        this.isChatOpen = false;

        // Callbacks
        this.onMarkupReceived = null;     // (markup, updatedBy) => {}
        this.onStatusChanged = null;       // (isConnected, roomId, memberInfo) => {}
        this.onMessagesUpdated = null;     // (messages, unreadCount) => {}
        this.onSyncState = null;           // (isSyncing) => {}
    }

    loadOrCreateUserName() {
        let name = localStorage.getItem('share_user_name');
        if (!name || !name.trim()) {
            const adjectives = ['Cool', 'Smooth', 'Swingin', 'Bebop', 'Mellow', 'Funky', 'Blue', 'Modal'];
            const instruments = ['Cat', 'Horn', 'Pianist', 'Bassist', 'Drummer', 'Guitarist', 'Sax'];
            const randAdj = adjectives[Math.floor(Math.random() * adjectives.length)];
            const randInst = instruments[Math.floor(Math.random() * instruments.length)];
            const randNum = Math.floor(100 + Math.random() * 900);
            name = `${randAdj}_${randInst}_${randNum}`;
            localStorage.setItem('share_user_name', name);
        }
        return name;
    }

    setUserName(newName) {
        if (!newName || !newName.trim()) return;
        this.userName = newName.trim();
        localStorage.setItem('share_user_name', this.userName);
    }

    generateRoomId() {
        const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
        let id = 'jam-';
        for (let i = 0; i < 4; i++) {
            id += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return id;
    }

    getShareUrl(roomId = this.currentRoomId) {
        if (!roomId) return window.location.href;
        const url = new URL(window.location.href);
        url.searchParams.set('room', roomId);
        return url.toString();
    }

    getRoomDocRef(roomId = this.currentRoomId) {
        return this.roomsCollection.doc(roomId);
    }

    async connect(roomId, initialMarkup = '') {
        if (!this.db || !this.roomsCollection) {
            throw new Error('Firebase Firestore is not initialized.');
        }

        const cleanRoomId = (roomId || '').trim().toLowerCase();
        if (!cleanRoomId) {
            throw new Error('Room name cannot be empty.');
        }

        if (this.isConnected && this.currentRoomId === cleanRoomId) {
            return;
        }

        if (this.isConnected) {
            this.disconnect();
        }

        this.currentRoomId = cleanRoomId;
        const roomDocRef = this.getRoomDocRef(cleanRoomId);

        // Update URL query parameter without page reload
        try {
            const newUrl = new URL(window.location.href);
            newUrl.searchParams.set('room', cleanRoomId);
            window.history.replaceState({ room: cleanRoomId }, '', newUrl.toString());
        } catch (e) {
            console.warn('Could not update history state:', e);
        }

        if (this.onSyncState) this.onSyncState(true);

        try {
            // Check if document exists in new 'share_rooms' collection
            const docSnap = await roomDocRef.get();
            if (!docSnap.exists) {
                // Check if legacy data exists in 'forum_songs' (under 'room_' prefix)
                let legacyData = null;
                try {
                    const legacyDocRef = this.db.collection('forum_songs').doc('room_' + cleanRoomId);
                    const legacySnap = await legacyDocRef.get();
                    if (legacySnap.exists) {
                        legacyData = legacySnap.data();
                        // Clean up legacy doc from forum_songs to keep forum pure
                        await legacyDocRef.delete().catch(() => {});
                    }
                } catch (e) {
                    // Ignore legacy read errors
                }

                await roomDocRef.set({
                    roomId: cleanRoomId,
                    markup: (legacyData && legacyData.markup) ? legacyData.markup : (initialMarkup || ''),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    updatedBy: (legacyData && legacyData.updatedBy) ? legacyData.updatedBy : this.userName,
                    creatorUuid: (legacyData && legacyData.creatorUuid) ? legacyData.creatorUuid : this.userUuid,
                    messages: (legacyData && legacyData.messages && legacyData.messages.length > 0)
                        ? legacyData.messages
                        : [
                            {
                                id: 'sys_' + Date.now(),
                                sender: 'System',
                                text: `Room "${cleanRoomId}" created by ${this.userName}.`,
                                timestamp: Date.now()
                            }
                        ]
                });
            }
        } catch (err) {
            console.error('Failed to initialize room document:', err);
            if (this.onSyncState) this.onSyncState(false);
            throw err;
        }

        // Subscribe to realtime updates
        this.unsubscribe = roomDocRef.onSnapshot((doc) => {
            if (!doc.exists) return;
            const data = doc.data();

            // 1. Markup Sync
            if (data.markup !== undefined) {
                // If the update came from another user or was not our latest local markup
                if (data.markup !== this.lastLocalMarkup && data.markup !== this.lastRemoteMarkup) {
                    this.lastRemoteMarkup = data.markup;
                    if (this.onMarkupReceived) {
                        this.onMarkupReceived(data.markup, data.updatedBy || 'Collaborator');
                    }
                }
            }

            // 2. Chat Messages Sync
            if (Array.isArray(data.messages)) {
                const prevCount = this.messages.length;
                this.messages = data.messages;

                if (!this.isChatOpen && this.messages.length > prevCount) {
                    const newCount = this.messages.length - prevCount;
                    this.unreadCount += newCount;
                }

                if (this.onMessagesUpdated) {
                    this.onMessagesUpdated(this.messages, this.unreadCount);
                }
            }

            if (this.onSyncState) this.onSyncState(false);
        }, (error) => {
            console.error('Firestore onSnapshot error:', error);
            if (this.onSyncState) this.onSyncState(false);
        });

        this.isConnected = true;
        this.unreadCount = 0;
        if (this.onStatusChanged) {
            this.onStatusChanged(true, this.currentRoomId);
        }
        if (this.onSyncState) this.onSyncState(false);
    }

    disconnect() {
        if (this.unsubscribe) {
            this.unsubscribe();
            this.unsubscribe = null;
        }

        clearTimeout(this.debounceTimer);
        this.debounceTimer = null;

        this.isConnected = false;
        const oldRoom = this.currentRoomId;
        this.currentRoomId = null;
        this.lastRemoteMarkup = null;
        this.lastLocalMarkup = null;
        this.messages = [];
        this.unreadCount = 0;

        // Remove room query parameter from URL
        try {
            const newUrl = new URL(window.location.href);
            newUrl.searchParams.delete('room');
            window.history.replaceState({}, '', newUrl.toString());
        } catch (e) {
            console.warn('Could not reset history state:', e);
        }

        if (this.onStatusChanged) {
            this.onStatusChanged(false, oldRoom);
        }
        if (this.onMessagesUpdated) {
            this.onMessagesUpdated([], 0);
        }
        if (this.onSyncState) this.onSyncState(false);
    }

    sendLocalMarkup(markup) {
        if (!this.isConnected || !this.currentRoomId) return;

        // Skip if identical to what we last received from remote
        if (markup === this.lastRemoteMarkup) return;

        clearTimeout(this.debounceTimer);
        if (this.onSyncState) this.onSyncState(true);

        this.debounceTimer = setTimeout(async () => {
            try {
                this.lastLocalMarkup = markup;
                const roomDocRef = this.getRoomDocRef(this.currentRoomId);
                await roomDocRef.set({
                    isRoom: true,
                    markup: markup,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    updatedBy: this.userName
                }, { merge: true });
                if (this.onSyncState) this.onSyncState(false);
            } catch (err) {
                console.error('Failed to sync markup to Firestore:', err);
                if (this.onSyncState) this.onSyncState(false);
            }
        }, this.debounceMs);
    }

    async sendChatMessage(text) {
        if (!this.isConnected || !this.currentRoomId) {
            throw new Error('Not connected to a room.');
        }

        const trimmed = (text || '').trim();
        if (!trimmed) return;

        const msg = {
            id: 'msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
            sender: this.userName,
            senderUuid: this.userUuid,
            text: trimmed,
            timestamp: Date.now()
        };

        try {
            const roomDocRef = this.getRoomDocRef(this.currentRoomId);
            // Cap message history to latest 50 messages to keep document lightweight
            const updatedMessages = [...this.messages, msg].slice(-50);
            await roomDocRef.update({
                messages: updatedMessages
            });
        } catch (err) {
            console.error('Failed to send chat message:', err);
            throw err;
        }
    }

    setChatOpen(isOpen) {
        this.isChatOpen = isOpen;
        if (isOpen) {
            this.unreadCount = 0;
            if (this.onMessagesUpdated) {
                this.onMessagesUpdated(this.messages, 0);
            }
        }
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SessionRoom };
}
