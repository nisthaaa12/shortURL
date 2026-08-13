const mongoose = require('mongoose')
const { connectRedis } = require('../helpers/redis')
const { isRangeReady, isZkConnected } = require('../helpers/zookeeper')

const isDbConnected = () => mongoose.connection.readyState === 1

const pingRedis = async () => {
    try {
        const client = await connectRedis()

        return new Promise((resolve) => {
            client.ping((err, reply) => {
                resolve(!err && reply === 'PONG')
            })
        })
    } catch (err) {
        return false
    }
}

const getHealth = (req, res) => {
    res.status(200).json({
        status: 'ok',
        service: 'shorturl-api'
    })
}

const getReadiness = async (req, res) => {
    const mongoReady = isDbConnected()
    const redisReady = await pingRedis()
    const zookeeperReady = isZkConnected() && isRangeReady()

    const ready = mongoReady && redisReady && zookeeperReady

    res.status(ready ? 200 : 503).json({
        status: ready ? 'ready' : 'not_ready',
        checks: {
            mongodb: mongoReady ? 'up' : 'down',
            redis: redisReady ? 'up' : 'down',
            zookeeper: zookeeperReady ? 'up' : 'down'
        }
    })
}

module.exports = { getHealth, getReadiness, isDbConnected }
