require('dotenv').config()
const redis = require('redis')
const ShortURL = require('../models/url')

const VISITS_HASH_KEY = 'url_visits'

let redisClient = null

const connectRedis = async () => {
    if (redisClient) {
        return redisClient
    }

    redisClient = redis.createClient({
        host: process.env.REACT_APP_REDIS_HOST,
        port: process.env.REACT_APP_REDIS_PORT || 6379,
        enable_offline_queue: false,
    })

    redisClient.on('error', (err) => {
        console.log('Redis error: ' + err.message)
    })

    return redisClient
}

const isRedisConnected = () => {
    return Boolean(redisClient && redisClient.connected)
}

const recordVisit = async (hash) => {
    try {
        const client = await connectRedis()

        return new Promise((resolve) => {
            client.hincrby(VISITS_HASH_KEY, hash, 1, (err) => {
                if (err) {
                    console.log(err)
                }

                resolve()
            })
        })
    } catch (err) {
        console.log(err)
    }
}

const flushVisitsToMongo = async () => {
    try {
        const client = await connectRedis()

        const visits = await new Promise((resolve, reject) => {
            client.hgetall(VISITS_HASH_KEY, (err, result) => {
                if (err) {
                    return reject(err)
                }

                resolve(result || {})
            })
        })

        const hashes = Object.keys(visits)

        if (!hashes.length) {
            return
        }

        for (const hash of hashes) {
            const count = parseInt(visits[hash], 10)

            if (!count || count <= 0) {
                continue
            }

            const removed = await new Promise((resolve) => {
                client.hdel(VISITS_HASH_KEY, hash, (err, reply) => {
                    if (err) {
                        console.log(err)
                        return resolve(0)
                    }

                    resolve(reply)
                })
            })

            if (!removed) {
                continue
            }

            await ShortURL.findOneAndUpdate(
                { Hash: hash },
                { $inc: { Visits: count } }
            ).catch((err) => console.log(err))
        }

        console.log(`Flushed visit counts for ${hashes.length} URL(s) to MongoDB.`)
    } catch (err) {
        console.log(err)
    }
}

const startVisitFlushWorker = (intervalMs = 30000) => {
    setInterval(() => {
        flushVisitsToMongo()
    }, intervalMs)
}

module.exports = {
    connectRedis,
    isRedisConnected,
    recordVisit,
    flushVisitsToMongo,
    startVisitFlushWorker
}
