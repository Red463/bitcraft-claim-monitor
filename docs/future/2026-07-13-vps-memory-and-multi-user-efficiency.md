# VPS Memory and Multi-User Efficiency

| Field | Value |
| --- | --- |
| Status | Planned |
| Timing | Deferred |
| Area | Performance and operations |
| Created | 13 July 2026 |
| Last reviewed | 13 July 2026 |
| Dependencies | Representative production measurements from the existing Server Health telemetry |
| VPS prerequisite | Already upgraded; no RAM upgrade work is required |

## Plain-language purpose

The web and worker Node.js processes have both held unusually large private memory areas. The VPS now has more RAM, which gives the application safe headroom, but extra RAM does not remove avoidable repeated work.

This plan reduces duplicated calculations, network responses, database writes, and monitoring payloads. It must not make the application feel slower or prevent several people from viewing different pages at the same time.

The guiding rule is: **share identical work, but do not place an artificial queue in front of normal web users.** If two users need the same current data, the server should calculate or download it once and let both users use the result. Requests for genuinely different data can still proceed independently.

## Proposed changes

### 1. Add lightweight performance telemetry

Record small, bounded aggregate measurements for important web endpoints, Craft Planner calculation stages, worker jobs, outbound BitJita requests, database writes, process memory, and event-loop delay.

This is similar to putting labelled gauges on a machine before adjusting it. It shows which operation allocated memory, how long it took, and whether later changes genuinely helped. It must record totals, timings, and sizes only—not request bodies, inventory contents, secrets, or other large payloads.

Why this should not reduce speed:

- Measurements are accumulated in small counters and timing buckets rather than logging every object.
- Telemetry is flushed in batches instead of writing to SQLite for every request.
- Retention is bounded so monitoring cannot become a new memory or disk problem.

### 2. Use one smaller shared Craft Planner workspace

Keep one compact, claim-scoped calculation workspace for a fresh set of planner inputs. Pages can project the response shape they need from that workspace instead of building and retaining several copies of the same large material, route, and recipe structures.

Preserve the current 20-second planner freshness window. Concurrent requests for the same claim and freshness generation share the same in-flight calculation. A manual refresh invalidates that generation and starts one new calculation; other requests arriving during it share the new work.

Release temporary maps, arrays, and source data as soon as calculation finishes. Do not retain a full diagnostic or expanded response merely because a compact page response is cached.

Why this should not reduce speed:

- The first request performs the same necessary calculation; duplicate requests stop repeating it.
- Later users receive the shared result faster because they wait for existing work rather than starting another copy.
- Different pages and different claims are not placed behind a global web-request limit.
- Manual refresh and the 20-second live-data expectation remain unchanged.

### 3. Share worker requests and write only when work is due

Add worker-wide sharing for identical BitJita requests. When multiple scheduled jobs need the same URL and parameters at the same time, one request supplies all of them.

Limit the worker—not the web server—to eight concurrent outbound BitJita requests. Jobs beyond that limit wait briefly in the worker queue. Keep independent job scheduling, failure handling, and retry behaviour.

Before serialising or writing data, check whether the job or snapshot is actually due and whether its meaningful content changed. Enforce the configured production snapshot interval of 60 seconds instead of writing a fresh snapshot on every 30-second polling pass.

Why this should not reduce speed:

- Normal page requests are not subject to the worker limit.
- Eight concurrent worker requests still allow useful parallelism while avoiding large bursts of responses in memory.
- Shared downloads make overlapping jobs finish with less network work.
- Skipping an unnecessary database write does not delay fresh data; the latest live result remains available in memory and the configured persistence interval is honoured.

### 4. Make routine Server Health responses smaller

The normal Server Health refresh should return the current summary and chart data needed by the visible dashboard. It should not rebuild or transmit the complete diagnostic bundle on every 15-, 30-, or 60-second refresh.

Generate the full diagnostic bundle only when the user explicitly copies or downloads it. Downsample ordinary chart responses to the display resolution while retaining the underlying monitoring history described below.

Why this should not reduce speed:

- The dashboard receives less JSON, so routine refreshes should parse and render faster.
- Full diagnostic detail remains available on demand.
- Removing invisible data from routine responses does not remove visible monitoring information.

### 5. Trial allocator memory trimming after the code fixes

After the application changes have been measured, test the production environment setting `MALLOC_TRIM_THRESHOLD_=131072` for Node.js. This asks the Linux memory allocator to return unused memory to the operating system more readily.

Treat this as a measured trial, not a guaranteed fix. Compare memory and response latency before and after it. Remove the setting if p95 response time becomes more than 5% slower or application reliability worsens.

Why this should not reduce speed:

- It is introduced only after duplicated application work has been removed.
- It is tested as its own reversible deployment stage.
- The latency gate prevents keeping lower memory usage at the expense of a noticeably slower application.

## Monitoring-history policy

Keep useful history without retaining every one-minute sample for a full year:

- Retain one-minute samples for the most recent 24 hours.
- Retain 15-minute summaries from day 2 through day 7.
- Retain hourly summaries from day 8 through the configured 365-day history period.
- Run compaction as small bounded background batches so it does not create a large pause.
- Do not run an automatic full SQLite `VACUUM`; any future database-space reclamation must be a deliberate maintenance action.

This changes historical resolution, not the freshness of current metrics. Recent incidents remain detailed while older trends remain useful and much smaller.

## Multi-user behaviour that must be preserved

- Multiple people can view different pages simultaneously.
- There is no global concurrency ceiling on ordinary web requests.
- Requests for different claims or genuinely different data can proceed independently.
- Identical same-claim Craft Planner requests share one fresh calculation.
- Manual refresh continues to request new live data.
- Planner data remains no more than 20 seconds old under the existing freshness contract.
- Worker back-pressure cannot block interactive web traffic.

## Risks and safeguards

| Risk | Safeguard |
| --- | --- |
| Shared planner data becomes stale | Key shared work by claim and freshness generation; preserve the 20-second expiry and explicit manual invalidation. |
| One failed shared calculation fails many callers | Clear the in-flight entry after success or failure and return bounded errors so the next request can retry. |
| Worker concurrency makes scheduled jobs late | Limit only outbound work, observe queue time, and retain eight-way parallelism. Adjust only from measured evidence. |
| Due-only writes lose historical detail | Keep current live state separate from persistence and enforce the configured 60-second snapshot cadence. |
| History compaction blocks SQLite | Process bounded batches and avoid automatic full-database vacuuming. |
| Smaller health responses hide diagnostics | Keep a separately requested full diagnostic bundle with the same redaction protections. |
| Memory trimming harms latency | Deploy it separately and remove it if p95 latency is more than 5% worse. |
| New telemetry becomes expensive | Store bounded aggregates, exclude large payloads, and monitor telemetry overhead itself. |

## Three-stage rollout

### Stage 1: Baseline telemetry

Deploy only the lightweight measurements. Capture at least one representative 24-hour period containing normal quiet and busy usage. Record web and worker RSS, event-loop delay, endpoint latency, planner timings and allocation sizes, BitJita request counts, SQLite write counts, Server Health response sizes, and errors.

### Stage 2: Application and data-flow improvements

Deploy the shared planner workspace, worker request sharing, worker concurrency limit, due-only persistence, monitoring-history compaction, and smaller Server Health responses. Measure the same signals for at least another representative 24-hour period.

Do not proceed as successful if errors or timeouts increase, planner freshness is broken, or p95 latency is more than 5% slower.

### Stage 3: Optional allocator trial

Only if process memory remains unnecessarily high after Stage 2, enable `MALLOC_TRIM_THRESHOLD_=131072` for a separate measured period. Keep it only when memory improves without breaching the latency or reliability gates.

Each stage must be independently reversible so the cause of any regression is clear.

## Success criteria

- Ordinary web and worker requests do not show an increased 5xx or timeout rate.
- p95 interactive response time is no more than 5% slower than the Stage 1 baseline.
- Craft Planner freshness remains 20 seconds and manual refresh remains functional.
- Concurrent same-claim planner requests produce one calculation for the same freshness generation.
- Multiple users can continue using different pages concurrently without a global web queue.
- Web-process RSS is at least 40% lower under comparable workload.
- Worker BitJita request volume is at least 40% lower under comparable scheduled workload.
- The normal Server Health response is at least 60% smaller while visible dashboard information remains complete.
- Snapshot persistence follows the configured 60-second interval rather than the 30-second polling interval.
- Monitoring history follows the 24-hour, seven-day, and 365-day resolution policy without long database pauses.
- Diagnostic and telemetry output remains bounded and contains no secrets or full application payloads.

## Dependencies

- Existing Server Health telemetry must provide enough production data to establish comparable before-and-after periods.
- Deployment access is required for the optional Node allocator environment setting.
- The VPS RAM upgrade has already been completed. Adding more RAM is not part of this plan.

## Decisions and notes

- Optimisation must target duplicated work rather than restricting users.
- Quantity and freshness correctness take priority over a lower memory number.
- The worker concurrency ceiling starts at eight; it is not applied to the interactive web process.
- The production snapshot interval is 60 seconds.
- The allocator change is optional and must never mask an application-level memory problem.
