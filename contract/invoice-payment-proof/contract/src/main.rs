#![no_std]
#![no_main]

#[cfg(not(target_arch = "wasm32"))]
compile_error!("target arch should be wasm32: compile with '--target wasm32-unknown-unknown'");

extern crate alloc;

use alloc::{
    format,
    string::{String, ToString},
    vec,
};

use casper_contract::{
    contract_api::{runtime, storage},
    unwrap_or_revert::UnwrapOrRevert,
};

use casper_types::{
    contracts::{EntryPoint, EntryPoints},
    ApiError, CLType, CLValue, EntryPointAccess, EntryPointType, NamedKeys, Parameter,
};

const CONTRACT_KEY: &str = "invoice_payment_proof_contract";
const PROOFS_DICT: &str = "invoice_payment_proofs";

const ENTRY_RECORD_PAYMENT_PROOF: &str = "record_payment_proof";
const ENTRY_GET_PAYMENT_PROOF: &str = "get_payment_proof";

const ARG_PROPOSAL_ID: &str = "proposal_id";
const ARG_PROOF_HASH: &str = "proof_hash";
const ARG_INVOICE_COUNT: &str = "invoice_count";
const ARG_TOTAL_AMOUNT: &str = "total_amount";
const ARG_APPROVER: &str = "approver";
const ARG_EXECUTOR: &str = "executor";
const ARG_CREATED_AT: &str = "created_at";

#[repr(u16)]
enum Error {
    ContractAlreadyInstalled = 1,
    ProofNotFound = 2,
}

impl From<Error> for ApiError {
    fn from(error: Error) -> Self {
        ApiError::User(error as u16)
    }
}

/// record_payment_proof stores one audit record for an approved invoice payment proposal.
///
/// The dictionary key is proposal_id.
/// The dictionary value is a compact audit string that the frontend can parse/display.
#[no_mangle]
pub extern "C" fn record_payment_proof() {
    let proposal_id: String = runtime::get_named_arg(ARG_PROPOSAL_ID);
    let proof_hash: String = runtime::get_named_arg(ARG_PROOF_HASH);
    let invoice_count: u32 = runtime::get_named_arg(ARG_INVOICE_COUNT);
    let total_amount: u64 = runtime::get_named_arg(ARG_TOTAL_AMOUNT);
    let approver: String = runtime::get_named_arg(ARG_APPROVER);
    let executor: String = runtime::get_named_arg(ARG_EXECUTOR);
    let created_at: u64 = runtime::get_named_arg(ARG_CREATED_AT);

    let record = format!(
        "proposal_id={};proof_hash={};invoice_count={};total_amount={};approver={};executor={};created_at={}",
        proposal_id,
        proof_hash,
        invoice_count,
        total_amount,
        approver,
        executor,
        created_at
    );

    storage::named_dictionary_put(PROOFS_DICT, &proposal_id, record);
}

/// get_payment_proof returns the stored audit record for a proposal_id.
/// This is useful for CLI testing and later frontend query support.
#[no_mangle]
pub extern "C" fn get_payment_proof() {
    let proposal_id: String = runtime::get_named_arg(ARG_PROPOSAL_ID);

    let proof: Option<String> =
        storage::named_dictionary_get(PROOFS_DICT, &proposal_id).unwrap_or_revert();

    match proof {
        Some(value) => runtime::ret(CLValue::from_t(value).unwrap_or_revert()),
        None => runtime::revert(Error::ProofNotFound),
    }
}

/// call installs the stored contract and creates the dictionary used by entry points.
#[no_mangle]
pub extern "C" fn call() {
    if runtime::get_key(CONTRACT_KEY).is_some() {
        runtime::revert(Error::ContractAlreadyInstalled);
    }

    let proofs_uref = storage::new_dictionary(PROOFS_DICT).unwrap_or_revert();

    let mut named_keys = NamedKeys::new();
    named_keys.insert(PROOFS_DICT.to_string(), proofs_uref.into());

    let mut entry_points = EntryPoints::new();

    entry_points.add_entry_point(EntryPoint::new(
        ENTRY_RECORD_PAYMENT_PROOF,
        vec![
            Parameter::new(ARG_PROPOSAL_ID, CLType::String),
            Parameter::new(ARG_PROOF_HASH, CLType::String),
            Parameter::new(ARG_INVOICE_COUNT, CLType::U32),
            Parameter::new(ARG_TOTAL_AMOUNT, CLType::U64),
            Parameter::new(ARG_APPROVER, CLType::String),
            Parameter::new(ARG_EXECUTOR, CLType::String),
            Parameter::new(ARG_CREATED_AT, CLType::U64),
        ],
        CLType::Unit,
        EntryPointAccess::Public,
        EntryPointType::Called,
    ));

    entry_points.add_entry_point(EntryPoint::new(
        ENTRY_GET_PAYMENT_PROOF,
        vec![Parameter::new(ARG_PROPOSAL_ID, CLType::String)],
        CLType::String,
        EntryPointAccess::Public,
        EntryPointType::Called,
    ));

    let (contract_hash, _contract_version) =
        storage::new_contract(entry_points.into(), Some(named_keys), None, None, None);

    runtime::put_key(CONTRACT_KEY, contract_hash.into());
}
