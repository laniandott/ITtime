import DiaryPanel from '../components/DiaryPanel'
import { PageHeader } from '../components/PageHeader'

export default function DiaryPage({ embedded = false }: { embedded?: boolean } = {}) {
  return (
    <div className="workspace-page diary-page space-y-4">
      {!embedded && <PageHeader title="日记" description="记录当天的想法、经过与资料" />}
      <DiaryPanel />
    </div>
  )
}
