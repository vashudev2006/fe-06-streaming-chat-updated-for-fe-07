# FE-10 Accessibility and Performance Audit

## Audit scope

- Lighthouse mobile audit for performance and accessibility
- Automated accessibility review
- Keyboard-only review of the primary chat flow

## Baseline results

| Category | Score |
| --- | ---: |
| Performance | 90 |
| Accessibility | 98 |

Lighthouse identified an invalid heading order in the chat section. The baseline report is available at `.audit/baseline/lighthouse.report.html`.

## Changes made

- Corrected the chat heading hierarchy by changing the secondary heading from `h1` to `h2`.
- Added a skip link and a named main-content target.
- Added clear `:focus-visible` styles for keyboard users.
- Added an ARIA live region to announce new chat transcript content.
- Deferred loading of the interactive chat to reduce initial page work while retaining a keyboard-accessible Open chat control.
- Removed negative heading letter spacing for improved readability.

## Final results

| Category | Score |
| --- | ---: |
| Performance | 90 |
| Accessibility | 100 |

The heading-order audit passes in the final report. Key final metrics include a 2.7-second Largest Contentful Paint and 300-millisecond Total Blocking Time.

The final report is available at `.audit/after/lighthouse-final.report.html`.

## Accessibility and keyboard review

- The page provides a keyboard-accessible skip link.
- Navigation links, the Open chat control, message input, Send button, and streaming controls expose visible keyboard focus.
- New transcript content is announced through a polite live region.
- Heading levels now follow a sequential order.

## Evidence

- Baseline Lighthouse report: `.audit/baseline/lighthouse.report.html`
- Baseline Lighthouse data: `.audit/baseline/lighthouse.report.json`
- Final Lighthouse report: `.audit/after/lighthouse-final.report.html`
- Final Lighthouse data: `.audit/after/lighthouse-final.report.json`
