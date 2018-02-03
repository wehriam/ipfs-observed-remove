//      

                                                                                      
                                            

const getIpfsClass = require('./mixin');
const ObservedRemoveSet                                 = require('observed-remove').ObservedRemoveSet;

const IpfsObservedRemoveSet                                                 = getIpfsClass(ObservedRemoveSet);

module.exports = IpfsObservedRemoveSet;

