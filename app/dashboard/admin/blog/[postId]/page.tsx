'use client'

import { useParams } from 'next/navigation'
import { PostEditor } from '@/components/admin/blog/PostEditor'
import type { PostId } from '@/lib/blog/api'

export default function BlogPostEditorPage() {
  const params = useParams<{ postId: string }>()
  const postId = params?.postId
  if (!postId) return null
  // Keyed by id so moving between posts starts a fresh editor
  return <PostEditor key={postId} postId={postId as PostId} />
}
