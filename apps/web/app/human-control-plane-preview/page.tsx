import { notFound } from 'next/navigation'
import { HumanControlPlaneFixture } from './fixture'

export default function HumanControlPlanePreviewPage() {
  if (process.env.WORKMESH_HCP_PREVIEW !== '1') notFound()
  return <HumanControlPlaneFixture />
}
