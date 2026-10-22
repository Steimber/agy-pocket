import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createSessionToken,
  verifySessionToken,
  verifyPinInput,
  createBridgeInternalHeader,
  verifyBridgeInternalHeader
} from '../lib/auth.js';

import {
  isValidConversationId,
  extractCleanUserText,
  summarizeToolCall,
  parseTranscriptStepsToMessages
} from '../lib/agy-bridge.js';

import {
  encryptBridgeUrl,
  decryptBridgeUrl,
  normalizeBridgeBaseUrl
} from '../lib/bridge-crypto.js';

test('auth: 90-day session token validates before expiry and rejects tampering or expired tokens', () => {
  const now = 1_700_000_000_000;
  const secret = 'test-secret-key-minimum-16-chars';
  const token = createSessionToken(now, secret);

  assert.equal(verifySessionToken(token, now + 1000, secret), true);
  // 89 days later -> still valid
  assert.equal(verifySessionToken(token, now + 89 * 24 * 60 * 60 * 1000, secret), true);
  // 91 days later -> expired
  assert.equal(verifySessionToken(token, now + 91 * 24 * 60 * 60 * 1000, secret), false);
  // Tampered signature -> rejected
  assert.equal(verifySessionToken(`${token}a`, now + 1000, secret), false);
  // Empty secret -> rejected
  assert.equal(verifySessionToken(token, now + 1000, ''), false);
});

test('auth: verifyPinInput uses constant-time comparison and trims whitespace', () => {
  assert.equal(verifyPinInput('1919', '1919'), true);
  assert.equal(verifyPinInput(' 1919 ', '1919'), true);
  assert.equal(verifyPinInput('1918', '1919'), false);
  assert.equal(verifyPinInput('', '1919'), false);
  assert.equal(verifyPinInput('1919', ''), false);
});

test('bridge-crypto: AES-256-GCM encrypts and decrypts tunnel URL and rejects wrong PIN/secret or localhost', () => {
  const url = 'https://orange-river-4510.trycloudflare.com/';
  const secret = 'my-private-secret-key-32-chars!!';
  const env = encryptBridgeUrl(url, secret, '849201');
  assert.equal(env.v, 1);
  assert.equal(
    decryptBridgeUrl(env, secret, '849201'),
    'https://orange-river-4510.trycloudflare.com'
  );
  // Wrong PIN or secret cannot decrypt
  assert.equal(decryptBridgeUrl(env, secret, '000000'), null);
  assert.equal(decryptBridgeUrl(env, 'wrong-secret-key-minimum-16-char', '849201'), null);
  // Localhost / private / link-local IPs are rejected as remote bridge URL
  assert.equal(normalizeBridgeBaseUrl('http://127.0.0.1:3456'), null);
  assert.equal(normalizeBridgeBaseUrl('http://localhost:3456'), null);
  assert.equal(normalizeBridgeBaseUrl('http://[::1]:3456'), null);
  assert.equal(normalizeBridgeBaseUrl('http://169.254.169.254/latest'), null);
  assert.equal(normalizeBridgeBaseUrl('http://192.168.1.10:3456'), null);

  // Internal bridge HMAC header
  const now = 1_700_000_000_000;
  const hdr = createBridgeInternalHeader(now, secret);
  assert.equal(verifyBridgeInternalHeader(hdr, now + 5000, secret), true);
  assert.equal(verifyBridgeInternalHeader(hdr, now + 360_000, secret), false);
});

test('agy-bridge: extractCleanUserText extracts <USER_REQUEST> and ignores pure <SYSTEM_MESSAGE>', () => {
  const wrapped =
    '<USER_REQUEST>\nhola agy revisa los tests\n</USER_REQUEST>\n<ADDITIONAL_METADATA>...</ADDITIONAL_METADATA>';
  assert.equal(extractCleanUserText(wrapped), 'hola agy revisa los tests');

  const systemOnly = '<SYSTEM_MESSAGE>\nTask finished\n</SYSTEM_MESSAGE>';
  assert.equal(extractCleanUserText(systemOnly), '');

  const summaryOnly = '<CONTEXT_SUMMARY>\nTruncated history\n</CONTEXT_SUMMARY>';
  assert.equal(extractCleanUserText(summaryOnly), '');
});

test('agy-bridge: parseTranscriptStepsToMessages groups consecutive PLANNER_RESPONSE steps with thinking and toolCalls', () => {
  const steps = [
    {
      step_index: 10,
      type: 'USER_INPUT',
      source: 'USER_EXPLICIT',
      status: 'DONE',
      created_at: '2026-10-21T20:00:00Z',
      content: '<USER_REQUEST>\ncorre npm test\n</USER_REQUEST>'
    },
    {
      step_index: 11,
      type: 'PLANNER_RESPONSE',
      source: 'MODEL',
      status: 'DONE',
      created_at: '2026-10-21T20:00:02Z',
      thinking: 'Voy a correr los tests primero.',
      tool_calls: [
        {
          name: 'default_api:run_command',
          args: { toolSummary: 'Run unit tests', CommandLine: 'npm test' }
        }
      ]
    },
    {
      step_index: 12,
      type: 'GENERIC',
      source: 'MODEL',
      status: 'DONE',
      content: 'Command exited with code 0'
    },
    {
      step_index: 13,
      type: 'PLANNER_RESPONSE',
      source: 'MODEL',
      status: 'DONE',
      created_at: '2026-10-21T20:00:05Z',
      thinking: 'Todos los tests pasaron.',
      content: '¡Listo! Pasaron todos los tests.'
    }
  ];

  const messages = parseTranscriptStepsToMessages(steps);
  assert.equal(messages.length, 2);
  assert.equal(messages[0].role, 'user');
  assert.equal(messages[0].content, 'corre npm test');

  assert.equal(messages[1].role, 'assistant');
  assert.deepEqual(messages[1].thinking, [
    'Voy a correr los tests primero.',
    'Todos los tests pasaron.'
  ]);
  assert.equal(messages[1].toolCalls.length, 1);
  assert.deepEqual(messages[1].toolCalls[0], {
    name: 'run_command',
    summary: 'Run unit tests'
  });
  assert.equal(messages[1].content, '¡Listo! Pasaron todos los tests.');
  assert.equal(isValidConversationId('451012b4-4236-43f3-9be5-13089dcc32c2'), true);
  assert.equal(isValidConversationId('../etc/passwd'), false);
});

test('agy-bridge: parseTranscriptStepsToMessages preserves media attachments and safely handles % in filenames', () => {
  const steps = [
    {
      step_index: 20,
      type: 'USER_INPUT',
      source: 'USER_EXPLICIT',
      status: 'DONE',
      created_at: '2026-10-21T21:00:00Z',
      content: '',
      media: [
        {
          mime_type: 'image/png',
          uri: 'C:\\Users\\randy\\.gemini\\capture_100%.png'
        }
      ]
    }
  ];
  const messages = parseTranscriptStepsToMessages(steps);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].role, 'user');
  assert.equal(messages[0].media.length, 1);
  assert.equal(messages[0].media[0].name, 'capture_100%.png');
});
