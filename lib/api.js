export default class API {
  #baseURL;
  #request;
  constructor(baseURL, request) {
    this.#baseURL = `${baseURL}api/v1/`;
    this.#request = request;
  }

  async protocolParams() {
    return this.#request({
      baseURL: this.#baseURL,
      url: 'parameters',
      seed: 'public',
    });
  }

  async addressesUtxos(address) {
    return this.#request({
      baseURL: this.#baseURL,
      url: `addresses/${address}/utxos`,
      seed: 'public',
    });
  }

  async addressesTxs(address, page, count) {
    return this.#request({
      baseURL: this.#baseURL,
      url: `addresses/${address}/transactions`,
      params: {
        page,
        count,
      },
      seed: 'public',
    });
  }

  async submitTransaction(transaction) {
    return this.#request({
      baseURL: this.#baseURL,
      method: 'POST',
      url: 'tx/submit',
      data: {
        transaction,
      },
      seed: 'public',
    });
  }
}
