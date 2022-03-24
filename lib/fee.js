import BigNumber from 'bignumber.js';

export function calculateCsFee(value, csFeeOff, csFee, csMinFee, csMaxFee, csSkipMinFee, dustThreshold) {
  if (csFeeOff) {
    return new BigNumber(0);
  }
  let fee = value.multipliedBy(csFee).integerValue(BigNumber.ROUND_DOWN);
  if (csSkipMinFee === true && fee.isLessThan(csMinFee)) {
    return new BigNumber(0);
  } else {
    fee = BigNumber.maximum(fee, csMinFee);
  }
  fee = BigNumber.minimum(fee, csMaxFee);
  fee = BigNumber.maximum(fee, dustThreshold);
  return fee;
}

// value = value + csFee
export function reverseCsFee(value, csFeeOff, csFee, csMinFee, csMaxFee, csSkipMinFee, dustThreshold) {
  if (csFeeOff) {
    return new BigNumber(0);
  }
  // maybe 1^-12 bigger then actual fee
  let reverse = value.multipliedBy(csFee / (1 + csFee)).integerValue(BigNumber.ROUND_DOWN);
  if (csSkipMinFee === true && reverse.isLessThan(csMinFee)) {
    return new BigNumber(0);
  } else {
    reverse = BigNumber.maximum(reverse, csMinFee);
  }
  reverse = BigNumber.minimum(reverse, csMaxFee);
  reverse = BigNumber.maximum(reverse, dustThreshold);
  const fee = calculateCsFee(value.minus(reverse), csFeeOff, csFee, csMinFee, csMaxFee, csSkipMinFee, dustThreshold);
  return BigNumber.maximum(reverse, fee);
}
