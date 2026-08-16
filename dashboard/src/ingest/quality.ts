import type { DB } from '../db/connection.js';

export function reconcileQuality(db: DB): number {
  let changed = 0;
  const tx = db.transaction(() => {
    changed += db.prepare(
      `UPDATE performance_records
       SET performance_quality = CASE
         WHEN initial_value_usd IS NULL OR initial_value_usd <= 0 THEN 'invalid_zero_cost_basis'
         WHEN EXISTS (SELECT 1 FROM positions p WHERE p.position = performance_records.position)
          AND EXISTS (SELECT 1 FROM action_events a WHERE a.position = performance_records.position
            AND a.tool = 'close_position' AND a.success = 1)
          THEN 'verified_modern'
         ELSE 'legacy_performance_only'
       END`
    ).run().changes;

    changed += db.prepare(
      `UPDATE positions
       SET closure_quality = CASE
         WHEN autoclose = 1 AND NOT EXISTS
          (SELECT 1 FROM performance_records pr WHERE pr.position = positions.position)
          THEN 'state_sync_unreconciled'
         WHEN EXISTS (SELECT 1 FROM performance_records pr WHERE pr.position = positions.position)
          THEN 'verified'
         ELSE closure_quality
       END`
    ).run().changes;

    changed += db.prepare(
      `UPDATE action_events
       SET quality = 'verified_close_no_performance'
       WHERE tool = 'close_position' AND success = 1 AND position IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM performance_records pr WHERE pr.position = action_events.position)`
    ).run().changes;
  });
  tx();
  return changed;
}
