# TECHNICAL AUDIT REPORT — casper-invoice-agent-v5

> **Superseded implementation snapshot:** Báo cáo bên dưới mô tả code trước đợt nâng cấp ngày 2026-07-21. Sau audit, dự án đã được bổ sung upload/PDF extraction, Gemini structured output, Risk Agent, SQLite, execution polling, contract approval state và test. Cần chạy audit lại trước khi dùng báo cáo này làm mô tả trạng thái hiện tại.

**Thời điểm kiểm tra:** 2026-07-21 (Asia/Saigon)  
**Phạm vi:** toàn bộ 84 file được Git theo dõi, source frontend/API/contract/scripts, 50 PDF, README và proof; chạy local/build/test; truy vấn Casper Testnet chỉ-đọc.  
**Nguyên tắc:** không sửa source, không ký, không gửi deploy/giao dịch mới, không hiển thị secret. Working tree sạch trước audit; chỉ file báo cáo này được tạo sau audit.

## A. Executive summary

Dự án là một **Next.js client-side demo với dữ liệu synthetic**, có kết nối Casper Wallet và một **smart contract Rust thật đã deploy trên Casper Testnet để ghi/đọc payment proof**. Build frontend thành công; API local tạo unsigned deploy thành công; bốn deploy hash trong tài liệu đều tồn tại và execution thành công trên `casper-test`.

Dự án **không có AI/LLM thật, không upload hoặc đọc PDF trong ứng dụng, không OCR/extraction, không anomaly/duplicate detection runtime, không database, không backend authentication, không escrow và không chuyển tiền CSPR/token**. “AI Agent” là một hàm đồng bộ lọc dữ liệu seed theo risk/status có sẵn. Contract chỉ lưu một chuỗi audit theo `proposal_id`; mọi entry point đều public, không kiểm tra role/whitelist/approval/duplicate/double-payment. Các deploy proof thật có `transfers: []`; phí gas không phải khoản thanh toán vendor.

Phân loại kiến trúc chính xác: **UI mô phỏng Agent / single deterministic client workflow**, không phải multi-Agent và cũng không phải AI workflow thực.

## 1. Tổng quan repository

```text
casper-invoice-agent-v5/
├─ app/
│  ├─ page.tsx                         # toàn bộ UI + state + workflow
│  ├─ layout.tsx, styles.css
│  └─ api/casper/
│     ├─ build-record-proof-deploy/route.ts
│     └─ put-deploy/route.ts
├─ contract/invoice-payment-proof/
│  ├─ contract/src/main.rs             # Casper Rust contract
│  ├─ contract/Cargo.toml, Cargo.lock, rust-toolchain
│  ├─ tests/src/integration_tests.rs
│  └─ Makefile
├─ data/seed.ts                         # 50 invoice + vendor + wallet mock
├─ public/invoices/*.pdf                # 50 synthetic text PDFs
├─ scripts/*.cjs                        # Casper SDK/debug/deploy helpers
├─ README.md, CASPER_TESTNET_PROOF.md
├─ package.json, package-lock.json
└─ .env.local                           # ignored, không tracked
```

- **Frontend/backend:** Next.js 16.2.9 App Router, React 19.2.7, TypeScript 6.0.3. “Backend” chỉ gồm hai Next route handlers; không có business service/database.
- **Package quan trọng:** `casper-js-sdk@5.0.12`, `next@16.2.9`, `react@19.2.7`, `lucide-react@1.22.0`; contract dùng `casper-contract 5.1.1`, `casper-types 6.0.1`; test dùng Casper engine test support 8.1.1.
- **Entry points:** `app/page.tsx:19` (UI), `app/api/casper/build-record-proof-deploy/route.ts:30` (tạo deploy), `app/api/casper/put-deploy/route.ts:7` (relay RPC), `contract/.../main.rs:56,82,96` (record/get/install), scripts `deploy-casper-contract.cjs` và `build-record-proof-deploy.cjs`.
- **Biến môi trường runtime thực sự được code dùng:** `NEXT_PUBLIC_CASPER_NETWORK`, `NEXT_PUBLIC_CASPER_NODE_ADDRESS`, `NEXT_PUBLIC_CASPER_CONTRACT_HASH`, `NEXT_PUBLIC_CASPER_NAMED_KEY` (`app/page.tsx:310-311`, routes lines 15-18 và 3-5). Các biến `VITE_*`, package/deploy/proof hashes trong `.env.local` chủ yếu là metadata/legacy và không được flow hiện tại đọc. Deploy scripts còn nhận `CASPER_NODE_ADDRESS`, `CASPER_CHAIN_NAME`, `CASPER_SECRET_KEY_PATH`, `CASPER_WASM_PATH`, `CASPER_SEND` (`scripts/deploy-casper-contract.cjs:27-48`).
- **Hoàn thành có kiểm chứng:** render/role-gated demo UI; 50 PDF public; tạo proposal deterministic trong memory; Casper Wallet integration code; unsigned deploy builder; RPC relay; contract proof store/get; deployment/proof executions Testnet thật.
- **Mock/chưa kết nối:** invoice upload, PDF extraction, AI, risk/fraud/duplicate rules, vendor profiles/history, payment, escrow, transaction confirmation/history, persistence, audit timeline.

## B. Verified working features

1. `npm install`: PASS (`up to date`).
2. `npm run build`: PASS; Next sinh `/`, hai dynamic Casper API routes và chạy TypeScript thành công.
3. App local tại `http://localhost:3100`: PASS; UI render màn hình khóa và nút Casper Wallet.
4. 50 PDF synthetic tồn tại, tổng 98,878 bytes, đều có SHA-256 khác nhau. `pdftotext` đọc được invoice mẫu gồm invoice no, vendor, issue/due date, subtotal/tax/total. Đây là đặc tính file, **không phải extraction của app**.
5. `POST /api/casper/build-record-proof-deploy`: PASS với input audit; trả JSON `ok:true`, unsigned deploy `casper-test`, đúng account, `approvals:0`; hash local `98846f...ad9d` chỉ là unsigned dry-run và không được gửi.
6. Validation tối thiểu: builder trả HTTP 400 khi thiếu account; put route trả HTTP 400 khi thiếu deploy (`route.ts:43-47`; `put-deploy/route.ts:12-16`).
7. Contract Testnet và ba proof calls được RPC xác minh thành công, chi tiết ở mục F.

## C. Partially implemented features

- **Wallet connection/signing:** provider discovery/connect/sign có code (`app/page.tsx:38-141,198-296,300-405`) và một deploy lịch sử chứng minh browser signing. Audit hiện tại không thể ký lại vì không có extension/signer trong browser audit.
- **Role UI:** `can()` phân vai Admin/Manager/Employee ở client (`app/page.tsx:18`); button/action kiểm tra role, nhưng không phải backend/contract authorization.
- **Proposal/approval:** chạy trong React state (`app/page.tsx:298-299`); restart/reload mất dữ liệu.
- **Execution:** tạo, ký và submit proof deploy; sau RPC acceptance lập tức đánh dấu proposal Executed/invoice Paid (`app/page.tsx:408-430`) nhưng không poll execution, không đọc contract state, không chuyển tiền.
- **Contract tests:** có 2 test nhưng là template “hello world”, không khớp contract invoice; cả 2 fail trong môi trường audit.

## D. Mock or hard-coded features

- 50 invoices, 20 vendors, bốn wallet/role đều hard-code/generate trong `data/seed.ts:8-28`.
- Risk score/status/duplicate flags hard-code theo index (`seed.ts:18-25`); note “extracted from PDF” không phải kết quả extraction.
- “AI Analyze All” chỉ chọn `Pending|Overdue` và `risk < 60`, cộng amount+tax, đổi state và ghi log (`app/page.tsx:35-37,298`). Không có model/prompt/API/confidence/JSON parser.
- “Ask AI Agent” chỉ echo câu hỏi và thêm suggestion cố định (`app/page.tsx:445`).
- Reports/audit timeline/transactions lấy React state và seed (`app/page.tsx:462-463`).
- Nút “Upload Invoice” không có handler/input (`app/page.tsx:458`).
- Tên “Payments & Escrow” chỉ là UI; flow gọi `record_payment_proof`, không có escrow/payment.

## E. Missing critical features

- Upload endpoint/storage/MIME-size validation/path sanitization.
- PDF parser/OCR, AI provider/model/prompt/schema validation/confidence/fallback.
- Vendor wallet field, currency, recipient extraction và lịch sử/baseline thật.
- Duplicate by invoice number/file hash, anomaly detection và payment limit runtime.
- Server-side identity/session, signature challenge verification, RBAC và whitelist persistence.
- Database/audit ledger bền vững và invoice→approval→payment trace.
- Contract approval/payment/escrow/access control/idempotency/events.
- Execution-result polling, on-chain state readback và reconciliation trước khi đánh dấu Paid.
- Unit/API/E2E tests phù hợp sản phẩm.

## 2–3. AI extraction, duplicate và anomaly evidence

### AI/PDF

| Câu hỏi | Kết luận | Bằng chứng |
|---|---|---|
| PDF upload/lưu ở đâu? | Không có upload. 50 file build-time ở `public/invoices`. | `seed.ts:25`, `page.tsx:458` |
| App đọc PDF? OCR/text extraction? | Không. PDF có text layer nhưng app chỉ mở link. | `page.tsx:468`; không có package/parser/API upload |
| API AI/LLM/model/prompt? | Không có. | `package.json`; toàn bộ `app/`; `analyze()` line 298 |
| Structured JSON/confidence/fallback? | Không có. | Không có schema/parser/call; `analyze()` không async |
| Trường extraction | Chỉ seed có invoice ID, vendor, issue/due date, amount; không có currency/recipient wallet. | `seed.ts:6,17-25` |
| Risk decision | Hard-code; không có `APPROVE/ESCALATE/BLOCK`. UI dùng threshold `<60` và trạng thái. | `seed.ts:19-24`, `page.tsx:35-36,298` |
| AI lỗi | Không áp dụng; không có AI call. | `analyze()` line 298 |

Sample file thật: `INV-2026-001.pdf` chứa `Invoice No: INV-2026-001`, `Vendor: Dell Technologies`, issue `2026-06-01`, due `2026-07-01`, total `$1,375.00`. Sample “structured output” mà UI dùng là object seed `{id, vendor, category, amount, tax, issueDate, dueDate, status, risk, pdf, extracted, note}`, không phải output AI.

### Duplicate/anomaly matrix

| Chức năng | Trạng thái | Bằng chứng |
|---|---|---|
| Invoice number trùng | Chỉ mock/hard-code | index 11/22/33 gắn `Duplicate`; không so sánh (`seed.ts:21`) |
| PDF hash trùng | Chưa có | app không hash; audit độc lập thấy 50/50 hash unique |
| Vendor trùng | Chưa có detection | tên lặp theo modulo chỉ để sinh seed (`seed.ts:15-18`) |
| So amount với lịch sử/baseline | Chưa có | không DB/history/statistics |
| Amount anomaly | Chỉ mock/hard-code | `Amount Mismatch` theo index (`seed.ts:22`) |
| Recipient wallet mismatch | Chỉ mock note | index 29 có note; model không có recipient (`seed.ts:23`) |
| Payment limit | Chưa có | không threshold/limit business |
| Required fields | Chưa có | không validation invoice |
| Đã thanh toán trước | Chỉ mock/hard-code | sáu index gắn `Paid` (`seed.ts:24`) |

Không mục nào trong bảng là detection “đã chạy thật”.

## 4. Hệ thống Agent

**Số agent thực sự: 0.** Nhãn duy nhất là “AI Agent” trong UI/state `aiLog` (`app/page.tsx:32,445,460`). Input nút/ô text; output log/suggestion; không LLM riêng, không memory/state ngoài React, không tool/action autonomy, không message protocol hay agent-to-agent communication. `analyze()` là một bước deterministic; approve và execute do người dùng bấm. Kết luận: **UI mô phỏng Agent + single client workflow**, không multi-step AI workflow và không multi-Agent thật.

## F. Casper evidence

- **Source:** Rust Casper contract thật, không Odra (`contract/.../main.rs`; Casper crates trong Cargo.toml).
- **WASM:** artifact local `contract/target/wasm32-unknown-unknown/release/contract.wasm`, 69,145 bytes, timestamp 2026-06-30. Build lại trong audit **FAIL** trên stable Rust 1.96 (`E0554`; project yêu cầu `nightly-2025-03-01` nhưng toolchain đang active stable).
- **Network:** `casper-test`; RPC `https://node.testnet.casper.network/rpc`.
- **Contract hash:** `contract-4e2f1bbc04fdb44e2654b014124d21b48457330b9e9031813fa6b8e1608bc991`.
- **Package hash:** `contract-package-36e343e0079db3d7d49b13913b78a07ddde0459ed2c0ba1b99d75826ad0edd5b`.
- **Entry points:** `record_payment_proof` và `get_payment_proof` public (`main.rs:108-130`). `call` chỉ là install session.

| Deploy | Block | Entry point | RPC execution | Cost (motes) | Transfers |
|---|---:|---|---|---:|---:|
| `1864ad...2eef` contract install | 8,347,564 | module bytes | `error_message: null` | 100,000,000,000 | 0 |
| `672f3c...af91` CLI record | 8,347,679 | `record_payment_proof` | `error_message: null` | 20,000,000,000 | 0 |
| `32cd10...4175` CLI get | 8,347,716 | `get_payment_proof` | `error_message: null` | 10,000,000,000 | 0 |
| `9df3e0...1e07` browser record | 8,348,729 | `record_payment_proof` | `error_message: null` | 20,000,000,000 | 0 |

Explorer links (text):

- `https://testnet.cspr.live/deploy/1864adf9f8a6079b1f1aa64666df21d05ed4afe151777b9d4db31ca22f922eef`
- `https://testnet.cspr.live/deploy/672f3c4b462a0f7ba85a8fad193429a2034fe581dba56bff60aa10f96196af91`
- `https://testnet.cspr.live/deploy/32cd10f76d60833071dcf7f464fed1261a79306965a624f76eb673e195c24175`
- `https://testnet.cspr.live/deploy/9df3e0e174023ab3afbc7b3ca7e528887f25c334c346be1d5437594aded21e07`

API tạo deploy: `/api/casper/build-record-proof-deploy` (`route.ts:30-89`). API gửi deploy: `/api/casper/put-deploy`, relay `account_put_deploy` (`route.ts:7-71`). **Không có API kiểm tra execution result**. Frontend gọi cả hai (`page.tsx:322-405`), nhưng không poll/readback. Contract lưu chuỗi `proposal_id, proof_hash, invoice_count, total_amount, approver, executor, created_at` trong dictionary (`main.rs:56-76`). Invoice/PDF/status/proposal/tx list chỉ ở seed/React state. App chỉ lưu RPC/deploy hash vào state và tự đánh dấu Paid; không đọc contract state (`page.tsx:408-430`).

## 6. Smart contract checklist

| Khả năng | Trạng thái thực |
|---|---|
| Tạo/lưu invoice/payment proof hash | Có một phần: caller tự truyền proof string; lưu record theo proposal ID |
| Chống duplicate invoice/proof | Không; cùng proposal ID có thể overwrite dictionary |
| Approve / Reject invoice | Không |
| Record payment | Không; chỉ record **proof claim**, không kiểm chứng transfer |
| Chống record payment hai lần | Không |
| Employee/Manager/Admin / whitelist | Không; entry points public |
| Không payment trước approval | Không có payment/approval state |
| Không sửa sau approval | Không; record có thể overwrite |
| Lưu approver | Có chuỗi caller cung cấp, không cryptographically bound với signer |
| Lưu payment deploy hash | Không |
| Emit event | Không |

## 7. Payment và escrow

- **Không chuyển CSPR/token tới vendor.** RPC cho thấy `transfers: []` ở cả bốn deploy. Account signer chịu gas; cost không phải invoice payment.
- Browser historical signer là Manager public key `02021b...a71942` (proof doc line 34 và RPC). Không có recipient vendor; số “totalAmount” lấy proposal seed (`page.tsx:329-331`) rồi chỉ lưu metadata.
- Manager ký proof deploy qua wallet provider (`page.tsx:357-384`). Server runtime không giữ private key; helper CLI đọc PEM theo đường dẫn env (`deploy-casper-contract.cjs:33,65-69`) nhưng `.env.local/keys/*.pem` không tracked.
- Không escrow contract, fund/release, balance custody hay transfer purse. Nút “Execute Casper Payment Proof” chạy build → wallet sign → put-deploy (`page.tsx:300-430`).
- Transaction history là React `txs`, không từ chain (`page.tsx:31,412-424,462`). Nó hiển thị amount như “PaymentBatchProof” dù chain chỉ ghi proof.

## G. AI evidence

- **Model:** không có.
- **API call:** không có AI API.
- **Prompt file:** không có.
- **Sample input:** mảng `seedInvoices` từ `data/seed.ts`.
- **Sample output:** proposal React `{id,status:'Draft',invoiceIds,total,createdBy,createdAt}` (`page.tsx:14,298`).
- **Fallback:** không áp dụng; không có call. UI suggestion cố định khi nhấn Enter (`page.tsx:445`).

## H. End-to-end test result

| Bước | Trạng thái | Bằng chứng / điểm dừng |
|---:|---|---|
| 1. Khởi động local | PASS | Next dev ready, UI render tại port 3100 |
| 2. Upload PDF | FAIL | nút không handler/input/API (`page.tsx:458`) |
| 3. Phân tích PDF | FAIL | không parser/OCR/LLM; dùng seed |
| 4. Extraction | FAIL | không extraction runtime |
| 5. Risk decision | PARTIAL | UI lọc risk seed hard-code (`page.tsx:35-36,298`) |
| 6. Payment proposal | PARTIAL | có React proposal nhưng cần whitelisted client wallet; không persist |
| 7. Manager approve | PARTIAL | client state/role only; audit browser thiếu Casper Wallet |
| 8. Tạo Casper deploy | PASS | API local tạo unsigned deploy hợp lệ; không gửi |
| 9. Gửi/kiểm tra deploy có sẵn | PARTIAL | không gửi mới; bốn historical deploy được RPC xác minh |
| 10. Execution result | PASS cho hash lịch sử | RPC `error_message:null`; app không có checker |
| 11. UI proof | PARTIAL | code hiển thị submitted hash/Pending; không xác nhận execution/block |

Luồng UI audit dừng ở wallet gate: browser không có Casper Wallet extension/whitelisted signer. Điều kiện thiếu là extension, quyền kết nối và private signing key; theo phạm vi audit không được giả lập/ký/gửi deploy.

## 11. Test/build results

| Lệnh | Kết quả |
|---|---|
| `npm install` | PASS, up to date |
| `npm run lint` | FAIL: Next 16 hiểu `next lint` thành project directory `.../lint`; script lỗi thời |
| `npm run build` | PASS, compile + TypeScript + static generation |
| `npm test` | FAIL: missing script `test` |
| `cargo build --release --target wasm32-unknown-unknown ...` | FAIL: stable toolchain, dependency cần nightly (`E0554`) |
| `cargo test --manifest-path .../tests/Cargo.toml` | FAIL: 0 pass, 2 fail |

Hai contract tests là template hello-world (`tests/.../integration_tests.rs:16-101`), không test entry points hiện tại; một fail LMDB environment code 112, một fail thiếu expected Wasm path. Không có frontend unit test, API test hay E2E test. Tổng test được khai báo: **2 contract-template tests; 0 pass, 2 fail**. Thiếu test upload/extraction/risk/RBAC, deploy validation, contract record/get/overwrite/access control, execution reconciliation và double-payment.

## 12. README/documentation claims

| Claim | Đánh giá |
|---|---|
| 50 synthetic PDFs | Đúng hoàn toàn |
| Whitelisted keys / roles | Đúng một phần: client seed/UI only |
| AI analysis mock | Đúng hoàn toàn; README trung thực gọi là mock |
| Manager approval | Đúng một phần: client state only |
| Payment proof mock transaction log | Đã lỗi thời một phần: hiện có proof on-chain thật, nhưng log/payment vẫn local và không phải payment |
| Replace mock proof with real calls (Next step) | Đã lỗi thời: record proof call đã có; payment vẫn chưa có |
| `AI-powered`, “AI Agent” | Mô tả mạnh hơn thực tế: không AI |
| Escrow/payment | Mô tả mạnh hơn thực tế: chỉ proof record |
| On-chain/smart contract/verified | Đúng với proof storage/deploy, không đúng nếu hiểu là invoice payment/approval on-chain |
| Fraud/duplicate/real-time/autonomous | Chưa được chứng minh hoặc không có |

## I. Security findings

### Critical

- **Không có Critical theo nghĩa mất tiền hiện tại**, vì app/contract không thực hiện payment/custody. Nếu quảng bá/triển khai như payment system thì việc đánh dấu Paid ngay khi RPC nhận deploy sẽ trở thành lỗi nghiệp vụ nghiêm trọng.

### High

1. **Authorization chỉ ở client:** whitelist/role là mutable React state; API builder/relay không auth, contract entry points public (`page.tsx:18,21,33`; both routes; `main.rs:120,128`). Bất kỳ caller nào cũng có thể ghi proof/giả approver string.
2. **Proof overwrite/replay:** dictionary key là caller-controlled `proposal_id`; không existence check/idempotency (`main.rs:76`). Có thể ghi lại cùng ID.
3. **False Paid/double-payment risk:** app đánh dấu Paid sau `account_put_deploy` acceptance, trước execution confirmation (`page.tsx:408-430`); không reconcile và state mất khi reload.

### Medium

1. Put-deploy route là unauthenticated public RPC relay, không schema/size/rate/network/account policy (`put-deploy/route.ts:7-71`).
2. Builder chỉ yêu cầu public key; proposal/amount/approver không validate bounds/semantics (`build.../route.ts:34-59`). AI output validation không tồn tại.
3. Contract approver/executor là untrusted strings, không gắn signer (`main.rs:57-76`).
4. Không execution-result API/on-chain readback/audit persistence.
5. Upload security (MIME/size/path traversal) chưa được triển khai; do đó chưa có bề mặt upload hiện tại nhưng bắt buộc xử lý trước khi thêm upload.

### Low

1. Public wallet addresses hard-code (không phải private secrets) và UI logs có thể lộ metadata deploy/signature preview (`page.tsx:88,131`).
2. `.env.local` bị ignore và không tracked; scan filename/history không thấy `.env.local`, PEM hay keys từng commit. Scan này không phải chứng minh tuyệt đối cho mọi loại secret; không hiển thị giá trị env.
3. `NEXT_PUBLIC_*` là client-exposed theo thiết kế; không đặt secret vào nhóm này.

## 9. Dữ liệu và tính bền vững

- Data source: TypeScript seed + static PDFs; runtime state ở React memory (`page.tsx:20-32`). Không database, server store hay localStorage.
- Reload/restart mất wallets edits, proposal, approval, transaction list và invoice status runtime; seed quay về mặc định.
- Vendor “history” chỉ là aggregate tính từ seed (`seed.ts:28`); không time-series/baseline.
- Audit log chỉ là UI arrays/timeline; không bền vững.
- Không thể truy ngược đáng tin cậy invoice→approval→payment. On-chain proof chứa proposal metadata nhưng không chứa invoice IDs, approval signature, recipient hoặc payment transfer hash.

## J. Hackathon scoring estimate

| Tiêu chí | /10 | Nhận xét ngắn |
|---|---:|---|
| Problem and usefulness | 7.0 | AP fraud/payment là bài toán tốt |
| Product idea | 7.0 | Workflow dễ hiểu, demo-oriented |
| AI/Agent quality | 1.0 | không AI/agent thật |
| Casper integration | 6.0 | wallet + deploy builder + contract proof thật |
| Smart contract quality | 3.0 | rất nhỏ, public, overwrite, không payment rules |
| On-chain evidence | 8.0 | hash và execution Testnet xác minh được |
| End-to-end completeness | 3.0 | proof path có; invoice→AI→payment không thật |
| Security | 3.0 | client-only RBAC, unauthenticated APIs/contract |
| UI/UX | 6.5 | dashboard rõ, nhưng nhiều control mô phỏng |
| Documentation | 5.5 | README khá trung thực về mock nhưng thiếu trạng thái proof mới |
| Demo readiness | 5.0 | build được; phụ thuộc wallet; lint/tests fail |

**Trung bình ước tính: 5.0/10.** Điểm có thể cao hơn nếu judging ưu tiên proof Testnet/UI, thấp hơn nếu tiêu chí bắt buộc AI agent/payment thật.

## K. Recommended fixes

### Must fix before submission

1. Sửa toàn bộ wording: gọi chính xác “on-chain payment proof”, không “payment/escrow”; gọi risk dataset là mock; không claim AI/multi-Agent/autonomous.
2. Thêm execution polling/readback; chỉ đổi Paid sau success và lưu trạng thái bền vững.
3. Hoặc tích hợp AI extraction thật có schema/confidence/fallback, hoặc đổi demo thành deterministic rule engine rõ ràng.
4. Backend authentication + wallet challenge signature; RBAC/whitelist server-side và contract access control.
5. Chống overwrite/replay/idempotency trong contract; bind signer/approver; lưu invoice/proposal hash canonical.
6. Sửa lint command, thêm test script; pin/chạy đúng nightly toolchain; thay template contract tests bằng tests hiện tại.
7. Cập nhật README/proof với explorer links và ghi rõ `transfers: []`.

### High-impact improvements

1. Upload API an toàn, PDF text extraction/OCR, JSON schema cho invoice và recipient/currency.
2. Database cho invoices/vendors/proposals/approvals/executions/audit; unique constraints cho invoice number và file hash.
3. Rule engine có evidence: required fields, duplicate hash/number, vendor wallet match, historical amount baseline, limit và paid-before checks.
4. Nếu mục tiêu là payment: thiết kế transfer/escrow contract thật, approval state machine, recipient/amount binding và double-spend prevention.
5. API query contract dictionary/deploy status; UI hiển thị confirmed block/error thay vì “Pending”.

### Nice-to-have improvements

1. Events chuẩn, observability/rate limiting/error taxonomy.
2. Tách `page.tsx` thành components/services/hooks; typed transaction/proposal state.
3. E2E test với mocked wallet cho failure paths và một testnet smoke test read-only.
4. Dependency/security CI, reproducible build và submission evidence script.

## Kết luận gửi evaluator

Phiên bản hiện tại chứng minh tốt một **Casper Testnet audit-proof recorder**: source contract thật, WASM artifact, contract/package hash và ba lời gọi contract đã execution thành công. Nó chưa chứng minh AI invoice processing, fraud detection runtime, autonomous/multi-Agent behavior, escrow hay vendor payment. Bằng chứng RPC xác nhận rõ **không có transfer**. Cách trình bày trung thực nhất là “synthetic AP workflow UI + deterministic risk demo + manager-signed on-chain payment-proof anchoring”.
