// @flow

const DaemonFactory = require('ipfsd-ctl');

const daemonFactory = DaemonFactory.create({ type: 'go' });

const getIpfsNode = module.exports.getIpfsNode = async (bootstrap:Array<string> = []) => {
  const [daemon, ipfs] = await new Promise((resolve, reject) => {
    const options = {
      disposable: true,
      args: ['--enable-pubsub-experiment'],
      config: {
        Bootstrap: bootstrap,
        Discovery: {
          MDNS: {
            Interval: 1,
            Enabled: true,
          },
        },
      },
    };
    daemonFactory.spawn(options, (error, ipfsd) => {
      if (error) {
        reject(error);
      } else {
        resolve([ipfsd, ipfsd.api]);
      }
    });
  });
  ipfs.stopNode = async () => {
    await new Promise((resolve, reject) => {
      daemon.stop((error) => {
        if (error) {
          console.log(error);
          reject(error);
        } else {
          resolve();
        }
      });
    });
  };
  return ipfs;
};

let nodes:Array<Object> = [];

module.exports.closeAllNodes = async () => {
  const n = nodes;
  nodes = [];
  await Promise.all(n.map((node) => node.stopNode()));
};

module.exports.getSwarm = async (count:number) => {
  if (nodes.length < count) {
    nodes = nodes.concat(await Promise.all(Array.from({ length: count - nodes.length }, getIpfsNode)));
  }
  if (count === 1) {
    return nodes;
  }
  for (const node of nodes) {
    const { addresses } = await node.id();
    nodes.filter((x) => x !== node).map((x) => x.swarm.connect(addresses[0]));
  }
  let connectedNodes = 0;
  while (connectedNodes < count) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    connectedNodes = 0;
    await Promise.all(nodes.map(async (node) => { // eslint-disable-line no-loop-func
      const peers = await node.swarm.peers();
      if (peers.length >= nodes.length - 1) {
        connectedNodes += 1;
      }
    }));
  }
  return nodes;
};

