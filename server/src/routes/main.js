require('dotenv').config()
const express = require('express')
const { urlPost, urlGet, tokenDelete } = require('../controllers/zkController')
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

router.post('/url', createUrlLimiter, urlPost)
router.get('/url/:identifier', redirectLimiter, urlGet)
router.get('/del', tokenDelete)

module.exports = router
