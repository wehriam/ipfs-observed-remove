// @flow

const uuid = require('uuid');
const stringify = require('json-stringify-deterministic');
const { getSwarm } = require('./lib/ipfs');
const { IpfsObservedRemoveSet } = require('../src');
const { generateValue } = require('./lib/values');

jest.setTimeout(30000);

const COUNT = 10;
let nodes = [];

beforeAll(async () => {
  nodes = await getSwarm(COUNT);
});

test(`Synchronizes ${COUNT} sets`, async () => {
  const topic = uuid.v4();
  const A = generateValue();
  const B = generateValue();
  const C = generateValue();
  const aAddPromises = [];
  const bAddPromises = [];
  const cAddPromises = [];
  const aDeletePromises = [];
  const bDeletePromises = [];
  const cDeletePromises = [];
  const sets = nodes.map((node) => {
    const set = new IpfsObservedRemoveSet(node, topic);
    aAddPromises.push(new Promise((resolve) => {
      const handler = (value) => {
        if (stringify(value) === stringify(A)) {
          set.removeListener('add', handler);
          resolve();
        }
      };
      set.on('add', handler);
    }));
    bAddPromises.push(new Promise((resolve) => {
      const handler = (value) => {
        if (stringify(value) === stringify(B)) {
          set.removeListener('add', handler);
          resolve();
        }
      };
      set.on('add', handler);
    }));
    cAddPromises.push(new Promise((resolve) => {
      const handler = (value) => {
        if (stringify(value) === stringify(C)) {
          set.removeListener('add', handler);
          resolve();
        }
      };
      set.on('add', handler);
    }));
    aDeletePromises.push(new Promise((resolve) => {
      const handler = (value) => {
        if (stringify(value) === stringify(A)) {
          set.removeListener('delete', handler);
          resolve();
        }
      };
      set.on('delete', handler);
    }));
    bDeletePromises.push(new Promise((resolve) => {
      const handler = (value) => {
        if (stringify(value) === stringify(B)) {
          set.removeListener('delete', handler);
          resolve();
        }
      };
      set.on('delete', handler);
    }));
    cDeletePromises.push(new Promise((resolve) => {
      const handler = (value) => {
        if (stringify(value) === stringify(C)) {
          set.removeListener('delete', handler);
          resolve();
        }
      };
      set.on('delete', handler);
    }));
    return set;
  });
  const randomSet = () => sets[Math.floor(Math.random() * sets.length)];
  await Promise.all(sets.map((set) => set.readyPromise));
  randomSet().add(A);
  await Promise.all(aAddPromises);
  randomSet().add(B);
  await Promise.all(bAddPromises);
  randomSet().add(C);
  await Promise.all(cAddPromises);
  randomSet().delete(A);
  await Promise.all(aDeletePromises);
  randomSet().delete(B);
  await Promise.all(bDeletePromises);
  randomSet().delete(C);
  await Promise.all(cDeletePromises);
});

