// A scripted stand-in for the model, for the sandbox proof only (RA-8676). It
// lets the proof drive the real `codex exec` launch path, the one the receipt
// review uses, with no login and no model call: Codex sends its request here,
// is told to run each probe command in turn through its `exec_command` tool, and
// then receives a fixed PASS verdict. Nothing it says is ever posted anywhere.
//
// Protocol, as observed from codex-cli 0.168.0 with `wire_api = "responses"`:
//   POST /v1/responses with `stream: true` and `accept: text/event-stream`.
//   Reply with server-sent events: response.created, one
//   response.output_item.done carrying either a `function_call` (name
//   `exec_command`, JSON `arguments` with `cmd`) or an assistant `message`, then
//   response.completed. Codex runs the call and sends the next request with a
//   `function_call_output` item (same `call_id`) holding the command output.
//
// Importing this file has no side effects; startFakeModel() listens on
// 127.0.0.1 only.
import http from 'node:http';

export const FINAL_VERDICT = JSON.stringify({
  verdict: 'PASS',
  summary: 'scripted sandbox probe run; no review was performed',
  findings: [],
});

const callId = (name) => `call_${String(name).replace(/[^A-Za-z0-9_-]/g, '_')}`;

/** Every function_call_output in a request body, as { call_id: output }. */
export function outputsOf(body) {
  const out = {};
  for (const item of Array.isArray(body?.input) ? body.input : []) {
    if (item?.type === 'function_call_output' && typeof item.call_id === 'string') {
      out[item.call_id] = typeof item.output === 'string' ? item.output : JSON.stringify(item.output);
    }
  }
  return out;
}

/** The output item for the next turn: the next probe command, or the final verdict. */
export function nextItem(probes, doneCount) {
  if (doneCount < probes.length) {
    const p = probes[doneCount];
    return {
      type: 'function_call',
      name: 'exec_command',
      call_id: callId(p.name),
      arguments: JSON.stringify({ cmd: p.cmd, login: false }),
    };
  }
  return {
    type: 'message',
    role: 'assistant',
    id: 'msg_nexus_probe_final',
    content: [{ type: 'output_text', text: FINAL_VERDICT }],
  };
}

/** The server-sent event stream for one turn. */
export function sseBody(turn, item) {
  const id = `resp_nexus_probe_${turn}`;
  const usage = { input_tokens: 0, output_tokens: 0, total_tokens: 0 };
  const events = [
    { type: 'response.created', response: { id } },
    { type: 'response.output_item.done', item },
    { type: 'response.completed', response: { id, usage } },
  ];
  return events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('');
}

function handle(probes, state, req, res) {
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', () => {
    if (req.method !== 'POST' || req.url !== '/v1/responses') {
      res.writeHead(404).end();
      return;
    }
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      res.writeHead(400).end();
      return;
    }
    Object.assign(state.outputs, outputsOf(body));
    const done = probes.filter((p) => callId(p.name) in state.outputs).length;
    state.turns += 1;
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.end(sseBody(state.turns, nextItem(probes, done)));
  });
}

/** Starts the fake model. probes: [{ name, cmd }]. Resolves to { port, outputFor, close }. */
export function startFakeModel(probes) {
  const state = { outputs: {}, turns: 0 };
  const server = http.createServer((req, res) => handle(probes, state, req, res));
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () =>
      resolve({
        port: server.address().port,
        turns: () => state.turns,
        outputFor: (name) => state.outputs[callId(name)],
        close: () => new Promise((r) => server.close(() => r())),
      })
    );
  });
}

/** The `-c` overrides that point codex exec at a fake model on this port. */
export function providerOverrides(port) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('bad port');
  return [
    'model_provider="nexus_probe"',
    'model="nexus-fake-model"',
    `model_providers.nexus_probe={name="nexus_probe",base_url="http://127.0.0.1:${port}/v1",wire_api="responses"}`,
  ];
}
