import { createServer } from 'node:http'
import { once } from 'node:events'
import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { artifactChecksum, readArtifactBytes, sendArtifactBytes } from './delivery-transfer.js'

describe('M3 受控证据传输',()=>{
  it('真实HTTP准确headers/字节，无Bearer，拒重定向及模型URL并校验下载完整性',async()=>{
    const bytes=Buffer.from('完整审查证据\n'),requests:Array<{url:string;authorization:unknown;checksum:unknown;body:Buffer}>=[]
    const server=createServer(async(req,res)=>{
      const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk))
      requests.push({url:req.url!,authorization:req.headers.authorization,checksum:req.headers['x-amz-checksum-sha256'],body:Buffer.concat(chunks)})
      if(req.url==='/redirect'){res.writeHead(302,{location:'/secret'});res.end();return}
      res.end(req.method==='PUT'?'':bytes)
    })
    server.listen(0,'127.0.0.1');await once(server,'listening')
    const origin=`http://127.0.0.1:${(server.address() as {port:number}).port}`
    const checksum=artifactChecksum(bytes),id=randomUUID()
    const upload={id,uploadUrl:origin+'/object',requiredChecksum:checksum,expiresAt:new Date(Date.now()+60000).toISOString(),requiredHeaders:{'x-amz-checksum-sha256':'exact-required-value','content-type':'text/plain','content-length':String(bytes.length)}}
    try {
      expect(await sendArtifactBytes(upload,bytes.toString('base64'),[origin])).toEqual({id,expiresAt:upload.expiresAt,checksum,transfer:'bytes_sent'})
      expect(requests[0]).toEqual({url:'/object',authorization:undefined,checksum:'exact-required-value',body:bytes})
      const status={id,status:'verified',sizeBytes:bytes.length,actualChecksum:checksum,mimeType:'text/plain'}
      expect(await readArtifactBytes({downloadUrl:origin+'/object'},status,[origin])).toMatchObject({artifactUploadId:id,contentBase64:bytes.toString('base64'),checksum})
      await expect(sendArtifactBytes({...upload,uploadUrl:origin+'/redirect'},bytes.toString('base64'),[origin])).rejects.toThrow('ARTIFACT_TRANSFER_FAILED')
      expect(requests.some(r=>r.url==='/secret')).toBe(false)
      const count=requests.length
      await expect(sendArtifactBytes(upload,bytes.toString('base64'),['https://different.invalid'])).rejects.toThrow('ARTIFACT_STORE_ORIGIN_DENIED')
      await expect(sendArtifactBytes({...upload,requiredHeaders:{authorization:'Bearer hidden'}},bytes.toString('base64'),[origin])).rejects.toThrow('ARTIFACT_TRANSFER_HEADERS_DENIED')
      expect(requests).toHaveLength(count)
      await expect(sendArtifactBytes({...upload,requiredHeaders:{'content-length':'0'}},bytes.toString('base64'),[origin])).rejects.toThrow('ARTIFACT_TRANSFER_HEADERS_DENIED')
      const aborted=new AbortController();aborted.abort()
      await expect(sendArtifactBytes(upload,bytes.toString('base64'),[origin],aborted.signal)).rejects.toThrow('ARTIFACT_TRANSFER_FAILED')
      expect(requests).toHaveLength(count)
      await expect(readArtifactBytes({downloadUrl:origin+'/object'},{...status,actualChecksum:`sha256:${'0'.repeat(64)}`},[origin])).rejects.toThrow('ARTIFACT_CHECKSUM_MISMATCH')
    } finally {server.closeAllConnections();await new Promise<void>((done,reject)=>server.close(error=>error?reject(error):done()))}
  })
})
