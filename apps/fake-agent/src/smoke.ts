import { createHmac } from 'node:crypto'
import { FakeAgent } from './index.js'

const agent = new FakeAgent({ apiUrl: 'http://127.0.0.1:3001', installationToken: 'installation-token', webhookSecrets: ['smoke-secret'], stale: true })
const body = Buffer.from(JSON.stringify({ events: [] })), timestamp = Math.floor(Date.now() / 1000)
const signature = createHmac('sha256', 'smoke-secret').update(`${timestamp}.${body.toString('utf8')}`).digest('hex')
if (!agent.accept(body, { 'workmesh-delivery-id': 'smoke-delivery', 'workmesh-timestamp': String(timestamp), 'workmesh-signature': `v1=${signature}` })) throw new Error('Expected first delivery to be accepted')
if (agent.accept(body, { 'workmesh-delivery-id': 'smoke-delivery', 'workmesh-timestamp': String(timestamp), 'workmesh-signature': `v1=${signature}` })) throw new Error('Expected duplicate delivery to be ignored')
process.stdout.write('Fake Agent smoke: signed delivery and deduplication passed\n')
