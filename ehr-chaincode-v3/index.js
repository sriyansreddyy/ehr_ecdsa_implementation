'use strict';

const { PatientContract }   = require('./lib/patientContract');
const { VisitContract }     = require('./lib/visitContract');
const { ForwardContract }   = require('./lib/forwardContract');
const { ClinicalContract }  = require('./lib/clinicalContract');
const { LabContract }       = require('./lib/labContract');
const { ClaimsContract }    = require('./lib/claimsContract');
const { EhrContract }       = require('./lib/ehrContract');
const { AccessContract }    = require('./lib/accessContract');

module.exports.PatientContract   = PatientContract;
module.exports.VisitContract     = VisitContract;
module.exports.ForwardContract   = ForwardContract;
module.exports.ClinicalContract  = ClinicalContract;
module.exports.LabContract       = LabContract;
module.exports.ClaimsContract    = ClaimsContract;
module.exports.EhrContract       = EhrContract;
module.exports.AccessContract    = AccessContract;

module.exports.contracts = [
  PatientContract,
  VisitContract,
  ForwardContract,
  ClinicalContract,
  LabContract,
  ClaimsContract,
  EhrContract,
  AccessContract,
];
