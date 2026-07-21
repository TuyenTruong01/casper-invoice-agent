// Compatibility wrapper: the V2 deploy script is dry-run unless CASPER_SEND=1.
delete process.env.CASPER_SEND;
require('./deploy-casper-contract.cjs');
