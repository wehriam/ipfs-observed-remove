// @flow

import { v4 as uuidv4 } from 'uuid';

export const generateValue = (depth?:number = 0):any => {
  if (Math.random() < 0.4) {
    return 1000 * Math.random();
  }
  if (Math.random() < 0.4) {
    return uuidv4();
  }
  if (depth > 2) {
    return { [uuidv4()]: uuidv4() };
  }
  const propertyCount = Math.round(Math.random() * 4);
  const o = {};
  for (let i = 0; i < propertyCount; i += 1) {
    o[uuidv4()] = generateValue(depth + 1);
  }
  return o;
};
