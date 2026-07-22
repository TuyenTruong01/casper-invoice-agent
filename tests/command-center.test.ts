import { describe,expect,it } from 'vitest';
import { buildCommandCenterQueues,commandCenterState } from '../lib/command-center';

describe('Command Center work queues',()=>{
  it('classifies every required workflow state',()=>{
    expect(commandCenterState({status:'UPLOADED',ai_status:'PENDING'})).toBe('new');
    expect(commandCenterState({risk_decision:'AUTO_PROPOSE'})).toBe('ready');
    expect(commandCenterState({risk_decision:'ESCALATE'})).toBe('review');
    expect(commandCenterState({risk_decision:'BLOCK'})).toBe('blocked');
    expect(commandCenterState({risk_decision:'AUTO_PROPOSE',contract_state:'PENDING'})).toBe('pending');
    expect(commandCenterState({risk_decision:'AUTO_PROPOSE',contract_state:'APPROVED'})).toBe('approved');
    expect(commandCenterState({contract_state:'PAID'})).toBe('completed');
    expect(commandCenterState({contract_state:'REJECTED'})).toBe('completed');
  });

  it('uses proposal state, keeps groups exclusive and sorts newest first',()=>{
    const invoices=[
      {id:'older',risk_decision:'AUTO_PROPOSE',created_at:'2026-01-01T00:00:00Z'},
      {id:'newer',risk_decision:'AUTO_PROPOSE',created_at:'2026-01-02T00:00:00Z'},
      {id:'chain',risk_decision:'AUTO_PROPOSE',created_at:'2026-01-03T00:00:00Z'},
    ];
    const queues=buildCommandCenterQueues(invoices,[{invoice_id:'chain',onchain_status:'PENDING'}]);
    expect(queues.find(queue=>queue.key==='ready')?.invoices.map(x=>x.id)).toEqual(['newer','older']);
    expect(queues.find(queue=>queue.key==='pending')?.invoices.map(x=>x.id)).toEqual(['chain']);
    expect(queues.reduce((sum,queue)=>sum+queue.invoices.length,0)).toBe(3);
  });
});
