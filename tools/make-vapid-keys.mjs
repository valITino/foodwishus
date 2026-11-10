// Makes a fresh VAPID key pair for push notifications and prints it. Nothing is written
// to disk: the private key belongs in the Supabase function's secrets and nowhere else.
// Run with: node tools/make-vapid-keys.mjs      (steps: supabase/functions/push/README.md)

const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
const publicKey = Buffer.from(await crypto.subtle.exportKey('raw', keys.publicKey)).toString('base64url')
const privateKey = (await crypto.subtle.exportKey('jwk', keys.privateKey)).d
const pushSecret = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url')

console.log(`VAPID_PUBLIC_KEY=${publicKey}`)
console.log(`VAPID_PRIVATE_KEY=${privateKey}`)
console.log(`PUSH_SECRET=${pushSecret}`)
console.log('')
console.log('The public key also goes into .env.production as VITE_VAPID_PUBLIC_KEY.')
console.log('The private key and the push secret are secrets: never commit them.')
