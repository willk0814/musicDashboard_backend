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
    'https://musicDashboard.willkoenig.info'    // production front end
]

// define cors to allow cross origin requests
app.use(cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);
      if (allowedOrigins.indexOf(origin) === -1) {
        var msg = 'The CORS policy for this site does not allow access from the specified Origin.';
        return callback(new Error(msg), false);
      }
      return callback(null, true);
    }
  }));

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