require('dotenv').config()
const zookeeper = require('node-zookeeper-client')

const TOKEN_PATH = '/token'
const RANGE_SIZE = 1000000

const zkClient = zookeeper.createClient(process.env.ZOOKEEPER_HOST || 'zookeeper-server')

let range = {
    start: 0,
    end: 0,
    curr: 0
}

let rangeReady = false
let connectPromise = null

const hashGenerator = (n) => {
    const charset = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
    let hashStr = ''
    let value = n

    while (value > 0) {
        hashStr += charset[value % 62]
        value = Math.floor(value / 62)
    }

    return hashStr
}

const zkGetData = (path) => {
    return new Promise((resolve, reject) => {
        zkClient.getData(path, (error, data, stat) => {
            if (error) {
                return reject(error)
            }

            resolve({ value: parseInt(data.toString(), 10) || 0, stat })
        })
    })
}

const zkSetData = (path, value, version) => {
    return new Promise((resolve, reject) => {
        const buffer = Buffer.from(String(value), 'utf8')
        zkClient.setData(path, buffer, version, (error, stat) => {
            if (error) {
                return reject(error)
            }

            resolve(stat)
        })
    })
}

const zkExists = (path) => {
    return new Promise((resolve, reject) => {
        zkClient.exists(path, (error, stat) => {
            if (error) {
                return reject(error)
            }

            resolve(stat)
        })
    })
}

const zkCreate = (path, value) => {
    return new Promise((resolve, reject) => {
        const buffer = Buffer.from(String(value), 'utf8')
        zkClient.create(path, buffer, zookeeper.CreateMode.PERSISTENT, (error, createdPath) => {
            if (error) {
                return reject(error)
            }

            resolve(createdPath)
        })
    })
}

const ensureTokenNode = async () => {
    const stat = await zkExists(TOKEN_PATH)

    if (stat) {
        return
    }

    try {
        await zkCreate(TOKEN_PATH, '0')
    } catch (error) {
        if (error.getCode && error.getCode() !== zookeeper.Exception.NODEEXISTS) {
            throw error
        }
    }
}

const claimTokenRange = async (maxRetries = 5) => {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        const { value, stat } = await zkGetData(TOKEN_PATH)
        const nextBase = value + RANGE_SIZE

        range.start = value + RANGE_SIZE
        range.curr = range.start
        range.end = value + (2 * RANGE_SIZE)

        try {
            await zkSetData(TOKEN_PATH, nextBase, stat.version)
            rangeReady = true
            return
        } catch (error) {
            if (error.getCode && error.getCode() === zookeeper.Exception.BADVERSION) {
                continue
            }

            throw error
        }
    }

    throw new Error('Failed to claim ZooKeeper token range after retries.')
}

const getTokenRange = async () => {
    await claimTokenRange()
}

const allocateTokenId = async () => {
    if (!rangeReady || range.curr === 0 || range.curr >= range.end - 1) {
        await claimTokenRange()
    }

    range.curr++
    return range.curr - 1
}

const isRangeReady = () => rangeReady

const isZkConnected = () => zkClient.getState().name === 'SYNC_CONNECTED'

const connectZK = async () => {
    if (connectPromise) {
        return connectPromise
    }

    connectPromise = new Promise((resolve, reject) => {
        zkClient.once('connected', async () => {
            try {
                await ensureTokenNode()
                await claimTokenRange()
                console.log(`Connected to ZK server. Token range ${range.start}-${range.end}.`)
                resolve()
            } catch (error) {
                console.log(error)
                reject(error)
            }
        })

        zkClient.connect()
    })

    return connectPromise
}

module.exports = {
    range,
    hashGenerator,
    getTokenRange,
    allocateTokenId,
    isRangeReady,
    isZkConnected,
    connectZK
}
