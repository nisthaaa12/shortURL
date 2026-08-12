import axios from 'axios'

let api = axios.create({
    baseURL: 'http://localhost:4000'
})

export const postURL = (input, expirationDays) => api.post('/url', {
    OriginalUrl: input,
    ExpirationDays: expirationDays
})

let apis = { postURL }

export default apis
