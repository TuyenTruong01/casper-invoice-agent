export type Role = 'ADMIN' | 'MANAGER' | 'EMPLOYEE';
export type WalletStatus = 'ACTIVE' | 'DISABLED';
export type InvoiceStatus = 'Pending' | 'Ready to Pay' | 'Paid' | 'Overdue' | 'Duplicate' | 'Amount Mismatch' | 'Need Review';
export type WalletUser = { id:string; name:string; address:string; role:Role; status:WalletStatus; note:string };
export type Vendor = { id:string; name:string; category:string; risk:'Low'|'Medium'|'High'; total:number; invoices:number; avgPayDays:number };
export type Invoice = { id:string; vendor:string; category:string; amount:number; tax:number; issueDate:string; dueDate:string; status:InvoiceStatus; risk:number; pdf:string; extracted:boolean; duplicateOf?:string; note:string };

export const initialWallets: WalletUser[] = [
 { id:'w1', name:'Tuyen Admin', address:'020290622992011fd65e6fece166b275c8414bd0983f3542635c4c09916d5bca8bf8', role:'ADMIN', status:'ACTIVE', note:'Project owner and whitelist administrator' },
 { id:'w2', name:'Demo Manager', address:'02021b723610797a778fb372b610ca70ce2a7ec675bf5e631920c4b155ed96a71942', role:'MANAGER', status:'ACTIVE', note:'Approves proposals and executes payment batches' },
 { id:'w3', name:'Demo Employee', address:'02020a4ddd31f32b08d607f8013ec80bca8ecf73090fa163eab9c93da2d099ca264e', role:'EMPLOYEE', status:'ACTIVE', note:'Uploads and reviews invoices only' },
 { id:'w4', name:'Judge Demo', address:'0202429fc3d574475d62bebf3e66e85fc88e251c8884608173bf766f77acdd518c04', role:'MANAGER', status:'ACTIVE', note:'Demo wallet for judges' }
];

const vendorNames = ['Dell Technologies','Microsoft','Amazon Web Services','Google Cloud','Cisco','Oracle','Adobe','Lenovo','FedEx','Office Depot','Nvidia','Samsung','HP Enterprise','Atlassian','Zoom','Cloudflare','Notion','Figma','Datadog','Stripe'];
const cats = ['Hardware','SaaS','Cloud','Network','Logistics','Office','Security','Design'];
export const invoices: Invoice[] = Array.from({length:50}).map((_,i)=>{
 const n=i+1; const vendor=vendorNames[i%vendorNames.length]; const amount=[1250,860,540,6800,18000,300,2400,1120,765,950,14500,3300,2700,420,610,1900][i%16]+(i*37)%700;
 let status:InvoiceStatus='Pending'; let risk=12+(i*7)%35; let note='Normal vendor invoice extracted from PDF.'; let duplicateOf: string|undefined;
 if([6,18,37,44].includes(n)){status='Overdue'; risk=55; note='Due date has passed and requires priority review.'}
 if([11,22,33].includes(n)){status='Duplicate'; risk=82; duplicateOf=`INV-2026-${String(n-1).padStart(3,'0')}`; note='Potential duplicate invoice number or amount pattern detected.'}
 if([14,41].includes(n)){status='Amount Mismatch'; risk=75; note='Line item total does not match invoice grand total.'}
 if([29].includes(n)){status='Need Review'; risk=91; note='Suspicious payment destination / missing vendor reference.'}
 if([3,9,15,25,36,49].includes(n)){status='Paid'; risk=8; note='Already paid before this payment run.'}
 return { id:`INV-2026-${String(n).padStart(3,'0')}`, vendor, category:cats[i%cats.length], amount, tax:Math.round(amount*0.1), issueDate:`2026-06-${String((i%24)+1).padStart(2,'0')}`, dueDate:`2026-07-${String((i%14)+1).padStart(2,'0')}`, status, risk, pdf:`/invoices/INV-2026-${String(n).padStart(3,'0')}.pdf`, extracted:n%5!==0, duplicateOf, note };
});

export const vendors: Vendor[] = vendorNames.map((name,i)=>({ id:`V-${String(i+1).padStart(3,'0')}`, name, category:cats[i%cats.length], risk: i%9===0?'Medium':'Low', total: invoices.filter(x=>x.vendor===name).reduce((s,x)=>s+x.amount,0), invoices: invoices.filter(x=>x.vendor===name).length, avgPayDays: 8+(i%12) }));
