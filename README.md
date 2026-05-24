# The Pulse

A dashboard showing a feed of trending creator cards. Built to feel instant even on slow networks using React Query's caching primitives.

## Getting Started

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the feed.

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── creators/
│   │   │   └── route.ts          Feed endpoint (mock data + 1s delay)
│   │   └── creators/[id]/
│   │       └── route.ts          Detail endpoint + follow action
│   ├── components/
│   │   ├── FeedClient.tsx        Feed query + skeleton + error + SWR indicator
│   │   ├── CreatorCard.tsx       Card UI + optimistic follow + hover prefetch
│   │   └── RefreshButton.tsx     Manual cache invalidation
│   ├── lib/
│   │   └── queryClient.ts        QueryClient singleton (staleTime, gcTime, etc.)
│   ├── providers.tsx             QueryClientProvider + DevTools
│   ├── layout.tsx                Root layout
│   └── page.tsx                  Server shell → mounts FeedClient
docs/                             Stage deliverables (01–06)
spec/                             Original build brief files (00–06)
```

## Caching Behaviours

| Behaviour | Location |
|---|---|
| Stale-while-revalidate | `lib/queryClient.ts` — `staleTime: 30s`, `gcTime: 5min` |
| SWR visual indicator | `FeedClient.tsx` — `isFetching && !isLoading` |
| Optimistic Follow + rollback | `CreatorCard.tsx` — `onMutate`/`onError` |
| Manual cache invalidation | `RefreshButton.tsx` — `invalidateQueries` |
| Prefetch on hover | `CreatorCard.tsx` — `prefetchQuery` on `onMouseEnter` |
| Background refetch on focus | `lib/queryClient.ts` — `refetchOnWindowFocus: true` |

## Deploy on Netlify

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start)
