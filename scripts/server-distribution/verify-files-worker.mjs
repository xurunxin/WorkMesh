import { parentPort, workerData } from 'node:worker_threads'
import { verifyFileEntry } from './manifest.mjs'

for (const entry of workerData.entries) await verifyFileEntry(workerData.root, entry)
parentPort.postMessage({ verified: workerData.entries.length })
