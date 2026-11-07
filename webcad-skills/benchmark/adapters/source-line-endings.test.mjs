import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {verifySourceHash} from '../oracle/native/frozen-reference.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
test('source receipts distinguish raw hashes while proving a CRLF-only checkout change',()=>{
 const lf='def fixture():\n    return 1\n',crlf=lf.replaceAll('\n','\r\n');
 const result=verifySourceHash(Buffer.from(crlf),hash(lf));
 assert.equal(result.matches,true);assert.equal(result.rawSha256,hash(crlf));assert.equal(result.lfSha256,hash(lf));assert.equal(result.normalization,'CRLF-to-LF-only');
 assert.equal(verifySourceHash(Buffer.from(lf),hash(lf)).normalization,'none');
 assert.equal(verifySourceHash(Buffer.from(crlf.replace('return 1','return 2')),hash(lf)).matches,false);
 assert.throws(()=>verifySourceHash(Buffer.from([0xff]),hash(lf)));
});
