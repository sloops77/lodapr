/**
 * @template {object} T
 * @typedef {{[id: string]: {[assignTo: string]: T}}} NewResultSet
 */

/**
 * @typedef { {[assignTo: string]: any} } ResultSetValue
 * @typedef { {[id: string]: ResultSetValue} } ResultSet
 * @typedef { {values: any[], errors: Error[]} } FinalResult
 * @typedef { {values: any[], errors: Error[]} } FinalArrayResult
 * @typedef { {values: {[id: string]: any}, errors: Error[]} } FinalObjectResult
 */
const curry = require("lodash.curry");

/**
 * @param { ResultSet } resultSet
 * @returns { (key: string) => boolean }
 */
function initIsError(resultSet) {
  return function isError(key) {
    return resultSet[key].error != null;
  };
}

/**
 * @typedef { (value: ResultSetValue, id: string) => any } FinalResultExtractor
 * @typedef {(resultSet: ResultSet) => Promise<ResultSet>|ResultSet} ResultSetMapper
 * @typedef {(resultSet: ResultSet) => Promise<FinalResult>} ResultSetFlowRunner
 * @typedef {(extractor: FinalResultExtractor) => ResultSetFlowRunner} LodaprExtractPartialFn
 */

const lodapr =
  /** @type { (...mappers: ResultSetMapper[]) => LodaprExtractPartialFn } */
  (...mappers) =>
    /** @type { LodaprExtractPartialFn } */
    extractor =>
      /** @type {ResultSetFlowRunner} */
      async initialResultSet => {
        let resultSet = initialResultSet;
        for (const mapper of mappers) {
          // eslint-disable-next-line no-await-in-loop
          resultSet = await mapper(resultSet);
        }
        return extractFinalResult(extractor, resultSet);
      };

/**
 * @template {object} T
 * @param {string} key
 * @param {string} assignTo
 * @param {T[]} array
 * @returns {NewResultSet<T>}
 */
function createResultSet(key, assignTo, array) {
  /** @type {NewResultSet<T>} */
  const acc = {};
  for (const entry of array) {
    const newKey = entry[key];
    if (newKey != null) {
      acc[newKey] = { [assignTo]: entry };
    }
  }
  return acc;
}

/**
 * @template {object} T
 * @param {(item: T) => [any, object]} iteratee
 * @param {T[]} array
 * @returns {NewResultSet<T>}
 */
function fromArray(iteratee, array) {
  /** @type {NewResultSet<T>} */
  const acc = {};
  for (const entry of array) {
    const [key, value] = iteratee(entry);
    if (key != null) {
      acc[key] = value;
    }
  }
  return acc;
}

/**
 * @template {Function} F
 * @param {{[assignTo: string]: F}} iterateeSpec
 * @returns {[string, F]}
 */
function parseIterateeSpec(iterateeSpec) {
  const assignTo = Object.keys(iterateeSpec)[0];
  const iteratee = iterateeSpec[assignTo];
  return [assignTo, iteratee];
}

/**
 * @param {{[assignTo: string]: (value: ResultSetValue, id: string) => Promise<any>}} iterateeSpec
 * @param {ResultSet} resultSet
 * @returns {ResultSet}
 */
function extendSync(iterateeSpec, resultSet) {
  const [assignTo, iteratee] = parseIterateeSpec(iterateeSpec);
  return mapSync(iteratee, assignTo, resultSet);
}

/**
 * @param {{[assignTo: string]: (value: ResultSetValue, id: string) => any}} iterateeSpec
 * @param {ResultSet} resultSet
 * @returns {Promise<ResultSet>}
 */
function extendAsyncParallel(iterateeSpec, resultSet) {
  const [assignTo, iteratee] = parseIterateeSpec(iterateeSpec);
  return mapParallelAsync(iteratee, assignTo, resultSet);
}

/**
 * @param {{[assignTo: string]: (value: ResultSetValue, id: string) => any}} iterateeSpec
 * @param {ResultSet} resultSet
 * @returns {Promise<ResultSet>}
 */
function extendAsyncSerial(iterateeSpec, resultSet) {
  const [assignTo, iteratee] = parseIterateeSpec(iterateeSpec);
  return mapSerialAsync(iteratee, assignTo, resultSet);
}

/**
 * @param {(value: ResultSetValue, id: string) => any} iteratee
 * @param {string} assignTo
 * @param {ResultSet} resultSet
 * @returns {ResultSet}
 */
function mapSync(iteratee, assignTo, resultSet) {
  const isError = initIsError(resultSet);
  for (const key in resultSet) {
    if (isError(key)) {
      continue;
    }
    try {
      const result = iteratee(resultSet[key], key);
      // eslint-disable-next-line no-param-reassign
      resultSet[key][assignTo] = result;
    } catch (error) {
      // eslint-disable-next-line no-param-reassign
      resultSet[key].error = error;
    }
  }
  return resultSet;
}

/**
 * @param {(value: ResultSetValue, id: string) => Promise<any>} iteratee
 * @param {string} assignTo
 * @param {ResultSet} resultSet
 * @returns {Promise<ResultSet>}
 */
async function mapParallelAsync(iteratee, assignTo, resultSet) {
  const isError = initIsError(resultSet);

  const resultPs = [];
  for (const key in resultSet) {
    if (!Object.prototype.hasOwnProperty.call(resultSet, key) || isError(key)) {
      continue;
    }
    resultPs.push(doAsyncIteratee(iteratee, assignTo, resultSet, key));
  }

  await Promise.all(resultPs);

  return resultSet;
}

/**
 * @param {(value: ResultSetValue, id: string) => Promise<any>} iteratee
 * @param {string} assignTo
 * @param {ResultSet} resultSet
 * @returns {Promise<ResultSet>}
 */
async function mapSerialAsync(iteratee, assignTo, resultSet) {
  const isError = initIsError(resultSet);

  for (const key in resultSet) {
    if (!Object.prototype.hasOwnProperty.call(resultSet, key) || isError(key)) {
      continue;
    }
    // eslint-disable-next-line no-await-in-loop
    await doAsyncIteratee(iteratee, assignTo, resultSet, key);
  }

  return resultSet;
}

/**
 * @param {(acc: any[], value: ResultSetValue, id: string) => Promise<any>} iteratee
 * @param {string} assignTo
 * @param {ResultSet} resultSet
 * @returns {Promise<ResultSet>}
 */
async function aggregateSerialAsync(iteratee, assignTo, resultSet) {
  const isError = initIsError(resultSet);
  const acc = [];

  for (const key in resultSet) {
    if (!Object.prototype.hasOwnProperty.call(resultSet, key) || isError(key)) {
      continue;
    }
    // eslint-disable-next-line no-await-in-loop
    /** @type {any} */
    const result = await doAsyncAggregate(iteratee, assignTo, acc, resultSet, key);
    if (!isError(key)) {
      acc.push(result);
    }
  }

  return resultSet;
}

// /**
//  * @param { FinalResultExtractor } iteratee
//  * @param { ResultSet } resultSet
//  * @returns { FinalResult }
//  */
// function extractObject(iteratee, resultSet) {
//   /** @type {FinalResult} */
//   const acc = { values: {}, errors: [] };
//   for (const key in resultSet) {
//     if (!Object.prototype.hasOwnProperty.call(resultSet, key)) {
//       continue;
//     }
//     const resultValue = resultSet[key];
//     if (resultValue.error != null) {
//       acc.errors.push(resultValue.error);
//     } else {
//       const [k, v] = iteratee(resultValue, key);
//       acc.values[k] = v;
//     }
//   }
//   return acc;
// }
//
// const extractArray = extractFinalResult;

/**
 * @param { FinalResultExtractor } iteratee
 * @param { ResultSet } resultSet
 * @returns { FinalResult }
 */
function extractFinalResult(iteratee, resultSet) {
  /** @type {FinalResult} */
  const acc = { values: [], errors: [] };
  for (const key in resultSet) {
    if (!Object.prototype.hasOwnProperty.call(resultSet, key)) {
      continue;
    }
    const resultValue = resultSet[key];
    if (resultValue.error != null) {
      acc.errors.push(resultValue.error);
    } else {
      acc.values.push(iteratee(resultValue, key));
    }
  }
  return acc;
}

/**
 * @param {(value: ResultSetValue, id: string) => Promise<any>} iteratee
 * @param {string} assignTo
 * @param {ResultSet} resultSet
 * @param {string} key
 * @returns {Promise<any>}
 */
function doAsyncIteratee(iteratee, assignTo, resultSet, key) {
  const resultP = iteratee(resultSet[key], key);
  if (!resultP) {
    return Promise.reject(
      new Error(`Iteratee returned undefined instead of a promise. Maybe return Promise.resolve() instead.`)
    );
  }

  return resultP
    .then(result => {
      // eslint-disable-next-line no-param-reassign
      resultSet[key][assignTo] = result;
      return result;
    })
    .catch(error => {
      // eslint-disable-next-line no-param-reassign
      resultSet[key].error = error;
      return error;
    });
}

/**
 * @param {(acc: any[], value: ResultSetValue, id: string) => Promise<any>} agregatee
 * @param {string} assignTo
 * @param {any[]} acc
 * @param {ResultSet} resultSet
 * @param {string} key
 * @returns {Promise<any>}
 */
function doAsyncAggregate(agregatee, assignTo, acc, resultSet, key) {
  const resultP = agregatee(acc, resultSet[key], key);
  if (!resultP) {
    return Promise.reject(
      new Error(`Iteratee returned undefined instead of a promise. Maybe return Promise.resolve() instead.`)
    );
  }

  return resultP
    .then(result => {
      // eslint-disable-next-line no-param-reassign
      resultSet[key][assignTo] = result;
      return result;
    })
    .catch(error => {
      // eslint-disable-next-line no-param-reassign
      resultSet[key].error = error;
      return error;
    });
}

module.exports = {
  createResultSet: curry(createResultSet),
  mapSync: curry(mapSync),
  mapParallelAsync: curry(mapParallelAsync),
  mapSerialAsync: curry(mapSerialAsync),
  aggregateSerialAsync: curry(aggregateSerialAsync),
  extractFinalResult: curry(extractFinalResult),
  extendSync: curry(extendSync),
  extendAsyncParallel: curry(extendAsyncParallel),
  extendAsyncSerial: curry(extendAsyncSerial),
  fromArray,
  lodapr
};
