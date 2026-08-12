const ShortURL = require('../models/url')
const { connectRedis, jobQueue } = require('../helpers/redis')
const { range, hashGenerator, getTokenRange, removeToken } = require('../helpers/zookeeper')

const DEFAULT_EXPIRATION_DAYS = Number(process.env.URL_EXPIRATION_DAYS) || 365
const MAX_EXPIRATION_DAYS = Number(process.env.URL_MAX_EXPIRATION_DAYS) || 365
const CACHE_TTL_SECONDS = 600

const getExpirationDate = (expirationDays) => {
    const parsedDays = Number(expirationDays)
    const requestedDays = parsedDays > 0 ? parsedDays : DEFAULT_EXPIRATION_DAYS
    const days = Math.min(requestedDays, MAX_EXPIRATION_DAYS)

    return new Date(Date.now() + (days * 24 * 60 * 60 * 1000))
}

const isExpired = (url) => {
    return url.ExpiresAt && url.ExpiresAt.getTime() <= Date.now()
}

let urlPost = async (req, res) => {
    const originalUrl = req.body.OriginalUrl

    if (!originalUrl) {
        return res.status(400).json({ error: 'OriginalUrl is required.' })
    }

    let redisClient = await connectRedis()

    const createShortUrl = async () => {
        if (range.curr < range.end - 1 && range.curr != 0) {
            range.curr++
        } else {
            await getTokenRange()
            range.curr++
        }

        ShortURL.create({
            Hash: hashGenerator(range.curr - 1),
            OriginalUrl: originalUrl,
            Visits: 0,
            CreatedAt: new Date(),
            ExpiresAt: getExpirationDate(req.body.ExpirationDays)
        }, (err, url) => {
            if (err) {
                console.log(err)
                return res.status(500).json({ error: 'Could not shorten URL.' })
            }
            res.json(url.Hash)
            redisClient.setex(originalUrl, CACHE_TTL_SECONDS, url.Hash)
        })
    }

    redisClient.get(originalUrl, async (err, response) => {
        if (err) {
            console.log(err)
        } else if (response) {
            const cachedUrl = await ShortURL.findOne({ Hash: response }).catch(err => {
                console.log(err)
                return null
            })

            if (cachedUrl && !isExpired(cachedUrl)) {
                return res.json(response)
            }
        }

        ShortURL.findOne({ OriginalUrl: originalUrl }, async (err, url) => {
            if (err) {
                console.log(err)
                return res.status(500).json({ error: 'Could not shorten URL.' })
            }

            if (url) {
                if (isExpired(url)) {
                    await ShortURL.findByIdAndDelete(url._id)
                } else {
                    redisClient.setex(url.OriginalUrl, CACHE_TTL_SECONDS, url.Hash)
                    return res.json(url.Hash)
                }
            }

            return createShortUrl()
        })
    })
}

let urlGet = async (req, res) => {
    ShortURL.findOne({ Hash: req.params.identifier }, async (err, url) => {
        if (err) {
            console.log(err)
            return res.status(500).send('Something went wrong')
        }
        if (url) {
            if (isExpired(url)) {
                await ShortURL.findByIdAndDelete(url._id)
                return res.status(410).send('URL has expired')
            }

            res.redirect(url.OriginalUrl)
            jobQueue.enqueue(url.Hash)
        } else {
            res.status(404).send('URL not found')
        }
    })
}

let tokenDelete = async (req, res) => {
    removeToken()
    res.send('Token deleted')
}

module.exports = { urlPost, urlGet, tokenDelete }
