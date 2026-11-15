/**
 * Group home (convex/learnGroupHome.ts): references and types. Plain references because the
 * generated `api` type is at TypeScript's depth limit (TS2589).
 */

import { makeFunctionReference, type RegisteredMutation, type RegisteredQuery } from 'convex/server'
import type { Id } from '@/convex/_generated/dataModel'
import type * as gh from '@/convex/learnGroupHome'
import { learnPath } from '../platform/learnApi'

type Returns<T> = T extends RegisteredQuery<'public', infer _A, infer R>
  ? Awaited<R>
  : T extends RegisteredMutation<'public', infer _A, infer R>
    ? Awaited<R>
    : never

export type GroupHomeData = NonNullable<Returns<typeof gh.home>>
export type GroupAssignments = NonNullable<Returns<typeof gh.assignments>>
export type GroupAssignment = GroupAssignments['items'][number]
export type AssignmentProgress = NonNullable<Returns<typeof gh.assignmentProgress>>
export type Assignable = NonNullable<Returns<typeof gh.assignable>>
export type GroupPeople = NonNullable<Returns<typeof gh.people>>
export type GroupPerson = GroupPeople['people'][number]
export type InvitePreview = Returns<typeof gh.invitePreview>
export type AssignmentKind = 'course' | 'lesson' | 'sim'

type GroupId = Id<'learnGroups'>
type AssignmentId = Id<'learnGroupAssignments'>

export const groupApi = {
  home: makeFunctionReference<'query', { groupId: GroupId }, GroupHomeData | null>('learnGroupHome:home'),
  setAnnouncement: makeFunctionReference<'mutation', { groupId: GroupId; text: string }, null>('learnGroupHome:setAnnouncement'),
  setInvite: makeFunctionReference<'mutation', { groupId: GroupId; action: 'on' | 'new' | 'off' }, { code: string | null }>('learnGroupHome:setInvite'),
  invitePreview: makeFunctionReference<'query', { code: string }, InvitePreview>('learnGroupHome:invitePreview'),
  joinByInvite: makeFunctionReference<'mutation', { code: string }, { roomSlug: string }>('learnGroupHome:joinByInvite'),
  assignments: makeFunctionReference<'query', { groupId: GroupId }, GroupAssignments | null>('learnGroupHome:assignments'),
  assignmentProgress: makeFunctionReference<'query', { assignmentId: AssignmentId }, AssignmentProgress | null>('learnGroupHome:assignmentProgress'),
  assignable: makeFunctionReference<'query', { groupId: GroupId }, Assignable | null>('learnGroupHome:assignable'),
  createAssignment: makeFunctionReference<
    'mutation',
    {
      groupId: GroupId
      kind: AssignmentKind
      courseId?: Id<'learnVideoCourses'>
      lessonId?: Id<'learnVideoLessons'>
      caseSlug?: string
      note?: string
      dueAt?: number
    },
    AssignmentId
  >('learnGroupHome:createAssignment'),
  removeAssignment: makeFunctionReference<'mutation', { assignmentId: AssignmentId }, null>('learnGroupHome:removeAssignment'),
  people: makeFunctionReference<'query', { groupId: GroupId }, GroupPeople | null>('learnGroupHome:people'),
}

export const groupJoinPath = (code: string) => learnPath(`/community/join/${code}`)
export const coursePath = (courseId: string) => learnPath(`/courses/${courseId}`)
