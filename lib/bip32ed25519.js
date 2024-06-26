import { Buffer } from 'buffer';
import bip32ed25519 from '@stricahq/bip32ed25519';
import { hmac } from '@noble/hashes/hmac';
import { sha256 } from '@noble/hashes/sha256';
import { sha512 } from '@noble/hashes/sha512';

/**
 * https://github.com/satoshilabs/slips/blob/master/slip-0010.md
 * https://github.com/cardano-foundation/CIPs/tree/master/CIP-1852
 * https://github.com/input-output-hk/cardano-addresses/blob/8bf98905b903455196495e231b23613ad2264cb0/core/lib/Cardano/Address/Style/Icarus.hs#L542-L648
 * https://github.com/LedgerHQ/orakolo/blob/master/papers/Ed25519_BIP%20Final.pdf
 */

const MASTER_SECRET = Buffer.from('ed25519 seed', 'utf8');
const HARDENED_OFFSET = 0x80000000;

function hashRepeatedly(seed) {
  let currSeed = seed;
  let I;
  let IL;
  let IR;
  do {
    I = hmac(sha512, MASTER_SECRET, currSeed);
    currSeed = I;
    IL = I.slice(0, 32);
    IR = I.slice(32);
    // We admit only those k such that the third highest bit of the last byte of kL is zero.
    // 0b00100000 = 32
  } while ((IL[31] & 32) !== 0);

  return [IL, IR];
}

bip32ed25519.Bip32PrivateKey.prototype.deriveHardened = function(index) {
  return this.derive(index + HARDENED_OFFSET);
};

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
    const chainCode = hmac(sha256, MASTER_SECRET, Buffer.concat([new Uint8Array([1]), seed]));

    const xprv = Buffer.concat([IL, IR, chainCode]);
    return new Bip32PrivateKey(xprv);
  }

  derivePath(path) {
    const splitPath = path.split('/');
    return splitPath.reduce((hdkey, indexStr, i) => {
      if (i === 0 && indexStr === 'm') {
        return hdkey;
      }
      if (indexStr.slice(-1) === '\'') {
        const index = parseInt(indexStr.slice(0, -1), 10);
        return hdkey.deriveHardened(index);
      } else {
        const index = parseInt(indexStr, 10);
        return hdkey.derive(index);
      }
    }, this);
  }
}

const { Bip32PublicKey, PrivateKey, PublicKey } = bip32ed25519;
export { Bip32PublicKey, PrivateKey, PublicKey };
