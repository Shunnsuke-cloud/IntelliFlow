import test from 'node:test';
import assert from 'node:assert/strict';
import {handoffInput,handoffFilters,HandoffInputError} from '../features/handoffs/validation.ts';
const id='60000000-0000-4000-8000-000000000001';const other='60000000-0000-4000-8000-000000000002';
const body={operation:'create',title:' 引き継ぎ ',summary:'概要',current_state:'進捗',completed_work:'完了',pending_work:'未完了',risks:'注意',next_actions:'次',related_ids:[id,id],recipient_id:other};
test('Handoff入力: 全項目・関連ID・受取人・版・改訂理由・上限を検証',()=>{
 const value=handoffInput(body);assert.equal(value.payload.title,'引き継ぎ');assert.deepEqual(value.payload.related_ids,[id]);assert.equal(handoffInput({...body,recipient_id:''}).payload.recipient_id,null);
 for(const patch of [{title:''},{summary:'x'.repeat(10001)},{related_ids:Array(31).fill(id)},{recipient_id:'invalid'},{operation:'accept',id,expected_version:1,content_version:0},{operation:'update',id,expected_version:0},{operation:'revise',id,expected_version:1,change_reason:''}])assert.throws(()=>handoffInput({...body,...patch}),HandoffInputError);
 assert.equal(handoffInput({...body,operation:'revise',id,expected_version:2,change_reason:'理由'}).payload.change_reason,'理由');
});
test('Handoff検索: 状態・誰から誰へ・自分宛て・ページ・重複キーを検証',()=>{
 assert.deepEqual(handoffFilters(new URLSearchParams({q:'受付',status:'sent',mine:'true',sender:id,offset:'20'})),{q:'受付',status:'sent',mine:true,sender:id,offset:20});
 for(const query of ['q=a&q=b','offset=-1','offset=10001','status=unknown','mine=yes','version=0','sender=invalid','secret=x'])assert.throws(()=>handoffFilters(new URLSearchParams(query)),HandoffInputError);
});
