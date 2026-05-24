'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'

interface Creator {
  id: string
  name: string
  avatar: string
  followerCount: number
  recentPostCount: number
  isFollowing: boolean
}

interface CreatorCardProps {
  creator: Creator
}

async function followCreator(creatorId: string): Promise<void> {
  const res = await fetch(`/api/creators/${creatorId}`, { method: 'POST' })
  if (!res.ok) throw new Error('Failed to follow creator')
}

async function fetchCreatorDetail(creatorId: string) {
  const res = await fetch(`/api/creators/${creatorId}`)
  if (!res.ok) throw new Error('Failed to fetch creator detail')
  return res.json()
}

export function CreatorCard({ creator }: CreatorCardProps) {
  const queryClient = useQueryClient()

  const followMutation = useMutation({
    mutationFn: (creatorId: string) => followCreator(creatorId),
    onMutate: async (creatorId) => {
      await queryClient.cancelQueries({ queryKey: ['creators'] })
      const previousCreators = queryClient.getQueryData<{ creators: Creator[] }>(['creators'])
      queryClient.setQueryData<{ creators: Creator[] }>(['creators'], (old) => {
        if (!old) return old
        return {
          creators: old.creators.map(c =>
            c.id === creatorId
              ? { ...c, isFollowing: !c.isFollowing, followerCount: c.isFollowing ? c.followerCount - 1 : c.followerCount + 1 }
              : c
          ),
        }
      })
      return { previousCreators }
    },
    onError: (_err, _creatorId, context) => {
      if (context?.previousCreators) {
        queryClient.setQueryData(['creators'], context.previousCreators)
      } else {
        queryClient.invalidateQueries({ queryKey: ['creators'] })
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['creators'] })
    },
  })

  const handleMouseEnter = () => {
    queryClient.prefetchQuery({
      queryKey: ['creator', creator.id],
      queryFn: () => fetchCreatorDetail(creator.id),
      staleTime: 60 * 1000,
    })
  }

  const handleClick = () => {
    followMutation.mutate(creator.id)
  }

  const formatCount = (n: number) => {
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
    return n.toString()
  }

  return (
    <div
      onMouseEnter={handleMouseEnter}
      className="bg-white dark:bg-zinc-900 rounded-xl p-5 border border-zinc-200 dark:border-zinc-800 hover:border-purple-300 dark:hover:border-purple-700 transition-colors"
    >
      <div className="flex items-center gap-3 mb-3">
        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-bold text-sm shrink-0">
          {creator.avatar}
        </div>
        <div className="min-w-0">
          <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 truncate">{creator.name}</h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">{formatCount(creator.followerCount)} followers</p>
        </div>
      </div>
      <div className="flex items-center gap-1 text-sm text-zinc-600 dark:text-zinc-400 mb-4">
        <span className="inline-block w-2 h-2 rounded-full bg-emerald-400" />
        {creator.recentPostCount} posts in the last 7 days
      </div>
      <button
        onClick={handleClick}
        disabled={followMutation.isPending}
        className={`w-full py-2 px-4 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
          creator.isFollowing
            ? 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
            : 'bg-purple-600 text-white hover:bg-purple-700'
        }`}
      >
        {followMutation.isPending ? '...' : creator.isFollowing ? 'Following' : 'Follow'}
      </button>
    </div>
  )
}
