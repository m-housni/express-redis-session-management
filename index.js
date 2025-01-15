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

const users = [];

// Register route
app.post('/register', async (req, res) => {
    const { username, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    users.push({ username, password: hashedPassword });
    res.status(201).send('User registered');
});

// Login route
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const user = users.find(u => u.username === username);
    if (user && await bcrypt.compare(password, user.password)) {
        req.session.userId = user.username;
        res.send('Login successful');
    } else {
        res.status(401).send('Invalid credentials');
    }
});

// Middleware to protect routes
function authMiddleware(req, res, next) {
    if (req.session.userId) {
        next();
    } else {
        res.status(401).send('Unauthorized');
    }
}

// Protected route
app.get('/dashboard', authMiddleware, (req, res) => {
    res.send(`Welcome, ${req.session.userId}`);
});

// Start the server
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
