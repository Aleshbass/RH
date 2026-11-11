/**
 * Typed references to convex/blog.ts, and the shapes it returns. Plain references are used
 * because the generated `api` type sits at TypeScript's depth limit (TS2589).
 */
import { makeFunctionReference } from 'convex/server'
import type { Id } from '@/convex/_generated/dataModel'

export type PostId = Id<'blogPosts'>
export type AuthorId = Id<'blogAuthors'>
export type CategoryId = Id<'blogCategories'>
export type MediaId = Id<'blogMedia'>
export type RevisionId = Id<'blogRevisions'>

export type BlogImage = { url: string; fileId?: string; alt: string; width?: number; height?: number }
export type BlogSeo = { metaTitle?: string; metaDescription?: string; focusKeyword?: string; noindex?: boolean }
export type BlogStatus = 'draft' | 'in_review' | 'changes_requested' | 'scheduled' | 'published' | 'archived'

// ── Public ───────────────────────────────────────────────────────────────────

export type PublicAuthor = {
  slug: string
  name: string
  credentials?: string
  bio?: string
  photo?: BlogImage | null
  sameAs: string[]
}

export type PostCard = {
  slug: string
  title: string
  excerpt: string
  cover: BlogImage | null
  tags: string[]
  readingMinutes: number
  publishedAt: number
  updatedAt: number
  author: { slug: string; name: string; credentials?: string; photo?: BlogImage } | null
  category: { slug: string; name: string } | null
}

export type PostList = {
  posts: PostCard[]
  total: number
  page: number
  pageCount: number
  category: { slug: string; name: string; description?: string } | null
  author: PublicAuthor | null
  /** False when the category or author asked for doesn't exist */
  found: boolean
}

export type PublicPost = PostCard & {
  seo: BlogSeo
  wordCount: number
  body: string
  authorFull: PublicAuthor | null
  reviewer: PublicAuthor | null
}

export type PostResult = { kind: 'post'; post: PublicPost; related: PostCard[] } | { kind: 'redirect'; slug: string } | null

export type PublicCategory = { slug: string; name: string; description?: string; count: number }

export type BlogSitemap = {
  posts: { slug: string; updatedAt: number; image?: string }[]
  categories: { slug: string; updatedAt: number }[]
  authors: { slug: string; updatedAt: number }[]
  total: number
}

// ── Console ──────────────────────────────────────────────────────────────────

export type BlogViewer = {
  userId: Id<'users'>
  role: 'admin' | 'writer'
  name: string
  authorId: AuthorId | null
  ai: { enabled: boolean; limit: number; remaining: number }
}

export type PostRow = {
  _id: PostId
  title: string
  slug: string
  status: BlogStatus
  isLive: boolean
  liveSlug: string | null
  coverUrl: string | null
  wordCount: number
  ownerName: string
  mine: boolean
  authorName: string | null
  categoryName: string | null
  updatedAt: number
  publishedAt: number | null
  submittedAt: number | null
  scheduledFor: number | null
  reviewNote: string | null
}

export type EditorPost = {
  _id: PostId
  title: string
  slug: string
  excerpt: string
  cover: BlogImage | null
  seo: BlogSeo
  authorId: AuthorId | null
  reviewerId: AuthorId | null
  categoryId: CategoryId | null
  tags: string[]
  status: BlogStatus
  isLive: boolean
  liveSlug: string | null
  publishedAt: number | null
  liveUpdatedAt: number | null
  scheduledFor: number | null
  submittedAt: number | null
  reviewNote: string | null
  updatedAt: number
  ownerName: string
  body: string
  duplicateTitle: boolean
  can: { edit: boolean; submit: boolean; withdraw: boolean; publish: boolean; remove: boolean }
}

export type EditorOptions = {
  authors: { _id: AuthorId; name: string; credentials: string | null; mine: boolean }[]
  categories: { _id: CategoryId; name: string }[]
  posts: { title: string; slug: string }[]
}

export type SavePostArgs = {
  postId: PostId
  title: string
  slug: string
  excerpt: string
  cover?: BlogImage
  seo: BlogSeo
  authorId?: AuthorId
  reviewerId?: AuthorId
  categoryId?: CategoryId
  tags: string[]
  body: string
}

export type RevisionRow = {
  _id: RevisionId
  title: string
  reason: 'autosave' | 'submitted' | 'published' | 'restored'
  savedAt: number
  savedBy: string
  words: number
}

export type CategoryRow = { _id: CategoryId; slug: string; name: string; description: string; order: number; postCount: number }

export type AuthorRow = {
  _id: AuthorId
  slug: string
  name: string
  credentials: string
  bio: string
  photo: BlogImage | null
  sameAs: string[]
  accountName: string | null
  mine: boolean
  canEdit: boolean
  postCount: number
  reviewCount: number
}

export type MediaRow = {
  _id: MediaId
  url: string
  alt: string
  width: number | null
  height: number | null
  bytes: number | null
  createdAt: number
  canDelete: boolean
}

export type UploadAuth = { token: string; expire: number; signature: string; publicKey: string; folder: string }

export type AiTask = 'titles' | 'meta' | 'outline' | 'rewrite' | 'faq' | 'links' | 'alt' | 'safety'
export type AiArgs = {
  task: AiTask
  postId?: PostId
  title?: string
  keyword?: string
  text?: string
  mode?: string
  imageUrl?: string
  caption?: string
}
export type AiReply = { result: Record<string, unknown>; remaining: number }

type None = Record<string, never>

export const blogApi = {
  // Public
  listPosts: makeFunctionReference<'query', { page?: number; pageSize?: number; categorySlug?: string; authorSlug?: string }, PostList>(
    'blog:listPosts'
  ),
  getPost: makeFunctionReference<'query', { slug: string }, PostResult>('blog:getPost'),
  listCategories: makeFunctionReference<'query', None, PublicCategory[]>('blog:listCategories'),
  sitemapData: makeFunctionReference<'query', None, BlogSitemap>('blog:sitemapData'),

  // Console: reading
  viewer: makeFunctionReference<'query', None, BlogViewer | null>('blog:viewer'),
  adminListPosts: makeFunctionReference<'query', None, { role: 'admin' | 'writer'; posts: PostRow[] } | null>('blog:adminListPosts'),
  adminGetPost: makeFunctionReference<'query', { postId: PostId }, EditorPost | null>('blog:adminGetPost'),
  editorOptions: makeFunctionReference<'query', None, EditorOptions | null>('blog:editorOptions'),
  listRevisions: makeFunctionReference<'query', { postId: PostId }, RevisionRow[]>('blog:listRevisions'),
  adminCategories: makeFunctionReference<'query', None, CategoryRow[]>('blog:adminCategories'),
  adminAuthors: makeFunctionReference<'query', None, AuthorRow[]>('blog:adminAuthors'),
  listMedia: makeFunctionReference<'query', None, MediaRow[]>('blog:listMedia'),

  // Console: posts
  createPost: makeFunctionReference<'mutation', None, PostId>('blog:createPost'),
  savePost: makeFunctionReference<'mutation', SavePostArgs, { slug: string; status: BlogStatus; updatedAt: number; wordCount: number }>(
    'blog:savePost'
  ),
  submitForReview: makeFunctionReference<'mutation', { postId: PostId }, null>('blog:submitForReview'),
  withdrawSubmission: makeFunctionReference<'mutation', { postId: PostId }, null>('blog:withdrawSubmission'),
  requestChanges: makeFunctionReference<'mutation', { postId: PostId; note: string }, null>('blog:requestChanges'),
  publishPost: makeFunctionReference<'mutation', { postId: PostId }, { slug: string }>('blog:publishPost'),
  schedulePost: makeFunctionReference<'mutation', { postId: PostId; at: number }, null>('blog:schedulePost'),
  cancelSchedule: makeFunctionReference<'mutation', { postId: PostId }, null>('blog:cancelSchedule'),
  unpublishPost: makeFunctionReference<'mutation', { postId: PostId }, null>('blog:unpublishPost'),
  deletePost: makeFunctionReference<'mutation', { postId: PostId }, null>('blog:deletePost'),
  restoreRevision: makeFunctionReference<'mutation', { revisionId: RevisionId }, { title: string; body: string }>('blog:restoreRevision'),

  // Console: categories, authors, media
  saveCategory: makeFunctionReference<
    'mutation',
    { categoryId?: CategoryId; name: string; slug?: string; description?: string; order?: number },
    CategoryId
  >('blog:saveCategory'),
  deleteCategory: makeFunctionReference<'mutation', { categoryId: CategoryId }, null>('blog:deleteCategory'),
  saveAuthor: makeFunctionReference<
    'mutation',
    { authorId?: AuthorId; name: string; slug?: string; credentials?: string; bio?: string; photo?: BlogImage; sameAs: string[] },
    AuthorId
  >('blog:saveAuthor'),
  deleteAuthor: makeFunctionReference<'mutation', { authorId: AuthorId }, null>('blog:deleteAuthor'),
  uploadAuth: makeFunctionReference<'action', None, UploadAuth>('blog:uploadAuth'),
  addMedia: makeFunctionReference<
    'mutation',
    { url: string; fileId: string; alt: string; width?: number; height?: number; bytes?: number },
    MediaId
  >('blog:addMedia'),
  updateMediaAlt: makeFunctionReference<'mutation', { mediaId: MediaId; alt: string }, null>('blog:updateMediaAlt'),
  deleteMedia: makeFunctionReference<'mutation', { mediaId: MediaId }, null>('blog:deleteMedia'),

  // AI assist
  aiAssist: makeFunctionReference<'action', AiArgs, AiReply>('blog:aiAssist'),
}

export const STATUS_TONE: Record<BlogStatus, 'neutral' | 'amber' | 'green' | 'red' | 'teal'> = {
  draft: 'neutral',
  in_review: 'amber',
  changes_requested: 'red',
  scheduled: 'teal',
  published: 'green',
  archived: 'neutral',
}

export const STATUS_LABEL: Record<BlogStatus, string> = {
  draft: 'Draft',
  in_review: 'In review',
  changes_requested: 'Changes requested',
  scheduled: 'Scheduled',
  published: 'Published',
  archived: 'Archived',
}

/** A ConvexError's message (they carry the reason for the person), or a fallback. */
export function errorText(error: unknown, fallback = 'Something went wrong. Please try again.') {
  const data = (error as { data?: unknown } | null)?.data
  if (typeof data === 'string' && data.trim()) return data
  return fallback
}
