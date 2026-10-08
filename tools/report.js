#!/usr/bin/env node
/**
 * report.js
 * --------------------------------------------------------------
 * Summarizes a honeypot-log.jsonl file into a real, evidence-based
 * report: hit counts, top offending IPs, most-probed paths, and a
 * timeline. This is the client deliverable for the
 * "Honeypot & Intrusion-Attempt Monitoring" service.
 *
 * Usage:
 *   node report.js ./data/honeypot-log.jsonl
 *   node report.js ./data/honeypot-log.jsonl --json report.json
 */

const fs = require('fs');
const readline = require('readline');

function parseArgs() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: node report.js <path-to-honeypot-log.jsonl> [--json out.json]');
    process.exit(1);
  }
  const logPath = args[0];
  const jsonIdx = args.indexOf('--json');
  const jsonOut = jsonIdx !== -1 ? args[jsonIdx + 1] : null;
  return { logPath, jsonOut };
}

async function readEntries(logPath) {
  if (!fs.existsSync(logPath)) {
    console.error(
      `No log file found at ${logPath} - no honeypot hits recorded yet (this is good news).`
    );
    process.exit(0);
  }

  const entries = [];
  const rl = readline.createInterface({ input: fs.createReadStream(logPath) });
  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      entries.push(JSON.parse(line));
    } catch {
      // skip malformed lines rather than crash the report
    }
  }
  return entries;
}

function summarize(entries) {
  const byIp = {};
  const byPath = {};
  const byDay = {};

  for (const e of entries) {
    byIp[e.ip] = (byIp[e.ip] || 0) + 1;
    byPath[e.path] = (byPath[e.path] || 0) + 1;
    const day = e.timestamp.slice(0, 10);
    byDay[day] = (byDay[day] || 0) + 1;
  }

  const topN = (obj, n = 10) =>
    Object.entries(obj)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n);

  return {
    totalHits: entries.length,
    uniqueIps: Object.keys(byIp).length,
    topIps: topN(byIp),
    topPaths: topN(byPath),
    hitsByDay: byDay,
    firstHit: entries[0]?.timestamp || null,
    lastHit: entries[entries.length - 1]?.timestamp || null,
  };
}

function printReport(summary) {
  console.log('\n=== Honeypot & Intrusion-Attempt Monitoring Report ===\n');
  console.log(`Total decoy hits:      ${summary.totalHits}`);
  console.log(`Unique source IPs:     ${summary.uniqueIps}`);
  console.log(`First recorded hit:    ${summary.firstHit || 'n/a'}`);
  console.log(`Most recent hit:       ${summary.lastHit || 'n/a'}`);

  if (summary.topIps.length) {
    console.log('\nTop source IPs:');
    for (const [ip, count] of summary.topIps) {
      console.log(`  ${count.toString().padStart(4)}  ${ip}`);
    }
  }

  if (summary.topPaths.length) {
    console.log('\nMost-probed decoy paths:');
    for (const [p, count] of summary.topPaths) {
      console.log(`  ${count.toString().padStart(4)}  ${p}`);
    }
  }

  if (Object.keys(summary.hitsByDay).length) {
    console.log('\nHits by day:');
    for (const [day, count] of Object.entries(summary.hitsByDay).sort()) {
      console.log(`  ${day}  ${'#'.repeat(Math.min(count, 50))} (${count})`);
    }
  }

  console.log('\nNote: a hit on any of these paths means something requested a URL no legitimate');
  console.log('user or your own app ever would - this is real evidence of scanning/probing,');
  console.log('not a simulated or estimated figure.\n');
}

async function main() {
  const { logPath, jsonOut } = parseArgs();
  const entries = await readEntries(logPath);
  const summary = summarize(entries);
  printReport(summary);

  if (jsonOut) {
    fs.writeFileSync(jsonOut, JSON.stringify(summary, null, 2));
    console.log(`JSON report written to ${jsonOut}`);
  }
}

main();
