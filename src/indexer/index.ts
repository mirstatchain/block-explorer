/**
 * mirstat Indexer - Syncs blockchain data to Convex
 * 
 * Reuses RPC patterns from btc-rpc-explorer
 */

import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";

// Configuration
const mirstat_RPC_URL = process.env.mirstat_RPC_URL || "http://127.0.0.1:8332";
const mirstat_RPC_USER = process.env.mirstat_RPC_USER || "mirstat";
const mirstat_RPC_PASS = process.env.mirstat_RPC_PASS || "mirstat";
const CONVEX_URL = process.env.CONVEX_URL!;
const POLL_INTERVAL = 5000; // 5 seconds

// Initialize Convex client
const convex = new ConvexHttpClient(CONVEX_URL);

// RPC helper (adapted from btc-rpc-explorer)
async function rpcCall(method: string, params: any[] = []): Promise<any> {
  const response = await fetch(mirstat_RPC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Basic " + Buffer.from(`${mirstat_RPC_USER}:${mirstat_RPC_PASS}`).toString("base64"),
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method,
      params,
    }),
  });

  const data = await response.json();
  if (data.error) {
    throw new Error(`RPC Error: ${data.error.message}`);
  }
  return data.result;
}

// Get block with full transaction details
async function getBlockWithTxs(height: number) {
  const hash = await rpcCall("getblockhash", [height]);
  const block = await rpcCall("getblock", [hash, 2]); // verbosity 2 = full tx details
  return block;
}

// Extract miner address from coinbase tx
function getMinerAddress(block: any): string | undefined {
  if (!block.tx || block.tx.length === 0) return undefined;
  
  const coinbaseTx = block.tx[0];
  if (!coinbaseTx.vout || coinbaseTx.vout.length === 0) return undefined;
  
  // First output usually goes to miner
  const firstOutput = coinbaseTx.vout[0];
  return firstOutput.scriptPubKey?.address;
}

// Calculate total block value (sum of all outputs)
function calculateBlockValue(block: any): number {
  let total = 0;
  for (const tx of block.tx || []) {
    for (const vout of tx.vout || []) {
      total += Math.round((vout.value || 0) * 100000000); // Convert to satoshis
    }
  }
  return total;
}

// Index a single block
async function indexBlock(height: number) {
  console.log(`Indexing block ${height}...`);
  
  const block = await getBlockWithTxs(height);
  
  // Insert block
  await convex.mutation(api.explorer.upsertBlock, {
    height: block.height,
    hash: block.hash,
    previousHash: block.previousblockhash || "",
    timestamp: block.time,
    difficulty: block.difficulty,
    nonce: block.nonce,
    size: block.size,
    weight: block.weight || block.size * 4,
    txCount: block.nTx || block.tx?.length || 0,
    totalValue: calculateBlockValue(block),
    miner: getMinerAddress(block),
    version: block.version,
  });

  // Index transactions
  for (const tx of block.tx || []) {
    const isCoinbase = tx.vin?.[0]?.coinbase !== undefined;
    
    let totalInput = 0;
    let totalOutput = 0;
    
    for (const vout of tx.vout || []) {
      totalOutput += Math.round((vout.value || 0) * 100000000);
    }
    
    // For non-coinbase, we'd need to look up previous outputs for totalInput
    // Simplified: fee = totalInput - totalOutput (skip for now)
    
    await convex.mutation(api.explorer.upsertTransaction, {
      txid: tx.txid,
      blockHeight: height,
      blockHash: block.hash,
      timestamp: block.time,
      size: tx.size || 0,
      vsize: tx.vsize || tx.size || 0,
      fee: isCoinbase ? 0 : 0, // Would need UTXO lookup for accurate fees
      inputCount: tx.vin?.length || 0,
      outputCount: tx.vout?.length || 0,
      totalInput: totalInput,
      totalOutput: totalOutput,
      isCoinbase,
    });

    // Index addresses from outputs
    for (const vout of tx.vout || []) {
      const address = vout.scriptPubKey?.address;
      if (address) {
        const existing = await convex.query(api.explorer.getAddress, { address });
        
        await convex.mutation(api.explorer.upsertAddress, {
          address,
          totalReceived: (existing?.totalReceived || 0) + Math.round((vout.value || 0) * 100000000),
          totalSent: existing?.totalSent || 0,
          txCount: (existing?.txCount || 0) + 1,
          firstSeen: existing?.firstSeen || height,
          lastSeen: height,
        });
      }
    }
  }

  // Update indexer state
  await convex.mutation(api.explorer.updateIndexerState, {
    lastIndexedHeight: height,
    lastIndexedHash: block.hash,
  });

  console.log(`Block ${height} indexed (${block.nTx || block.tx?.length || 0} txs, miner: ${getMinerAddress(block) || 'unknown'})`);
}

// Update network stats
async function updateStats() {
  const info = await rpcCall("getblockchaininfo");
  const miningInfo = await rpcCall("getmininginfo");
  
  // Calculate total supply (50 BOT per block, halving every 210000)
  const height = info.blocks;
  let supply = 0;
  let reward = 50 * 100000000; // satoshis
  let remaining = height;
  
  while (remaining > 0) {
    const blocksInEra = Math.min(remaining, 210000);
    supply += blocksInEra * reward;
    remaining -= blocksInEra;
    reward = Math.floor(reward / 2);
  }

  await convex.mutation(api.explorer.updateNetworkStats, {
    blockHeight: height,
    difficulty: info.difficulty,
    hashrate: miningInfo.networkhashps || 0,
    totalSupply: supply,
    totalTransactions: 0, // Would need to count from DB
    totalAddresses: 0, // Would need to count from DB
  });
}

// Main indexer loop
async function runIndexer() {
  console.log("Starting mirstat Indexer...");
  console.log(`RPC: ${mirstat_RPC_URL}`);
  console.log(`Convex: ${CONVEX_URL}`);

  while (true) {
    try {
      // Get current chain height
      const chainInfo = await rpcCall("getblockchaininfo");
      const chainHeight = chainInfo.blocks;

      // Get last indexed height
      const state = await convex.query(api.explorer.getIndexerState, {});
      const lastIndexed = state?.lastIndexedHeight ?? -1;

      // Index new blocks
      for (let height = lastIndexed + 1; height <= chainHeight; height++) {
        await indexBlock(height);
      }

      // Update network stats periodically
      if (chainHeight > lastIndexed) {
        await updateStats();
      }

    } catch (error) {
      console.error("Indexer error:", error);
    }

    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
  }
}

// Run
runIndexer().catch(console.error);
