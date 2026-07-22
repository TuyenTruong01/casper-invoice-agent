import { describe,expect,it } from 'vitest';
import { buildRiskPresentation } from '../lib/risk-reasoning';

describe('Risk Agent reasoning presentation',()=>{
  it('does not turn a technical extraction error into BLOCK',()=>{
    const result=buildRiskPresentation({status:'EXTRACTION_FAILED',ai_status:'ERROR',risk_decision:null,risk_score:null});
    expect(result).toMatchObject({mode:'TECHNICAL_ERROR',decision:null,score:null,summary:'Technical processing error. Risk Agent was not executed.',flags:[]});
    expect(result.recommendation).toBeNull();
  });

  it('preserves persisted flags, severity and evidence and derives only deterministic passes',()=>{
    const flag={code:'AMOUNT_ANOMALY',severity:'HIGH',message:'Amount exceeds baseline.',evidence:'amount=2500; average=1000'};
    const result=buildRiskPresentation({invoice_number:'INV-1',recipient_wallet:'account-hash-1',missing_fields:[],risk_decision:'ESCALATE',risk_score:45,risk_flags:[flag]});
    expect(result.flags).toEqual([flag]);
    expect(result.recommendation).toBe('Invoice requires Manager review. No Casper proposal has been submitted.');
    expect(result.passedChecks).toContain('Invoice number unique');
    expect(result.passedChecks).not.toContain('Amount within expected range');
  });
});
