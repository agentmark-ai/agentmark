import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const userTenants = await prisma.userTenant.findMany({
      where: {
        userId: session.user.id
      },
      include: {
        tenant: true
      },
      orderBy: {
        tenant: {
          name: 'asc'
        }
      }
    })

    return NextResponse.json({ userTenants })

  } catch (error) {
    console.error('Get tenants error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}