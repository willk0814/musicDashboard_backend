const express = require('express');
const router = express.Router();
const SpotifyWebApi = require('spotify-web-api-node')
const cron = require('node-cron')
const fs = require('fs')
const Listen = require('./models/Listen')

// Initialize the Spotify Api client
const spotifyApi = new SpotifyWebApi({
    clientId: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    redirectUri: process.env.REDIRECT_URI_DECODED
})

const TOKEN_PATH = './spotify_tokens.json';

// function to load tokens from the file
function loadTokens() {
    // check if the file exists
    if (fs.existsSync(TOKEN_PATH)) {

        // file exists -> read and return the data from file
        const data = fs.readFileSync(TOKEN_PATH);
        return JSON.parse(data);
    }
    // file doesn't exist -> return null
    return null;
}

// function to save tokens to the file
function saveTokens(tokens) {
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens))
}

// Send user for authentication on initial request
router.get('/', (req, res) => {
    // define scopes that our app will need and generate auth url
    const scopes = ['user-top-read', 'user-read-recently-played']
    const authorizeURL = spotifyApi.createAuthorizeURL(scopes)
    
    // redirect the user to the authorize url
    res.redirect(authorizeURL)
});

// Handle redirect
router.get('/redirect', async (req, res) => {
    try {
        // retrieve authroization code
        const { code } = req.query;

        // request and deconstruct code
        const authorizationCodeGrantResponse = await spotifyApi.authorizationCodeGrant(code);
        const { access_token, refresh_token, expires_in } = authorizationCodeGrantResponse.body;
        
        // create and save token object 
        const tokens = {
            access_token,
            refresh_token,
            expires_at: Date.now() + expires_in * 1000
        }
        saveTokens(tokens);

        // set up cron job to schedule api calls
        scheduleApiCalls();

        // log success
        res.send('Authentication successful, api calls scheduled');
    } catch (error) {
        res.status(500).send(`error encountered: ${error}`);
    }
})

// function to refresh access token
async function refreshAccessToken() {
    try {
        // load and confirm token existence
        const tokens = loadTokens();
        if (!tokens){
            throw new Error('no tokens found please authenticate first');
        }

        // set refresh tokens and request new access token
        spotifyApi.setRefreshToken(tokens.refresh_token);
        const data = await spotifyApi.refreshAccessToken();
        const { access_token, expires_in } = data.body;

        // generate and save new token object
        const newTokens = {
            access_token,
            refresh_token: tokens.refresh_token,
            expires_at: Date.now() + expires_in * 1000
        };
        saveTokens(newTokens);

        // log success
        console.log('Access token has been refreshed and saved');
        return newTokens.access_token;
    } catch (error) {
        console.log(`Error refreshing token: ${error}`);
        throw error;
    }

}

// function to gather the 50 most recently played songs
async function getRecentlyPlayedTracks() {
    console.log(`\nMaking Api call for recent tracks @ 
        ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })}`);

    try {
        // load and check access tokens
        let tokens = loadTokens();
        if (!tokens){
            throw new Error('no tokens found, please authenticate first')
        }

        // check to see if we need to refresh our tokens and set access token
        if (Date.now() > tokens.expires_at - 30000){
            await refreshAccessToken();
            tokens = loadTokens();
        }
        spotifyApi.setAccessToken(tokens.access_token)

        // Make Api request to spotify for data
        const data = await spotifyApi.getMyRecentlyPlayedTracks({
            limit: 50
        });

        // lets print out the first item that we got back
        // console.log(`Individual data item: \n${JSON.stringify(data.body.items[0].track.album.images[1])}`);

        // create a variable to track how many saves
        let save_count = 0;

        // Process the data and save it
        for (const item of data.body.items){
            // create an object that adheres to our db model
            const listen = {
                trackId: item.track.id,
                name: item.track.name,
                artists: item.track.artists.map(artist => ({
                    name: artist.name,
                    id: artist.id
                })),
                album: item.track.album.name,
                albumId: item.track.album.id,
                spotifyLink: item.track.external_urls.spotify,
                imgURL: item.track.album.images[1].url,
                playedAt: new Date(item.played_at),
                duration: item.track.duration_ms
            };

            try {
                await Listen.create(listen)
                save_count ++;
            } catch (error) {
                // check to see if error is a result of a duplicate key
                if (error.code === 11000) {
                    continue;
                } else {
                    console.log(`Error saving listen: ${listen.name}, ${error.message}`)
                }
            }
        }
        console.log(`Complete Processing Recent Listens, Saved: ${save_count}/50`)
    } catch (error) {
        console.log(`error encountered: ${error}`)
    }
}

// function to schedule all api calls
function scheduleApiCalls() {
    console.log('Scheduling API calls');
    
    // at the top of every hour
    cron.schedule('0 * * * *', getRecentlyPlayedTracks);
    
    // every minute
    // cron.schedule('* * * * *', getRecentlyPlayedTracks);
}

// initialize spotify api function 
function initializeSpotifyApi() {
    const tokens = loadTokens();
    if (tokens) {
        spotifyApi.setAccessToken(tokens.access_token);
        spotifyApi.setRefreshToken(tokens.refresh_token);
        console.log('Spotify API initialized with stored tokens');
        scheduleApiCalls();
        return true;
    } else {
        console.log('Unable to authenticate')
        return false;
    }
}


// -- Interfacing with the Front End --

// API to return the most recent 50 songs that I have listened to
router.get('/api/recent-tracks', async (req, res) => {
    try {
        const recentTracks = await Listen.find()
            .sort({ playedAt: -1 })
            .limit(50);
        res.json(recentTracks);
    } catch (error) {
        console.log(`Error fetching recent tracks: ${error}`)
        res.status(500).json({ error: 'An error occurred while fetching recent tracks' });
    }
});

// API to return my most listened to artist of the last week
router.get('/api/top-artist', async (req, res) => {
    try {
        // Define the date for one week ago
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

        // Define parameters 
        const topArtists = await Listen.aggregate([
            // Include only listens in the last week
            { $match: { playedAt: { $gte: oneWeekAgo }}},
            // Create a new element for each element in artist array
            { $unwind: '$artists' },
            // Group documents by artist's name
            { $group: {
                _id: '$artists.name',
                artistId: { $first: '$artists.id' }, // Assuming id should be taken from the first artist occurrence
                listens: { $sum: 1 }
            }},
            // Sort by number of listens (descending) and then by artist name ascending
            { $sort: { listens: -1, _id: 1 }},
            // Limit response to one result
            { $limit: 1 }
        ]);

        // Check if any artist was found
        if (topArtists.length > 0){

            const topArtist = topArtists[0];

            // ensure that the access token is fresh
            let tokens = loadTokens();
            if (Date.now() > tokens.expires_at - 30000){
                await refreshAccessToken();
                tokens = loadTokens();
            }
            // set api tokens
            spotifyApi.setAccessToken(tokens.access_token);

            // fetch artist info from spotify -> define image
            const artistInfo = await spotifyApi.getArtist(topArtist.artistId);
            const imgURL = artistInfo.body.images[1].url;

            res.json({ 
                artist: topArtists[0]._id, 
                artistId: topArtists[0].artistId, 
                listens: topArtists[0].listens,
                imgURL: imgURL});
        } else {
            res.json({ message: 'No artist found in the past week' });
        }

    } catch (error) {
        console.log(`Error fetching top artist: ${error}`);
        res.status(500).json({ error: 'An error occurred while fetching top artist' });
    }
});

// API to return my most listened song of the past week
router.get('/api/top-song', async (req, res) => {
    try {
        // define the date for one week ago
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

        // aggregate to find the top song
        const topSongs = await Listen.aggregate([
            // include only listens in the last week
            { $match: { playedAt: { $gte: oneWeekAgo }}},
            // group documents according to song
            { $group: {
                _id: { trackId: '$trackId', name: '$name', imgURL: '$imgURL' },
                listens: { $sum: 1 }
            }},
            // sort by number of listens (descending) and then by song name
            { $sort: { listens: -1, '_id.name': 1 }},
            // limit to one result
            { $limit: 1 }
        ]);

        // Check if any song was found
        if (topSongs.length > 0) {
            res.json({ 
                song: topSongs[0]._id.name,
                trackId: topSongs[0]._id.trackId,
                listens: topSongs[0].listens,
                imgURL: topSongs[0]._id.imgURL 
            });
        } else {
            res.json({ message: 'No songs found in the past week' });
        }
    } catch (error) {
        console.log(`Error fetching top song: ${error}`)
        res.status(500).json({ error: 'An error occurred while fetching top song' });
    }
});

// API to return my most listened album of the past week
router.get('/api/top-album', async (req, res) => {
    try {
        // define the date for one week ago
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

        // aggregate to find top album
        const topAlbums = await Listen.aggregate([
            // include only listens in the last week
            { $match: { playedAt: { $gte: oneWeekAgo }}},
            // group documents according to album
            { $group: {
                _id: { albumId: '$albumId', album: '$album'},
                listens: { $sum: 1 },
                imgURL: { $first: '$imgURL' }
            }},
            // sort by the number of listens (descending) then alphabetically
            { $sort: { listens: -1, '_id.album': 1 }},
            // limit the result to 1 element
            { $limit: 1 }
        ]);

        // confirm that we found an album
        if (topAlbums.length > 0) {
            res.json({
                album: topAlbums[0]._id.album,
                albumId: topAlbums[0]._id.albumId,
                listens: topAlbums[0].listens,
                imgURL: topAlbums[0].imgURL
            });
        } else {
            res.json({ message: 'No album found' });
        }

    } catch (error) {
        console.log(`Error fetching top album data`);
        res.status(500).json({ error: 'Error fetching top album data' });
    }
});

// API to return my listening statistics
router.get('/api/listening-stats', async (req, res) => {
    try {
        // define the date for a week ago
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

        // aggregate to find the return value
        const listening_time = await Listen.aggregate([
            // only listeing done in the last week
            { $match: { playedAt: { $gte: oneWeekAgo }}},
            // group all documents
            { $group: {
                _id: null,
                totalDuration: { $sum: '$duration'}
            }}
        ]);

        // confirm that stats were available
        if (listening_time.length > 0){
            // determine the nearest whole minute
            const minutes = Math.round(listening_time[0].totalDuration / 60000);
            res.json({ totalListeningTime: {
                minutes: minutes
            }});
        } else {
            res.json({ message: 'Could not find listening stats'})
        }

    } catch (error) {
        console.log(`Error fetching listening statistics: ${error}`);
        res.status(500).json({ error: 'Error fetching listening data' });
    }
});

initializeSpotifyApi();

module.exports = router;