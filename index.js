import BigNumber from 'bignumber.js';
import { bech32 } from 'bech32';
import API from './lib/api.js';
import { calculateCsFee, reverseCsFee } from './lib/fee.js';
import { Bip32PrivateKey, Bip32PublicKey } from './lib/bip32ed25519.js';

function harden(num) {
  return 0x80000000 + num;
}

const MAX_INPUTS_PER_TX = 400;

function xprvFromSeed(seed) {
  // https://github.com/cardano-foundation/CIPs/tree/master/CIP-1852
  // m/1852'/1815'/0'
  return Bip32PrivateKey.fromSeed(Buffer.from(seed, 'hex'))
    .derive(harden(1852)) // purpose
    .derive(harden(1815)) // coin type
    .derive(harden(0)); // account #0
}

export default class CardanoWallet {
  #crypto;
  #cache;
  #addressType;
  #balance;
  #apiNode;
  #request;
  #apiWeb;

  #xprv;
  #xpub;
  #utxos = [];
  #utxosForTx;
  #protocolParams;
  #txsPerPage = 5;
  #txsCursor = 0;
  #feeRates = [{
    name: 'default',
    default: true,
  }];
  #csFee;
  #csMinFee;
  #csMaxFee;
  #csSkipMinFee;
  #csFeeAddresses = [];
  #csFeeOff = true;
  #dustThreshold;
  #minConfirmations = 3;
  #useTestNetwork;
  #CardanoWasm;

  get isLocked() {
    return !this.#xprv;
  }

  get addressTypes() {
    return ['base'];
  }

  get addressType() {
    return this.#addressType;
  }

  set addressType(addressType) {
    if (!this.addressTypes.includes(addressType)) {
      throw new TypeError('unsupported address type');
    }
    this.#cache.set('addressType', addressType);
    this.#addressType = addressType;
  }

  get feeRates() {
    return this.#feeRates.map((item) => {
      return {
        name: item.name,
        default: item.default === true,
      };
    });
  }

  get balance() {
    return this.#balance.toString(10);
  }

  get crypto() {
    return this.#crypto;
  }

  get #networkID() {
    if (this.#useTestNetwork) {
      return this.#CardanoWasm.NetworkInfo.testnet().network_id();
    } else {
      return this.#CardanoWasm.NetworkInfo.mainnet().network_id();
    }
  }

  get #mockAddress() {
    if (this.#useTestNetwork) {
      // https://cips.cardano.org/cips/cip19/
      // eslint-disable-next-line max-len
      return this.#CardanoWasm.ByronAddress.from_base58('37btjrVyb4KDXBNC4haBVPCrro8AQPHwvCMp3RFhhSVWwfFmZ6wwzSK6JK1hY6wHNmtrpTf1kdbva8TCneM2YsiXT7mrzT21EacHnPpz5YyUdj64na').to_address();
    } else {
      // https://github.com/input-output-hk/cardano-addresses/blob/3.9.0/core/lib/Cardano/Address/Style/Byron.hs#L307
      // eslint-disable-next-line max-len
      return this.#CardanoWasm.ByronAddress.from_base58('DdzFFzCqrht5uLsviWj6VkHLnDrXdGS188f1JH9VmmymAodgkUkkvS7ciwPHkZFYvpW62yKrbyvRja1ak3Nmyz3Qi76JLYgD1MJ4ecKc').to_address();
    }
  }

  constructor(options = {}) {
    if (!options.crypto) {
      throw new TypeError('crypto should be passed');
    }
    this.#crypto = options.crypto;

    if (!options.cache) {
      throw new TypeError('cache should be passed');
    }
    this.#cache = options.cache;

    if (!options.apiNode) {
      throw new TypeError('apiNode should be passed');
    }

    if (!options.request) {
      throw new TypeError('request should be passed');
    }
    this.#request = options.request;

    this.#apiNode = new API(options.apiNode, options.request);

    if (!options.apiWeb) {
      throw new TypeError('apiWeb should be passed');
    }
    this.#apiWeb = options.apiWeb;

    if (options.seed) {
      // https://github.com/cardano-foundation/CIPs/tree/master/CIP-1852
      // m/1852'/1815'/0'
      this.#xprv = xprvFromSeed(options.seed);
      this.#xpub = this.#xprv.toBip32PublicKey();
    } else if (options.publicKey) {
      const xpubs = JSON.parse(options.publicKey);
      this.#xpub = new Bip32PublicKey(Buffer.from(xpubs.shelley, 'hex'));
    } else {
      throw new TypeError('seed or publicKey should be passed');
    }

    this.#balance = new BigNumber(this.#cache.get('balance') || 0);
    this.#addressType = this.#cache.get('addressType') || this.addressTypes[0];
    this.#useTestNetwork = !!options.useTestNetwork;
  }

  lock() {
    if (this.#xprv) {
      this.#xprv.free();
    }
    this.#xprv = null;
  }

  unlock(seed) {
    if (this.#xprv) {
      this.#xprv.free();
    }
    this.#xprv = xprvFromSeed(seed);
    this.#xpub = this.#xprv.toBip32PublicKey();
  }

  publicKey() {
    return JSON.stringify({
      shelley: this.#xpub.toBytes().toString('hex'),
    });
  }

  #getAddress(type) {
    if (type === 'base') {
      const utxoPubKey = this.#xpub
        .derive(0) // external
        .derive(0);

      const stakeKey = this.#xpub
        .derive(2) // chimeric
        .derive(0);

      return this.#CardanoWasm.BaseAddress.new(
        this.#networkID,
        this.#CardanoWasm.StakeCredential.from_keyhash(
          this.#CardanoWasm.Ed25519KeyHash.from_bytes(Buffer.from(utxoPubKey.toPublicKey().hash(), 'hex'))
        ),
        this.#CardanoWasm.StakeCredential.from_keyhash(
          this.#CardanoWasm.Ed25519KeyHash.from_bytes(Buffer.from(stakeKey.toPublicKey().hash(), 'hex'))
        )
      ).to_address().to_bech32();
    } else {
      throw new TypeError(`unsupported address type ${type}`);
    }
  }

  #getAllAddresses() {
    return this.addressTypes.map((type) => this.#getAddress(type));
  }

  getNextAddress() {
    return this.#getAddress(this.#addressType).toString();
  }

  async load() {
    await this.loadWasm();
    this.#utxos = [];
    for (const address of this.#getAllAddresses()) {
      const utxos = await this.#apiNode.addressesUtxos(address);
      this.#utxos.push(...utxos);
    }
    await this.#loadProtocolParams();
    await this.#loadCsFee();
    this.#balance = this.#calculateBalance();
    this.#utxosForTx = this.#calculateUtxosForTx();
    this.#cache.set('balance', this.#balance);
    this.#txsCursor = 0;
    this.#dustThreshold = new BigNumber(this.#CardanoWasm.min_ada_required(
      this.#CardanoWasm.Value.new(this.#CardanoWasm.BigNum.from_str('1000000')),
      false,
      this.#CardanoWasm.BigNum.from_str(`${this.#protocolParams.coinsPerUtxoWord}`)
    ).to_str());
    for (const feeRate of this.#feeRates) {
      feeRate.maxAmount = this.#calculateMaxAmount(feeRate);
    }
  }

  async loadWasm() {
    if (!this.#CardanoWasm) {
      this.#CardanoWasm = await import('@emurgo/cardano-serialization-lib-browser');
    }
  }

  #requestWeb(config) {
    return this.#request({
      ...config,
      baseURL: this.#apiWeb,
    });
  }

  async #loadCsFee() {
    try {
      const result = await this.#requestWeb({
        url: 'api/v3/csfee',
        params: {
          crypto: 'cardano@cardano',
        },
        method: 'get',
        seed: 'public',
      });
      this.#csFee = result.fee;
      this.#csMinFee = new BigNumber(result.minFee, 10);
      this.#csMaxFee = new BigNumber(result.maxFee, 10);
      this.#csSkipMinFee = result.skipMinFee || false;
      this.#csFeeAddresses = result.addresses;
      this.#csFeeOff = result.addresses.length === 0
        || result.whitelist.includes(this.#getAddress('base'));
    } catch (err) {
      console.error(err);
    }
  }

  async #loadProtocolParams() {
    this.#protocolParams = await this.#apiNode.protocolParams();
  }

  #calculateBalance() {
    return this.#utxos
      .reduce((balance, item) => {
        return balance.plus(item.value);
      }, new BigNumber(0));
  }

  #calculateUtxosForTx() {
    return this.#utxos
      .filter((utxo) => utxo.confirmations >= this.#minConfirmations)
      .sort((a, b) => {
        if (new BigNumber(a.value).isGreaterThan(b.value)) {
          return -1;
        }
        if (new BigNumber(a.value).isLessThan(b.value)) {
          return 1;
        }
        return 0;
      })
      .slice(0, MAX_INPUTS_PER_TX);
  }

  #calculateCsFee(value) {
    return calculateCsFee(value, this.#csFeeOff, this.#csFee, this.#csMinFee, this.#csMaxFee,
      this.#csSkipMinFee, this.#dustThreshold
    );
  }

  // value = value + csFee
  #reverseCsFee(value) {
    return reverseCsFee(value, this.#csFeeOff, this.#csFee, this.#csMinFee, this.#csMaxFee,
      this.#csSkipMinFee, this.#dustThreshold
    );
  }

  #calculateMinerFee(utxos, outputs) {
    const feeAlgo = this.#CardanoWasm.LinearFee.new(
      this.#CardanoWasm.BigNum.from_str(`${this.#protocolParams.minFeeA}`),
      this.#CardanoWasm.BigNum.from_str(`${this.#protocolParams.minFeeB}`)
    );
    const builder = this.#CardanoWasm.TransactionBuilder.new(
      this.#CardanoWasm.TransactionBuilderConfigBuilder.new()
        .fee_algo(feeAlgo)
        .pool_deposit(this.#CardanoWasm.BigNum.from_str(`${this.#protocolParams.poolDeposit}`))
        .key_deposit(this.#CardanoWasm.BigNum.from_str(`${this.#protocolParams.keyDeposit}`))
        .coins_per_utxo_word(this.#CardanoWasm.BigNum.from_str(`${this.#protocolParams.coinsPerUtxoWord}`))
        .max_value_size(parseInt(this.#protocolParams.maxValSize))
        .max_tx_size(parseInt(this.#protocolParams.maxTxSize))
        .build()
    );

    for (let i = 0; i < outputs; i++) {
      builder.add_output(
        this.#CardanoWasm.TransactionOutput.new(
          this.#mockAddress,
          this.#CardanoWasm.Value.new(this.#CardanoWasm.BigNum.from_str(this.#dustThreshold.toString(10)))
        )
      );
    }

    for (const utxo of utxos) {
      builder.add_input(
        this.#CardanoWasm.Address.from_bech32(utxo.address),
        this.#CardanoWasm.TransactionInput.new(
          this.#CardanoWasm.TransactionHash.from_bytes(Buffer.from(utxo.txHash, 'hex')),
          utxo.index
        ),
        this.#CardanoWasm.Value.new(this.#CardanoWasm.BigNum.from_str(utxo.value))
      );
    }

    return new BigNumber(builder.min_fee().to_str());
  }

  #calculateMaxAmount(feeRate) {
    if (feeRate.name !== 'default') {
      throw new Error('Unsupported fee rate');
    }
    const available = this.#utxosForTx
      .reduce((balance, item) => {
        return balance.plus(item.value);
      }, new BigNumber(0));

    const minerFee = this.#calculateMinerFee(this.#utxosForTx, 3);

    if (available.isLessThanOrEqualTo(minerFee)) {
      return new BigNumber(0);
    }
    const csFee = this.#reverseCsFee(available.minus(minerFee));
    const maxAmount = available.minus(minerFee).minus(csFee);
    if (maxAmount.isLessThan(0)) {
      return new BigNumber(0);
    }
    return maxAmount;
  }

  estimateFees(value = 0) {
    const amount = new BigNumber(value, 10);
    return this.#feeRates.map((feeRate) => {
      const info = this.#estimateFee(amount, feeRate);
      return {
        name: feeRate.name,
        default: feeRate.default === true,
        estimate: info.estimate.toString(10),
        maxAmount: feeRate.maxAmount.toString(10),
      };
    });
  }

  #estimateFee(amount/*, feeRate*/) {
    const csFee = this.#calculateCsFee(amount);
    let available = new BigNumber(0);
    const utxos = [];
    for (const item of this.#utxosForTx) {
      available = available.plus(item.value);
      utxos.push(item);
      if (available.isLessThanOrEqualTo(amount)) {
        continue;
      } else {
        // fee with change: 3 outputs
        let minerFee = this.#calculateMinerFee(utxos, csFee.isZero() ? 2 : 3);
        let estimate = csFee.plus(minerFee);
        const total = amount.plus(estimate);
        if (total.isLessThanOrEqualTo(available)) {
          let change = available.minus(total);
          if (change.isGreaterThan(0) && change.isLessThanOrEqualTo(this.#dustThreshold)) {
            minerFee = minerFee.plus(change);
            estimate = estimate.plus(change);
            change = new BigNumber(0);
          }
          return {
            minerFee,
            csFee,
            change,
            estimate,
          };
        }
      }
    }

    const minerFee = this.#calculateMinerFee(this.#utxosForTx, csFee.isZero() ? 2 : 3);
    return {
      minerFee,
      csFee,
      change: new BigNumber(0),
      estimate: csFee.plus(minerFee),
    };
  }

  async loadTxs() {
    const addresses = this.#getAllAddresses();
    const txs = await this.#apiNode.addressesTxs(addresses, this.#txsCursor, this.#txsPerPage);
    this.#txsCursor++;
    return {
      txs: this.#transformTxs(txs),
      hasMoreTxs: txs.length === this.#txsPerPage,
    };
  }

  #transformTxs(txs) {
    return txs.map((tx) => {
      return this.#transformTx(tx);
    });
  }

  #transformTx(tx) {
    const addresses = this.#getAllAddresses();
    const csFeeAddresses = this.#csFeeAddresses;

    let inputValue = new BigNumber(0);
    let outputValue = new BigNumber(0);
    let csFee = new BigNumber(0);

    for (const input of tx.inputs) {
      if (addresses.includes(input.address)) {
        inputValue = inputValue.plus(input.value);
      }
    }

    for (const output of tx.outputs) {
      if (addresses.includes(output.address)) {
        outputValue = outputValue.plus(output.value);
      }
      if (csFeeAddresses.includes(output.address)) {
        csFee = csFee.plus(output.value);
      }
    }
    const fee = csFee.plus(tx.fee).toString(10);
    let amount = outputValue.minus(inputValue);
    if (amount.isLessThan(0)) {
      amount = amount.plus(fee);
    }
    return {
      id: tx.hash,
      amount: amount.toString(10),
      timestamp: new Date(tx.includedAt * 1000).getTime(),
      confirmed: tx.confirmations >= this.#minConfirmations,
      minConf: this.#minConfirmations,
      confirmations: parseInt(tx.confirmations),
      fee: fee.toString(10),
      isIncoming: amount.isGreaterThanOrEqualTo(0),
      ins: tx.inputs.map((item) => {
        return { ...item, amount: item.value };
      }),
      outs: tx.outputs.map((item) => {
        return { ...item, amount: item.value };
      }),
    };
  }

  async createTx(to, value, fee) {
    if (!to) {
      throw new Error('Invalid address');
    }
    if (this.#getAllAddresses().some((address) => address === to)) {
      throw new Error('Destination address equal source address');
    }
    let toAddress;
    try {
      if (to.startsWith('addr')) {
        toAddress = this.#CardanoWasm.Address.from_bech32(to);
      } else {
        toAddress = this.#CardanoWasm.ByronAddress.from_base58(to).to_address();
      }
    } catch (err) {
      console.error(err);
      throw new Error('Invalid address');
    }

    const amount = new BigNumber(value, 10);
    if (amount.isLessThan(this.#dustThreshold)) {
      const error = new Error('Invalid value');
      error.dustThreshold = this.#dustThreshold.toString(10);
      throw error;
    }

    const totalFee = new BigNumber(fee, 10);
    const csFee = this.#calculateCsFee(amount);

    if (!totalFee.isFinite() || totalFee.isLessThan(csFee)) {
      throw new Error('Invalid fee');
    }

    const total = amount.plus(totalFee);
    const utxos = this.#utxosForTx;

    let available = new BigNumber(0);
    let change = new BigNumber(0);
    const sources = [];

    for (const item of utxos) {
      available = available.plus(item.value);
      sources.push(item);
      if (available.isLessThan(total)) {
        continue;
      } else {
        change = available.minus(total);
        if (change.isLessThanOrEqualTo(this.#dustThreshold)) {
          if (!csFee.isZero()) {
            csFee.plus(change);
          }
          change = new BigNumber(0);
        }
        break;
      }
    }

    if (total.isGreaterThan(available)) {
      const error = new Error('Insufficient funds');
      if (total.isLessThan(this.#balance)) {
        error.details = 'Additional funds confirmation pending';
      }
      throw error;
    }

    const feeAlgo = this.#CardanoWasm.LinearFee.new(
      this.#CardanoWasm.BigNum.from_str(`${this.#protocolParams.minFeeA}`),
      this.#CardanoWasm.BigNum.from_str(`${this.#protocolParams.minFeeB}`)
    );
    const builder = this.#CardanoWasm.TransactionBuilder.new(
      this.#CardanoWasm.TransactionBuilderConfigBuilder.new()
        .fee_algo(feeAlgo)
        .pool_deposit(this.#CardanoWasm.BigNum.from_str(`${this.#protocolParams.poolDeposit}`))
        .key_deposit(this.#CardanoWasm.BigNum.from_str(`${this.#protocolParams.keyDeposit}`))
        .coins_per_utxo_word(this.#CardanoWasm.BigNum.from_str(`${this.#protocolParams.coinsPerUtxoWord}`))
        .max_value_size(parseInt(this.#protocolParams.maxValSize))
        .max_tx_size(parseInt(this.#protocolParams.maxTxSize))
        .build()
    );

    for (const utxo of sources) {
      builder.add_input(
        this.#CardanoWasm.Address.from_bech32(utxo.address),
        this.#CardanoWasm.TransactionInput.new(
          this.#CardanoWasm.TransactionHash.from_bytes(Buffer.from(utxo.txHash, 'hex')),
          utxo.index
        ),
        this.#CardanoWasm.Value.new(this.#CardanoWasm.BigNum.from_str(utxo.value))
      );
    }

    builder.add_output(
      this.#CardanoWasm.TransactionOutput.new(
        toAddress,
        this.#CardanoWasm.Value.new(this.#CardanoWasm.BigNum.from_str(amount.toString(10)))
      )
    );

    if (csFee.isGreaterThan(0)) {
      builder.add_output(
        this.#CardanoWasm.TransactionOutput.new(
          this.#CardanoWasm.Address.from_bech32(this.#csFeeAddresses[0]),
          this.#CardanoWasm.Value.new(this.#CardanoWasm.BigNum.from_str(csFee.toString(10)))
        )
      );
    }

    if (change.isGreaterThanOrEqualTo(this.#dustThreshold)) {
      builder.add_output(
        this.#CardanoWasm.TransactionOutput.new(
          this.#CardanoWasm.Address.from_bech32(this.getNextAddress()),
          this.#CardanoWasm.Value.new(this.#CardanoWasm.BigNum.from_str(change.toString(10)))
        )
      );
    }

    const minerFee = new BigNumber(builder.min_fee().to_str(), 10);
    if (totalFee.minus(csFee).isLessThan(minerFee)) {
      throw new Error('Invalid fee');
    }

    // change already added
    // but build_tx fails if add_change_if_needed is not called
    builder.add_change_if_needed(this.#CardanoWasm.Address.from_bech32(this.getNextAddress()));
    const tx = builder.build_tx();

    return {
      sign: () => {
        return this.signTx(tx);
      },
    };
  }

  signTx(tx) {
    const privKey = this.#xprv
      .derive(0)
      .derive(0)
      .toPrivateKey();
    const txBody = tx.body();
    const txHash = this.#CardanoWasm.hash_transaction(txBody);
    const witnesses = this.#CardanoWasm.TransactionWitnessSet.new();
    const vkeyWitnesses = this.#CardanoWasm.Vkeywitnesses.new();
    vkeyWitnesses.add(this.#CardanoWasm.make_vkey_witness(txHash,
      this.#CardanoWasm.PrivateKey.from_extended_bytes(Buffer.from(privKey.toBytes(), 'hex'))
    ));
    witnesses.set_vkeys(vkeyWitnesses);
    const transaction = this.#CardanoWasm.Transaction.new(txBody, witnesses);
    return Buffer.from(transaction.to_bytes()).toString('hex');
  }

  async sendTx(transaction) {
    const tx = await this.#apiNode.submitTransaction(transaction);
    for (const input of tx.inputs) {
      this.#utxos = this.#utxos.filter((utxo) => {
        return !(utxo.txHash === input.hash && utxo.index === input.index);
      });
    }
    const allAddresses = this.#getAllAddresses();
    for (const output of tx.outputs) {
      if (allAddresses.includes(output.address)) {
        this.#utxos.push({
          address: output.address,
          confirmations: tx.confirmations,
          index: output.index,
          txHash: tx.hash,
          value: output.value,
        });
      }
    }
    this.#balance = this.#calculateBalance();
    this.#cache.set('balance', this.#balance);
    this.#utxosForTx = this.#calculateUtxosForTx();
    for (const feeRate of this.#feeRates) {
      feeRate.maxAmount = this.#calculateMaxAmount(feeRate);
    }
    return this.#transformTx(tx);
  }

  txUrl(txId) {
    if (this.#useTestNetwork) {
      return `https://explorer.cardano-testnet.iohkdev.io/en/transaction?id=${txId}`;
    } else {
      return `https://blockchair.com/cardano/transaction/${txId}?from=coinwallet`;
    }
  }

  exportPrivateKeys() {
    const words = bech32.toWords(this.#xprv.toBytes());
    // https://cips.cardano.org/cips/cip5/
    return bech32.encode('acct_xsk', words, 1000);
  }
}
