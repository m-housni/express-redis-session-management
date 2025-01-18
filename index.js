// Import required modules
import { RedisStore } from "connect-redis"
import session from "express-session"
import { createClient } from "redis"
import express from "express"
import bcrypt from "bcrypt"
import dotenv from 'dotenv'

// Load environment variables
dotenv.config()

// Initialize Redis client
let redisClient = createClient()
redisClient.connect().catch(console.error)

// Initialize Redis store
let redisStore = new RedisStore({
  client: redisClient,
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: process.env.REDIS_PORT || 6379,
  prefix: process.env.SESSION_PREFIX || "express-redis-session-management:",
})

const app = express()

// Middleware to parse JSON bodies
app.use(express.json())

// Initialize session storage
app.use(
  session({
    store: redisStore,
    resave: false,
    saveUninitialized: false,
    secret: process.env.SESSION_SECRET || "my-secret-key",
    cookie: {
      secure: false,
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24,
    },
  })
)

// In-memory users store
const getUsers =  async () => await redisClient.keys('users:*').then(async (keys) => {
  const userPromises = keys.map(async (key) => {
    const user = await redisClient.get(key)
    return JSON.parse(user)
  })
  return Promise.all(userPromises)
})

// Register route
app.post("/register", async (req, res) => {
  const { username, password } = req.body
  let users = await getUsers()
  const userExists = users.find((u) => u.username === username)
  if (userExists) {
    return res.status(400).send("User already registered")
  }
  const hashedPassword = await bcrypt.hash(password, 10)
  users.push({ username, password: hashedPassword })

  // Save user to redis
  redisClient.set(`users:${username}`, JSON.stringify({ username, password: hashedPassword }))
  
  res.send("User registered")
})

// Login route
app.post("/login", async (req, res) => {
  const { username, password } = req.body
  let users = await getUsers()
  const user = users.find((u) => u.username === username)
  if (user && (await bcrypt.compare(password, user.password))) {
    req.session.userId = user.username
    res.send("Login successful")
  } else {
    res.status(401).send("Invalid credentials")
  }
})

// Logout route
app.post("/logout", (req, res) => {
  req.session.destroy()
  res.send("Logged out")
})

// Middleware to protect routes
function authMiddleware(req, res, next) {
  if (req.session.userId) {
    next()
  } else {
    res.status(401).send("Unauthorized")
  }
}

// Protected route
app.get("/dashboard", authMiddleware, (req, res) => {
  res.send(`Welcome, ${req.session.userId}`)
})

// Start server
const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`Server started on http://localhost:${PORT}`)
})
