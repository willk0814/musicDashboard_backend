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

// listening
app.listen(port, () => { 
    console.log(`Local address: http://localhost:${port}/`);
    console.log(`EC2 instance address: http://18.215.149.105:${port}/`);
})

app.use("/", routes)