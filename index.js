import {RedisStore} from "connect-redis"
import session from "express-session"
import {createClient} from "redis"
import express from "express"
import bcrypt from "bcrypt"

// Initialize client.
let redisClient = createClient()
redisClient.connect().catch(console.error)

// Initialize store.
let redisStore = new RedisStore({
  client: redisClient,
  prefix: "express-redis-session-management:",
})

// Initialize session storage.
const app = express()

app.use(express.json())
app.use(
    session({
        store: redisStore,
        resave: false, // required: force lightweight session keep alive (touch)
        saveUninitialized: false, // recommended: only save session when data exists
        secret: "my-secret-key",
        cookie: {
            secure: false, // ensures the browser only sends the cookie over HTTPS
            httpOnly: true, // ensures the cookie is sent only over HTTP(S), not client JavaScript
            maxAge: 1000 * 60 * 60 * 24, // cookie expiry: 1 day
        },
    }),
)

const users = []

// Register route
app.post('/register', async (req, res) => {
    const { username, password } = req.body
    const userExists = users.find(u => u.username === username)
    if (userExists) {
        return res.status(400).send('User already registered')
    }
    const hashedPassword = await bcrypt.hash(password, 10)
    users.push({ username, password: hashedPassword })
    res.send('User registered')
})

// Login route
app.post('/login', async (req, res) => {
    const { username, password } = req.body
    const user = users.find(u => u.username === username)
    if (user && await bcrypt.compare(password, user.password)) {
        req.session.userId = user.username
        res.send('Login successful')
    } else {
        res.status(401).send('Invalid credentials')
    }
})

// Logout route
app.post('/logout', (req, res) => {
    req.session.destroy()
    res.send('Logged out')
})

// Middleware to protect routes
function authMiddleware(req, res, next) {
    if (req.session.userId) {
        next()
    } else {
        res.status(401).send('Unauthorized')
    }
}

// Protected route
app.get('/dashboard', authMiddleware, (req, res) => {
    res.send(`Welcome, ${req.session.userId}`)
})


// Start server.
app.listen(3000, () => {
  console.log("Server started on http://localhost:3000")
})