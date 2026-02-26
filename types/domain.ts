// Shared domain types for billing and plans.

export type Plan = 'starter' | 'growth' | 'enterprise';

export interface PlanLimits {
  dataSources: number | null;
  users: number | null;
  storageMb: number | null;
  aiTier: 'basic' | 'full' | 'enterprise';
}

export type BillingStatus = 'trialing' | 'active' | 'past_due' | 'canceled';

export interface Subscription {
  plan: Plan;
  status: BillingStatus;
  renewsAt: string | null;
  cancelAt?: string | null;
  provider?: 'stripe' | 'paddle' | null;
  providerSubscriptionId?: string | null;
}

// Ontology types
export type PropertyType = 'text' | 'number' | 'currency' | 'percentage' | 'date' | 'boolean' | 'email' | 'url';

export interface EntityProperty {
  key: string;          // 'revenue', 'email', 'capacity'
  label: string;        // 'Revenue', 'Email', 'Capacity'
  type: PropertyType;
  visible?: boolean;    // show in AI context and entity cards; default true
}

export interface EntityType {
  id: string;
  org_id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string;
  color: string;
  properties: EntityProperty[];
  created_at: string;
}

export interface Entity {
  id: string;
  org_id: string;
  entity_type_id: string;
  name: string;
  properties: Record<string, unknown>;
  source_upload_id: string | null;
  created_at: string;
}

export interface RelationshipType {
  id: string;
  org_id: string;
  name: string;
  from_type_id: string;
  to_type_id: string;
  description: string | null;
}

export interface EntityRelationship {
  id: string;
  org_id: string;
  relationship_type_id: string;
  from_entity_id: string;
  to_entity_id: string;
  properties: Record<string, unknown>;
}

