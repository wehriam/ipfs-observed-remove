// @flow

import * as matchers from 'jest-extended';
import { v4 as uuidv4 } from 'uuid';
import stringify from 'json-stringify-deterministic';
import { getSwarm, closeAllNodes } from './lib/ipfs';
import { IpfsObservedRemoveSet } from '../src';
import { generateValue } from './lib/values';

expect.extend(matchers);

jest.setTimeout(30000);

const COUNT = 10;
let nodes = [];

describe('Set Scale', () => {
  beforeAll(async () => {
    nodes = await getSwarm(COUNT);
  });

  afterAll(async () => {
    await closeAllNodes();
  });

  test(`Synchronizes ${COUNT} sets`, async () => {
    const topic = uuidv4();
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
      const set = new IpfsObservedRemoveSet(node, topic, undefined, { bufferPublishing: 0 });
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
    await Promise.all(sets.map((set) => set.shutdown()));
  });

  test(`Synchronizes ${COUNT} sets automatically`, async () => {
    const topic = uuidv4();
    const sets = [new IpfsObservedRemoveSet(nodes[0], topic, [generateValue()], { bufferPublishing: 0 })];
    await sets[0].readyPromise;
    const addPromises = [];
    for (let i = 1; i < nodes.length; i += 1) {
      const set = new IpfsObservedRemoveSet(nodes[i], topic);
      sets.push(set);
      addPromises.push(new Promise((resolve) => {
        const handler = () => {
          set.removeListener('add', handler);
          resolve();
        };
        set.on('add', handler);
      }));
    }
    await Promise.all(sets.map((set) => set.readyPromise));
    await Promise.all(addPromises);
    const dump = sets[0].dump();
    for (let i = 1; i < sets.length; i += 1) {
      expect(sets[i].dump()).toEqual(dump);
    }
    await Promise.all(sets.map((set) => set.shutdown()));
  });

  test(`Synchronizes ${COUNT} sets (chunked)`, async () => {
    const topic = uuidv4();
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
      const set = new IpfsObservedRemoveSet(node, topic, undefined, { bufferPublishing: 0, chunkPubSub: true });
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
    await Promise.all(sets.map((set) => set.shutdown()));
  });

  test(`Synchronizes ${COUNT} sets automatically (chunked)`, async () => {
    const topic = uuidv4();
    const sets = [new IpfsObservedRemoveSet(nodes[0], topic, [generateValue()], { bufferPublishing: 0, chunkPubSub: true })];
    await sets[0].readyPromise;
    const addPromises = [];
    for (let i = 1; i < nodes.length; i += 1) {
      const set = new IpfsObservedRemoveSet(nodes[i], topic);
      sets.push(set);
      addPromises.push(new Promise((resolve) => {
        const handler = () => {
          set.removeListener('add', handler);
          resolve();
        };
        set.on('add', handler);
      }));
    }
    await Promise.all(sets.map((set) => set.readyPromise));
    await Promise.all(addPromises);
    const dump = sets[0].dump();
    for (let i = 1; i < sets.length; i += 1) {
      expect(sets[i].dump()).toEqual(dump);
    }
    await Promise.all(sets.map((set) => set.shutdown()));
  });
});
