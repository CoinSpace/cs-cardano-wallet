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
    });
  }

  async addressesUtxos(address) {
    return this.#request({
      baseURL: this.#baseURL,
      url: `addresses/${address}/utxos`,
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
    });
  }
}
