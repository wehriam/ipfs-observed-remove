//      

const zlib = require('zlib');

module.exports.gzip = (s       )                 => new Promise((resolve, reject) => {
  zlib.gzip(Buffer.from(s, 'utf-8'), (error, result) => {
    if (error) {
      reject(error);
    } else {
      resolve(result);
    }
  });
});

module.exports.gunzip = (buffer       )                 => new Promise((resolve, reject) => {
  zlib.gunzip(buffer, (error, result) => {
    if (error) {
      reject(error);
    } else {
      resolve(result.toString('utf-8'));
    }
  });
});
