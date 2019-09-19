const _ = require("lodash/fp");
const uuidv1 = require("uuid/v1");

const {
  createResultSet,
  mapSync,
  mapSerialAsync,
  mapParallelAsync,
  aggregateSerialAsync,
  extractFinalResult,
  lodapr,
  fromArray
} = require("../src");

describe("resultsets", () => {
  it("can create resultsets", () => {
    expect(createResultSet("accountId", "reward", [])).toEqual({});
    expect(createResultSet("accountId", "reward")([{ "not right": 1 }])).toEqual({});
    expect(createResultSet("accountId", "reward", [{ accountId: "a", amount: 100 }])).toEqual({
      a: { reward: { accountId: "a", amount: 100 } }
    });
    expect(
      createResultSet("accountId", "reward", [
        { accountId: "a", amount: 100 },
        { accountId: "b", amount: 99 },
        { accountId: "c", amount: 100 }
      ])
    ).toEqual({
      a: { reward: { accountId: "a", amount: 100 } },
      b: { reward: { accountId: "b", amount: 99 } },
      c: { reward: { accountId: "c", amount: 100 } }
    });
  });

  it("can create resultsets using fromArray", () => {
    const iteratee = reward => [reward.accountId, { reward }];
    expect(fromArray(iteratee, [])).toEqual({});
    expect(fromArray(iteratee, [{ "not right": 1 }])).toEqual({});
    expect(fromArray(iteratee, [{ accountId: "a", amount: 100 }])).toEqual({
      a: { reward: { accountId: "a", amount: 100 } }
    });
    expect(
      fromArray(iteratee, [
        { accountId: "a", amount: 100 },
        { accountId: "b", amount: 99 },
        { accountId: "c", amount: 100 }
      ])
    ).toEqual({
      a: { reward: { accountId: "a", amount: 100 } },
      b: { reward: { accountId: "b", amount: 99 } },
      c: { reward: { accountId: "c", amount: 100 } }
    });
  });

  it("can map resultsets", () => {
    const resultSet = {
      a: { reward: { accountId: "a", amount: 100 } },
      b: { reward: { accountId: "b", amount: 99 } },
      c: { reward: { accountId: "c", amount: 100 } }
    };

    const mapper = mapSync(({ reward: { amount } }) => `${amount.toString()}.00`, "amountStr");
    expect(mapper(resultSet)).toEqual({
      a: { reward: { accountId: "a", amount: 100 }, amountStr: "100.00" },
      b: { reward: { accountId: "b", amount: 99 }, amountStr: "99.00" },
      c: { reward: { accountId: "c", amount: 100 }, amountStr: "100.00" }
    });
  });

  it("can map resultsets and will skip errors", () => {
    const resultSet = {
      a: { reward: { accountId: "a", amount: 100 } },
      b: { reward: { accountId: "b", amount: 99, error: "doesnt matter" } },
      c: { reward: { accountId: "c", amount: 100 }, error: new Error() }
    };

    expect(mapSync(({ reward: { amount } }) => `${amount.toString()}.00`, "amountStr", resultSet)).toEqual({
      a: { reward: { accountId: "a", amount: 100 }, amountStr: "100.00" },
      b: { reward: { accountId: "b", amount: 99, error: "doesnt matter" }, amountStr: "99.00" },
      c: { reward: { accountId: "c", amount: 100 }, error: resultSet.c.error }
    });
  });

  it("can map resultsets in parallel", async () => {
    const resultSet = {
      a: { reward: { accountId: "a", amount: 100 } },
      b: { reward: { accountId: "b", amount: 99 } },
      c: { reward: { accountId: "c", amount: 100 }, error: new Error() }
    };

    const start = Date.now();
    await expect(
      mapParallelAsync(({ reward: { amount } }) => Promise.resolve(`${amount.toString()}.00`), "amountStr", resultSet)
    ).resolves.toEqual({
      a: { reward: { accountId: "a", amount: 100 }, amountStr: "100.00" },
      b: { reward: { accountId: "b", amount: 99 }, amountStr: "99.00" },
      c: { reward: { accountId: "c", amount: 100 }, error: resultSet.c.error }
    });
    console.log(`Took ${Date.now() - start}ms`);
  });

  it("can map resultsets with 1000s of entries in parallel", async () => {
    const resultSet = _.fromPairs(
      _.map(() => {
        const key = uuidv1();
        return [key, { reward: { accountId: key, amount: 100 } }];
      }, new Array(10000))
    );

    let previous = null;
    const previousAccountInProgressVals = [];
    const start = Date.now();
    const result = await mapParallelAsync(
      ({ reward: { amount } }, accountId) => {
        if (previous) {
          previousAccountInProgressVals.push(resultSet[previous].amountStr);
        }
        previous = accountId;
        return Promise.resolve(`${amount.toString()}.00`);
      },
      "amountStr",
      resultSet
    );
    console.log(`Took ${Date.now() - start}ms`);

    expect(_.map("amountStr", result)).toEqual(new Array(10000).fill("100.00"));
    expect(previousAccountInProgressVals).not.toEqual(new Array(9999).fill("100.00"));
  });

  it("can map resultsets serially", async () => {
    const start = Date.now();
    const resultSet = {
      a: { reward: { accountId: "a", amount: 100 } },
      b: { reward: { accountId: "b", amount: 99 } },
      c: { reward: { accountId: "c", amount: 100 }, error: new Error() }
    };

    await expect(
      mapSerialAsync(({ reward: { amount } }) => Promise.resolve(`${amount.toString()}.00`), "amountStr", resultSet)
    ).resolves.toEqual({
      a: { reward: { accountId: "a", amount: 100 }, amountStr: "100.00" },
      b: { reward: { accountId: "b", amount: 99 }, amountStr: "99.00" },
      c: { reward: { accountId: "c", amount: 100 }, error: resultSet.c.error }
    });
    console.log(`Took ${Date.now() - start}ms`);
  });

  it("can aggregate resultsets serially", async () => {
    const start = Date.now();
    const resultSet = {
      a: { reward: { accountId: "a", amount: 100 } },
      b: { reward: { accountId: "b", amount: 99 } },
      c: { reward: { accountId: "c", amount: 100 }, error: new Error() },
      d: { reward: { accountId: "b", amount: 98 } }
    };

    await expect(
      aggregateSerialAsync(
        (acc, { reward: { amount } }) => Promise.resolve(`${(parseFloat(_.last(acc) || "0") + amount).toString()}.00`),
        "amountStr",
        resultSet
      )
    ).resolves.toEqual({
      a: { reward: { accountId: "a", amount: 100 }, amountStr: "100.00" },
      b: { reward: { accountId: "b", amount: 99 }, amountStr: "199.00" },
      c: { reward: { accountId: "c", amount: 100 }, error: resultSet.c.error },
      d: { reward: { accountId: "b", amount: 98 }, amountStr: "297.00" }
    });
    console.log(`Took ${Date.now() - start}ms`);
  });

  it("can aggregate resultsets containing arrays serially", async () => {
    const start = Date.now();
    const resultSet = {
      a: { reward: { accountId: "a", amount: 100 } },
      b: { reward: { accountId: "b", amount: 99 } },
      c: { reward: { accountId: "c", amount: 100 }, error: new Error() },
      d: { reward: { accountId: "b", amount: 98 } }
    };

    await expect(
      aggregateSerialAsync(
        (acc, { reward: { amount } }) => Promise.resolve(acc.concat([`${amount.toString()}.00`])),
        "accumulatedAmounts",
        resultSet
      )
    ).resolves.toEqual({
      a: { reward: { accountId: "a", amount: 100 }, accumulatedAmounts: ["100.00"] },
      b: { reward: { accountId: "b", amount: 99 }, accumulatedAmounts: ["100.00", "99.00"] },
      c: { reward: { accountId: "c", amount: 100 }, error: resultSet.c.error },
      d: { reward: { accountId: "b", amount: 98 }, accumulatedAmounts: ["100.00", "100.00", "99.00", "98.00"] }
    });
    console.log(`Took ${Date.now() - start}ms`);
  });

  it("can map resultsets with 1000s of entries serially", async () => {
    const resultSet = _.fromPairs(
      _.map(() => {
        const key = uuidv1();
        return [key, { reward: { accountId: key, amount: 100 } }];
      }, new Array(10000))
    );

    let previous = null;
    const previousAccountInProgressVals = [];
    const start = Date.now();
    const result = await mapSerialAsync(
      ({ reward: { amount } }, accountId) => {
        if (previous) {
          previousAccountInProgressVals.push(resultSet[previous].amountStr);
        }
        previous = accountId;
        return Promise.resolve(`${amount.toString()}.00`);
      },
      "amountStr",
      resultSet
    );
    console.log(`Took ${Date.now() - start}ms`);

    expect(_.map("amountStr", result)).toEqual(new Array(10000).fill("100.00"));
    expect(previousAccountInProgressVals).toEqual(new Array(9999).fill("100.00"));
  });

  it("can extract results", () => {
    const resultSet = {
      a: { reward: { accountId: "a", amount: 100 }, amountStr: "100.00" },
      b: { reward: { accountId: "b", amount: 99 }, amountStr: "99.00" },
      c: { reward: { accountId: "c", amount: 100 }, error: new Error("boom") }
    };

    expect(extractFinalResult(val => val.amountStr, resultSet)).toEqual({
      values: ["100.00", "99.00"],
      errors: [resultSet.c.error]
    });
  });

  it("can do a full lodapr flow", async () => {
    const initial = createResultSet("accountId", "reward", [
      { accountId: "a", amount: 100 },
      { accountId: "b", amount: 99 },
      { accountId: "c", amount: 100 }
    ]);

    const results = await lodapr(
      mapSync(({ reward: { amount } }) => `${amount.toString()}.00`, "amountStr"),
      mapParallelAsync(({ amountStr }) => Promise.resolve(parseFloat(amountStr) + 0.1), "added10")
    )(val => val.added10.toFixed(2))(initial);

    expect(results).toEqual({ values: ["100.10", "99.10", "100.10"], errors: [] });
  });
});
