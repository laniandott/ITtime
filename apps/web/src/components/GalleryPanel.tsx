import { useEffect, useMemo, useState } from 'react'
import { api, resolveUploadUrl } from '../api'
import type { Memo } from '../types'

type GalleryItem = {
  id: string
  memoId: string
  path: string
  filename: string
  mimeType: string
  createdAt: string
  content: string
}

export default function GalleryPanel() {
  const [memos, setMemos] = useState<Memo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState<GalleryItem | null>(null)

  useEffect(() => {
    let active = true
    const load = async () => {
      setLoading(true)
      try {
        const data = await api.memos.list()
        if (active) { setMemos(data); setError('') }
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : '加载图库失败')
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => { active = false }
  }, [])

  const items = useMemo(() => memos
    .filter((memo) => memo.type !== 'point')
    .flatMap((memo) => (memo.attachments ?? [])
      .filter((attachment) => attachment.mimeType.startsWith('image/') || attachment.mimeType.startsWith('video/'))
      .map((attachment) => ({
        id: attachment.id,
        memoId: memo.id,
        path: attachment.path,
        filename: attachment.filename,
        mimeType: attachment.mimeType,
        createdAt: memo.createdAt,
        content: memo.content,
      })))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()), [memos])

  if (loading) return <div className="py-10 text-center text-sm text-gray-400">加载图库...</div>
  if (error) return <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>

  return (
    <section className="space-y-4" aria-label="图库">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">图库</h2>
          <p className="mt-1 text-xs text-gray-500">按日记时间倒序排列，最近添加的媒体在上方。</p>
        </div>
        <span className="text-xs text-gray-400">{items.length} 个文件</span>
      </div>
      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 py-12 text-center text-sm text-gray-400 dark:border-gray-700">还没有图片或视频</div>
      ) : (
        <div className="columns-2 gap-3 sm:columns-3 lg:columns-4">
          {items.map((item) => (
            <article key={item.id} className="mb-3 break-inside-avoid overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
              <button type="button" onClick={() => setPreview(item)} className="block w-full text-left" title="查看媒体">
                {item.mimeType.startsWith('image/') ? (
                  <img src={resolveUploadUrl(item.path)} alt={item.filename} loading="lazy" className="block h-auto w-full object-cover" />
                ) : (
                  <video src={resolveUploadUrl(item.path)} muted preload="metadata" className="block h-auto max-h-72 w-full object-cover" />
                )}
              </button>
              <div className="px-2.5 py-2">
                <div className="truncate text-xs font-medium text-gray-700 dark:text-gray-200">{item.filename}</div>
                <time className="mt-1 block text-[10px] text-gray-400">{new Date(item.createdAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</time>
              </div>
            </article>
          ))}
        </div>
      )}
      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setPreview(null)}>
          {preview.mimeType.startsWith('image/') ? (
            <img src={resolveUploadUrl(preview.path)} alt={preview.filename} className="max-h-full max-w-full rounded-lg object-contain" />
          ) : (
            <video src={resolveUploadUrl(preview.path)} controls autoPlay playsInline className="max-h-full max-w-full rounded-lg" onClick={(event) => event.stopPropagation()} />
          )}
        </div>
      )}
    </section>
  )
}
