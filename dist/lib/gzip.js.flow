// @flow

const zlib = require('zlib');

module.exports.gzip = (s:string):Promise<Buffer> => new Promise((resolve, reject) => {
  zlib.gzip(Buffer.from(s, 'utf-8'), (error, result) => {
    if (error) {
      reject(error);
    } else {
      resolve(result);
    }
  });
});

module.exports.gunzip = (buffer:Buffer):Promise<string> => new Promise((resolve, reject) => {
  zlib.gunzip(buffer, (error, result) => {
    if (error) {
      reject(error);
    } else {
      resolve(result.toString('utf-8'));
    }
  });
});
