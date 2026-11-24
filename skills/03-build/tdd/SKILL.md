---
name: tdd
description: Test-driven development. Use when building features or fixing bugs test-first, or practicing red-green-refactor in small vertical slices.
---
<!-- Adapted from mattpocock/skills (MIT, Copyright 2026 Matt Pocock) -->

# Test-Driven Development

TDD is the **red -> minimal green -> refactor** loop, worked one vertical slice at a time.

## What a Good Test Is

- **Verify behavior through public seams**, never internal implementation details or private methods.
- A good test reads like a specification ("user can checkout with valid cart") and survives internal refactors.
- **No tautological assertions:** Expected values must come from an independent source of truth (worked example, literal, spec), never recomputed with the same logic as the code under test.
- **No horizontal slicing:** Do not write all tests upfront against imagined shapes. Write one test -> one minimal implementation -> repeat.

## Loop Rules

1. **Agree on seams first** for non-trivial modules: confirm the public interface/boundary to test at.
2. **Red before green:** Write one focused failing test and run it to observe the failure.
3. **Minimal green:** Write only enough code to make that test pass. Do not anticipate future tests or add speculative features.
4. **Refactor** only when green, keeping behavior covered.
5. Repeat slice by slice until all acceptance criteria are covered.
