import { readFile } from 'node:fs/promises'

export async function readTrustedKey(): Promise<Buffer> {
  return readFile(new URL('../assets/workmesh-public-key.pem', import.meta.url))
}
