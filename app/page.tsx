'use client';
import { useEffect, useMemo, useState } from 'react';
import { initialWallets, invoices as seedInvoices, vendors as seedVendors, WalletUser, Role, Invoice } from '../data/seed';
import { BarChart3, Bot, CreditCard, FileText, Home, ListChecks, Lock, Settings, ShieldCheck, Store, Upload, Wallet, History, PieChart, Eye, Plus, Save, Trash2 } from 'lucide-react';

declare global {
  interface Window {
    CasperWalletProvider?: any;
  }
}


type Tab='Dashboard'|'Invoices'|'Vendors'|'AI Analysis'|'Payments & Escrow'|'Transactions'|'Reports'|'Settings';
type Proposal={id:string; status:'Draft'|'Approved'|'Executed'; invoiceIds:string[]; total:number; createdBy:string; txHash?:string; createdAt:string};
const nav: [Tab, any][]=[['Dashboard',Home],['Invoices',FileText],['Vendors',Store],['AI Analysis',Bot],['Payments & Escrow',CreditCard],['Transactions',History],['Reports',PieChart],['Settings',Settings]];
function short(a=''){return a.slice(0,8)+'...'+a.slice(-6)}
function money(n:number){return '$'+n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}
function can(role:Role|undefined, action:'admin'|'approve'|'view'){ if(action==='view') return !!role; if(action==='admin') return role==='ADMIN'; return role==='ADMIN'||role==='MANAGER'; }
export default function Page(){
 const [tab,setTab]=useState<Tab>('Dashboard');
 const [wallets,setWallets]=useState<WalletUser[]>(initialWallets);
 const [connected,setConnected]=useState('');
 const [walletStatus,setWalletStatus]=useState<'idle'|'connecting'|'connected'|'not-installed'|'not-whitelisted'|'error'>('idle');
 const [walletMessage,setWalletMessage]=useState('Connect Casper Wallet to continue.');
 const [walletApiInfo,setWalletApiInfo]=useState<string[]>([]);
 const [signatureTest,setSignatureTest]=useState('');
 const [deploySignatureTest,setDeploySignatureTest]=useState('');
 const [deploySubmitTest,setDeploySubmitTest]=useState('');
 const [invoices,setInvoices]=useState<Invoice[]>(seedInvoices);
 const [proposal,setProposal]=useState<Proposal|null>(null);
 const [txs,setTxs]=useState<any[]>([]);
 const [aiLog,setAiLog]=useState<string[]>(['AI Agent ready. Connect a whitelisted wallet to start.']);
 const [uploadState,setUploadState]=useState('');
 const [uploadedInvoices,setUploadedInvoices]=useState<any[]>([]);
 const current=wallets.find(w=>w.address.toLowerCase()===connected.toLowerCase() && w.status==='ACTIVE');
 const locked=!current;
 const ready=invoices.filter(i=>['Pending','Overdue'].includes(i.status) && i.risk<60);
 const review=invoices.filter(i=>['Duplicate','Amount Mismatch','Need Review'].includes(i.status)||i.risk>=60);
 const summary=useMemo(()=>({total:invoices.length, pending:invoices.filter(i=>i.status==='Pending').length, paid:invoices.filter(i=>i.status==='Paid').length, alerts:review.length, amount:invoices.reduce((s,i)=>s+i.amount,0)}),[invoices,review.length]);
 function getCasperProvider(){
  if(typeof window==='undefined') return null;
  const Provider = window.CasperWalletProvider;
  if(!Provider) return null;
  try {
    if(typeof Provider === 'function') return Provider();
    if(typeof Provider === 'object' && typeof Provider.getProvider === 'function') return Provider.getProvider();
    return Provider;
  } catch {
    return Provider;
  }
 }

 async function testDeploySignature(){
  const provider = getCasperProvider();
  if(!provider){
    setDeploySignatureTest('Casper Wallet provider not found.');
    return;
  }

  if(!current){
    setDeploySignatureTest('Connect a whitelisted wallet first.');
    return;
  }

  try {
    setDeploySignatureTest('Loading unsigned deploy JSON...');
    const res = await fetch('/casper/record-proof-unsigned-deploy.json', { cache: 'no-store' });
    if(!res.ok){
      setDeploySignatureTest(`Cannot load unsigned deploy JSON: HTTP ${res.status}`);
      return;
    }

    const unsignedDeploy = await res.json();

    if(unsignedDeploy?.header?.account?.toLowerCase?.() !== connected.toLowerCase()){
      setDeploySignatureTest(`Deploy account does not match connected wallet. Deploy account: ${short(unsignedDeploy?.header?.account || '')}`);
      return;
    }

    setDeploySignatureTest('Waiting for Casper Wallet deploy signature popup...');

    if(typeof provider.sign !== 'function'){
      setDeploySignatureTest('Casper Wallet provider.sign is not available.');
      return;
    }

    const signed:any = await provider.sign(JSON.stringify(unsignedDeploy), connected);

    const text = typeof signed === 'string' ? signed : JSON.stringify(signed);
    setDeploySignatureTest(`Deploy signature OK: ${text.slice(0, 180)}${text.length>180?'...':''}`);

    if(signed?.cancelled){
      setDeploySubmitTest('Signing was cancelled.');
      return;
    }

    const rawSignatureHex = signed?.signatureHex || signed?.signature;
    if(!rawSignatureHex || typeof rawSignatureHex !== 'string'){
      setDeploySubmitTest('Wallet signed, but no signatureHex was returned.');
      return;
    }

    // Casper deploy approval signatures are algorithm-tagged.
    // Public key prefix 01 = Ed25519, 02 = Secp256k1.
    // Casper Wallet returns the raw signatureHex, so we prefix it with the connected key algorithm.
    const keyTag = connected.slice(0, 2);
    const signatureHex =
      rawSignatureHex.startsWith('01') || rawSignatureHex.startsWith('02')
        ? rawSignatureHex
        : `${keyTag}${rawSignatureHex}`;

    const signedDeploy = {
      ...unsignedDeploy,
      approvals: [
        {
          signer: connected,
          signature: signatureHex,
        },
      ],
    };

    setDeploySubmitTest('Submitting signed deploy to Casper Testnet...');

    const putRes = await fetch('/api/casper/put-deploy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deploy: signedDeploy }),
    });

    const putJson = await putRes.json();

    if(!putJson.ok){
      setDeploySubmitTest(`Submit failed: ${JSON.stringify(putJson, null, 2).slice(0, 1500)}`);
      return;
    }

    const deployHash = putJson.deployHash || putJson?.rpc?.result?.deploy_hash || unsignedDeploy.hash;
    setDeploySubmitTest(`Submitted to Casper Testnet. Deploy hash: ${deployHash}`);
  } catch(err:any) {
    console.error(err);
    setDeploySignatureTest(`Deploy signature rejected or failed: ${err?.message || String(err)}`);
  }
 }

 async function testWalletSignature(){
  const provider = getCasperProvider();
  if(!provider){
    setSignatureTest('Casper Wallet provider not found.');
    return;
  }

  if(!connected){
    setSignatureTest('Connect a whitelisted wallet first.');
    return;
  }

  const message = `Casper Invoice Agent signature test for ${connected} at ${new Date().toISOString()}`;

  try {
    let result:any = null;

    if(typeof provider.signMessage === 'function'){
      result = await provider.signMessage(message, connected);
    } else if(typeof provider.sign === 'function'){
      result = await provider.sign(message, connected);
    } else {
      setSignatureTest('No signMessage/sign method found in Casper Wallet provider.');
      return;
    }

    const text = typeof result === 'string' ? result : JSON.stringify(result);
    setSignatureTest(`Signature OK: ${text.slice(0,120)}${text.length>120?'...':''}`);
  } catch(err:any) {
    console.error(err);
    setSignatureTest(`Signature rejected or failed: ${err?.message || String(err)}`);
  }
 }

 function inspectCasperWalletApi(){
  const provider = getCasperProvider();
  if(!provider){
    setWalletApiInfo(['Casper Wallet provider not found.']);
    return;
  }

  const names = new Set<string>();
  let obj:any = provider;
  for(let depth=0; obj && depth<4; depth++){
    Object.getOwnPropertyNames(obj).forEach(n=>names.add(n));
    obj = Object.getPrototypeOf(obj);
  }

  const filtered = Array.from(names)
    .filter(n=>!['constructor','__proto__'].includes(n))
    .sort();

  setWalletApiInfo(filtered);
 }

 async function connectCasperWallet(){
  setWalletStatus('connecting');
  setWalletMessage('Waiting for Casper Wallet approval...');

  const provider = getCasperProvider();
  if(!provider){
    setWalletStatus('not-installed');
    setWalletMessage('Casper Wallet extension is not installed or not available in this browser.');
    setConnected('');
    return;
  }

  try {
    if(typeof provider.requestConnection === 'function'){
      await provider.requestConnection();
    } else if(typeof provider.connect === 'function'){
      await provider.connect();
    }

    let publicKey = '';
    if(typeof provider.getActivePublicKey === 'function'){
      publicKey = await provider.getActivePublicKey();
    } else if(typeof provider.getSelectedPublicKey === 'function'){
      publicKey = await provider.getSelectedPublicKey();
    } else if(typeof provider.getPublicKey === 'function'){
      publicKey = await provider.getPublicKey();
    }

    if(!publicKey){
      setWalletStatus('error');
      setWalletMessage('Connected, but could not read active public key from Casper Wallet.');
      setConnected('');
      return;
    }

    const normalized = publicKey.trim();
    const whitelisted = wallets.find(w=>w.address.toLowerCase()===normalized.toLowerCase() && w.status==='ACTIVE');

    if(!whitelisted){
      setConnected(normalized);
      setWalletStatus('not-whitelisted');
      setWalletMessage(`Wallet connected but not whitelisted: ${short(normalized)}`);
      return;
    }

    setConnected(normalized);
    setWalletStatus('connected');
    setWalletMessage(`Connected as ${whitelisted.name} — ${whitelisted.role}`);
  } catch (err:any) {
    console.error(err);
    setWalletStatus('error');
    setWalletMessage(err?.message || 'Casper Wallet connection was rejected or failed.');
    setConnected('');
  }
 }

 function disconnectCasperWallet(){
  const provider = getCasperProvider();
  try {
    if(provider && typeof provider.disconnectFromSite === 'function') provider.disconnectFromSite();
    if(provider && typeof provider.disconnect === 'function') provider.disconnect();
  } catch {}
  setConnected('');
  setWalletStatus('idle');
  setWalletMessage('Disconnected. Connect Casper Wallet to continue.');
 }

 useEffect(()=>{
  const provider = getCasperProvider();
  if(!provider) return;

  async function restore(){
    try {
      let isConnected = false;
      if(typeof provider.isConnected === 'function') isConnected = await provider.isConnected();
      if(!isConnected) return;

      let publicKey = '';
      if(typeof provider.getActivePublicKey === 'function') publicKey = await provider.getActivePublicKey();
      else if(typeof provider.getSelectedPublicKey === 'function') publicKey = await provider.getSelectedPublicKey();
      else if(typeof provider.getPublicKey === 'function') publicKey = await provider.getPublicKey();

      if(publicKey){
        const normalized = publicKey.trim();
        const whitelisted = wallets.find(w=>w.address.toLowerCase()===normalized.toLowerCase() && w.status==='ACTIVE');
        setConnected(normalized);
        if(whitelisted){
          setWalletStatus('connected');
          setWalletMessage(`Connected as ${whitelisted.name} — ${whitelisted.role}`);
        } else {
          setWalletStatus('not-whitelisted');
          setWalletMessage(`Wallet connected but not whitelisted: ${short(normalized)}`);
        }
      }
    } catch {}
  }

  restore();
 },[wallets]);

 async function uploadAndAnalyze(file:File){
  setUploadState('Uploading and extracting PDF text...');
  const form=new FormData(); form.append('file',file);
  try {
   const uploadRes=await fetch('/api/invoices/upload',{method:'POST',body:form});
   const uploadJson=await uploadRes.json();
   if(!uploadJson.ok) throw new Error(uploadJson.error||'Upload failed.');
   setUploadState(`Extracted ${uploadJson.pages} page(s). Running structured AI extraction...`);
   const aiRes=await fetch('/api/invoices/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:uploadJson.invoice.id})});
   const aiJson=await aiRes.json();
   if(!aiJson.ok) throw new Error(aiJson.error||'AI analysis failed.');
   setUploadedInvoices(xs=>[aiJson.invoice,...xs]);
   setUploadState(`Complete: ${aiJson.invoice.invoice_number} — risk ${aiJson.invoice.risk_score} (${aiJson.invoice.risk_decision}).`);
  } catch(err:any) { setUploadState(`Failed: ${err?.message||String(err)}`); }
 }
 function analyze(){ if(!can(current?.role,'approve')) return alert('Only Admin or Manager can run analysis.'); const ids=ready.map(i=>i.id); const total=ready.reduce((s,i)=>s+i.amount+i.tax,0); setInvoices(inv=>inv.map(x=>ids.includes(x.id)?{...x,status:'Ready to Pay'}:x)); setProposal({id:'PROP-'+Date.now().toString().slice(-6),status:'Draft',invoiceIds:ids,total,createdBy:current!.name,createdAt:new Date().toLocaleString()}); setAiLog([`Scanned ${invoices.length} synthetic invoices with deterministic rules.`,`${ids.length} invoices are safe to pay.`,`${review.length} invoices require manual review.`,`Recommended payment proposal total: ${money(total)}.`]); setTab('AI Analysis'); }
 function approve(){ if(!proposal) return; if(!can(current?.role,'approve')) return alert('Only Admin or Manager can approve.'); setProposal({...proposal,status:'Approved'}); setAiLog(x=>['Manager approved payment proposal.',...x]); }
 async function execute(){
  if(!proposal||proposal.status!=='Approved') return alert('Approve proposal first.');
  if(!can(current?.role,'approve')) return alert('Only Admin or Manager can execute payment.');
  if(!connected || !current) return alert('Connect a whitelisted Casper Wallet first.');

  const provider = getCasperProvider();
  if(!provider || typeof provider.sign !== 'function'){
    return alert('Casper Wallet provider.sign is not available.');
  }

  const network = process.env.NEXT_PUBLIC_CASPER_NETWORK || 'casper-test';
  const contractHash = process.env.NEXT_PUBLIC_CASPER_CONTRACT_HASH || '';

  const proposalId = proposal.id;
  const proofHash = `proof-${proposal.id}-${Date.now()}`;

  try {
    setAiLog(x=>[
      'Building Casper Testnet deploy for payment proof...',
      ...x
    ]);

    const buildRes = await fetch('/api/casper/build-record-proof-deploy', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        accountPublicKey: connected,
        proposalId,
        proofHash,
        entryPoint: 'record_payment_proof'
      })
    });

    const buildJson = await buildRes.json();

    if(!buildJson.ok){
      alert(`Cannot build Casper deploy: ${buildJson.error || 'Unknown error'}`);
      setAiLog(x=>[`Failed to build Casper deploy: ${buildJson.error || 'Unknown error'}`,...x]);
      return;
    }

    const unsignedDeploy = buildJson.deploy;

    if(unsignedDeploy?.header?.account?.toLowerCase?.() !== connected.toLowerCase()){
      alert('Deploy account does not match connected wallet.');
      return;
    }

    setAiLog(x=>[
      'Waiting for Casper Wallet signature...',
      `Unsigned deploy hash: ${unsignedDeploy.hash}`,
      ...x
    ]);

    const signed:any = await provider.sign(JSON.stringify(unsignedDeploy), connected);

    if(signed?.cancelled){
      setAiLog(x=>['Casper Wallet signing was cancelled.',...x]);
      return;
    }

    const rawSignatureHex = signed?.signatureHex || signed?.signature;
    if(!rawSignatureHex || typeof rawSignatureHex !== 'string'){
      alert('Wallet signed, but no signatureHex was returned.');
      return;
    }

    const keyTag = connected.slice(0, 2);
    const signatureHex =
      rawSignatureHex.startsWith('01') || rawSignatureHex.startsWith('02')
        ? rawSignatureHex
        : `${keyTag}${rawSignatureHex}`;

    const signedDeploy = {
      ...unsignedDeploy,
      approvals: [
        {
          signer: connected,
          signature: signatureHex,
        },
      ],
    };

    setAiLog(x=>[
      'Submitting signed deploy to Casper Testnet...',
      ...x
    ]);

    const putRes = await fetch('/api/casper/put-deploy', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({deploy:signedDeploy})
    });

    const putJson = await putRes.json();

    if(!putJson.ok){
      alert(`Submit failed: ${putJson.error || 'Unknown RPC error'}`);
      setAiLog(x=>[
        `Casper submit failed: ${JSON.stringify(putJson).slice(0, 500)}`,
        ...x
      ]);
      return;
    }

    const tx = putJson.deployHash || putJson?.rpc?.result?.deploy_hash || unsignedDeploy.hash;

    setProposal({...proposal,txHash:tx});
    setTxs(t=>[{
      hash:tx,
      type:'PaymentBatchProof',
      amount:proposal.total,
      by:current.name,
      time:new Date().toLocaleString(),
      network:`Casper Testnet (${network})`,
      status:'Confirming',
      blockHeight:'Pending',
      contractHash,
      proposalId,
      proofHash
    },...t]);
    setAiLog(x=>[
      `Payment proof submitted to Casper Testnet. Deploy hash: ${tx}`,
      `Contract: ${contractHash}`,
      `Proposal ID: ${proposalId}`,
      `Proof hash: ${proofHash}`,
      'Status: submitted. Waiting for on-chain execution confirmation.',
      ...x
    ]);
    let confirmed:any=null;
    for(let attempt=0;attempt<24;attempt++){
      const checkRes=await fetch('/api/casper/execution-result',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({deployHash:tx})});
      const check=await checkRes.json();
      if(check.ok&&!check.pending){confirmed=check;break;}
      await new Promise(resolve=>setTimeout(resolve,5000));
    }
    if(!confirmed) throw new Error('Deploy was submitted but confirmation timed out. Invoice status was not changed.');
    if(!confirmed.success) throw new Error(`On-chain execution failed: ${confirmed.errorMessage||'unknown error'}`);
    setProposal({...proposal,status:'Executed',txHash:tx});
    setInvoices(inv=>inv.map(x=>proposal.invoiceIds.includes(x.id)?{...x,status:'Paid'}:x));
    setTxs(items=>items.map(item=>item.hash===tx?{...item,status:'Confirmed',blockHeight:confirmed.blockHeight}:item));
    setAiLog(x=>[`On-chain execution confirmed at block ${confirmed.blockHeight}. Invoices marked Paid.`,...x]);
  } catch(err:any) {
    console.error(err);
    alert(err?.message || String(err));
    setAiLog(x=>[
      `Casper execution failed: ${err?.message || String(err)}`,
      ...x
    ]);
  }
 }
 function addWallet(){ if(!can(current?.role,'admin')) return; setWallets(w=>[...w,{id:'w'+Date.now(),name:'New Wallet',address:'paste-public-key-here',role:'EMPLOYEE',status:'ACTIVE',note:'Added by Admin'}]); }
 function updateWallet(id:string, patch:Partial<WalletUser>){setWallets(ws=>ws.map(w=>w.id===id?{...w,...patch}:w));}
 const shell=(children:any)=><>{locked?<div className="card notice"><b>Access locked.</b> Connect a whitelisted Casper Testnet wallet. Unknown wallets cannot view operational data.<br/><span className="muted">{walletMessage}</span></div>:children}</>;
 return <div className="app"><aside className="sidebar"><div className="brand"><div className="logo">CI</div><div><h1>Casper Invoice Agent</h1><p>AI AP + Escrow workflow</p></div></div><nav className="nav">{nav.map(([n,Icon])=><button key={n} className={tab===n?'active':''} onClick={()=>setTab(n)}><Icon size={18}/>{n}</button>)}</nav><div className="agent"><b>Ask AI Agent</b><p className="muted" style={{color:'#bfdbfe',fontSize:12}}>Always visible. Try: Pay invoices due this week.</p><input placeholder="Ask about invoices..." onKeyDown={e=>{if(e.key==='Enter'){setAiLog([`User asked: ${(e.target as HTMLInputElement).value}`,'Suggestion: run AI Analyze All to create a proposal.',...aiLog]);(e.target as HTMLInputElement).value='';setTab('AI Analysis')}}}/></div></aside><main className="main"><header className="top"><div><h2>{tab}</h2><p>Production-style MVP for Casper Agentic Buildathon.</p></div><div className="wallet"><Wallet size={20}/>
  {!connected && <button className="btn primary" onClick={connectCasperWallet} disabled={walletStatus==='connecting'}>{walletStatus==='connecting'?'Connecting...':'Connect Casper Wallet'}</button>}
  {connected && <><div><b>{current?current.role:'NOT WHITELISTED'}</b><div className="addr">{short(connected)}</div></div><button onClick={disconnectCasperWallet}>Disconnect</button></>}
</div></header>
 {tab==='Dashboard'&&shell(<div className="grid"><div className="grid cards"><Metric title="Total invoices" v={summary.total}/><Metric title="Pending" v={summary.pending}/><Metric title="Paid" v={summary.paid}/><Metric title="Need review" v={summary.alerts}/></div><div className="card"><h3>Casper Wallet Access</h3><p>Status: <b>{walletStatus}</b></p><p className="muted">{walletMessage}</p>{current&&<p>Whitelisted role: <b>{current.role}</b> — {current.name}</p>}
  
</div><div className="grid split"><div className="card"><div className="row"><h3>AI Payment Run</h3><div className="actions"><button className="btn primary" onClick={analyze} disabled={!can(current?.role,'approve')}>AI Analyze All</button><button className="btn green" onClick={approve} disabled={!proposal||proposal.status!=='Draft'||!can(current?.role,'approve')}>Approve Proposal</button><button className="btn primary" onClick={execute} disabled={!proposal||proposal.status!=='Approved'||!can(current?.role,'approve')}>Execute on Casper</button></div></div><p className="muted">AI scans invoices, detects risks, creates a payment proposal, then manager executes a Casper Testnet proof.</p><div className="ok">Ready to pay: <b>{ready.length}</b> invoices. Manual review: <b>{review.length}</b>. Total AP exposure: <b>{money(summary.amount)}</b>.</div></div><div className="card"><h3>Current Proposal</h3>{proposal?<div className="list"><b>{proposal.id}</b><span>Workflow status: {proposal.status}</span><span>Invoices: {proposal.invoiceIds.length}</span><span>Total: {money(proposal.total)}</span>{proposal.txHash&&<>
      <span>On-chain status: <b>Submitted / awaiting confirmation</b></span>
      <span>Deploy hash: {proposal.txHash}</span>
      <span>Block height: Pending</span>
      <span className="muted">Verification: check this deploy hash on Casper Testnet. A successful execution shows error_message: null.</span>
      <span>Contract: {process.env.NEXT_PUBLIC_CASPER_CONTRACT_HASH ? short(process.env.NEXT_PUBLIC_CASPER_CONTRACT_HASH) : 'V2 not deployed'}</span>
    </>}</div>:<p className="muted">No proposal yet. Run AI Analyze All.</p>}</div></div><InvoiceTable invoices={invoices.slice(0,8)}/></div>)}
 {tab==='Invoices'&&shell(<div className="grid"><div className="card row"><div><h3>Invoice Workspace</h3><p className="muted">Upload a PDF for server-side text extraction, schema-validated AI extraction, SQLite persistence and risk analysis.</p>{uploadState&&<p className="notice">{uploadState}</p>}</div><label className="btn gray"><Upload size={16}/> Upload Invoice<input type="file" accept="application/pdf" style={{display:'none'}} onChange={e=>{const f=e.target.files?.[0];if(f)uploadAndAnalyze(f);e.currentTarget.value=''}}/></label></div>{uploadedInvoices.length>0&&<div className="card"><h3>Uploaded & analyzed</h3><table className="table"><thead><tr><th>Invoice</th><th>Vendor</th><th>Amount</th><th>Confidence</th><th>Risk</th><th>Decision</th></tr></thead><tbody>{uploadedInvoices.map(i=><tr key={i.id}><td>{i.invoice_number}</td><td>{i.vendor}</td><td>{i.currency} {i.amount}</td><td>{i.confidence}</td><td>{i.risk_score}</td><td>{i.risk_decision}</td></tr>)}</tbody></table></div>}<InvoiceTable invoices={invoices}/></div>)}
 {tab==='Vendors'&&shell(<div className="card"><h3>Vendor Profiles</h3><table className="table"><thead><tr><th>Vendor</th><th>Category</th><th>Risk</th><th>Invoices</th><th>Total</th><th>Avg Pay Days</th></tr></thead><tbody>{seedVendors.map(v=><tr key={v.id}><td><b>{v.name}</b></td><td>{v.category}</td><td>{v.risk}</td><td>{v.invoices}</td><td>{money(v.total)}</td><td>{v.avgPayDays}</td></tr>)}</tbody></table></div>)}
 {tab==='AI Analysis'&&shell(<div className="grid split"><div className="card"><h3>AI Agent Findings</h3><div className="list">{aiLog.map((l,i)=><div key={i} className={i===0?'ok':'notice'}>{l}</div>)}</div></div><div className="card"><h3>Risk Queue</h3><div className="list">{review.slice(0,10).map(i=><div key={i.id} className="notice"><b>{i.id}</b> — {i.vendor}<br/><span>{i.status}: {i.note}</span></div>)}</div></div></div>)}
 {tab==='Payments & Escrow'&&shell(<div className="grid split"><div className="card"><h3>Payment Proposal</h3>{proposal?<div className="list"><p><b>{proposal.id}</b> generated by {proposal.createdBy}</p><p>Status: <b>{proposal.status}</b></p><p>Invoices: <b>{proposal.invoiceIds.length}</b></p><p>Total with tax: <b>{money(proposal.total)}</b></p><div className="actions"><button className="btn green" onClick={approve} disabled={proposal.status!=='Draft'||!can(current?.role,'approve')}>Approve</button><button className="btn primary" onClick={execute} disabled={proposal.status!=='Approved'||!can(current?.role,'approve')}>Execute Casper Payment Proof</button></div></div>:<p className="muted">Run AI analysis to create a proposal.</p>}</div><div className="card"><h3>Permission</h3><p>Current role: <b>{current?.role}</b></p><p className="muted">Employee can view/upload only. Manager can approve and execute. Admin can manage wallets.</p></div></div>)}
 {tab==='Transactions'&&shell(<div className="card"><h3>Audit Transactions</h3>{txs.length===0?<p className="muted">No transaction yet. Execute a payment proposal.</p>:<table className="table"><thead><tr><th>Hash</th><th>Type</th><th>Amount</th><th>By</th><th>Network</th><th>Status</th><th>Block</th><th>Time</th></tr></thead><tbody>{txs.map(t=><tr key={t.hash}><td>{t.hash}</td><td>{t.type}</td><td>{money(t.amount)}</td><td>{t.by}</td><td>{t.network}</td><td><span className="badge b-Paid">{t.status || 'Confirmed'}</span></td><td>{t.blockHeight || '-'}</td><td>{t.time}</td></tr>)}</tbody></table>}</div>)}
 {tab==='Reports'&&shell(<div className="grid cards"><Metric title="AP total" v={money(summary.amount)}/><Metric title="AI review items" v={review.length}/><Metric title="Vendors" v={seedVendors.length}/><Metric title="Payment batches" v={txs.length}/><div className="card" style={{gridColumn:'1/-1'}}><h3>Audit Timeline</h3><div className="timeline"><div>Invoice Uploaded</div><div>AI Extracted</div><div>Risk Scored</div><div>Manager Approved</div><div>Casper Payment Proof</div><div>Paid</div></div></div></div>)}
 {tab==='Settings'&&shell(<div className="grid"><div className="card row"><div><h3>Wallet Management</h3><p className="muted">Only Admin can add, edit, disable, or delete wallets.</p></div><button className="btn primary" onClick={addWallet} disabled={!can(current?.role,'admin')}><Plus size={16}/> Add Wallet</button></div><div className="card"><table className="table"><thead><tr><th>Name</th><th>Address</th><th>Role</th><th>Status</th><th>Note</th><th>Action</th></tr></thead><tbody>{wallets.map(w=><tr key={w.id}><td><input className="input" value={w.name} disabled={!can(current?.role,'admin')} onChange={e=>updateWallet(w.id,{name:e.target.value})}/></td><td><input className="input" value={w.address} disabled={!can(current?.role,'admin')} onChange={e=>updateWallet(w.id,{address:e.target.value})}/></td><td><select className="input" value={w.role} disabled={!can(current?.role,'admin')} onChange={e=>updateWallet(w.id,{role:e.target.value as Role})}><option>ADMIN</option><option>MANAGER</option><option>EMPLOYEE</option></select></td><td><select className="input" value={w.status} disabled={!can(current?.role,'admin')} onChange={e=>updateWallet(w.id,{status:e.target.value as any})}><option>ACTIVE</option><option>DISABLED</option></select></td><td><input className="input" value={w.note} disabled={!can(current?.role,'admin')} onChange={e=>updateWallet(w.id,{note:e.target.value})}/></td><td><button className="btn red" disabled={!can(current?.role,'admin')} onClick={()=>setWallets(ws=>ws.filter(x=>x.id!==w.id))}><Trash2 size={16}/></button></td></tr>)}</tbody></table></div></div>)}
 </main></div>;
}
function Metric({title,v}:{title:string;v:any}){return <div className="card"><div className="muted">{title}</div><div className="metric">{v}</div></div>}
function InvoiceTable({invoices}:{invoices:Invoice[]}){return <div className="card"><h3>Invoices</h3><table className="table"><thead><tr><th>Invoice</th><th>Vendor</th><th>Amount</th><th>Tax</th><th>Due Date</th><th>Status</th><th>Risk</th><th>PDF</th></tr></thead><tbody>{invoices.map(i=><tr key={i.id}><td><b>{i.id}</b></td><td>{i.vendor}</td><td>{money(i.amount)}</td><td>{money(i.tax)}</td><td>{i.dueDate}</td><td><span className={'badge b-'+i.status.split(' ')[0]}>{i.status}</span></td><td>{i.risk}</td><td><a className="btn gray" href={i.pdf} target="_blank"><Eye size={14}/> View</a></td></tr>)}</tbody></table></div>}
