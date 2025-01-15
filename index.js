const express = require('express');
const session = require('express-session');
const RedisStore = require('connect-redis')(session);
const bcrypt = require('bcrypt');
const app = express();
const port = 3000;

// Middleware to parse JSON bodies
app.use(express.json());

// Session configuration
app.use(session({
    store: new RedisStore({ host: 'localhost', port: 6379 }),
    secret: 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false } // Set to true if using HTTPS
}));

// Start the server
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
