const mongoose = require('mongoose');

// Define a schema to represent a listen in our db
const listenSchema = new mongoose.Schema({
    trackId: { type: String, required: true },
    name: { type: String, required: true },
    artists: [{ 
        name: { type: String, required: true },
        id: { type: String, required: true }
    }],
    album: { type: String, required: true },
    albumId: { type: String, required: true },
    spotifyLink: { type: String, required: true },
    playedAt: { type: Date, required: true, unique: true },
    duration: { type: Number, required: true }
}, { collection: 'listens' });

module.exports = mongoose.model('Listen', listenSchema);