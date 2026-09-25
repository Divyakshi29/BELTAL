import { useEffect, useState } from 'react';
import web3Service from '../services/web3';

/**
 * Live head block on the configured chain, refreshed on an interval.
 *
 * The dashboards used to print a hardcoded block number as decoration. On a
 * system whose entire claim is that every record can be independently checked,
 * a made-up figure on screen is the one thing that undermines the pitch — so
 * this returns the real head block, or null when the RPC cannot be reached,
 * and callers render "unreachable" rather than inventing a number.
 */
export default function useBlockNumber(intervalMs = 30_000) {
  const [blockNumber, setBlockNumber] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const read = async () => {
      const head = await web3Service.getBlockNumber();
      if (!cancelled) setBlockNumber(head);
    };
    read();
    const timer = setInterval(read, intervalMs);
    return () => { cancelled = true; clearInterval(timer); };
  }, [intervalMs]);

  return blockNumber;
}
