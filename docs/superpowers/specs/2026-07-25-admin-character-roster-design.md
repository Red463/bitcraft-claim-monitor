# Admin Character Roster Design

## Problem

The Linked Accounts character selector renders only the members supplied to
`AdminPanel`. The dedicated `/bot` route supplies none, and a direct `/admin`
load does not fetch public claim data, so the selector can contain only its
placeholder even while the configured settlement has members.

## Design

`AdminPanel` will load the configured claim's member roster from the existing
BitJita proxy when the Linked Accounts tab is opened. A non-empty roster already
supplied by the main app remains the preferred source; the panel-owned request
is the fallback that makes direct `/admin` and `/bot` loads independent of
previous navigation.

Roster loading will expose explicit loading, empty, and failure copy in the
selector. The existing Linked Accounts refresh action will refresh both Discord
accounts and the roster. Assignment, approval, duplicate-link blocking, and
server authorization remain unchanged.

## Verification

- A focused loader test will cover wrapped and direct BitJita responses and
  readable HTTP failures.
- The existing admin character-assignment boundary test will confirm the panel
  owns fallback loading and passes roster state to the selector.
- The app build and full test suite will run before completion.
