import {test} from 'node:test';
import assert from 'node:assert/strict';
import {describeOBSConnectionFailure} from '../dist/obs.js';

test('OBS bad password reports authentication error without leaking credentials',()=>{
 const secret='DO_NOT_EXPOSE_MY_PASSWORD';
 const result=describeOBSConnectionFailure({code:4009,message:'Authentication failed '+secret});
 assert.match(result,/authentication failed/i);
 assert.doesNotMatch(result,new RegExp(secret));
});
test('OBS WebSocket not listening on localhost reports actionable port guidance',()=>{
 const result=describeOBSConnectionFailure(new Error('connect ECONNREFUSED 127.0.0.1:4455'));
 assert.match(result,/enable WebSocket Server/i);
 assert.match(result,/4455/);
});
test('unsupported OBS WebSocket RPC rejects with version guidance',()=>{
 assert.match(describeOBSConnectionFailure({code:4010,message:'unsupported rpc'}),/OBS Studio 28/);
});
test('invalid host is diagnosed without including a private hostname',()=>{
 assert.match(describeOBSConnectionFailure(new Error('getaddrinfo ENOTFOUND private.example.local')),/127\.0\.0\.1:4455/);
});
test('timeout returns safe general network guidance',()=>{
 assert.match(describeOBSConnectionFailure(new Error('connect ETIMEDOUT')),/did not respond/);
});
test('unknown error never exposes raw untrusted error text',()=>{
 const secret='OBS_USER_SECRET_TOKEN';
 const result=describeOBSConnectionFailure(new Error(secret));
 assert.match(result,/not connected/i);
 assert.doesNotMatch(result,new RegExp(secret));
});
