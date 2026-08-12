const { connectRedis } = require('../helpers/redis')

const memoryStore = new Map()

const getClientIp = (req) => {
    return req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'unknown'
}

const sendRateLimitResponse = (res, windowSeconds) => {
    res.set('Retry-After', String(windowSeconds))
    return res.status(429).json({
        error: 'Too many requests. Please try again later.'
    })
}

const memoryRateLimit = (key, maxRequests, windowSeconds, res, next) => {
    const now = Date.now()
    const windowMs = windowSeconds * 1000
    const current = memoryStore.get(key)

    if (!current || current.expiresAt <= now) {
        memoryStore.set(key, { count: 1, expiresAt: now + windowMs })
        return next()
    }

    current.count += 1
    memoryStore.set(key, current)

    if (current.count > maxRequests) {
        return sendRateLimitResponse(res, Math.ceil((current.expiresAt - now) / 1000))
    }

    return next()
}

const rateLimiter = ({ keyPrefix, maxRequests, windowSeconds }) => {
    return async (req, res, next) => {
        const ip = getClientIp(req)
        const key = `rate_limit:${keyPrefix}:${ip}`

        try {
            const redisClient = await connectRedis()

            redisClient.incr(key, (err, count) => {
                if (err) {
                    console.log(err)
                    return memoryRateLimit(key, maxRequests, windowSeconds, res, next)
                }

                if (count === 1) {
                    redisClient.expire(key, windowSeconds)
                }

                res.set('X-RateLimit-Limit', String(maxRequests))
                res.set('X-RateLimit-Remaining', String(Math.max(maxRequests - count, 0)))

                if (count > maxRequests) {
                    return sendRateLimitResponse(res, windowSeconds)
                }

                return next()
            })
        } catch (err) {
            console.log(err)
            return memoryRateLimit(key, maxRequests, windowSeconds, res, next)
        }
    }
}

module.exports = rateLimiter
