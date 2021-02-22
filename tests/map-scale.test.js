// @flow

require('jest-extended');
const uuid = require('uuid');
const stringify = require('json-stringify-deterministic');
const { getSwarm, closeAllNodes } = require('./lib/ipfs');
const { IpfsObservedRemoveMap } = require('../src');
const { generateValue } = require('./lib/values');

jest.setTimeout(30000);

const COUNT = 10;
let nodes = [];

describe('Map Scale', () => {
  beforeAll(async () => {
    nodes = await getSwarm(COUNT);
  });

  afterAll(async () => {
    await closeAllNodes();
  });

  test(`Synchronizes ${COUNT} maps`, async () => {
    const topic = uuid.v4();
    const keyA = uuid.v4();
    const keyB = uuid.v4();
    const keyC = uuid.v4();
    const valueA = generateValue();
    const valueB = generateValue();
    const valueC = generateValue();
    const aMapPromises = [];
    const bMapPromises = [];
    const cMapPromises = [];
    const aDeletePromises = [];
    const bDeletePromises = [];
    const cDeletePromises = [];
    const maps = nodes.map((node) => {
      const map = new IpfsObservedRemoveMap(node, topic, undefined, { bufferPublishing: 0 });
      aMapPromises.push(new Promise((resolve) => {
        const handler = (key, value) => {
          if (key === keyA && stringify(value) === stringify(valueA)) {
            map.removeListener('set', handler);
            resolve();
          }
        };
        map.on('set', handler);
      }));
      bMapPromises.push(new Promise((resolve) => {
        const handler = (key, value) => {
          if (key === keyB && stringify(value) === stringify(valueB)) {
            map.removeListener('set', handler);
            resolve();
          }
        };
        map.on('set', handler);
      }));
      cMapPromises.push(new Promise((resolve) => {
        const handler = (key, value) => {
          if (key === keyC && stringify(value) === stringify(valueC)) {
            map.removeListener('set', handler);
            resolve();
          }
        };
        map.on('set', handler);
      }));
      aDeletePromises.push(new Promise((resolve) => {
        const handler = (key, value) => {
          if (key === keyA && stringify(value) === stringify(valueA)) {
            map.removeListener('delete', handler);
            resolve();
          }
        };
        map.on('delete', handler);
      }));
      bDeletePromises.push(new Promise((resolve) => {
        const handler = (key, value) => {
          if (key === keyB && stringify(value) === stringify(valueB)) {
            map.removeListener('delete', handler);
            resolve();
          }
        };
        map.on('delete', handler);
      }));
      cDeletePromises.push(new Promise((resolve) => {
        const handler = (key, value) => {
          if (key === keyC && stringify(value) === stringify(valueC)) {
            map.removeListener('delete', handler);
            resolve();
          }
        };
        map.on('delete', handler);
      }));
      return map;
    });
    const randomMap = () => maps[Math.floor(Math.random() * maps.length)];
    await Promise.all(maps.map((map) => map.readyPromise));
    randomMap().set(keyA, valueA);
    await Promise.all(aMapPromises);
    randomMap().set(keyB, valueB);
    await Promise.all(bMapPromises);
    randomMap().set(keyC, valueC);
    await Promise.all(cMapPromises);
    randomMap().delete(keyA);
    await Promise.all(aDeletePromises);
    randomMap().delete(keyB);
    await Promise.all(bDeletePromises);
    randomMap().delete(keyC);
    await Promise.all(cDeletePromises);
    await Promise.all(maps.map((map) => map.shutdown()));
  });

  test(`Synchronizes ${COUNT} maps automatically`, async () => {
    const topic = uuid.v4();
    const maps = [new IpfsObservedRemoveMap(nodes[0], topic, [[uuid.v4(), generateValue()]])];
    await maps[0].readyPromise;
    const setPromises = [];
    for (let i = 1; i < nodes.length; i += 1) {
      const map = new IpfsObservedRemoveMap(nodes[i], topic, undefined, { bufferPublishing: 0 });
      maps.push(map);
      setPromises.push(new Promise((resolve) => {
        const handler = () => {
          map.removeListener('set', handler);
          resolve();
        };
        map.on('set', handler);
      }));
    }
    await Promise.all(maps.map((set) => set.readyPromise));
    await Promise.all(setPromises);
    const dump = maps[0].dump();
    for (let i = 1; i < maps.length; i += 1) {
      expect(maps[i].dump()).toEqual(dump);
    }
    await Promise.all(maps.map((map) => map.shutdown()));
  });


  test(`Synchronizes ${COUNT} maps (chunked)`, async () => {
    const topic = uuid.v4();
    const keyA = uuid.v4();
    const keyB = uuid.v4();
    const keyC = uuid.v4();
    const valueA = generateValue();
    const valueB = generateValue();
    const valueC = generateValue();
    const aMapPromises = [];
    const bMapPromises = [];
    const cMapPromises = [];
    const aDeletePromises = [];
    const bDeletePromises = [];
    const cDeletePromises = [];
    const maps = nodes.map((node) => {
      const map = new IpfsObservedRemoveMap(node, topic, undefined, { chunkPubSub: true, bufferPublishing: 0 });
      aMapPromises.push(new Promise((resolve) => {
        const handler = (key, value) => {
          if (key === keyA && stringify(value) === stringify(valueA)) {
            map.removeListener('set', handler);
            resolve();
          }
        };
        map.on('set', handler);
      }));
      bMapPromises.push(new Promise((resolve) => {
        const handler = (key, value) => {
          if (key === keyB && stringify(value) === stringify(valueB)) {
            map.removeListener('set', handler);
            resolve();
          }
        };
        map.on('set', handler);
      }));
      cMapPromises.push(new Promise((resolve) => {
        const handler = (key, value) => {
          if (key === keyC && stringify(value) === stringify(valueC)) {
            map.removeListener('set', handler);
            resolve();
          }
        };
        map.on('set', handler);
      }));
      aDeletePromises.push(new Promise((resolve) => {
        const handler = (key, value) => {
          if (key === keyA && stringify(value) === stringify(valueA)) {
            map.removeListener('delete', handler);
            resolve();
          }
        };
        map.on('delete', handler);
      }));
      bDeletePromises.push(new Promise((resolve) => {
        const handler = (key, value) => {
          if (key === keyB && stringify(value) === stringify(valueB)) {
            map.removeListener('delete', handler);
            resolve();
          }
        };
        map.on('delete', handler);
      }));
      cDeletePromises.push(new Promise((resolve) => {
        const handler = (key, value) => {
          if (key === keyC && stringify(value) === stringify(valueC)) {
            map.removeListener('delete', handler);
            resolve();
          }
        };
        map.on('delete', handler);
      }));
      return map;
    });
    const randomMap = () => maps[Math.floor(Math.random() * maps.length)];
    await Promise.all(maps.map((map) => map.readyPromise));
    randomMap().set(keyA, valueA);
    await Promise.all(aMapPromises);
    randomMap().set(keyB, valueB);
    await Promise.all(bMapPromises);
    randomMap().set(keyC, valueC);
    await Promise.all(cMapPromises);
    randomMap().delete(keyA);
    await Promise.all(aDeletePromises);
    randomMap().delete(keyB);
    await Promise.all(bDeletePromises);
    randomMap().delete(keyC);
    await Promise.all(cDeletePromises);
    await Promise.all(maps.map((map) => map.shutdown()));
  });

  test(`Synchronizes ${COUNT} maps automatically (chunked)`, async () => {
    const topic = uuid.v4();
    const maps = [new IpfsObservedRemoveMap(nodes[0], topic, [[uuid.v4(), generateValue()]], { chunkPubSub: true, bufferPublishing: 0 })];
    await maps[0].readyPromise;
    const setPromises = [];
    for (let i = 1; i < nodes.length; i += 1) {
      const map = new IpfsObservedRemoveMap(nodes[i], topic, undefined, { chunkPubSub: true, bufferPublishing: 0 });
      maps.push(map);
      setPromises.push(new Promise((resolve) => {
        const handler = () => {
          map.removeListener('set', handler);
          resolve();
        };
        map.on('set', handler);
      }));
    }
    await Promise.all(maps.map((set) => set.readyPromise));
    await Promise.all(setPromises);
    const dump = maps[0].dump();
    for (let i = 1; i < maps.length; i += 1) {
      expect(maps[i].dump()).toEqual(dump);
    }
    await Promise.all(maps.map((map) => map.shutdown()));
  });
});

