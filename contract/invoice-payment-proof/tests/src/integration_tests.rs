fn main() { panic!("Execute cargo test, not cargo run."); }

#[cfg(test)]
mod tests {
    use casper_engine_test_support::{
        ExecuteRequestBuilder, LmdbWasmTestBuilder, TransferRequestBuilder,
        DEFAULT_ACCOUNT_ADDR, LOCAL_GENESIS_REQUEST,
    };
    use casper_types::{account::AccountHash, contracts::ContractHash, runtime_args, AddressableEntityHash, RuntimeArgs, StoredValue, U512};

    const CONTRACT_KEY: &str = "invoice_payment_proof_contract_v2";
    const PROPOSALS: &str = "invoice_proposals";
    const ADMINS: &str = "admins";
    const MANAGERS: &str = "managers";
    const EXECUTORS: &str = "executors";

    fn account(byte: u8) -> AccountHash { AccountHash::new([byte; 32]) }

    struct Fixture {
        builder: LmdbWasmTestBuilder,
        contract: AddressableEntityHash,
        contract_hash: ContractHash,
        manager: AccountHash,
        executor: AccountHash,
        outsider: AccountHash,
    }

    impl Fixture {
        fn new() -> Self {
            let manager = account(2);
            let executor = account(3);
            let outsider = account(4);
            let mut builder = LmdbWasmTestBuilder::default();
            builder.run_genesis(LOCAL_GENESIS_REQUEST.clone());
            for target in [manager, executor, outsider] {
                let transfer = TransferRequestBuilder::new(U512::from(100_000_000_000_000u64), target).build();
                builder.transfer_and_commit(transfer).expect_success();
            }
            let wasm_path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../contract/target/wasm32-unknown-unknown/release/contract.wasm");
            let install = ExecuteRequestBuilder::module_bytes(
                *DEFAULT_ACCOUNT_ADDR,
                std::fs::read(wasm_path).expect("build V2 contract WASM before tests"),
                runtime_args! { "initial_managers" => vec![manager], "initial_executors" => vec![executor] },
            ).build();
            builder.exec(install).expect_success().commit();
            let contract_hash = ContractHash::new(builder.get_account(*DEFAULT_ACCOUNT_ADDR).unwrap().named_keys().get(CONTRACT_KEY).unwrap().into_hash_addr().unwrap());
            for leaked in [PROPOSALS, ADMINS, MANAGERS, EXECUTORS] {
                assert!(builder.get_account(*DEFAULT_ACCOUNT_ADDR).unwrap().named_keys().get(leaked).is_none(), "installer retained dictionary capability: {leaked}");
            }
            let contract = AddressableEntityHash::new(contract_hash.value());
            Self { builder, contract, contract_hash, manager, executor, outsider }
        }

        fn call(&mut self, caller: AccountHash, entry: &str, args: RuntimeArgs, success: bool) {
            let request = ExecuteRequestBuilder::contract_call_by_hash(caller, self.contract, entry, args).build();
            self.builder.exec(request);
            if success { self.builder.expect_success().commit(); } else { self.builder.expect_failure(); }
        }

        fn dictionary_uref(&self, name: &str) -> casper_types::URef {
            self.builder.get_contract(self.contract_hash).unwrap().named_keys().get(name).unwrap().into_uref().unwrap()
        }

        fn dictionary_string(&self, dictionary: &str, key: &str) -> String {
            match self.builder.query_dictionary_item(None, self.dictionary_uref(dictionary), key).unwrap() {
                StoredValue::CLValue(value) => value.into_t::<String>().unwrap(),
                other => panic!("unexpected stored value: {other:?}"),
            }
        }

        fn dictionary_bool(&self, dictionary: &str, key: &str) -> bool {
            match self.builder.query_dictionary_item(None, self.dictionary_uref(dictionary), key).unwrap() {
                StoredValue::CLValue(value) => value.into_t::<bool>().unwrap(),
                other => panic!("unexpected stored value: {other:?}"),
            }
        }

        fn create(&mut self, id: &str, hash: &str, success: bool) {
            self.call(self.manager, "create_invoice_proposal", runtime_args! {
                "proposal_id" => id.to_string(), "invoice_hash" => hash.to_string(),
                "invoice_number_hash" => format!("number-{hash}"), "vendor_hash" => "vendor-hash".to_string(),
                "amount" => 1375u64, "currency" => "USD".to_string(), "recipient_hash" => "recipient-hash".to_string(),
            }, success);
        }
    }

    #[test]
    fn real_wasm_rbac_state_machine_and_immutability() {
        let mut f = Fixture::new();

        assert!(f.dictionary_bool(ADMINS, &DEFAULT_ACCOUNT_ADDR.to_formatted_string()));
        assert!(f.dictionary_bool(MANAGERS, &f.manager.to_formatted_string()));
        assert!(f.dictionary_bool(EXECUTORS, &f.executor.to_formatted_string()));

        let extra_manager = account(5);
        let extra_executor = account(6);
        f.call(*DEFAULT_ACCOUNT_ADDR, "add_manager", runtime_args! { "account" => extra_manager }, true);
        f.call(*DEFAULT_ACCOUNT_ADDR, "add_executor", runtime_args! { "account" => extra_executor }, true);
        assert!(f.dictionary_bool(MANAGERS, &extra_manager.to_formatted_string()));
        assert!(f.dictionary_bool(EXECUTORS, &extra_executor.to_formatted_string()));
        f.call(*DEFAULT_ACCOUNT_ADDR, "remove_manager", runtime_args! { "account" => extra_manager }, true);
        f.call(*DEFAULT_ACCOUNT_ADDR, "remove_executor", runtime_args! { "account" => extra_executor }, true);
        assert!(!f.dictionary_bool(MANAGERS, &extra_manager.to_formatted_string()));
        assert!(!f.dictionary_bool(EXECUTORS, &extra_executor.to_formatted_string()));
        let second_admin = account(7);
        f.call(*DEFAULT_ACCOUNT_ADDR, "add_admin", runtime_args! { "account" => second_admin }, true);
        assert!(f.dictionary_bool(ADMINS, &second_admin.to_formatted_string()));
        f.call(*DEFAULT_ACCOUNT_ADDR, "remove_admin", runtime_args! { "account" => second_admin }, true);
        assert!(!f.dictionary_bool(ADMINS, &second_admin.to_formatted_string()));

        f.create("INV-1", "hash-1", true);
        let pending = f.dictionary_string(PROPOSALS, "INV-1");
        assert!(pending.contains("status=PENDING"));
        assert!(pending.contains("amount=1375;currency=USD;recipient_hash=recipient-hash"));
        assert!(pending.contains(&format!("created_by={}", f.manager.to_formatted_string())));

        f.create("INV-1", "hash-other", false);
        f.create("INV-OTHER", "hash-1", false);
        f.call(f.outsider, "approve_invoice", runtime_args! { "proposal_id" => "INV-1".to_string() }, false);
        f.call(f.outsider, "record_payment_proof", runtime_args! { "proposal_id" => "INV-1".to_string(), "payment_proof" => "proof".to_string() }, false);

        f.call(f.manager, "approve_invoice", runtime_args! { "proposal_id" => "INV-1".to_string() }, true);
        let approved = f.dictionary_string(PROPOSALS, "INV-1");
        assert!(approved.contains("status=APPROVED"));
        assert!(approved.contains(&format!("approved_by={}", f.manager.to_formatted_string())));
        assert!(approved.contains("amount=1375;currency=USD;recipient_hash=recipient-hash"));
        f.call(f.manager, "approve_invoice", runtime_args! { "proposal_id" => "INV-1".to_string() }, false);

        f.create("INV-2", "hash-2", true);
        f.call(f.executor, "record_payment_proof", runtime_args! { "proposal_id" => "INV-2".to_string(), "payment_proof" => "too-early".to_string() }, false);
        assert!(f.dictionary_string(PROPOSALS, "INV-2").contains("status=PENDING"));

        f.call(f.executor, "record_payment_proof", runtime_args! { "proposal_id" => "INV-1".to_string(), "payment_proof" => "proof-1".to_string() }, true);
        let paid = f.dictionary_string(PROPOSALS, "INV-1");
        assert!(paid.contains("status=PAID"));
        assert!(paid.contains("payment_proof=proof-1"));
        assert!(paid.contains(&format!("approved_by={}", f.manager.to_formatted_string())));
        assert!(paid.contains(&format!("payment_recorded_by={}", f.executor.to_formatted_string())));
        assert!(paid.contains("amount=1375;currency=USD;recipient_hash=recipient-hash"));
        f.call(f.executor, "record_payment_proof", runtime_args! { "proposal_id" => "INV-1".to_string(), "payment_proof" => "overwrite".to_string() }, false);
        assert_eq!(f.dictionary_string(PROPOSALS, "INV-1"), paid);

        f.create("INV-3", "hash-3", true);
        f.call(f.manager, "reject_invoice", runtime_args! { "proposal_id" => "INV-3".to_string() }, true);
        assert!(f.dictionary_string(PROPOSALS, "INV-3").contains("status=REJECTED"));
        f.call(f.manager, "approve_invoice", runtime_args! { "proposal_id" => "INV-3".to_string() }, false);

        f.call(*DEFAULT_ACCOUNT_ADDR, "remove_admin", runtime_args! { "account" => *DEFAULT_ACCOUNT_ADDR }, false);
        assert!(f.dictionary_bool(ADMINS, &DEFAULT_ACCOUNT_ADDR.to_formatted_string()));
    }
}
