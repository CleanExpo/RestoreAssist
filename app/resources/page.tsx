// Server component — loads all resources from content/resources/*.json
import { getAllResources } from '@/lib/resources'
import ResourcesClientPage from './ResourcesClientPage'

export default async function ResourcesPage() {
  const resources = await getAllResources()
  const videoGuides = resources.map((r) => ({
    slug: r.slug,
    title: r.title,
    description: r.description,
    thumbnailUrl: r.thumbnailUrl[2], // 16:9 thumbnail
    uploadDate: r.uploadDate,
  }))
  return <ResourcesClientPage videoGuides={videoGuides} />
}
