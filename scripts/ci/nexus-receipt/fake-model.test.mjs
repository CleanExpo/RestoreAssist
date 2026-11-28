// Tests for the scripted fake model the sandbox proof drives `codex exec` with
// (RA-8676). Node built-ins only. The server listens on 127.0.0.1 only.
import assert from 'node:assert/strict';
import test from 'node:test';
import { FINAL_VERDICT, nextItem, outputsOf, providerOverrides, sseBody, startFakeModel } from './fake-model.mjs';

const probes = [
  { name: 'outside-read', cmd: 'echo one' },
  { name: 'git', cmd: 'echo two' },
];

async function post(port, body) {
  const res = await fetch(`http://127.0.0.1:${port}/v1/responses`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, text: await res.text() };
}

const itemOf = (sse) =>
  sse.split('\n\n').filter(Boolean).map((b) => JSON.parse(b.split('\ndata: ')[1]))
    .find((e) => e.type === 'response.output_item.done').item;

test('each turn asks for the next probe command, then gives the fixed verdict', async () => {
  const m = await startFakeModel(probes);
  try {
    const first = itemOf((await post(m.port, { input: [] })).text);
    assert.equal(first.type, 'function_call');
    assert.equal(first.name, 'exec_command');
    assert.deepEqual(JSON.parse(first.arguments), { cmd: 'echo one', login: false });
    const out1 = { type: 'function_call_output', call_id: first.call_id, output: 'Output:\nA\n' };
    const second = itemOf((await post(m.port, { input: [out1] })).text);
    assert.deepEqual(JSON.parse(second.arguments).cmd, 'echo two');
    const out2 = { type: 'function_call_output', call_id: second.call_id, output: 'Output:\nB\n' };
    const last = itemOf((await post(m.port, { input: [out1, out2] })).text);
    assert.equal(last.type, 'message');
    assert.equal(last.content[0].text, FINAL_VERDICT);
    assert.equal(m.outputFor('outside-read'), 'Output:\nA\n');
    assert.equal(m.outputFor('git'), 'Output:\nB\n');
    assert.equal(m.turns(), 3);
  } finally {
    await m.close();
  }
});

test('the stream carries created, one output item and completed, in that order', () => {
  const events = sseBody(1, nextItem(probes, 0)).split('\n\n').filter(Boolean)
    .map((b) => b.split('\n')[0].replace('event: ', ''));
  assert.deepEqual(events, ['response.created', 'response.output_item.done', 'response.completed']);
});

test('the final verdict is a schema-valid PASS with no findings', () => {
  assert.deepEqual(JSON.parse(FINAL_VERDICT).findings, []);
  assert.equal(JSON.parse(FINAL_VERDICT).verdict, 'PASS');
});

test('anything but POST /v1/responses with JSON is refused', async () => {
  const m = await startFakeModel(probes);
  try {
    assert.equal((await fetch(`http://127.0.0.1:${m.port}/other`, { method: 'POST' })).status, 404);
    const bad = await fetch(`http://127.0.0.1:${m.port}/v1/responses`, { method: 'POST', body: '{' });
    assert.equal(bad.status, 400);
  } finally {
    await m.close();
  }
});

test('outputs are read only from function_call_output items', () => {
  const body = { input: [{ type: 'message', call_id: 'x', output: 'no' },
    { type: 'function_call_output', call_id: 'call_git', output: 'yes' }] };
  assert.deepEqual(outputsOf(body), { call_git: 'yes' });
  assert.deepEqual(outputsOf(null), {});
});

test('the provider overrides point at 127.0.0.1 and nothing else', () => {
  const o = providerOverrides(4321);
  assert.ok(o.every((x) => /^(model|model_provider|model_providers\.nexus_probe)=/.test(x)));
  assert.match(o[2], /base_url="http:\/\/127\.0\.0\.1:4321\/v1"/);
  assert.throws(() => providerOverrides(0));
  assert.throws(() => providerOverrides('4321'));
});
