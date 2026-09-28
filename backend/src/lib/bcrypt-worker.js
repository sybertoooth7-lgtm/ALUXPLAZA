import { parentPort } from 'node:worker_threads';
import bcrypt from 'bcryptjs';

// Runs one bcrypt operation per message so the cost lands on this thread rather
// than the event loop. Kept deliberately minimal: the pool owns scheduling, this
// only executes.
parentPort.on('message', (msg) => {
  const { id, op, data, rounds } = msg;
  try {
    let result;
    if (op === 'hash') {
      result = bcrypt.hashSync(data, rounds);
    } else if (op === 'compare') {
      result = bcrypt.compareSync(data, msg.hash);
    } else {
      throw new Error(`unknown op: ${op}`);
    }
    parentPort.postMessage({ id, result });
  } catch (err) {
    parentPort.postMessage({ id, error: err.message });
  }
});
