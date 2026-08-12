const mongoose = require('mongoose')

const URL = mongoose.Schema({
    Hash: {
        type: String,
        required: true,
        unique: true
    },
    OriginalUrl: {
        type: String,
        required: true
    },
    Visits: {
        type: Number,
        default: 0
    },
    CreatedAt: Date,
    ExpiresAt: {
        type: Date,
        expires: 0
    }
})

module.exports = mongoose.model('URL', URL)
