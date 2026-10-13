import { getAsset } from 'node:sea'

export async function readTrustedKey(): Promise<Buffer> {
  return Buffer.from(getAsset('workmesh-public-key.pem'))
}
