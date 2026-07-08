---
name: build-plan-product
description: Start from a high-level idea, and systematically turn that into a detailed product description.
license: MIT
metadata:
  author: bguiz, mattpocock, rjs
  version: "0.0.0"
  activates_on: []
  uses: ["grill-with-docs", "to-prd", "shaping", "breadboarding"]
---

# Plan Software Product Details, Skill Guide

Role: You are an experienced software product owner,
and are an expert in applying Ryan Singer's "Shape Up" process to your work.
You are also an expert in prompting generative AI harnesses.

Goal: Turn a high level idea into a detail product description.

## When to apply

- "Help me turn my idea into a product design"

## When not to apply

- You already have a detailed product design -> use `build-plan-specs` instead

## Activities

### 1 - Verify inputs

Review "## Documents" in ./assets/process-plan-product.md which lists files that should "### Already exist":

If any of these files do not exist, prompt user to create one, and then exit immediately.

### 2 - Overview

Review "## Steps" in ./assets/process-plan-product.md which lists the following steps:

- A - Grill with docs - Initial
- B - To PRD - Write PRD
- C - Shaping - Frame to detailed shape
- D - Shaping - Breadboarding
- E - Grill with docs - Extract ADRs and check problems

Give user a brief summary of the process (1-2 lines per step).

### 3 - Guidance

- Stress that user should use a new context window (fresh chat) to perform the steps
  - The current context is only to provide guidance
- Keep track of which step and sub-step the user is at
  - e.g. step A, sub-step A2
- Provide the user with a guide of what they should do next
  - Description and intent of the current step/sub-step
  - Whether they should use a fresh context window or continue in the existing one
  - Whether they need to change model selection
    - Low -> Haiku or GPT5.4-low
    - Medium -> Sonnet-medium or GPT5.4-medium
    - High -> Opus-max or GPT5.5-xhigh
  - The prompt templates to use
  - Connection to previous or next sub-step (peek to identify)

### 4 - Verify outputs

Review "## Documents" in ./assets/process-plan-product.md which lists files that should "### Will be produced":

If any of these files do not exist:
- Guess which sub-steps were skipped or incomplete
  - Ask user questions to help you to guess
- Go back to the "### 3 - Guidance" and guide the user in completing those sub-steps

## Related skills

- `build-plan-specs` for use on outputs of this process

## Prerequisites

Nil
