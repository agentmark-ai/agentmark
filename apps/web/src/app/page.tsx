'use client'

import { useSession } from 'next-auth/react'
import { useTenant } from '@/contexts/TenantContext'
import Link from 'next/link'

export default function Home() {
  const { data: session } = useSession()
  const { currentTenant, userTenants, loading } = useTenant()

  if (!session) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-6xl">
            Welcome to AgentMark
          </h1>
          <p className="mt-6 text-lg leading-8 text-muted-foreground">
            Develop, test, and evaluate your AI Agents with our multi-tenant platform.
          </p>
          <div className="mt-10 flex items-center justify-center gap-x-6">
            <Link
              href="/auth/signup"
              className="rounded-md bg-primary px-3.5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              Get started
            </Link>
            <Link
              href="/auth/signin"
              className="text-sm font-semibold leading-6 text-foreground hover:text-foreground/80"
            >
              Sign in <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="text-center">
        <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-6xl">
          Welcome back, {session.user?.name || session.user?.email}
        </h1>
        
        {currentTenant ? (
          <div className="mt-8">
            <h2 className="text-2xl font-semibold text-foreground">
              Working in: {currentTenant.name}
            </h2>
            <p className="mt-2 text-muted-foreground">
              {currentTenant.description || 'No description available'}
            </p>
          </div>
        ) : userTenants.length === 0 ? (
          <div className="mt-8">
            <p className="text-muted-foreground">
              You don't belong to any tenants yet. Contact your administrator to get access.
            </p>
          </div>
        ) : (
          <div className="mt-8">
            <p className="text-muted-foreground">
              Please select a tenant from the dropdown to continue.
            </p>
          </div>
        )}

        {userTenants.length > 0 && (
          <div className="mt-12">
            <h3 className="text-lg font-medium text-foreground mb-6">Your Tenants</h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {userTenants.map((userTenant) => (
                <div
                  key={userTenant.id}
                  className="rounded-lg border border-border bg-card p-6 shadow-sm"
                >
                  <h4 className="font-semibold text-card-foreground">
                    {userTenant.tenant.name}
                  </h4>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {userTenant.tenant.description || 'No description'}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground capitalize">
                    Role: {userTenant.role}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}