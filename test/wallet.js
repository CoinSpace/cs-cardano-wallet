import fs from 'fs/promises';
import assert from 'assert';
if (process.argv.includes('--disable-wasm')) {
  global.WebAssembly = undefined;
}
import CardanoWallet from '../index.js';

// either dismiss upset disease clump hazard paddle twist fetch tissue hello buyer
// eslint-disable-next-line max-len
const RANDOM_SEED = '3e818cec5efc7505369fae3f162af61130b673fa9b40e5955d5cde22a85afa03748d074356a281a5fc1dbd0b721357c56095a54de8d4bc6ecaa288f300776ae4';
// eslint-disable-next-line max-len
const RANDOM_PUBLIC_KEY = '{"shelley":"81f6e54955b5d75d464db7d83febeaf50bd42f3ad7370bfe60e5ac102384b827121ddd71fde4125810e3c9f9ef6b92ca0f50edac3486074083bd4d9762f7d6d0"}';

const PROTOCOL_PARAMETERS = JSON.parse(await fs.readFile('./test/fixtures/parameters.json'));
const UTXOS = JSON.parse(await fs.readFile('./test/fixtures/utxos.json'));

const CS_FEE_ADDRESS =
  'addr1qxqjhasmxchytpng9m9m5fs3da2eje0kx896r3ds9mje6zn3kr75q46456hgrv5rl84nwqdmuewq6sr4dna2ewta0nysy2k94u';
const CS_FEE = {
  addresses: [CS_FEE_ADDRESS],
  fee: 0.0005,
  maxFee: 1 * 1000000,
  minFee: 100 * 1000000,
  rbfFee: 0,
  whitelist: [],
};

const WALLET_ADDRESS =
  'addr1qy85asg42ckg6ssyn9wzaq9ydu4nu97gvj8749l2p35elf5cs7cgygl2cs5lcj4rmn0mawahcd2pgadmw833tuuh70rqzvdlft';
const DESTIONATION_ADDRESS =
  'addr1q9wygeq2vqelpytgdfxnjasjjpjg3zacz44tddcyt0zcmkm3kr75q46456hgrv5rl84nwqdmuewq6sr4dna2ewta0nysl52s67';

const crypto = {
  _id: 'cardano@cardano',
  platform: 'cardano',
};
const cache = { get: () => {}, set: () => {} };

function mockRequest(handlers = {}) {
  return async function(config) {
    for (const url in handlers) {
      if (config.url.startsWith(url)) {
        return handlers[url];
      }
    }
    throw new Error(`Not found "${config.url}"`);
  };
}

describe('Wallet', () => {
  describe('constructor', () => {
    it('with seed', () => {
      const wallet = new CardanoWallet({
        seed: RANDOM_SEED,
        request: mockRequest(),
        apiNode: 'node',
        apiWeb: 'web',
        crypto,
        cache,
      });
      assert.strictEqual(wallet.isLocked, false);
    });

    it('with publicKey', () => {
      const wallet = new CardanoWallet({
        publicKey: RANDOM_PUBLIC_KEY,
        request: mockRequest(),
        apiNode: 'node',
        apiWeb: 'web',
        crypto,
        cache,
      });
      assert.strictEqual(wallet.isLocked, true);
    });
  });

  describe('lock', () => {
    it('works', () => {
      const wallet = new CardanoWallet({
        seed: RANDOM_SEED,
        request: mockRequest(),
        apiNode: 'node',
        apiWeb: 'web',
        crypto,
        cache,
      });
      assert.strictEqual(wallet.isLocked, false);
      wallet.lock();
      assert.strictEqual(wallet.isLocked, true);
    });
  });

  describe('unlock', () => {
    it('works', () => {
      const wallet = new CardanoWallet({
        publicKey: RANDOM_PUBLIC_KEY,
        request: mockRequest(),
        apiNode: 'node',
        apiWeb: 'web',
        crypto,
        cache,
      });
      assert.strictEqual(wallet.isLocked, true);
      wallet.unlock(RANDOM_SEED);
      assert.strictEqual(wallet.isLocked, false);
    });
  });

  describe('publicKey', () => {
    it('key is valid', () => {
      const wallet = new CardanoWallet({
        seed: RANDOM_SEED,
        request: mockRequest(),
        apiNode: 'node',
        apiWeb: 'web',
        crypto,
        cache,
      });
      const publicKey = wallet.publicKey();
      assert.strictEqual(publicKey, RANDOM_PUBLIC_KEY);
    });
  });

  describe('balance', () => {
    it('should works with empty wallet', async () => {
      const wallet = new CardanoWallet({
        seed: RANDOM_SEED,
        request: mockRequest({
          parameters: PROTOCOL_PARAMETERS,
          'api/v3/csfee': CS_FEE,
          // eslint-disable-next-line max-len
          [`addresses/${WALLET_ADDRESS}/utxos`]: [],
        }),
        apiNode: 'node',
        apiWeb: 'web',
        crypto,
        cache,
      });
      await wallet.load();
      assert.strictEqual(wallet.balance, '0');
    });

    it('calculates balance correct with full wallet', async () => {
      const wallet = new CardanoWallet({
        seed: RANDOM_SEED,
        request: mockRequest({
          parameters: PROTOCOL_PARAMETERS,
          'api/v3/csfee': CS_FEE,
          [`addresses/${WALLET_ADDRESS}/utxos`]: UTXOS,
        }),
        apiNode: 'node',
        apiWeb: 'web',
        crypto,
        cache,
      });
      await wallet.load();
      assert.strictEqual(wallet.balance, '6000000');
    });

    it('calculates balance correct with locked wallet', async () => {
      const wallet = new CardanoWallet({
        publicKey: RANDOM_PUBLIC_KEY,
        request: mockRequest({
          parameters: PROTOCOL_PARAMETERS,
          'api/v3/csfee': CS_FEE,
          [`addresses/${WALLET_ADDRESS}/utxos`]: UTXOS,
        }),
        apiNode: 'node',
        apiWeb: 'web',
        crypto,
        cache,
      });
      await wallet.load();
      assert.strictEqual(wallet.balance, '6000000');
    });
  });

  describe('estimateFees', () => {
    it('should estimate correct with empty wallet', async () => {
      const wallet = new CardanoWallet({
        publicKey: RANDOM_PUBLIC_KEY,
        request: mockRequest({
          parameters: PROTOCOL_PARAMETERS,
          'api/v3/csfee': CS_FEE,
          [`addresses/${WALLET_ADDRESS}/utxos`]: [],
        }),
        apiNode: 'node',
        apiWeb: 'web',
        crypto,
        cache,
      });
      await wallet.load();
      assert.deepStrictEqual(wallet.estimateFees('0'), [
        {
          name: 'default',
          default: true,
          estimate: '1167305',
          maxAmount: '0',
        },
      ]);
    });

    it('should estimate correct (value 0)', async () => {
      const wallet = new CardanoWallet({
        publicKey: RANDOM_PUBLIC_KEY,
        request: mockRequest({
          parameters: PROTOCOL_PARAMETERS,
          'api/v3/csfee': CS_FEE,
          [`addresses/${WALLET_ADDRESS}/utxos`]: UTXOS,
        }),
        apiNode: 'node',
        apiWeb: 'web',
        crypto,
        cache,
      });
      await wallet.load();
      assert.deepStrictEqual(wallet.estimateFees('0'), [
        {
          name: 'default',
          default: true,
          estimate: '1173421',
          maxAmount: '4824995',
        },
      ]);
    });

    it('should estimate correct (value gt max amount)', async () => {
      const wallet = new CardanoWallet({
        publicKey: RANDOM_PUBLIC_KEY,
        request: mockRequest({
          parameters: PROTOCOL_PARAMETERS,
          'api/v3/csfee': CS_FEE,
          [`addresses/${WALLET_ADDRESS}/utxos`]: UTXOS,
        }),
        apiNode: 'node',
        apiWeb: 'web',
        crypto,
        cache,
      });
      await wallet.load();
      assert.deepStrictEqual(wallet.estimateFees('100000000000000'), [
        {
          name: 'default',
          default: true,
          estimate: '1175005',
          maxAmount: '4824995',
        },
      ]);
    });
  });

  describe('getNextAddress', () => {
    let wallet;
    beforeEach(async () => {
      wallet = new CardanoWallet({
        publicKey: RANDOM_PUBLIC_KEY,
        request: mockRequest({
          parameters: PROTOCOL_PARAMETERS,
          'api/v3/csfee': CS_FEE,
          [`addresses/${WALLET_ADDRESS}/utxos`]: [],
        }),
        apiNode: 'node',
        apiWeb: 'web',
        crypto,
        cache,
      });
      await wallet.load();
    });

    it('should return standard address by default', () => {
      assert.deepStrictEqual(wallet.getNextAddress(), WALLET_ADDRESS);
    });

    it('should fail on incorrect address type', () => {
      assert.throws(() => {
        wallet.addressType = 'foobar';
      }, {
        message: 'unsupported address type',
      });
    });
  });

  describe('createTx', () => {
    let wallet;
    beforeEach(async () => {
      wallet = new CardanoWallet({
        publicKey: RANDOM_PUBLIC_KEY,
        request: mockRequest({
          parameters: PROTOCOL_PARAMETERS,
          'api/v3/csfee': CS_FEE,
          [`addresses/${WALLET_ADDRESS}/utxos`]: [
            ...UTXOS,
            {
              address: WALLET_ADDRESS,
              txHash: 'e76dd150273b87702fcdcaa7eeb767a0322d08ef97fa5d53e769a2fe95767ef9',
              index: 0,
              value: '3000000',
              block: '269bf61707b2557114b9341c03c4a63d2bfd4b38deaffe178579d254f2e7ffce',
              height: 3438723,
              includedAt: 1648730740,
              confirmations: 0,
            },
          ],
        }),
        apiNode: 'node',
        apiWeb: 'web',
        crypto,
        cache,
      });
      await wallet.load();
    });

    it('should fail (small amount)', async () => {
      await assert.rejects(async () => {
        await wallet.createTx(
          DESTIONATION_ADDRESS,
          '0',
          '1173421'
        );
      }, {
        message: 'Invalid value',
      });
    });

    it('should fail (big amount)', async () => {
      await assert.rejects(async () => {
        await wallet.createTx(
          DESTIONATION_ADDRESS,
          '100000000000000',
          '1175005'
        );
      }, {
        message: 'Insufficient funds',
      });
    });

    it('should fail (invalid fee)', async () => {
      await assert.rejects(async () => {
        await wallet.createTx(
          DESTIONATION_ADDRESS,
          '2000000',
          '1000000'
        );
      }, {
        message: 'Invalid fee',
      });
    });

    it('should fail (gt max amount but lt balance)', async () => {
      await assert.rejects(async () => {
        await wallet.createTx(
          DESTIONATION_ADDRESS,
          '5000000',
          '1173421'
        );
      }, {
        message: 'Insufficient funds',
        details: 'Additional funds confirmation pending',
      });
    });

    it('should create valid transaction with 1 input', async () => {
      const { tx } = await wallet.createTx(
        DESTIONATION_ADDRESS,
        '1500000',
        '1173421'
      );
      assert.strictEqual(tx.body().inputs().len(), 1);
      assert.strictEqual(Buffer.from(tx.body().inputs().get(0).transaction_id().to_bytes()).toString('hex'),
        '0df6fffaa856ee9847118d3cb2dbebff007e835ac26037c0a0cfa0a0cff1c824');

      assert.strictEqual(tx.body().outputs().len(), 3);
      assert.strictEqual(tx.body().outputs().get(0).amount().coin().to_str(), '1500000');
      assert.strictEqual(tx.body().outputs().get(0).address().to_bech32(), DESTIONATION_ADDRESS);
      assert.strictEqual(tx.body().outputs().get(1).amount().coin().to_str(), '1000000');
      assert.strictEqual(tx.body().outputs().get(1).address().to_bech32(), CS_FEE_ADDRESS);
      assert.strictEqual(tx.body().outputs().get(2).amount().coin().to_str(), '1326579');
      assert.strictEqual(tx.body().outputs().get(2).address().to_bech32(), WALLET_ADDRESS);
    });

    it('should create valid transaction with many inputs', async () => {
      const { tx } = await wallet.createTx(
        DESTIONATION_ADDRESS,
        '3000000',
        '1175005'
      );
      assert.strictEqual(tx.body().inputs().len(), 2);
      assert.strictEqual(Buffer.from(tx.body().inputs().get(0).transaction_id().to_bytes()).toString('hex'),
        '0df6fffaa856ee9847118d3cb2dbebff007e835ac26037c0a0cfa0a0cff1c824');
      assert.strictEqual(Buffer.from(tx.body().inputs().get(1).transaction_id().to_bytes()).toString('hex'),
        'cdad8f84ac861f67716607f164a96672db1ba0a5046f7e4ed0ff86fa41d7019c');

      assert.strictEqual(tx.body().outputs().len(), 3);
      assert.strictEqual(tx.body().outputs().get(0).amount().coin().to_str(), '3000000');
      assert.strictEqual(tx.body().outputs().get(0).address().to_bech32(), DESTIONATION_ADDRESS);
      assert.strictEqual(tx.body().outputs().get(1).amount().coin().to_str(), '1000000');
      assert.strictEqual(tx.body().outputs().get(1).address().to_bech32(), CS_FEE_ADDRESS);
      assert.strictEqual(tx.body().outputs().get(2).amount().coin().to_str(), '1824995');
      assert.strictEqual(tx.body().outputs().get(2).address().to_bech32(), WALLET_ADDRESS);
    });

    it('should create valid transaction with max amount', async () => {
      const { tx } = await wallet.createTx(
        DESTIONATION_ADDRESS,
        '4824995',
        '1175005'
      );
      assert.strictEqual(tx.body().inputs().len(), 2);
      assert.strictEqual(Buffer.from(tx.body().inputs().get(0).transaction_id().to_bytes()).toString('hex'),
        '0df6fffaa856ee9847118d3cb2dbebff007e835ac26037c0a0cfa0a0cff1c824');
      assert.strictEqual(Buffer.from(tx.body().inputs().get(1).transaction_id().to_bytes()).toString('hex'),
        'cdad8f84ac861f67716607f164a96672db1ba0a5046f7e4ed0ff86fa41d7019c');

      assert.strictEqual(tx.body().outputs().len(), 2);
      assert.strictEqual(tx.body().outputs().get(0).amount().coin().to_str(), '4824995');
      assert.strictEqual(tx.body().outputs().get(0).address().to_bech32(), DESTIONATION_ADDRESS);
      assert.strictEqual(tx.body().outputs().get(1).amount().coin().to_str(), '1000000');
      assert.strictEqual(tx.body().outputs().get(1).address().to_bech32(), CS_FEE_ADDRESS);
    });
  });

  describe('createTx', () => {
    it('should create valid transaction without cs fee', async () => {
      const wallet = new CardanoWallet({
        publicKey: RANDOM_PUBLIC_KEY,
        request: mockRequest({
          parameters: PROTOCOL_PARAMETERS,
          'api/v3/csfee': {
            addresses: [],
          },
          [`addresses/${WALLET_ADDRESS}/utxos`]: UTXOS,
        }),
        apiNode: 'node',
        apiWeb: 'web',
        crypto,
        cache,
      });
      await wallet.load();

      const { tx } = await wallet.createTx(
        DESTIONATION_ADDRESS,
        '2000000',
        '175005'
      );
      assert.strictEqual(tx.body().inputs().len(), 1);
      assert.strictEqual(Buffer.from(tx.body().inputs().get(0).transaction_id().to_bytes()).toString('hex'),
        '0df6fffaa856ee9847118d3cb2dbebff007e835ac26037c0a0cfa0a0cff1c824');

      assert.strictEqual(tx.body().outputs().len(), 2);
      assert.strictEqual(tx.body().outputs().get(0).amount().coin().to_str(), '2000000');
      assert.strictEqual(tx.body().outputs().get(0).address().to_bech32(), DESTIONATION_ADDRESS);
      assert.strictEqual(tx.body().outputs().get(1).amount().coin().to_str(), '1824995');
      assert.strictEqual(tx.body().outputs().get(1).address().to_bech32(), WALLET_ADDRESS);
    });
  });

  describe('sendTx', () => {
    it('should create and send valid transaction', async () => {
      const wallet = new CardanoWallet({
        seed: RANDOM_SEED,
        request: mockRequest({
          parameters: PROTOCOL_PARAMETERS,
          'api/v3/csfee': CS_FEE,
          [`addresses/${WALLET_ADDRESS}/utxos`]: UTXOS,
          'tx/submit': {
            confirmations: 0,
            hash: '6a33c70188072cb2a8358ae3a3f4401fe1c9bcf56ed0029ab629e3070590245d',
            inputs: [{
              hash: UTXOS[1].txHash,
              index: UTXOS[1].index,
            }],
            outputs: [{
              index: 0,
              value: 1500000,
              address: DESTIONATION_ADDRESS,
            }, {
              index: 1,
              value: 1000000,
              address: CS_FEE_ADDRESS,
            }, {
              index: 2,
              value: 1326579,
              address: WALLET_ADDRESS,
            }],
          },
        }),
        apiNode: 'node',
        apiWeb: 'web',
        crypto,
        cache,
      });
      await wallet.load();
      assert.strictEqual(wallet.balance, '6000000');

      const raw = await wallet.createTx(
        DESTIONATION_ADDRESS,
        '1500000',
        '1173421'
      );

      const transaction = await wallet.sendTx(raw.sign());

      assert(transaction);
      assert.strictEqual(wallet.balance, '3326579');
    });
  });

  describe('loadTxs', () => {
    it('works', async () => {
      const wallet = new CardanoWallet({
        publicKey: RANDOM_PUBLIC_KEY,
        request: mockRequest({
          parameters: PROTOCOL_PARAMETERS,
          'api/v3/csfee': CS_FEE,
          [`addresses/${WALLET_ADDRESS}/utxos`]: [],
          [`addresses/${WALLET_ADDRESS}/transactions`]: new Array(5),
        }),
        apiNode: 'node',
        apiWeb: 'web',
        crypto,
        cache,
      });
      await wallet.load();
      const res = await wallet.loadTxs();
      assert.strictEqual(res.hasMoreTxs, true);
      assert.strictEqual(res.txs.length, 5);
    });
  });

  describe('exportPrivateKeys', () => {
    it('works', async () => {
      const wallet = new CardanoWallet({
        seed: RANDOM_SEED,
        request: mockRequest({
          parameters: PROTOCOL_PARAMETERS,
          'api/v3/csfee': CS_FEE,
          [`addresses/${WALLET_ADDRESS}/utxos`]: [],
        }),
        apiNode: 'node',
        apiWeb: 'web',
        crypto,
        cache,
      });
      await wallet.load();
      // eslint-disable-next-line max-len
      const expected = 'acct_xsk1jpka2mdvn9r90gnft30c08273zj7w0f9mye5j4tuhcvux95gfp068nala5n4ccavdmrypunzhjggre73d9rhmq0cguzrlye49jxmghqjrhwhrl0yzfvppc7fl8hkhyk2pagwmtp5scr5pqaafktk9a7k6qqtec05';
      assert.strictEqual(wallet.exportPrivateKeys(), expected);
    });
  });
});
