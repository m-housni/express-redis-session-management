// Import required modules
import { RedisStore } from "connect-redis"
import session from "express-session"
import { createClient } from "redis"
import express from "express"
import bcrypt from "bcrypt"
import dotenv from 'dotenv'
import redisInfo from 'redis-info'
import client from 'prom-client'

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

// Prometheus metrics
const collectDefaultMetrics = client.collectDefaultMetrics
collectDefaultMetrics()

const redisMetrics = new client.Gauge({
  name: 'redis_info',
  help: 'Redis info metrics',
  labelNames: ['metric']
})

async function collectRedisMetrics() {
  const info = await redisClient.info()
  const parsedInfo = redisInfo.parse(info)
  Object.keys(parsedInfo).forEach(key => {
    const value = parsedInfo[key]
    if (typeof value === 'number') {
      redisMetrics.set({ metric: key }, value)
    }
  })
}

// Collect Redis metrics every 5 seconds
setInterval(collectRedisMetrics, 5000)

// Expose metrics endpoint
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', client.register.contentType)
  res.end(await client.register.metrics())
})

// In-memory users store
const getUsers = async () => {
  const users = [];
  let cursor = '0';

  do {
    // Use the SCAN command to fetch a batch of keys matching the pattern
    const reply = await redisClient.scan(cursor, 'MATCH', 'users:*', 'COUNT', 100);
    cursor = reply[0];
    const keys = reply[1];

    // Fetch and parse user objects for the current batch of keys
    const userPromises = keys.map(async (key) => {
      const user = await redisClient.get(key);
      return JSON.parse(user);
    });

    // Accumulate the user objects
    users.push(...await Promise.all(userPromises));
  } while (cursor !== '0'); // Continue until the cursor returns to '0'

  return users;
};


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
const PORT = process.env.PORT || 3333
const start = performance.now()
app.listen(PORT, () => {
  const end = performance.now()
  console.log(`Server started on http://localhost:${PORT}`)
  console.info(`Startup time: ${end - start}ms`)
})
