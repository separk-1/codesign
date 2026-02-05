# Performance Analysis: ProcedurePanel Re-renders

## Issue
The `ProcedurePanel` component was identified as a candidate for performance optimization. Code analysis revealed that it subscribed to the entire `useSimulationStore` state using the default hook usage:

```typescript
const { activeStepId, setActiveStepId, stepHistory, goToPreviousStep } = useSimulationStore();
```

## Root Cause
The `useSimulationStore` contains rapidly changing state variables, specifically `time`, `tick_count`, and various physics parameters (`reactivity`, `pri_flow`, etc.), which are updated approximately every 100ms by the `tick()` function.

Because `ProcedurePanel` subscribed to the entire store, any change to *any* state variable triggered a re-render of the component. This means `ProcedurePanel` was re-rendering ~10 times per second, regardless of whether `activeStepId` or `stepHistory` (the only state it actually uses) had changed.

## Proposed Optimization
We will refactor the component to use Zustand selectors. This ensures the component only re-renders when the specific slices of state it depends on change.

```typescript
const activeStepId = useSimulationStore(state => state.activeStepId);
const stepHistory = useSimulationStore(state => state.stepHistory);
const setActiveStepId = useSimulationStore(state => state.setActiveStepId);
const goToPreviousStep = useSimulationStore(state => state.goToPreviousStep);
```

Since `activeStepId` and `stepHistory` change much less frequently (only on user interaction or specific rule triggers), this will drastically reduce the render count.

## Verification Constraints
The current environment lacks a `package.json` and `node_modules`, preventing the execution of automated benchmarks or unit tests (e.g., using `react-test-renderer` or `@testing-library/react` to count renders). Therefore, we rely on static analysis and the known behavior of React and Zustand to justify this optimization. The improvement is theoretically sound and standard practice for Zustand store consumption.
