# VPS Server Health Design

The owner-only Server Health admin surface combines bounded in-process telemetry with a root-owned, read-only host collector. The collector runs once per minute, writes atomic sanitized snapshots under the application data directory, retains seven days of compact history, and never grants the Node service shell or journal privileges.

The API validates schema, ownership, age, and size before returning host metrics, services, processes, trends, incidents, and filtered logs. Application request, Craft Planner, BitJita, event-loop, and memory telemetry is recorded separately. Critical states require three consecutive samples before opening an incident and three healthy samples before recovery; opening and recovery events send one owner Discord DM.

The Admin page follows the existing dense operational visual system. It is read-only, hidden from non-owner roles, responsive at narrow widths, and labels missing or stale collector data without hiding available application telemetry.
