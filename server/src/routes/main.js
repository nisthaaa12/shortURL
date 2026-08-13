require('dotenv').config()
const express = require('express')
const { urlPost, urlGet } = require('../controllers/zkController')
const { getHealth, getReadiness } = require('../controllers/healthController')
const rateLimiter = require('../middleware/rateLimiter')

const router = express.Router()

const createUrlLimiter = rateLimiter({
    keyPrefix: 'create_url',
    maxRequests: Number(process.env.URL_CREATE_RATE_LIMIT_MAX) || 20,
    windowSeconds: Number(process.env.URL_CREATE_RATE_LIMIT_WINDOW_SECONDS) || 60
})

const redirectLimiter = rateLimiter({
    keyPrefix: 'redirect_url',
    maxRequests: Number(process.env.URL_REDIRECT_RATE_LIMIT_MAX) || 120,
    windowSeconds: Number(process.env.URL_REDIRECT_RATE_LIMIT_WINDOW_SECONDS) || 60
})

router.get('/health', getHealth)
router.get('/ready', getReadiness)
router.post('/url', createUrlLimiter, urlPost)
router.get('/url/:identifier', redirectLimiter, urlGet)

module.exports = router
