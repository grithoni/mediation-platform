# GenericAgent Mediation Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract a GenericAgent-style execution core into the mediation platform and wire it to mediation-specific tools and MCP-backed case analysis.

**Architecture:** Create a reusable `ga-core` layer inside the workbench that mirrors GenericAgent's loop/schema/dispatch contracts, then mount a mediation-focused toolset and orchestration adapter on top. Keep the existing workbench UI and case database as the business shell while moving autonomous analysis onto the new core.

**Tech Stack:** Nuxt/Nitro, TypeScript, Node.js test runner, existing workbench database utils, existing case-analysis orchestrator and MCP-compatible services

---

### Task 1: Lock regression coverage for GA-core extraction

**Files:**
- Modify: `mediation-workbench/tests/workflow-regressions.test.ts`
- Create: `mediation-workbench/server/utils/ga-core/index.ts`
- Create: `mediation-workbench/server/utils/mediation-agent.ts`

- [ ] **Step 1: Write the failing test**

```typescript
test('ga core mediation tool catalog exposes MCP-oriented case analysis tools', async () => {
  const { buildMediationToolCatalog } = await import('../server/utils/mediation-agent')
  const tools = buildMediationToolCatalog()
  assert.equal(tools.some(tool => tool.function.name === 'query_case_materials'), true)
  assert.equal(tools.some(tool => tool.function.name === 'desensitize_case_materials'), true)
  assert.equal(tools.some(tool => tool.function.name === 'restore_analysis_result'), true)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/workflow-regressions.test.ts`
Expected: FAIL with module/function not found for `mediation-agent`

- [ ] **Step 3: Write minimal implementation**

```ts
export function buildMediationToolCatalog() {
  return [
    { type: 'function', function: { name: 'query_case_materials', description: '...', parameters: { type: 'object', properties: {} } } },
    { type: 'function', function: { name: 'desensitize_case_materials', description: '...', parameters: { type: 'object', properties: {} } } },
    { type: 'function', function: { name: 'restore_analysis_result', description: '...', parameters: { type: 'object', properties: {} } } },
  ]
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/workflow-regressions.test.ts`
Expected: PASS for the new catalog test

### Task 2: Extract GenericAgent core contracts into `ga-core`

**Files:**
- Create: `mediation-workbench/server/utils/ga-core/types.ts`
- Create: `mediation-workbench/server/utils/ga-core/loop.ts`
- Create: `mediation-workbench/server/utils/ga-core/schema.ts`
- Create: `mediation-workbench/server/utils/ga-core/index.ts`
- Modify: `mediation-workbench/server/utils/agent/loop.ts`
- Modify: `mediation-workbench/server/utils/agent/types.ts`

- [ ] **Step 1: Add failing import-compatibility test**

```typescript
test('ga core exports GenericAgent-style loop primitives', async () => {
  const core = await import('../server/utils/ga-core')
  assert.equal(typeof core.runGaAgentLoop, 'function')
  assert.equal(typeof core.normalizeGaToolCalls, 'function')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/workflow-regressions.test.ts`
Expected: FAIL because `ga-core` does not exist

- [ ] **Step 3: Implement `ga-core` and keep old agent API delegating to it**

```ts
export { runGaAgentLoop, normalizeGaToolCalls } from './loop'
export type { GaToolDefinition, GaToolCall, GaStepOutcome } from './types'
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/workflow-regressions.test.ts`
Expected: PASS for the new `ga-core` export test

### Task 3: Add mediation-specific GenericAgent tool dispatcher

**Files:**
- Create: `mediation-workbench/server/utils/mediation-agent.ts`
- Modify: `mediation-workbench/server/utils/case-analysis-orchestrator.ts`
- Modify: `mediation-workbench/server/utils/agent/tools.ts`

- [ ] **Step 1: Add failing workflow execution test**

```typescript
test('mediation agent runner executes GA loop with desensitize and restore tool chain', async () => {
  const { runMediationAgentTask } = await import('../server/utils/mediation-agent')
  const result = await runMediationAgentTask({ caseId: '2026-1', task: 'analyze', llmCall: fakeLlm })
  assert.equal(result.executedTools.includes('desensitize_case_materials'), true)
  assert.equal(result.executedTools.includes('restore_analysis_result'), true)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/workflow-regressions.test.ts`
Expected: FAIL because `runMediationAgentTask` is missing

- [ ] **Step 3: Implement the mediation dispatcher and MCP-facing tools**

```ts
export async function runMediationAgentTask(...) {
  return runGaAgentLoop({
    tools: buildMediationToolCatalog(),
    handlers: buildMediationToolHandlers(...),
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/workflow-regressions.test.ts`
Expected: PASS for the mediation execution test

### Task 4: Wire workbench entrypoints onto the new mediation core

**Files:**
- Modify: `mediation-workbench/server/api/chat/agent.post.ts`
- Modify: `mediation-workbench/server/utils/generate-dynamic-file.ts`
- Modify: `mediation-workbench/server/utils/analysis-core.ts`

- [ ] **Step 1: Add failing integration test for agent endpoint dependencies**

```typescript
test('agent endpoint can source its tools from mediation GA core', async () => {
  const { getAgentEnabledToolNames } = await import('../server/utils/agent/capabilities')
  assert.equal(getAgentEnabledToolNames().includes('update_working_checkpoint'), true)
})
```

- [ ] **Step 2: Run test to verify it still captures a missing mediation-core wire-up**

Run: `npm test -- tests/workflow-regressions.test.ts`
Expected: FAIL until the endpoint imports the new core adapters cleanly

- [ ] **Step 3: Delegate existing endpoints to the new core**

```ts
const mediationAgent = createMediationAgentRuntime(...)
return mediationAgent.stream(...)
```

- [ ] **Step 4: Run test and build verification**

Run: `npm test`
Expected: PASS

Run: `npm run build`
Expected: PASS
