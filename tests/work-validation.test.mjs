import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCommand, validateFilters } from '../features/work-items/validation.ts';
import { issueCode, progress } from '../features/work-items/types.ts';
const id='30000000-0000-4000-8000-000000000001';
test('入力検証: 課題とラベル正規化、4ステータス、日付・版・ID',()=>{
 const base={operation:'issue_create',title:'課題',description:'説明',status:'review',priority:'high',labels:['広報','広報','INFO'],due_on:'2026-10-20'};
 assert.deepEqual(validateCommand(base).payload.labels,['広報','info']);
 for(const change of [{title:''},{status:'blocked'},{due_on:'2026-02-30'},{assignee_id:'bad'},{labels:Array(11).fill('x')}])assert.throws(()=>validateCommand({...base,...change}));
 assert.throws(()=>validateCommand({...base,operation:'issue_update',id,expected_version:0}));
 assert.throws(()=>validateCommand({operation:'project_create',title:'x',status:'active',member_ids:[],start_on:'2026-11-01',due_on:'2026-10-01'}));
});
test('フィルター検証: SQL文字列で組み立てず、列・日付・ページ上限を制限',()=>{
 assert.deepEqual(validateFilters(new URLSearchParams({q:"%'",status:'done',project:id,limit:'50',offset:'50',archived:'false'})),{q:"%'",status:'done',project:id,archived:false,offset:50,limit:50});
 for(const query of [{sort:'drop table'},{limit:'10000'},{offset:'-1'},{due_before:'invalid'},{assignee:'other'}])assert.throws(()=>validateFilters(new URLSearchParams(query)));
});
test('表示計算: 実課題数から進捗、0件・1000番以上',()=>{
 assert.equal(progress({issue_count:0,completed_count:0}),0);assert.equal(progress({issue_count:3,completed_count:1}),33);assert.equal(issueCode(1),'ISSUE-001');assert.equal(issueCode(1000),'ISSUE-1000');
});
