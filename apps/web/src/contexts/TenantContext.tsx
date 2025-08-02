'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import type { Tenant, UserTenant, TenantContextType } from '@/types'

const TenantContext = createContext<TenantContextType | undefined>(undefined)

export function TenantProvider({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession()
  const [currentTenant, setCurrentTenant] = useState<Tenant | null>(null)
  const [userTenants, setUserTenants] = useState<UserTenant[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (session?.user?.userTenants) {
      setUserTenants(session.user.userTenants)
      
      // Get current tenant from localStorage or default to first tenant
      const savedTenantId = localStorage.getItem('currentTenantId')
      let tenantToSelect = null
      
      if (savedTenantId) {
        tenantToSelect = session.user.userTenants.find(
          ut => ut.tenant.id === savedTenantId
        )?.tenant
      }
      
      if (!tenantToSelect && session.user.userTenants.length > 0) {
        tenantToSelect = session.user.userTenants[0].tenant
      }
      
      setCurrentTenant(tenantToSelect || null)
    } else {
      setUserTenants([])
      setCurrentTenant(null)
    }
    setLoading(false)
  }, [session])

  const switchTenant = (tenantId: string) => {
    const userTenant = userTenants.find(ut => ut.tenant.id === tenantId)
    if (userTenant) {
      setCurrentTenant(userTenant.tenant)
      localStorage.setItem('currentTenantId', tenantId)
    }
  }

  return (
    <TenantContext.Provider
      value={{
        currentTenant,
        userTenants,
        switchTenant,
        loading
      }}
    >
      {children}
    </TenantContext.Provider>
  )
}

export function useTenant() {
  const context = useContext(TenantContext)
  if (context === undefined) {
    throw new Error('useTenant must be used within a TenantProvider')
  }
  return context
}