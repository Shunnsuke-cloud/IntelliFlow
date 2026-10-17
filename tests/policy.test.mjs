import test from 'node:test';
import assert from 'node:assert/strict';
import { safeNext, validatedUser, sameOrigin, canAssign } from '../lib/auth/policy.ts';
import { publicKey } from '../lib/supabase/config.ts';
test('認証: 無効・未ログイン・匿名セッションを拒否', () => {
  assert.equal(validatedUser({ data: { user: null }, error: null }), null);
  assert.equal(validatedUser({ data: { user: { id: 'u' } }, error: new Error() }), null);
  assert.equal(validatedUser({ data: { user: { id: 'u', is_anonymous: true } }, error: null }), null);
  assert.equal(validatedUser({ data: { user: { id: 'u' } }, error: null })?.id, 'u');
});
test('認証: 外部リダイレクトとCSRFを拒否、招待fragmentを維持', () => {
  for (const path of ['https://example.com','//example.com','/\\example.com','/\r\nexample.com','/\t/example.com','/ /example.com']) assert.equal(safeNext(path), '/app');
  assert.equal(safeNext('/invite#abc'), '/invite#abc');
  assert.equal(sameOrigin(new Request('https://intelliflow.test/api/workspaces', { headers: { origin: 'https://attacker.test' } })), false);
  assert.equal(sameOrigin(new Request('https://intelliflow.test/api/workspaces', { headers: { origin: 'https://intelliflow.test' } })), true);
});
test('設定: Service Role Keyを公開クライアントに使わせない', () => {
  const jwt = role => `x.${Buffer.from(JSON.stringify({role})).toString('base64')}.x`;
  assert.equal(publicKey(jwt('service_role')), false);
  assert.equal(publicKey('sb_secret_fake'), false);
  assert.equal(publicKey(jwt('anon')), true);
  assert.equal(publicKey(undefined), false);
});
test('UI権限: AdminはOwner/Adminを管理できない', () => {
  assert.equal(canAssign('admin','owner','member'), false);
  assert.equal(canAssign('admin','member','admin'), false);
  assert.equal(canAssign('member','member','viewer'), false);
  assert.equal(canAssign('admin','member','viewer'), true);
  assert.equal(canAssign('owner','admin','owner'), true);
});
