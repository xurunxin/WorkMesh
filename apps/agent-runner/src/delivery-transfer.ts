import { createHash } from 'node:crypto'
import { z } from 'zod'

export const artifactUploadTransferSchema=z.object({id:z.string().uuid(),uploadUrl:z.string().url(),
  requiredHeaders:z.record(z.string()),requiredChecksum:z.string().regex(/^sha256:[a-f0-9]{64}$/),expiresAt:z.string().datetime({offset:true})})
const transferLimit=1_500_000

function storeUrl(raw:string,origins:readonly string[]):URL {
  const url=new URL(raw)
  if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.hash||!origins.includes(url.origin))
    throw new Error('ARTIFACT_STORE_ORIGIN_DENIED')
  return url
}
export function decodeUploadBytes(base64:string):Buffer {
  if(!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64)) throw new Error('ARTIFACT_CONTENT_INVALID')
  const bytes=Buffer.from(base64,'base64')
  if(bytes.length===0||bytes.length>transferLimit||bytes.toString('base64')!==base64) throw new Error('ARTIFACT_TRANSFER_TOO_LARGE')
  return bytes
}
export const artifactChecksum=(bytes:Uint8Array)=>`sha256:${createHash('sha256').update(bytes).digest('hex')}`

export async function sendArtifactBytes(value:unknown,base64:string,origins:readonly string[],signal?:AbortSignal,fetcher=globalThis.fetch) {
  const upload=artifactUploadTransferSchema.parse(value)
  const url=storeUrl(upload.uploadUrl,origins)
  const bytes=decodeUploadBytes(base64)
  if(upload.requiredChecksum!==artifactChecksum(bytes)||Date.parse(upload.expiresAt)<=Date.now()) throw new Error('ARTIFACT_TRANSFER_EXPIRED_OR_MISMATCH')
  const headers=upload.requiredHeaders
  for(const [name,value] of Object.entries(headers)) {
    if(['cookie','proxy-authorization'].includes(name.toLowerCase())||/^Bearer\s/i.test(value)) throw new Error('ARTIFACT_TRANSFER_HEADERS_DENIED')
  }
  let response:Response
  try { response=await fetcher(url,{method:'PUT',headers,body:new Uint8Array(bytes),redirect:'manual',signal}) }
  catch { throw new Error('ARTIFACT_TRANSFER_FAILED') }
  if(!response.ok) throw new Error('ARTIFACT_TRANSFER_FAILED')
  return {id:upload.id,expiresAt:upload.expiresAt,checksum:upload.requiredChecksum,transfer:'bytes_sent'}
}

export async function readArtifactBytes(value:unknown,status:unknown,origins:readonly string[],signal?:AbortSignal,fetcher=globalThis.fetch) {
  const download=z.object({downloadUrl:z.string().url()}).parse(value)
  const verified=z.object({id:z.string().uuid(),status:z.literal('verified'),sizeBytes:z.number().int().positive().max(transferLimit),
    actualChecksum:z.string().regex(/^sha256:[a-f0-9]{64}$/),mimeType:z.string()}).parse(status)
  const url=storeUrl(download.downloadUrl,origins)
  let response:Response
  try { response=await fetcher(url,{redirect:'manual',signal}) } catch {throw new Error('ARTIFACT_TRANSFER_FAILED')}
  if(!response.ok||!response.body) throw new Error('ARTIFACT_TRANSFER_FAILED')
  const reader=response.body.getReader();const chunks:Uint8Array[]=[];let total=0
  try {
    while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength
      if(total>verified.sizeBytes||total>transferLimit) throw new Error('ARTIFACT_TRANSFER_TOO_LARGE')
      chunks.push(value)}
  } catch(error) {
    if(error instanceof Error && error.message==='ARTIFACT_TRANSFER_TOO_LARGE') throw error
    throw new Error('ARTIFACT_TRANSFER_FAILED')
  } finally {await reader.cancel().catch(()=>undefined)}
  const bytes=Buffer.concat(chunks)
  if(bytes.length!==verified.sizeBytes||artifactChecksum(bytes)!==verified.actualChecksum) throw new Error('ARTIFACT_CHECKSUM_MISMATCH')
  return {artifactUploadId:verified.id,mimeType:verified.mimeType,sizeBytes:bytes.length,checksum:verified.actualChecksum,contentBase64:bytes.toString('base64')}
}
