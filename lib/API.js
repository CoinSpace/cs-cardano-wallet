export default class API {
  #wallet;
  constructor(wallet) {
    this.#wallet = wallet;
  }

  async protocolParams() {
    return this.#wallet.requestNode({
      method: 'GET',
      url: 'api/v1/parameters',
    });
  }

  async addressesUtxos(address) {
    return this.#wallet.requestNode({
      method: 'GET',
      url: `api/v1/addresses/${address}/utxos`,
    });
  }

  async addressesTxs(address, page, count) {
    return this.#wallet.requestNode({
      method: 'GET',
      url: `api/v1/addresses/${address}/transactions`,
      params: {
        page,
        count,
      },
    });
  }

  async submitTransaction(transaction) {
    return this.#wallet.requestNode({
      method: 'POST',
      url: 'api/v1/tx/submit',
      data: {
        transaction,
      },
    });
  }
}
