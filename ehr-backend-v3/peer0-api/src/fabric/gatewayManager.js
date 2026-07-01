'use strict';

const mockFabric = require('../../../shared/mockFabric');

function init() {
  mockFabric.init();
}

function getContract() {
  return mockFabric.getContract();
}

function getNetwork() {
  return mockFabric.getNetwork();
}

function reconnect() {
  return mockFabric.reconnect();
}

function close() {
  return mockFabric.close();
}

module.exports = { init, getContract, getNetwork, reconnect, close };
