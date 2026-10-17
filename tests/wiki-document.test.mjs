import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDocument,safeHref,documentText,imageType,imageIds } from '../features/wiki/document.ts';
const paragraph=text=>({type:'paragraph',content:[{type:'text',text}]});
test('Wiki本文: 見出し・リスト・チェック・リンクを正規化し検索文を抽出',()=>{
 const doc={type:'doc',content:[{type:'heading',attrs:{level:2},content:[{type:'text',text:'手順'}]},{type:'bulletList',content:[{type:'listItem',content:[paragraph('準備する')]}]},{type:'taskList',content:[{type:'taskItem',attrs:{checked:true},content:[paragraph('確認した')]}]},{type:'paragraph',content:[{type:'text',text:'参考',marks:[{type:'link',attrs:{href:'https://example.com',target:'_blank',rel:'noopener',class:null}}]}]}]};
 const value=validateDocument(doc);assert.match(documentText(value),/確認した/);assert.deepEqual(value.content[3].content[0].marks[0].attrs,{href:'https://example.com/'});
});
test('XSS: スクリプト・任意HTML・イベント属性・外部画像・危険URLを拒否',()=>{
 for(const href of ['javascript:alert(1)','data:text/html,test','vbscript:x','//attacker.test','https://good.test\n<script>'])assert.equal(safeHref(href),null);
 for(const node of [{type:'script',text:'alert(1)'},{type:'paragraph',attrs:{onerror:'alert(1)'}},{type:'image',attrs:{src:'https://attacker.test/x'}},{type:'paragraph',content:[{type:'text',text:'x',marks:[{type:'link',attrs:{href:'javascript:alert(1)'}}]}]}])assert.throws(()=>validateDocument({type:'doc',content:[node]}));
 const literal=validateDocument({type:'doc',content:[paragraph('<script>alert(1)</script>')]});assert.equal(documentText(literal).trim(),'<script>alert(1)</script>');
});
test('本文上限・不正な階層・画像ID検証・画像の署名判定',()=>{
 assert.throws(()=>validateDocument({type:'doc',content:[paragraph('x'.repeat(60001))]}));
 assert.throws(()=>validateDocument({type:'doc',content:[{type:'bulletList',content:[paragraph('不正')]}]}));
 const id='40000000-0000-4000-8000-000000000001';const doc=validateDocument({type:'doc',content:[{type:'image',attrs:{attachmentId:id,alt:'資料'}}]});assert.deepEqual(imageIds(doc),[id]);
 assert.equal(imageType(new Uint8Array([137,80,78,71,13,10,26,10])),'image/png');assert.equal(imageType(new Uint8Array([255,216,255])),'image/jpeg');assert.equal(imageType(new TextEncoder().encode('<svg onload="alert(1)">')),null);
});
