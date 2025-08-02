export interface User {
  id: string;
  email: string;
  name?: string;
  createdAt: Date;
  updatedAt: Date;
  userTenants: UserTenant[];
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
  userTenants: UserTenant[];
}

export interface UserTenant {
  id: string;
  userId: string;
  tenantId: string;
  role: 'member' | 'admin' | 'owner';
  user: User;
  tenant: Tenant;
}

export interface TenantContextType {
  currentTenant: Tenant | null;
  userTenants: UserTenant[];
  switchTenant: (tenantId: string) => void;
  loading: boolean;
}

export interface AuthUser {
  id: string;
  email: string;
  name?: string;
  userTenants: UserTenant[];
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterCredentials {
  email: string;
  password: string;
  name?: string;
}