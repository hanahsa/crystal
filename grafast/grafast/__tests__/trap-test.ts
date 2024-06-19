/* eslint-disable graphile-export/exhaustive-deps, graphile-export/export-methods, graphile-export/export-instances, graphile-export/export-subclasses, graphile-export/no-nested */
import { expect } from "chai";
import type { ExecutionResult } from "graphql";
import { it } from "mocha";
import sqlite3 from "sqlite3";

import {ExecutionDetails, GrafastResultsList, TRAP_ERROR_OR_INHIBITED} from "../dist/index.js";
import {
  access,
  assertNotNull,
  context,
  ExecutableStep,
  grafast,
  lambda,
  list,
  makeGrafastSchema,
  sideEffect,
  trap,
  TRAP_ERROR} from "../dist/index.js";

const makeSchema = () => {
  return makeGrafastSchema({
    typeDefs: /* GraphQL */ `
      type Error {
        message: String
      }
      type Query {
        unhandledError(setNullToError: Int): Int
        errorToNull(setNullToError: Int): Int
        errorToEmptyList(setNullToError: Int): [Int]
        errorToError(setNullToError: Int): Error
        mySideEffect: Int
      }
    `,
    plans: {
      Query: {
        unhandledError(_, { $setNullToError }) {
          const $a = assertNotNull($setNullToError, "Null!");
          return $a;
        },
        errorToNull(_, { $setNullToError }) {
          const $a = assertNotNull($setNullToError, "Null!");
          return trap($a, TRAP_ERROR, { valueForError: "NULL" });
        },
        errorToEmptyList(_, { $setNullToError }) {
          const $a = assertNotNull($setNullToError, "Null!");
          const $list = list([$a]);
          return trap($list, TRAP_ERROR, { valueForError: "EMPTY_LIST" });
        },
        errorToError(_, { $setNullToError }) {
          const $a = assertNotNull($setNullToError, "Null!");
          const $derived = lambda($a, () => null, true);
          return trap($derived, TRAP_ERROR, { valueForError: "PASS_THROUGH" });
        },
        mySideEffect() {
          const $sideEffect = sideEffect(null, () => {
            throw new Error("Test");
          })
          const $trap = trap($sideEffect, TRAP_ERROR_OR_INHIBITED, { valueForError: "PASS_THROUGH" });
          return lambda($trap, () => {
            return 1;
          });
        }
      },
    },
    enableDeferStream: false,
  });
};

it("schema works as expected", async () => {
  const schema = makeSchema();
  const source = /* GraphQL */ `
    query Q {
      nonError: unhandledError(setNullToError: 2)
      error: unhandledError(setNullToError: null)
    }
  `;
  const variableValues = {};
  const result = (await grafast({
    schema,
    source,
    variableValues,
    contextValue: {},
    resolvedPreset: {},
    requestContext: {},
  })) as ExecutionResult;
  expect(result.errors).to.exist;
  expect(result.errors).to.have.length(1);
  expect(result.errors![0].path).to.deep.equal(["error"]);
  expect(result.errors![0].message).to.equal("Null!");
  expect(result.data).to.deep.equal({ nonError: 2, error: null });
});
it("enables trapping an error to null", async () => {
  const schema = makeSchema();
  const source = /* GraphQL */ `
    query Q {
      nonError: errorToNull(setNullToError: 2)
      error: errorToNull(setNullToError: null)
    }
  `;
  const variableValues = {};
  const result = (await grafast({
    schema,
    source,
    variableValues,
    contextValue: {},
    resolvedPreset: {},
    requestContext: {},
  })) as ExecutionResult;
  expect(result.errors).to.not.exist;
  expect(result.data).to.deep.equal({ nonError: 2, error: null });
});
it("enables trapping an error to emptyList", async () => {
  const schema = makeSchema();
  const source = /* GraphQL */ `
    query Q {
      nonError: errorToEmptyList(setNullToError: 2)
      error: errorToEmptyList(setNullToError: null)
    }
  `;
  const variableValues = {};
  const result = (await grafast({
    schema,
    source,
    variableValues,
    contextValue: {},
    resolvedPreset: {},
    requestContext: {},
  })) as ExecutionResult;
  expect(result.errors).to.not.exist;
  expect(result.data).to.deep.equal({ nonError: [2], error: [] });
});
it("enables trapping an error to error", async () => {
  const schema = makeSchema();
  const source = /* GraphQL */ `
    query Q {
      nonError: errorToError(setNullToError: 2) {
        message
      }
      error: errorToError(setNullToError: null) {
        message
      }
    }
  `;
  const variableValues = {};
  const result = (await grafast({
    schema,
    source,
    variableValues,
    contextValue: {},
    resolvedPreset: {},
    requestContext: {},
  })) as ExecutionResult;
  expect(result.errors).to.not.exist;
  expect(result.data).to.deep.equal({
    nonError: null,
    error: { message: "Null!" },
  });
});

it("traps errors thrown in side effects in the chain", async () => {
  const schema = makeSchema();

  const source =  /* GraphQL */`
    query withSideEffects { 
      mySideEffect 
    }
  `
  const result = await grafast({ source, schema });
  expect(result).to.deep.equal({ data: { mySideEffect: 1 } });
})
