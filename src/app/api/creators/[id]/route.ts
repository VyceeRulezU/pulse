import { NextResponse } from 'next/server'

const MOCK_CREATORS = [
  { id: '1', name: 'Zara Okafor', avatar: 'ZO', followerCount: 14200, recentPostCount: 8, isFollowing: false, bio: 'Visual storyteller capturing the soul of Lagos.' },
  { id: '2', name: 'Kofi Mensah', avatar: 'KM', followerCount: 8900, recentPostCount: 14, isFollowing: false, bio: 'Accra-based musician blending highlife with afrobeat.' },
  { id: '3', name: 'Amina Diallo', avatar: 'AD', followerCount: 23500, recentPostCount: 5, isFollowing: true, bio: 'Fashion designer redefining West African textiles.' },
  { id: '4', name: 'Chidi Eze', avatar: 'CE', followerCount: 6100, recentPostCount: 22, isFollowing: false, bio: 'Tech educator building the next generation of Nigerian developers.' },
  { id: '5', name: 'Ngozi Okonkwo', avatar: 'NO', followerCount: 18700, recentPostCount: 11, isFollowing: false, bio: 'Food historian documenting disappearing Nigerian recipes.' },
  { id: '6', name: 'Kwame Asante', avatar: 'KA', followerCount: 10400, recentPostCount: 3, isFollowing: true, bio: 'Documentary photographer focused on climate resilience in the Sahel.' },
]

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  await new Promise(resolve => setTimeout(resolve, 1000))
  const creator = MOCK_CREATORS.find(c => c.id === id)
  if (!creator) {
    return NextResponse.json({ error: 'Creator not found' }, { status: 404 })
  }
  return NextResponse.json({ creator })
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  await new Promise(resolve => setTimeout(resolve, 1000))
  const creator = MOCK_CREATORS.find(c => c.id === id)
  if (!creator) {
    return NextResponse.json({ error: 'Creator not found' }, { status: 404 })
  }
  const updated = { ...creator, isFollowing: !creator.isFollowing }
  return NextResponse.json({ creator: updated })
}
