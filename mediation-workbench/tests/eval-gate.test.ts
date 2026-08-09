import test from 'node:test'
import assert from 'node:assert/strict'
import { EVAL_LOW_SCORE_THRESHOLD, EVAL_FLAG_HALLUCINATION } from '../server/utils/case-audit'

// Eval Gate 判定逻辑（与 value-skills 中 needsReview 保持一致）
function needsReview(evalResult: { normalized: number; hallucinationCount: number } | null): boolean {
  return !!evalResult
    && (evalResult.normalized < EVAL_LOW_SCORE_THRESHOLD || (EVAL_FLAG_HALLUCINATION && evalResult.hallucinationCount > 0))
}

test('eval gate: low score triggers review', () => {
  assert.equal(needsReview({ normalized: 0.4, hallucinationCount: 0 }), true)
  assert.equal(needsReview({ normalized: 0.49, hallucinationCount: 0 }), true)
})

test('eval gate: hallucinations trigger review even at high score', () => {
  assert.equal(needsReview({ normalized: 0.9, hallucinationCount: 2 }), true)
})

test('eval gate: good output passes', () => {
  assert.equal(needsReview({ normalized: 0.5, hallucinationCount: 0 }), false)
  assert.equal(needsReview({ normalized: 0.8, hallucinationCount: 0 }), false)
  assert.equal(needsReview(null), false)
})

test('eval gate: threshold constant is 0.5', () => {
  assert.equal(EVAL_LOW_SCORE_THRESHOLD, 0.5)
  assert.equal(EVAL_FLAG_HALLUCINATION, true)
})
