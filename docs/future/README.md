# Future Ideas and Plans

This directory is the holding area for useful work that has been discussed but is not scheduled for implementation yet. It keeps deferred ideas visible without mixing them with active implementation plans.

## Index

| Plan | Status | Timing | Area | Created | Summary |
| --- | --- | --- | --- | --- | --- |
| [VPS memory and multi-user efficiency](2026-07-13-vps-memory-and-multi-user-efficiency.md) | Planned | Deferred | Performance and operations | 13 July 2026 | Reduce application memory and repeated work while preserving responsiveness for concurrent users. |

## Statuses

- **Idea** — captured but not yet investigated.
- **Exploring** — requirements or technical options are still being investigated.
- **Planned** — the approach and success criteria are agreed, but implementation has not started.
- **Implementing** — active work is underway.
- **Implemented** — the work has been completed and verified.
- **Superseded** — replaced by another decision or no longer relevant.

## Adding future work

1. Copy [TEMPLATE.md](TEMPLATE.md) to a dated, descriptive filename such as `YYYY-MM-DD-short-title.md`.
2. Complete the metadata and every required section in the template.
3. Add the document to the index above.
4. Keep explanations understandable to someone who is not familiar with the affected code.

## Starting implementation

When deferred work is scheduled:

1. Review it against the current application and update any stale assumptions.
2. Move the implementation-ready plan into `docs/superpowers/plans/`.
3. Update this index so it links to the new location and shows **Implementing**.
4. After verification, mark it **Implemented**. Use **Superseded** instead if a different solution replaces it.

Deferred documents are planning records, not proof that a feature has been implemented.
