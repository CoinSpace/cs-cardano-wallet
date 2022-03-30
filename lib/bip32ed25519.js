import bip32ed25519 from '@stricahq/bip32ed25519';
import crypto from 'crypto';

/**
 * https://github.com/satoshilabs/slips/blob/master/slip-0010.md
 * https://github.com/cardano-foundation/CIPs/tree/master/CIP-1852
 */

const MASTER_SECRET = Buffer.from('ed25519 seed', 'utf8');

function hashRepeatedly(seed) {
  let currSeed = seed;
  let I;
  let IL;
  let IR;
  do {
    I = crypto.createHmac('sha512', MASTER_SECRET)
      .update(currSeed)
      .digest();
    currSeed = I;
    IL = I.slice(0, 32);
    IR = I.slice(32);
    // 0b00100000 = 32
  } while ((IL[31] & 32) !== 0);

  return [IL, IR];
}

export class Bip32PrivateKey extends bip32ed25519.Bip32PrivateKey {
  static fromSeed(seed) {
    const [IL, IR] = hashRepeatedly(seed);

    // As described in [RFC 8032 - 5.1.5](https://tools.ietf.org/html/rfc8032#section-5.1.5)
    // Clear the lowest 3 bits of the first byte
    IL[0] &= 248;
    // Clear highest bit and set the second highest bit of the last byte
    IL[31] &= 63;
    IL[31] |= 64;

    // note: prefix 1 and sha256 (not 512)
    const chainCode = crypto.createHmac('sha256', MASTER_SECRET)
      .update(Buffer.concat([Buffer.of(1), seed]))
      .digest();

    const xprv = Buffer.concat([IL, IR, chainCode]);
    return new Bip32PrivateKey(xprv);
  }

  free() {
    this.xprv.fill(0);
  }
}

/**
 * monkey patch
 */

bip32ed25519.Bip32PrivateKey.prototype.free = function() {
  this.xprv.fill(0);
};

export { Bip32PublicKey, PrivateKey, PublicKey } from '@stricahq/bip32ed25519';
