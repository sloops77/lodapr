/**
 * @template {object} T
 * @typedef {{[id: string]: {[assignTo: string]: T}}} NewResultSet
 */

/**
 * @typedef { {[assignTo: string]: any} } ResultSetValue
 * @typedef { {[id: string]: ResultSetValue} } ResultSet
 * @typedef { {values: any[], errors: Error[]} } FinalResult
 */
const curry = require("lodash/curry");

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
    await doAsyncIteratee(iteratee, assignTo, resultSet, key);
  }

  return resultSet;
}

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
  return iteratee(resultSet[key], key)
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
  extractFinalResult: curry(extractFinalResult),
  lodapr
};
