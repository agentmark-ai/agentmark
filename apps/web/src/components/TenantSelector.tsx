'use client'

import { Fragment } from 'react'
import { Listbox, Transition } from '@headlessui/react'
import { ChevronDownIcon, CheckIcon } from '@heroicons/react/20/solid'
import { BuildingOfficeIcon } from '@heroicons/react/24/outline'
import { useTenant } from '@/contexts/TenantContext'
import { cn } from '@/lib/utils'

export default function TenantSelector() {
  const { currentTenant, userTenants, switchTenant, loading } = useTenant()

  if (loading || userTenants.length === 0) {
    return (
      <div className="flex items-center space-x-2 text-sm text-muted-foreground">
        <BuildingOfficeIcon className="h-4 w-4" />
        <span>Loading...</span>
      </div>
    )
  }

  if (userTenants.length === 1) {
    return (
      <div className="flex items-center space-x-2 text-sm font-medium">
        <BuildingOfficeIcon className="h-4 w-4 text-muted-foreground" />
        <span>{currentTenant?.name}</span>
      </div>
    )
  }

  return (
    <Listbox value={currentTenant?.id || ''} onChange={switchTenant}>
      <div className="relative">
        <Listbox.Button className="relative flex items-center space-x-2 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium shadow-sm hover:bg-accent hover:text-accent-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
          <BuildingOfficeIcon className="h-4 w-4 text-muted-foreground" />
          <span className="block truncate">
            {currentTenant?.name || 'Select tenant'}
          </span>
          <ChevronDownIcon
            className="h-4 w-4 text-muted-foreground"
            aria-hidden="true"
          />
        </Listbox.Button>
        <Transition
          as={Fragment}
          leave="transition ease-in duration-100"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <Listbox.Options className="absolute z-10 mt-1 max-h-60 w-full min-w-[200px] overflow-auto rounded-md bg-popover border border-border py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm">
            {userTenants.map((userTenant) => (
              <Listbox.Option
                key={userTenant.tenant.id}
                className={({ active }) =>
                  cn(
                    'relative cursor-default select-none py-2 pl-10 pr-4',
                    active ? 'bg-accent text-accent-foreground' : 'text-foreground'
                  )
                }
                value={userTenant.tenant.id}
              >
                {({ selected }) => (
                  <>
                    <div className="flex items-center">
                      <span
                        className={cn(
                          'block truncate',
                          selected ? 'font-medium' : 'font-normal'
                        )}
                      >
                        {userTenant.tenant.name}
                      </span>
                      <span className="ml-2 text-xs text-muted-foreground capitalize">
                        {userTenant.role}
                      </span>
                    </div>
                    {selected ? (
                      <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-foreground">
                        <CheckIcon className="h-4 w-4" aria-hidden="true" />
                      </span>
                    ) : null}
                  </>
                )}
              </Listbox.Option>
            ))}
          </Listbox.Options>
        </Transition>
      </div>
    </Listbox>
  )
}