import React from 'react';
import {describe,expect,it,vi} from 'vitest';
import {render,screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {MemoryRouter} from 'react-router-dom';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {Shell,State} from '../src/app';

vi.mock('echarts-for-react',()=>({default:()=> <div aria-label="Performance chart"/>}));

const ok=(data:unknown,meta:unknown={freshness:null})=>Promise.resolve(new Response(JSON.stringify({data,meta}),{status:200,headers:{'Content-Type':'application/json'}}));
function renderShell(){const client=new QueryClient({defaultOptions:{queries:{retry:false}}});return render(<QueryClientProvider client={client}><MemoryRouter><Shell/></MemoryRouter></QueryClientProvider>)}

describe('dashboard application',()=>{
 it('renders functional navigation and opens the mobile menu',async()=>{
  vi.stubGlobal('fetch',vi.fn((input:RequestInfo|URL)=>{
   const url=String(input);
   if(url.includes('/api/filters'))return ok({pools:[],strategies:[],roles:[],tools:[]});
   if(url.includes('/api/overview'))return ok({realized_pnl_usd:25.76,fees_earned_usd:146.5,trade_count:459,win_count:256,loss_count:147,breakeven_count:56,win_rate:.5577,average_return_pct:0,median_return_pct:0,profit_factor:{value:1.2,state:'finite'}});
   if(url.includes('/api/performance/series'))return ok([],{freshness:null,coverage:{eligible:459,included:459,total:460}});
   if(url.includes('/api/reliability/summary'))return ok({tool_actions:3521,successful_tool_actions:3011,tool_success_rate:.855,recent_reliability_failures:72});
   return ok([]);
  }));
  renderShell();
  expect(screen.getByText('Meridian Analytics')).toBeInTheDocument();
  expect(await screen.findByText('$25.76')).toBeInTheDocument();
  await userEvent.click(screen.getByLabelText('Open navigation'));
  expect(screen.getByLabelText('Mobile navigation')).toBeInTheDocument();
  expect(screen.getAllByText('Data Quality').length).toBeGreaterThan(0);
 });
 it('shows loading and error states without presenting missing data as zero',()=>{
  const {rerender}=render(<State loading error={null}>Ready</State>);
  expect(screen.getByLabelText('Loading data')).toBeInTheDocument();
  rerender(<State loading={false} error={new Error('offline')}>Ready</State>);
  expect(screen.getByRole('alert')).toHaveTextContent('could not load');
  expect(screen.queryByText('$0.00')).not.toBeInTheDocument();
 });
 it('contains no forbidden dash characters in authored visible copy',async()=>{
  const modules=import.meta.glob('../src/**/*.{ts,tsx,css}',{query:'?raw',import:'default',eager:true}) as Record<string,string>;
  const text=Object.values(modules).join('\n');
  expect(text).not.toContain(String.fromCodePoint(0x2014));
  expect(text).not.toContain(String.fromCodePoint(0x2013));
 });
});
