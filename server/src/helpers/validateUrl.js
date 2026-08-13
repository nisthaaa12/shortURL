const PRIVATE_HOST_PATTERNS = [
    /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
    /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
    /^192\.168\.\d{1,3}\.\d{1,3}$/,
    /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/,
    /^localhost$/i,
    /^\[::1\]$/,
]

const isPrivateHost = (hostname) => {
    return PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(hostname))
}

const validateOriginalUrl = (value) => {
    if (typeof value !== 'string' || !value.trim()) {
        return { valid: false, error: 'OriginalUrl is required.' }
    }

    let parsed
    try {
        parsed = new URL(value.trim())
    } catch {
        return { valid: false, error: 'OriginalUrl must be a valid URL.' }
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) {
        return { valid: false, error: 'Only http and https URLs are allowed.' }
    }

    if (isPrivateHost(parsed.hostname)) {
        return { valid: false, error: 'Private and local URLs are not allowed.' }
    }

    return { valid: true, normalizedUrl: parsed.href }
}

module.exports = { validateOriginalUrl }
