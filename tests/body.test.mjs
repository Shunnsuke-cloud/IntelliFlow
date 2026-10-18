import test from 'node:test';
import assert from 'node:assert/strict';
import {readJsonBody,BodyError} from '../lib/auth/body.ts';
const req=body=>new Request('http://localhost/api/test',{method:'POST',body});
test('API入力: JSONオブジェクト・日本語を受理し、配列/不正JSON/壊れたUTF-8を拒否',async()=>{
 assert.deepEqual(await readJsonBody(req('{"title":"課題"}')),{title:'課題'});
 for(const value of ['[]','null','1','bad'])await assert.rejects(readJsonBody(req(value)),e=>e instanceof BodyError&&e.status===400);
 await assert.rejects(readJsonBody(req(new Uint8Array([255]))),e=>e.status===400);
});
test('API入力: 文字数と宣言サイズ・長さ不明のストリームを読込中に制限',async()=>{
 await assert.rejects(readJsonBody(req(JSON.stringify({input:'x'.repeat(24000)}))),e=>e.status===413);
 await assert.rejects(readJsonBody(new Request('http://localhost/api/test',{method:'POST',headers:{'content-length':'1000000'},body:'{}'})),e=>e.status===413);
 let cancelled=false;const stream=new ReadableStream({start(c){c.enqueue(new Uint8Array(96001));},cancel(){cancelled=true;}});
 await assert.rejects(readJsonBody(new Request('http://localhost/api/test',{method:'POST',body:stream,duplex:'half'})),e=>e.status===413);assert.equal(cancelled,true);
});
