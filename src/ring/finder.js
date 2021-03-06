/*
 * Copyright 2010 Tim Vandermeersch
 * Copyright 2015-2016 Benjamin Abel bbig26@gmail.com
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under the License
 * is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express
 * or implied.
 * See the License for the specific language governing permissions and limitations under the
 * License.
 */
'use strict';

const ModelAtom = require('../model/atom');
const ModelBond = require('../model/bond');
const utilsArray = require('../utils/array');

const RingRing = require('./ring');
const ringHanser = require('./hanser');
const ringSSSR = require('./sssr');

const ringFinder = function() {};
/**
 * The Hanser Ring Finder produces a ring as just a series of atoms. Here we
 * complete this information with the bonds and the ring center, creating a ring
 * object.
 *
 * @param {Array.<number>} atomIndexes
 * @param {modelMolecule}
 *            molecule
 * @return {RingRing}
 */
ringFinder.createRing = function(atomIndexes, molecule) {
  // Translate atom indexes to atom objects.
  /** @type {Array.<modelAtom>} */
  var atoms = [];
  for (let i = 0, li = atomIndexes.length; i < li; i++) {
    atoms.push(molecule.getAtom(atomIndexes[i]));
  }

  // Add the bonds for the ring.
  /** @type {Array.<modelBond>} */
  var bonds = [];
  for (let i = 0, il = atoms.length - 1; i < il; i++) {
    let bond = molecule.findBond(atoms[i], atoms[i + 1]);
    if (bond !== null) {
      bonds.push(bond);
    }
  }
  // Don't forget the bond between first & last atom.
  let bond = molecule.findBond(atoms[0], atoms[atoms.length - 1]);
  if (bond !== null) {
    bonds.push(bond);
  }
  // Create the ring.
  return new RingRing(atoms, bonds);
};

/**
 * Check if a candidate ring is already in the SSSR ring set.
 *
 * @param {Array.<RingRing>} C
 * @param {Array.<RingRing>} Csssr
 * @param {Array.<number>} valences
 * @param {Array.<number>} ringCount
 * @return {boolean}
 */
ringFinder.isCandidateInSet = function(C, Csssr, valences, ringCount) {
  for (let i = 0, li = Csssr.length; i < li; i++) {
    var sssr = Csssr[i];
    // the part from the paper
    if (C.length >= sssr.length) {
      var candidateContainsRing = true;
      for (let j = 0; j < sssr.length; j++) {
        if (!C.includes(sssr[j])) {
          candidateContainsRing = false;
        }
      }
      if (candidateContainsRing) {
        return true;
      }
    }
    // updated part
    for (let j = 0; j < C.length; j++) {
      if (sssr.includes(C[j])) {
        ringCount[j]++;
      }
    }
  }

  // If the candidate has at least one atom with a ringCount less than the
  // valence minus one, the candidate is a new ring. You can work this out
  // on paper for tetrahedron, cube, ...
  var isNewRing = false;
  for (let j = 0, lj = C.length; j < lj; j++) {
    if (ringCount[C[j]] < valences[C[j]] - 1) {
      isNewRing = true;
    }
  }

  if (isNewRing) {
    for (let j = 0, lj = C.length; j < lj; j++) {
      ringCount[C[j]]++;
    }
    return false;
  }
  return true;
};

/**
 * Verify if a ring set is the SSSR ring set.
 *
 * @param {Array.<number>} sssr
 * @param {number} nsssr
 * @param {modelMolecule}
 *            molecule
 * @return {Array.<RingRing>}
 */
ringFinder.verifySSSR = function(sssr, nsssr, molecule) {
  // The final SSSR set
  var Csssr = [];
  // store the valences for all atoms
  var valences = [];
  for (let i = 0, li = molecule.countAtoms(); i < li; i++) {
    valences.push(molecule.getAtom(i).countBonds());
  }

  const ringCount = utilsArray.zeros(molecule.countAtoms());
  for (let i = 0, li = sssr.length; i < li; i++) {
    var ring = sssr[i];
    if (!ringSSSR.isCandidateInSet(ring, Csssr, valences, ringCount)) {
      Csssr.push(ring);
      if (Csssr.length === nsssr) {
        return Csssr;
      }
    }
  }

  return Csssr;
};

/**
         * Make a copy of the molecule. This is needed since we modify the molecule
         * to increase ring perception performance.
         */
/*
         * function copyMolecule(molecule) { var moleculeCopy = new
         * modelMolecule(); for (let i = 0, li = molecule.countAtoms(); i <
         * li; i++) { var atomCopy = new modelAtom(); atomCopy.index = i;
         * moleculeCopy.addAtom(atomCopy) } for (let i = 0, li = molecule.countBonds();
         * i < li; i++) { var bond = molecule.getBond(i); var sourceIndex =
         * bond.source.index; var targetIndex = bond.target.index; var sourceCopy =
         * moleculeCopy.getAtom(sourceIndex); var targetCopy =
         * moleculeCopy.getAtom(targetIndex); var bondCopy = new
         * modelBond(sourceCopy, targetCopy); bondCopy.index = i;
         * moleculeCopy.addBond(bondCopy); } return moleculeCopy; }
         */

/**
         * Reduce the size of a molecule by progressively removing atoms with a
         * connectivity of 1. These terminal atoms can never be in a ring. The aim
         * of this function is to reduce the number of molecules considered during
         * ring perception to speed up the process.
         */
/*
         * function reduceMolecule(molecule) { var atomCount =
         * molecule.countAtoms(); var lastAtomCount = atomCount + 1; var start = 0;
         * while (lastAtomCount !== atomCount) { lastAtomCount = atomCount;
         *
         * for (let i = start; i < atomCount; i++) { var atom = molecule.getAtom(i);
         * if (atom.countBonds() < 2) { molecule.removeAtom(atom); atomCount--;
         * start = i; break; } } } }
         */

/**
 * Detect ring membership of atoms and set the isInCycle property. Ring
 * membership of atoms can be computed in O(n) time by creating a spanning tree.
 * For this, a breath-first iteration is performed on the atoms and the tree is
 * constructed. During construction visited atoms and bonds are stored in
 * arrays. If a bond isn't visited yet but the atom it connects to is, the bond
 * is a ring-closure. When a closure bond is found, a backtracking loop assigns
 * the isInCycle property for all atoms in the cycle. The end of the cycle is
 * where the atoms come back together. For even rings, there is always a single
 * last (depth) atom. For odd rings, the closure bond connects two atoms of the
 * same depth. This function is has an O(n) runtime.
 *
 * @param {modelMolecule} molecule -
 */
ringFinder.detectRingAtoms = function(molecule) {
  var n = molecule.countAtoms();
  if (!n) {
    return;
  }
  let visitedBonds = utilsArray.full(n, false);

  /** @type{Array.<modelAtom>} */
  var queue = [];

  var startAtom = molecule.atoms[0];
  startAtom.depth = 0;
  queue.push(startAtom);
  let visitedAtoms = [true];

  while (true) {
    if (!queue.length) {
      break;
    }
    var atom = queue[0];
    queue.shift();

    var bonds = Array.from(atom.bonds);
    for (let i = 0, li = bonds.length; i < li; i++) {
      var bond = bonds[i];
      var bondIndex = bond.index;
      // skip the path we're comming from
      // if (visitedBonds.includes(bondIndex)) {
      if (visitedBonds[bondIndex]) {
        continue;
      }
      visitedBonds[bondIndex] = true;

      var neighbor = bond.otherAtom(atom);
      var neighborIndex = neighbor.index;

      // if the bond is not visited yet but the neighbor is, the bond
      // is a ring closure or chord
      if (visitedAtoms[neighborIndex]) {
        let previous = [];
        let depth;
        if (atom.depth === neighbor.depth) {
          // odd sized ring
          previous.push(atom);
          previous.push(neighbor);
          depth = atom.depth;
        } else {
          // even sized ring
          neighbor.isInCycle = true;
          var nbrNeighbors = neighbor.getNeighbors();
          for (let j = 0, lj = nbrNeighbors.length; j < lj; j++) {
            var nbrNeighbor = nbrNeighbors[j];
            if (nbrNeighbor.depth === neighbor.depth - 1) {
              previous.push(nbrNeighbor);
            }
          }
          depth = atom.depth;
        }

        // backtrack ring and assign isInCylce to all cycle atoms
        while (true) {
          previous[0].isInCycle = true;
          previous[1].isInCycle = true;
          depth--;
          var prevNeighbors1 = previous[0].getNeighbors();
          for (let j = 0, lj = prevNeighbors1.length; j < lj; j++) {
            if (prevNeighbors1[j].depth === depth) {
              previous[0] = prevNeighbors1[j];
              break;
            }
          }
          var prevNeighbors2 = previous[1].getNeighbors();
          for (let j = 0, lj = prevNeighbors2.length; j < lj; j++) {
            if (prevNeighbors2[j].depth === depth) {
              previous[1] = prevNeighbors2[j];
              break;
            }
          }

          if (previous[0] === previous[1]) {
            previous[0].isInCycle = true;
            break;
          }
        }
      } else {
        neighbor.depth = atom.depth + 1;
        visitedAtoms[neighborIndex] = true;
        queue.push(neighbor);
      }
    }
  }
  /*
   * debug('before: ' + molecule.countAtoms()); var after = 0; for (let i = 0,
   * li = molecule.countAtoms(); i < li; i++) { if
   * (molecule.atoms[i].isInCycle) { after++; } } debug('after: ' + after);
   */
};

/**
 * Create ring systems. These are molecules containing only ring atoms. Each
 * disconnected ring system in the original molecule will result in a single
 * ring system molecule. Ring perception is done on each ring system
 * individually for optimal performance.
 *
 * @param {modelMolecule}
 *            molecule
 * @return {Array.<RingRing>}
 */
ringFinder.createRingSystems = function(molecule) {
  var rings = [];

  var n = molecule.countAtoms();
  var visitedAtoms = utilsArray.full(n, false);
  var visitedBonds = utilsArray.full(n, false);
  var indexMap = utilsArray.full(n, -1);  // molecule -> ringSystem

  for (let k = 0, lk = molecule.countAtoms(); k < lk; k++) {
    var startAtom = molecule.atoms[k];
    // skip visited atoms
    if (visitedAtoms[startAtom.index]) {
      continue;
    }
    // skip acyclic atoms
    if (!startAtom.isInCycle) {
      continue;
    }

    // create a new ring system
    var ringSystem = new molecule.constructor();

    var queue = [];

    queue.push(startAtom);
    visitedAtoms[0] = true;
    var newAtom = new ModelAtom();
    newAtom.index2 = startAtom.index;
    indexMap[startAtom.index] = 0;
    ringSystem.addAtom(newAtom);

    while (true) {
      if (!queue.length) {
        break;
      }

      var atom = queue[0];
      queue.shift();

      var bonds = Array.from(atom.bonds);
      for (let i = 0, li = bonds.length; i < li; i++) {
        let bond = bonds[i];
        let bondIndex = bond.index;
        // skip the path we're comming from
        if (visitedBonds[bondIndex]) {
          continue;
        }
        visitedBonds[bondIndex] = true;

        var neighbor = bond.otherAtom(atom);
        var neighborIndex = neighbor.index;

        if (!neighbor.isInCycle) {
          continue;
        }

        // if the bond is not visited yet but the neighbor is, the
        // bond
        // is a ring closure or chord
        if (visitedAtoms[neighborIndex]) {
          // create the ring closure bond
          let closureBond = molecule.findBond(atom, neighbor);
          let newBond = new ModelBond(
              ringSystem.atoms[indexMap[atom.index]], ringSystem.atoms[indexMap[neighbor.index]]);
          newBond.index2 = closureBond.index;
          ringSystem.addBond(newBond);
        } else {
          visitedAtoms[neighborIndex] = true;
          queue.push(neighbor);
          // create the new atom
          newAtom = new ModelAtom();
          newAtom.index2 = neighbor.index;
          indexMap[neighbor.index] = ringSystem.atoms.length;
          ringSystem.addAtom(newAtom);
          var newBond = new ModelBond(ringSystem.atoms[indexMap[atom.index]], newAtom);
          newBond.index2 = bond.index;
          ringSystem.addBond(newBond);
        }
      }
    }

    // assign indexes
    for (let i = 0, li = ringSystem.atoms.length; i < li; i++) {
      ringSystem.atoms[i].index = i;
    }
    for (let i = 0, li = ringSystem.bonds.length; i < li; i++) {
      ringSystem.bonds[i].index = i;
    }

    var nsssr = ringSystem.bonds.length - ringSystem.atoms.length + 1;

    var sssr;
    // Use Hanser ring finder to find all 3-6 membered rings.
    var hanser = ringHanser.findRings(ringSystem, 6);
    if (hanser.length >= nsssr) {
      // Use the Hanser rings to make the first SSSR
      sssr = ringFinder.verifySSSR(hanser, nsssr, ringSystem);
      // Check the size of the first SSSR
      if (sssr.length < nsssr) {
        // Hanser rings don't contain the SSSR, do a full SSSR
        // search
        sssr = ringSSSR.findRings(ringSystem);
      }
    } else {
      // Hanser rings don't contain the SSSR, do a full SSSR search
      // (there
      // are not enough candidates so we skip the candidateSearch.
      sssr = ringSSSR.findRings(ringSystem);
    }

    // translate the indexes from the reduced ringSystem back to
    // the original indexes
    for (let i = 0, li = sssr.length; i < li; i++) {
      var ring = sssr[i];
      for (let j = 0, lj = ring.length; j < lj; j++) {
        ring[j] = ringSystem.atoms[ring[j]].index2;
      }
    }

    for (let i = 0, il = sssr.length; i < il; i++) {
      rings.push(ringFinder.createRing(sssr[i], molecule));
    }
  }
  return rings;
};

/**
 * @param {modelMolecule}
 *            molecule
 * @return {Array.<RingRing>}
 */
ringFinder.findRings = function(molecule) {
  // If there are no rings, we're done
  var nsssr = molecule.countBonds() - molecule.countAtoms() + molecule.fragmentCount;
  if (!nsssr) {
    return [];
  }

  // assign indexes
  for (let i = 0, li = molecule.atoms.length; i < li; i++) {
    var atom = molecule.atoms[i];
    atom.index = i;
    atom.depth = undefined;
    atom.isInCycle = undefined;
    molecule.atoms[i].index = i;
  }
  for (let i = 0, li = molecule.bonds.length; i < li; i++) {
    molecule.bonds[i].index = i;
  }

  // detect ring atoms in O(n) time
  ringFinder.detectRingAtoms(molecule);
  // process the ring systems
  return ringFinder.createRingSystems(molecule);
};

module.exports = ringFinder;
