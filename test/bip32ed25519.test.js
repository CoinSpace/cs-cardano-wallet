/* eslint-disable max-len */
import { Bip32PrivateKey } from '../lib/bip32ed25519.js';
import assert from 'assert/strict';

const RANDOM_SEED = '3e818cec5efc7505369fae3f162af61130b673fa9b40e5955d5cde22a85afa03748d074356a281a5fc1dbd0b721357c56095a54de8d4bc6ecaa288f300776ae4';

describe('bip32ed25519', () => {
  it('should derivate correct hdkey 0/0', () => {
    const hdkey = Bip32PrivateKey.fromSeed(Buffer.from(RANDOM_SEED, 'hex'))
      .derive(0x80000000 + 1852)
      .derive(0x80000000 + 1815)
      .derive(0x80000000 + 0)
      .derive(0)
      .derive(0);
    assert.equal(hdkey.toBytes().toString('hex'), '709e83e7811950c3a0b94f323e897b56c80b21bb85cf31ee8fc5ed261e88485f962d0d658c71061bf7adabf5fb1e0b2f005992b975b52d742a34be808d1d9e1571830dcbf72fa834f4d57f579e17b419c34c11c10016609133f236ef371a9c79');
  });

  it('should derivate correct hdkey 2/0', () => {
    const hdkey = Bip32PrivateKey.fromSeed(Buffer.from(RANDOM_SEED, 'hex'))
      .derive(0x80000000 + 1852)
      .derive(0x80000000 + 1815)
      .derive(0x80000000 + 0)
      .derive(2)
      .derive(0);
    assert.equal(hdkey.toBytes().toString('hex'), '982a278edb48ec88c6e74a0f9f6a2e90a30f31285e5d3a8d238c29652188485f2bf26aa73c7e5bdba9684936f6a41a4b99956c4e04168a23437ff985e132afff2057fa6cf991cc72aaa51d07ba7a32aaec2da2482a46091de7cc7513dd1ea521');
  });
});
