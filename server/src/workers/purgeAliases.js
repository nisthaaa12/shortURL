const cron = require('cron')
const URL = require('../models/url')

module.exports = () => {
    let job = new cron.CronJob('0 0 * * *', () => {
        URL.deleteMany({ ExpiresAt: { $lte: new Date() } }, (err, result) => {
            if (err) {
                console.log(err)
            } else {
                console.log('Deleted expired URLs: ' + result.deletedCount)
            }
        })
    }, null, true)
}
