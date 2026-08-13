require('dotenv').config()
const cors = require('cors')
const express = require('express')
const mainRoute = require('./src/routes/main')
const purgeAliases = require('./src/workers/purgeAliases')
const { connectDB } = require('./src/helpers/mongodb')
const { connectRedis, startVisitFlushWorker } = require('./src/helpers/redis')
const { connectZK } = require('./src/helpers/zookeeper')

const app = express()

const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)

app.set('trust proxy', 1)
app.use(cors({
    origin(origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
            return callback(null, true)
        }

        return callback(new Error('Not allowed by CORS'))
    }
}))
app.use(express.json())

app.use('/', mainRoute)

app.use((req, res) => {
    res.send("<h1>404 Not Found</h1>")
})

const PORT = process.env.PORT || 8081
const VISIT_FLUSH_INTERVAL_MS = Number(process.env.VISIT_FLUSH_INTERVAL_MS) || 30000

const startServer = async () => {
    await connectDB()
    await connectRedis()
    await connectZK()

    app.listen(PORT, () => {
        console.log(`App started on port ${PORT}`)
        purgeAliases()
        startVisitFlushWorker(VISIT_FLUSH_INTERVAL_MS)
    })
}

startServer().catch((err) => {
    console.log('Failed to start server.')
    console.log(err)
    process.exit(1)
})

// docker compose up --build --scale node-server=3
