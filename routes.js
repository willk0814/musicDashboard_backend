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

        // Process the data and save it
        for (const item of data.body.items){
            // create an object that adheres to our db model
            const listen = {
                trackId: item.track.id,
                name: item.track.name,
                artists: item.track.artists.map(artist => artist.name),
                album: item.track.album.name,
                spotifyLink: item.track.external_urls.spotify,
                playedAt: new Date(item.played_at)
            };

            try {
                await Listen.create(listen)
                console.log(`Saved new listen: ${listen.name}`)
            } catch (error) {
                // check to see if error is a result of a duplicate key
                if (error.code === 11000) {
                    console.log(`Already saved listen: ${listen.name}`)
                } else {
                    console.log(`Error saving listen: ${listen.name}, ${error.message}`)
                }
            }
        }
        console.log('Finished processing recently played tracks')
    } catch (error) {
        console.log(`error encountered: ${error}`)
    }
}

// function to schedule all api calls
function scheduleApiCalls() {
    console.log('Scheduling API calls');
    cron.schedule('0 * * * *', getRecentlyPlayedTracks);
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

initializeSpotifyApi();

module.exports = router;