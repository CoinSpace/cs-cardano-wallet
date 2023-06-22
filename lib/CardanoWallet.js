import API from './API.js';
import { Buffer } from 'buffer';
import { bech32 } from '@scure/base';
import cardanolib from '@stricahq/typhonjs';
import { Bip32PrivateKey, Bip32PublicKey } from './bip32ed25519.js';

import {
  Amount,
  CsWallet,
  Transaction,
  errors,
} from '@coinspace/cs-common';

// TODO remove bignumber.js dependency
// https://github.com/StricaHQ/typhonjs/issues/28
import BigNumber from 'bignumber.js';

const MAX_INPUTS_PER_TX = 400;
// 1 ADA = 1_000_000 lovelace
const ADA = 1_000_000n;

class CardanoTransaction extends Transaction {
  get url() {
    if (this.development) {
      return `https://preprod.cardanoscan.io/transaction/${this.id}`;
    }
    return `https://blockchair.com/cardano/transaction/${this.id}?from=coinwallet`;
  }
}

export default class CardanoWallet extends CsWallet {
  #api;
  #xpub;
  #balance = 0n;
  #utxos = [];
  #minConfirmations = 3;

  // memorized functions
  #getProtocolParams;
  #getUtxosForTx;
  #getDustThreshold;
  #estimateMaxAmount;
  #estimateTransactionFee;

  get defaultSettings() {
    // https://github.com/cardano-foundation/CIPs/tree/master/CIP-1852
    // m/1852'/1815'/0'
    return {
      bip44: "m/1852'/1815'/0'",
    };
  }

  get isSettingsSupported() {
    return true;
  }

  get address() {
    return this.#getAddress().getBech32();
  }

  get balance() {
    return new Amount(this.#balance, this.crypto.decimals);
  }

  constructor(options = {}) {
    super(options);
    this.#api = new API(this);
    this.#getProtocolParams = this.memoize(this._getProtocolParams);
    this.#getUtxosForTx = this.memoize(this._getUtxosForTx);
    this.#getDustThreshold = this.memoize(this._getDustThreshold);
    this.#estimateMaxAmount = this.memoize(this._estimateMaxAmount);
    this.#estimateTransactionFee = this.memoize(this._estimateTransactionFee);
  }

  get #networkID() {
    if (this.development) {
      return cardanolib.types.NetworkId.TESTNET;
    } else {
      return cardanolib.types.NetworkId.MAINNET;
    }
  }

  #parseAddress(string) {
    try {
      return cardanolib.utils.getAddressFromBech32(string);
    } catch (err) {
      throw new errors.InvalidAddressError(string, { cause: err });
    }
  }

  #xprvFromSeed(seed) {
    return Bip32PrivateKey.fromSeed(seed)
      .derivePath(this.settings.bip44);
  }

  async create(seed) {
    this.typeSeed(seed);
    this.state = CsWallet.STATE_INITIALIZING;
    const xprv = this.#xprvFromSeed(seed);
    this.#xpub = xprv.toBip32PublicKey();
    this.#init();
    this.state = CsWallet.STATE_INITIALIZED;
  }

  async open(publicKey) {
    this.typePublicKey(publicKey);
    this.state = CsWallet.STATE_INITIALIZING;
    if (publicKey?.settings?.bip44 === this.settings.bip44) {
      this.#xpub = new Bip32PublicKey(Buffer.from(publicKey.data.shelley, 'hex'));
      this.#init();
      this.state = CsWallet.STATE_INITIALIZED;
    } else {
      this.state = CsWallet.STATE_NEED_INITIALIZATION;
    }
  }

  #init() {
    this.#balance = BigInt(this.storage.get('balance') || 0);
  }

  async load() {
    this.state = CsWallet.STATE_LOADING;
    this.#utxos = (await this.#addressesUtxos(this.address)).map((utxo) => {
      return {
        ...utxo,
        txId: utxo.txHash,
        address: cardanolib.utils.getAddressFromBech32(utxo.address),
        value: BigInt(utxo.value),
        tokens: [],
      };
    });
    this.#balance = this.#calculateBalance();
    this.storage.set('balance', this.#balance.toString());
    await this.storage.save();
    this.state = CsWallet.STATE_LOADED;
  }

  async cleanup() {
    await super.cleanup();
    this.memoizeClear(this.#getProtocolParams);
    this.memoizeClear(this.#getUtxosForTx);
    this.memoizeClear(this.#getDustThreshold);
    this.memoizeClear(this.#estimateMaxAmount);
    this.memoizeClear(this.#estimateTransactionFee);
  }

  #getAddress() {
    const utxoPubKey = this.#xpub
      .derive(0) // external
      .derive(0);

    const stakeKey = this.#xpub
      .derive(2) // chimeric
      .derive(0);

    return new cardanolib.address.BaseAddress(this.#networkID, {
      hash: utxoPubKey.toPublicKey().hash().toString('hex'),
      type: cardanolib.types.HashType.ADDRESS,
    }, {
      hash: stakeKey.toPublicKey().hash().toString('hex'),
      type: cardanolib.types.HashType.ADDRESS,
    });
  }

  getPublicKey() {
    return {
      settings: this.settings,
      data: {
        shelley: this.#xpub.toBytes().toString('hex'),
      },
    };
  }

  getPrivateKey(seed) {
    this.typeSeed(seed);
    // https://cips.cardano.org/cips/cip5/
    const xprv = this.#xprvFromSeed(seed);
    const words = bech32.toWords(xprv.toBytes());
    return [{
      address: this.address,
      privatekey: bech32.encode('acct_xsk', words, 1000),
    }];
  }

  async _getProtocolParams() {
    const params = await this.#api.protocolParams();
    params.lovelacePerUtxoWord = new BigNumber(params.coinsPerUtxoWord);
    return params;
  }

  async #addressesUtxos(address) {
    return this.#api.addressesUtxos(address);
  }

  #calculateBalance() {
    return this.#utxos
      .reduce((balance, item) => {
        return balance + item.value;
      }, 0n);
  }

  _getUtxosForTx(unconfirmed = false) {
    return this.#utxos
      .filter((utxo) => unconfirmed || (utxo.confirmations >= this.#minConfirmations))
      .sort((a, b) => {
        if (a.value > b.value) {
          return -1;
        }
        if (a.value < b.value) {
          return 1;
        }
        return 0;
      }).map((utxo) => {
        return {
          ...utxo,
          amount: new BigNumber(utxo.value),
        };
      })
      // TODO remove when https://github.com/StricaHQ/typhonjs/issues/27
      .slice(0, MAX_INPUTS_PER_TX);
  }

  async #paymentTransaction(inputs, outputs, change = true) {
    const protocolParams = await this.#getProtocolParams();
    const transaction = new cardanolib.Transaction({ protocolParams }).paymentTransaction({
      inputs,
      outputs,
      changeAddress: this.#getAddress(),
    });
    if (change === false) {
      const output = transaction.outputs.find((output) => {
        return output.address.getBech32() === this.address;
      });
      if (output) {
        transaction.outputs.splice(transaction.outputs.indexOf(output), 1);
        transaction.setFee(transaction.getFee().plus(output.amount));
      }
    }
    return transaction;
  }

  async _getDustThreshold() {
    // TODO: min_ada_required is deprecated
    // https://docs.cardano.org/native-tokens/minimum-ada-value-requirement
    // https://github.com/Emurgo/cardano-serialization-lib/blob/11.1.0/rust/pkg/cardano_serialization_lib.js.flow#L163-L166
    const protocolParams = await this.#getProtocolParams();
    const dustThreshold = BigInt(cardanolib.utils.calculateMinUtxoAmount([],
      new BigNumber(protocolParams.coinsPerUtxoWord), false).toString());
    return dustThreshold > ADA ? dustThreshold : ADA;
  }

  async #calculateMinerFee(inputs, outputs, change) {
    const transaction = await this.#paymentTransaction(inputs, outputs, change);
    return BigInt(transaction.getFee().toString());
  }

  async #calculateMaxMinerFee(inputs, outputCount = 2) {
    const protocolParams = await this.#getProtocolParams();
    const transaction = new cardanolib.Transaction({ protocolParams });
    for (const input of inputs) {
      transaction.addInput(input);
    }
    for (let i = 0; i < outputCount; i++) {
      transaction.addOutput({
        address: this.#getAddress(),
        // https://github.com/StricaHQ/cbors/blob/f8e3695f8b02533868f84df96d9800542caee1c9/src/utils.ts#L12
        // MAX_BIG_NUM_INT64
        amount: new BigNumber('0xffffffffffffffff'),
        tokens: [],
      });
    }
    return BigInt(transaction.calculateFee().toString());
  }

  async calculateCsFee(value) {
    const dustThreshold = await this.#getDustThreshold();
    return super.calculateCsFee(value, {
      dustThreshold,
    });
  }

  async validateAddress({ address }) {
    super.validateAddress({ address });
    const parsedAddress = this.#parseAddress(address);
    if (parsedAddress.getBech32() === this.address) {
      throw new errors.DestinationEqualsSourceError();
    }
    return true;
  }

  async validateAmount({ address, amount }) {
    super.validateAmount({ address, amount });
    const { value } = amount;
    const dustThreshold = await this.#getDustThreshold();
    if (value < dustThreshold) {
      throw new errors.SmallAmountError(new Amount(dustThreshold, this.crypto.decimals));
    }
    const maxAmount = await this.#estimateMaxAmount();
    if (value > maxAmount) {
      const unconfirmedMaxAmount = await this.#estimateMaxAmount(true);
      if (value < unconfirmedMaxAmount) {
        throw new errors.BigAmountConfirmationPendingError(new Amount(maxAmount, this.crypto.decimals));
      } else {
        throw new errors.BigAmountError(new Amount(maxAmount, this.crypto.decimals));
      }
    }
    return true;
  }

  async _estimateMaxAmount(unconfirmed = false) {
    const utxos = await this.#getUtxosForTx(unconfirmed);
    const available = utxos
      .reduce((balance, item) => {
        return balance + item.value;
      }, 0n);

    if (available === 0n) {
      return 0n;
    }
    const csFeeConfig = await this.getCsFeeConfig();
    const minerFee = await this.#calculateMaxMinerFee(utxos, csFeeConfig.disabled ? 1 : 2);
    if (available <= minerFee) {
      return 0n;
    }
    const csFee = await this.calculateCsFee(available - minerFee);
    return available - minerFee - csFee;
  }

  async estimateMaxAmount({ address }) {
    super.estimateMaxAmount({ address });
    const maxAmount = await this.#estimateMaxAmount();
    return new Amount(maxAmount, this.crypto.decimals);
  }

  async _estimateTransactionFee({ address, value }) {
    const utxos = await this.#getUtxosForTx();
    const csFeeConfig = await this.getCsFeeConfig();
    const csFee = await this.calculateCsFee(value);
    const outputs = [{
      address: this.#parseAddress(address),
      amount: new BigNumber(value),
    }];
    if (csFee > 0n) {
      outputs.push({
        address: this.#parseAddress(csFeeConfig.address),
        amount: new BigNumber(csFee),
      });
    }
    const maxAmount = await this.#estimateMaxAmount();
    const dustThreshold = await this.#getDustThreshold();
    const hasChange = (maxAmount - value) >= dustThreshold;
    const minerFee = await this.#calculateMinerFee(utxos, outputs, hasChange);
    return minerFee + csFee;
  }

  async estimateTransactionFee({ address, amount }) {
    super.estimateTransactionFee({ address, amount });
    const { value } = amount;
    const fee = await this.#estimateTransactionFee({ address, value });
    return new Amount(fee, this.crypto.decimals);
  }

  async createTransaction({ address, amount }, seed) {
    super.createTransaction({ address, amount }, seed);
    const { value } = amount;
    const csFeeConfig = await this.getCsFeeConfig();
    const csFee = await this.calculateCsFee(value);
    const outputs = [{
      address: this.#parseAddress(address),
      amount: new BigNumber(value),
    }];
    if (csFee > 0n) {
      outputs.push({
        address: this.#parseAddress(csFeeConfig.address),
        amount: new BigNumber(csFee),
      });
    }
    const maxAmount = await this.#estimateMaxAmount();
    const dustThreshold = await this.#getDustThreshold();
    const hasChange = (maxAmount - value) >= dustThreshold;
    const inputs = await this.#getUtxosForTx();
    const transaction = await this.#paymentTransaction(inputs, outputs, hasChange);
    const txHash = transaction.getTransactionHash();
    // we use only one address so there is only one witness
    //const requiredSignatures = transaction.getRequiredWitnesses();
    const privateKey = this.#xprvFromSeed(seed).derive(0).derive(0).toPrivateKey();
    const witness = {
      publicKey: privateKey.toPublicKey().toBytes(),
      signature: privateKey.sign(txHash),
    };
    transaction.addWitness(witness);
    const res = await this.#api.submitTransaction(transaction.buildTransaction().payload);
    for (const input of res.inputs) {
      this.#utxos = this.#utxos.filter((utxo) => {
        return !(utxo.txId === input.hash && utxo.index === input.index);
      });
    }
    for (const output of res.outputs) {
      if (output.address === this.address) {
        this.#utxos.push({
          txId: res.hash,
          address: cardanolib.utils.getAddressFromBech32(output.address),
          value: BigInt(output.value),
          tokens: [],
          confirmations: res.confirmations,
          index: output.index,
        });
      }
    }
    this.#balance = this.#calculateBalance();
    this.storage.set('balance', this.#balance.toString());
    await this.storage.save();
  }

  async loadTransactions({ cursor = 0 } = {}) {
    const txs = await this.#api.addressesTxs(this.address, cursor, this.txPerPage);
    return {
      transactions: await Promise.all(this.#transformTxs(txs)),
      hasMore: txs.length >= this.txPerPage,
      cursor: cursor + 1,
    };
  }

  #transformTxs(txs) {
    return txs.map((tx) => {
      return this.#transformTx(tx);
    });
  }

  async #transformTx(tx) {
    let inputValue = 0n;
    let outputValue = 0n;
    let csFee = 0n;
    let to;
    let from;
    for (const input of tx.inputs) {
      if (this.address === input.address) {
        inputValue = inputValue + BigInt(input.value);
        from = this.address;
      }
    }
    for (const output of tx.outputs) {
      if (this.address === output.address) {
        outputValue = outputValue + BigInt(output.value);
      } else if (output.csfee === true) {
        csFee = csFee + BigInt(output.value);
      } else {
        to = output.address;
      }
    }
    const totalFee = csFee + BigInt(tx.fee);
    const value = outputValue - inputValue;
    let amount;
    let incoming;
    if (value > 0) {
      amount = new Amount(value, this.crypto.decimals);
      incoming = true;
    } else {
      amount = new Amount(-1n * value - totalFee, this.crypto.decimals);
      incoming = false;
    }
    let status;
    if (tx.confirmations >= this.#minConfirmations) {
      status = CardanoTransaction.STATUS_SUCCESS;
    } else {
      status = CardanoTransaction.STATUS_PENDING;
    }
    return new CardanoTransaction({
      type: Transaction.TYPE_TRANSFER,
      status,
      id: tx.hash,
      to: incoming ? this.address : to,
      from,
      amount,
      incoming,
      fee: new Amount(totalFee, this.crypto.decimals),
      timestamp: new Date(tx.includedAt * 1000),
      confirmations: parseInt(tx.confirmations),
      minConfirmations: this.#minConfirmations,
      development: this.development,
    });
  }
}
