'use client'

import { useQuery } from '@tanstack/react-query'
import { CreatorCard } from './CreatorCard'
import { RefreshButton } from './RefreshButton'

interface Creator {
  id: string
  name: string
  avatar: string
  followerCount: number
  recentPostCount: number
  isFollowing: boolean
}

interface CreatorsResponse {
  creators: Creator[]
}

async function fetchCreators({ signal }: { signal?: AbortSignal }): Promise<CreatorsResponse> {
  const res = await fetch('/api/creators', { signal })
  if (!res.ok) throw new Error('Failed to fetch creators')
  return res.json()
}

export function FeedClient() {
  const { data, isLoading, isFetching, isError, error } = useQuery({
    queryKey: ['creators'],
    queryFn: fetchCreators,
  })

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-white dark:bg-zinc-900 rounded-xl p-5 border border-zinc-200 dark:border-zinc-800 animate-pulse space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-zinc-200 dark:bg-zinc-700" />
              <div className="h-4 w-28 bg-zinc-200 dark:bg-zinc-700 rounded" />
            </div>
            <div className="h-3 w-20 bg-zinc-200 dark:bg-zinc-700 rounded" />
            <div className="h-3 w-16 bg-zinc-200 dark:bg-zinc-700 rounded" />
            <div className="h-9 w-full bg-zinc-200 dark:bg-zinc-700 rounded-lg" />
          </div>
        ))}
      </div>
    )
  }

  if (isError) {
    return (
      <div className="text-center py-16">
        <p className="text-zinc-500 dark:text-zinc-400 text-lg">Something went wrong loading the feed.</p>
        <p className="text-zinc-400 dark:text-zinc-500 text-sm mt-2">{error?.message}</p>
        <RefreshButton />
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">The Pulse</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">Trending creators right now</p>
        </div>
        <div className="flex items-center gap-3">
          {isFetching && (
            <span className="text-xs text-purple-500 animate-pulse font-medium">Updating feed...</span>
          )}
          <RefreshButton />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {data?.creators.map(creator => (
          <CreatorCard key={creator.id} creator={creator} />
        ))}
      </div>
    </div>
  )
}
