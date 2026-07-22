const NODE_ADDRESS = process.env.CASPER_NODE_ADDRESS || process.env.NEXT_PUBLIC_CASPER_NODE_ADDRESS || 'https://node.testnet.casper.network/rpc';

async function rpc(method: string, params: Record<string, unknown>) {
  const response = await fetch(NODE_ADDRESS, {
    method:'POST', headers:{ 'content-type':'application/json' },
    body:JSON.stringify({ jsonrpc:'2.0', id:Date.now(), method, params }), cache:'no-store',
  });
  const text = await response.text();
  let json: any;
  try { json = JSON.parse(text); } catch { throw new Error(`Casper RPC ${method} returned non-JSON (HTTP ${response.status}).`); }
  if (!response.ok || json.error) throw new Error(`Casper RPC ${method} failed: ${json.error?.message || `HTTP ${response.status}`}`);
  return json.result;
}

export function parseProposalRecord(record: string) {
  const fields = Object.fromEntries(record.split(';').map(part => {
    const index = part.indexOf('=');
    return index < 0 ? [part, ''] : [part.slice(0,index), part.slice(index+1)];
  }));
  return { record, fields, status:String(fields.status || '') };
}

export async function readContractProposal(proposalId: string) {
  const contractHash = String(process.env.NEXT_PUBLIC_CASPER_CONTRACT_HASH || '').replace(/^contract-/, '');
  if (!/^[a-f0-9]{64}$/i.test(contractHash)) throw new Error('Contract V2 hash is not configured.');
  let lastError: unknown;
  for (let attempt=0; attempt<5; attempt++) {
    try {
      const status = await rpc('info_get_status', {});
      const root = status.last_added_block_info.state_root_hash;
      const contract = await rpc('state_get_item', { state_root_hash:root, key:`hash-${contractHash}`, path:[] });
      const namedKeys = contract.stored_value?.Contract?.named_keys || [];
      const seed = namedKeys.find((item: any) => item.name === 'invoice_proposals')?.key;
      if (!seed) throw new Error('Contract V2 invoice_proposals dictionary is missing.');
      const item = await rpc('state_get_dictionary_item', {
        state_root_hash:root,
        dictionary_identifier:{ URef:{ seed_uref:seed, dictionary_item_key:proposalId } },
      });
      const record = item.stored_value?.CLValue?.parsed;
      if (typeof record !== 'string') throw new Error('Contract proposal dictionary returned an unexpected value.');
      return parseProposalRecord(record);
    } catch (error) {
      lastError = error;
      if (attempt < 4) await new Promise(resolve => setTimeout(resolve, 1500));
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Could not reconcile Casper contract state.');
}
