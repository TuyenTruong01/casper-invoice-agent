import { describe,expect,it } from 'vitest';
import { calculateDashboardMetrics } from '../lib/dashboard-metrics';

describe('Dashboard metrics',()=>{
  it('counts decisions, effective chain states, activity and currency-safe amounts',()=>{
    const invoices=[
      {id:'a',risk_decision:'AUTO_PROPOSE',amount:100,currency:'USD',contract_state:'APPROVED',updated_at:'2026-07-22T02:00:00Z'},
      {id:'b',risk_decision:'BLOCK',amount:50,currency:'USD',contract_state:'PAID',updated_at:'2026-07-21T02:00:00Z'},
      {id:'c',risk_decision:'ESCALATE',amount:2,currency:'CSPR',updated_at:'2026-07-16T02:00:00Z'},
      {id:'d',risk_decision:'AUTO_PROPOSE',amount:25,currency:'USD',updated_at:'2026-07-22T03:00:00Z'},
    ];
    const proposals=[{invoice_id:'d',onchain_status:'PENDING'}];
    const metrics=calculateDashboardMetrics(invoices,proposals,new Date('2026-07-22T12:00:00+07:00'));
    expect(metrics).toMatchObject({total:4,auto:2,review:1,blocked:1,pending:1,approved:1,anchored:1,rejected:0,today:2,lastSevenDays:4,autoRate:50,blockRate:25,escalateRate:25});
    expect(metrics.totalAmounts).toEqual([{currency:'CSPR',amount:2},{currency:'USD',amount:175}]);
    expect(metrics.approvedAmounts).toEqual([{currency:'USD',amount:150}]);
    expect(metrics.anchoredAmounts).toEqual([{currency:'USD',amount:50}]);
  });

  it('returns zero rates and totals safely for an empty dashboard',()=>{
    expect(calculateDashboardMetrics([],[],new Date('2026-07-22T00:00:00Z'))).toMatchObject({total:0,autoRate:0,blockRate:0,escalateRate:0,totalAmounts:[]});
  });
});
