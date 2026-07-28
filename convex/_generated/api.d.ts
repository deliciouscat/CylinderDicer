/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as adminMatches from "../adminMatches.js";
import type * as botRunner from "../botRunner.js";
import type * as bots_catalog from "../bots/catalog.js";
import type * as bots_decision from "../bots/decision.js";
import type * as bots_observation from "../bots/observation.js";
import type * as bots_scheduling from "../bots/scheduling.js";
import type * as bots_specs from "../bots/specs.js";
import type * as bots_strategies from "../bots/strategies.js";
import type * as bots_types from "../bots/types.js";
import type * as commands from "../commands.js";
import type * as customGames from "../customGames.js";
import type * as ladder from "../ladder.js";
import type * as ladderResults from "../ladderResults.js";
import type * as match_actions from "../match/actions.js";
import type * as match_capabilities from "../match/capabilities.js";
import type * as match_flow from "../match/flow.js";
import type * as match_reducer from "../match/reducer.js";
import type * as match_results from "../match/results.js";
import type * as match_rulesBidding from "../match/rulesBidding.js";
import type * as match_rulesCylinder from "../match/rulesCylinder.js";
import type * as match_rulesDice from "../match/rulesDice.js";
import type * as match_rulesDuel from "../match/rulesDuel.js";
import type * as match_snapshots from "../match/snapshots.js";
import type * as match_state from "../match/state.js";
import type * as match_turnMachine from "../match/turnMachine.js";
import type * as matchFlow from "../matchFlow.js";
import type * as matches from "../matches.js";
import type * as protocol_commandPayloads from "../protocol/commandPayloads.js";
import type * as protocol_commands from "../protocol/commands.js";
import type * as protocol_errors from "../protocol/errors.js";
import type * as protocol_snapshots from "../protocol/snapshots.js";
import type * as qa_adminAudit from "../qa/adminAudit.js";
import type * as qa_adminAuthorization from "../qa/adminAuthorization.js";
import type * as qa_guards from "../qa/guards.js";
import type * as snapshots from "../snapshots.js";
import type * as users from "../users.js";
import type * as virtualOpponents from "../virtualOpponents.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  adminMatches: typeof adminMatches;
  botRunner: typeof botRunner;
  "bots/catalog": typeof bots_catalog;
  "bots/decision": typeof bots_decision;
  "bots/observation": typeof bots_observation;
  "bots/scheduling": typeof bots_scheduling;
  "bots/specs": typeof bots_specs;
  "bots/strategies": typeof bots_strategies;
  "bots/types": typeof bots_types;
  commands: typeof commands;
  customGames: typeof customGames;
  ladder: typeof ladder;
  ladderResults: typeof ladderResults;
  "match/actions": typeof match_actions;
  "match/capabilities": typeof match_capabilities;
  "match/flow": typeof match_flow;
  "match/reducer": typeof match_reducer;
  "match/results": typeof match_results;
  "match/rulesBidding": typeof match_rulesBidding;
  "match/rulesCylinder": typeof match_rulesCylinder;
  "match/rulesDice": typeof match_rulesDice;
  "match/rulesDuel": typeof match_rulesDuel;
  "match/snapshots": typeof match_snapshots;
  "match/state": typeof match_state;
  "match/turnMachine": typeof match_turnMachine;
  matchFlow: typeof matchFlow;
  matches: typeof matches;
  "protocol/commandPayloads": typeof protocol_commandPayloads;
  "protocol/commands": typeof protocol_commands;
  "protocol/errors": typeof protocol_errors;
  "protocol/snapshots": typeof protocol_snapshots;
  "qa/adminAudit": typeof qa_adminAudit;
  "qa/adminAuthorization": typeof qa_adminAuthorization;
  "qa/guards": typeof qa_guards;
  snapshots: typeof snapshots;
  users: typeof users;
  virtualOpponents: typeof virtualOpponents;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
