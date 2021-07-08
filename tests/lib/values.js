// @flow

const uuid = require('uuid');

const generateValue = (depth?:number = 0):any => {
  if (Math.random() < 0.4) {
    return 1000 * Math.random();
  }
  if (Math.random() < 0.4) {
    return uuid.v4();
  }
  if (depth > 2) {
    return { [uuid.v4()]: uuid.v4() };
  }
  const propertyCount = Math.round(Math.random() * 4);
  const o = {};
  for (let i = 0; i < propertyCount; i += 1) {
    o[uuid.v4()] = generateValue(depth + 1);
  }
  return o;
};

module.exports.generateValue = generateValue;
