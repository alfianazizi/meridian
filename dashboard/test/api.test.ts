import { beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../src/db/connection.js';
import { buildApp } from '../src/api/app.js';

let db: ReturnType<typeof openDatabase>;

beforeEach(() => {
  db = openDatabase(':memory:');
  const perf = db.prepare(`INSERT INTO performance_records
    (position,pool,pool_name,strategy,initial_value_usd,final_value_usd,fees_earned_usd,pnl_usd,pnl_pct,recorded_at,performance_quality,raw_json,source_hash,source_file)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  perf.run('A','POOL','Alpha','bid_ask',100,110,2,12,12,'2026-01-01T00:00:00Z','verified_modern','{}','x','lessons.json');
  perf.run('B','POOL','Alpha','bid_ask',100,90,1,-9,-9,'2026-01-02T00:00:00Z','verified_modern','{}','x','lessons.json');
  perf.run('C','POOL2','Beta','spot',100,100,3,0.005,0.005,'2026-01-03T00:00:00Z','legacy_performance_only','{}','x','lessons.json');
  perf.run('D','POOL2','Beta','spot',0,0,0,0,0,'2026-01-04T00:00:00Z','invalid_zero_cost_basis','{}','x','lessons.json');
  db.prepare(`INSERT INTO positions(position,pool,pool_name,strategy,closed,raw_json,source_hash,source_file) VALUES('A','POOL','Alpha','bid_ask',1,'{}','x','state.json')`).run();
  const action=db.prepare(`INSERT INTO action_events(generation_id,byte_offset,source_file,timestamp,tool,duration_ms,success,raw_json,content_hash) VALUES(0,?,'actions','2026-01-01T00:00:00Z',?,?,?,'{}','x')`);
  action.run(1,'deploy_position',10,1); action.run(2,'deploy_position',20,0); action.run(3,'close_position',30,1);
  db.prepare(`INSERT INTO decisions(id,ts,type,actor,reason,raw_json,source_hash,source_file) VALUES('D1','2026-01-01T00:00:00Z','no_deploy','SCREENER','Max steps reached','{}','x','decision-log.json')`).run();
});

describe('read-only API', () => {
  it('calculates honest overview metrics and keeps fees separate', async () => {
    const app=buildApp(db); const r=await app.inject({method:'GET',url:'/api/overview'}); const b=r.json();
    expect(r.statusCode).toBe(200); expect(b.data.realized_pnl_usd).toBe(3.005);
    expect(b.data.fees_earned_usd).toBe(6); expect(b.data.win_count).toBe(1);
    expect(b.data.loss_count).toBe(1); expect(b.data.breakeven_count).toBe(1);
    expect(b.data.profit_factor.value).toBeCloseTo(12/9); expect(b.meta.coverage.included).toBe(3);
    await app.close();
  });
  it('returns cumulative realized PnL and realized-close drawdown', async () => {
    const app=buildApp(db); const b=(await app.inject({method:'GET',url:'/api/performance/series'})).json();
    expect(b.data.map((x:any)=>x.cumulative_pnl_usd)).toEqual([12,3,3.005]);
    expect(b.data[1].drawdown_usd).toBe(-9); await app.close();
  });
  it('provides reliability and nearest-rank tool latency', async () => {
    const app=buildApp(db); const b=(await app.inject({method:'GET',url:'/api/reliability/tools'})).json();
    const deploy=b.data.find((x:any)=>x.tool==='deploy_position'); expect(deploy.success_rate).toBe(0.5);
    expect(deploy.p50_ms).toBe(10); expect(deploy.p95_ms).toBe(20); await app.close();
  });
  it('validates pagination and rejects sort injection', async () => {
    const app=buildApp(db); expect((await app.inject({method:'GET',url:'/api/positions?sort=position;drop table positions'})).statusCode).toBe(400);
    expect((await app.inject({method:'GET',url:'/api/positions?pageSize=9999'})).statusCode).toBe(400); await app.close();
  });
  it('exposes health, data, CSV and no mutation endpoint', async () => {
    const app=buildApp(db); expect((await app.inject({method:'GET',url:'/api/health'})).statusCode).toBe(200);
    const csv=await app.inject({method:'GET',url:'/api/export/performance.csv'}); expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.body).toContain('position,pool_name'); expect((await app.inject({method:'POST',url:'/api/overview'})).statusCode).toBe(404); await app.close();
  });
});
