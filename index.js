// Imports
const express = require('express');
const mongoose = require('mongoose');

require('dotenv').config()

const routes = require("./routes")

// Declare a new express app and a port to use
const app = express();
const port = 3000;

// Connect to database
mongoose
    .connect(process.env.URI, {dbName: 'listeningHistory'})
    .then(() => { console.log('Database connected')})
    .catch((error) => { console.log('Error connecting to database:', error)})

// Spotify APi test
app.listen(port,
    () => { console.log(`Listening at http://localhost:${port}/`)}
)

app.use("/", routes)