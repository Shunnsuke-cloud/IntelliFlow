import test from 'node:test';
import assert from 'node:assert/strict';
import {flowFilters,relationInput,FlowInputError} from '../features/flow/validation.ts';
import {mergeGraph,flowHref,canLink,MAX_NODES,MAX_EDGES} from '../features/flow/types.ts';
const id=n=>`50000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('Flow入力: 検索条件・実在日付・文字数・重複キー・ページ・更新版を検証',()=>{
 assert.deepEqual(flowFilters(new URLSearchParams({q:' イベント 問題 ',kind:'wiki',from:'2024-02-29',archived:'true',offset:'10'})),{q:'イベント 問題',kind:'wiki',from:'2024-02-29',archived:true,offset:10});
 for(const values of [{from:'2023-02-29'},{from:'2026-99-99'},{from:'2026-10-01',to:'2020-01-01'},{q:'x'.repeat(201)},{q:'a b c d e f g h i'},{offset:'10001'},{offset:'-1'},{kind:'unknown'},{project:'invalid'},{archived:'yes'},{limit:'1000'}])assert.throws(()=>flowFilters(new URLSearchParams(values)),FlowInputError);
 assert.throws(()=>flowFilters(new URLSearchParams('q=one&q=two')),FlowInputError);
 assert.throws(()=>relationInput({operation:'link',source_id:id(1),target_id:id(1),source_version:1,target_version:1}),FlowInputError);
 assert.throws(()=>relationInput({operation:'link',source_id:id(1),target_id:id(2),source_version:0,target_version:1}),FlowInputError);
 assert.equal(relationInput({operation:'link',source_id:id(1),target_id:id(2),source_version:1,target_version:2}).payload.target_version,2);
});
test('Flow表示: IDリンク・関連の組合せ・重複排除・ノード/線の上限',()=>{
 const a={id:id(1),kind:'issue',archived_at:null},b={id:id(2),kind:'wiki',archived_at:null};assert.ok(canLink(a,b));assert.equal(flowHref('ws',b),`/app/w/ws/wiki/${b.id}`);assert.equal(canLink(a,{...b,kind:'project'}),false);
 const base={nodes:[],edges:[],result_ids:[],offset:0,limit:10,has_more:false};
 const huge={...base,nodes:Array.from({length:MAX_NODES+10},(_,i)=>({id:id(i)})),edges:Array.from({length:MAX_EDGES+10},(_,i)=>({id:String(i),source_id:id(1),target_id:id(2)}))};
 const graph=mergeGraph(base,huge);assert.equal(graph.nodes.length,MAX_NODES);assert.equal(graph.edges.length,MAX_EDGES);assert.equal(mergeGraph(graph,huge).nodes.length,MAX_NODES);
 const updated=mergeGraph(graph,{...base,nodes:[{id:id(1),title:'最新版'}]});assert.equal(updated.nodes.find(n=>n.id===id(1)).title,'最新版');
 assert.equal(mergeGraph(base,{...base,edges:[{id:'dangling',source_id:id(1),target_id:id(2)}]}).edges.length,0);
});
