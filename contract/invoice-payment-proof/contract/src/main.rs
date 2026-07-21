#![no_std]
#![no_main]

#[cfg(not(target_arch = "wasm32"))]
compile_error!("target arch should be wasm32: compile with '--target wasm32-unknown-unknown'");

extern crate alloc;
use alloc::{format, string::{String, ToString}, vec, vec::Vec};
use casper_contract::{contract_api::{runtime, storage}, unwrap_or_revert::UnwrapOrRevert};
use casper_types::{account::AccountHash, contracts::{EntryPoint, EntryPoints}, ApiError, CLType, CLValue, EntryPointAccess, EntryPointType, NamedKeys, Parameter, URef};

const CONTRACT_KEY: &str = "invoice_payment_proof_contract_v2";
const PROPOSALS: &str = "invoice_proposals";
const INVOICE_INDEX: &str = "invoice_hash_index";
const ADMINS: &str = "admins";
const MANAGERS: &str = "managers";
const EXECUTORS: &str = "executors";
const AUDIT_LOG: &str = "audit_log";
const AUDIT_SEQUENCE: &str = "audit_sequence";
const ADMIN_COUNT: &str = "admin_count";

const PENDING: &str = "PENDING";
const APPROVED: &str = "APPROVED";
const REJECTED: &str = "REJECTED";
const PAID: &str = "PAID";

const ARG_PROPOSAL_ID: &str = "proposal_id";
const ARG_INVOICE_HASH: &str = "invoice_hash";
const ARG_INVOICE_NUMBER_HASH: &str = "invoice_number_hash";
const ARG_VENDOR_HASH: &str = "vendor_hash";
const ARG_AMOUNT: &str = "amount";
const ARG_CURRENCY: &str = "currency";
const ARG_RECIPIENT_HASH: &str = "recipient_hash";
const ARG_PAYMENT_PROOF: &str = "payment_proof";
const ARG_ACCOUNT: &str = "account";
const ARG_INITIAL_MANAGERS: &str = "initial_managers";
const ARG_INITIAL_EXECUTORS: &str = "initial_executors";

#[repr(u16)]
#[derive(Clone, Copy)]
enum Error {
    ContractAlreadyInstalled = 1,
    Unauthorized = 2,
    ProposalAlreadyExists = 3,
    InvoiceAlreadyExists = 4,
    ProposalNotFound = 5,
    InvalidState = 6,
    AlreadyApproved = 7,
    AlreadyRejected = 8,
    AlreadyPaid = 9,
    PaymentBeforeApproval = 10,
    InvalidAmount = 11,
    InvalidCurrency = 12,
    InvalidRecipient = 13,
    InvalidProof = 14,
    CannotRemoveLastAdmin = 15,
    InvalidAccount = 16,
    RoleAlreadyGranted = 17,
    RoleNotGranted = 18,
    EmptyManagerList = 19,
    EmptyExecutorList = 20,
    InvalidProposalId = 21,
    InvalidInvoiceHash = 22,
    InvalidInvoiceNumberHash = 23,
    InvalidVendorHash = 24,
}
impl From<Error> for ApiError { fn from(error: Error) -> Self { ApiError::User(error as u16) } }

fn caller() -> AccountHash { runtime::get_caller() }
fn account_key(account: AccountHash) -> String { account.to_formatted_string() }
fn role(dictionary: &str, account: AccountHash) -> bool {
    storage::named_dictionary_get(dictionary, &account_key(account)).unwrap_or_revert().unwrap_or(false)
}
fn set_role(dictionary: &str, account: AccountHash, value: bool) {
    storage::named_dictionary_put(dictionary, &account_key(account), value)
}
fn require_admin() { if !role(ADMINS, caller()) { runtime::revert(Error::Unauthorized); } }
fn require_submitter() {
    let who = caller();
    if !(role(ADMINS, who) || role(MANAGERS, who)) { runtime::revert(Error::Unauthorized); }
}
fn require_approver() {
    let who = caller();
    if !(role(ADMINS, who) || role(MANAGERS, who)) { runtime::revert(Error::Unauthorized); }
}
fn require_executor() {
    let who = caller();
    if !(role(ADMINS, who) || role(EXECUTORS, who)) { runtime::revert(Error::Unauthorized); }
}
fn named_uref(name: &str) -> URef { runtime::get_key(name).unwrap_or_revert().into_uref().unwrap_or_revert() }
fn audit(event: &str, subject: &str) {
    let sequence_uref = named_uref(AUDIT_SEQUENCE);
    let sequence: u64 = storage::read(sequence_uref).unwrap_or_revert().unwrap_or_default();
    let next = sequence.checked_add(1).unwrap_or_revert();
    storage::write(sequence_uref, next);
    let value = format!("event={};subject={};caller={};at={}", event, subject, account_key(caller()), u64::from(runtime::get_blocktime()));
    storage::named_dictionary_put(AUDIT_LOG, &next.to_string(), value);
}
fn require_nonempty(value: &str, error: Error) { if value.trim().is_empty() { runtime::revert(error); } }
fn require_safe(value: &str, error: Error) {
    require_nonempty(value, error);
    if value.as_bytes().iter().any(|byte| *byte == b';' || *byte == b'=') { runtime::revert(error); }
}
fn proposal(proposal_id: &str) -> Option<String> {
    storage::named_dictionary_get(PROPOSALS, proposal_id).unwrap_or_revert()
}
fn field(record: &str, name: &str) -> String {
    let prefix = format!("{}=", name);
    record.split(';').find_map(|part| part.strip_prefix(&prefix)).unwrap_or_default().to_string()
}
fn transition_record(record: &str, status: &str, actor_field: &str, actor: AccountHash, time_field: &str, proof: Option<&str>) -> String {
    let previous = field(record, "status");
    let mut updated = record.replacen(&format!("status={}", previous), &format!("status={}", status), 1);
    updated = format!("{};{}={};{}={}", updated, actor_field, account_key(actor), time_field, u64::from(runtime::get_blocktime()));
    if let Some(value) = proof { updated = format!("{};payment_proof={}", updated, value); }
    updated
}

#[no_mangle]
pub extern "C" fn create_invoice_proposal() {
    require_submitter();
    let proposal_id: String = runtime::get_named_arg(ARG_PROPOSAL_ID);
    let invoice_hash: String = runtime::get_named_arg(ARG_INVOICE_HASH);
    let invoice_number_hash: String = runtime::get_named_arg(ARG_INVOICE_NUMBER_HASH);
    let vendor_hash: String = runtime::get_named_arg(ARG_VENDOR_HASH);
    let amount: u64 = runtime::get_named_arg(ARG_AMOUNT);
    let currency: String = runtime::get_named_arg(ARG_CURRENCY);
    let recipient_hash: String = runtime::get_named_arg(ARG_RECIPIENT_HASH);
    require_safe(&proposal_id, Error::InvalidProposalId);
    require_safe(&invoice_hash, Error::InvalidInvoiceHash);
    require_safe(&invoice_number_hash, Error::InvalidInvoiceNumberHash);
    require_safe(&vendor_hash, Error::InvalidVendorHash);
    require_safe(&recipient_hash, Error::InvalidRecipient);
    if amount == 0 { runtime::revert(Error::InvalidAmount); }
    if currency.len() != 3 || !currency.as_bytes().iter().all(u8::is_ascii_uppercase) { runtime::revert(Error::InvalidCurrency); }
    if proposal(&proposal_id).is_some() { runtime::revert(Error::ProposalAlreadyExists); }
    let duplicate: Option<String> = storage::named_dictionary_get(INVOICE_INDEX, &invoice_hash).unwrap_or_revert();
    if duplicate.is_some() { runtime::revert(Error::InvoiceAlreadyExists); }
    let who = caller();
    let record = format!("proposal_id={};invoice_hash={};invoice_number_hash={};vendor_hash={};amount={};currency={};recipient_hash={};created_by={};created_at={};status={}", proposal_id, invoice_hash, invoice_number_hash, vendor_hash, amount, currency, recipient_hash, account_key(who), u64::from(runtime::get_blocktime()), PENDING);
    storage::named_dictionary_put(PROPOSALS, &proposal_id, record);
    storage::named_dictionary_put(INVOICE_INDEX, &invoice_hash, proposal_id.clone());
    audit("ProposalCreated", &proposal_id);
}

#[no_mangle]
pub extern "C" fn approve_invoice() {
    require_approver();
    let id: String = runtime::get_named_arg(ARG_PROPOSAL_ID);
    let record = proposal(&id).unwrap_or_revert_with(Error::ProposalNotFound);
    match field(&record, "status").as_str() {
        PENDING => {}, APPROVED => runtime::revert(Error::AlreadyApproved),
        REJECTED => runtime::revert(Error::AlreadyRejected), PAID => runtime::revert(Error::AlreadyPaid),
        _ => runtime::revert(Error::InvalidState),
    }
    storage::named_dictionary_put(PROPOSALS, &id, transition_record(&record, APPROVED, "approved_by", caller(), "approved_at", None));
    audit("ProposalApproved", &id);
}

#[no_mangle]
pub extern "C" fn reject_invoice() {
    require_approver();
    let id: String = runtime::get_named_arg(ARG_PROPOSAL_ID);
    let record = proposal(&id).unwrap_or_revert_with(Error::ProposalNotFound);
    match field(&record, "status").as_str() {
        PENDING => {}, APPROVED => runtime::revert(Error::AlreadyApproved),
        REJECTED => runtime::revert(Error::AlreadyRejected), PAID => runtime::revert(Error::AlreadyPaid),
        _ => runtime::revert(Error::InvalidState),
    }
    storage::named_dictionary_put(PROPOSALS, &id, transition_record(&record, REJECTED, "rejected_by", caller(), "rejected_at", None));
    audit("ProposalRejected", &id);
}

#[no_mangle]
pub extern "C" fn record_payment_proof() {
    require_executor();
    let id: String = runtime::get_named_arg(ARG_PROPOSAL_ID);
    let proof: String = runtime::get_named_arg(ARG_PAYMENT_PROOF);
    require_safe(&proof, Error::InvalidProof);
    let record = proposal(&id).unwrap_or_revert_with(Error::ProposalNotFound);
    match field(&record, "status").as_str() {
        APPROVED => {}, PENDING => runtime::revert(Error::PaymentBeforeApproval),
        PAID => runtime::revert(Error::AlreadyPaid), REJECTED => runtime::revert(Error::AlreadyRejected),
        _ => runtime::revert(Error::InvalidState),
    }
    storage::named_dictionary_put(PROPOSALS, &id, transition_record(&record, PAID, "payment_recorded_by", caller(), "payment_recorded_at", Some(&proof)));
    audit("PaymentProofRecorded", &id);
}

fn grant(dictionary: &str, event: &str) {
    require_admin();
    let account: AccountHash = runtime::get_named_arg(ARG_ACCOUNT);
    if account == AccountHash::default() { runtime::revert(Error::InvalidAccount); }
    if role(dictionary, account) { runtime::revert(Error::RoleAlreadyGranted); }
    set_role(dictionary, account, true); audit(event, &account_key(account));
}
fn revoke(dictionary: &str, event: &str) {
    require_admin();
    let account: AccountHash = runtime::get_named_arg(ARG_ACCOUNT);
    if !role(dictionary, account) { runtime::revert(Error::RoleNotGranted); }
    set_role(dictionary, account, false); audit(event, &account_key(account));
}
#[no_mangle] pub extern "C" fn add_manager() { grant(MANAGERS, "ManagerGranted"); }
#[no_mangle] pub extern "C" fn remove_manager() { revoke(MANAGERS, "ManagerRevoked"); }
#[no_mangle] pub extern "C" fn add_executor() { grant(EXECUTORS, "ExecutorGranted"); }
#[no_mangle] pub extern "C" fn remove_executor() { revoke(EXECUTORS, "ExecutorRevoked"); }
#[no_mangle]
pub extern "C" fn add_admin() {
    grant(ADMINS, "AdminGranted");
    let uref = named_uref(ADMIN_COUNT); let count: u64 = storage::read(uref).unwrap_or_revert().unwrap_or_default(); storage::write(uref, count + 1);
}
#[no_mangle]
pub extern "C" fn remove_admin() {
    require_admin();
    let account: AccountHash = runtime::get_named_arg(ARG_ACCOUNT);
    if !role(ADMINS, account) { runtime::revert(Error::RoleNotGranted); }
    let uref = named_uref(ADMIN_COUNT); let count: u64 = storage::read(uref).unwrap_or_revert().unwrap_or_default();
    if count <= 1 { runtime::revert(Error::CannotRemoveLastAdmin); }
    set_role(ADMINS, account, false); storage::write(uref, count - 1); audit("AdminRevoked", &account_key(account));
}

#[no_mangle]
pub extern "C" fn get_invoice_proposal() {
    let id: String = runtime::get_named_arg(ARG_PROPOSAL_ID);
    runtime::ret(CLValue::from_t(proposal(&id).unwrap_or_revert_with(Error::ProposalNotFound)).unwrap_or_revert());
}

fn public_entry(name: &str, params: Vec<Parameter>, result: CLType) -> EntryPoint {
    EntryPoint::new(name, params, result, EntryPointAccess::Public, EntryPointType::Called)
}
fn account_param() -> Vec<Parameter> { vec![Parameter::new(ARG_ACCOUNT, CLType::ByteArray(32))] }

#[no_mangle]
pub extern "C" fn call() {
    if runtime::get_key(CONTRACT_KEY).is_some() { runtime::revert(Error::ContractAlreadyInstalled); }
    let managers: Vec<AccountHash> = runtime::get_named_arg(ARG_INITIAL_MANAGERS);
    let executors: Vec<AccountHash> = runtime::get_named_arg(ARG_INITIAL_EXECUTORS);
    if managers.is_empty() { runtime::revert(Error::EmptyManagerList); }
    if executors.is_empty() { runtime::revert(Error::EmptyExecutorList); }
    let mut named_keys = NamedKeys::new();
    for name in [PROPOSALS, INVOICE_INDEX, ADMINS, MANAGERS, EXECUTORS, AUDIT_LOG] {
        named_keys.insert(name.to_string(), storage::new_dictionary(name).unwrap_or_revert().into());
    }
    named_keys.insert(AUDIT_SEQUENCE.to_string(), storage::new_uref(0u64).into());
    named_keys.insert(ADMIN_COUNT.to_string(), storage::new_uref(1u64).into());
    let mut entries = EntryPoints::new();
    let proposal_params = vec![
        Parameter::new(ARG_PROPOSAL_ID, CLType::String), Parameter::new(ARG_INVOICE_HASH, CLType::String),
        Parameter::new(ARG_INVOICE_NUMBER_HASH, CLType::String), Parameter::new(ARG_VENDOR_HASH, CLType::String),
        Parameter::new(ARG_AMOUNT, CLType::U64), Parameter::new(ARG_CURRENCY, CLType::String),
        Parameter::new(ARG_RECIPIENT_HASH, CLType::String),
    ];
    entries.add_entry_point(public_entry("create_invoice_proposal", proposal_params, CLType::Unit));
    entries.add_entry_point(public_entry("approve_invoice", vec![Parameter::new(ARG_PROPOSAL_ID, CLType::String)], CLType::Unit));
    entries.add_entry_point(public_entry("reject_invoice", vec![Parameter::new(ARG_PROPOSAL_ID, CLType::String)], CLType::Unit));
    entries.add_entry_point(public_entry("record_payment_proof", vec![Parameter::new(ARG_PROPOSAL_ID, CLType::String), Parameter::new(ARG_PAYMENT_PROOF, CLType::String)], CLType::Unit));
    entries.add_entry_point(public_entry("get_invoice_proposal", vec![Parameter::new(ARG_PROPOSAL_ID, CLType::String)], CLType::String));
    for name in ["add_manager", "remove_manager", "add_executor", "remove_executor", "add_admin", "remove_admin"] {
        entries.add_entry_point(public_entry(name, account_param(), CLType::Unit));
    }
    let deployer = caller();
    set_role(ADMINS, deployer, true);
    for account in managers { set_role(MANAGERS, account, true); }
    for account in executors { set_role(EXECUTORS, account, true); }
    let (contract_hash, _) = storage::new_contract(entries.into(), Some(named_keys), None, None, None);
    for name in [PROPOSALS, INVOICE_INDEX, ADMINS, MANAGERS, EXECUTORS, AUDIT_LOG] {
        runtime::remove_key(name);
    }
    runtime::put_key(CONTRACT_KEY, contract_hash.into());
}
