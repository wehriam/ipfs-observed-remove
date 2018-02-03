// @flow

const uuid = require('uuid');
const { getSwarm } = require('./lib/ipfs');
const { getSigner, generateId, IpfsSignedObservedRemoveMap } = require('../src');
const { generateValue } = require('./lib/values');
const expect = require('expect');
const NodeRSA = require('node-rsa');

const privateKey = new NodeRSA({ b: 512 });
const sign = getSigner(privateKey.exportKey('pkcs1-private-pem'));
const key = privateKey.exportKey('pkcs1-public-pem');

jest.setTimeout(30000);

let nodes = [];

beforeAll(async () => {
  nodes = await getSwarm(2);
});

test('Synchronize maps', async () => {
  const topic = uuid.v4();
  const keyX = uuid.v4();
  const keyY = uuid.v4();
  const keyZ = uuid.v4();
  const valueX = generateValue();
  const valueY = generateValue();
  const valueZ = generateValue();
  const idX = generateId();
  const idY = generateId();
  const idZ = generateId();
  const alice = new IpfsSignedObservedRemoveMap(nodes[0], topic, [], { key });
  const bob = new IpfsSignedObservedRemoveMap(nodes[1], topic, [], { key });
  await Promise.all([alice.readyPromise, bob.readyPromise]);
  let aliceAddCount = 0;
  let bobAddCount = 0;
  let aliceDeleteCount = 0;
  let bobDeleteCount = 0;
  alice.on('set', () => (aliceAddCount += 1));
  bob.on('set', () => (bobAddCount += 1));
  alice.on('delete', () => (aliceDeleteCount += 1));
  bob.on('delete', () => (bobDeleteCount += 1));
  alice.setSigned(keyX, valueX, idX, sign(keyX, valueX, idX));
  alice.setSigned(keyY, valueY, idY, sign(keyY, valueY, idY));
  alice.setSigned(keyZ, valueZ, idZ, sign(keyZ, valueZ, idZ));
  while (aliceAddCount !== 3 || bobAddCount !== 3) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  expect(alice.get(keyX)).toEqual(valueX);
  expect(alice.get(keyY)).toEqual(valueY);
  expect(alice.get(keyZ)).toEqual(valueZ);
  expect(bob.get(keyX)).toEqual(valueX);
  expect(bob.get(keyY)).toEqual(valueY);
  expect(bob.get(keyZ)).toEqual(valueZ);
  expect([...alice]).toEqual([[keyX, valueX], [keyY, valueY], [keyZ, valueZ]]);
  expect([...bob]).toEqual([[keyX, valueX], [keyY, valueY], [keyZ, valueZ]]);
  let ids = bob.activeIds(keyX);
  ids.forEach((d) => bob.deleteSignedId(d, sign(d)));
  ids = bob.activeIds(keyY);
  ids.forEach((d) => bob.deleteSignedId(d, sign(d)));
  ids = bob.activeIds(keyZ);
  ids.forEach((d) => bob.deleteSignedId(d, sign(d)));
  while (aliceDeleteCount !== 3 || bobDeleteCount !== 3) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  expect(alice.get(keyX)).toBeUndefined();
  expect(alice.get(keyY)).toBeUndefined();
  expect(alice.get(keyZ)).toBeUndefined();
  expect(bob.get(keyX)).toBeUndefined();
  expect(bob.get(keyY)).toBeUndefined();
  expect(bob.get(keyZ)).toBeUndefined();
  expect([...alice]).toEqual([]);
  expect([...bob]).toEqual([]);
  alice.shutdown();
  bob.shutdown();
});


test('Synchronize set and delete events', async () => {
  const topic = uuid.v4();
  const keyX = uuid.v4();
  const keyY = uuid.v4();
  const valueX = generateValue();
  const valueY = generateValue();
  const idX = generateId();
  const idY = generateId();
  const alice = new IpfsSignedObservedRemoveMap(nodes[0], topic, [], { key });
  const bob = new IpfsSignedObservedRemoveMap(nodes[1], topic, [], { key });
  await Promise.all([alice.readyPromise, bob.readyPromise]);
  const aliceSetXPromise = new Promise((resolve) => {
    alice.once('set', (k, v) => {
      expect(k).toEqual(keyX);
      expect(v).toEqual(valueX);
      resolve();
    });
  });
  const aliceDeleteXPromise = new Promise((resolve) => {
    alice.once('delete', (k, v) => {
      expect(k).toEqual(keyX);
      expect(v).toEqual(valueX);
      resolve();
    });
  });
  bob.setSigned(keyX, valueX, idX, sign(keyX, valueX, idX));
  await aliceSetXPromise;
  let ids = bob.activeIds(keyX);
  ids.forEach((d) => bob.deleteSignedId(d, sign(d)));
  await aliceDeleteXPromise;
  const bobSetYPromise = new Promise((resolve) => {
    bob.once('set', (k, v) => {
      expect(k).toEqual(keyY);
      expect(v).toEqual(valueY);
      resolve();
    });
  });
  const bobDeleteYPromise = new Promise((resolve) => {
    bob.once('delete', (k, v) => {
      expect(k).toEqual(keyY);
      expect(v).toEqual(valueY);
      resolve();
    });
  });
  alice.setSigned(keyY, valueY, idY, sign(keyY, valueY, idY));
  await bobSetYPromise;
  ids = alice.activeIds(keyY);
  ids.forEach((d) => alice.deleteSignedId(d, sign(d)));
  await bobDeleteYPromise;
  alice.shutdown();
  bob.shutdown();
});

test('Synchronize mixed maps using sync', async () => {
  const topic = uuid.v4();
  const keyA = uuid.v4();
  const keyB = uuid.v4();
  const keyC = uuid.v4();
  const keyX = uuid.v4();
  const keyY = uuid.v4();
  const keyZ = uuid.v4();
  const valueA = generateValue();
  const valueB = generateValue();
  const valueC = generateValue();
  const valueX = generateValue();
  const valueY = generateValue();
  const valueZ = generateValue();
  const idA = generateId();
  const idB = generateId();
  const idC = generateId();
  const idX = generateId();
  const idY = generateId();
  const idZ = generateId();
  const alice = new IpfsSignedObservedRemoveMap(nodes[0], topic, [[keyA, valueA, idA, sign(keyA, valueA, idA)], [keyB, valueB, idB, sign(keyB, valueB, idB)], [keyC, valueC, idC, sign(keyC, valueC, idC)]], { key });
  await alice.readyPromise;
  const bob = new IpfsSignedObservedRemoveMap(nodes[1], topic, [[keyX, valueX, idX, sign(keyX, valueX, idX)], [keyY, valueY, idY, sign(keyY, valueY, idY)], [keyZ, valueZ, idZ, sign(keyZ, valueZ, idZ)]], { key });
  await bob.readyPromise;
  expect(alice.dump()).not.toEqual(bob.dump());
  await new Promise((resolve) => setTimeout(resolve, 250));
  expect(alice.dump()).toEqual(bob.dump());
  alice.shutdown();
  bob.shutdown();
});

