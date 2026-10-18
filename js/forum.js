/**
 * Forum Class - Handles all forum interactions
 */
class Forum {
    constructor(db, userUuid) {
        this.db = db;
        this.userUuid = userUuid;
        this.songsCollection = db.collection('forum_songs');
        this.likesCollection = db.collection('likes_records');
        this.videosCollection = db.collection('forum_videos');
    }

    /**
     * Upload a song to the forum
     */
    async uploadSong(title, markup, author) {
        if (!markup.trim()) throw new Error("Markup is empty");

        const songData = {
            title: title || "Untitled",
            markup: markup,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            author: (author && author.trim()) ? author.trim() : "Browser User",
            versionCode: 1,
            likes: 0,
            videoCount: 0,
            uuid: this.userUuid
        };

        return await this.songsCollection.add(songData);
    }

    /**
     * Fetch all songs from the forum
     */
    async fetchSongs(orderByField = 'timestamp', orderDirection = 'desc') {
        const snapshot = await this.songsCollection.orderBy(orderByField, orderDirection).get();
        return snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
    }

    /**
     * Like a song
     */
    async likeSong(songId) {
        const likeRecordId = `${songId}_${this.userUuid}`;
        const likeDoc = await this.likesCollection.doc(likeRecordId).get();

        if (likeDoc.exists) {
            throw new Error("Already liked");
        }

        const batch = this.db.batch();
        batch.set(this.likesCollection.doc(likeRecordId), {
            songId: songId,
            userId: this.userUuid
        });
        batch.update(this.songsCollection.doc(songId), {
            likes: firebase.firestore.FieldValue.increment(1)
        });

        await batch.commit();
        return true;
    }

    /**
     * Update/Overwrite an existing song in the forum (free overwrite)
     */
    async updateSong(songId, title, markup, author) {
        if (!markup || !markup.trim()) throw new Error("Markup is empty");
        const docRef = this.songsCollection.doc(songId);
        const updateData = {
            markup: markup.trim(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        if (title && title.trim()) updateData.title = title.trim();
        if (author && author.trim()) updateData.author = author.trim();

        await docRef.update(updateData);
        return true;
    }

    /**
     * Delete a song (free permission)
     */
    async deleteSong(songId, authorUuid) {
        return await this.songsCollection.doc(songId).delete();
    }

    /**
     * Fetch videos for a song
     */
    async fetchVideos(songId) {
        const snapshot = await this.videosCollection.where('songId', '==', songId).get();
        return snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
    }

    /**
     * Add a YouTube video link to a song
     */
    async addVideo(songId, title, url) {
        if (!title.trim() || !url.trim()) throw new Error("Title or URL is empty");

        const videoData = {
            songId: songId,
            youtubeUrl: url,
            title: title,
            uuid: this.userUuid
        };

        const batch = this.db.batch();
        const newVideoRef = this.videosCollection.doc();
        batch.set(newVideoRef, videoData);
        batch.update(this.songsCollection.doc(songId), {
            videoCount: firebase.firestore.FieldValue.increment(1)
        });

        return await batch.commit();
    }
}

window.Forum = Forum;
