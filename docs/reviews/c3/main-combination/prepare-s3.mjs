// 只为登记的本轮 RustFS 创建测试 bucket；凭据仅从该容器读入内存。
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const directory = new URL('./', import.meta.url)
const resourceFile = process.env.C3_RESOURCE_FILE ?? fileURLToPath(new URL('resources.json', directory))
const resources = JSON.parse(readFileSync(resourceFile, 'utf8'))
const container = resources.containers.find(row => row.name === resources.owner + '-s3')
if (!container) throw new Error('本轮 S3 容器未登记')
const inspected = JSON.parse(execFileSync('docker', ['inspect', container.id]))[0]
if (inspected.Config.Labels['workmesh.test-owner'] !== resources.owner) throw new Error('容器归属不匹配')
const environment = Object.fromEntries(inspected.Config.Env.map(row => {
  const split = row.indexOf('='); return [row.slice(0, split), row.slice(split + 1)]
}))
const require = createRequire(new URL('../../../../packages/artifact-storage/package.json', import.meta.url))
const { S3Client, CreateBucketCommand, HeadBucketCommand } = require('@aws-sdk/client-s3')
const client = new S3Client({ endpoint: 'http://127.0.0.1:27489', region: 'us-east-1', forcePathStyle: true,
  credentials: { accessKeyId: environment.RUSTFS_ACCESS_KEY, secretAccessKey: environment.RUSTFS_SECRET_KEY } })
const startedAt = new Date().toISOString()
try {
  for (let attempt = 0; ; attempt++) {
    try {
      await client.send(new CreateBucketCommand({ Bucket: 'workmesh-artifacts' }))
      break
    } catch (error) {
      if (attempt >= 29) throw error
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  }
  await client.send(new HeadBucketCommand({ Bucket: 'workmesh-artifacts' }))
  writeFileSync(path.join(path.dirname(resourceFile), 's3-preparation.json'), JSON.stringify({
    command: `node ${fileURLToPath(import.meta.url)}`, containerId: container.id,
    bucket: 'workmesh-artifacts', startedAt, finishedAt: new Date().toISOString(),
    exitCode: 0, credentialsPersisted: false, cleanup: '随登记的临时容器及 tmpfs 删除',
  }, null, 2) + '\n')
  console.log('本轮专用 S3 bucket 创建及读取成功')
} finally { client.destroy() }
