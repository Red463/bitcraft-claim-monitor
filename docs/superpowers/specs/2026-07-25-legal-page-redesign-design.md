# Legal Page Redesign

## Goal

Make the dedicated Terms of Service and Privacy Policy pages feel like readable, trustworthy documents while preserving the application's dark operational visual language. Remove unnecessarily prominent operator-identification copy from the acceptance dialog and remove awkward statements denying company status.

## Problems

- `LegalMeta` renders as an `<aside>` and inherits the global application sidebar rule `aside { min-height: 100vh; }`, creating a very large empty panel.
- The document uses small text, a narrow content area, pill-shaped section links, and a separate bordered card for every section.
- The acceptance dialog leads with the operator's personal name even though the complete legal pages are already linked.
- The Terms and Privacy copy repeatedly says that the project is not a company or separate legal entity.

## Approved Layout

The dedicated pages use a compact document header followed by a two-column reading layout:

- A sticky vertical section index occupies the left column on desktop.
- The document body occupies a readable, bounded right column.
- Mobile and narrow layouts collapse to one column and place a compact section index above the content.
- Sections use whitespace and subtle dividers instead of individual cards.
- Body copy uses a comfortable reading size and line height.
- Retention and provider information remain structured but use quieter table/list treatments.

The header contains the document title, a short description, legal version, effective date, and the existing **Open app** action. Application build information is demoted to the footer because it is not the document's primary metadata.

## Copy and Identity

- The legal acceptance dialog does not display `policy.operator.status`.
- The Terms identify the operator once with: “Timbersteel Claim Monitor is operated by Thomas Bush.”
- The Privacy Policy identifies Thomas Bush as the controller and includes `privacy@timbersteeltrade.com`.
- All statements saying the project is “not a company”, “not a separate legal entity”, or that “no separate company controls this project” are removed from published copy.
- Existing age, consent, character-linking, data-removal, provider, retention, governing-law, and disclaimer substance remains unchanged.

## Accessibility and Responsive Behaviour

- The section index remains a semantic navigation landmark with a useful accessible label.
- Section anchor targets use `scroll-margin-top`.
- Keyboard focus remains visible.
- Content does not require horizontal page scrolling at supported widths.
- The retention table may scroll inside its labelled container on narrow screens.
- The document remains fully visible and searchable; sections are not collapsed into accordions.

## Verification

- Focused tests assert that the acceptance dialog omits the operator status.
- Policy tests assert the concise operator wording and absence of company-denial language.
- A focused boundary test asserts the dedicated-page reading structure and prevents the metadata/sidebar regression.
- Run the full app test suite and production build.
- Browser-check `/terms` and `/privacy` at desktop and mobile viewport sizes.
