// @flow

const uuid = require('uuid');
const { getSwarm } = require('./lib/ipfs');
const { getSigner, generateId, IpfsSignedObservedRemoveSet } = require('../src');
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

test('Synchronize sets', async () => {
  const topic = uuid.v4();
  const X = generateValue();
  const Y = generateValue();
  const Z = generateValue();
  const idX = generateId();
  const idY = generateId();
  const idZ = generateId();
  const alice = new IpfsSignedObservedRemoveSet(nodes[0], topic, [], { key });
  const bob = new IpfsSignedObservedRemoveSet(nodes[1], topic, [], { key });
  await Promise.all([alice.readyPromise, bob.readyPromise]);
  let aliceAddCount = 0;
  let bobAddCount = 0;
  let aliceDeleteCount = 0;
  let bobDeleteCount = 0;
  alice.on('add', () => (aliceAddCount += 1));
  bob.on('add', () => (bobAddCount += 1));
  alice.on('delete', () => (aliceDeleteCount += 1));
  bob.on('delete', () => (bobDeleteCount += 1));
  alice.addSigned(X, idX, sign(X, idX));
  alice.addSigned(Y, idY, sign(Y, idY));
  alice.addSigned(Z, idZ, sign(Z, idZ));
  while (aliceAddCount !== 3 || bobAddCount !== 3) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  expect([...alice]).toEqual([X, Y, Z]);
  expect([...bob]).toEqual([X, Y, Z]);
  let ids = bob.activeIds(X);
  ids.forEach((d) => bob.deleteSignedId(d, sign(d)));
  ids = bob.activeIds(Y);
  ids.forEach((d) => bob.deleteSignedId(d, sign(d)));
  ids = bob.activeIds(Z);
  ids.forEach((d) => bob.deleteSignedId(d, sign(d)));
  while (aliceDeleteCount !== 3 || bobDeleteCount !== 3) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  expect([...alice]).toEqual([]);
  expect([...bob]).toEqual([]);
  alice.shutdown();
  bob.shutdown();
});


test('Synchronize add and delete events', async () => {
  const topic = uuid.v4();
  const X = generateValue();
  const Y = generateValue();
  const idX = generateId();
  const idY = generateId();
  const alice = new IpfsSignedObservedRemoveSet(nodes[0], topic, [], { key });
  const bob = new IpfsSignedObservedRemoveSet(nodes[1], topic, [], { key });
  await Promise.all([alice.readyPromise, bob.readyPromise]);
  alice.on('publish', (message) => {
    bob.process(message);
  });
  bob.on('publish', (message) => {
    alice.process(message);
  });
  const aliceAddXPromise = new Promise((resolve) => {
    alice.once('add', (value) => {
      expect(value).toEqual(X);
      resolve();
    });
  });
  const aliceDeleteXPromise = new Promise((resolve) => {
    alice.once('delete', (value) => {
      expect(value).toEqual(X);
      resolve();
    });
  });
  bob.addSigned(X, idX, sign(X, idX));
  await aliceAddXPromise;
  let ids = bob.activeIds(X);
  ids.forEach((d) => bob.deleteSignedId(d, sign(d)));
  await aliceDeleteXPromise;
  const bobAddYPromise = new Promise((resolve) => {
    bob.once('add', (value) => {
      expect(value).toEqual(Y);
      resolve();
    });
  });
  const bobDeleteYPromise = new Promise((resolve) => {
    bob.once('delete', (value) => {
      expect(value).toEqual(Y);
      resolve();
    });
  });
  alice.addSigned(Y, idY, sign(Y, idY));
  await bobAddYPromise;
  ids = alice.activeIds(Y);
  ids.forEach((d) => alice.deleteSignedId(d, sign(d)));
  await bobDeleteYPromise;
  alice.shutdown();
  bob.shutdown();
});


test('Automatically synchronize mixed sets', async () => {
  const topic = uuid.v4();
  const A = generateValue();
  const B = generateValue();
  const C = generateValue();
  const X = generateValue();
  const Y = generateValue();
  const Z = generateValue();
  const idA = generateId();
  const idB = generateId();
  const idC = generateId();
  const idX = generateId();
  const idY = generateId();
  const idZ = generateId();
  const alice = new IpfsSignedObservedRemoveSet(nodes[0], topic, [[A, idA, sign(A, idA)], [B, idB, sign(B, idB)], [C, idC, sign(C, idC)]], { key });
  await alice.readyPromise;
  const bob = new IpfsSignedObservedRemoveSet(nodes[1], topic, [[X, idX, sign(X, idX)], [Y, idY, sign(Y, idY)], [Z, idZ, sign(Z, idZ)]], { key });
  await bob.readyPromise;
  expect(alice.dump()).not.toEqual(bob.dump());
  await new Promise((resolve) => setTimeout(resolve, 250));
  expect(alice.dump()).toEqual(bob.dump());
  alice.shutdown();
  bob.shutdown();
});

