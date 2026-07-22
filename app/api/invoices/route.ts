import { NextResponse } from 'next/server';
import { serializeInvoice } from '../../../lib/db';
import { getSupabaseAdmin } from '../../../lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const [invoicesResult, proposalsResult, actionsResult, auditResult] = await Promise.all([
      supabase.from('invoices').select('*').order('created_at', { ascending:false }).limit(200),
      supabase.from('proposals').select('*').order('created_at', { ascending:false }).limit(200),
      supabase.from('blockchain_actions').select('*').order('created_at', { ascending:false }).limit(300),
      supabase.from('audit_history').select('*').order('id', { ascending:false }).limit(300),
    ]);

    for (const [name, result] of [['invoices', invoicesResult], ['proposals', proposalsResult], ['actions', actionsResult], ['audit', auditResult]] as const) {
      if (result.error) throw new Error(`Could not load ${name}: ${result.error.message}`);
    }

    return NextResponse.json({
      ok:true,
      invoices:(invoicesResult.data || []).map(serializeInvoice),
      proposals:proposalsResult.data || [],
      actions:actionsResult.data || [],
      audit:auditResult.data || [],
    });
  } catch (error) {
    return NextResponse.json({ ok:false, error:error instanceof Error ? error.message : String(error), invoices:[], proposals:[], actions:[], audit:[] }, { status:500 });
  }
}
