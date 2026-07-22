import { describe,expect,it } from 'vitest';
import { buildAuditTimeline } from '../lib/audit-timeline';

describe('Audit timeline',()=>{
  const invoice={id:'inv-1',original_name:'invoice.pdf',file_hash:'abc',created_at:'2026-01-01T00:00:00Z',updated_at:'2026-01-01T00:01:00Z',ai_status:'COMPLETE',ai_model:'gemini-test'};
  it('sorts persisted events and keeps local events off-chain',()=>{
    const timeline=buildAuditTimeline(invoice,undefined,[],[{id:1,invoice_id:'inv-1',event:'RISK_ASSESSED',created_at:'2026-01-01T00:02:00Z',details_json:'{"decision":"AUTO_PROPOSE"}'}]);
    expect(timeline.map(item=>item.timestamp)).toEqual([...timeline.map(item=>item.timestamp)].sort());
    expect(timeline.find(item=>item.name==='PDF uploaded')).toMatchObject({kind:'LOCAL',deployHash:null,blockHeight:null});
    expect(timeline.find(item=>item.name==='Risk Agent decision generated')).toMatchObject({kind:'AI',status:'AUTO_PROPOSE'});
  });

  it('includes real deploy hash and block only for persisted blockchain evidence',()=>{
    const action={id:'act-1',invoice_id:'inv-1',proposal_id:'prop-1',action:'approve_invoice',deploy_hash:'d'.repeat(64),caller_public_key:'02abc',execution_status:'EXECUTED',block_height:123,created_at:'2026-01-01T00:03:00Z',updated_at:'2026-01-01T00:05:00Z'};
    const audit=[{id:2,invoice_id:'inv-1',proposal_id:'prop-1',event:'CASPER_DEPLOY_SUBMITTED',actor:'02abc',created_at:'2026-01-01T00:04:00Z',details_json:JSON.stringify({actionId:'act-1',deployHash:'d'.repeat(64)})}];
    const timeline=buildAuditTimeline(invoice,undefined,[action],audit);
    expect(timeline.find(item=>item.name==='Deploy submitted')).toMatchObject({kind:'ON_CHAIN',deployHash:'d'.repeat(64)});
    expect(timeline.find(item=>item.name==='Execution succeeded')).toMatchObject({kind:'ON_CHAIN',blockHeight:123,status:'EXECUTED'});
    expect(timeline.find(item=>item.name==='Proposal approved')).toMatchObject({kind:'HUMAN',actor:'02abc'});
    expect(timeline.find(item=>item.name==='Supabase reconciliation completed')).toMatchObject({kind:'LOCAL'});
  });
});
