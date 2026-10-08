import { randomBytes } from 'node:crypto'
import { SystemSecretStore } from '../apps/connector/src/secret-store.js'
import { sha256 } from '../apps/connector/src/config.js'
const ref = process.env.WM_CONNECTOR_NATIVE_REF!
const store = new SystemSecretStore()
if (process.argv[2] === 'put') {
  const token = 'wmi_' + randomBytes(32).toString('base64url')
  await store.put(ref, token)
  process.stdout.write(sha256(token))
} else if (process.argv[2] === 'check') {
  const token = await store.get(ref)
  if (!token || sha256(token) !== process.env.WM_CONNECTOR_NATIVE_DIGEST) process.exitCode = 1
} else if (process.argv[2] === 'delete') await store.delete(ref)
else process.exitCode = 1
