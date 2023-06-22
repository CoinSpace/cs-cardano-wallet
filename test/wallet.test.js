import { Amount } from '@coinspace/cs-common';
import Wallet from '../index.js';
import assert from 'assert/strict';
import fs from 'fs/promises';
import sinon from 'sinon';

// either dismiss upset disease clump hazard paddle twist fetch tissue hello buyer
// eslint-disable-next-line max-len
const RANDOM_SEED = Buffer.from('3e818cec5efc7505369fae3f162af61130b673fa9b40e5955d5cde22a85afa03748d074356a281a5fc1dbd0b721357c56095a54de8d4bc6ecaa288f300776ae4', 'hex');
// eslint-disable-next-line max-len
const RANDOM_PUBLIC_KEY = {
  settings: {
    bip44: "m/1852'/1815'/0'",
  },
  data: {
    // eslint-disable-next-line max-len
    shelley: '81f6e54955b5d75d464db7d83febeaf50bd42f3ad7370bfe60e5ac102384b827121ddd71fde4125810e3c9f9ef6b92ca0f50edac3486074083bd4d9762f7d6d0',
  },
};
const WALLET_ADDRESS =
  'addr1qy85asg42ckg6ssyn9wzaq9ydu4nu97gvj8749l2p35elf5cs7cgygl2cs5lcj4rmn0mawahcd2pgadmw833tuuh70rqzvdlft';
const DESTIONATION_ADDRESS =
  'addr1q9wygeq2vqelpytgdfxnjasjjpjg3zacz44tddcyt0zcmkm3kr75q46456hgrv5rl84nwqdmuewq6sr4dna2ewta0nysl52s67';

const PROTOCOL_PARAMETERS = JSON.parse(await fs.readFile('./test/fixtures/parameters.json'));
const UTXOS = JSON.parse(await fs.readFile('./test/fixtures/utxos.json'));
const UNCONFIRMED = JSON.parse(await fs.readFile('./test/fixtures/unconfirmed.json'));
const SUBMIT = JSON.parse(await fs.readFile('./test/fixtures/submit.json'));
const TRANSACTIONS = JSON.parse(await fs.readFile('./test/fixtures/transactions.json'));
// eslint-disable-next-line max-len
const CS_FEE_ADDRESS = 'addr1qxqjhasmxchytpng9m9m5fs3da2eje0kx896r3ds9mje6zn3kr75q46456hgrv5rl84nwqdmuewq6sr4dna2ewta0nysy2k94u';
const CS_FEE = {
  address: CS_FEE_ADDRESS,
  fee: 0.005,
  minFee: 0.5,
  maxFee: 100,
};

const cardanoATcardano = {
  _id: 'cardano@cardano',
  asset: 'cardano',
  platform: 'cardano',
  type: 'coin',
  name: 'Cardano',
  symbol: 'ADA',
  decimals: 6,
};

let defaultOptions;

describe('Cardano Wallet', () => {
  beforeEach(() => {
    defaultOptions = {
      crypto: cardanoATcardano,
      platform: cardanoATcardano,
      cache: { get() {}, set() {} },
      settings: {},
      account: {
        request(...args) { console.log(args); },
        market: {
          getPrice() { return 0.32; },
        },
      },
      apiNode: 'node',
      storage: { get() {}, set() {}, save() {} },
      txPerPage: 5,
    };
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('constructor', () => {
    it('create wallet instance', () => {
      const wallet = new Wallet({
        ...defaultOptions,
      });
      assert.equal(wallet.state, Wallet.STATE_CREATED);
    });
  });

  describe('create wallet', () => {
    it('should create new wallet with seed', async () => {
      const wallet = new Wallet({
        ...defaultOptions,
      });
      await wallet.create(RANDOM_SEED);
      assert.equal(wallet.state, Wallet.STATE_INITIALIZED);
      assert.equal(wallet.address, WALLET_ADDRESS);
    });

    it('should fails without seed', async () => {
      const wallet = new Wallet({
        ...defaultOptions,
      });
      await assert.rejects(async () => {
        await wallet.create();
      }, {
        name: 'TypeError',
        message: 'seed must be an instance of Uint8Array or Buffer, undefined provided',
      });
    });
  });

  describe('open wallet', () => {
    it('should open wallet with public key', async () => {
      const wallet = new Wallet({
        ...defaultOptions,
      });
      await wallet.open(RANDOM_PUBLIC_KEY);
      assert.equal(wallet.state, Wallet.STATE_INITIALIZED);
      assert.equal(wallet.address, WALLET_ADDRESS);
    });

    it('should fails without public key', async () => {
      const wallet = new Wallet({
        ...defaultOptions,
      });
      await assert.rejects(async () => {
        await wallet.open();
      }, {
        name: 'TypeError',
        message: 'publicKey must be an instance of Object with data property',
      });
    });
  });

  describe('storage', () => {
    it('should load initial balance from storage', async () => {
      sinon.stub(defaultOptions.storage, 'get')
        .withArgs('balance').returns('1234567890');
      const wallet = new Wallet({
        ...defaultOptions,
      });
      await wallet.open(RANDOM_PUBLIC_KEY);
      assert.equal(wallet.balance.value, 1234567890n);
    });
  });

  describe('load', () => {
    it('should load wallet', async () => {
      sinon.stub(defaultOptions.account, 'request')
        .withArgs({
          seed: 'device',
          method: 'GET',
          url: `api/v1/addresses/${WALLET_ADDRESS}/utxos`,
          baseURL: 'node',
        }).resolves(UTXOS)
        .withArgs({
          seed: 'device',
          method: 'GET',
          url: 'api/v1/parameters',
          baseURL: 'node',
        }).resolves(PROTOCOL_PARAMETERS);
      const storage = sinon.mock(defaultOptions.storage);
      storage.expects('set').once().withArgs('balance', '504000000');
      storage.expects('save').once();
      const wallet = new Wallet({
        ...defaultOptions,
      });
      await wallet.open(RANDOM_PUBLIC_KEY);
      await wallet.load();
      assert.equal(wallet.state, Wallet.STATE_LOADED);
      assert.equal(wallet.balance.value, 504000000n);
      storage.verify();
    });
  });

  describe('getPublicKey', () => {
    it('should export public key', async () => {
      const wallet = new Wallet({
        ...defaultOptions,
      });
      await wallet.create(RANDOM_SEED);
      const publicKey = wallet.getPublicKey();
      assert.deepEqual(publicKey, RANDOM_PUBLIC_KEY);
    });

    it('public key is valid', async () => {
      const wallet = new Wallet({
        ...defaultOptions,
      });
      await wallet.create(RANDOM_SEED);
      const publicKey = wallet.getPublicKey();
      const secondWalet = new Wallet({
        ...defaultOptions,
      });
      secondWalet.open(publicKey);
      assert.equal(wallet.address, secondWalet.address);
    });
  });

  describe('getPrivateKey', () => {
    it('should export private key', async () => {
      const wallet = new Wallet({
        ...defaultOptions,
      });
      await wallet.create(RANDOM_SEED);
      const privateKey = wallet.getPrivateKey(RANDOM_SEED);
      assert.deepEqual(privateKey, [{
        address: WALLET_ADDRESS,
        // eslint-disable-next-line max-len
        privatekey: 'acct_xsk1jpka2mdvn9r90gnft30c08273zj7w0f9mye5j4tuhcvux95gfp068nala5n4ccavdmrypunzhjggre73d9rhmq0cguzrlye49jxmghqjrhwhrl0yzfvppc7fl8hkhyk2pagwmtp5scr5pqaafktk9a7k6qqtec05',
      }]);
    });
  });

  describe('validators', () => {
    describe('validateAddress', () => {
      let wallet;
      beforeEach(async () => {
        sinon.stub(defaultOptions.account, 'request')
          .withArgs({
            seed: 'device',
            method: 'GET',
            url: `api/v1/addresses/${WALLET_ADDRESS}/utxos`,
            baseURL: 'node',
          }).resolves(UTXOS)
          .withArgs({
            seed: 'device',
            method: 'GET',
            url: 'api/v1/parameters',
            baseURL: 'node',
          }).resolves(PROTOCOL_PARAMETERS);
        wallet = new Wallet({
          ...defaultOptions,
        });
        await wallet.open(RANDOM_PUBLIC_KEY);
        await wallet.load();
      });

      it('valid address', async () => {
        assert.ok(await wallet.validateAddress({ address: DESTIONATION_ADDRESS }));
      });

      it('invalid address', async () => {
        await assert.rejects(async () => {
          await wallet.validateAddress({ address: '123' });
        }, {
          name: 'InvalidAddressError',
          message: 'Invalid address "123"',
        });
      });

      it('own address', async () => {
        await assert.rejects(async () => {
          await wallet.validateAddress({ address: WALLET_ADDRESS });
        }, {
          name: 'DestinationEqualsSourceError',
          message: 'Destination address equals source address',
        });
      });
    });

    describe('validateAmount', () => {
      it('should be valid amount', async () => {
        sinon.stub(defaultOptions.account, 'request')
          .withArgs({
            seed: 'device',
            method: 'GET',
            url: `api/v1/addresses/${WALLET_ADDRESS}/utxos`,
            baseURL: 'node',
          }).resolves(UTXOS)
          .withArgs({
            seed: 'device',
            method: 'GET',
            url: 'api/v1/parameters',
            baseURL: 'node',
          }).resolves(PROTOCOL_PARAMETERS)
          .withArgs({
            seed: 'device',
            method: 'GET',
            url: 'api/v4/csfee',
            params: { crypto: 'cardano@cardano' },
          }).resolves(CS_FEE);
        const wallet = new Wallet({
          ...defaultOptions,
        });
        await wallet.open(RANDOM_PUBLIC_KEY);
        await wallet.load();

        const valid = await wallet.validateAmount({
          address: DESTIONATION_ADDRESS,
          amount: new Amount(2_000000n, wallet.crypto.decimals),
        });
        assert.ok(valid);
      });

      it('throw on small amount', async () => {
        sinon.stub(defaultOptions.account, 'request')
          .withArgs({
            seed: 'device',
            method: 'GET',
            url: `api/v1/addresses/${WALLET_ADDRESS}/utxos`,
            baseURL: 'node',
          }).resolves(UTXOS)
          .withArgs({
            seed: 'device',
            method: 'GET',
            url: 'api/v1/parameters',
            baseURL: 'node',
          }).resolves(PROTOCOL_PARAMETERS)
          .withArgs({
            seed: 'device',
            method: 'GET',
            url: 'api/v4/csfee',
            params: { crypto: 'cardano@cardano' },
          }).resolves(CS_FEE);
        const wallet = new Wallet({
          ...defaultOptions,
        });
        await wallet.open(RANDOM_PUBLIC_KEY);
        await wallet.load();

        await assert.rejects(async () => {
          await wallet.validateAmount({
            address: DESTIONATION_ADDRESS,
            amount: new Amount(0n, wallet.crypto.decimals),
          });
        }, {
          name: 'SmallAmountError',
          message: 'Small amount',
          amount: new Amount(1000007n, wallet.crypto.decimals),
        });
      });

      it('throw on big amount', async () => {
        sinon.stub(defaultOptions.account, 'request')
          .withArgs({
            seed: 'device',
            method: 'GET',
            url: `api/v1/addresses/${WALLET_ADDRESS}/utxos`,
            baseURL: 'node',
          }).resolves(UTXOS)
          .withArgs({
            seed: 'device',
            method: 'GET',
            url: 'api/v1/parameters',
            baseURL: 'node',
          }).resolves(PROTOCOL_PARAMETERS)
          .withArgs({
            seed: 'device',
            method: 'GET',
            url: 'api/v4/csfee',
            params: { crypto: 'cardano@cardano' },
          }).resolves(CS_FEE);
        const wallet = new Wallet({
          ...defaultOptions,
        });
        await wallet.open(RANDOM_PUBLIC_KEY);
        await wallet.load();

        await assert.rejects(async () => {
          await wallet.validateAmount({
            address: DESTIONATION_ADDRESS,
            amount: new Amount(550_000000n, wallet.crypto.decimals),
          });
        }, {
          name: 'BigAmountError',
          message: 'Big amount',
          amount: new Amount(501_311037n, wallet.crypto.decimals),
        });
      });

      it('throw on big amount (unconfirmed)', async () => {
        sinon.stub(defaultOptions.account, 'request')
          .withArgs({
            seed: 'device',
            method: 'GET',
            url: `api/v1/addresses/${WALLET_ADDRESS}/utxos`,
            baseURL: 'node',
          }).resolves([...UNCONFIRMED, ...UTXOS])
          .withArgs({
            seed: 'device',
            method: 'GET',
            url: 'api/v1/parameters',
            baseURL: 'node',
          }).resolves(PROTOCOL_PARAMETERS)
          .withArgs({
            seed: 'device',
            method: 'GET',
            url: 'api/v4/csfee',
            params: { crypto: 'cardano@cardano' },
          }).resolves(CS_FEE);
        const wallet = new Wallet({
          ...defaultOptions,
        });
        await wallet.open(RANDOM_PUBLIC_KEY);
        await wallet.load();

        await assert.rejects(async () => {
          await wallet.validateAmount({
            address: DESTIONATION_ADDRESS,
            amount: new Amount(550_000000n, wallet.crypto.decimals),
          });
        }, {
          name: 'BigAmountConfirmationPendingError',
          message: 'Big amount, confirmation pending',
          amount: new Amount(501_311037n, wallet.crypto.decimals),
        });
      });
    });
  });

  describe('estimateMaxAmount', () => {
    it('should correct estimate max amount', async () => {
      sinon.stub(defaultOptions.account, 'request')
        .withArgs({
          seed: 'device',
          method: 'GET',
          url: `api/v1/addresses/${WALLET_ADDRESS}/utxos`,
          baseURL: 'node',
        }).resolves(UTXOS)
        .withArgs({
          seed: 'device',
          method: 'GET',
          url: 'api/v1/parameters',
          baseURL: 'node',
        }).resolves(PROTOCOL_PARAMETERS)
        .withArgs({
          seed: 'device',
          method: 'GET',
          url: 'api/v4/csfee',
          params: { crypto: 'cardano@cardano' },
        }).resolves(CS_FEE);
      const wallet = new Wallet({
        ...defaultOptions,
      });
      await wallet.open(RANDOM_PUBLIC_KEY);
      await wallet.load();

      const maxAmount = await wallet.estimateMaxAmount({ address: DESTIONATION_ADDRESS });
      assert.equal(maxAmount.value, 501_311037n);
    });

    it('should estimate max amount to be 0', async () => {
      sinon.stub(defaultOptions.account, 'request')
        .withArgs({
          seed: 'device',
          method: 'GET',
          url: `api/v1/addresses/${WALLET_ADDRESS}/utxos`,
          baseURL: 'node',
        }).resolves([])
        .withArgs({
          seed: 'device',
          method: 'GET',
          url: 'api/v1/parameters',
          baseURL: 'node',
        }).resolves(PROTOCOL_PARAMETERS);
      const wallet = new Wallet({
        ...defaultOptions,
      });
      await wallet.open(RANDOM_PUBLIC_KEY);
      await wallet.load();
      const maxAmount = await wallet.estimateMaxAmount({ address: DESTIONATION_ADDRESS });
      assert.equal(maxAmount.value, 0n);
    });
  });

  describe('estimateTransactionFee', () => {
    it('should estimate transaction fee (2 ADA)', async () => {
      sinon.stub(defaultOptions.account, 'request')
        .withArgs({
          seed: 'device',
          method: 'GET',
          url: `api/v1/addresses/${WALLET_ADDRESS}/utxos`,
          baseURL: 'node',
        }).resolves(UTXOS)
        .withArgs({
          seed: 'device',
          method: 'GET',
          url: 'api/v1/parameters',
          baseURL: 'node',
        }).resolves(PROTOCOL_PARAMETERS)
        .withArgs({
          seed: 'device',
          method: 'GET',
          url: 'api/v4/csfee',
          params: { crypto: 'cardano@cardano' },
        }).resolves(CS_FEE);
      const wallet = new Wallet({
        ...defaultOptions,
      });
      await wallet.open(RANDOM_PUBLIC_KEY);
      await wallet.load();
      const fee = await wallet.estimateTransactionFee({
        address: DESTIONATION_ADDRESS,
        amount: new Amount(2_000000n, wallet.crypto.decimals),
      });
      assert.equal(fee.value, 1733237n);
    });

    it('should estimate transaction fee (max amount)', async () => {
      sinon.stub(defaultOptions.account, 'request')
        .withArgs({
          seed: 'device',
          method: 'GET',
          url: `api/v1/addresses/${WALLET_ADDRESS}/utxos`,
          baseURL: 'node',
        }).resolves(UTXOS)
        .withArgs({
          seed: 'device',
          method: 'GET',
          url: 'api/v1/parameters',
          baseURL: 'node',
        }).resolves(PROTOCOL_PARAMETERS)
        .withArgs({
          seed: 'device',
          method: 'GET',
          url: 'api/v4/csfee',
          params: { crypto: 'cardano@cardano' },
        }).resolves(CS_FEE);
      const wallet = new Wallet({
        ...defaultOptions,
      });
      await wallet.open(RANDOM_PUBLIC_KEY);
      await wallet.load();
      const fee = await wallet.estimateTransactionFee({
        address: DESTIONATION_ADDRESS,
        amount: new Amount(501_311037n, wallet.crypto.decimals),
      });
      assert.equal(fee.value, 2_688963n);
    });
  });

  describe('createTransaction', () => {
    it('should create valid transaction', async () => {
      sinon.stub(defaultOptions.account, 'request')
        .withArgs({
          seed: 'device',
          method: 'GET',
          url: `api/v1/addresses/${WALLET_ADDRESS}/utxos`,
          baseURL: 'node',
        }).resolves(UTXOS)
        .withArgs({
          seed: 'device',
          method: 'GET',
          url: 'api/v1/parameters',
          baseURL: 'node',
        }).resolves(PROTOCOL_PARAMETERS)
        .withArgs({
          seed: 'device',
          method: 'GET',
          url: 'api/v4/csfee',
          params: { crypto: 'cardano@cardano' },
        }).resolves(CS_FEE)
        .withArgs({
          seed: 'device',
          method: 'POST',
          url: 'api/v1/tx/submit',
          data: sinon.match.any,
          baseURL: 'node',
        }).resolves(SUBMIT);
      const wallet = new Wallet({
        ...defaultOptions,
      });
      await wallet.open(RANDOM_PUBLIC_KEY);
      await wallet.load();

      await wallet.createTransaction({
        address: DESTIONATION_ADDRESS,
        amount: new Amount(2_000000, wallet.crypto.decimals),
      }, RANDOM_SEED);
      assert.equal(wallet.balance.value, 500_266763n);
    });
  });

  describe('loadTransactions', () => {
    it('should load transactions', async () => {
      sinon.stub(defaultOptions.account, 'request')
        .withArgs({
          seed: 'device',
          method: 'GET',
          url: `api/v1/addresses/${WALLET_ADDRESS}/utxos`,
          baseURL: 'node',
        }).resolves(UTXOS)
        .withArgs({
          seed: 'device',
          method: 'GET',
          url: 'api/v1/parameters',
          baseURL: 'node',
        }).resolves(PROTOCOL_PARAMETERS)
        .withArgs({
          seed: 'device',
          method: 'GET',
          url: `api/v1/addresses/${WALLET_ADDRESS}/transactions`,
          params: {
            page: 0,
            count: 5,
          },
          baseURL: 'node',
        }).resolves(TRANSACTIONS);
      const wallet = new Wallet({
        ...defaultOptions,
      });
      await wallet.open(RANDOM_PUBLIC_KEY);
      await wallet.load();

      const res = await wallet.loadTransactions();
      assert.strictEqual(res.hasMore, true);
      assert.strictEqual(res.transactions.length, 5);
      assert.strictEqual(res.cursor, 1);
    });
  });
});
