// Shared runtime compatibility. Goldenluck serves an identical copy in Web/AI.
(function () {
  const source = globalThis.crypto;
  // LAN HTTP has getRandomValues but no SubtleCrypto. File transfer needs
  // SHA-256 only; keep native crypto untouched whenever it is available.
  if (source && !source.subtle) {
    const constants = new Uint32Array([
      0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
      0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
      0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
      0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
      0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
      0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
      0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
      0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
    ]);
    const rotate = (word, bits) => (word >>> bits) | (word << (32 - bits));
    Object.defineProperty(source, 'subtle', { configurable: true, value: Object.freeze({
      async digest(algorithm, data) {
        if (String(typeof algorithm === 'string' ? algorithm : algorithm?.name).toUpperCase() !== 'SHA-256') {
          throw new DOMException('HTTP compatibility supports SHA-256 only.', 'NotSupportedError');
        }
        if (!(data instanceof ArrayBuffer) && !ArrayBuffer.isView(data)) throw new TypeError('Expected BufferSource');
        const bytes = ArrayBuffer.isView(data) ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : new Uint8Array(data);
        const state = new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]);
        const words = new Uint32Array(64);
        function block(view, offset) {
          for (let i = 0; i < 16; i++) words[i] = view.getUint32(offset + i * 4);
          for (let i = 16; i < 64; i++) {
            const x = words[i - 15], y = words[i - 2];
            words[i] = words[i - 16] + (rotate(x,7) ^ rotate(x,18) ^ (x >>> 3)) + words[i - 7] + (rotate(y,17) ^ rotate(y,19) ^ (y >>> 10));
          }
          let [a,b,c,d,e,f,g,h] = state;
          for (let i = 0; i < 64; i++) {
            const t1 = (h + (rotate(e,6) ^ rotate(e,11) ^ rotate(e,25)) + ((e & f) ^ (~e & g)) + constants[i] + words[i]) | 0;
            const t2 = ((rotate(a,2) ^ rotate(a,13) ^ rotate(a,22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
            h=g; g=f; f=e; e=(d+t1)|0; d=c; c=b; b=a; a=(t1+t2)|0;
          }
          [a,b,c,d,e,f,g,h].forEach((value, index) => { state[index] += value; });
        }
        const fullLength = bytes.length - bytes.length % 64;
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        for (let offset = 0; offset < fullLength; offset += 64) block(view, offset);
        // Only allocate the final one/two blocks, even for large CAD files.
        const tail = new Uint8Array(bytes.length % 64 < 56 ? 64 : 128);
        tail.set(bytes.subarray(fullLength)); tail[bytes.length % 64] = 0x80;
        const ending = new DataView(tail.buffer), bitLength = bytes.length * 8;
        ending.setUint32(tail.length - 8, Math.floor(bitLength / 0x100000000));
        ending.setUint32(tail.length - 4, bitLength >>> 0);
        for (let offset = 0; offset < tail.length; offset += 64) block(ending, offset);
        const result = new ArrayBuffer(32), output = new DataView(result);
        state.forEach((word, index) => output.setUint32(index * 4, word));
        return result;
      }
    }) });
  }
  if (typeof source?.randomUUID === 'function') return;
  if (typeof source?.getRandomValues !== 'function') throw new Error('Secure random number support is required.');
  Object.defineProperty(source, 'randomUUID', { configurable: true, value() {
    const bytes = source.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
  }});
})();
