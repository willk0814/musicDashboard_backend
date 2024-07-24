// Imports
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
require('dotenv').config()
const routes = require("./routes")

// Declare a new express app and a port to use
const app = express();
const port = 3000;

// define allowed origins
const allowedOrigins = [
    'http://localhost:5173',   // local developement front end
    'https://musicDashboard.willkoenig.info',
    'https://music-dashboard-git-master-willk419-projects.vercel.app/'    // production front end
]

// define and use cors options
const corsOptions = {
  origin: '*', // Replace with your Vercel app's URL
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  credentials: true,
  optionsSuccessStatus: 204
 };
 
 app.use(cors(corsOptions));

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