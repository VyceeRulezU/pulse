import { Providers } from './providers'
import { FeedClient } from './components/FeedClient'

export default function Home() {
  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 dark:bg-black font-sans">
      <main className="w-full max-w-5xl py-12 px-6">
        <Providers>
          <FeedClient />
        </Providers>
      </main>
    </div>
  )
}
