const ShortURL = require('../models/url')
const { connectRedis, recordVisit } = require('../helpers/redis')
const { validateOriginalUrl } = require('../helpers/validateUrl')
const { hashGenerator, allocateTokenId } = require('../helpers/zookeeper')

const DEFAULT_EXPIRATION_DAYS = Number(process.env.URL_EXPIRATION_DAYS) || 365
const MAX_EXPIRATION_DAYS = Number(process.env.URL_MAX_EXPIRATION_DAYS) || 365
const CACHE_TTL_SECONDS = 600
const REDIRECT_CACHE_PREFIX = 'redirect:'

const getRedirectCacheKey = (hash) => `${REDIRECT_CACHE_PREFIX}${hash}`

const getCacheTtlSeconds = (expiresAt) => {
    if (!expiresAt) {
        return CACHE_TTL_SECONDS
    }

    const secondsUntilExpiry = Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)
    if (secondsUntilExpiry <= 0) {
        return 0
    }

    return Math.min(CACHE_TTL_SECONDS, secondsUntilExpiry)
}

const cacheRedirect = (redisClient, hash, originalUrl, expiresAt) => {
    const ttl = getCacheTtlSeconds(expiresAt)
    if (ttl <= 0) {
        return
    }

    redisClient.setex(getRedirectCacheKey(hash), ttl, originalUrl)
}

const invalidateRedirectCache = (redisClient, hash) => {
    redisClient.del(getRedirectCacheKey(hash))
}

const getExpirationDate = (expirationDays) => {
    const parsedDays = Number(expirationDays)
    const requestedDays = parsedDays > 0 ? parsedDays : DEFAULT_EXPIRATION_DAYS
    const days = Math.min(requestedDays, MAX_EXPIRATION_DAYS)

    return new Date(Date.now() + (days * 24 * 60 * 60 * 1000))
}

const isExpired = (url) => {
    return url.ExpiresAt && url.ExpiresAt.getTime() <= Date.now()
}

const returnExistingHash = (res, redisClient, url) => {
    redisClient.setex(url.OriginalUrl, CACHE_TTL_SECONDS, url.Hash)
    cacheRedirect(redisClient, url.Hash, url.OriginalUrl, url.ExpiresAt)
    return res.json(url.Hash)
}

let urlPost = async (req, res) => {
    const validation = validateOriginalUrl(req.body.OriginalUrl)

    if (!validation.valid) {
        return res.status(400).json({ error: validation.error })
    }

    const originalUrl = validation.normalizedUrl

    let redisClient = await connectRedis()

    const createShortUrl = async () => {
        try {
            const tokenId = await allocateTokenId()
            const url = await ShortURL.create({
                Hash: hashGenerator(tokenId),
                OriginalUrl: originalUrl,
                Visits: 0,
                CreatedAt: new Date(),
                ExpiresAt: getExpirationDate(req.body.ExpirationDays)
            })

            res.json(url.Hash)
            redisClient.setex(originalUrl, CACHE_TTL_SECONDS, url.Hash)
            cacheRedirect(redisClient, url.Hash, url.OriginalUrl, url.ExpiresAt)
        } catch (err) {
            if (err.code === 11000) {
                const existing = await ShortURL.findOne({ OriginalUrl: originalUrl }).catch(() => null)

                if (!existing || isExpired(existing)) {
                    console.log(err)
                    return res.status(500).json({ error: 'Could not shorten URL.' })
                }

                return returnExistingHash(res, redisClient, existing)
            }

            console.log(err)
            return res.status(500).json({ error: 'Could not shorten URL.' })
        }
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
                cacheRedirect(redisClient, response, cachedUrl.OriginalUrl, cachedUrl.ExpiresAt)
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
                    return returnExistingHash(res, redisClient, url)
                }
            }

            return createShortUrl()
        })
    })
}

let urlGet = async (req, res) => {
    const hash = req.params.identifier
    const redisClient = await connectRedis()

    const serveRedirect = (originalUrl) => {
        res.redirect(originalUrl)
        recordVisit(hash)
    }

    const serveExpired = async (urlId) => {
        invalidateRedirectCache(redisClient, hash)
        if (urlId) {
            await ShortURL.findByIdAndDelete(urlId).catch(err => console.log(err))
        } else {
            await ShortURL.findOneAndDelete({ Hash: hash }).catch(err => console.log(err))
        }
        return res.status(410).send('URL has expired')
    }

    redisClient.get(getRedirectCacheKey(hash), async (err, cachedOriginalUrl) => {
        if (err) {
            console.log(err)
        } else if (cachedOriginalUrl) {
            return serveRedirect(cachedOriginalUrl)
        }

        ShortURL.findOne({ Hash: hash }, async (findErr, url) => {
            if (findErr) {
                console.log(findErr)
                return res.status(500).send('Something went wrong')
            }

            if (!url) {
                return res.status(404).send('URL not found')
            }

            if (isExpired(url)) {
                return serveExpired(url._id)
            }

            cacheRedirect(redisClient, hash, url.OriginalUrl, url.ExpiresAt)
            return serveRedirect(url.OriginalUrl)
        })
    })
}

module.exports = { urlPost, urlGet }
