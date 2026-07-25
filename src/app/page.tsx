"use client";

import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

export default function Home() {
  const latestBlocks = useQuery(api.explorer.getLatestBlocks, { limit: 10 });
  const networkStats = useQuery(api.explorer.getNetworkStats);
  const topMiners = useQuery(api.explorer.getTopMiners, { limit: 5 });

  return (
    <main className="min-h-screen bg-gray-900 text-white p-8">
      <header className="mb-8">
        <h1 className="text-4xl font-bold text-orange-500">🤖 mirstat Explorer</h1>
        <p className="text-gray-400 mt-2">Real-time blockchain explorer for BOT</p>
      </header>

      {/* Network Stats */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard 
          label="Block Height" 
          value={networkStats?.blockHeight?.toLocaleString() ?? "..."} 
        />
        <StatCard 
          label="Hashrate" 
          value={networkStats?.hashrate ? `${networkStats.hashrate.toFixed(2)} H/s` : "..."} 
        />
        <StatCard 
          label="Difficulty" 
          value={networkStats?.difficulty?.toExponential(2) ?? "..."} 
        />
        <StatCard 
          label="Total Supply" 
          value={networkStats?.totalSupply ? `${(networkStats.totalSupply / 100000000).toLocaleString()} BOT` : "..."} 
        />
      </section>

      <div className="grid md:grid-cols-3 gap-8">
        {/* Latest Blocks */}
        <section className="md:col-span-2">
          <h2 className="text-2xl font-semibold mb-4">Latest Blocks</h2>
          <div className="bg-gray-800 rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-700">
                <tr>
                  <th className="px-4 py-3 text-left">Height</th>
                  <th className="px-4 py-3 text-left">Hash</th>
                  <th className="px-4 py-3 text-left">Miner</th>
                  <th className="px-4 py-3 text-right">Txs</th>
                  <th className="px-4 py-3 text-right">Age</th>
                </tr>
              </thead>
              <tbody>
                {latestBlocks?.map((block) => (
                  <tr key={block.hash} className="border-t border-gray-700 hover:bg-gray-750">
                    <td className="px-4 py-3 font-mono text-orange-400">
                      <a href={`/block/${block.height}`}>{block.height}</a>
                    </td>
                    <td className="px-4 py-3 font-mono text-sm">
                      <a href={`/block/${block.hash}`} className="text-blue-400 hover:underline">
                        {block.hash.slice(0, 16)}...
                      </a>
                    </td>
                    <td className="px-4 py-3 font-mono text-sm">
                      {block.miner ? (
                        <a href={`/address/${block.miner}`} className="text-green-400 hover:underline">
                          {block.miner.slice(0, 12)}...
                        </a>
                      ) : (
                        <span className="text-gray-500">Unknown</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">{block.txCount}</td>
                    <td className="px-4 py-3 text-right text-gray-400">
                      {formatAge(block.timestamp)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Top Miners */}
        <section>
          <h2 className="text-2xl font-semibold mb-4">Top Miners</h2>
          <div className="bg-gray-800 rounded-lg p-4">
            {topMiners?.map((miner, i) => (
              <div key={miner.address} className="flex justify-between items-center py-2 border-b border-gray-700 last:border-0">
                <div className="flex items-center gap-2">
                  <span className="text-gray-500">#{i + 1}</span>
                  <a href={`/address/${miner.address}`} className="font-mono text-sm text-green-400 hover:underline">
                    {miner.address.slice(0, 12)}...
                  </a>
                </div>
                <span className="text-orange-400 font-semibold">{miner.blocks} blocks</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Search */}
      <section className="mt-8">
        <div className="bg-gray-800 rounded-lg p-4">
          <input 
            type="text" 
            placeholder="Search by block height, hash, txid, or address..."
            className="w-full bg-gray-700 rounded px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>
      </section>
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <div className="text-gray-400 text-sm">{label}</div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
    </div>
  );
}

function formatAge(timestamp: number): string {
  const seconds = Math.floor(Date.now() / 1000 - timestamp);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
