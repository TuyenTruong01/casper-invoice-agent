// Legacy fixed-mode installer is intentionally disabled for Contract V2.
// Delegate to the guarded V2 script and force dry-run behavior.
delete process.env.CASPER_SEND;
require('./deploy-casper-contract.cjs');
