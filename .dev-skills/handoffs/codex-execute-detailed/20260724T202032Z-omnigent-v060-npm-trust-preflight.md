# npm trusted-publisher preflight

- Package: `@consiliency/omnigent-transport`
- Intended version: `0.3.0`
- Required repository claim: `Consiliency/omniagent-plus`
- Required workflow: `.github/workflows/publish.yml`
- Registry state: `0.2.0` is currently published; `0.3.0` is unpublished and the dry run succeeds.
- Trust state: not confirmed for the transferred canonical repository.
- Prior operator evidence: attempts against the former `ViperJuice/omniagent-plus` claim returned npm conflict responses and do not prove the required canonical claim.
- Decision: code review may proceed, but actual npm publication remains blocked until a package owner confirms or replaces the trusted-publisher repository claim. No token or credential payload was recorded.
