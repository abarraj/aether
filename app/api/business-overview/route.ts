// Business overview API — provides fact-layer-aware data for the UI.
// Returns staff from staff_directory, clients from transaction_facts,
// and data availability flags so the UI can show appropriate states.
//
// GET: returns { staff, clients, hasTransactions, hasStaffDirectory }

import { NextResponse } from 'next/server';
import { getOrgContext } from '@/lib/auth/org-context';

interface StaffEntry {
  id: string;
  name: string;
  source: string;
  is_active: boolean;
  role: string | null;
  department: string | null;
}

interface ClientEntry {
  name: string;
  transaction_count: number;
  total_revenue: number;
}

export async function GET() {
  try {
    const ctx = await getOrgContext();
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { supabase, orgId } = ctx;

    // Fetch staff from staff_directory
    const { data: staffRows } = await supabase
      .from('staff_directory')
      .select('id, name, source, is_active, role, department')
      .eq('org_id', orgId)
      .order('name', { ascending: true })
      .returns<StaffEntry[]>();

    // Fetch distinct clients from transaction_facts with aggregates
    // Use a raw query to get distinct client names with counts
    const { data: clientRows } = await supabase
      .from('transaction_facts')
      .select('client_name, gross_total')
      .eq('org_id', orgId)
      .not('client_name', 'is', null)
      .returns<{ client_name: string; gross_total: number }[]>();

    // Aggregate clients
    const clientMap = new Map<string, { count: number; revenue: number }>();
    for (const row of clientRows ?? []) {
      if (!row.client_name?.trim()) continue;
      const name = row.client_name.trim();
      const existing = clientMap.get(name) ?? { count: 0, revenue: 0 };
      existing.count++;
      existing.revenue += Number(row.gross_total) || 0;
      clientMap.set(name, existing);
    }

    const clients: ClientEntry[] = Array.from(clientMap.entries())
      .map(([name, { count, revenue }]) => ({
        name,
        transaction_count: count,
        total_revenue: Math.round(revenue * 100) / 100,
      }))
      .sort((a, b) => b.total_revenue - a.total_revenue);

    const staff = staffRows ?? [];
    const hasTransactions = (clientRows ?? []).length > 0;
    const hasStaffDirectory = staff.length > 0;

    return NextResponse.json({
      staff,
      clients,
      hasTransactions,
      hasStaffDirectory,
      staffCount: staff.length,
      activeStaffCount: staff.filter((s) => s.is_active).length,
      clientCount: clients.length,
    });
  } catch (err) {
    console.error('Business overview API error:', err);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
