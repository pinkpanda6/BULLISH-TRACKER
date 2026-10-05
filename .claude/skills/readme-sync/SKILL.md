---
name: readme-sync
description: Create or reconcile the root README so contributor setup and detailed project progress match the current, verified repository. Use after update-docs before git-flow, or when the README is missing or stale. Not for end-user help pages or release notes.
---

# Sync the README

The root `README.md` is the contributor's front door. Keep it useful at the moment a change ships;
an old capability list or setup command is worse than an absent one.

## Gate

Run after `verify` and `update-docs`, before `git-flow`. For a README-only baseline, inspect the
repository and project records first; do not claim an application behaviour has been verified merely
because it was described in a document.

## 1. Establish the current state

Read the existing root `README.md` if present, then gather the facts it must reflect:

- Root and workspace `package.json` files for commands, runtime requirements, and workspace names.
- Each `.env.example` for required configuration names. Never copy example values, `.env` files, or
  credentials into the README.
- `docs/conventions/10-architecture.md` for the workspace map and production shape.
- `docs/knowledge/STATE.md` for the full module board; it is the source of truth for project
  progress. Read `PRD.md` for the product purpose when it is filled in, and `OPEN-QUESTIONS.md` for
  unresolved contributor-relevant work.
- The diff being prepared for shipment. Recheck any README claim touched by the diff against its
  implementation or the verification result; do not infer current behaviour from commit history.

If the knowledgebase is still a template, describe the repository as a starter and link to the
conventions instead of inventing a product narrative or progress report.

## 2. Create or reconcile

Maintain only the **root** `README.md`; `docs/knowledge/README.md` belongs to the project
knowledgebase and is not a substitute.

When the root README is missing, create a contributor-facing document with these sections:

1. A concise description of the repository and its current purpose.
2. Prerequisites and local setup, including the required `.env.example` copies without secret values.
3. The supported root commands, copied from `package.json` and explained in one line each.
4. A short workspace map, with links to the architecture and deeper contributor documentation.
5. **Current project progress**: reproduce the module board from `STATE.md` with every phase column
   so shipped, work-in-progress, and planned work remain visible.
6. **Open project questions**: list every open question from `OPEN-QUESTIONS.md` with its identifier,
   a concise accurate summary, and what it affects. Link to the source record for its full detail.

When a README already exists, preserve useful project-specific prose and links. Correct or remove
anything that disagrees with the current sources, add a missing essential section, and keep the
result oriented to contributors. Do not turn it into a changelog, duplicate an ADR, or replace it
wholesale just to impose a template.

Only list a feature as available when the board records its relevant verification and shipment.
Describe fixes when they change contributor setup, expected behaviour, or the progress/open-questions
sections. Use links for detail rather than copying long implementation histories.

## 3. Check before shipping

- Re-read the README against every source used above: commands, Node/runtime requirement, workspace
  paths, configuration instructions, module phases, and open-question status all agree.
- Confirm setup instructions use only committed files and no secrets.
- Check Markdown links from the repository root and read the README diff for accidental loss of
  useful hand-written material.
- Report whether the README was created or updated and name any intentionally omitted information.

## Done when

- [ ] Root `README.md` exists and gives a contributor enough information to set up and orient in the repo
- [ ] Every stated command, prerequisite, workspace, and configuration instruction matches the repository
- [ ] The detailed module board matches `STATE.md`
- [ ] Every open question shown matches `OPEN-QUESTIONS.md`
- [ ] The README contains no credentials, unverified feature claims, or stale instructions

## Next

`git-flow`
