const http = require('http')

const BASE = 'http://localhost:4000'

const request = (method, path, body) => {
    return new Promise((resolve, reject) => {
        const url = new URL(path, BASE)
        const payload = body ? JSON.stringify(body) : null

        const req = http.request({
            hostname: url.hostname,
            port: url.port,
            path: url.pathname + url.search,
            method,
            headers: body ? {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            } : {}
        }, (res) => {
            let data = ''
            res.on('data', (chunk) => { data += chunk })
            res.on('end', () => {
                resolve({ status: res.statusCode, headers: res.headers, body: data })
            })
        })

        req.on('error', reject)
        if (payload) req.write(payload)
        req.end()
    })
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const run = async () => {
    let passed = 0
    let failed = 0
    const check = (name, condition, detail = '') => {
        console.log(`${condition ? 'PASS' : 'FAIL'}: ${name}${detail ? ` — ${detail}` : ''}`)
        condition ? passed++ : failed++
    }

    console.log('=== ShortURL Integration Tests ===\n')

    const health = await request('GET', '/health')
    check('GET /health', health.status === 200 && health.body.includes('ok'))

    const ready = await request('GET', '/ready')
    check('GET /ready (all deps up)', ready.status === 200, ready.body)

    const del = await request('GET', '/del')
    check('GET /del removed (no Token deleted)', !del.body.includes('Token deleted'), del.body.slice(0, 60))

    check('POST /url rejects localhost', (await request('POST', '/url', { OriginalUrl: 'http://127.0.0.1/admin' })).status === 400)
    check('POST /url rejects ftp', (await request('POST', '/url', { OriginalUrl: 'ftp://example.com' })).status === 400)

    const url = `https://example.com/run-${Date.now()}`
    const create1 = await request('POST', '/url', { OriginalUrl: url })
    const hash = create1.body.replace(/"/g, '')
    check('POST /url creates hash', create1.status === 200 && hash.length > 0, hash)

    const create2 = await request('POST', '/url', { OriginalUrl: url })
    check('POST /url deduplicates', create2.body.replace(/"/g, '') === hash)

    const redirect = await request('GET', `/url/${hash}`)
    check('GET /url/:hash redirects', redirect.status === 302, `location=${redirect.headers.location}`)

    await request('GET', `/url/${hash}`)
    await request('GET', `/url/${hash}`)
    check('Repeat redirects succeed', (await request('GET', `/url/${hash}`)).status === 302)

    check('GET unknown hash -> 404', (await request('GET', '/url/notfound999')).status === 404)

    let rateLimited = false
    for (let i = 0; i < 22; i++) {
        const res = await request('POST', '/url', { OriginalUrl: `https://example.com/ratelimit-${Date.now()}-${i}` })
        if (res.status === 429) {
            rateLimited = true
            break
        }
    }
    check('Rate limiting returns 429', rateLimited)

    console.log('\nWaiting 35s for Redis visit flush to MongoDB...')
    await sleep(35000)

    check('Redirect still works after flush wait', (await request('GET', `/url/${hash}`)).status === 302)

    console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`)
    process.exit(failed ? 1 : 0)
}

run().catch((err) => {
    console.error(err)
    process.exit(1)
})
