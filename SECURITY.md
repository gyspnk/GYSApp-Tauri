# Security policy

Please do not report a suspected vulnerability in a public issue. Send a
minimal reproduction and affected commit to the maintainers through the private
security channel configured for the `gyspnk` organization.

The BFF treats all remote content as untrusted: schemas, origin allowlists,
structured errors, rate limits, CSP, URL sanitization, and immutable hash checks
are release requirements. Client secrets must remain in protected deployment
secrets and never in this repository.
