import { NextResponse } from 'next/server'

const MOCK_CREATORS = [
  { id: '1', name: 'Zara Okafor', avatar: 'ZO', followerCount: 14200, recentPostCount: 8, isFollowing: false },
  { id: '2', name: 'Kofi Mensah', avatar: 'KM', followerCount: 8900, recentPostCount: 14, isFollowing: false },
  { id: '3', name: 'Amina Diallo', avatar: 'AD', followerCount: 23500, recentPostCount: 5, isFollowing: true },
  { id: '4', name: 'Chidi Eze', avatar: 'CE', followerCount: 6100, recentPostCount: 22, isFollowing: false },
  { id: '5', name: 'Ngozi Okonkwo', avatar: 'NO', followerCount: 18700, recentPostCount: 11, isFollowing: false },
  { id: '6', name: 'Kwame Asante', avatar: 'KA', followerCount: 10400, recentPostCount: 3, isFollowing: true },
]

export async function GET() {
  await new Promise(resolve => setTimeout(resolve, 1000))
  return NextResponse.json({ creators: MOCK_CREATORS })
}
