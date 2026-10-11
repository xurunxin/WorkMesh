import {createRequire} from 'node:module'
import {resolve} from 'node:path'
const require=createRequire(resolve('packages/artifact-storage/package.json'))
const {S3Client,HeadBucketCommand,CreateBucketCommand}=require('@aws-sdk/client-s3')
const client=new S3Client({endpoint:process.env.S3_ENDPOINT,region:process.env.S3_REGION,forcePathStyle:true,credentials:{accessKeyId:process.env.S3_ACCESS_KEY_ID,secretAccessKey:process.env.S3_SECRET_ACCESS_KEY}})
try {
  let created=false
  try{await client.send(new HeadBucketCommand({Bucket:process.env.S3_BUCKET}))}
  catch(error){if(error.$metadata?.httpStatusCode!==404)throw error;await client.send(new CreateBucketCommand({Bucket:process.env.S3_BUCKET}));created=true}
  console.log(JSON.stringify({bucket:process.env.S3_BUCKET,created,ownedEndpointOnly:true}))
} finally {client.destroy()}
