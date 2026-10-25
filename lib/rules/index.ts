// lib/rules public API: ask once, remember forever (ticket 11, SKELETON §9).
export { answerQuestion, askHuman, confidence, reasonFor, route, ROUTES,
  type AnswerInput, type AskInput, type AskOutcome, type QuestionAnsweredResult, type QuestionAskedResult } from "./questions";
export { applyRule, matchRule, ruleSource, type RuleAppliedResult, type RuleMatch } from "./rules";
export { employerLink, employerQuestion, STAFF_SHARE_RED_FLAG, type EmployerLink, type TenureFact } from "./employer";
export { currentRules, MemoryRuleStore, nextQuestionId, nextRuleId, type RuleStore } from "./store";
